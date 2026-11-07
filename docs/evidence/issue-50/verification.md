# Issue 50 — Quarter footer text baseline alignment

Original-scale glyph comparison against the retained API 35 capture. This is a
bounded typography measurement, not pixel-comparison approval or final Android
sign-off (#44/#51).

## Native source

- `docs/evidence/issue-48/native-bottom.png`: the retained full-screen capture
  from the disposable `issue48-parity` AVD, 1080x2196 @ 480 dpi (360x732 dp).
  Dialog `[75,120,1005,2004]` physical; 62dp footer starting at y=1818; the
  Cancel button box is `[149.333,658,76.667,54]` CSS and Save plan
  `[226,658,97,54]` CSS.
- Footer glyph ink, measured at original scale (footer-relative physical px):

  | Word | Origin | Width | Height | Footer-relative origin |
  | --- | --- | --- | --- | --- |
  | CANCEL | 487,1897 | 153 | 30 | 412,79 |
  | SAVE PLAN | 716,1897 | 213 | 30 | 641,79 |

  The 400-weight footer text added in the previous pass already reproduces the
  widths; the remaining gap was vertical. Relative to its own button top, native
  ink begins 67 physical px (22.333 CSS) below the edge.

## Measurement

Glyph pixels are selected by the accent hue (`#b56b3c` over the white panel) and
split into words on column gaps. A coverage-weighted alpha profile from the
green channel (rows with alpha > 0.5) locates the sub-pixel centre:

| State | Ink rows (footer-relative) | Centroid y | Baseline error |
| --- | --- | --- | --- |
| Native API35 | 79–109 | 94.183 | — |
| Web before (8px/8px) | 81–111 | 96.163 | +1.98 physical px lower |
| Web after (22/3, 26/3) | 78–108 | 93.163 | −1.02 physical px higher |

The web footer previously centred Chromium's line box in the 54px button.
Android's button TextView includes font padding that is asymmetric around the
glyphs, so native ink sits above that centred line box. Padding moves the line
box inside the button without touching the footer or the button boxes.

## Implementation

`web/style.css`, the existing Quarter footer rule:

```css
#screen-plan .quarter-actions button {
  min-height: 54px; margin: 0;
  padding: calc(22px / 3) 11px calc(26px / 3); /* was 8px 11px */
}
```

Vertical padding still totals 16px, so the 62px footer allocation, both 54px
button boxes, the 2px radius, the outside focus outline and the fixed
title/footer scroll contract are unchanged. No shadow, transform, relative
offset or font-family/size change is introduced; only the intrinsic text
position inside each button moves.

## Result and residual

Chromium paints this 14px text at whole-CSS-pixel vertical positions: padding
7.0–7.5px, line-height 18–18.667px and `text-rendering: geometricPrecision` all
produced byte-identical glyph rows while the layout line box moved by 1/64px.
The reachable ink tops are therefore 22px or 23px below the button top, and the
native target is 22.333px. The chosen 22px row is the closest: the residual is
one physical px at DPR 3 (was two), and removing it would require a paint
offset, which the acceptance criteria forbid.

Glyph widths are untouched: CANCEL 154 vs native 153 physical px (pre-existing
one-pixel rasterization), SAVE PLAN 213 vs 213.

`paired-footer.png` is the original-scale native | before | after footer
comparison; `native-footer.png`, `web-footer-before.png` and
`web-footer-after.png` are the individual 930x186 crops. Numbers are in
`measurement.json`.

## Limits

- The native reference is the #48 capture (same visible quarter content, not the
  same bundle bytes) rather than a new device session; no actual-device sign-off.
- Only one Chromium build on Windows with the bundled Roboto woff2; Android's
  rasterizer is not reproduced, only its measured ink rows.
- The web panel is 700px tall versus the native 628px panel, so only
  footer-relative positions are compared; absolute page y differs by design.

## Checks

- `web-tests/quarter-visual-parity.spec.js`: **4/4**, exit 0. The 360px case now
  measures footer ink from a DPR3 element screenshot and requires both words
  within one physical px of the native origin/width/row; it also records the
  measurement as the `quarter-footer-ink` attachment.
- Regression guard: restoring `padding: 8px 11px` makes the 360px case fail on
  the footer baseline assertion (81 vs native 79, tolerance 1); the 1440px case
  is unaffected.
- Full web suite: **164/164**, one worker, zero retries, exit 0 (4.9 min).
