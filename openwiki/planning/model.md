---
type: domain model
title: Reading-plan domain model
description: Core entities, units, relationships, and invariants used by all planning calculations.
tags: [planning, domain-model, sessions]
---

# Reading-plan domain model

`BookSection` owns one ordered stream: `Physical books`, `Digital books`, or `Audiobooks`. A `Book` has a stable `id`, display number/title, an inclusive page range or `HH:MM`-derived time range, progress, sessions, and optional persisted schedule/overrides. Pages are inclusive (`end_page - start_page + 1`); audiobook work is seconds. `ReadingSession` records date, resulting position, work completed, stable ID, and soft-deletion state.

`BaselineSchedule` is the persisted commitment (`start_date`, `deadline`, `daily_target`). `BookDeadline` is a calculated presentation row; `SectionPlan` aggregates rows, total work, daily pace, required current pace, and status. `RestDayRange` is inclusive and normalized by sorting and merging touching/overlapping ranges. `SummaryStatsOptions` controls optional report rows.

A simultaneous group stores consecutive one-based book numbers. Group members share schedule dates while daily work is divided by remaining units. Overrides detach only the affected member; `active_simultaneous_groups` excludes books with either override. Add/delete operations renumber and remap groups, and validation rejects invalid, non-consecutive, duplicate, or unknown memberships.

Validation rejects reversed ranges, invalid durations, deadline overrides before today or beyond the plan end, and start overrides after deadlines. Progress is clamped to the book range; remaining work never becomes negative. Python parses dates as `%Y-%m-%d`; Android's `PlanPrimitives.parseDate` must accept the same ISO form and reject malformed dates. Python `parse_duration`/`format_duration`, page-range validation, and display rounding have Android counterparts in `PlanPrimitives`; stored audiobook units remain seconds while page display targets round up only for presentation. There are no dedicated parity tests, so changes require Python contract tests, Android build, and manual cross-client load/edit/export checks. Terminology and the distinction between baseline and current required pace are defined in `CONTEXT.md`.

Focused evidence is in `test_reading_plan.py` for page/audio units, rest days, groups, overrides, sessions, and invalid inputs. Scheduling behavior is detailed in [scheduling](scheduling.md); progress lifecycle is in [progress](progress.md).
