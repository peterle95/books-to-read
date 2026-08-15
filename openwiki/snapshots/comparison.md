---
type: command-line workflow
title: Reading-plan snapshots and comparison
description: Export user-meaningful plan snapshots and report additions, removals, and changes with stable identity-aware diffs.
tags: [snapshots, cli, comparison]
---

# Reading-plan snapshots and comparison

`python3 export_reading_sessions.py` loads `reading_plan.json`, validates that it is an object, removes automatic fields (`revision`, `last_modified`, `modified_by`), and writes sorted, indented `reading_plan_snapshot.json`. `python3 compare_reading_sessions.py` compares that snapshot with the current plan and exits 0 when equal, 1 when differences or an input error occur.

`differences` recursively compares dictionaries, scalar values, and lists. Lists containing `id` are matched by stable identity, so reorder does not look like deletion/addition; unkeyed lists are compared by position. Each result records Added/Changed/Missing, path, before/now values, section, and book. `render_table` labels fields, formats audiobook seconds, shortens columns, and applies terminal colors only when stdout is a TTY.

The scripts intentionally ignore sync metadata but detect plan dates, progress, sessions, groups, schedules, and settings. A newly persisted field is meaningful by default: add it to `AUTOMATIC_FIELDS` only when it is generated transport/sync metadata whose value must not represent user intent; otherwise `meaningful_plan` retains it and `differences` reports it deterministically. If it needs human wording or unit conversion, extend `FIELD_LABELS`/`TIME_FIELDS` and add a focused snapshot test. `test_plan_snapshot.py` proves export filtering, metadata immunity, missing sessions, book context, duration formatting, and table colors. The snapshot schema depends on [JSON persistence](../persistence/json.md).
