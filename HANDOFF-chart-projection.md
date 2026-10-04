# Handoff: Android reading-chart projection

## User direction and status

The user requested fetching/pulling `books-to-read`, fixing the chart projection's starting point, and adding `est. end date: dd/mm` next to `Projection`, derived from actual pace and matching the projection line.

The user requested a checkpoint on another branch, then explicitly requested committing this handoff at the repository root on that checkpoint branch. This documentation-only follow-up leaves the implementation unchanged. This is a **pushed checkpoint, not a finished feature; a critical introduced initialization bug is documented below**. The user explicitly approved pushing the checkpoint despite unrelated baseline failures.

The original screenshot is at `/home/agent/.hermes/cache/images/img_25d002e28505.jpg` on this machine. It shows the Android app; scope is Android, not a desktop-chart rewrite. The existing projection is violet although the user describes it as blue; its existing color is preserved.

## Critical introduced issue: fix before native UI verification

A late Spec review found a production initialization-order bug in the checkpoint. The parent agent confirmed the relevant source declarations; this has **not** been exercised in a running Android activity or fixed.

- `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/MainActivity.java:116` constructs `new ReadingPlanCalendar(this)` before `restDays` is initialized at line 132.
- `ReadingPlanCalendar.java:11-16` now eagerly captures `activity.restDays` in a final list field. During that activity initialization the field is still null, and the captured reference remains null even after the activity initializes its list.
- `isRestDay()` at line 34 and `normalizeRestDayRanges()` at line 57 dereference that captured list. The activity's production scheduling/calendar path can therefore throw `NullPointerException` before the chart is reached.
- The standalone chart regressions pass because they use the list-injecting constructor with an already initialized list; they do not verify activity wiring.

The next agent's first task is to reproduce and fix this wiring issue, for example by correcting activity field initialization order or retaining lazy activity access, and then test a real activity with a populated plan. Preserve the deterministic regression seam and shared forecast/date behavior. Passing compilation or standalone checks is insufficient evidence of native app readiness.

## Repository and checkpoint

- Repository: `/home/agent/hermes-workspace/GitHub/books-to-read`
- Remote: `https://github.com/peterle95/books-to-read.git`
- Default branch: `main`
- Baseline: `9290077c782b6212ea3b802ec8e639ea0e63dfa3`
- Local and remote checkpoint branch: `hermes/20261003-1630-chart-projection-handoff`
- Upstream: `origin/hermes/20261003-1630-chart-projection-handoff`
- Implementation checkpoint commit: `13a69345c5d3185c73c2c6da7628f0a374395496`
- Message: `fix(android): checkpoint chart projection and finish estimate`
- Commit link: https://github.com/peterle95/books-to-read/commit/13a69345c5d3185c73c2c6da7628f0a374395496
- At the implementation checkpoint, the remote branch SHA was read back with `git ls-remote` and matched this commit. A subsequent documentation-only commit adds this handoff; inspect `git log -1 -- HANDOFF-chart-projection.md` for its SHA.
- At the implementation checkpoint, `git status --short` was empty.
- Nothing merged, deployed, or released; no PR opened.

The initial working tree was clean. `git fetch --prune origin` and `git pull --ff-only origin main` safely advanced local main to the baseline. Work initially started on `hermes/20261003-1545-chart-projection`; that branch was published at the baseline but **has no implementation commit**. The new checkpoint branch contains the work. Do not mistake the initial branch for the delivered one.

## Read before continuing

Follow `/home/agent/hermes-workspace/AGENTS.md`, repository `AGENTS.md`, `CONTEXT.md`, and the relevant ADRs in `docs/adr/`. Preserve the shared JSON/schema and persisted baseline-schedule semantics. No dependencies, schema changes, real reading-data edits, or system package installs were made for this change.

The tools in this session actually ran as user `agent` on Linux with `/home/agent/hermes-workspace` available; `/workspace` and `/opt/data` were absent. Discover the next runtime instead of assuming this layout.

## Implementation references

Inspect the actual committed diff rather than relying only on this summary:

```bash
git show --stat 13a69345c5d3185c73c2c6da7628f0a374395496
git diff 9290077c782b6212ea3b802ec8e639ea0e63dfa3 13a69345c5d3185c73c2c6da7628f0a374395496 -- reading-plan-android
```

Changed files:

