# Issue 62 — Align planned-book input validation with Android

Synthetic fixtures only; no reader data was read. Browser checks use the
Playwright Chromium build in this repository, and the desktop comparisons run the
repository's `reading_plan` Python package. The Android reference is the committed
Java source at the commit this change was built on (`3f4cb8b`); no Android
instrumentation was run for this issue.

## Reference behavior (Android)

- `PlannedQuarterEditor.java:64` calls
  `readBookFields(label, title, start, end, "", isAudiobookSection(label) ? 0 : 1, null)`:
  blank title defaults to `""`, blank start defaults to page 1 or audio second 0,
  and there is no default end.
- `MainActivity.readBookFields` substitutes `defaultStart` for a blank start, has no
  end default, then calls `parseBookUnit` and `validateBookRange`.
- `PlanPrimitives.parseBookUnit` (`:53`) sends audiobook sections through
  `parseDuration` — 2 or 3 colon-separated parts, minutes and seconds below 60 —
  and every other section through `Integer.parseInt`. Bare digits are therefore
  not audiotime, while unpadded minutes (`1:5`) are.
- `PlanPrimitives.validateBookRange`/`validatePageRange` (`:129`-`:149`) require a
  non-negative start and an end on or after the start, so a zero page is valid.

## Reproduction (before)

`storePlannedBook` in `web/app.js` required both fields at the form level
(`required` attributes plus an explicit check), rejected `from < 1`, and parsed with
`window.parseReadingUnits`, the session editor's shorthand, which accepts bare audio
seconds and demands zero-padded minutes.

| Planned input (Add) | Android reference | Web before |
| --- | --- | --- |
| blank start, end `12` | stored `1`-`12` | rejected: "Set the start and end pages or times." |
| `0`-`0` page range | stored `0`-`0`, 1 page | rejected |
| audiobook `60`-`120` | rejected: HH:MM or HH:MM:SS required | accepted as 60-120 seconds |
| audiobook `1:5`-`1:30` | accepted as 3900-5400 s | rejected by the time pattern |

## Change

- `web/app.js`: planned Add and Update resolve a blank start to page 1 (audio
  second 0), parse both fields with the native-style `window.parseBookField` that
  the Books editor already uses, and validate `from >= 0` with `to >= from`. A
  blank end still fails through the parser, as native does. The range rejection
  message is unchanged, and Cancel, stable IDs, groups and raw bundle bytes behave
  as before because a rejected edit never reaches `writeBundleFiles`.
- `web/editor.js`: exports the existing `parseBookField` as
  `window.parseBookField`. Its int32 bounds, colon-part shape and "minutes and
  seconds must be below 60" rules mirror `parseBookUnit`/`parseDuration`.
- `web/index.html`: removed `required` from the planned start and end inputs so a
  blank start reaches the handler instead of being blocked by the browser. The
  title stays required.

## After

| Planned input | Result |
| --- | --- |
| blank start, end `12` | stored `1`-`12` |
| `0`-`0` | stored `0`-`0`, `pages: 1` |
| audiobook `60`-`120` | rejected: "Time must be HH:MM or HH:MM:SS."; bundle bytes unchanged |
| audiobook `1:5`-`1:30` | stored `3900`-`5400`, displayed `1:05:00`-`1:30:00` |
| Update selected with blank start, end `30` | stored start `1`, end `30` |

The saved planned quarter exports to ZIP and loads through the desktop
`load_json_bundle(include_planned=True)`: the zero-page book is one page, and the
audio book keeps `start_page` 3900 / `end_page` 5400.

## Regression coverage

New test `planned Add and Update follow Android: blank start default, page zero,
native audio syntax` in `web-tests/planned-quarter-editor-parity.spec.js` covers
the Add and Update cases above, the bare-seconds rejection with raw storage
unchanged, unpadded minutes, and the desktop bundle round trip.

The existing cross-format Save case entered audiobook ranges as bare seconds
(`60`/`120`); it now enters `0:01:00`/`0:02:00`, the same 60 s and 120 s values in
native syntax.

Commands and results:

- `npx playwright test web-tests/planned-quarter-editor-parity.spec.js web-tests/quarter.spec.js --workers=1 --retries=0 --reporter=line`
  → **21 passed**, 46.9 s, exit 0.
- `npx playwright test web-tests/release.spec.js web-tests/quarter-visual-parity.spec.js web-tests/visible-layout-parity.spec.js --workers=1 --retries=0 --reporter=line`
  → **20 passed**, 1.4 min, exit 0. This keeps the desktop transfer, planned-book
  transfer and the planned-form layout checks on unchanged expectations.
- `node --check` passed for `web/app.js`, `web/editor.js` and the changed spec.

## Limits

- The Android column comes from the committed source, not from a device run: this
  change did not execute Android instrumentation, and no `readBookFields` unit test
  exists. The issue-55 record covers the last native build.
- `parseBookField` and `parseBookUnit` are separate implementations of the same
  rules; a future change to the native syntax needs both updated.
- Messages are not word-for-word identical (native "time must be HH:MM or
  HH:MM:SS", web "Time must be HH:MM or HH:MM:SS."), and the web title check still
  reads "A planned book needs a title."
- Bare audiobook seconds remain valid for reading sessions and CSV import
  (`window.parseReadingUnits`); those paths are outside the planned editor.
- A blank start on Update restarts the range at page 1 (audio 0) instead of keeping
  the selected book's start, because that is the native dialog's `defaultStart`.
  This can widen an existing range and is recorded rather than smoothed over.
- Run logs are retained outside the repository under the identifier
  `issue62-20261107`; machine-specific paths are not linked.
