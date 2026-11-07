# Issue 53 parity change-set review

## Scope and ownership

- The broad parity snapshot described in #53 is no longer an uncommitted
  change set. `9c5ec6a` committed the principal changes after `541957e`;
  subsequent parity and date fixes are included through `69e4509`.
  `origin/main` and HEAD both pointed at `69e4509` when this review started.
- At review start, HEAD's Git tree was
  `5b3a5f7b491d809eea63bfe6015d227522c2162f`. The working tree also has the
  new test `web-tests/quarter-import-boundary.spec.js` (SHA-256
  `8046ec10a3855eb44e419fa40e2ba9cf7679097d391db17825d71cbf7057c315`)
  and this review. This is not a complete manifest of unknown untracked files.
- In the `541957e..69e4509` comparison, the 158 changed product, test,
  fixture and documentation paths comprise 18 `web/`, 37 `web-tests/`,
  97 `docs/`, four fixture files, `.gitattributes` and Playwright config.
  The separate four live bundle files and one generated result are excluded
  from those counts.
- `9c5ec6a` includes changes to tracked `reading_plan_data/*.json`. Treat
  them as live user data: their contents and ownership were not investigated
  and they were not modified in this review. The reader confirmed that they
  should be preserved as user-owned data outside the parity product changes;
  the files and published history are left untouched.
- `test-results-books-ui/.last-run.json` is a generated test artifact
  introduced by `9c5ec6a`. It is not product source. It is removed from the
  index and ignored for future runs; the local file is retained on disk.
- Untracked `.agents/`, `.claude/`, `assets/screenshots/`, and
  `skills-lock.json` predate this review. Their ownership and intended use are
  unknown; they are not included in the intended changes and were left alone.
  Ignored local build, dependency, result, and reading-data paths were not
  inspected or deleted.
- Android source and desktop Python application files have no changes in
  `git diff 541957e..69e4509`. That establishes source preservation only,
  not a native build or actual-device pass; those remain in #55 and #56.

## Quarter-start assertions

The prior web UI allowed changing the planned quarter start and the old
`web-tests/quarter.spec.js` asserted both invalid-date rejection and saving a
later quarter. The Android reference instead derives a new start date from
the later of today and the current plan start, and preserves an imported
planned start: see `PlannedQuarterEditor.java` lines 22–29. The Android dialog
has no date-edit control. The changed web test checks the derived heading and
preservation after save/reload; `planned-quarter-editor-parity.spec.js` checks
no date input, transactional cancellation, stored start and desktop ZIP load.
`early-quarter-parity.spec.js` compares quarter arithmetic to desktop,
including supported-year boundaries.

The removed invalid-entry assertion does not apply to the removed UI, but
boundary validation is still needed at import. The added
`quarter-import-boundary.spec.js` imports a valid synthetic bundle, then
checks that valid-checksum files with a non-quarter day or month are rejected
and leave the original raw stored bundle unchanged. Focused run: 1 passed.

Other changed assertions in `release.spec.js` replace the real-plan transfer
fixture with synthetic data and remove the summary-settings editor flow. The
synthetic fixture avoids reading live user data and retains a desktop loader
round-trip; it is not evidence of a real-data transfer, which remains #57.
The current Android source preserves imported summary options but displays
summary rows using enabled defaults; `settings-parity.spec.js` checks that
mixed imported options survive a web edit, ZIP export and reimport. This does
not verify all Settings visual parity or actual-device behavior.
The feature inventory and footer residual in `docs/web-release-verification.md`
were corrected to describe the current controls and the #50 measurement.

## Paths examined

- `web/app.js`, `web/editor.js`, `web/quarter.js`, `web/history.js`,
  `web/bundle-validator.js`: import validation and checksums precede bundle
  replacement; normal edits validate and replace one encoded local-storage
  value; the quarter editor checks its opening token and preserves draft
  state on failure. `editor-atomicity.spec.js` and
  `planned-quarter-editor-parity.spec.js` cover representative failures,
  cancellation, conflicts, and desktop-compatible exports. These checks do not
  establish atomic behavior for every multi-tab or device workflow.
- `web/android-controls.js`, `web/android-calendar.js` and `web/index.html`:
  visible replacements are bound to hidden controls; tests exercise labels,
  keyboard navigation, disabled options, dialogs and Escape. This is not an
  independent screen-reader or full accessibility audit.
