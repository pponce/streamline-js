export const CALIBRATED_STEAM_PLUGIN = 'calibrated-steam.reaplugin';

export function isCalibratedSteamAvailable(plugins) {
    return Array.isArray(plugins) && plugins.some(plugin =>
        plugin.id === CALIBRATED_STEAM_PLUGIN && plugin.loaded === true &&
        Array.isArray(plugin.api) && plugin.api.some(endpoint => endpoint.id === 'calculate' && endpoint.type === 'http'));
}

export function createScaleSampleBuffer() {
    let samples = [];
    let lastTimestamp = null;
    function clear() { samples = []; lastTimestamp = null; }
    return {
        clear,
        push(frame, now = Date.now()) {
            if (!Number.isFinite(frame?.weight)) return;
            if (frame.timestamp != null && frame.timestamp === lastTimestamp) return;
            if (samples.length && now < samples[samples.length - 1].receivedAt) clear();
            if (samples.length && now - samples[samples.length - 1].receivedAt < 50) return;
            lastTimestamp = frame.timestamp ?? null;
            samples = samples.filter(sample => now - sample.receivedAt <= 1500);
            samples.push({ weightGrams: frame.weight, receivedAt: now });
            if (samples.length > 32) samples.shift();
        },
        read(now = Date.now()) {
            if (samples.length && now < samples[samples.length - 1].receivedAt) clear();
            samples = samples.filter(sample => now - sample.receivedAt <= 1500);
            return samples.map(sample => ({ weightGrams: sample.weightGrams, ageMs: now - sample.receivedAt }));
        },
    };
}

export function createCalibratedSteamController({ getContext, getSamples, calculate, apply, now = Date.now }) {
    let generation = 0;
    let applying = false;
    function check(token) {
        if (token !== generation) throw new Error('Calculation cancelled.');
    }
    async function capture(jug, token) {
        const startedAt = now();
        const { workflow, machine } = await getContext();
        check(token);
        const steam = workflow?.steamSettings;
        const sampledAt = now();
        const samples = getSamples();
        const result = await calculate({
            samples, jug,
            machineState: typeof machine?.state === 'object' ? machine.state.state : machine?.state,
            steamFlow: steam?.flow, steamTemperature: steam?.targetTemperature,
            stopAtTemperature: steam?.stopAtTemperature ?? 0,
        });
        check(token);
        const receivedAt = now();
        const newestAge = samples[samples.length - 1]?.ageMs;
        if (receivedAt < startedAt || receivedAt < sampledAt || receivedAt - startedAt > 2500 ||
            !Number.isFinite(newestAge) || newestAge + receivedAt - sampledAt > 1500) {
            throw new Error('Scale or machine observations expired. Calculate again.');
        }
        if (result?.apiVersion !== 2 || !Number.isFinite(result.workflowPatch?.steamSettings?.flow) ||
            !Number.isInteger(result.workflowPatch?.steamSettings?.targetTemperature) || !Number.isInteger(result?.durationSeconds) || result.durationSeconds < 1 || result.durationSeconds > 255 || !Number.isFinite(result.milkGrams)) {
            throw new Error('The plugin returned an invalid calculation.');
        }
        return { result, jug, token, createdAt: now(), workflowKey: JSON.stringify(workflow) };
    }
    return {
        cancel() { generation++; },
        preview(jug = 'auto') {
            if (applying) return Promise.reject(new Error('A steam time is already being applied.'));
            return capture(jug, ++generation);
        },
        async apply(preview) {
            if (applying) throw new Error('A steam time is already being applied.');
            check(preview.token);
            if (now() - preview.createdAt > 15000 || now() < preview.createdAt) throw new Error('Preview expired. Calculate again.');
            applying = true;
            try {
                const fresh = await capture(preview.jug, preview.token);
                const old = preview.result;
                const next = fresh.result;
                if (preview.workflowKey !== fresh.workflowKey || old.calibrationRevision !== next.calibrationRevision ||
                    old.jug !== next.jug || old.durationSeconds !== next.durationSeconds || Math.abs(old.milkGrams - next.milkGrams) > 2) {
                    throw new Error('The scale, jug or settings changed. Calculate again.');
                }
                check(preview.token);
                await apply(next);
                generation++;
                return next;
            } finally { applying = false; }
        },
    };
}
