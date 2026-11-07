# Issue 51 — partial same-fixture phone comparison

**Not approved.** This is a comparison of five first-fold screens, not complete
visual or interaction parity. Most discrepancies below remain unresolved. It
does not replace a fresh, synchronized Android/web capture or the actual-device
release checks in issue #44.

## Inputs and provenance

- Native images are the earlier API 35 emulator captures described in
  [`../issue-45/native-earlier-capture.md`](../issue-45/native-earlier-capture.md).
  They predate this comparison. Their original SHA-256 values match the earlier
  capture metadata. `native-*-raw.png` preserves the original 1080 × 2340
  images; `native-*-crop.png` removes physical rows 0–71 and 2268–2339,
  without rescaling, leaving 1080 × 2196 pixels.
- The Android build was made from the recorded native source, with APK SHA-256
  `88c6e7e6e4e0239153f96cff089c5ba8991fb9d95dc0ea727364a60934404913`.
  All 48 recorded `app/src/main` files still match the current repository's
  hashes. The separate APK currently in the repository build output is **not**
  this APK and was not used. The full native source hashes, screenshot hashes,
  Android build fingerprint and fixture hashes are in `capture.json`.
- The Android screenshots were captured on 2026-11-06 in Europe/Berlin with
  density 480 dpi, font scale 1.0 and the fixture in
  `fixtures/issue-45-populated`. The device's four bundle hashes matched that
  fixture after the earlier capture. The native clock was **not frozen**; the
  status bar shows approximately 11:46–11:47, while the recorded metadata time
  after the capture is 11:55:24. Individual image timestamps were not recorded.
- The initial web captures use the same four fixture files, imported through the UI
  into an isolated Chromium 156.0.8078.4 context. They use Europe/Berlin,
  `2026-11-06T10:55:24Z` (11:55:24 local), 360 × 732 CSS viewport, 360 × 780
  screen, DPR 3, and service workers blocked. This is the same calendar date,
  **not the same capture instant** as the native images. Web source and fixture
  hashes matched before and after capture; `capture.json` records both sets.
  These images predate the rest-day label correction described below; they are
  retained as before-fix evidence, not as images of the final source.
- Native captures show each screen's initial visible position; numeric native
  scroll offsets were not recorded. Web window scroll is `(0, 0)` for each
  screen. Session selects the first physical book; Charts selects that book,
  with All off and projection on. The two platforms' selections and visible
  content match for these screens except for the differences identified below.

## Original-scale image pairs

Each crop and web image is 1080 × 2196 physical pixels; compare without scaling.

| Screen | Native | Web before label correction |
| --- | --- | --- |
| Session | [crop](native-session-crop.png), [raw](native-session-raw.png) | [web](web-session.png) |
| Plan | [crop](native-plan-crop.png), [raw](native-plan-raw.png) | [web](web-plan.png) |
| Books | [crop](native-books-crop.png), [raw](native-books-raw.png) | [web](web-books.png) |
| Charts | [crop](native-charts-crop.png), [raw](native-charts-raw.png) | [web](web-charts.png) |
| Settings | [crop](native-settings-crop.png), [raw](native-settings-raw.png) | [web](web-settings.png) |

## Individually observed discrepancies

1. **Session format label:** native's Audiobooks text wraps and is clipped in
   the format button; web renders it on one line. The Session target labels also
   show colons on web, but not in native. See the Session pair.
2. **Plan rest-day labels (corrected):** native says “Rest start date”, “Rest end date” and
   “Add rest-day range”; web says “Rest day from”, “Rest day to” and “Add rest
   days” in the before image. The web labels now match native; see
   [after](web-plan-after-labels.png) and `capture-after-labels.json` for source
   and fixture hashes. Empty web date fields still show `YYYY-MM-DD`, while
   native fields are blank; native shows `?` between the range dates, web `to`.
   Those remaining differences are unresolved.
3. **Plan first fold:** a web text-draft section begins below the rest-day form;
   it is not visible in the corresponding native first fold. Its relationship to
   the separately stored web draft and release requirements needs review; its
   existence here alone does not establish that the feature should be removed.
4. **Books date field:** the empty start-date override shows `YYYY-MM-DD` on web
   but is blank on native. Button paint, including shadows, also differs visibly
   in the Books and Plan pairs.
5. **Charts header:** native All and Metrics buttons are adjacent and equal width;
   web's All button is narrower and separated from Metrics. Chart selection and
   projection state match in the two captures; this observation is not a review
   of all chart values, interactions or scroll positions.
