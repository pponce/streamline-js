import { getPlugins, getWorkflow, getMachineState, getCalibratedSteamSamples, calibratedSteamRequest, writeAutoSteamSettings, readSharedValue, STEAM_TEMP_LAST_VALUE_KEY, subscribeMachineConnectionChanges } from './api.js';
import { createCalibratedSteamController, isCalibratedSteamAvailable } from './calibrated-steam.js';
import { AUTO_STEAM_SESSION_KEY, createAutoSteamSession, readAutoSteamSession } from './auto-steam-session.js';
import { createAutoSteamLifecycle } from './auto-steam-lifecycle.js';
import { settingsReady } from './settingsSync.js';

export function initCalibratedSteam({ onAvailability, onChange, onSteamSettings, onError }) {
    let disposed = false;
    let session = null;
    let lifecycle = null;
    let unsubscribe = () => {};
    let visible = new URL(window.location.href).searchParams.get('page');
    visible = !visible || visible === 'index';
    const context = async () => {
        const [workflow, machine] = await Promise.all([getWorkflow(), getMachineState()]);
        const status = await calibratedSteamRequest('status').catch(error => {
            if (error.status === 404 || error.status === 503) return null;
            throw error;
        });
        return { workflow, machine, pluginStatus: status, calibrationActive: status?.calibrationActive === true };
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
        lifecycle = createAutoSteamLifecycle({ session, getPlugins,
            getStatus: () => calibratedSteamRequest('status'), isAvailable: isCalibratedSteamAvailable,
            onAvailability, onChange, onError, initiallyVisible: visible,
        });
        unsubscribe = subscribeMachineConnectionChanges(() => lifecycle?.connectionChanged());
        return lifecycle.initialize();
    });
    const shown = () => { visible = true; lifecycle?.mainShown(); };
    const hidden = () => { visible = false; lifecycle?.mainHidden().catch(onError); };
    const changed = () => initialized.then(() => lifecycle?.settingsChanged()).catch(onError);
    document.addEventListener('streamline:mainpagevisible', shown);
    document.addEventListener('streamline:mainpagehidden', hidden);
    document.addEventListener('streamline:auto-steam-settings', changed);
    return {
        refresh: changed,
        snapshot: () => session?.snapshot(),
        async enter() { await initialized; return session.enter(); },
        async leave() { await initialized; return session.leave(); },
        async select(jug) { await initialized; return session.select(jug); },
        observeMachine(state) { lifecycle?.observeMachine(state).catch(onError); },
        dispose() {
            disposed = true;
            calculator.cancel(); session?.dispose(); lifecycle?.dispose(); unsubscribe();
            document.removeEventListener('streamline:mainpagevisible', shown);
            document.removeEventListener('streamline:mainpagehidden', hidden);
            document.removeEventListener('streamline:auto-steam-settings', changed);
        },
    };
}
