import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSteamSession } from '../src/modules/auto-steam-session.js';

function harness(saved = null, initialHeater = 150, rememberedHeater = null) {
    let machine = 'idle';
    let workflow = { steamSettings: { duration: 45, flow: 0.6, targetTemperature: initialHeater, stopAtTemperature: 0 } };
    let fail = false;
    let status = { apiVersion: 3, ready: true, availablePitchers: ['small', 'medium', 'large', 'auto'], settings: { referenceFlow: 0.8 } };
    const writes = [];
    let stored = saved;
    const session = createAutoSteamSession({
        saved,
        getContext: async () => ({ workflow: structuredClone(workflow), machine: { state: machine }, calibrationActive: status.calibrationActive }),
        getStatus: async () => status,
        getHeaterTemperature: async () => rememberedHeater,
        write: async steam => { writes.push(structuredClone(steam)); workflow.steamSettings = { ...workflow.steamSettings, ...steam }; },
        calculate: async jug => {
            if (fail) throw new Error('Unstable scale');
            return { jug, milkGrams: 180, durationSeconds: 30, workflowPatch: { steamSettings: { duration: 30, flow: 0.8 } } };
        },
        persist: value => { stored = structuredClone(value); },
        onChange: () => {},
    });
    return { session, writes, status: value => { status = value; }, stored: () => stored, machine: value => { machine = value; return session.observeMachine(value); }, fail: () => fail = true };
}

test('Auto enters Off at calibration flow, remembers manual settings and restores them on exit', async () => {
    const h = harness();
    await h.session.enter();
    assert.deepEqual(h.writes[0], { duration: 0, targetTemperature: 0, stopAtTemperature: 0, flow: 0.8 });
    assert.equal(h.stored().active, true);
    await h.session.leave();
    assert.deepEqual(h.writes.at(-1), { duration: 45, flow: 0.6, targetTemperature: 150, stopAtTemperature: 0 });
    assert.equal(h.stored().active, false);
});

test('each preset tap calculates even when already selected, and a failed calculation remains Off', async () => {
    const h = harness();
    await h.session.enter();
    await h.session.select('medium');
    await h.session.select('medium');
    assert.equal(h.writes.filter(w => w.duration === 30).length, 2);
    assert.equal(h.stored().jug, 'medium');
    h.fail();
    await assert.rejects(h.session.select('medium'), /Unstable/);
    assert.equal(h.writes.at(-1).duration, 0);
    assert.equal(h.session.snapshot().ready, false);
});

test('completed steam resets Off only after the machine becomes idle', async () => {
    const h = harness();
    await h.session.enter();
    await h.session.select('small');
    const before = h.writes.length;
    await h.machine('steam');
    await h.machine('flush');
    assert.equal(h.writes.length, before);
    await h.machine('idle');
    assert.equal(h.writes.at(-1).duration, 0);
    await h.machine('idle');
    assert.equal(h.writes.length, before + 1);
});

test('resuming Auto after reload retains the backup and resets the timer', async () => {
    const h = harness({ active: true, jug: 'large', manual: { duration: 60, flow: 0.5, targetTemperature: 145, stopAtTemperature: 0 } });
    await h.session.enter();
    assert.equal(h.session.snapshot().jug, 'large');
    assert.equal(h.writes.at(-1).duration, 0);
    await h.session.leave();
    assert.equal(h.writes.at(-1).duration, 60);
});

test('busy machines reject mode changes and calculations without writes', async () => {
    const h = harness();
    await h.machine('steam');
    await assert.rejects(h.session.enter(), /idle/);
    assert.deepEqual(h.writes, []);
});

test('disabling during steam defers restoration until idle', async () => {
    const h = harness();
    await h.session.enter();
    await h.session.select('small');
    await h.machine('steam');
    const before = h.writes.length;
    await h.session.disable();
    assert.equal(h.writes.length, before);
    await h.machine('idle');
    assert.equal(h.session.snapshot().active, false);
    assert.equal(h.writes.at(-1).flow, 0.6);
});

