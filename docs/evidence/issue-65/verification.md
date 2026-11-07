# Issue 65 — Intermittent Chromium bundle file-read failure

Synthetic fixtures only; no reader data was read or modified. All browser checks
use the repository's Playwright 1.64.1 Chromium build on Windows, one worker and
zero retries. `reading_plan_data/` and the live reading plan were not touched.

## Observed failure

The reported run finished 173/174 with
`web-tests/chart-date-boundary.spec.js` for `9999-12-30` failing the assertion
that expects `Bundle imported on this device.` The status text was
`Bundle could not be imported: The requested file could not be read, typically
due to permission problems that have occurred after a reference to a file was
acquired.`

That sentence is Chromium's description of `NotReadableError`. The message alone
localises the failure to the import's file read, not to schema, checksum or
bundle-content validation: `web/app.js` wraps every import step in one `try`, and
only `file.arrayBuffer()` produces browser DOM errors. A checksum, manifest or
validation failure reports its own generated text instead.

## How the file reaches the browser

`setInputFiles` does not hand the page a byte copy. Playwright sends
`DOM.setInputFiles` with file paths, plus `Playwright.grantFileReadAccess` for
the same paths (`node_modules/playwright-core/lib/coreBundle.js`, server
`setInputFilePaths`). In-memory payloads (`{ name, buffer }`, which this spec
uses) are materialised as browser-side files. The `File` object therefore
references a file on disk, and the bytes are read when the page asks:
`Array.from(document.querySelector('#bundle-files').files)` followed by
`file.arrayBuffer()` in `web/app.js`.

## Reproduction

Deterministic reproduction of the failure mode against the real import form,
using the `9999-12-30` synthetic fixture written to a temporary directory:

1. `setInputFiles` with the four real paths; a page read returned the bytes.
2. Rewrite `plan.json` in place (identical JSON, later modification time).
3. Click `Import bundle`.

```
status after click: Bundle could not be imported: The requested file could not be read,
  typically due to permission problems that have occurred after a reference to a file
  was acquired.
```

Storage stayed empty, so no partial write reached `localStorage`. The same
sequence with the file deleted instead reports Chromium's `NotFoundError`
(`A requested file or directory could not be found at the time an operation was
processed.`). The reported wording therefore means access denied or a stale
file reference after selection, not a missing file — which is why a plain
existence check would not have explained it.

## What was ruled out

- **Application data and validation.** The fixture is the unchanged
  `chart-date-boundary.spec.js` bundle; its checksums, book range, session chain
  and chart boundaries pass in every other run of the same bytes, and a failed
  read is reported before any parsing.
- **Harness reuse of upload names.** Every import in the suite selects the same
  four names, so a shared backing path would be the obvious explanation. It is
  refuted: in the same page, a retained `File` reference still returned its
  original bytes after a second `setInputFiles` of the same name; a reference
  held by a second page in the same browser also still returned its own bytes
  after another page reselected that name. Chromium keeps an independent
  snapshot per selection, so a later import cannot invalidate an earlier
  reference.
- **Repeatability on demand.** The narrow command from the issue passed 15/15
  before the change and 15/15 after it. The original trigger was not
  reproduced: it depends on a platform-level file-access state that the test
  harness does not control and this run did not capture.

## Cause assessment

The failing step is Chromium's disk read of a file it was given a path to, and
the app treated the first failed read as a permanent import failure even though
nothing about the bundle was known to be wrong. `NotReadableError` covers
transient access-denied states that antivirus, search indexing or a sync client
can create on a freshly written file, and it also covers a backing file that
changed. The retained run has no OS-level telemetry, so which of those two
triggered the original failure is **not established**. What is established is
that the read is the only step that can emit this text, and that a single failed
read discarded an otherwise valid import.

## Change

- `web/app.js`: the four bundle reads go through `readSelectedFile`, which
  retries only `NotReadableError`, twice, with 100 ms and 200 ms waits, and
  rethrows every other error immediately. A read that succeeds on retry imports
  normally; a read that keeps failing still reports the Chromium text. Checksum,
  manifest, schema, validation, confirmation-dialog, repair and storage steps are
  untouched, and no stored byte is rewritten on failure.
- `web-tests/bundle-file-read.spec.js`: two checks. The first fails one
  `File.prototype.arrayBuffer()` call with a real `DOMException` named
  `NotReadableError` and the Chromium text, then asserts
  `Bundle imported on this device.` and that all four files were stored. The
  second fails every read and asserts the exact
  `Bundle could not be imported: The requested file could not be read, …` text
  plus an unchanged `localStorage` snapshot taken after a successful import.

Neither check weakens the import or chart assertions: the retry only re-reads the
same selected file, and the bytes still have to pass the existing manifest,
checksum and bundle validation.

## Red/green check

With the retry disabled (`attempt === 0` instead of `attempt === 2`),
`web-tests/bundle-file-read.spec.js` failed the recovery check and still passed
the persistent-failure check, so the new spec covers the fix rather than passing
vacuously. `web/app.js` was restored before the runs below.

## After

- `npx playwright test web-tests/bundle-file-read.spec.js --repeat-each=3 --workers=1 --retries=0 --reporter=line`
  → **6 passed**, 10.7 s, exit 0.
- `npx playwright test web-tests/chart-date-boundary.spec.js --grep 9999-12-30 --repeat-each=15 --workers=1 --retries=0 --reporter=line`
  → **15 passed**, 41.1 s, exit 0 (the issue's narrow check).
- `npx playwright test --workers=1 --retries=0 --reporter=line`
  → **188 passed**, 5.2 min, exit 0 (full web suite, including the new spec).
- `node --check` passed for `web/app.js` and the new spec.

## Limits

- The original trigger was not captured, so this correction is scoped to what is
  supported: one transient read failure no longer discards a valid import. It is
  not evidence that the 2026-11-07 failure was caused by antivirus or indexing.
- A reference whose backing file stays changed or removed is not recoverable by
  retrying. The deterministic rewrite reproduction above still reported
  `NotReadableError` after the retries, which is the intended behavior: the app
  must not import bytes it cannot read.
- Only the bundle import is covered. CSV import (`file.text()` in `web/csv.js`)
  has the same single-read exposure and is unchanged.
- The full-suite pass is automated Chromium evidence for this snapshot. It is not
  an Android/desktop parity result or actual-device release approval; the #44
  gate and its open visual residuals are unaffected.
