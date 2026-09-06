---
type: application guide
title: Python desktop application
description: Tkinter entrypoint, four-file bundle loading, autosave, editing surfaces, and composition around the shared planner.
tags: [desktop, tkinter, application]
---

# Python desktop application

Run `python3 reading_plan_gui.py`. `ReadingPlanApp` uses `reading_plan_data/` as its default data directory, imports a legacy `reading_plan.json` there when no bundle exists, initializes next-quarter dates for a new plan, and builds Session, Plan, Books, Charts, and Settings surfaces. The GUI imports domain operations rather than duplicating scheduling rules.

The Session tab records progress and shows date targets; Plan renders `SectionPlan` rows and summary values; Books edits ranges, order, groups, and overrides; Settings manages dates, rest ranges, the data-directory choice, CSV interchange, and statistics. `_load_directory` only attempts legacy import when bundle files are absent. `load_plan_from_json` reads and validates bundle metadata before applying state, and invalid or incomplete data clears the loaded state and disables plan tabs instead of allowing partial edits.

Handlers such as `add_session`, `delete_session`, `add_book`, `replace_selected_book`, `delete_selected_book`, `move_selected_book`, and `apply_groups` funnel through `after_book_edit`/`after_state_change`, which validates, remaps one-based group memberships and selections, recalculates when appropriate, refreshes views, and schedules persistence. Autosave is delayed and guarded by `loaded_metadata`; `_check_for_external_change` and `ensure_json_bundle_unchanged` detect revision, manifest, or file-hash changes rather than overwriting another client. Close and pause paths flush pending saves. CSV import/export delegates to the core converters.

Presentation-specific helpers include `rounded_up_page_target`, `target_units_for_date`, `book_columns`, and `plan_columns`. The UI distinguishes page sections from audiobooks with `is_audiobook_section`, formatting durations instead of pages. Core schedule semantics belong in [scheduling](../planning/scheduling.md), while the four-file contract and migration rules belong in [persistence](../persistence/json.md).

## Change navigation

Consult this page for Tk layout, dialogs, load/error behavior, autosave, or desktop editing changes. Start at `ReadingPlanApp._load_directory`, `load_plan_from_json`, `after_state_change`, and the save handlers in `reading_plan_gui.py`; use GUI helper tests in `test_reading_plan.py` and the bundle tests for persistence boundaries. Minimal validation is `python3 -m unittest test_reading_plan.py`; launching `python3 reading_plan_gui.py` is conditional on a Tk desktop environment.