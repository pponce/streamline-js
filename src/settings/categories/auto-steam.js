import { API_BASE_URL, getPlugins, enablePlugin, disablePlugin, calibratedSteamRequest, getCalibrationHeaterTemperature } from '../../modules/api.js';
import { CALIBRATED_STEAM_PLUGIN } from '../../modules/calibrated-steam.js';
import { pluginSettingsUrl } from '../../modules/plugin-settings-navigation.js';
import { getTranslation } from '../../modules/i18n.js';

export function mountSettingsCategory({ container }) {
    let disposed = false;
    let loaded = false;
    const root = document.createElement('section');
    root.style.cssText = 'width:100%;font-size:24px;color:var(--text-primary)';
    const title = document.createElement('h2');
    title.textContent = getTranslation('Auto Steam Calculator');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.disabled = true;
    toggle.style.cssText = 'margin:20px 0;padding:16px 24px;border-radius:10px;background:var(--button-grey);font:inherit;min-height:64px';
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = getTranslation('Loading…');
    const open = document.createElement('a');
    open.textContent = getTranslation('Open settings');
    open.style.cssText = 'display:none;margin:20px 0;padding:16px 24px;border-radius:10px;background:#385a92;color:white;text-decoration:none;min-height:32px';
    const settingsUrl = heater => pluginSettingsUrl(API_BASE_URL, CALIBRATED_STEAM_PLUGIN, new URL('?page=settings', window.location.href).href, heater);
    open.onclick = async event => {
        event.preventDefault();
        try {
            const heater = await getCalibrationHeaterTemperature();
            if (!disposed) window.location.assign(settingsUrl(heater));
        } catch (error) { if (!disposed) message.textContent = error.message; }
    };
    root.append(title, toggle, message, open);
    container.replaceChildren(root);
    const current = () => !disposed && container.contains(root);
    async function paint() {
        if (!current()) return;
        toggle.textContent = getTranslation(loaded ? 'Disable Auto Steam Calculator' : 'Enable Auto Steam Calculator');
        toggle.setAttribute('aria-pressed', String(loaded));
        open.style.display = loaded ? 'inline-block' : 'none';
        if (loaded) open.href = settingsUrl();
        else open.removeAttribute('href');
        message.textContent = getTranslation(loaded ? 'Open settings to configure your pitchers and calibration.' : 'Enable the extension to set up your pitchers and calibration.');
        if (!loaded) return;
        try {
            const status = await calibratedSteamRequest('status');
            if (!current() || !loaded) return;
            message.textContent = getTranslation(status.ready
                ? 'Calibration is ready. Open settings to change your pitchers or calibration.'
                : 'Setup required. Auto steam stays Off until you configure a pitcher and calibration, then calculate a time.');
        } catch (error) { if (current()) message.textContent = error.message; }
    }
    getPlugins().then(async plugins => {
        if (!current()) return;
        const plugin = plugins?.find(item => item.id === CALIBRATED_STEAM_PLUGIN);
        if (!plugin) { message.textContent = getTranslation('Install a Decaid build containing Auto Steam Calculator.'); return; }
        loaded = plugin.loaded === true;
        toggle.disabled = false;
        await paint();
    }).catch(error => { if (current()) message.textContent = error.message; });
    toggle.onclick = async () => {
        toggle.disabled = true;
        try {
            await (loaded ? disablePlugin(CALIBRATED_STEAM_PLUGIN) : enablePlugin(CALIBRATED_STEAM_PLUGIN));
            if (!current()) return;
            loaded = !loaded;
            await paint();
        } catch (error) { if (current()) message.textContent = error.message; }
        finally { if (current()) toggle.disabled = false; }
    };
    return () => {
        disposed = true;
        toggle.onclick = null;
        open.onclick = null;
        root.remove();
    };
}
