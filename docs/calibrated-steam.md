# Auto Steam Calculator

Open **Settings > Extensions > Auto Steam Calculator** to enable the bundled
Decaid extension. Choose **Open settings** to open its standalone calibration
page. **Extensions > Plugins > Open** reaches the same form. Both entry points
supply a return address: **Return to settings** exits without saving; a successful
**Save calibration** returns to the calling settings category. Errors keep the
form open. No iframe is used.

Enter at least one Small, Medium or Large empty-pitcher weight, calibration
milk-only weight, seconds to your desired temperature, and the flow used. Leave unused sizes blank or 0.

The shared Decaid page now has **Tare empty scale** and **Set from scale** controls
for pitcher weights. Tare with nothing on the scale and wait for confirmed zero
before placing the pitcher. **Guided calibration** offers another tare button:
choose a configured pitcher, weigh pitcher plus cold milk, capture its milk-only
weight, then prepare and start steam. Stop at your desired temperature using the
page or machine control. Warm-up is excluded; the measured weight, time and flow
are filled in for review. Manual entry remains available.

Decaid restores the previous steam settings before exposing the measured result.
Return to settings cancels an active run and waits for restoration. Page closure
expires the session; interrupted runs cannot become calibrations. Both Streamline
Open settings links pass its remembered normal heater target when needed after
Auto Off. While guided calibration is active, Streamline defers its Auto writes
and resets. The extension uses machine-event permission in v0.5.0; an installed
plugin update may require approval for the additional permission.

**Offer Auto pitcher selection** is optional and initially off. Enabling it
reveals the required usual milk per drink and Small/Medium pitcher normally used
for one drink. Damian's existing heuristic requires all three pitcher weights
and gross scale weight; no Auto preset appears until those inputs are valid.
The starting selection contains only configured choices. Streamline remembers
subsequent preset taps and falls back to the configured starting choice if a
previously selected pitcher is removed.

With the plugin enabled, the steam mode label is **Auto | F | T**; blue indicates
the active mode. Tap that label or the Steam heading to cycle modes. In Auto, the
existing preset row offers only configured **S / M / L** choices, plus **Auto** when detection is enabled and configured. These have the same row height
as the normal presets and a minimum design width of 72 px each. The compact mode
label uses the existing 114 px area and 20 px font, with the existing text-fit
helper for overflow. On a Bengle with a milk probe, M replaces T for the existing
Milk mode.

Place pitcher plus milk on the scale and tap the desired pitcher preset. S/M/L subtract
that pitcher's saved weight. Auto uses Damian's heuristic to infer the pitcher, then
subtracts its weight. The actual resulting milk mass determines time in all modes.
The choice remains highlighted and saved. Tap it again for the next pitcher: every
tap recalculates and applies, with a brief pitcher/milk/time confirmation. There is
no calculator pop-up or Use time button. Starting steam is a separate action.

Auto starts at **Off** and returns to Off after steaming, when resuming after a
reload, and after returning from settings/focus refresh. Off writes duration 0
and heater target 0, matching Streamline's existing Off behavior. It is a reminder,
not a hardware start lock; a physical start can still produce a short burst.
A successful calculation applies the configured flow and calculated duration,
and restores the normal heater setting saved before Auto entry. If manual steam
was already Off, it uses Streamline’s existing remembered heater setting. No heater
calibration field or temperature compensation is used; keep the same normal heater
setting as the calibration run. There is no configurable maximum duration. Auto flow is configured in the extension settings: **0.4–2.5 ml/s**,
default **0.4 ml/s**. Measure calibration time at that flow; recalibrate after
changing it. Plus/minus and direct number editors are inactive in Auto.

Switching to Flow or Time restores the previous manual steam settings, including
flow. Auto's values never overwrite manual preferences or profile values. Plugin
disable also restores manual settings; if the machine is running it waits until
idle. Flow and Time use their normal controls. Normal probe-aware operation is
restored when the extension is disabled.

Gross mode requires a zeroed empty scale without taring the pitcher. Choose tared mode
only when the scale reports milk alone; pitcher inference is then unavailable. Use
similar milk, starting temperature and technique to the calibration run. This is
a temperature estimate through time, not a temperature measurement.

## Developer notes

`auto-steam-session.js` owns Auto entry, preset actions, reset and restore, with a
persisted manual backup and pitcher choice. `calibrated-steam.js` owns sample buffering
and fresh calculation validation. `calibrated-steam-ui.js` connects these to the
existing API/scale socket and UI. `api.js` suppresses manual steam reconciliation
while the persisted Auto session owns the settings. `settings/categories/auto-steam.js`
is shared by the shell and legacy settings navigation paths.

Requires calculator API version 3 in Decaid's bundled plugin v0.4.0;
`status.availablePitchers` still determines the configured presets. Empty setup keeps top-level Auto available and Off,
with a setup reminder instead of pitcher buttons. Incomplete calibration disables
calculation; manual Flow and Time continue to work. Settings and API keys retain
legacy `jug` names for compatibility; displayed text uses “pitcher.”
Calculation/settings remain maintained in Decaid, with no separate extension repo.
Inspired by [Damian / Damian-AU's DSx2](https://github.com/Damian-AU/DSx2).

Run `node --test test/auto-steam*.test.mjs test/calibrated-steam*.test.mjs test/steam-mode.test.mjs test/settings-sync.test.mjs test/settings-route-split.test.mjs`.
Before release, verify Android WebView layout and touch behavior, settings routes,
repeat preset taps, reconnect/reload, Off after steaming, manual flow restoration,
failed writes and real-machine temperature accuracy. Off is intentionally not a
server-enforced interlock; API writes are not an atomic lock against physical starts.