- `web/charts.js`, `web/schedule.js`, `web/projection.js`: inspected date
  handling and rendering; boundary tests include years 0001 and 9999 and
  unchanged storage. The long-range resource issue is #61.
- `web/sw.js` and `web/assets/android/THIRD-PARTY-NOTICES.md`: local assets,
  notices and offline cache entries are explicitly listed, with matching
  asset-hash and network-blocked reload tests in `native-assets.spec.js`.
  Production deployment and two-deployment update behavior remain #58.
- Application HTML sinks found by a source search use DOM text operations;
  the calendar's `innerHTML` is a constant template. The pre-existing bundled
  ZIP dependency was not independently security-audited. A source search did
  not find focused or skipped Playwright tests in `web-tests/`.

## Review findings and limits

- The committed live bundle is user-owned and must be preserved, as confirmed
  by the reader.
- `git diff --check 541957e HEAD` reports an extra blank line at the end of
  `web-tests/new-plan-parity.spec.js` and reports every line of the Apache
  license as trailing whitespace. The license is intentionally marked `-text`
  in `.gitattributes` and its exact bytes are documented and tested; do not
  normalize it without updating provenance. `git diff --check` on the
  initially clean working tree passed; this is distinct from the historical
  range check. The extra blank line has since been removed without changing
  the test. The unmodified license remains a byte-preservation exception.
- The review traced import validation before replacement, bundle checksums,
  transactional editing, bounded dates, controls, native asset notices,
  service-worker precaching and test coverage. It does not independently
  reproduce every screenshot, audit the pre-existing ZIP dependency, or certify
  accessibility on actual assistive technology. No release approval is claimed.
- Long supported date ranges cause scheduling code to enumerate millions of
  days. A synthetic Node check of `availableReadingDays` across years 0001–9999
  used approximately 346 MB RSS and took 11.3 seconds with other tests running.
  Browser impact and remediation are tracked in #61; this is not a browser
  benchmark.
- The planned-book editor's blank-start, page-zero and audiobook input rules
  differ from the native source. The discrepancy and its required reproduction
  and regression coverage are tracked in #62.
- CSV export can emit page-zero books that the CSV importer rejects. This
  source-level round-trip discrepancy is tracked for reproduction and repair in
  #63; CSV remains a deliberately lossy format.
- A synthetic direct validator call accepted two books whose distinct raw IDs
  become identical after trimming and one shared session list. Import behavior
  and safe handling of this ambiguity are tracked in #64.
- The APK hash prefix in `docs/evidence/issue-48/verification.md` conflicts
  with the full hash in its `measurement.json`. The evidence is not corrected
  by guessing; provenance reconciliation is recorded in #55.
- #51 was closed with explicit limits on visual and interaction evidence.
  #54–#60 track Python, native/device, transfer, deployment, offline recovery,
  and final release approval; passing browser tests cannot replace those gates.

## Verification so far

- `node --check` passed for 50 existing JavaScript files in `web/` and
  `web-tests/`, and separately for the new focused test.
- The new focused browser test passed (1/1) using an isolated Playwright
  output directory and a synthetic fixture.
- The preceding full web-suite run passed 173/173 before adding that test.
- The new files are untracked, so ordinary `git diff --check` does not check
  their contents. A separate trailing-whitespace check of both new files
  passed.
- The subsequent full web-suite run passed 174/174, including the new test.
  The test source's trailing blank line and `.gitignore` were changed while
  that run was in progress; the code behavior was not changed.
- A later frozen product/test snapshot run completed with 173/174 passing:
  `chart-date-boundary.spec.js` for 9999-12-30 failed while Chromium read a
  selected file. The message was “The requested file could not be read,
  typically due to permission problems that have occurred after a reference to
  a file was acquired.” The before/after manifest had 78 paths with zero
  differences. `tested-sources.json` contains that product/test manifest;
  its SHA-256 is
  `9f437ab9ee94272d9b9e4aeeb23e260322b93e97f3f6288b5c7adf3fc22cc963`.
  The cause is unconfirmed. Fifteen focused repeats passed without retries;
  the failed full run remains a failure and is tracked in #65.
