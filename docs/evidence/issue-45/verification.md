# History sheet origin — issue #45

## Reference and calculation

The synthetic Android API 35 capture used a 1080 × 2340 display at density 3.
`native-history-popup.png` is the uncropped screenshot; its matching accessibility
tree is `native-history-popup.xml`. The cream sheet occupies raw y=256 through
y=2268 (bottom exclusive): 2012 physical pixels. The native implementation in
`ReadingSessionEntries.finish` requests `int(2340 * .86f) = 2012` pixels. It is
bottom-aligned above the navigation area. The comparison crop is raw y=72..2268,
giving a 360 × 732 CSS-pixel viewport. An earlier window dump from the same
emulator and APK (`native-earlier-window-insets.txt`) records status and
navigation bar insets of 72 physical pixels each, consistent with that crop.
It was not captured with the later open popup. The earlier
`native-earlier-history.png` was captured with verified unchanged fixture
hashes; see `native-earlier-capture.md` for provenance.
The sheet top is therefore (256 − 72) / 3 = 61⅓ CSS px. The accessibility tree
places the popup at (0, 146⅔, 360, 192) CSS px, with four 48 px rows.

The prior web capture `web-before-history-popup.png`, from run
`controls-geometry-2026-11-06T22-26-46-032Z`, used the same viewport and DPR.
At 92dvh its sheet was 673.44 CSS px tall, about 2.77 px taller than the
native sheet; the popup was at y=143.891. This is a sheet allocation difference,
not a picker-row or anchor offset.

The Playwright capture `web-after-history-popup.png` uses a 360 × 780 CSS px
emulated screen, a 360 × 732 viewport, DPR 3, and the same four synthetic option
labels. The sheet is capped to 86% of the reported screen height or 92% of the
viewport, whichever is smaller. The regression imports the preserved synthetic
bundle in `fixtures/issue-45-populated`, and asserts sheet and popup origins
within one physical pixel of the native reference, as well as 48 px row heights.
The comparison covers sheet and popup geometry, not overall pixel equivalence.

`native-reference.md` preserves the original capture's provenance and its
important limitation: two existing override values were reapplied on the
disposable Android fixture before these captures, so it is not evidence of
unchanged fixture bytes or data parity. The popup's visible selected book and
four labels match the web capture, but byte-identical native state for the later
popup cannot be established. No user-provided phone screenshots or reading data
are included here.

## Automated checks

- `npx playwright test`: 162 passed, including the mobile screenshot geometry,
  Books/Charts bounds, History rows, keyboard interaction and cancellation,
  stale-target and storage tests, and tablet/desktop layouts.
- `node --check web/app.js`: passed. There is no configured typecheck script.
- `python -m unittest discover`: 66 passed, two unrelated desktop calculation
  tests failed (`test_remaining_plan_reflow_excludes_rest_days` and
  `test_session_target_starts_from_today_current_page`); no Python files were
  changed in this work.

## Limits

Browser-reported screen dimensions may differ from Android's display metrics,
especially with browser chrome, multi-window mode, privacy settings, or an
on-screen keyboard. The viewport cap covers a reduced layout viewport, but a
real mobile keyboard that resizes only the visual viewport has not been tested.
This does not claim pixel parity in every environment. Desktop keeps the
previous viewport allocation. Actual-device verification remains part of
issue #44.