- `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/ReadingPlanChartData.java`: excludes today from future pace accumulation; shared rounded forecast calculation for points and estimated finish; exposes `projectedDeadline` and `projectionLabel()`; returns an unavailable estimate when there is no pace; includes today's anchor when a started book has a future baseline start.
- `.../ReadingPlanChartView.java`: draws the full estimate beside `Projection` on a dedicated second legend row; adjusts chart top padding; updates the accessibility description with the same label when the book/toggle changes.
- `.../ReadingPlanCalendar.java`: accepts rest-day ranges directly while retaining the Activity constructor; enables deterministic chart tests without instantiating Android Activity.
- `reading-plan-android/app/src/test/java/com/petermolnar/readingplan/ReadingPlanChartCheck.java`: standalone assertion-based regression coverage.
- `reading-plan-android/app/build.gradle`: adds the `:app:checkChartProjection` JavaExec task in the existing standalone-check style.

Diff stat: **5 files changed, 181 insertions(+), 33 deletions(-)**.

The root cause was confirmed by a failing regression: actual progress at today's point was 53, while the original projection started at 61 because the inclusive reading-day count added today's pace again. A separate red regression showed the original completion-date calculation extending the chart only to 07/10 when the corrected line completed on 08/10.

An attempted README update was removed before committing because the editing tool normalized its mixed line endings and created unrelated whitespace churn. README is unchanged; add focused documentation later only if appropriate, preserving its formatting.

## Verification actually executed

### Passed

From `reading-plan-android`, using the temporary build helper described below:

```bash
bash /tmp/books-chart-gradle.sh :app:checkChartProjection
```

Passed the expanded final checks covering the anchor, first completion matching its dd/mm label, completion beyond the original deadline, future rest days, today as a rest day, non-zero page offsets, audiobook units, absent/deleted-only reading history, completed books, and reading before the planned start.

```bash
bash /tmp/books-chart-gradle.sh :app:checkQuarterPlanning
```

Passed existing quarter checks, including four rollover boundaries, history, groups, audio, replacement.

```bash
bash /tmp/books-chart-gradle.sh :app:checkChartProjection :app:checkQuarterPlanning :app:assembleDebug :app:lintDebug
```

Both standalone checks and `:app:assembleDebug` passed. The combined invocation exited unsuccessfully because the later lint task failed (details below). After expanding the regression file, chart/quarter checks passed again in a subsequent invocation, which then stopped at the standard unit-test discovery failure. Production Java/view code was unchanged between the successful APK build and that expanded regression run.

The debug APK was produced at `reading-plan-android/app/build/outputs/apk/debug/app-debug.apk` (ignored build artifact, not committed or deployed).

```bash
git diff --check
git diff --cached --check
```

Both passed on the final intended changes before committing.

### Failed checks and baseline evidence

1. **Android lint**:

```bash
bash /tmp/books-chart-gradle.sh :app:lintDebug
bash /tmp/books-chart-gradle.sh -p /tmp/books-chart-baseline/reading-plan-android :app:lintDebug
```

Both changed code and an untouched baseline archive produced **7 errors and 39 warnings**. Comparing issue ID, severity, message, source line text, and relative file paths while ignoring moved line numbers showed **identical findings, no added findings**. Examples include the API-27 `windowLightNavigationBar` style with minSdk 26 and existing WrongConstant calls.

Reports:
- Current: `reading-plan-android/app/build/reports/lint-results-debug.xml`
- Baseline: `/tmp/books-chart-baseline/reading-plan-android/app/build/reports/lint-results-debug.xml`
- Full text reports: each app's `build/intermediates/lint_intermediate_text_report/debug/lintReportDebug/lint-results-debug.txt`

2. **Standard Android test discovery**:

```bash
bash /tmp/books-chart-gradle.sh :app:testDebugUnitTest
bash /tmp/books-chart-gradle.sh -p /tmp/books-chart-baseline/reading-plan-android :app:testDebugUnitTest
```

Both failed with: test sources present but no tests discovered. This repository uses standalone `main`/assertion checks, not a configured JUnit suite. Do not claim the standard unit-test task passed. The documented quarter task and new projection task did execute successfully.

3. **Desktop Python suite**:

The system Python 3.12 command `python3 -m unittest discover -v` first failed importing tkinter. A pre-existing managed Python with working Tk was then used:

```bash
xvfb-run -a /home/agent/.local/share/uv/python/cpython-3.11.16-linux-x86_64-gnu/bin/python3 -m unittest discover -v
xvfb-run -a /home/agent/.local/share/uv/python/cpython-3.11.16-linux-x86_64-gnu/bin/python3 -m unittest discover -s /tmp/books-chart-baseline -v
```

