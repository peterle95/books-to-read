# Books to Read

A GUI app that creates a quarterly reading deadline plan. Given physical and digital book lists, it recalculates the remaining daily pace each format needs to finish on the desired end date.

## Usage

```bash
python3 reading_plan_gui.py
```

The app opens `reading_plan.json` automatically when it starts. Changes are written back to the active JSON file automatically.

Use the tabs to:
- Log reading sessions by book and pages read
- Quarter start date (defaults to next quarter start)
- Set an optional custom target finish date
- Add, replace, delete, reorder, and group physical or digital books
- Import a CSV plan or export the current plan to CSV

The output shows physical and digital remaining page totals, then a physical-books table followed by a digital-books table. Each format is planned as a parallel reading stream with its own recalculated daily pace.

You can choose consecutive Book IDs within each table to read simultaneously. The books start and finish together, their daily page allocation is split according to their remaining page counts, and the table is recalculated. Simultaneous groups are saved in JSON and CSV exports.

## Requirements

Python 3.7+ (standard library only, no external dependencies).
