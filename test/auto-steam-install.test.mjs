import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    comparePluginVersions,
    findAutoSteamPlugin,
    getAutoSteamUpdateInfo,
    installAutoSteamPlugin,
} from '../src/modules/auto-steam-install.js';

const installed = { id: 'calibrated-steam.reaplugin', loaded: false, version: '0.10.0' };

test('missing plugin and unreachable Decaid are distinct states', () => {
    assert.equal(findAutoSteamPlugin([]), null);
    assert.equal(findAutoSteamPlugin([installed]), installed);
    assert.throws(() => findAutoSteamPlugin(null), /Could not reach Decaid/);
});

test('install uses Decaid branch installer and re-reads state without enabling steam', async () => {
    const calls = [];
    const plugin = await installAutoSteamPlugin({
        installFromBranch: async (repo, branch) => { calls.push({ repo, branch }); return installed; },
        getPlugins: async () => { calls.push('read'); return [installed]; },
    });
    assert.deepEqual(calls, [{ repo: 'pponce/decentAutoSteamCalculator', branch: 'main' }, 'read']);
    assert.equal(plugin.loaded, false);
});

test('failed install and wrong plugin identity cannot be reported as success', async () => {
    await assert.rejects(installAutoSteamPlugin({ installFromBranch: async () => { throw new Error('Offline'); } }), /Offline/);
    await assert.rejects(installAutoSteamPlugin({ installFromBranch: async () => ({ id: 'other' }) }), /Unexpected plugin/);
    await assert.rejects(installAutoSteamPlugin({ installFromBranch: async () => installed, getPlugins: async () => [] }), /not available/);
    await assert.rejects(installAutoSteamPlugin({ installFromBranch: async () => installed, getPlugins: async () => null }), /Could not reach Decaid/);
});

test('version comparison handles normal and prerelease calculator versions', () => {
    assert.equal(comparePluginVersions('0.12.6', '0.12.7'), -1);
    assert.equal(comparePluginVersions('v1.0.0', '1.0.0'), 0);
    assert.equal(comparePluginVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1);
    assert.equal(comparePluginVersions('1.0.0', '1.0.0-rc.10'), 1);
    assert.throws(() => comparePluginVersions('development', '1.0.0'), /invalid version/);
});

test('update information reports only newer versions and added permissions', () => {
    const plugin = { ...installed, permissions: ['api'] };
    assert.deepEqual(getAutoSteamUpdateInfo(plugin, {
        id: 'calibrated-steam.reaplugin', version: '0.12.6', permissions: ['api', 'events.machine'],
    }), {
        available: true,
        version: '0.12.6',
        addedPermissions: ['events.machine'],
        approvalRequired: true,
        pending: false,
    });
    assert.equal(getAutoSteamUpdateInfo({ ...plugin, version: '0.12.6' }, {
        id: 'calibrated-steam.reaplugin', version: '0.12.6', permissions: ['api'],
    }).available, false);
    assert.throws(() => getAutoSteamUpdateInfo(plugin, { id: 'other', version: '1.0.0' }), /unexpected plugin ID/);
});

test('Decaid pending update takes precedence and requires explicit approval', () => {
    assert.deepEqual(getAutoSteamUpdateInfo({
        ...installed,
        pendingUpdate: { version: '0.13.0', addedPermissions: ['events.shots'] },
    }), {
        available: true,
        version: '0.13.0',
        addedPermissions: ['events.shots'],
        approvalRequired: true,
        pending: true,
    });
});

test('branch installation API uses the official endpoint and surfaces server errors', async () => {
    const source = readFileSync(new URL('../src/modules/api.js', import.meta.url), 'utf8');
    const match = source.match(/export async function installPluginFromBranch\([\s\S]*?\r?\n\}/);
    assert.ok(match);
    const calls = [];
    let fail = false;
    const install = new Function('API_BASE_URL', 'fetch', match[0].replace('export ', '') + '; return installPluginFromBranch;')(
        'http://tablet:8080/api/v1', async (url, options) => {
            calls.push({ url, options });
            return { ok: !fail, status: 409, statusText: 'Conflict', json: async () => fail ? { error: 'Cannot downgrade' } : installed };
        });
    await install('pponce/decentAutoSteamCalculator', 'main');
    assert.equal(calls[0].url, 'http://tablet:8080/api/v1/plugins/install/github-branch');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { repo: 'pponce/decentAutoSteamCalculator', branch: 'main' });
    fail = true;
    await assert.rejects(install('pponce/decentAutoSteamCalculator', 'main'), /Cannot downgrade/);
});

test('manifest check reads the canonical raw GitHub branch without API rate-limit calls', async () => {
    const source = readFileSync(new URL('../src/modules/api.js', import.meta.url), 'utf8');
    const match = source.match(/export async function getGitHubPluginManifest\([\s\S]*?\r?\n\}/);
    assert.ok(match);
    const calls = [];
    const getManifest = new Function('fetch', match[0].replace('export ', '') + '; return getGitHubPluginManifest;')(
        async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ id: 'calibrated-steam.reaplugin', version: '0.12.6' }) };
        });
    const manifest = await getManifest('pponce/decentAutoSteamCalculator', 'main');
    assert.equal(manifest.version, '0.12.6');
    assert.equal(calls[0].url, 'https://raw.githubusercontent.com/pponce/decentAutoSteamCalculator/main/manifest.json');
    assert.equal(calls[0].options.cache, 'no-store');
    await assert.rejects(getManifest('not-a-repo'), /Invalid GitHub plugin source/);
});
