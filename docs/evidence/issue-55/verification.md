# Issue 55 — Preserved Android build and native reference provenance

Verified on 2026-11-07 on Windows 11 build 26200 (Git Bash) with the repository's
own `reading-plan-android` project. No native production source, Gradle build
configuration, bundle schema or `reading_plan_data/` was changed. The working
tree had no changes under `reading-plan-android/` before or after this run.

This record covers a shell build and the project's JVM regression checks. It is
**not** an instrumentation, emulator or actual-device verification; those remain
#56. Build success is not substituted for device verification.

## Source identity

- Repository `HEAD` at run time: `ee0eecdac13e12a328bfb70c7d818ef70c9bb6b3`
  (`ee0eecd`, `fix(web): prevent book picker focus race`).
- Android project tree object: `6c38592a101fc6b738b6e3379cdd8744b41ccd6d`
  (`git rev-parse HEAD:reading-plan-android`).
- Last commit touching `reading-plan-android/`: `b91e312` (2026-11-03,
  `feat(android): show history-based reading projections`). All parity work
  recorded in #45–#54 is therefore newer than every native input.
  `git diff b91e312..HEAD -- reading-plan-android` is empty, and
  `git status --porcelain -- reading-plan-android` printed nothing.
- `native-sources.json` lists the 64 tracked build inputs this evidence covers
  (`app/src`, the Gradle files and the wrapper) with their SHA-256 values. It is
  a source manifest, not a manifest of generated output or of the whole
  repository.

The intended release source for this check is that tree object. The preserved
app is the current debug build of it; the reference used for parity (#45–#51) is
the same source snapshot, because no native source changed after `b91e312`.

## Toolchain and prerequisites

Discovered from `README.md` ("Build") and the Gradle files, then confirmed by
running them. No dependency, SDK component or JDK was installed for this check.

| Component | Value |
| --- | --- |
| Gradle wrapper | 9.4.1 (`gradle-wrapper.properties`, distribution sha256 pinned) |
| Android Gradle Plugin | 9.2.1 (`reading-plan-android/build.gradle`, resolved from the existing cache) |
| JVM | JetBrains Runtime 21.0.10 (`JAVA_HOME` = Android Studio `jbr`) |
| SDK | reader's local SDK via ignored `local.properties`; `platforms/android-35` present |
| compileSdk / minSdk / targetSdk | 35 / 26 / 35 |
| Version | `versionCode` 3, `versionName` 2.1 (confirmed by `aapt2 dump badging`) |

Documented commands: `gradle :app:assembleDebug` (README), and the Gradle
wrapper regression checks `:app:checkChartProjection` and
`:app:checkQuarterPlanning`. The project also registers
`:app:checkReadingSessions`, which was run as well. All runs used
`./gradlew --no-daemon` from `reading-plan-android/`.

## Build results

Before building, the existing artifact was copied out of the repository
(identifier `issue55-20261107-171944`) so its bytes could be compared with the
rebuild; `app/build/` is ignored output and was then replaced.

1. Incremental build
   `./gradlew --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest :app:checkChartProjection :app:checkQuarterPlanning :app:checkReadingSessions`
   → **BUILD SUCCESSFUL in 56s**, exit **0**, 3 tasks executed and 64 up to date.
   The APK-producing tasks were already up to date, and both artifacts stayed
   byte-identical to the preserved copies.
2. Clean build (same command with `clean` prepended) → **BUILD SUCCESSFUL in
   1m18s**, exit **0**, from 17:20:55 to 17:22:14 (+01:00).

| Artifact | Before rebuild | After clean rebuild | Size (after) |
| --- | --- | --- | --- |
| `app-debug.apk` | `cc26c206c0a954e76af7af9674c10c87b44d9048dbbcee6e835bfc2400807bb2` | `88c6e7e6e4e0239153f96cff089c5ba8991fb9d95dc0ea727364a60934404913` | 5,086,548 B |
| `app-debug-androidTest.apk` | `36bc6001b4bda5f47bd4851327ec5efd8c747d3ccbf7e19ebfb1fdd527f528f0` | `fa6f28af2b68e8df64974513b237638b03622aea6d79565768149dee4d340881` | 50,669 B |

The clean rebuild proves the committed source compiles and packages with this
toolchain. It is **not byte-reproducible**: identical tracked inputs, AGP,
Gradle, JDK and SDK produced a different SHA-256. The incremental run reported
the packaging tasks up to date, so the preserved `cc26c206…` artifact was built
from these inputs (or inputs Gradle considered equivalent) yet still differs
from the clean rebuild. A hash therefore identifies one artifact, not a source
snapshot, and cannot be used to authenticate a source revision. The likely
source of the difference (archive ordering, timestamps, debug signing) was not
isolated.

## Native checks

All three registered JVM regression checks ran in the clean build and exited 0:

- `:app:checkChartProjection` — "Chart projection checks passed: daily
  observations, deterministic 80% bands, learning, matching finish ranges, rest
  days, units, sparse/deleted/future history, bounded horizons, schedules."
- `:app:checkQuarterPlanning` — "Quarter rollover checks passed (four
  boundaries, history, groups, audio, replacement)."
