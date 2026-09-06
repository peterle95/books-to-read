---
type: architecture overview
title: Repository architecture
description: Runtime map for the Python desktop planner, Android client, shared plan documents, and snapshot tooling.
tags: [architecture, runtime, compatibility]
---

# Repository architecture

This repository contains two clients for the same reading-plan domain plus command-line snapshot tools. The Python implementation is the reference calculation and persistence model: `reading_plan.py` owns books, sessions, schedules, CSV/JSON conversion, and conflict-safe writes; `reading_plan_gui.py` composes the Tk desktop UI. `reading-plan-android/app` is an independent Java client with corresponding model, scheduler, views, and the version-1 four-file bundle contract. The active working document is the `reading_plan_data/` directory (`plan.json`, `books.json`, `sessions.json`, and `manifest.json`); `reading_plan_snapshot.json` deliberately excludes automatic sync metadata.

```mermaid
flowchart LR
  GUI[reading_plan_gui.py] --> CORE[reading_plan.py]
  CORE --> PLAN[plan.json]
  CORE --> BOOKS[books.json]
  CORE --> SESS[sessions.json]
  CORE --> MAN[manifest.json]
  AND[Android MainActivity] --> STORE[ReadingPlanDataStore]
  STORE --> PLAN
  STORE --> BOOKS
  STORE --> SESS
  STORE --> MAN
  CORE --> CSV[CSV import/export]
  BOOKS --> EXP[export_reading_sessions.py]
  SESS --> EXP
  EXP --> SNAP[reading_plan_snapshot.json]
  SNAP --> DIFF[compare_reading_sessions.py]
  CORE --> TEST[test_reading_plan.py]
  DIFF --> ST[test_plan_snapshot.py]
```

The main lifecycle is load and validate the bundle → restore baseline and overrides → render or edit → calculate remaining views → stage and replace all four files with revision/hash checks. Desktop and Android must preserve the persisted schema and stable IDs; they do not share executable code. See [planning and scheduling](../planning/scheduling.md), [JSON persistence](../persistence/json.md), and [Android](../android/app.md).

## Boundaries

The core has no external Python dependencies and is usable independently of Tk. The GUI owns presentation, dialogs, tab navigation, and autosave. Android owns its platform file picker and UI. Snapshot scripts compare user-meaningful state rather than timestamps, revision, or device identity. There is no server, database, queue, or network API.
