# Auto Steam Calculator

The calculator is an independent [Decaid plugin](https://github.com/pponce/decentAutoSteamCalculator).
It works with the official Android Decaid v0.8.6 release or newer; no custom APK
is needed. Install this Streamline fork from `pponce/streamline-js` using
Decaid's skin installer. Select **Streamline.js — Auto Steam**. Its test-only ID,
`pponce.streamline-auto-steam`, keeps it separate from the official skin; restore
the upstream skin identity before submitting that manifest change upstream.

Open **Settings > Extensions > Auto Steam Calculator**. If absent, choose
**Install Auto Steam Calculator**, then **Enable Auto Steam Calculator**.
Installation uses Decaid's existing GitHub branch endpoint for
`pponce/decentAutoSteamCalculator`, branch `main`. It does not enable the plugin
or start steam automatically. An unreachable Decaid is reported as an error,
not mistaken for a missing installation. Choose **Open settings** to open its
standalone calibration page. **Extensions > Plugins > Open** reaches the same form. Both entry points
supply a return address: **Return to settings** exits without saving; a successful
**Save settings** returns to the calling settings category. Errors keep the
form open. No iframe is used.

The settings page has compact **General**, **Pitchers & Auto**, **Calibration**, **Instructions**, and **Glossary**
tabs. Each saved calibration records flow, milk target, milk weight and time.
With **Interpolate** off, **Milk target** filters the exact saved calibrations
available on the shot page; **All targets** makes every saved calibration available.
With **Interpolate** on, one milk target and at least three readings are required:
the exact minimum, exact maximum and at least one interior flow. Tare stays beside
the pitcher controls, capture buttons work
without field focus, and errors appear beside the action. The summary shows which
choices are configured using green S, M, L and Auto badges, with calibration
readiness and flow displayed separately. Invalid saves open the
relevant tab and field.

Enter at least one Small, Medium or Large empty-pitcher weight and create one
calibration with its milk-only weight, seconds, desired milk target and flow.
Leave unused sizes blank or 0. This one-reading setup is enough when
**Interpolate** is off.

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
and resets. The extension uses machine events to follow the guided calibration.

**Offer Auto pitcher selection** is optional and initially off. Enabling it
reveals the required usual milk per drink and Small/Medium pitcher normally used
for one drink. Damian's existing heuristic requires all three pitcher weights
and gross scale weight; no Auto preset appears until those inputs are valid.
The starting selection contains only configured choices. Streamline remembers
subsequent preset taps and falls back to the configured starting choice if a
previously selected pitcher is removed.

With the plugin enabled, the steam mode label is **Auto | F | T**; blue indicates
the active mode. Tap that label to cycle modes; the Steam heading remains inert. In Auto, the
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
Low milk errors use **Milk < 10 g · Medium pitcher**, including the inferred
pitcher when Auto is selected. These expected calculation refusals remain in Auto
at **0s**; only operational failures such as an unavailable or failing plugin
fall back visibly to manual Time.

With **Interpolate** off, the − / + controls cycle the filtered saved calibrations
and wrap at either end. The selected calibration's flow remains in the existing
flow position. Its saved milk target briefly replaces the timer value in a compact,
regular-weight form, then the timer returns to **0s**. The selected pitcher also
shows that compact target while the exact calibration remains selected. When only one calibration is available, the gray button
backgrounds remain but their − / + glyphs are hidden. The last calibration key is
remembered on that device and falls back to the plugin's default when no longer
available. With **Interpolate** on, − / + retain their existing 0.1 ml/s flow steps
within the measured range.

Auto starts at **0s** and returns to 0s after steaming, when resuming after a
reload, and when leaving an armed calculation on the main page. Navigation does
not wait for resets. Once Off is confirmed, repeated navigation performs no reset
reads or writes. Focus and settings-category mount/unmount do not trigger refresh.
Actual plugin changes and reconnection revalidate state; duplicate reset requests
share one operation. Genuine background failures are shown once on the main page,
with no contention popup for routine navigation. Off writes duration 0 and disables
milk-temperature stopping while leaving the normal heater target unchanged, so
the boiler stays ready between drinks. It is a reminder, not a hardware start
lock; a physical start can still produce a short burst.
A successful calculation applies the configured flow and calculated duration,
and restores the normal heater setting saved before Auto entry. If manual steam
was already Off, it uses Streamline’s existing remembered heater setting. No heater
calibration field or temperature compensation is used; keep the same normal heater
setting as the calibration run. There is no configurable maximum duration.
Direct number editors are inactive in Auto. Changing calibration or interpolated
flow resets time to 0s and requires a fresh pitcher tap. Manual Flow and Time keep
their normal − / + controls.

Switching to Flow or Time restores the previous manual steam settings, including
flow. Auto's values never overwrite manual preferences or profile values. Plugin
disable also restores manual settings; if the machine is running it waits until
idle. Flow and Time use their normal controls. Normal probe-aware operation is
restored when the extension is disabled.

Gross mode requires a zeroed empty scale without taring the pitcher. Choose tared mode
only when the scale reports milk alone; pitcher inference is then unavailable. Use
similar milk, starting temperature and technique to the calibration run. This is
a temperature estimate through time, not a temperature measurement.

## Calibration selection and interpolation

With **Interpolate** off, every active saved calibration is an exact selectable
choice. **Milk target** may filter the list to one temperature or use **All
targets**. Each exact choice uses its own measured seconds-per-gram ratio and
flow; there is no default checkbox.

With **Interpolate** on, select one milk target, minimum flow and maximum flow.
The group needs at least three saved readings: the exact minimum, exact maximum
and one interior flow. An individual reading can be saved while the set is still
incomplete, but the extension cannot be activated with that incomplete set.
At intermediate flows the plugin interpolates seconds per gram between adjacent
readings and never extrapolates beyond the measured range.

Each reading supports manual time entry or a guided run using fresh milk at
similar starting conditions. Guided Prepare applies that reading's flow before
enabling Start. Auto's selected calibration key or interpolated flow is stored
separately from manual steam preferences and survives navigation and reload on
that device.

## Developer notes

`auto-steam-flow.js` validates the status selection capability and owns
adjustment-control visibility and bounds. `auto-steam-session.js` owns Auto entry,
preset actions, exact-calibration cycling, interpolation changes, reset and
restore, with a persisted manual backup, pitcher choice and selection. One session is retained for the app
lifetime. `auto-steam-lifecycle.js` coordinates page visibility, actual settings
changes and connection changes; background errors are deferred while off-page.
`subscribeMachineConnectionChanges` uses existing device-stream subscriptions and
returns a cleanup callback. Revalidation waits for machine telemetry to resume. `calibrated-steam.js` owns sample buffering
and fresh calculation validation. `calibrated-steam-ui.js` connects these to the
existing API/scale socket and UI. `api.js` suppresses manual steam reconciliation
while the persisted Auto session owns the settings. `settings/categories/auto-steam.js`
is shared by the shell and legacy settings navigation paths.

Requires calculator API version 5. Exact-calibration requests include the opaque
`calibrationKey`; interpolation requests include `flow`. Both calculation passes
verify the returned key, target, pitcher and flow before applying the duration/flow
pair. `status.flowCalibration` determines whether the − / + controls cycle saved
calibrations or 0.1 ml/s interpolation steps; `status.availablePitchers` determines
the configured presets. Empty
setup keeps top-level Auto available and Off, with a setup reminder instead of
pitcher buttons. Incomplete calibration disables calculation; manual Flow and Time
continue to work. Settings, API fields and UI labels use pitcher terminology.
Calculations and settings are maintained in
[pponce/decentAutoSteamCalculator](https://github.com/pponce/decentAutoSteamCalculator).
The plugin ID and API contract are unchanged by separate installation. Decaid
preserves existing settings when replacing that ID within the same application
installation and tracks subsequent updates from the plugin's GitHub source.
See its [installation and developer guide](https://github.com/pponce/decentAutoSteamCalculator/blob/main/docs/CalibratedSteam.md).
Inspired by [Damian / Damian-AU's DSx2](https://github.com/Damian-AU/DSx2).

Run `node --test test/auto-steam*.test.mjs test/calibrated-steam*.test.mjs test/steam-mode.test.mjs test/settings-sync.test.mjs test/settings-route-split.test.mjs`.
Before release, verify Android WebView layout and touch behavior, settings routes,
repeat preset taps, reconnect/reload, Off after steaming, manual flow restoration,
failed writes and real-machine temperature accuracy. Off is intentionally not a
server-enforced interlock; API writes are not an atomic lock against physical starts.
