import {
    API_BASE_URL,
    approvePluginUpdate,
    calibratedSteamRequest,
    disablePlugin,
    enablePlugin,
    getCalibrationHeaterTemperature,
    getGitHubPluginManifest,
    getPlugins,
    installPluginFromBranch,
} from '../../modules/api.js';
import { CALIBRATED_STEAM_PLUGIN } from '../../modules/calibrated-steam.js';
import {
    AUTO_STEAM_PLUGIN_BRANCH,
    AUTO_STEAM_PLUGIN_REPO,
    findAutoSteamPlugin,
    getAutoSteamUpdateInfo,
    installAutoSteamPlugin,
} from '../../modules/auto-steam-install.js';
import { pluginSettingsUrl } from '../../modules/plugin-settings-navigation.js';
import { getTranslation } from '../../modules/i18n.js';

export function mountSettingsCategory({ container }) {
    let disposed = false;
    let loaded = false;
    let installed = false;
    let installing = false;
    let plugin = null;
    let checkingUpdate = false;
    let updating = false;
    let updateInfo = null;
    let updateError = '';
    let updateSuccess = '';
    let retryAction = null;
    const root = document.createElement('section');
    root.style.cssText = 'width:100%;font-size:24px;color:var(--text-primary)';
    const title = document.createElement('h2');
    title.textContent = getTranslation('Auto Steam Calculator');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.disabled = true;
    toggle.hidden = true;
    toggle.style.cssText = 'margin:20px 0;padding:16px 24px;border-radius:10px;background:var(--button-grey);font:inherit;min-height:64px';
    const install = document.createElement('button');
    install.type = 'button';
    install.textContent = getTranslation('Install Auto Steam Calculator');
    install.style.cssText = toggle.style.cssText;
    install.hidden = true;
    const source = document.createElement('a');
    source.href = 'https://github.com/' + AUTO_STEAM_PLUGIN_REPO;
    source.textContent = AUTO_STEAM_PLUGIN_REPO;
    source.style.cssText = 'display:block;margin:12px 0;color:var(--text-primary);text-decoration:underline;overflow-wrap:anywhere';
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = getTranslation('Loading…');
    const versionPanel = document.createElement('div');
    versionPanel.style.cssText = 'display:none;margin:8px 0 16px;padding:14px 16px;border:1px solid var(--profile-button-outline-color);border-radius:12px;align-items:center;gap:12px;flex-wrap:wrap';
    const versionText = document.createElement('span');
    versionText.style.cssText = 'font-weight:700;white-space:nowrap';
    const updateStatus = document.createElement('span');
    updateStatus.setAttribute('role', 'status');
    updateStatus.style.cssText = 'flex:1;min-width:180px;color:var(--text-secondary);font-size:20px';
    const update = document.createElement('button');
    update.type = 'button';
    update.hidden = true;
    update.style.cssText = 'min-height:52px;padding:10px 22px;border:0;border-radius:28px;background:#385a92;color:white;font:inherit;font-size:20px;font-weight:700';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.hidden = true;
    retry.textContent = getTranslation('Retry');
    retry.style.cssText = 'min-height:52px;padding:10px 22px;border:2px solid #385a92;border-radius:28px;background:transparent;color:#385a92;font:inherit;font-size:20px;font-weight:700';
    versionPanel.append(versionText, updateStatus, update, retry);
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
    root.append(title, install, toggle, message, versionPanel, open, source);
    container.replaceChildren(root);
    const current = () => !disposed && container.contains(root);
    const setPlugin = value => {
        plugin = value;
        installed = !!value;
        loaded = value?.loaded === true;
    };
    const updateFailureMessage = error => String(error?.message || error || getTranslation('Unknown error'));
    function paintUpdate() {
        if (!current()) return;
        versionPanel.style.display = installed ? 'flex' : 'none';
        if (!installed) return;
        versionText.textContent = `${getTranslation('Installed version')}: v${plugin?.version || '?'}`;
        update.hidden = true;
        retry.hidden = true;
        update.disabled = checkingUpdate || updating;
        retry.disabled = checkingUpdate || updating;
        if (checkingUpdate) {
            updateStatus.textContent = getTranslation('Checking for updates…');
            return;
        }
        if (updating) {
            updateStatus.textContent = updateInfo?.approvalRequired
                ? getTranslation('Approving and updating…')
                : getTranslation('Updating…');
            return;
        }
        if (updateError) {
            updateStatus.textContent = updateError;
            retry.hidden = false;
            return;
        }
        if (updateInfo?.available) {
            const permissions = updateInfo.addedPermissions.length
                ? ` ${getTranslation('New permissions')}: ${updateInfo.addedPermissions.join(', ')}.`
                : '';
            updateStatus.textContent = `${getTranslation('Update available')}: v${updateInfo.version || '?'}.${permissions}`;
            update.textContent = getTranslation(updateInfo.approvalRequired ? 'Approve & Update' : 'Update');
            update.hidden = false;
            return;
        }
        updateStatus.textContent = updateSuccess
            ? `${updateSuccess} ${getTranslation('Up to date.')}`
            : getTranslation('Up to date.');
    }
    async function refreshPlugin() {
        const next = findAutoSteamPlugin(await getPlugins());
        if (!current()) return null;
        setPlugin(next);
        toggle.disabled = !installed;
        return next;
    }
    async function checkForUpdate() {
        if (!installed || checkingUpdate || updating || !current()) return;
        checkingUpdate = true;
        updateError = '';
        retryAction = null;
        paintUpdate();
        try {
            if (!plugin?.pendingUpdate) {
                const manifest = await getGitHubPluginManifest(AUTO_STEAM_PLUGIN_REPO, AUTO_STEAM_PLUGIN_BRANCH);
                if (!current()) return;
                updateInfo = getAutoSteamUpdateInfo(plugin, manifest);
            } else {
                updateInfo = getAutoSteamUpdateInfo(plugin);
            }
        } catch (error) {
            if (!current()) return;
            updateInfo = null;
            updateError = `${getTranslation('Unable to check for updates.')} ${updateFailureMessage(error)}`;
            retryAction = checkForUpdate;
        } finally {
            checkingUpdate = false;
            paintUpdate();
        }
    }
    async function paint() {
        if (!current()) return;
        toggle.hidden = !installed;
        install.hidden = installed;
        if (!installed) {
            open.style.display = 'none';
            open.removeAttribute('href');
            message.textContent = getTranslation('Install the calculator plugin from GitHub. No custom Decaid app build is needed. Enable it after installation.');
            return;
        }
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
    refreshPlugin().then(async () => {
        await paint();
        await checkForUpdate();
    }).catch(error => { if (current()) message.textContent = error.message; });
    install.onclick = async () => {
        if (installing || installed || !current()) return;
        installing = true;
        install.disabled = true;
        message.textContent = getTranslation('Installing calculator…');
        try {
            const installedPlugin = await installAutoSteamPlugin({ installFromBranch: installPluginFromBranch, getPlugins });
            if (!current()) return;
            setPlugin(installedPlugin);
            toggle.disabled = false;
            await paint();
            await checkForUpdate();
        } catch (error) { if (current()) message.textContent = error.message; }
        finally { installing = false; if (current()) install.disabled = false; }
    };
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
    async function performUpdate() {
        if (!updateInfo?.available || updating || checkingUpdate || !current()) return;
        updating = true;
        updateError = '';
        retryAction = null;
        paintUpdate();
        try {
            const result = updateInfo.pending
                ? await approvePluginUpdate(CALIBRATED_STEAM_PLUGIN)
                : await installPluginFromBranch(AUTO_STEAM_PLUGIN_REPO, AUTO_STEAM_PLUGIN_BRANCH);
            if (result?.id && result.id !== CALIBRATED_STEAM_PLUGIN) throw new Error('Unexpected plugin returned by the updater.');
            if (!current()) return;
            const before = plugin?.version;
            await refreshPlugin();
            if (!plugin) throw new Error('The calculator is not available after the update.');
            updateSuccess = `${getTranslation('Updated')} v${before || '?'} → v${plugin.version || result?.version || '?'}.`;
            updateInfo = null;
            await paint();
        } catch (error) {
            if (!current()) return;
            updateError = `${getTranslation('Update failed.')} ${updateFailureMessage(error)}`;
            retryAction = performUpdate;
        } finally {
            updating = false;
            paintUpdate();
        }
        if (!updateError) await checkForUpdate();
    }
    update.onclick = performUpdate;
    retry.onclick = () => retryAction?.();
    return () => {
        disposed = true;
        toggle.onclick = null;
        install.onclick = null;
        open.onclick = null;
        update.onclick = null;
        retry.onclick = null;
        root.remove();
    };
}
