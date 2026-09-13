import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/modules/api.js', import.meta.url), 'utf8');
const match = source.match(/export async function writeAutoSteamSettings\(steam\) \{[\s\S]*?\n\}/);
assert.ok(match);
const build = update => new Function('updateWorkflow', `${match[0].replace('export ', '')}; return writeAutoSteamSettings;`)(update);

test('Auto writes flow, duration and heater together without changing manual persistence', async () => {
    const writes = [];
    const fn = build(async body => writes.push(body));
    await fn({ duration: 30, flow: 0.8, targetTemperature: 150, ignored: 'discard' });
    await fn({ duration: 0, flow: 0.8, targetTemperature: 0, stopAtTemperature: 0 });
    assert.deepEqual(writes, [
        { steamSettings: { duration: 30, flow: 0.8, targetTemperature: 150 } },
        { steamSettings: { duration: 0, flow: 0.8, targetTemperature: 0, stopAtTemperature: 0 } },
    ]);
    for (const duration of [-1, 256, 1.5, '30', null, NaN]) await assert.rejects(fn({ duration, flow: 0.8, targetTemperature: 150 }));
    assert.equal(writes.length, 2);
});

test('Auto write failure propagates without a saved value for later replay', async () => {
    await assert.rejects(build(async () => { throw new Error('offline'); })({ duration: 30, flow: 0.8, targetTemperature: 150 }), /offline/);
});

test('manual resync never overwrites active Auto, including when a delayed read finishes after entry', async () => {
    const fnSource = source.match(/export async function resyncIfDrifted\(key, fetchedValue, pushFn\) \{[\s\S]*?\n\}/)[0].replace('export ', '');
    let active = true;
    const fn = new Function('isAutoSteamActive', 'readSharedValue', 'STEAM_DURATION_LAST_VALUE_KEY', 'STEAM_FLOW_LAST_VALUE_KEY', 'MILK_STOP_LAST_VALUE_KEY',
        `${fnSource}; return resyncIfDrifted;`)(() => active, async () => 45, 'duration', 'flow', 'milk');
    for (const key of ['duration', 'flow', 'milk']) await fn(key, 0, async () => assert.fail('manual replay'));
    active = false;
    const writes = [];
    await fn('duration', 0, async value => writes.push(value));
    assert.deepEqual(writes, [45]);
    let finishRead;
    const delayed = new Function('isAutoSteamActive', 'readSharedValue', 'STEAM_DURATION_LAST_VALUE_KEY', 'STEAM_FLOW_LAST_VALUE_KEY', 'MILK_STOP_LAST_VALUE_KEY',
        `${fnSource}; return resyncIfDrifted;`)(() => active, () => new Promise(resolve => { finishRead = resolve; }), 'duration', 'flow', 'milk');
    const pending = delayed('duration', 0, async () => assert.fail('late manual replay'));
    active = true;
    finishRead(45);
    await pending;
});