6. **Settings presentation:** native displays its synced-directory controls and
   CSV actions immediately; web displays data-source and manual-transfer cards.
   Manual four-file transfer instead of directory synchronization is the only
   approved exception. Which associated visual and explanatory differences are
   necessary to that exception remains to be reviewed; this comparison does not
   approve the rest of the Settings presentation.
7. **Session spacing and Entries button:** in the native crop the top of Entries
   and the tops of the book buttons are visibly clipped; the corresponding web
   buttons are fully rounded. The date/target card also begins lower in the native
   image than in web. These are visual observations, not measured root causes;
   fresh synchronized captures must establish the geometry before correction.

These observations are not exhaustive. In particular, the Session clipping may
be a native defect, but it is not an approved exception to the stated parity
requirement.

## Interaction and coverage limits

The fresh web run checked that navigating these five screens did not change the
serialized local-storage bundle and that the four host fixture file hashes stayed
unchanged. The earlier native capture records matching device fixture hashes
before/after its bounded sequence. This does **not** prove byte preservation for
every cancel path, or that web's stored representation equals the input bytes.

Not captured here: digital/audio Session, scrolled content, simultaneous groups,
overrides, Metrics, history/edit/delete, choosers, calendars, nested/dimmed
backdrops, bottom-edge popup placement, tablet or responsive desktop. Earlier
captures elsewhere may be useful references, but their differing provenance and
fixture limitations must not be silently treated as this run's evidence. A
complete run must freeze native time as well as web time, record actual scroll
offsets and interaction state, test cancellation, compare each requested state,
and resolve every discrepancy before parity can be approved.

## 2026-11-07 round 2 — supplied current-build references

Status: **still not same-bundle, same-instant parity approval.** Six references
supplied on 2026-11-07 (Session, Plan, Books, Charts, Reading history, history
book chooser) show a real plan on a 360 dp wide device at 09:28–09:33 local,
Europe/Berlin. Web captures use the same 360 dp width (360 × 884 CSS plus the
required 360 × 732 set), DPR 3, service workers blocked, frozen
`2026-11-07T08:28:00Z`, with a six-book bundle reconstructed from the visible
Plan, Books, Charts and history states.

The native bundle files were not supplied, the native clock was not frozen, and
the reference is a JPEG re-encode, so this round establishes label, structure and
measured geometry parity for the shown states, not bundle-byte identity.

Files: `round2/paired-*.png` place native and web at the same 360 dp width;
`round2/web-*.png` are the full 1080 px-wide captures; `round2/native-*.jpg` are
the supplied references; `round2/capture.json` records browser, viewports,
timezone/instant, source and fixture hashes, image hashes and DOM measurements.

### Dispositions

1. **Session format label** — the current reference shows “Audiobooks” on one
   unclipped line, matching web. Not reproducible.
2. **Plan rest-day labels** — labels match; every range now renders
   `start ? end`, one-day ranges included, and empty date fields no longer show
   `YYYY-MM-DD`. Resolved.
3. **Plan first fold** — web still has the separate text-draft section below the
   rest-day form; the native screen has no equivalent. Unresolved product
   difference, not removed by this comparison.
4. **Books date fields** — override fields are blank like native. Resolved.
5. **Charts header** — All and Metrics are both 88 × 44 CSS px, 2 px apart, with
   14 px text, matching `secondaryButton` and Android's 88 dp default minimum
   width. Resolved.
6. **Settings presentation** — unchanged; manual four-file transfer remains the
   only approved exception, so the remaining data-source/manual-transfer
   presentation differences are unresolved.
7. **Session spacing and Entries** — the new reference shows a fully painted,
   rounded Entries button and cards, so the earlier clipping was the capture's
   scroll position rather than layout. Format buttons are now a fixed 48 px row,
   book buttons and Entries are at least 48 px, and Add session uses 15 px text.
   Resolved for the shown states.

### Measurements (web DOM, 360 CSS px)

- Charts: All `88 × 44` at x=166, Metrics `88 × 44` at x=256, 14 px text.
- Session: Entries `88 × 48`; first format button `96 × 48`; first book button
  `147 × 48`; metrics row `300 × 65.19`; Add session `116.09 × 48`.
- Plan: first rest row `56` px high (4 px row padding above and below the 48 px
  Remove button), label `2026-12-19 ? 2026-12-19`.

### Still not comparable

- The reconstructed sessions were repaired on import, so history
  “total recorded” and per-entry contributions differ from native for data
  reasons, not layout.
- This round has no native Settings, group, calendar, edit/delete-dialog,
  tablet or desktop references.
- Actual-device and final approval remain #44/#60.

### Checks

- Full `npx playwright test`, one worker, zero retries: **173 passed**, exit 0,
  6.1 minutes.
- `node --check` passed for the changed scripts.
