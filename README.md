# Books to Read

A CLI tool that creates a quarterly reading deadline plan. Given a list of books and a daily page target, it allocates deadlines per book and reports whether the goal is achievable.

## Usage

```bash
python reading_plan.py
```

You'll be prompted for:
- Daily reading pace per format (pages/day)
- Quarter start date (defaults to next quarter start)
- Optional custom target finish date
- Physical books first, then digital books, including their titles/pages

If the plan isn't achievable, you can adjust the pace or replace books. The final plan can be exported to CSV.

The output shows a physical-books table followed by a digital-books table. Each format is planned as a parallel reading stream, so the required pace is the higher pace needed by either table.

After the tables are shown, you can choose consecutive Book IDs within each table to read simultaneously. The books start and finish together, their daily page allocation is split according to their page counts, and the table is recalculated. Simultaneous groups are saved in CSV exports and restored on import.

## Requirements

Python 3.7+ (standard library only, no external dependencies).
