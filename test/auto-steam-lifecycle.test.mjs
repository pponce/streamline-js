import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSteamLifecycle } from '../src/modules/auto-steam-lifecycle.js';

function fixture() {
    let reads = 0, changed = false, fail = false;
    const resets = [], errors = [];
    const session = { snapshot: () => ({ active: true }), updateStatus: () => changed,
        invalidate: async options => { resets.push(options); if (fail) throw new Error('Machine write failed'); },
        disable: async () => {}, connectionLost() {}, observeMachine: async () => {} };
    const lifecycle = createAutoSteamLifecycle({ session, getPlugins: async () => { reads++; return []; }, getStatus: async () => ({}),
        isAvailable: () => true, onAvailability() {}, onChange() {}, onError: error => errors.push(error.message) });
    return { lifecycle, resets, errors, reads: () => reads, changed: () => { changed = true; }, fail: () => { fail = true; } };
}

test('returning to the main page repaints cached state without refreshing settings', async () => {
    const f = fixture(); await f.lifecycle.initialize();
    for (let i = 0; i < 10; i++) { await f.lifecycle.mainHidden(); f.lifecycle.mainShown(); }
    assert.equal(f.reads(), 1); assert.deepEqual(f.resets[0], { verify: true });
    assert.equal(f.errors.length, 0);
});

test('unchanged settings do not force reset and changed settings do', async () => {
    const f = fixture(); await f.lifecycle.initialize();
    await f.lifecycle.settingsChanged(); assert.equal(f.resets.length, 1);
    f.changed(); await f.lifecycle.settingsChanged(); assert.deepEqual(f.resets.at(-1), { verify: true });
    assert.equal(f.resets.length, 2);
});

test('actual background failures are deferred until the user returns', async () => {
    const f = fixture(); await f.lifecycle.initialize(); f.fail();
    await f.lifecycle.mainHidden(); assert.deepEqual(f.errors, []);
    f.lifecycle.mainShown(); assert.deepEqual(f.errors, ['Machine write failed']);
    f.lifecycle.mainShown(); assert.equal(f.errors.length, 1);
});

test('reconnect waits for telemetry then revalidates once', async () => {
    const f = fixture(); await f.lifecycle.initialize();
    f.lifecycle.connectionChanged(); assert.equal(f.reads(), 1);
    await f.lifecycle.observeMachine('idle'); await f.lifecycle.observeMachine('idle');
    assert.equal(f.reads(), 2); assert.equal(f.resets.length, 2);
});
