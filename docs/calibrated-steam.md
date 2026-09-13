# Calibrated Steam Timer

Requires a Decaid build containing `calibrated-steam.reaplugin`, or that plugin
installed through Decaid's plugin settings. Enable and configure it there.
The plugin is maintained inside Decaid; Streamline contains only its UI client.

When the plugin is loaded, **Auto Calc** replaces the **Time | Flow** selector
under Steam. Click it, leave the filled jug on the scale, check the inferred jug,
and choose **Use time**. Select Small, Medium or Large to correct the inference.
The **Calibration settings** button opens the plugin's settings form.

Plus/minus adjust seconds in this mode. The flow number remains editable, and
the full steam settings remain available in Settings. Changing flow or heater
temperature from the calibrated values prevents a new calculation until the
values match or you recalibrate. Active milk-probe stopping must be disabled
explicitly in Settings. The calculation does not enable the heater or start steam.

Automatic jug inference requires gross jug-plus-milk weight. If you tare the jug,
select tared mode in the calibration settings; the displayed weight is then
treated as milk only and no jug can be inferred.

The preview expires after 15 seconds. Applying checks the current workflow,
machine state, scale readings and calibration again. Failed or changed results
require a new calculation. A failed write is reported instead of shown as success.
The calculated duration is remembered only after the workflow write succeeds;
failed writes do not queue it for later replay. A lost response can still leave
the machine's final setting uncertain, so check the displayed time before steaming.

Disabling the plugin restores Streamline's normal steam selector when returning
from Settings or refocusing the app. Refresh the page if a plugin was changed
from another device while this page stayed in the foreground.

Calculation and jug-selection behavior are provided by Decaid's extension and
inspired by [Damian / Damian-AU's DSx2](https://github.com/Damian-AU/DSx2). The
timer estimates the preferred milk temperature from time and weight; it does not
measure milk temperature. Use similar milk and starting temperature each time.

## Implementation

`calibrated-steam.js` contains DOM-free client coordination and the recent scale
sample buffer. `api.js` feeds that buffer from its existing scale WebSocket and
owns REST calls. `calibrated-steam-ui.js` owns the dialog and its cleanup.
Calculation lives entirely in the Decaid plugin, not in this skin.

Run the focused checks:

```sh
node --test test/calibrated-steam*.test.mjs test/steam-mode.test.mjs test/settings-sync.test.mjs
```

Before release, check light/dark mode,
touch and keyboard interaction, enable/disable, settings reload, disconnects,
gross/tared weighing, all three jugs and operation on a real machine.
