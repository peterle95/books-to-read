# Android app implementation advisor report

## Executive recommendation

The Android app is a useful working companion, but its next investment should be reliability and seam creation rather than new features. Keep the native Java/Gradle app and the shared `reading_plan.json` contract, then make a narrow modular-monolith refactor:

1. Extract JSON/CSV parsing and serialization into a pure `ReadingPlanCodec` module.
2. Extract plan/domain calculations and validation into a pure `ReadingPlan` module.
3. Put file access behind a small `DocumentStore` adapter with explicit permission and atomic-write behavior.
4. Leave UI rendering in `MainActivity` initially, but make it call those seams.
5. Add contract tests against fixtures shared with the desktop program, followed by a small Android smoke suite.

This is the smallest coherent change that reduces the current 3,031-line activity's risk without committing to a rewrite or a premature framework migration.

## Scope and assumptions

- Target repository: `C:\Users\molze\GitHub\books-to-read`.
- Target subsystem: `C:\Users\molze\GitHub\books-to-read\reading-plan-android`.
- Review question interpreted as: “review the whole Android app and advise what to improve.”
- No source implementation was requested; this report is read-only advice.
- The desktop Python program and Android app are expected to preserve schema version 4 compatibility.

## Repository map

| Area | Evidence | Assessment |
|---|---|---|
| App entry/UI | `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/MainActivity.java:106-195` | One activity builds the entire view tree programmatically and owns navigation, state, domain rules, persistence, JSON, and CSV. |
| Build | `reading-plan-android/app/build.gradle:1-20` | Android plugin 9.2.1, compile/target SDK 35, min SDK 26, Java 17; no dependencies or test configuration are declared. |
| Manifest | `reading-plan-android/app/src/main/AndroidManifest.xml:1-13` | Single exported launcher activity; no network permission is present, which is appropriate for local-file sync. |
| Persistence | `MainActivity.java:1148-1276` | Storage Access Framework URI is remembered in preferences; reads and writes happen directly through the activity. |
| Data contract | `MainActivity.java:1294-1555` and `reading-plan-android/README.md` | JSON schema version 4, three format sections, sessions, stats, and simultaneous groups are supported. |
| Tests | `reading-plan-android` file inventory | No `src/test` or `src/androidTest` files were found. |

## Concrete findings

### High priority: autosave can destroy the only readable copy

`writeText` opens the selected document with mode `"wt"` (`MainActivity.java:1268-1275`), which truncates before the new JSON is fully written. Every state change calls autosave (`1108-1112`, `1235-1249`). A provider failure, process death, storage interruption, or partial write can therefore leave the Syncthing document empty or corrupt. This is especially important because the app's primary data is an external shared file.

Advice: write a complete temporary sibling document where the provider supports it, or maintain a local backup/last-known-good copy and verify the serialized result before replacing the target. At minimum, add a “last successful save” state and recovery action rather than only a red indicator.

### High priority: external-file concurrency is knowingly unsafe

The README asks users not to edit both devices simultaneously, while the app performs unconditional read-modify-write saves. There is no content hash, modification token, conflict check, or merge/recovery path (`README.md`, `1218-1249`). Syncthing can legitimately deliver a newer desktop version between Android's load and save, causing a lost update.

Advice: store the loaded file fingerprint (or provider metadata where available), re-read before save, and present a conflict dialog with “reload,” “keep local,” and an exported backup. Keep the current warning, but treat it as a fallback rather than the consistency mechanism.

### High priority: domain and serialization behavior are not independently testable

The activity contains UI construction, mutable state, calculations, validation, JSON compatibility logic, CSV parsing, and file I/O. For example, JSON load begins at `1294`, book/session compatibility handling spans `1446-1555`, and CSV parsing is later in the same file. The absence of tests means changes to schema conversion or page/time arithmetic can only be checked manually.

Advice: extract pure codecs and domain calculations first. Do not split by arbitrary screen; split around the stable JSON/CSV contract and reading-plan rules.

### Medium priority: lifecycle/state restoration is fragile

State is held in activity fields (`MainActivity.java:86-104`) and initialized in `onCreate` (`107-114`). There is no visible `onSaveInstanceState`, ViewModel, or saved-state restoration. Rotation, process recreation, or multi-window recreation can discard an in-memory unsaved plan or return the user to the initial tab/date state.

Advice: make the domain state serializable, persist pending edits before leaving, restore selected tab/book and draft inputs, and define what happens when the saved URI permission is revoked.

### Medium priority: file permission failures are hidden

The app requests persistable URI permission but silently ignores `SecurityException` (`1189-1198`). It then stores the URI and attempts future loads. The user is not told that the permission may not survive restart.

Advice: check the returned grant flags, report inability to persist access, and provide a reconnect action. Distinguish “file missing,” “permission revoked,” “invalid JSON,” and “write failed.”

### Medium priority: user feedback is too weak for destructive/data-critical actions

`setStatus` is intentionally empty (`1114-1116`), while errors are transient Toasts (`1118-1119`). The JSON button only communicates loaded/not-loaded (`1088-1096`). For autosave and import/export, users need to know whether data was preserved and what action recovers it.