Both ran **64 tests**, with **2 failures and 1 error**:
- `test_remaining_plan_reflow_excludes_rest_days`: expected 2026-08-24, actual 2026-08-04.
- `test_session_target_starts_from_today_current_page`: expected 1003, actual 1000.
- `test_desktop_chart_filter_and_rollover_are_idempotent`: Tk 9 combobox `current()` raised `TclError: expected integer but got ""`.

The baseline archive was created from the exact baseline commit without a second Git repository or branch. Python files are untouched by this change. The user authorized leaving these unrelated failures unchanged.

## Temporary build kit on this machine

There was no Java or Android SDK initially. Official JDK/SDK archives were downloaded to `/tmp/books-chart-tools`, checksum-verified, and extracted there, without sudo, system installs, login-shell configuration changes, or service restarts.

- Java: `/tmp/books-chart-tools/jdk/jdk-21.0.12.1+1`
- Android SDK: `/tmp/books-chart-tools/sdk`
- Isolated Gradle cache: `/tmp/books-chart-tools/gradle`
- Android user home: `/tmp/books-chart-tools/android-home`
- AVD home: `/tmp/books-chart-tools/avd`
- Build helper: `/tmp/books-chart-gradle.sh`
- Download/extraction script: `/tmp/books-chart-bootstrap.py`
- Baseline sources/reports: `/tmp/books-chart-baseline`

The helper sets the necessary environment and invokes the repository Gradle wrapper with `-Pandroid.injected.sdk.dir=/tmp/books-chart-tools/sdk --no-daemon --max-workers=2`. It does not change the checked-in build configuration. The repository's ignored `local.properties` contains an invalid SDK directory in this runtime; Gradle warns about it but successfully uses the injected temporary SDK. Do not read private configuration/credentials or overwrite local.properties merely to remove that warning.

Temporary paths are not durable across machines or cleanup. On another machine, use an already configured JDK/SDK and the normal wrapper commands.

## Remaining work for the next agent

1. Check the checkpoint diff and **reproduce/fix the critical activity/calendar initialization bug above first**. Resume on the intended branch under the repository guardrails; this handoff documents the issue but does not fix it.
2. Perform **native Android UI verification**, especially narrow-phone legend visibility, projection toggle, switching books, rest-day plateaus, and the date matching where the curve first reaches completion. No screenshot of the changed UI has been captured, and no native chart flow has been exercised yet.
3. A software-only API-26 emulator was created as `books-chart` and eventually booted; KVM exists but this user lacks read/write permission. It was stopped at handoff to free resources. Do not assume it is running. A restart command, using the temporary SDK and both Android home variables above, is:

```bash
/tmp/books-chart-tools/sdk/emulator/emulator -avd books-chart -port 5560 -no-window -no-audio -no-boot-anim -no-snapshot -accel off -gpu swiftshader -cores 2 -memory 1536 -skin 720x1280
```

It took roughly 216 seconds to boot in software mode. Verify readiness via `adb -s emulator-5560 shell getprop sys.boot_completed` before installing/exercising the APK. No test instrumentation harness was created, and no real reading data was loaded into it.
4. Re-run chart/quarter/APK checks after any further changes; preserve the known baseline failure evidence. Do not describe the entire repository as green.
5. Review untested edge cases if relevant: chart data still inherits the existing handling of future-dated sessions and assumptions that current progress agrees with session history; very long forecasts may be costly; completed-book estimate currently shows today. These are **review targets, not confirmed new bugs**.
6. Late independent review results:
   - **Standards:** no hard violations or actionable smell suggestions reported. This review did not independently exercise the app and missed the initialization-order issue.
   - **Spec/correctness:** reported the critical activity/calendar initialization bug and the test-wiring gap documented above; otherwise found the requested anchor, forecast/date logic, and legend correct by inspection. Native rendering and clipping remain unverified.
   - Both reviews were read-only and reviewed the implementation while it was uncommitted on the initial task branch. The production code is unchanged in the pushed checkpoint. Full local transcripts, if still available: `/home/agent/.hermes/cache/delegation/live/deleg_62ffb2ba/task-0.log` and `task-1.log`. Treat review summaries as leads and verify against source/tests.
7. Send a real changed-chart screenshot through Telegram when UI verification is complete. Do not merge or deploy without explicit permission.

## Suggested skills

Load `implement`, `systematic-debugging`, `tdd`, `github-pr-workflow`, and `code-review` for continuation, respecting global guardrails over conflicting branch instructions in a skill. Load `developer-toolchain-bootstrap` if tooling setup is needed. The user confirmed the chart-data and rendered-chart test seams. Use `handoff` if producing another checkpoint.