test('session serializes repeated taps while a setting write is pending', async () => {
    let release;
    const session = createAutoSteamSession({
        getContext: async () => ({ machine: { state: 'idle' }, workflow: { steamSettings: { duration: 45, flow: 0.6, targetTemperature: 150 } } }),
        getStatus: async () => ({ apiVersion: 3, ready: true, settings: { referenceFlow: 0.8 } }),
        write: () => new Promise(resolve => { release = resolve; }),
        calculate: async () => assert.fail('not yet entered'), persist: () => {}, onChange: () => {},
    });
    const entering = session.enter();
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(session.enter(), /Wait/);
    await assert.rejects(session.select('small'), /Wait/);
    release();
    await entering;
});

test('settings refresh resets an armed timer and preserves the selected jug', async () => {
    const h = harness();
    await h.session.enter();
    await h.session.select('large');
    await h.session.invalidate();
    assert.equal(h.writes.at(-1).duration, 0);
    assert.equal(h.stored().jug, 'large');
});


test('unconfigured Auto stays Off and exposes no pitcher presets', async () => {
    const h = harness();
    h.status({ apiVersion: 3, ready: false, settings: {}, availablePitchers: [] });
    await h.session.enter();
    assert.equal(h.writes.at(-1).duration, 0);
    assert.equal(h.session.snapshot().configurationReady, false);
    assert.deepEqual(h.session.snapshot().availablePitchers, []);
    await assert.rejects(h.session.select('small'), /calibration/);
    assert.equal(h.writes.at(-1).duration, 0);
    await h.session.leave();
    assert.equal(h.writes.at(-1).duration, 45);
});

test('removed saved pitcher falls back to configured default and cannot be calculated', async () => {
    const h = harness({ jug: 'auto' });
    h.status({ apiVersion: 3, ready: true, settings: { defaultJug: 'medium' }, availablePitchers: ['medium'] });
    await h.session.enter();
    assert.equal(h.session.snapshot().jug, 'medium');
    assert.deepEqual(h.session.snapshot().availablePitchers, ['medium']);
    await assert.rejects(h.session.select('auto'), /configured pitcher/);
    assert.equal(h.writes.at(-1).duration, 0);
    await h.session.select('medium');
    assert.equal(h.writes.at(-1).duration, 30);
});


test('calculation restores the normal heater without temperature compensation', async () => {
    for (const temperature of [135, 145, 160]) {
        const h = harness(null, temperature);
        await h.session.enter();
        assert.equal(h.writes.at(-1).targetTemperature, 0);
        await h.session.select('small');
        assert.equal(h.writes.at(-1).targetTemperature, temperature);
        assert.equal(h.writes.at(-1).duration, 30);
    }
});

test('entering from manual Off uses the normal remembered heater and preserves manual Off on exit', async () => {
    const h = harness(null, 0, 145);
    await h.session.enter();
    await h.session.select('small');
    assert.equal(h.writes.at(-1).targetTemperature, 145);
    await h.session.leave();
    assert.equal(h.writes.at(-1).targetTemperature, 0);
});

test('missing normal heater setting never invents one or arms the timer', async () => {
    const h = harness(null, 0);
    await h.session.enter();
    await assert.rejects(h.session.select('small'), /normal Steam settings/);
    assert.equal(h.writes.at(-1).duration, 0);
    assert.equal(h.writes.at(-1).targetTemperature, 0);
});


test('guided calibration blocks Auto entry, recalculation, reset and manual restoration', async () => {
    const h = harness();
    await h.session.enter();
    h.status({ apiVersion: 3, calibrationActive: true, ready: true, availablePitchers: ['small'] });
    const before = h.writes.length;
    for (const action of [() => h.session.enter(), () => h.session.select('small'), () => h.session.invalidate(), () => h.session.leave()]) {
        await assert.rejects(action(), /guided calibration/);
    }
    assert.equal(h.writes.length, before);
});
