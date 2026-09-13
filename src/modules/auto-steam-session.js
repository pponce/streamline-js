export const AUTO_STEAM_SESSION_KEY = 'streamline.autoSteamSession';
export const AUTO_STEAM_JUGS = ['small', 'medium', 'large', 'auto'];

export function readAutoSteamSession(value) {
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
}

export function createAutoSteamSession({ saved = {}, getContext, getStatus, getHeaterTemperature = async () => null, write, calculate, persist, onChange }) {
    saved ||= {};
    let active = saved.active === true;
    let manual = saved.manual ?? null;
    let jug = AUTO_STEAM_JUGS.includes(saved.jug) ? saved.jug : null;
    let busy = false;
    let ready = false;
    let used = false;
    let disabled = false;
    let state = null;
    let disposed = false;
    let applied = null;
    let availablePitchers = [];
    let configurationReady = false;
    const snapshot = () => ({ active, busy, ready, jug, manual, applied, disabled, availablePitchers: [...availablePitchers], configurationReady });
    function publish() {
        persist({ active, manual, jug });
        if (!disposed) onChange(snapshot());
    }
    function updateStatus(status) {
        availablePitchers = Array.isArray(status.availablePitchers) ? AUTO_STEAM_JUGS.filter(choice => status.availablePitchers.includes(choice)) : [];
        configurationReady = status.calibrationActive !== true && status.apiVersion === 3 && status.ready === true && availablePitchers.length > 0;
        if (!availablePitchers.includes(jug)) {
            jug = availablePitchers.includes(status.settings?.defaultJug) ? status.settings.defaultJug : (availablePitchers[0] ?? null);
        }
        publish();
    }
    async function context() {
        const value = await getContext();
        if (value.calibrationActive) throw new Error('Finish or cancel guided calibration in the extension settings first.');
        state = typeof value.machine?.state === 'object' ? value.machine.state.state : value.machine?.state;
        if (state !== 'idle') throw new Error('Wait until the machine is idle.');
        if (disposed) throw new Error('Auto steam session closed.');
        return value;
    }
    async function run(operation) {
        if (busy) throw new Error('Wait for the steam setting to finish.');
        busy = true;
        publish();
        try { return await operation(); }
        finally { busy = false; publish(); }
    }
    async function off() {
        const current = await context();
        const status = await getStatus();
        if (status.apiVersion !== 3) throw new Error('Update the Auto Steam Calculator extension.');
        updateStatus(status);
        if (status.calibrationActive) throw new Error('Finish or cancel guided calibration in the extension settings first.');
        const flow = status.settings?.referenceFlow;
        const steam = { duration: 0, targetTemperature: 0, stopAtTemperature: 0, flow: current.workflow.steamSettings.flow };
        if (Number.isFinite(flow) && flow >= 0.4 && flow <= 2.5) steam.flow = flow;
        ready = false;
        applied = null;
        await write(steam);
        used = false;
        publish();
        return status;
    }
    async function leave() {
        if (!active) return;
        return run(async () => {
            await context();
            if (!manual || !Number.isFinite(manual.duration) || !Number.isFinite(manual.flow) || !Number.isFinite(manual.targetTemperature)) {
                throw new Error('Manual steam settings are unavailable. Restore them in Settings.');
            }
            await write(manual);
            applied = { workflowPatch: { steamSettings: manual } };
            active = false;
            manual = null;
            ready = false;
            used = false;
        });
    }
    return {
        snapshot,
        updateStatus,
        async enter() {
            disabled = false;
            return run(async () => {
                const current = await context();
                if (!active) {
                    const steam = current.workflow?.steamSettings;
                    if (!steam || !Number.isFinite(steam.duration) || !Number.isFinite(steam.flow) || !Number.isFinite(steam.targetTemperature)) throw new Error('Steam settings are unavailable.');
                    manual = { duration: steam.duration, flow: steam.flow, targetTemperature: steam.targetTemperature, stopAtTemperature: steam.stopAtTemperature ?? 0 };
                    active = true;
                    publish();
                }
                await off();
            });
        },
        leave,
        async select(choice) {
            if (!active || disabled) throw new Error('Select Auto steam mode first.');
            if (!AUTO_STEAM_JUGS.includes(choice)) throw new Error('Choose Small, Medium, Large or Auto.');
            return run(async () => {
                await context();
                await off();
                if (!configurationReady) throw new Error('Complete Auto Steam Calculator calibration in Settings > Extensions.');
                if (!availablePitchers.includes(choice)) throw new Error('Choose a configured pitcher selection.');
                jug = choice;
                const targetTemperature = manual?.targetTemperature > 0 ? manual.targetTemperature : await getHeaterTemperature();
                if (!Number.isInteger(targetTemperature) || targetTemperature < 135 || targetTemperature > 165) {
                    throw new Error('Set the heater temperature in normal Steam settings, then calculate again.');
                }
                const result = await calculate(jug);
                await context();
                if (disabled) throw new Error('Auto Steam Calculator was disabled.');
                const steamSettings = { ...result.workflowPatch.steamSettings, targetTemperature };
                await write(steamSettings);
                applied = { ...result, workflowPatch: { steamSettings } };
                ready = true;
                return applied;
            });
        },
        async observeMachine(next) {
            state = next;
            if (active && state === 'steam') { used = true; ready = false; }
            if (!active || busy || state !== 'idle') return;
            if (disabled) return leave();
            if (used) return run(off);
        },
        async invalidate() {
            if (!active) return;
            used = true;
            ready = false;
            if (busy) return;
            const current = await getContext();
            state = typeof current.machine?.state === 'object' ? current.machine.state.state : current.machine?.state;
            if (state === 'idle') return run(off);
        },
        async disable() {
            disabled = true;
            if (!active || busy) return;
            const current = await getContext();
            state = typeof current.machine?.state === 'object' ? current.machine.state.state : current.machine?.state;
            if (state === 'idle') return leave();
            publish();
        },
        dispose() { disposed = true; },
    };
}
