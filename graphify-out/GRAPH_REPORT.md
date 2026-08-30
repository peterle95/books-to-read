# Graph Report - books-to-read  (2026-08-30)

## Corpus Check
- 89 files · ~246,923 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 822 nodes · 2751 edges · 51 communities (37 shown, 14 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 425 edges (avg confidence: 0.83)
- Token cost: 2,400 input · 950 output

## Community Hubs (Navigation)
- Core Reading Plan Logic
- UI Frame & Layout
- Android Framework Types
- Android UI Widgets
- Section Planning & CSV
- Page Counting & Deadlines
- Documentation & ADRs
- JSON Persistence & Plans
- Baseline Schedule & CSV
- Book Collections & Groups
- Reading Session Management
- Calendar & Date Handling
- Chart & Progress Display
- Data Models & Primitives
- Testing & Validation
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 48

## God Nodes (most connected - your core abstractions)
1. `MainActivity` - 162 edges
2. `ReadingPlanApp` - 81 edges
3. `Book` - 71 edges
4. `Book` - 68 edges
5. `BookSection` - 47 edges
6. `RestDayRange` - 46 edges
7. `BookSection` - 45 edges
8. `calculate_baseline_schedules()` - 38 edges
9. `is_audiobook_section()` - 33 edges
10. `apply_deadline_override()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `ReadingPlanCodec` --extracts_from--> `JSON persistence schema 8`  [INFERRED]
  outputs/repo-implementation-advisor-report.md → openwiki/persistence/json.md
- `ReadingPlan module` --extracts_from--> `Reading-plan domain model`  [INFERRED]
  outputs/repo-implementation-advisor-report.md → openwiki/planning/model.md
- `ReadingPlanApp` --uses--> `JsonPlanMetadata`  [INFERRED]
  reading_plan_gui.py → reading_plan.py
- `SyncPersistenceTests` --uses--> `ExternalPlanChangeError`  [INFERRED]
  test_reading_plan.py → reading_plan.py
- `ReadingPlanApp` --uses--> `RestDayRange`  [INFERRED]
  reading_plan_gui.py → reading_plan.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Both clients share JSON persistence** — openwiki_desktop_app, openwiki_android_app, openwiki_persistence_json [EXTRACTED 1.00]
- **Calculation model governs schedule semantics** — docs_adr_001_calculation_model, docs_context_baseline_schedule, docs_context_deadline_override, docs_context_simultaneous_group, docs_context_independent_schedule [EXTRACTED 1.00]
- **Reading plan domain vocabulary** — docs_context_reading_plan, docs_context_baseline_schedule, docs_context_current_required_pace, docs_context_reading_day, docs_context_rest_day, docs_context_deadline_override, docs_context_simultaneous_group, docs_context_independent_schedule [EXTRACTED 1.00]
- **Cross-client persistence contract** — openwiki_persistence_json_json_persistence, openwiki_testing_validation_book_models, openwiki_testing_validation_csv_support, openwiki_quickstart_reading_plan_json [EXTRACTED 1.00]
- **Schedule calculation pipeline** — openwiki_planning_scheduling_build_section_plans, openwiki_planning_scheduling_available_reading_days, openwiki_planning_scheduling_calculate_deadlines, openwiki_planning_scheduling_build_plan, openwiki_planning_scheduling_calculate_baseline_schedules [EXTRACTED 1.00]
- **Recommended Android refactor seams** — outputs_repo_implementation_advisor_report_reading_plan_codec, outputs_repo_implementation_advisor_report_reading_plan_module, outputs_repo_implementation_advisor_report_document_store, openwiki_testing_validation_main_activity [EXTRACTED 1.00]

## Communities (51 total, 14 thin omitted)

### Community 0 - "Core Reading Plan Logic"
Cohesion: 0.06
Nodes (116): active_simultaneous_groups(), add_months(), add_reading_session(), apply_deadline_override(), apply_persisted_deadline_overrides(), apply_start_date_override(), _atomic_write_json(), available_reading_days() (+108 more)

### Community 1 - "UI Frame & Layout"
Cohesion: 0.08
Nodes (15): Frame, ExternalPlanChangeError, blank_sections(), end_name_for_label(), groups_to_text(), main(), Book, BookSection (+7 more)

### Community 2 - "Android Framework Types"
Cohesion: 0.09
Nodes (10): android.net.Uri, android.os.Bundle, FrameLayout, JSONArray, JSONObject, BookSection, Button, LinearLayout (+2 more)

### Community 3 - "Android UI Widgets"
Cohesion: 0.15
Nodes (9): android.graphics.drawable.GradientDrawable, android.widget.Button, android.widget.LinearLayout, ReadingPlanSessionView, Button, GradientDrawable, LinearLayout, OnClickListener (+1 more)

### Community 4 - "Section Planning & CSV"
Cohesion: 0.12
Nodes (7): android.widget.HorizontalScrollView, PlanSummary, SectionPlan, ReadingPlanCsvReport, HorizontalScrollView, TableLayout, ReadingPlanTables

### Community 5 - "Page Counting & Deadlines"
Cohesion: 0.13
Nodes (5): PageCounter, ReadingPlanCalendar, BookDeadline, SectionPlan, ReadingPlanScheduler

### Community 6 - "Documentation & ADRs"
Cohesion: 0.09
Nodes (28): Persist quarterly baseline schedules, Calculation model for baseline schedules and deadline overrides, Domain docs, Issue tracker, Triage labels, Baseline schedule, Current required pace, Day group (+20 more)

### Community 7 - "JSON Persistence & Plans"
Cohesion: 0.16
Nodes (4): BookDeadline, ReadingPlanChartData, ReadingPlanChartsView, ReadingPlanTargets

### Community 8 - "Baseline Schedule & CSV"
Cohesion: 0.12
Nodes (5): BaselineSchedule, CsvSupport, RestDayRange, Book, PlanPrimitives

### Community 9 - "Book Collections & Groups"
Cohesion: 0.13
Nodes (4): BookCollections, Book, ParseTableResult, ReadingPlanBookProgress

### Community 10 - "Reading Session Management"
Cohesion: 0.16
Nodes (3): BookSection, ScrollView, ReadingPlanBooksView

### Community 11 - "Calendar & Date Handling"
Cohesion: 0.12
Nodes (9): android.app.Activity, android.content.Intent, android.os.Handler, android.widget.EditText, android.widget.FrameLayout, android.widget.ScrollView, ScrollView, ReadingPlanMetricsView (+1 more)

### Community 12 - "Chart & Progress Display"
Cohesion: 0.16
Nodes (9): android.app.Dialog, android.view.View, android.widget.Spinner, Dialog, OnClickListener, ScrollView, Spinner, Dialog (+1 more)

### Community 13 - "Data Models & Primitives"
Cohesion: 0.22
Nodes (14): difference(), differences(), field_label(), format_duration(), format_value(), list_key(), main(), render_table() (+6 more)

### Community 14 - "Testing & Validation"
Cohesion: 0.20
Nodes (4): ReadingSession, SessionEntry, ReadingSession, ReadingSessionEntries

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (8): org.json.JSONArray, org.json.JSONObject, RestDayRange, BookSection, RestDayRange, CsvPlan, SessionTarget, StatsOptions

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (4): android.widget.TextView, Intent, ScrollView, TextView

### Community 17 - "Community 17"
Cohesion: 0.23
Nodes (7): android.graphics.Canvas, android.graphics.DashPathEffect, android.graphics.Paint, DashPathEffect, Paint, Override, ReadingPlanChartView

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (7): AdapterView, android.text.Editable, android.text.TextWatcher, OnItemSelectedListener, Override, SimpleItemSelectedListener, SimpleTextWatcher

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (14): BaselineSchedule, Book, BookSection, Reading-plan domain model, ReadingSession, SimultaneousGroup, add_reading_session, merge_reading_sessions (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.19
Nodes (4): android.widget.CheckBox, ScrollView, ReadingPlanPlanView, CheckBox

### Community 21 - "Community 21"
Cohesion: 0.28
Nodes (9): byun chul, camus, capital, changing order, Current page metric, Daily pages metric, Reading Progress Tracker, Reading Tracker Table Screenshot (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (9): test_plan_snapshot.py, test_reading_plan.py, MainActivity, Testing and validation guide, Android app implementation advisor report, DocumentStore, ReadingPlanCodec, ReadingPlan module (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.36
Nodes (8): compare_reading_sessions.py, export_reading_sessions.py, reading_plan.json, reading_plan_snapshot.json, Reading Plan Android app, BookCollections, PlanPrimitives, Syncthing

### Community 24 - "Community 24"
Cohesion: 0.48
Nodes (3): android.widget.TableLayout, android.widget.TableRow, TableRow

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (7): GitHub Actions, openwiki CLI v0.3.3, OpenWiki update workflow, Books to Read code wiki quickstart, differences, render_table, Reading-plan snapshots and comparison guide

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (6): Audiobooks Tab, Book: Wild Swans, Choose a Book Section, Digital Tab, Physical Tab, Reading Plan Interface

### Community 28 - "Community 28"
Cohesion: 0.40
Nodes (5): BookDeadline, available_reading_days, build_section_plans, calculate_deadlines, Schedule calculation and overrides guide

### Community 29 - "Community 29"
Cohesion: 0.40
Nodes (5): SectionPlan, ReadingPlanChartData, ReadingPlanCsvReport, Metrics, charts, and reports guide, summarize_section_plans

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (4): CSV interchange, JSON persistence schema 8, BookModels, CsvSupport

### Community 31 - "Community 31"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (3): Pages per Day Metric, Red Circle Annotation, Target Page Metric

### Community 33 - "Community 33"
Cohesion: 1.00
Nodes (3): Reading Plan Android app icon, Purple books with gold bookmarks and open pages, Circular badge with bar chart and star, representing reading progress/stats

### Community 34 - "Community 34"
Cohesion: 1.00
Nodes (3): Launcher Icon Foreground Layer, Reading Plan App Launcher Icon, Launcher Icon Round Variant

## Knowledge Gaps
- **51 isolated node(s):** `Current required pace`, `Reading day`, `Rest day`, `Day group`, `OpenWiki Update workflow` (+46 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MainActivity` connect `Android Framework Types` to `Android UI Widgets`, `Section Planning & CSV`, `Page Counting & Deadlines`, `JSON Persistence & Plans`, `Baseline Schedule & CSV`, `Book Collections & Groups`, `Reading Session Management`, `Calendar & Date Handling`, `Chart & Progress Display`, `Testing & Validation`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Why does `ReadingPlanApp` connect `UI Frame & Layout` to `Core Reading Plan Logic`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `Book` connect `Book Collections & Groups` to `Android UI Widgets`, `Section Planning & CSV`, `Page Counting & Deadlines`, `JSON Persistence & Plans`, `Baseline Schedule & CSV`, `Reading Session Management`, `Chart & Progress Display`, `Testing & Validation`, `Community 15`, `Community 26`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `ReadingPlanApp` (e.g. with `Book` and `BookDeadline`) actually correct?**
  _`ReadingPlanApp` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `Book` (e.g. with `ReadingPlanApp` and `target_display_value()`) actually correct?**
  _`Book` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `BookSection` (e.g. with `ReadingPlanApp` and `BaselineSchedulePersistenceTests`) actually correct?**
  _`BookSection` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Current required pace`, `Reading day`, `Rest day` to the rest of the system?**
  _51 weakly-connected nodes found - possible documentation gaps or missing edges._