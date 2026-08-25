---
type: application guide
title: Python desktop application
description: Tkinter entrypoint, tabs, autosave, editing surfaces, and composition around the shared planner.
tags: [desktop, tkinter, application]
---

# Python desktop application

Run `python3 reading_plan_gui.py`. `ReadingPlanApp` opens `reading_plan.json` by default, initializes the next-quarter dates, loads or creates the three sections, and builds Session, Plan, Books, and Charts tabs. The GUI imports domain operations rather than duplicating scheduling rules.

The Session tab records progress and shows date targets; Plan renders `SectionPlan` rows and summary values; Books edits ranges, order, groups, and overrides; Settings manages dates, rest ranges, JSON/CSV selection, and statistics. Handlers such as `add_session`, `delete_session`, `add_book`, `replace_selected_book`, `delete_selected_book`, `move_selected_book`, and `apply_groups` funnel through `after_book_edit`/`after_state_change`, which validates, remaps one-based group memberships and selections, recalculates only when appropriate, refreshes all views, and schedules persistence. Invalid dialog input is rejected with a message without committing partial state. Autosave is delayed and guarded by loaded `JsonPlanMetadata`; `_check_for_external_change` and `ensure_json_plan_unchanged` surface stale revision/hash or file errors instead of overwriting another client, while close/pause paths flush pending saves. CSV import/export delegates to the core converters.

Presentation-specific helpers include `rounded_up_page_target`, `target_units_for_date`, `book_columns`, and `plan_columns`. The UI distinguishes page sections from audiobooks with `is_audiobook_section`, formatting durations instead of pages. Core schedule semantics belong in [scheduling](../planning/scheduling.md), not in widgets.

Focused tests import `ReadingPlanApp` helpers from `test_reading_plan.py`; broader behavior is covered by the core tests. Tk availability is required for actually launching the GUI. See [metrics and reporting](../reporting/metrics.md) for the reporting surface and [persistence](../persistence/json.md) for file contracts.
