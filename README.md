# Books to Read

A Python tool that creates a quarterly reading deadline plan. Given physical and digital book lists, it calculates the daily pace each format needs to finish on the desired end date.

## Usage

### CLI

```bash
python3 reading_plan.py
```

### GUI

```bash
python3 reading_plan_gui.py
```

The GUI opens and saves editable plans as JSON files. It can also import the CSV files written by the CLI and export the current plan back to CSV.

The CLI prompts for:
- Quarter start date (defaults to next quarter start)
- Optional custom target finish date
- Physical books first, then digital books, including their titles/pages

The final plan can be exported to CSV.

The output shows physical and digital page totals, then a physical-books table followed by a digital-books table. Each format is planned as a parallel reading stream with its own calculated daily pace. The CLI asks before showing each optional extra summary stat.

After the tables are shown, you can choose consecutive Book IDs within each table to read simultaneously. The books start and finish together, their daily page allocation is split according to their page counts, and the table is recalculated. Simultaneous groups are saved in CSV exports and restored on import.

## Requirements

Python 3.7+ (standard library only, no external dependencies).