Advice: add an in-screen status area or accessible snackbar/banner with timestamp, save state, and recovery action. Use precise messages that identify the affected operation and whether the previous file remains safe.

### Medium priority: UI accessibility and maintainability need a pass

The entire UI is created in code, with hand-set colors, text sizes, and dimensions (`116-210`). Only the settings image button has an explicit content description (`156-162`); semantic labels, scalable typography, dark theme behavior, and localization are difficult to audit in this shape.

Advice: move stable layout/style resources into XML incrementally, centralize strings/colors/dimensions, support font scaling and dark mode, and add content descriptions/state announcements for important controls.

### Lower priority: legacy Activity result API and deprecated inset API

File picking uses `startActivityForResult`/`onActivityResult` (`1159-1216`) and window inset handling calls `getSystemWindowInsetTop/Bottom` (`189-194`). These are not immediate blockers, but they increase future maintenance cost.

Advice: migrate file operations to the Activity Result APIs and modern `WindowInsetsCompat` during the persistence seam work.

## Vault guidance consulted

- `C:\Users\molze\GitHub\Obsidian\AI\wiki\topics\codebase-architecture-and-refactoring.md`, “Key Points” and “Practical Review Questions”: prefer boundaries around domain behavior and change patterns; establish a behavioral harness before restructuring; avoid abstractions that merely rename complexity.
- `C:\Users\molze\GitHub\Obsidian\AI\wiki\topics\frontend-testing-strategy.md`, “Key Points”: test stable schemas and domain behavior, with a small number of critical user flows.
- `C:\Users\molze\GitHub\Obsidian\AI\wiki\topics\error-message-design.md`, “Small-Project Checklist”: explain what failed, whether data was saved, and the next recovery action.
- `C:\Users\molze\GitHub\Obsidian\AI\agents\review-runtime.md`, “Concurrency and consistency”: check lost updates, non-atomic read-modify-write, partial state, and lifecycle cleanup.
- `C:\Users\molze\GitHub\Obsidian\AI\agents\review-tests.md`, “Behavior-to-test map”: cover success, boundaries, failure, serialization compatibility, and persistence behavior at the smallest reliable test level.

These notes are guidance, not repository requirements. They align with the app's concrete issues around file persistence, schema conversion, and the oversized activity.

## Candidate approaches

| Approach | Fit | Effort/risk | Recommendation |
|---|---|---|---|
| Rewrite in Jetpack Compose/Kotlin with ViewModel and Room | Modern long-term shape, but changes language, UI toolkit, and persistence model simultaneously | High effort; high regression and schema risk; hard to validate without tests | Reject for now |
| Keep one activity and add tests/helpers only | Lowest immediate change and can stabilize behavior | Tests remain awkward; file/domain concerns stay coupled; future changes still costly | Useful short-term bridge |
| Extract domain/codec/document seams while keeping current UI | Preserves current app and schema, creates pure test boundaries, enables later UI migration | Moderate effort; requires careful fixture-based regression coverage | Recommended |

## Phased implementation plan

### Phase 1: establish the behavioral harness

- Add JSON fixtures representing desktop output, Android output, old-compatible fields, empty sections, audiobook sessions, and simultaneous groups.
- Add JVM unit tests for round-trip normalization, invalid ranges, dates, audiobook durations, CSV import/export, and group validation.
- Add a fixture comparison test so Android changes cannot silently drop fields used by the desktop app.

### Phase 2: extract stable seams

- `ReadingPlan` / `Book` / `ReadingSession`: domain state and calculations.
- `ReadingPlanCodec`: JSON and CSV parsing/serialization, with explicit schema-version policy.
- `DocumentStore`: read, write, permission status, fingerprint/backup behavior.
- Keep `MainActivity` as an orchestration/rendering layer and preserve the existing UI while tests stabilize.

### Phase 3: make persistence safe

- Add last-known-good local backup.
- Detect external changes before overwrite where the Storage Access Framework/provider permits it.
- Define conflict UX and recovery paths.
- Replace direct truncating writes with a safer replacement/backup strategy.
- Move file picker handling to Activity Result APIs.

### Phase 4: improve product quality

- Add Android smoke tests for connect, reload, add session, edit book, import CSV, export CSV, and restart.
- Add persistent save status and actionable errors.
- Centralize resources and complete accessibility/dark-mode/font-scaling checks.
- Only then consider Kotlin/Compose migration, if the product needs it.

## Validation commands

From `C:\Users\molze\GitHub\books-to-read\reading-plan-android`:

```powershell
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:test
.\gradlew.bat :app:connectedDebugAndroidTest
```

The build could not be executed in this review because the environment has no `JAVA_HOME` and no `java` executable on `PATH`.

## Open questions

- Is Syncthing the only persistence/sync path, or should the app eventually own synchronization?
- Must Android preserve unknown JSON fields, or is schema 4 a fully closed contract?
- What Android devices/API levels and screen orientations are supported in practice?
- Is data loss prevention more important than rapid feature delivery? The current external-file design makes this the central product risk.

## Bottom line

The app does not need a wholesale rewrite. Its best next step is to protect the shared file contract and make the domain/persistence behavior testable. Once those seams exist, UI modernization becomes optional and reversible; before then, adding features inside the activity will increase the cost and risk of every future change.
