import { getPlugins, getWorkflow, getMachineState, getCalibratedSteamSamples, calibratedSteamRequest, writeAutoSteamSettings, readSharedValue, STEAM_TEMP_LAST_VALUE_KEY } from './api.js';
import { createCalibratedSteamController, isCalibratedSteamAvailable } from './calibrated-steam.js';
import { AUTO_STEAM_SESSION_KEY, createAutoSteamSession, readAutoSteamSession } from './auto-steam-session.js';
import { settingsReady } from './settingsSync.js';

export function initCalibratedSteam({ onAvailability, onChange, onSteamSettings, onError }) {
    let disposed = false;
    let session = null;
    let refreshing = null;
    let machineState = null;
    const context = async () => {
        const [workflow, machine] = await Promise.all([getWorkflow(), getMachineState()]);
        return { workflow, machine };
    };
    const calculator = createCalibratedSteamController({
        getContext: context, getSamples: getCalibratedSteamSamples,
        calculate: body => calibratedSteamRequest('calculate', body), apply: async () => {},
    });
    const initialized = settingsReady.then(() => {
        if (disposed) return;
        session = createAutoSteamSession({
            saved: readAutoSteamSession(localStorage.getItem(AUTO_STEAM_SESSION_KEY)),
            getContext: context,
            getStatus: () => calibratedSteamRequest('status'),
            getHeaterTemperature: () => readSharedValue(STEAM_TEMP_LAST_VALUE_KEY),
            write: async steam => {
                await writeAutoSteamSettings(steam);
                if (!disposed) onSteamSettings(steam);
            },
            calculate: async jug => calculator.apply(await calculator.preview(jug)),
            persist: value => localStorage.setItem(AUTO_STEAM_SESSION_KEY, JSON.stringify(value)),
            onChange,
        });
    });
    let resumed = false;
    async function refresh() {
        if (disposed) return;
        if (refreshing) return refreshing;
        refreshing = (async () => {
            await initialized;
            const plugins = await getPlugins();
            if (disposed || !session) return;
            if (plugins === null) return;
            const available = isCalibratedSteamAvailable(plugins);
            onAvailability(available);
            if (!available) await session.disable();
            else if (!session.snapshot().active) {
                const status = await calibratedSteamRequest('status');
                if (!disposed) session.updateStatus(status);
                resumed = true;
            } else if (!resumed && session.snapshot().active) {
                await session.enter();
                resumed = true;
            } else {
                resumed = true;
                if (session.snapshot().active) await session.invalidate();
            }
        })().catch(error => { if (!disposed) onError(error); }).finally(() => { refreshing = null; });
        return refreshing;
    }
    function visible() { if (document.visibilityState === 'visible') refresh(); }
    document.addEventListener('visibilitychange', visible);
    document.addEventListener('streamline:mainpagevisible', refresh);
    document.addEventListener('streamline:auto-steam-settings', refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return {
        refresh,
        snapshot: () => session?.snapshot(),
        async enter() { await initialized; return session.enter(); },
        async leave() { await initialized; return session.leave(); },
        async select(jug) { await initialized; return session.select(jug); },
        observeMachine(state) {
            machineState = state;
            session?.observeMachine(machineState).catch(onError);
        },
        dispose() {
            disposed = true;
            calculator.cancel();
            session?.dispose();
            document.removeEventListener('visibilitychange', visible);
            document.removeEventListener('streamline:mainpagevisible', refresh);
            document.removeEventListener('streamline:auto-steam-settings', refresh);
            window.removeEventListener('focus', refresh);
        },
    };
}
