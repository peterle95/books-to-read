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
- View book progress in Charts. The **All** button defaults to off (unfinished books only); green means all books and slate means unfinished books. Both apps animate button presses.

### Planning the next quarter

In the **Plan** tab, choose **Next quarter** on desktop or **Plan next quarter** on Android. Add, update, or remove planned books in any format, then choose **Save plan**. You can keep logging sessions in your current plan and reopen the editor to revise the next one.

The apps activate the saved plan on January 1, April 1, July 1, or October 1. They check on opening/resuming and every 30 seconds while running. If you leave an app closed across the boundary, it activates the plan on the next launch. After several missed quarters, it uses the current calendar quarter.

Unfinished books come first in each format, followed by the planned books. They keep their IDs, page/time progress, reading history, and surviving simultaneous groups. The apps remove completed books from the active plan and calculate new schedules for the remaining work; old start/deadline overrides do not carry forward. If you completed every book, the saved plan replaces the old one.

The shared data directory stores the next-quarter plan in `books.json`, under `planned_quarter`. Saves use bundle schema 2; both apps still read schema 1. **Update both apps before sharing schema-2 data**; older builds reject the new schema. CSV export contains only the current plan, while reading-plan snapshots include the planned quarter.

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
