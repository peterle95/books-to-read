# Calendar year scrollbar — issue #47

## Provenance

Fresh API 35 capture on an isolated `issue47-parity` AVD created from
`system-images;android-35;google_apis_tablet;x86_64`; the reader's `pet` AVD and
the offline emulator-5554 were not touched. Fingerprint
`google/sdk_gtablet_x86_64/emu64xa:15/AE3A.240806.046.T1/13135149:userdebug/dev-keys`,
1080×2340 physical, density 480, font scale 1.0, locale en-US, timezone
Europe/Berlin, SDK 35. The dialog was opened by tapping the Plan "Rest start
date" field and closed with Back/Cancel; no plan change was committed. The
installed APK is the repository debug build
(`sha256 cc26c206c0a954e76af7af9674c10c87b44d9048dbbcee6e835bfc2400807bb2`), the
same build used for #46.

The web pair is the calendar harness at 360×732 CSS px, DPR 3, selected date
2026-11-07 (the native device date), Chromium from Playwright 1.64.1.

Raw captures: `native-year-initial.png`, `native-year-scrolled.png` and
`native-year-selected-2028.png` (screen-record frames, full 1080×2340);
`web-year-initial.png`, `web-year-scrolled.png`, `web-year-selected-2028.png`
and `web-year-9999.png` (1080×2196); `paired-year-*.png` (both 288×493 surfaces
at original scale); `measurement.json`.

## Native source geometry

AOSP `android15-release`:

- `core/java/android/widget/DatePicker.java`: the default range is
  01/01/1900 to 12/31/2100 (documented at lines 293 and 319). The app never
  calls `setMinDate`/`setMaxDate`.
- `core/java/android/widget/YearPickerView.java`: `setSelectionCentered` uses
  `226dp / 2 - 64dp / 2 = 81dp`, so the selected row starts 81 CSS px below the
  list top. Normal rows are 48dp, the selected row 59dp.
- `core/java/com/android/internal/widget/ScrollBarUtils.java`:
  `length = max(2 × thickness, round(size × extent / range))` and
  `offset = round((size - length) × scrollTop / (range - extent))`.
- `config_scrollbarSize` is 4dp (12 physical px, 4 CSS px).

The accessibility tree places the list at `[108,745][972,1759]` — 338 CSS px
tall, full 288 CSS px wide. With 201 rows the content is
`200 × 48 + 59 = 9659` CSS px (28 977 physical), the initial scrollTop is
`126 × 48 - 81 = 5967`, and the predicted thumb is 11.67 CSS px tall at 209.
The selected-2028 row (index 128) gives scrollTop 6063 and offset
212.33.

## Capture configuration

Android fades ListView scrollbars after roughly one second; static `screencap`
after the fade contains no thumb (verified: zero gray runs on the right edge).
The native captures therefore come from `adb shell screenrecord` at 10 fps,
with frames selected while the thumb was painted. `paired-year-initial.png`
and `paired-year-selected-2028.png` use those frames.

The web thumb is now a DOM overlay, so Playwright's default
`--hide-scrollbars` cannot hide it and no launch flag is needed. The viewport
stays 360×732 at DPR 3 and the dialog keeps its x=36 / y=119.5 framing. The
earlier supplemental capture shifted the dialog to x=28.5 because the page's
root scrollbar took 15 px; that configuration is not used.

## Results

Thumb geometry in CSS px, measured from the body top:

| State | Native top / height | Web top / height |
| --- | --- | --- |
| Initial 2026 | 209 / 11.33 (627–660 physical) | 209 / 11.66 |
| Selected 2028 | 212.33 / 11.33 (637–670) | 212.33 / 11.66 |
| Scrolled | 94.33 / 12 (283–318; scroll offset not instrumented) | 70 / 11.66 at scrollTop 2000 |
| Early 0001 | native range starts at 1900 | 0 / 11.66, window 1–201 |
| Late 9999 | outside native range | 326 / 12, window 9799–9999 |

The initial and selected-year offsets agree exactly; the height differs by at
most one physical pixel, which is the Android nine-patch/anti-aliased edge
(measured native run 34 px, formula 35 px). The native thumb sample is
(175, 175, 175); the web value is #b0b0b0.

## Implementation

- `yearWindow` uses Android's 1900–2100 range whenever the selected year is
  inside it. Outside, a same-size 201-year window is clamped to the accepted
  1–9999 range; scrolling at an edge extends by one year and re-renders, so
  keyboard and wheel reach both ISO boundaries.
- The year list is an inner scroller with the browser scrollbar hidden; a
  4 px overlay thumb is painted from the ScrollBarUtils formula with
  device-pixel rounding. Rows keep their full 288 px width, so removing the
  scrollbar gutter causes no layout shift.
- Cancel, keyboard traversal, centered selection and storage are covered by the
  regression tests in `web-tests/android-calendar.spec.js`.

## Limits

- Android fades its scrollbar; the web overlay stays painted. The native
  screenshots sample the ~1 s paint window, and a static capture after the fade
  shows no thumb.
- At the web-only 9999 keyboard position the window has no selected row (the
  draft stays at 0001), so its content is 9648 px and the thumb reaches
  326/12 instead of 326.33/11.66. Android has no equivalent cursor state.
- One emulator image and one Chromium build are compared. This is a measured
  scrollbar contract, not pixel approval; actual-device sign-off remains in
  #44/#51.
