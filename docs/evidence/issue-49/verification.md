# Issue 49 — Quarter dialog elevation and surrounding shadow

Bounded paint comparison against the retained API 35 capture used for #48. This
is not pixel-comparison approval or final Android sign-off (#44/#51).

## Native source

- `docs/evidence/issue-48/native-bottom.png`: the retained full-screen capture
  from the disposable `issue48-parity` AVD, 1080x2196 @ 480 dpi (360x732 dp).
  The panel occupies `[75,120,1005,2004]` physical = `[25,40,310,628]` CSS at a
  2dp corner radius.
- The panel is the ordinary API 35 `AlertDialog` decor: 16dp elevation
  (`floating_window_z`) painting black spot (alpha .19) and ambient (alpha .039)
  components outside the surface. The 16dp background inset is inside the
  panel; it is not the shadow.

## Measurement

For each straight edge, luminance was sampled perpendicular to the dialog rect
across the dimmed page and normalized by the local dim field taken 55–69
physical px out. The dim field itself is 90–96 luminance, matching the web
backdrop (96). The native band reaches within 0.5% of that field at:

| Edge | Darkening at panel | Reach (CSS px) |
| --- | --- | --- |
| Left | 10.5% | 20.0 |
| Right | 10.6% | 17.0 |
| Top | 7.3% | 18.0 |
| Bottom | 8.9% | 19.3 |

The top band is weaker than the sides and the bottom is wider, consistent with
a downward spot component plus a weaker ambient one; the flat `#0009` backdrop
is already correct and stays untouched.

## Implementation

`web/style.css`, scoped to the Quarter dialog only:

```css
#quarter-dialog:not(#entries-dialog):not(#metrics-dialog) {
  box-shadow: 0 4px 18px rgb(0 0 0 / .19), 0 3px 28px rgb(0 0 0 / .039);
}
```

The two layers keep the native component alphas; blur and offsets were fitted to
the measured bands, not derived from 16dp. Paint sits outside the verified
`25,16,310,700` surface, so title/footer/scroll allocation, the 2px radius and
the outside focus outline are unchanged. The sheet dialogs and footer are not
selected by this rule.

## Results

Band RMSE against the native profile, in luminance points, over the same
dialog-relative windows:

| Edge | Before (no shadow) | After |
| --- | --- | --- |
| Left | 4.72 | **0.70** |
| Right | 4.77 | **0.56** |
| Top | 3.32 | **0.67** |
| Bottom | 10.63 | **0.75** |
| Mean | 5.86 | **0.67** |

Corner diagonals: top-left 2.27 → **1.03**, top-right 2.20 → **0.97**. Bottom
corners improve less (6.14 → 4.58, 6.58 → 4.85) because the dimmed page behind
differs between the captures (native navigation bar, web tab bar), so those two
corners are visual evidence only, not isolated shadow paint.

Captures are at original scale, dialog-relative, labelled native | before |
after: `paired-left-edge.png`, `paired-top-left-corner.png`,
`paired-bottom-right-corner.png`. `web-bottom.png` is the full after capture;
the before capture forced `box-shadow: none` on the same page state. Numeric
details are in `measurement.json`.

## Limits

- CSS blur approximates the ambient/spot renderer; this is not a conversion of
  the 16dp elevation parameters.
- The web panel is 16px from the viewport top and bottom, so the vertical spread
  is clipped by the viewport as it is by a small native display; the side bands
  are fully visible.
- Native and web use the same visible quarter content (one "Synthetic next
  quarter" book, pages 1–100) but different bundle bytes; the dimmed page behind
  the panel is controlled only in the strips used for measurement.
- One retained native capture and one Chromium build; actual-device sign-off
  remains pending in #44/#51.

## Checks

- `web-tests/quarter-visual-parity.spec.js`: 4/4 — dialog shadow/radius/backdrop
  contract, native panel geometry (25/16/310/700, footer 62, scroll max 44),
  desktop bounds, focus outlines, popup and cancellation storage.
- Full web suite: **164/164**, one worker, zero retries, terminal exit code 0
  (4.2 min). An earlier full run hit one `release.spec.js` book-editing status
  timeout (163/164); that test passed in isolation and in the clean rerun, and
  it does not touch the dialog paint. JS syntax checks and `git diff --check`
  exited 0.
