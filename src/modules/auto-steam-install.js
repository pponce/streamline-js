import { CALIBRATED_STEAM_PLUGIN } from './calibrated-steam.js';

export const AUTO_STEAM_PLUGIN_REPO = 'pponce/decentAutoSteamCalculator';
export const AUTO_STEAM_PLUGIN_BRANCH = 'main';

function parseVersion(version) {
    const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) return null;
    return {
        core: match.slice(1, 4).map(Number),
        prerelease: match[4] ? match[4].split('.') : [],
    };
}

export function comparePluginVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b) throw new Error('The calculator returned an invalid version.');
    for (let index = 0; index < a.core.length; index += 1) {
        if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
    }
    if (!a.prerelease.length || !b.prerelease.length) {
        if (a.prerelease.length === b.prerelease.length) return 0;
        return a.prerelease.length ? -1 : 1;
    }
    const length = Math.max(a.prerelease.length, b.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = a.prerelease[index];
        const rightPart = b.prerelease[index];
        if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1;
        if (leftPart === rightPart) continue;
        const leftNumber = /^\d+$/.test(leftPart);
        const rightNumber = /^\d+$/.test(rightPart);
        if (leftNumber && rightNumber) return Number(leftPart) < Number(rightPart) ? -1 : 1;
        if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
        return leftPart < rightPart ? -1 : 1;
    }
    return 0;
}

export function getAutoSteamUpdateInfo(plugin, availableManifest) {
    if (!plugin) return { available: false, version: null, addedPermissions: [], approvalRequired: false, pending: false };
    if (plugin.pendingUpdate) {
        return {
            available: true,
            version: plugin.pendingUpdate.version || null,
            addedPermissions: [...(plugin.pendingUpdate.addedPermissions || [])],
            approvalRequired: true,
            pending: true,
        };
    }
    if (availableManifest?.id !== CALIBRATED_STEAM_PLUGIN) throw new Error('The calculator update manifest has an unexpected plugin ID.');
    const available = comparePluginVersions(plugin.version, availableManifest.version) < 0;
    const installedPermissions = new Set(plugin.permissions || []);
    const addedPermissions = available
        ? (availableManifest.permissions || []).filter(permission => !installedPermissions.has(permission))
        : [];
    return {
        available,
        version: availableManifest.version,
        addedPermissions,
        approvalRequired: addedPermissions.length > 0,
        pending: false,
    };
}

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
