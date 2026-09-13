export const AUTO_STEAM_SESSION_KEY = 'streamline.autoSteamSession';
export const AUTO_STEAM_JUGS = ['small', 'medium', 'large', 'auto'];

export function readAutoSteamSession(value) {
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
}

export function createAutoSteamSession({ saved = {}, getContext, getStatus, write, calculate, persist, onChange }) {
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
    const snapshot = () => ({ active, busy, ready, jug: jug ?? 'auto', manual, applied, disabled });
    function publish() {
        persist({ active, manual, jug: jug ?? 'auto' });
        if (!disposed) onChange(snapshot());
    }
    async function context() {
        const value = await getContext();
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
        if (status.apiVersion !== 2) throw new Error('Update the Auto Steam Calculator extension.');
        const flow = status.settings?.referenceFlow;
        const steam = { duration: 0, targetTemperature: 0, stopAtTemperature: 0, flow: current.workflow.steamSettings.flow };
        if (Number.isFinite(flow) && flow >= 0.1 && flow <= 2.5) steam.flow = flow;
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
                const status = await off();
                if (jug === null) jug = AUTO_STEAM_JUGS.includes(status.settings?.defaultJug) ? status.settings.defaultJug : 'auto';
            });
        },
        leave,
        async select(choice) {
            if (!active || disabled) throw new Error('Select Auto steam mode first.');
            if (!AUTO_STEAM_JUGS.includes(choice)) throw new Error('Choose Small, Medium, Large or Auto.');
            return run(async () => {
                await context();
                jug = choice;
                const status = await off();
                if (!status.ready) throw new Error('Complete Auto Steam Calculator calibration in Settings > Extensions.');
                const result = await calculate(jug);
                await context();
                if (disabled) throw new Error('Auto Steam Calculator was disabled.');
                await write(result.workflowPatch.steamSettings);
                applied = result;
                ready = true;
                return result;
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
