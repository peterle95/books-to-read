# API 35 native control reference — bounded capture, 2026-11-06

## Scope and provenance WARNING

Seven accepted captures are enumerated in `geometry.json`, with raw PNG, matching accessibility XML and `-crop360x732-dpr3.png`. Other PNG names are rejected timing/debug attempts, NOT references. In particular `saved-override-month` and `saved-deadline-override-month` show the Books screen, not a calendar. First attempts captured one rendered frame behind XML; accepted recaptures dump XML before screencap and wait two seconds.

No repository/native source edits, downloads, dependencies, APK installs, resets, clock changes, unknown process kills, or live reader data access. The preserved isolated `parity` AVD was restarted headlessly on its original port 5580 from the existing offline system image. Unrelated offline emulator-5554 was untouched. A System UI not responding prompt was dismissed with Wait. Same app/fixture directory as earlier captures.

**Constraint breach on disposable device:** during initial date-picker discovery I mistakenly pressed `Set start date` and `Set deadline`, which are commit buttons, not picker launch buttons. They re-applied the existing blank start override and existing `2026-12-01` deadline. The app executed `afterStateChange` and rewrote its synthetic device bundle. Thus this is NOT an unchanged-byte same-fixture capture run. Original host populated-bundle and previous captures remain untouched; no attempt to reset or restore device data was made. All subsequent calendars were opened by tapping date fields and canceled. Do not use this run for data parity approval.

Installed base APK SHA256 verified directly on device: `88c6e7e6e4e0239153f96cff089c5ba8991fb9d95dc0ea727364a60934404913`, identical to prior capture APK. All 48 frozen `app/src/main` file hashes still match current repository native source (`geometry.json`). No claim that mutable web source is unchanged.

Device API 35, Android 15, existing fingerprint `google/sdk_gtablet_x86_64/emu64xa:15/AE3A.240806.046.T1/13135149:userdebug/dev-keys`; Europe/Berlin, observed local date 2026-11-06, captures about 17:37–17:44 +0100. Physical 1080×2340, density 480, font scale 1.0. Raw bounds below are device physical pixels, right/bottom exclusive. Crop `[0,72,1080,2268]` gives **1080×2196 pixels = 360×732 CSS px at DPR3**. This is the requested comparison crop, not a newly asserted inset measurement; system UI showed an extra transient top gesture indicator after returning from dialogs. Preserve raw images when comparing chrome.

Post-mistake device hashes: books `b24edd02e1a4d43852446314e8485bbedb1a4f62df516948de26ee2cdd4cbe57`; manifest `b21d8e65e38d7d38b9aa5d82c5fc1bf013fd799f7bb6c0b87777f74127a4cbf8`; sessions `0bf05194020122b6f2b6058991b0be78924e289750b09a794f797fbe77b3a415`; plan `2c8e9ed3838cf03cb1c6dd2dd473e0ec96d8385c2df365c35a5f9a987bc08b1e`.

## Exact source / platform theme

Paths relative to the frozen `../android-run-20261106-1140/build-source/app/src/main/`, verified matching current native source:

- `res/values/styles.xml:2-8`: platform `@android:style/Theme.Material.Light.NoActionBar`, sans font, accent `#B56B3C`, navigation/status colors `#F1E4D4`, light system bar flags. These are Android framework widgets, not Material Components/AppCompat dialogs.
- `java/com/petermolnar/readingplan/ReadingPlanPlanView.java:103-107`: `new DatePickerDialog(activity, listener, LocalDate.now().getYear(), LocalDate.now().getMonthValue()-1, LocalDate.now().getDayOfMonth())`; `picker.show()`. Rest fields do not parse existing field text for initial month.
- `ReadingPlanBooksView.java:63-71,251-255`: same unthemed `new DatePickerDialog(activity, listener, initial.getYear(), initial.getMonthValue()-1, initial.getDayOfMonth())`; saved override when nonnull, otherwise today. Tap the **field**, not the `Set…` commit button.
- `ReadingPlanUi.java:224-267`: `new Spinner(activity)` (mode not explicitly passed); ArrayAdapter with `android.R.layout.simple_spinner_item` and `android.R.layout.simple_spinner_dropdown_item`. Drop-down rows set background `MainActivity.CREAM = #FFF8F0`, text `ESPRESSO = #3A241A`, 15sp, 12dp horizontal / 8dp vertical padding. Spinner minimum height 48dp, 8dp horizontal outer padding, rounded cream/border anchor background. Runtime here is a dropdown popup, not a selection dialog.

