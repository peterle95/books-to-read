---
type: entrypoint
title: Books to Read code wiki
description: Navigation and task routing for the quarterly reading-plan desktop app, Android client, persistence contract, and validation workflows.
tags: [quickstart, navigation, repository]
---

# Books to Read code wiki

Books to Read plans physical books, digital books, and audiobooks across a quarterly period. The Python standard-library desktop app is the reference implementation; an Android app edits the same JSON document. Start with the [architecture overview](architecture/overview.md), then use the focused pages below.

## Map

- [Domain model](planning/model.md): entities, units, groups, invariants.
- [Scheduling](planning/scheduling.md): baseline and remaining calculations, rest days, overrides.
- [Progress](planning/progress.md): sessions, current positions, and date targets.
- [Desktop app](desktop/app.md): Tkinter composition, tabs, editing, and autosave.
- [JSON/CSV persistence](persistence/json.md): schema 8, migrations, identities, groups, and conflicts.
- [Android app](android/app.md): Java client, SAF lifecycle, build configuration, and parity boundary.
- [Metrics and reports](reporting/metrics.md): summaries, pace, charts, projections, and CSV reports.
- [Snapshots](snapshots/comparison.md): meaningful-state export and diff CLI.
- [Testing](testing/validation.md): narrow commands and unverified platform paths.
- [OpenWiki workflow](operations/workflow.md): automated documentation update behavior.

## Task routing

| Intent | Canonical page | Source entrypoints | Focused validation |
|---|---|---|---|
| Change schedule math | [Scheduling](planning/scheduling.md) | `build_plan`, `calculate_deadlines`, `build_remaining_section_plan` in `reading_plan.py` | `python3 -m unittest test_reading_plan.py` |
| Add/edit progress or sessions | [Progress](planning/progress.md) | `set_book_progress`, `add_reading_session`, `target_units_for_date` | targeted `test_reading_plan.py` session tests |
| Change JSON/CSV fields | [Persistence](persistence/json.md) | `book_to_json`, `book_from_json`, `load_json_plan`, `CsvSupport` | JSON/CSV tests, then Android build |
| Change desktop UI behavior | [Desktop](desktop/app.md) | `ReadingPlanApp`, `after_state_change`, `autosave_json` | Python tests; launch Tk manually |
| Change Android behavior | [Android](android/app.md) | `MainActivity`, `ReadingPlanScheduler`, `PlanPrimitives` | `gradlew.bat assembleDebug`; manual file lifecycle |
| Add a metric/chart/report | [Metrics](reporting/metrics.md) | `optional_summary_stat_rows`, `ReadingPlanChartData`, `ReadingPlanCsvReport` | Python tests plus Android manual inspection |
| Review plan changes | [Snapshots](snapshots/comparison.md) | `export_snapshot`, `differences`, `render_table` | `python3 export_reading_sessions.py` then compare |
| Validate a change | [Testing](testing/validation.md) | `test_reading_plan.py`, `test_plan_snapshot.py` | `python3 -m unittest test_reading_plan.py test_plan_snapshot.py` |

## Operating assumptions

The working files are `reading_plan.json` and `reading_plan_snapshot.json`; automatic metadata is intentionally excluded from snapshots. There is no server or external database. Preserve stable IDs and schema compatibility before changing collection or group behavior. Never place credentials in source, plans, snapshots, or wiki content.

## Backlog

No source-grounded repository area is deferred. Android behavioral coverage is an existing project limitation documented in [testing](testing/validation.md), not a documentation omission.
