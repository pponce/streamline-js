import { API_BASE_URL, getPlugins, getWorkflow, getMachineState, getCalibratedSteamSamples, calibratedSteamRequest, setCalibratedSteamDuration } from './api.js';
import { CALIBRATED_STEAM_PLUGIN, createCalibratedSteamController, isCalibratedSteamAvailable } from './calibrated-steam.js';
import { getTranslation } from './i18n.js';
import { loadStyle } from './vendor-loader.js';

export function initCalibratedSteam({ onAvailability, onApplied, onApplying }) {
    let disposed = false;
    let refreshPromise = null;
    let dialog = null;
    let writing = false;
    const controller = createCalibratedSteamController({
        getContext: async () => {
            const [workflow, machine] = await Promise.all([getWorkflow(), getMachineState()]);
            return { workflow, machine };
        },
        getSamples: getCalibratedSteamSamples,
        calculate: body => calibratedSteamRequest('calculate', body),
        apply: setCalibratedSteamDuration,
    });

    async function refresh() {
        if (disposed) return;
        if (refreshPromise) return refreshPromise;
        refreshPromise = (async () => {
            const plugins = await getPlugins();
            if (disposed) return;
            const available = isCalibratedSteamAvailable(plugins);
            onAvailability(available);
            if (!available && !writing) { controller.cancel(); dialog?.close(); }
        })().finally(() => { refreshPromise = null; });
        return refreshPromise;
    }

    function onVisible() { if (document.visibilityState === 'visible') refresh(); }
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('streamline:mainpagevisible', refresh);
    window.addEventListener('focus', refresh);
    refresh();

    async function open() {
        if (disposed || dialog) return;
        const node = document.createElement('dialog');
        dialog = node;
        node.className = 'calibrated-steam-dialog';
        node.setAttribute('aria-labelledby', 'calibrated-steam-title');
        node.innerHTML = `<h2 id="calibrated-steam-title"></h2><div class="calibrated-steam-calculator">
            <p data-copy="instructions"></p><label><span data-copy="jug"></span><select aria-label="Jug size">
            <option value="auto">Auto</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
            <p class="calibrated-steam-result" role="status" aria-live="polite"></p>
            <div class="calibrated-steam-actions"><button type="button" data-action="calculate"></button><button type="button" data-action="apply" disabled></button></div>
            <p class="calibrated-steam-credit"></p></div>
            <iframe title="Calibrated steam settings" hidden></iframe>
            <div class="calibrated-steam-actions"><button type="button" data-action="settings"></button><button type="button" data-action="close"></button></div>`;
        const query = selector => node.querySelector(selector);
        const title = query('h2');
        const select = query('select');
        const result = query('.calibrated-steam-result');
        const calculateButton = query('[data-action="calculate"]');
        const applyButton = query('[data-action="apply"]');
        const settingsButton = query('[data-action="settings"]');
        const closeButton = query('[data-action="close"]');
        const frame = query('iframe');
        let preview = null;
        let settingsOpen = false;
        let pending = false;
        title.textContent = getTranslation('Calibrated Steam Timer');
        query('[data-copy="instructions"]').textContent = getTranslation('Leave the filled jug on the scale. Check the estimated jug before using the time.');
        query('[data-copy="jug"]').textContent = getTranslation('Jug');
        for (const option of select.options) option.textContent = getTranslation(option.textContent);
        query('.calibrated-steam-credit').textContent = getTranslation('Inspired by Damian / Damian-AU’s DSx2 calculator. Estimates temperature through time; no milk temperature measurement.');
        calculateButton.textContent = getTranslation('Calculate');
        applyButton.textContent = getTranslation('Use time');
        settingsButton.textContent = getTranslation('Calibration settings');
        closeButton.textContent = getTranslation('Close');
        const isCurrent = () => !disposed && dialog === node && node.isConnected;

        function setPending(value) {
            pending = value;
            select.disabled = value;
            calculateButton.disabled = value;
            settingsButton.disabled = value;
            applyButton.disabled = value || !preview;
        }

        async function previewTime() {
            if (pending || settingsOpen || !isCurrent()) return;
            preview = null;
            setPending(true);
            result.textContent = getTranslation('Calculating…');
            try {
                const next = await controller.preview(select.value);
                if (!isCurrent()) return;
                preview = next;
                const calculation = next.result;
                const jug = calculation.jugSource === 'tared' ? getTranslation('Tared: milk only') :
                    `${getTranslation(calculation.jugSource === 'heuristic' ? 'Estimated jug' : 'Selected jug')}: ${getTranslation(calculation.jug)}`;
                result.textContent = `${jug} · ${calculation.milkGrams} g · ${calculation.durationSeconds} s`;
                applyButton.textContent = `${getTranslation('Use time')}: ${calculation.durationSeconds} s`;
            } catch (error) {
                if (isCurrent()) result.textContent = error.message;
            } finally { if (isCurrent()) setPending(false); }
        }

        calculateButton.addEventListener('click', previewTime);
        select.addEventListener('change', previewTime);
        applyButton.addEventListener('click', async () => {
            if (!preview || pending || writing) return;
            writing = true;
            onApplying(true);
            setPending(true);
            closeButton.disabled = true;
            try {
                const applied = await controller.apply(preview);
                onApplied(applied.durationSeconds);
                if (isCurrent()) result.textContent = `${getTranslation('Steam time set')}: ${applied.durationSeconds} s`;
            } catch (error) {
                if (isCurrent()) result.textContent = error.message;
            } finally {
                preview = null;
                writing = false;
                onApplying(false);
                if (isCurrent()) { closeButton.disabled = false; setPending(false); }
            }
        });
        settingsButton.addEventListener('click', () => {
            settingsOpen = !settingsOpen;
            preview = null;
            controller.cancel();
            applyButton.disabled = true;
            query('.calibrated-steam-calculator').hidden = settingsOpen;
            frame.hidden = !settingsOpen;
            settingsButton.textContent = getTranslation(settingsOpen ? 'Return to calculator' : 'Calibration settings');
            if (settingsOpen) frame.src = `${API_BASE_URL}/plugins/${CALIBRATED_STEAM_PLUGIN}/ui`;
            else { frame.removeAttribute('src'); previewTime(); }
        });
        closeButton.addEventListener('click', () => node.close());
        node.addEventListener('cancel', event => { if (writing) event.preventDefault(); });
        node.addEventListener('close', () => {
            controller.cancel();
            frame.removeAttribute('src');
            node.remove();
            if (dialog === node) dialog = null;
            refresh();
        }, { once: true });
        try {
            await loadStyle(new URL('../css/calibrated-steam.css', import.meta.url).href);
            if (disposed || dialog !== node) return;
            document.body.append(node);
            node.showModal();
            previewTime();
        } catch (error) {
            if (dialog === node) dialog = null;
            node.remove();
            throw error;
        }
    }

    return {
        open, refresh,
        dispose() {
            disposed = true;
            controller.cancel();
            dialog?.close();
            dialog?.remove();
            dialog = null;
            document.removeEventListener('visibilitychange', onVisible);
            document.removeEventListener('streamline:mainpagevisible', refresh);
            window.removeEventListener('focus', refresh);
        },
    };
}
