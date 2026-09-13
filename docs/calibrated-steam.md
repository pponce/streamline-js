# Auto Steam Calculator

Open **Settings > Extensions > Auto Steam Calculator** to enable the bundled
Decaid extension and configure it. The page is available even while the plugin
is disabled; enable it to open the calibration form. Save calibration in that
form; its save is immediate and independent of the outer settings Save/Cancel.

Enter Small, Medium and Large empty-jug weights, calibration milk-only weight,
seconds to your desired temperature, and the flow and heater target used. Auto
jug selection also uses usual milk per drink and whether your normal one-drink
jug is Small or Medium, matching Damian's DSx2. A starting jug selection is used
until Streamline has remembered a preset choice. Calibrate in manual steam mode.

With the plugin enabled, the steam mode label is **Auto | F | T**; blue indicates
the active mode. Tap that label or the Steam heading to cycle modes. In Auto, the
existing four-preset row offers **S / M / L / Auto**. These have the same row height
as the normal presets and a minimum design width of 72 px each. The compact mode
label uses the existing 114 px area and 20 px font, with the existing text-fit
helper for overflow. On a Bengle with a milk probe, M replaces T for the existing
Milk mode.

Place jug plus milk on the scale and tap the desired jug preset. S/M/L subtract
that jug's saved weight. Auto uses Damian's heuristic to infer the jug, then
subtracts its weight. The actual resulting milk mass determines time in all modes.
The choice remains highlighted and saved. Tap it again for the next jug: every
tap recalculates and applies, with a brief jug/milk/time confirmation. There is
no calculator pop-up or Use time button. Starting steam is a separate action.

Auto starts at **Off** and returns to Off after steaming, when resuming after a
reload, and after returning from settings/focus refresh. Off writes duration 0
and heater target 0, matching Streamline's existing Off behavior. It is a reminder,
not a hardware start lock; a physical start can still produce a short burst.
A successful calculation applies the calibration flow and heater target with the
duration. Plus/minus and direct number editors are inactive in Auto.

Switching to Flow or Time restores the previous manual steam settings, including
flow. Auto's values never overwrite manual preferences or profile values. Plugin
disable also restores manual settings; if the machine is running it waits until
idle. Flow and Time use their normal controls. Normal probe-aware operation is
restored when the extension is disabled.

Gross mode requires a zeroed empty scale without taring the jug. Choose tared mode
only when the scale reports milk alone; jug inference is then unavailable. Use
similar milk, starting temperature and technique to the calibration run. This is
a temperature estimate through time, not a temperature measurement.

## Developer notes

`auto-steam-session.js` owns Auto entry, preset actions, reset and restore, with a
persisted manual backup and jug choice. `calibrated-steam.js` owns sample buffering
and fresh calculation validation. `calibrated-steam-ui.js` connects these to the
existing API/scale socket and UI. `api.js` suppresses manual steam reconciliation
while the persisted Auto session owns the settings. `settings/categories/auto-steam.js`
is shared by the shell and legacy settings navigation paths.

Requires calculator API version 2 in Decaid's bundled plugin v0.2.0 or later.
Calculation/settings remain maintained in Decaid, with no separate extension repo.
Inspired by [Damian / Damian-AU's DSx2](https://github.com/Damian-AU/DSx2).

Run `node --test test/auto-steam*.test.mjs test/calibrated-steam*.test.mjs test/steam-mode.test.mjs test/settings-sync.test.mjs test/settings-route-split.test.mjs`.
Before release, verify Android WebView layout and touch behavior, settings routes,
repeat preset taps, reconnect/reload, Off after steaming, manual flow restoration,
failed writes and real-machine temperature accuracy. Off is intentionally not a
server-enforced interlock; API writes are not an atomic lock against physical starts.
