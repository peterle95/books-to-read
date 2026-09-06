---
type: validation guide
title: Testing and validation
description: Test inventory, narrow commands, four-file persistence contract checks, and known Android validation gaps.
tags: [testing, validation, compatibility]
---

# Testing and validation

The primary automated suite is `test_reading_plan.py`, a standard-library `unittest` suite covering domain validation, units, rest days, baseline schedules, overrides, simultaneous groups, sessions, the version-1 bundle, legacy migration, checksums, metadata/conflict detection, CSV behavior, and GUI calculation helpers. `test_plan_snapshot.py` covers snapshot export and identity-aware diff rendering.

Run the narrow full check with `python3 -m unittest test_reading_plan.py test_plan_snapshot.py`; run a single class or test via unittest discovery when iterating. Bundle persistence tests should be the first check for changes to `plan.json`, `books.json`, `sessions.json`, `manifest.json`, migration, or conflict handling. Launch validation is separate: `python3 reading_plan_gui.py` requires a desktop Tk environment. Snapshot commands are manually useful against a copy of a plan: export, then compare.

Android has no test source under `reading-plan-android/app/src`. Gradle compilation (`./gradlew :app:assembleDebug`, or `gradlew.bat :app:assembleDebug` on Windows) validates Java compilation and packaging but not behavior. Shared bundle/CSV compatibility is indirectly covered by Python schema assertions; Android codec parsing, scheduler parity, URI permissions, malformed-document handling, CSV edge cases, external conflicts, debounced/lifecycle saves, and chart/report output remain manual or unverified failure paths. Build on an environment with SDK 35 and Java 17; do not treat a successful Python suite as Android UI coverage.

When changing a schema or algorithm, update the Python contract tests first, inspect corresponding Android classes (`ReadingPlanBundleCodec`, `ReadingPlanDataStore`, `BookModels`, `ReadingPlanScheduler`, `CsvSupport`, `MainActivity`), then build the Android app and manually exercise load/edit/save/reopen and conflict flows. See [persistence](../persistence/json.md) and [Android](../android/app.md).

## Change navigation

Use `BundlePersistenceTests` for file separation, manifest/checksum, range, migration, and external-change behavior; use the existing schedule/session/GUI helper test classes for domain and presentation changes. The minimal repository-wide check is `python3 -m unittest test_reading_plan.py test_plan_snapshot.py`; Android build and manual checks are conditional on touching Android or the shared cross-client contract.