## Observed calendar geometry

`rest-date-month`: November 2026, Friday Nov 6 selected. `rest-date-year`: same date, year list. `saved-deadline-calendar`: December 2026, Tuesday Dec 1 selected, from persisted book deadline field. White calendar body, accent header and selected-day disk `#B56B3C`; framework black text approximately `#212121`; no custom cream calendar surface.

- Calendar surface horizontal extent x108..972 (288dp); header begins about y430, white body begins exactly y709. Bottom surface about y1909; antialiased rounded boundary means corner pixels differ. This is a raster surface extent, not an inferred layout API rectangle.
- Month day accessibility cells: x168..910, seven columns 106px each (35.333dp), rows 120px (40dp), first row y1003..1123. Selected Nov 6 cell `[698,1003,804,1123]`; Dec 1 cell `[380,1003,486,1123]`.
- Year list normal full rows 144px (48dp); selected year 2026 row `[108,952,972,1129]` = 177px (59dp). Top/bottom rows clipped; full per-row bounds retained in JSON.
- Footer action order left-to-right **CANCEL, OK**, at `[514,1735,744,1897]` and `[744,1735,936,1897]`. Header year is tappable to enter year view. Cancel closes without applying date text.

## Spinner popup geometry

These are **accessibility row unions / visible cream content bounds**, excluding soft shadow. Every row is **144px = 48dp** tall, single-line, long labels ellipsized instead of increasing height. Width can exceed the anchor and clamp to screen edges. Exact rows and raster colors are in JSON.

| Capture | Row union raw px | CSS crop bounds x,y,w,h | Rows/order |
|---|---|---|---|
| books-format-popup | [72,574,1008,1006] | 24,167.333,312,144 | Physical, Digital, Audiobooks |
| history-book-popup | [0,512,1080,1088] | 0,146.667,360,192 | physical 1, physical 2, digital 1, audio 1 |
| charts-book-popup | [0,517,1080,805] | 0,148.333,360,96 | physical 1, audio 1 |
| quarter-format-popup | [147,632,933,1064] | 49,186.667,262,144 | Physical, Digital, Audiobooks |

Long-label behavior is captured in History and Charts, using only existing labels. Chart options are the observed two entries, not all four history books. No option was selected during popup captures; Back dismisses. Quarter popup captured after scrolling dialog to its lower scroll limit; Cancel / Save Plan remain dialog footer order.

## Action order and bounded gaps

Start owned preserved AVD → verify local date/package → launch activity → Wait system UI prompt → Books format popup → Plan rest field → year header → Back dismiss (a second Back left activity; activity relaunched) → Books choose first existing paper book → mistaken Set start date and Set deadline commits noted above → tap actual saved deadline field → capture Dec calendar → Cancel → Session / Entries → history spinner → Back / Close → Charts spinner → Back → Plan / Edit next quarter → quarter spinner → Back → scroll quarter dialog → recapture quarter popup → Back / Cancel → rest field month recapture → Cancel → Books format recapture → Back → Session / Entries history recapture → Back / Close → Charts popup recapture → Back.

**Near-bottom-edge popup positioning is unobserved.** Existing fixture places all requested anchors near the upper viewport. No labels, fixture contents, display geometry, source, or layout were changed to manufacture an edge case. Left/right edge clamping is observed for long History/Charts labels; upward popup placement and a vertically scrolling long popup are unknown. This bounded reference does not invent either geometry.

Only the process launched for this task may be shut down with `adb -s emulator-5580 emu kill`; no other device/process should be touched.
