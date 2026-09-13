import { API_BASE_URL, getPlugins, enablePlugin, disablePlugin } from '../../modules/api.js';
import { CALIBRATED_STEAM_PLUGIN } from '../../modules/calibrated-steam.js';
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
    const frame = document.createElement('iframe');
    frame.title = getTranslation('Auto Steam Calculator settings');
    frame.style.cssText = 'width:100%;height:75vh;min-height:550px;border:0';
    frame.hidden = true;
    root.append(title, toggle, message, frame);
    container.replaceChildren(root);
    const current = () => !disposed && container.contains(root);
    function paint() {
        if (!current()) return;
        toggle.textContent = getTranslation(loaded ? 'Disable Auto Steam Calculator' : 'Enable Auto Steam Calculator');
        toggle.setAttribute('aria-pressed', String(loaded));
        frame.hidden = !loaded;
        if (loaded) frame.src = `${API_BASE_URL}/plugins/${CALIBRATED_STEAM_PLUGIN}/ui`;
        else frame.removeAttribute('src');
        message.textContent = getTranslation(loaded ? 'Save calibration in the form below. Changes apply immediately.' : 'Enable the extension to set up your jugs and calibration.');
    }
    getPlugins().then(plugins => {
        if (!current()) return;
        const plugin = plugins?.find(item => item.id === CALIBRATED_STEAM_PLUGIN);
        if (!plugin) { message.textContent = getTranslation('Install a Decaid build containing Auto Steam Calculator.'); return; }
        loaded = plugin.loaded === true;
        toggle.disabled = false;
        paint();
    }).catch(error => { if (current()) message.textContent = error.message; });
    toggle.onclick = async () => {
        toggle.disabled = true;
        try {
            await (loaded ? disablePlugin(CALIBRATED_STEAM_PLUGIN) : enablePlugin(CALIBRATED_STEAM_PLUGIN));
            loaded = !loaded;
            document.dispatchEvent(new Event('streamline:auto-steam-settings'));
            paint();
        } catch (error) { if (current()) message.textContent = error.message; }
        finally { if (current()) toggle.disabled = false; }
    };
    return () => {
        disposed = true;
        toggle.onclick = null;
        frame.removeAttribute('src');
        root.remove();
        document.dispatchEvent(new Event('streamline:auto-steam-settings'));
    };
}
