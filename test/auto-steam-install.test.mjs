import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findAutoSteamPlugin, installAutoSteamPlugin } from '../src/modules/auto-steam-install.js';

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
