# Books to Read

A GUI app that creates a quarterly reading deadline plan. Given physical and digital book page ranges plus audiobook durations, it recalculates the remaining daily pace or listening time each format needs to finish on the desired end date.

## Usage

```bash
python3 reading_plan_gui.py
```

The app opens `reading_plan.json` automatically when it starts. Changes are written back to the active JSON file automatically.

Use the tabs to:
- Log reading sessions by book, current page reached, or audiobook time left
- Quarter start date (defaults to next quarter start)
- Set an optional custom target finish date
- Add, replace, delete, reorder, and group physical or digital books using start and end page
- Add, replace, delete, reorder, and group audiobooks using `HH:MM` start/end times
- Import a CSV plan or export the current plan to CSV

The output shows physical and digital remaining page totals, audiobook remaining time, then separate tables for physical books, digital books, and audiobooks. Each format is planned as a parallel stream with its own recalculated daily pace or daily listening time.

You can choose consecutive Book IDs within each table to read simultaneously. The books start and finish together, their daily page allocation is split according to their remaining page counts, and the table is recalculated. Simultaneous groups are saved in JSON and CSV exports.

## Requirements

Python 3.7+ (standard library only, no external dependencies).
