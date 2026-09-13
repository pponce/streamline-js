import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/modules/api.js', import.meta.url), 'utf8');
const match = source.match(/export async function setCalibratedSteamDuration\(duration\) \{[\s\S]*?\n\}/);
assert.ok(match);

test('calibrated write persists the duration and never restores a different heater temperature', async () => {
    const writes = [];
    const persist = async (...args) => writes.push(['store', ...args]);
    const update = async body => { writes.push(['workflow', body]); return body; };
    const fn = new Function('persistSharedValue', 'updateWorkflow', 'STEAM_DURATION_LAST_VALUE_KEY',
        `${match[0].replace('export ', '')}; return setCalibratedSteamDuration;`)(persist, update, 'duration');
    await fn(30);
    assert.deepEqual(writes, [['workflow', { steamSettings: { duration: 30 } }], ['store', 'duration', 30]]);
    for (const invalid of [0, -1, 256, 1.5, '30', null, NaN]) await assert.rejects(fn(invalid));
    assert.equal(writes.length, 2);
});

test('calibrated write failure propagates to the calculator', async () => {
    const fn = new Function('persistSharedValue', 'updateWorkflow', 'STEAM_DURATION_LAST_VALUE_KEY',
        `${match[0].replace('export ', '')}; return setCalibratedSteamDuration;`)(async () => assert.fail('Failed calculations must not be queued in saved settings'), async () => { throw new Error('offline'); }, 'duration');
    await assert.rejects(fn(30), /offline/);
});