- `:app:checkReadingSessions` — "Reading session chain checks passed
  (backdating, edit, rollback, deletion, audio)."

`:app:testDebugUnitTest` **failed** with exit 1 and this reason, quoted from the
run log:

> There are test sources present and no filters are applied, but the test task
> did not discover any tests to execute. This is likely due to a
> misconfiguration.

`app/src/test` contains the three `main()` check programs used by the tasks
above (`PlannedQuarterCheck`, `ReadingPlanChartCheck`,
`ReadingSessionsCheck`) and no JUnit tests; the project declares no test
dependency. The failure is a pre-existing test-configuration gap, not a source
regression, and was reported rather than fixed here: adding a test framework
would change the build beyond "verify without changing native functionality".
The supported native regression path is the three `check*` tasks.

## Device and instrumentation blocker

`adb devices` reported only `emulator-5554  offline`, the pre-existing stale
entry noted in #46/#47. No emulator was online and no physical device was
attached, so `ReadingPlanChartDeviceCheck` and `ReadingPlanSessionDeviceCheck`
could not be run and no instrumentation result is claimed. The reader's `pet`
AVD and the offline emulator were not started, installed to or modified, and no
APK was installed anywhere by this issue. Real-device installation, persistence
and offline workflow checks remain #56.

## Native reference provenance reconciliation

#53 flagged that `docs/evidence/issue-48/verification.md` gave the installed
APK as `ca7d6a15…` while `docs/evidence/issue-48/measurement.json` recorded
`cc26c206c0a954e76af7af9674c10c87b44d9048dbbcee6e835bfc2400807bb2`.

Findings:

- `git log --all -S ca7d6a15` matches only `8a572ef`, the commit that added the
  issue-48 evidence. No artifact, script or older record in the history
  produced that value, and no file in the working tree contains it besides that
  sentence.
- Three contemporaneous records agree on `cc26c206…`: issue-48
  `measurement.json`, `docs/evidence/issue-46/verification.md` and
  `docs/evidence/issue-47/verification.md`, the last two describing the same
  installed debug build.
- The artifact preserved before this rebuild has exactly that hash, and the
  incremental build left it unchanged.

Conclusion: the `ca7d6a15` prefix is an unsupported transcription error in the
issue-48 prose; `cc26c206…` is the APK identity of the #46–#48 captures. The
prose in `docs/evidence/issue-48/verification.md` now states the full hash and
cites this reconciliation instead of an abbreviated prefix.

Limits: the #46–#48 capture AVDs were disposable and have been deleted, so the
APKs actually installed there cannot be re-hashed. Their identity rests on the
preserved artifact plus the three independent records, not on a device-side
hash captured at the time. Because the build is not byte-reproducible, the
current clean artifact (`88c6e7e6…`) cannot be shown to equal the capture
artifact by rebuild either. No signing provenance, release build or supply-chain
attestation was checked.

## Effect on the parity reference

The parity reference is defined as the current Android build's source snapshot,
which is unchanged (`6c38592a…`, last source commit `b91e312`). Comparisons in
#45–#51 therefore do not need regeneration for this issue. Captures made from
now on should be labelled with the artifact hash they were actually installed
from (`88c6e7e6…` for the current clean build), not with a hash copied from an
earlier record.

## Retained results

Build logs, the pre-rebuild artifact copies and the post-build hashes were kept
outside the repository under the run identifier `issue55-20261107-171944`.
Machine-specific paths are deliberately not linked. This document, its
`native-sources.json` manifest and the corrected issue-48 sentence are the
tracked outputs of the run.
