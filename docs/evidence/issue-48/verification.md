# Issue 48 — Quarter planned-book / Remove clipped shadows

Measured against a fresh API 35 capture. This is a bounded paint comparison, not
pixel-comparison approval or final Android sign-off (#44/#51).

## Native source and capture

- AVD `issue48-parity`: `system-images;android-35;google_apis_tablet;x86_64`,
  resized to 1080x2196 @ 480 dpi (360x732 dp) so the dialog matches the web
  viewport used by `web-tests/quarter-visual-parity.spec.js`. Disposable and
  deleted after capture.
- Installed `reading-plan-android/app/build/outputs/apk/debug/app-debug.apk`
  (sha256 `cc26c206c0a954e76af7af9674c10c87b44d9048dbbcee6e835bfc2400807bb2`,
  as in `measurement.json`; the earlier `ca7d6a15…` prefix here was a
  transcription error, reconciled in `docs/evidence/issue-55/verification.md`);
  imported only
  `fixtures/issue-45-populated` through Android SAF.
- Opened Plan → "Edit next quarter — 2027-01-01", then scrolled the AlertDialog
  `ScrollView` to its maximum and captured with `adb exec-out screencap`.

## Native finding

- Add (`[123,1302,387,1446]`) and Update (`[123,1458,518,1602]`) are
  `actionButton` views that wrap their labels, so their 2dp shadows are fully
  visible: below Add the background reads 209/222/230/238/244 at y=1446…1456.
- Remove (`[123,1614,957,1758]`) is a `secondaryButton` spanning the content
  width. Outside its rounded rectangle the background is pure 255 at every edge;
  inside the four corner notches the shadow remains (bottom-left 250/239/223 at
  x=126/132/138, y=1752). Planned-book rows behave the same way (one row fills
  the `books` content width).
- Cause: `ReadingPlanUi.verticalBox()` pads 16/12/16/20dp and Android
  `clipToPadding` clips child paint to that content box. The full-width buttons
  therefore lose the shadow outside their own rectangle, while the narrow
  Add/Update buttons keep it. This is **not** zero elevation and not a blanket
  `overflow: hidden`: the corner slivers must remain, and the web focus outline
  must not be clipped.

## Implementation

- Planned rows and Remove paint the same 2dp approximation on a sibling
  `.quarter-shadow-cast` layer (`position: absolute; inset: 0; overflow: hidden`)
  whose `::before` is the rounded 14px shadow. The layer is clipped at the
  button rectangle, leaving the corner slivers; the button itself is not clipped
  and keeps its 3px/2px `:focus-visible` outline. Remove is wrapped in
  `.quarter-remove`; planned rows get the layer inside each `li`.
- Add/Update keep the declaration from the shared elevation rule (the previously
  uncommitted shadow baseline); their disabled state still removes it.

## Original-scale comparison

Crops are the button rectangle ±12 physical px, luminance MAE against native:

| Button | Clipped layer | No layer (previous fallback) |
| --- | --- | --- |
| Remove | **2.08** | 2.19 |
| Add | 1.75 | 1.75 |
| Update | 3.68 | 3.68 |

`paired-bottom.png` is the native/web bottom strip; `paired-remove-corner.png`
is a 4x closeup of the bottom-left notches. `web-bottom-unclipped.png` is the
same page with the clipped layer hidden, kept only to show the delta.

## Limits

- CSS blur approximates Android's ambient/spot renderer; it is not a conversion
  of the elevation parameters.
- Native focus is drawn inside the button, so clipping cannot cut it; the web
  keeps its accepted outside outline instead of moving focus paint inward.
- The native capture uses the repository fixture while the web capture uses the
  synthetic `fixture(1)`; the visible quarter content (one planned book, format,
  title, pages) matches, the bundle bytes do not.
- Native disabled Remove does not exist in the app (the button is always
  enabled); the disabled web capture documents the CSS state only.

## Checks

- `web-tests/quarter-visual-parity.spec.js`: 4/4 (geometry, scroll maximum 44,
  Cancel storage, compact and wide viewports, cast geometry/overflow/focus).
- Full web suite: see repository run recorded with the commit.
