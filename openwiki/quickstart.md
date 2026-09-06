---
type: entrypoint
title: Books to Read code wiki
description: Navigation and task routing for the quarterly reading-plan desktop app, Android client, persistence contract, and validation workflows.
tags: [quickstart, navigation, repository]
---

# Books to Read code wiki

Books to Read plans physical books, digital books, and audiobooks across a quarterly period. The Python standard-library desktop app is the reference implementation; an Android app edits the same version-1 four-file JSON bundle in `reading_plan_data/`. Start with the [architecture overview](architecture/overview.md), then use the focused pages below.

## Map

- [Domain model](planning/model.md): entities, units, groups, invariants.
- [Scheduling](planning/scheduling.md): baseline and remaining calculations, rest days, overrides.
- [Progress](planning/progress.md): sessions, current positions, and date targets.
- [Desktop app](desktop/app.md): Tkinter composition, tabs, editing, and autosave.
- [JSON/CSV persistence](persistence/json.md): version-1 bundle, migration, identities, groups, checksums, and conflicts.
- [Android app](android/app.md): Java client, SAF lifecycle, build configuration, and parity boundary.
- [Metrics and reports](reporting/metrics.md): summaries, pace, charts, projections, and CSV reports.
- [Snapshots](snapshots/comparison.md): meaningful-state export and diff CLI.
- [Testing](testing/validation.md): narrow commands and unverified platform paths.
- [OpenWiki workflow](operations/workflow.md): automated documentation update behavior.

## Task routing

| Change area or user intent | Relevant wiki page | Exact source entry points | Important symbols or types | Focused tests | Minimal validation command |
|---|---|---|---|---|---|
| Change schedule math | [Scheduling](planning/scheduling.md) | `reading_plan.py` | `build_plan`, `calculate_deadlines`, `build_remaining_section_plan` | schedule, rest-day, override tests in `test_reading_plan.py` | `python3 -m unittest test_reading_plan.py` |
| Add/edit progress or sessions | [Progress](planning/progress.md) | `reading_plan.py`, `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/MainActivity.java` | `set_book_progress`, `add_reading_session`, `target_units_for_date`, `ReadingSessionEntries` | session and progress tests in `test_reading_plan.py` | `python3 -m unittest test_reading_plan.py` |
| Change JSON/CSV fields | [Persistence](persistence/json.md) | `reading_plan.py`, `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/ReadingPlanBundleCodec.java`, `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/ReadingPlanDataStore.java` | `write_json_bundle`, `load_json_bundle`, `ReadingPlanBundleCodec`, `ReadingPlanDataStore`, `CsvSupport` | `BundlePersistenceTests` and schema, migration, CSV, metadata tests in `test_reading_plan.py` | `python3 -m unittest test_reading_plan.py` |
| Change desktop UI behavior | [Desktop](desktop/app.md) | `reading_plan_gui.py` | `ReadingPlanApp`, `_load_directory`, `load_plan_from_json`, `after_state_change` | GUI helper tests in `test_reading_plan.py` | `python3 -m unittest test_reading_plan.py` |
| Change Android behavior | [Android](android/app.md) | `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/MainActivity.java`, `ReadingPlanDataStore.java`, `ReadingPlanBundleCodec.java` | `MainActivity`, `ReadingPlanDataStore`, `ReadingPlanBundleCodec`, `ReadingPlanScheduler` | no Android test sources; manual lifecycle checks | `(cd reading-plan-android && ./gradlew :app:assembleDebug)` |
| Add a metric/chart/report | [Metrics](reporting/metrics.md) | `reading_plan.py`, `reading-plan-android/app/src/main/java/com/petermolnar/readingplan/ReadingPlanChartData.java` | `optional_summary_stat_rows`, `ReadingPlanChartData`, `ReadingPlanCsvReport` | summary/chart/report tests where applicable | `python3 -m unittest test_reading_plan.py` |
| Review plan changes | [Snapshots](snapshots/comparison.md) | `export_reading_sessions.py`, `compare_reading_sessions.py` | `export_snapshot`, `differences`, `render_table` | `test_plan_snapshot.py` | `python3 -m unittest test_plan_snapshot.py` |
| Validate a change | [Testing](testing/validation.md) | `test_reading_plan.py`, `test_plan_snapshot.py` | standard-library `unittest` suites | both Python suites | `python3 -m unittest test_reading_plan.py test_plan_snapshot.py` |

## Operating assumptions

The working data is the `reading_plan_data/` bundle (`plan.json`, `books.json`, `sessions.json`, `manifest.json`); `reading_plan_snapshot.json` excludes automatic metadata. A legacy `reading_plan.json` is imported without being changed when no bundle exists. There is no server or external database. Preserve stable IDs, checksums, and schema compatibility before changing collection or group behavior. Never place credentials in source, plans, snapshots, or wiki content.

## Backlog

No source-grounded repository area is deferred. Android behavioral coverage is an existing project limitation documented in [testing](testing/validation.md), not a documentation omission.
