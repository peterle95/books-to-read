# Books to Read

A GUI app that creates a quarterly reading deadline plan. Given physical and digital book page ranges plus audiobook durations, it recalculates the remaining daily pace or listening time each format needs to finish on the desired end date.

## Usage

```bash
python3 reading_plan_gui.py
```

The app opens `reading_plan_data/` automatically when it starts. If only the legacy `reading_plan.json` exists, it imports that file into the directory without changing or deleting the original. Changes are written to the active data directory automatically.

The data directory contains four JSON files:

- `plan.json` — dates, rest days, and summary settings
- `books.json` — books, schedules, overrides, progress, and simultaneous groups
- `sessions.json` — reading history keyed by stable book ID
- `manifest.json` — revision metadata and SHA-256 checksums for the three data files

The directory is authoritative after migration. A missing, malformed, semantically invalid, or checksum-mismatched file blocks loading instead of applying partial data or falling back to the legacy file.

Use the tabs to:
- Log reading sessions by book, current page reached, or audiobook time left
- Quarter start date (defaults to next quarter start)
- Set an optional custom target finish date
- Add and remove plan-wide rest-day date ranges
- Add, replace, delete, reorder, and group physical or digital books using start and end page
- Add, replace, delete, reorder, and group audiobooks using `HH:MM` start/end times
- Import a CSV plan or export the current plan to CSV

The output shows physical and digital remaining page totals, audiobook remaining time, then separate tables for physical books, digital books, and audiobooks. Each format is planned as a parallel stream with its own recalculated daily pace or daily listening time. Rest days are excluded from available reading days for every format and simultaneous group.

You can choose consecutive Book IDs within each table to read simultaneously. The books start and finish together, their daily page allocation is split according to their remaining page counts, and the table is recalculated. Simultaneous groups are saved in JSON and CSV exports.

## Requirements

Python 3.7+ (standard library only, no external dependencies).

## Reading-plan snapshots

```bash
python3 export_reading_sessions.py
python3 compare_reading_sessions.py
```

The export command reads `reading_plan_data/` and writes `reading_plan_snapshot.json`. The comparison command reports changed or missing plan data in a coloured table with the affected format, book, simple field name, and before/now values. It ignores automatic sync fields: revision, last-modified time, device identifier, and bundle checksums.
