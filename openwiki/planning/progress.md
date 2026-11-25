---
type: workflow guide
title: Progress and reading sessions
description: How page/time progress, history entries, and date-specific targets flow through the planner.
tags: [progress, sessions, planning]
---

# Progress and reading sessions

`set_book_progress` updates the current page or audiobook position, while `add_reading_session` records the resulting position and derived work. A legacy/current position is monotonic: adding an older session cannot reduce the book's current page/time; derived progress is clamped to the inclusive range and recomputed from the current position. `remove_reading_session` marks/removes the selected history item and restores/recomputes the position according to the remaining sessions; `merge_reading_sessions` consolidates compatible entries without losing total progress. Session IDs, dates, and deleted state survive JSON round trips, and legacy plans migrate old session/current fields without dropping history. The GUI's Session tab selects a book, records page/time-left progress, and refreshes plan views.

The displayed current required pace is computed from remaining work and available dates, not written into the baseline. `target_units_for_date` in `reading_plan_gui.py` reads each book's persisted `BaselineSchedule`, so a simultaneous proportional target or deadline override remains stable in the session UI. Rest days produce no target. Completed books return their total/completed endpoint rather than new work.

History is grouped by date in `ReadingSessionEntries`; Android has the parallel `ReadingSessionEntries.java` and session view. The JSON model preserves session IDs and soft deletion. See [domain model](model.md) and [JSON persistence](../persistence/json.md). Tests in `test_reading_plan.py` assert progress, session additions/removals, audiobook conversions, and target behavior.
