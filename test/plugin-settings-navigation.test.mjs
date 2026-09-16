import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginSettingsUrl } from '../src/modules/plugin-settings-navigation.js';

test('plugin settings link preserves the calling skin settings URL', () => {
    const target = 'http://localhost:43210/?page=settings';
    const link = new URL(pluginSettingsUrl('http://localhost:8080/api/v1', 'calibrated-steam.reaplugin', target));
    assert.equal(link.pathname, '/api/v1/plugins/calibrated-steam.reaplugin/ui');
    assert.equal(link.searchParams.get('returnTo'), target);
});

test('navigation helper supports other plugins and escapes their identifiers', () => {
    const link = new URL(pluginSettingsUrl('http://decaid:8080/api/v1', 'some plugin.reaplugin', 'http://decaid:3000/settings'));
    assert.equal(link.pathname, '/api/v1/plugins/some%20plugin.reaplugin/ui');
    assert.equal(link.searchParams.get('returnTo'), 'http://decaid:3000/settings');
});


test('guided calibration receives only a valid remembered normal heater target', () => {
    for (const [value, expected] of [[145, '145'], [0, null], [200, null], [null, null]]) {
        const url = new URL(pluginSettingsUrl('http://localhost:8080/api/v1', 'calibrated-steam.reaplugin', 'http://localhost:3000/?page=settings', value));
        assert.equal(url.searchParams.get('steamHeaterTemperature'), expected);
    }
});
