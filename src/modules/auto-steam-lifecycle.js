export function createAutoSteamLifecycle({ session, getPlugins, getStatus, isAvailable, onAvailability, onChange, onError, initiallyVisible = true }) {
    let visible = initiallyVisible, disposed = false, initialized = false;
    let refreshing = null, revision = 0, reconnectPending = false, deferredError = null;
    function report(error) {
        if (disposed) return;
        if (visible) onError(error);
        else deferredError = error;
    }
    function refresh() {
        if (disposed) return Promise.resolve();
        if (refreshing) return refreshing;
        refreshing = Promise.resolve().then(async () => {
            let observed;
            do {
                observed = revision;
                const plugins = await getPlugins();
                if (disposed || plugins === null) return;
                const available = isAvailable(plugins);
                onAvailability(available);
                if (!available) await session.disable();
                else {
                    const status = await getStatus();
                    if (disposed) return;
                    const changed = session.updateStatus(status);
                    if (session.snapshot().active && (changed || !initialized || reconnectPending)) {
                        await session.invalidate({ verify: true });
                    }
                }
                initialized = true; reconnectPending = false;
            } while (!disposed && observed !== revision);
        }).catch(report).finally(() => { refreshing = null; });
        return refreshing;
    }
    return {
        initialize: refresh,
        mainShown() {
            visible = true;
            onChange(session.snapshot());
            if (deferredError) { const error = deferredError; deferredError = null; onError(error); }
        },
        mainHidden() {
            visible = false;
            return session.invalidate().catch(report);
        },
        settingsChanged() { revision++; return refresh(); },
        connectionChanged() { reconnectPending = true; revision++; session.connectionLost(); },
        async observeMachine(state) {
            if (reconnectPending) await refresh();
            if (!disposed) await session.observeMachine(state).catch(report);
        },
        dispose() { disposed = true; deferredError = null; },
    };
}
