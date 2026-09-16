import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { APP_VERSION, SKIN_ID } from '../src/version.js';

const manifestPath = fileURLToPath(new URL('../skin-manifest.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

test('test skin has a consistent identity distinct from official Streamline', () => {
    assert.equal(SKIN_ID, 'pponce.streamline-auto-steam');
    assert.equal(manifest.id, SKIN_ID);
});

test('baked APP_VERSION looks like a version string', () => {
    assert.match(APP_VERSION, /^\d+\.\d+\.\d+/);
});

test('manifest version looks like a version string', () => {
    assert.match(manifest.version, /^\d+\.\d+\.\d+/);
});
