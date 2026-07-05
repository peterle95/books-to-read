# Books to Read

A CLI tool that creates a quarterly reading deadline plan. Given physical and digital book lists, it calculates the daily pace each format needs to finish on the desired end date.

## Usage

```bash
python reading_plan.py
```

You'll be prompted for:
- Quarter start date (defaults to next quarter start)
- Optional custom target finish date
- Physical books first, then digital books, including their titles/pages

The final plan can be exported to CSV.

The output shows a physical-books table followed by a digital-books table. Each format is planned as a parallel reading stream with its own calculated daily pace.

After the tables are shown, you can choose consecutive Book IDs within each table to read simultaneously. The books start and finish together, their daily page allocation is split according to their page counts, and the table is recalculated. Simultaneous groups are saved in CSV exports and restored on import.

## Requirements

Python 3.7+ (standard library only, no external dependencies).
