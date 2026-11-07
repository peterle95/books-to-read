# Android calendar typography — issue #46

## Provenance

Fresh API 35 capture on an isolated `issue46-parity` AVD created from
`system-images;android-35;google_apis_tablet;x86_64`; the reader's `pet` AVD and
the offline emulator-5554 were not touched. Device fingerprint
`google/sdk_gtablet_x86_64/emu64xa:15/AE3A.240806.046.T1/13135149:userdebug/dev-keys`,
1080×2340 physical, density 480, font scale 1.0, locale en-US, timezone
Europe/Berlin, SDK 35. The calendar was opened by tapping the empty Books
"Start date override" field and closed with Back/Cancel, so no plan data was
committed. The installed APK is the repository debug build
(`sha256 cc26c206c0a954e76af7af9674c10c87b44d9048dbbcee6e835bfc2400807bb2`), not
the earlier reference APK.

The web pair is the calendar harness at 360×732 CSS px, DPR 3, fixed clock
2026-11-07, Chromium from Playwright 1.64.1.

Raw captures: `native-month-1080x2340.png`, `web-month-1080x2196.png`,
`native-year-1080x2340.png`, `web-year-1080x2196.png`. `paired-month.png` and
`paired-year.png` place the two 288×493 CSS-px surfaces side by side at original
scale. `native-calendar.xml` is the matching accessibility tree. All measured
values and layout boxes are in `measurement.json`.

The fresh AVD window has no 24 dp bottom navigation inset, so the native dialog
surface sits 36 physical px (12 CSS px) lower than in the earlier reference
crop. Every measurement below is relative to its layout box, and the paired
surfaces are cropped from each surface origin, so the inset does not enter the
result.

## Source geometry

AOSP `android15-release`:

- `core/res/res/values/dimens_material.xml`: `date_picker_month_text_size`
  14sp, `date_picker_day_of_week_text_size` and `date_picker_day_text_size`
  12sp, `date_picker_month_height` 56dp, `date_picker_day_of_week_height`
  36dp, `date_picker_day_height` 40dp, `day_picker_padding_top` 6dp and
  `day_picker_padding_horizontal` 20dp.
- `core/java/android/widget/SimpleMonthView.java`: the month baseline is
  `(mMonthHeight - (ascent + descent)) / 2`; weekday and day baselines are
  `rowCenter - (ascent + descent) / 2`, without text-view font padding.
- Shipped `Roboto-Regular.woff2`: hhea ascent 1900, descent −500, upem 2048,
  so the source baseline in a box of height `h` is
  `(h + 1400 * fontSize / 2048) / 2` below its top.

The accessibility tree exposes the day-1 cell as `[168,1039][274,1159]`
(106×120 physical = 35⅓×40 CSS). It implies body top 745, month row 763–931,
weekday row 931–1039 and the first day row 1039–1159. The web boxes are
6/56/36/40 px from body top, matching exactly.

## Residuals

Thresholded glyph ink, web ink centre minus native ink centre, in CSS px
(1 physical px = ⅓ CSS px):

| Text | 128 | 180 | 220 | 245 |
| --- | --- | --- | --- | --- |
| Month title "November 2026" (14 px) | 0.167 | 0.167 | 0.333 | 0.333 |
| Weekday "S" (12 px) | 0.5 | 0.5 | 0.5 | 0.5 |
| Day "1" (12 px) | 0.333 | 0.5 | 0.5 | 0.5 |

Header, white on accent: the date title centre is −0.167 CSS px (web 0.5
physical px higher) and the year label −0.167. Year list, selected 2026 row:
native top 81 CSS px below body top and 59 CSS px high; web 81 and 59 exactly.
The captures cover the selected/today state (2026-11-07) and the year state.

The maximum residual is 0.5 CSS px (1.5 physical px). The reported "1 CSS px"
title and "0.67 px" weekday/day offsets are not reproducible: the cited
captures (`calendar-final-2026-11-06T23-22-58-006Z`) predate commit `9c5ec6a`
(2026-11-07 00:36 +0100), which introduced the source-backed 6/56/36/40 areas
and the scoped Roboto metrics.

Used baselines from the style engine are 13 vs 12.785 (title), 11 vs 11.102
(weekday) and 24 vs 24.102 (day) measured against the AOSP formula; the
regression in `web-tests/android-calendar.spec.js` pins them. What remains is
Chromium-to-Skia glyph rasterization, so no global scale, transform, per-size
nudge or additional metric override was added. A nudge would move the glyph
baseline away from the source position to chase anti-aliasing.

## Limits

- One emulator image at font scale 1.0 and one Chromium build are compared;
  this is not pixel equivalence on every platform.
- Year-scrollbar range/thumb remains issue #47; shadows remain #48/#49.
- Actual Android/desktop sign-off and the complete same-fixture visual audit
  remain #51/#44.
