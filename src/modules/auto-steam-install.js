import { CALIBRATED_STEAM_PLUGIN } from './calibrated-steam.js';

export const AUTO_STEAM_PLUGIN_REPO = 'pponce/decentAutoSteamCalculator';
export const AUTO_STEAM_PLUGIN_BRANCH = 'main';

export function findAutoSteamPlugin(plugins) {
    if (!Array.isArray(plugins)) throw new Error('Could not reach Decaid to check the calculator. Reopen this page to retry.');
    return plugins.find(plugin => plugin?.id === CALIBRATED_STEAM_PLUGIN) ?? null;
}

export async function installAutoSteamPlugin({ installFromBranch, getPlugins }) {
    const result = await installFromBranch(AUTO_STEAM_PLUGIN_REPO, AUTO_STEAM_PLUGIN_BRANCH);
    if (result?.id !== CALIBRATED_STEAM_PLUGIN) throw new Error('Unexpected plugin returned by the installer.');
    const plugin = findAutoSteamPlugin(await getPlugins());
    if (!plugin) throw new Error('The calculator is not available after installation. Reopen this page to check again.');
    return plugin;
}
