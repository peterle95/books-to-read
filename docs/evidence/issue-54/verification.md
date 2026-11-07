# Issue 54 — Python regression verification

## Isolation and environment

On 2026-11-07, Python 3.12.10 (64-bit Windows, Tcl/Tk 8.6) ran on
Windows 11 build 26200. The Python sources and the four synthetic
`fixtures/android-session-contract/` files were copied into an external,
otherwise empty directory. No `reading_plan_data/` from the repository was
read, copied or modified. `PYTHONDONTWRITEBYTECODE=1` was set. The final
copy's eight Python files and four fixture files match the working tree's
SHA-256 values in `tested-sources.json`; this is not a manifest of the web
run or of the whole repository.

The test audit found persistence tests use temporary paths, while the Android
contract test loaded a checked-in fixture through a loader that can repair
and write a bundle. It now loads a temporary copy. The Tk test mocks initial
loading and now also places its default data directory in a temporary
directory; its explicit rollover load uses a separate temporary bundle. The
test suite ran in the isolated copy as an additional safety boundary, not as
proof that all possible future tests are hermetic.

## Python results and diagnosis

- Before changes, `python -m unittest discover -v`: **68 run, 2 failed**,
  exit 1, no skips. Full output: `python-unittest.log`.
- The two failing tests were also run against an isolated `git archive` of
  `541957e` (before the parity commits): **2 failed** with the same values.
  See `baseline-focused.log`. The desktop implementation and original tests
  have no diff between that commit and the review's `986b809` base.
- `test_remaining_plan_reflow_excludes_rest_days`: the old expectation of
  August 24–31 (8 days) did not follow this synthetic plan. July 1–August 31
  has 62 days, of which August 2–3 are rest days. With 140 remaining pages,
  the section pace is 140/60 pages per reading day. The overridden book ends
  August 1; the next reading day is August 4, and 20 pages at that pace need
  `ceil(20 / (140/60)) = 9` days, ending August 12. The test now asserts the
  pace, override, both dates, allocation and overall status. This resolves an
  incorrect test expectation; it does not establish Android parity for this
  particular override scenario.
- `test_session_target_starts_from_today_current_page`: the function uses the
  actual `date.today()` for a book with progress, but the test assumed July 17,
  2026 without freezing it. After that date it returned 1000 rather than 1003.
  The test now freezes the clock to its intended date and retains the 1003
  assertion. No production scheduling or target code was changed.
- Focused corrected tests plus Android bundle test: **3 passed**, exit 0;
  `focused-after.log`. A subsequent full run passed **68/68** before the Tk
  default-path isolation change (`python-unittest-after.log`). The final run,
  `python -m unittest discover -v`, passed **68/68**, exit 0, no skips, in
  3.121s (`python-unittest-final.log`). The Tk test actually ran on this host;
  it can skip where Tk cannot create a display.

## Web/Python checks and limits

With Node 24.18.0, Playwright 1.64.1, Chromium, one worker and zero retries,
the following command passed **15/15** in 46.9s (exit 0;
`web-compatibility.log`), using synthetic bundles and isolated browser output:

```text
npx playwright test web-tests/scheduling.spec.js web-tests/early-quarter-parity.spec.js web-tests/reading-plan.spec.js web-tests/quarter-import-boundary.spec.js --retries=0 --output=<external-directory> --reporter=line
```

These focused tests cover early and final-year dates, selected desktop/web
schedule calculations, bundle validation, synthetic desktop transfer and
quarter import preservation. They do not establish equivalence for every
schedule, perform a real-data transfer, rerun the full web suite, or approve
the web switch. The last frozen full web run's file-read failure remains #65;
actual-device, deployment, recovery and final approval remain tracked in
#55–#60. This evidence covers #54's Python verification only.
