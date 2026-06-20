from __future__ import annotations

import calendar
import csv
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path


DATE_FORMAT = "%Y-%m-%d"
QUARTER_START_MONTHS = (1, 4, 7, 10)


@dataclass
class Book:
    number: int
    title: str
    pages: int


@dataclass
class BookDeadline:
    book: Book
    cumulative_pages: int
    deadline: date
    days_allocated: int
    status: str


def parse_date(value: str) -> date:
    """Parse a date in YYYY-MM-DD format."""
    return datetime.strptime(value, DATE_FORMAT).date()


def add_months(start: date, months: int) -> date:
    """Add calendar months while keeping the day when possible."""
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(start.day, last_day)
    return date(year, month, day)


def next_quarter_start(today: date | None = None) -> date:
    """Return the next quarterly start date after today."""
    today = today or date.today()

    for month in QUARTER_START_MONTHS:
        candidate = date(today.year, month, 1)
        if candidate > today:
            return candidate

    return date(today.year + 1, 1, 1)


def period_end_from_start(start: date) -> date:
    """The default reading period ends one day before the same day 3 months later."""
    return add_months(start, 3) - timedelta(days=1)


def inclusive_days_between(start: date, end: date) -> int:
    """Count readable calendar days, including both start and end."""
    return (end - start).days + 1


def prompt_float(prompt: str, default: float | None = None) -> float:
    while True:
        suffix = f" [{default:g}]" if default is not None else ""
        raw_value = input(f"{prompt}{suffix}: ").strip()

        if not raw_value and default is not None:
            return default

        try:
            value = float(raw_value)
        except ValueError:
            print("Please enter a number.")
            continue

        if value <= 0:
            print("Pages per day must be positive.")
            continue

        return value


def prompt_int(prompt: str, default: int | None = None) -> int:
    while True:
        suffix = f" [{default}]" if default is not None else ""
        raw_value = input(f"{prompt}{suffix}: ").strip()

        if not raw_value and default is not None:
            return default

        try:
            value = int(raw_value)
        except ValueError:
            print("Please enter a whole number.")
            continue

        if value <= 0:
            print("Please enter a positive integer.")
            continue

        return value


def prompt_date(prompt: str, default: date | None = None) -> date:
    while True:
        suffix = f" [{default.isoformat()}]" if default is not None else ""
        raw_value = input(f"{prompt}{suffix}: ").strip()

        if not raw_value and default is not None:
            return default

        try:
            return parse_date(raw_value)
        except ValueError:
            print("Please enter a date in YYYY-MM-DD format.")


def prompt_yes_no(prompt: str, default: bool = False) -> bool:
    default_text = "Y/n" if default else "y/N"

    while True:
        raw_value = input(f"{prompt} [{default_text}]: ").strip().lower()

        if not raw_value:
            return default
        if raw_value in {"y", "yes"}:
            return True
        if raw_value in {"n", "no"}:
            return False

        print("Please enter y or n.")


def collect_books(count: int) -> list[Book]:
    books: list[Book] = []

    for number in range(1, count + 1):
        print(f"\nBook {number}")
        title = input(f"Title [Book {number}]: ").strip() or f"Book {number}"
        pages = prompt_int("Pages")
        books.append(Book(number=number, title=title, pages=pages))

    return books


def calculate_deadlines(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
) -> list[BookDeadline]:
    deadlines: list[BookDeadline] = []
    cumulative_pages = 0
    previous_cumulative_days = 0

    for book in books:
        cumulative_pages += book.pages
        # Use cumulative pages so rounding does not compound from book to book.
        cumulative_days = math.ceil(cumulative_pages / daily_pace)
        days_allocated = cumulative_days - previous_cumulative_days
        deadline = start_date + timedelta(days=cumulative_days)

        if deadline < end_date:
            status = "before end"
        elif deadline == end_date:
            status = "on end date"
        else:
            status = "after end"

        deadlines.append(
            BookDeadline(
                book=book,
                cumulative_pages=cumulative_pages,
                deadline=deadline,
                days_allocated=days_allocated,
                status=status,
            )
        )
        previous_cumulative_days = cumulative_days

    return deadlines


def format_table(deadlines: list[BookDeadline]) -> str:
    headers = [
        "Book",
        "Title",
        "Pages",
        "Cumulative pages",
        "Deadline",
        "Days allocated",
        "Status",
    ]
    rows = [
        [
            str(deadline.book.number),
            deadline.book.title,
            str(deadline.book.pages),
            str(deadline.cumulative_pages),
            deadline.deadline.isoformat(),
            str(deadline.days_allocated),
            deadline.status,
        ]
        for deadline in deadlines
    ]

    columns = list(zip(headers, *rows))
    widths = [max(len(value) for value in column) for column in columns]

    def format_row(values: list[str]) -> str:
        padded = [value.ljust(widths[index]) for index, value in enumerate(values)]
        return "| " + " | ".join(padded) + " |"

    separator = "|-" + "-|-".join("-" * width for width in widths) + "-|"
    return "\n".join([format_row(headers), separator, *[format_row(row) for row in rows]])


def final_result_message(final_deadline: date, end_date: date, end_name: str) -> str:
    difference = (end_date - final_deadline).days

    if difference > 0:
        return f"You finish {difference} day{'s' if difference != 1 else ''} before the {end_name}."
    if difference == 0:
        return f"You finish exactly on the {end_name}."

    late_days = abs(difference)
    return f"You finish {late_days} day{'s' if late_days != 1 else ''} after the {end_name}."


def write_csv(
    filename: str,
    deadlines: list[BookDeadline],
    start_date: date,
    end_date: date,
    daily_pace: float,
    total_pages: int,
    required_pace: float,
    overall_status: str,
    end_label: str,
) -> None:
    path = Path(filename)

    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Reading plan"])
        writer.writerow(["Start date", start_date.isoformat()])
        writer.writerow([end_label, end_date.isoformat()])
        writer.writerow(["Daily pace", f"{daily_pace:g} pages/day"])
        writer.writerow(["Total pages", total_pages])
        writer.writerow(["Required pace", f"{required_pace:.2f} pages/day"])
        writer.writerow(["Status", overall_status])
        writer.writerow([])
        writer.writerow(
            [
                "Book",
                "Title",
                "Pages",
                "Cumulative pages",
                "Deadline",
                "Days allocated",
                "Status",
            ]
        )

        for deadline in deadlines:
            writer.writerow(
                [
                    deadline.book.number,
                    deadline.book.title,
                    deadline.book.pages,
                    deadline.cumulative_pages,
                    deadline.deadline.isoformat(),
                    deadline.days_allocated,
                    deadline.status,
                ]
            )


def print_plan(
    deadlines: list[BookDeadline],
    start_date: date,
    end_date: date,
    daily_pace: float,
    total_pages: int,
    required_pace: float,
    overall_status: str,
    end_label: str,
    end_name: str,
) -> None:
    print("\nReading plan")
    print(f"Start date: {start_date.isoformat()}")
    print(f"{end_label}: {end_date.isoformat()}")
    print(f"Daily pace: {daily_pace:g} pages/day")
    print(f"Total pages: {total_pages}")
    print(f"Required pace: {required_pace:.2f} pages/day")
    print(f"Status: {overall_status}")
    print()
    print(format_table(deadlines))
    print()
    print("Final result:")
    print(final_result_message(deadlines[-1].deadline, end_date, end_name))


def main() -> None:
    print("Quarterly reading deadline planner\n")

    daily_pace = prompt_float("Daily reading pace in pages")
    start_date = prompt_date("Quarter start date", default=next_quarter_start())

    use_custom_target = prompt_yes_no("Use a custom target finish date instead of a 3-month quarter?")
    if use_custom_target:
        while True:
            end_date = prompt_date("Target finish date")
            if end_date < start_date:
                print("Target finish date must be on or after the start date.")
                continue
            break
    else:
        end_date = period_end_from_start(start_date)

    end_label = "Target finish date" if use_custom_target else "Quarter end"
    end_name = "target finish date" if use_custom_target else "quarter end date"

    book_count = prompt_int("Number of books", default=5)
    books = collect_books(book_count)

    total_pages = sum(book.pages for book in books)
    period_days = inclusive_days_between(start_date, end_date)
    required_pace = total_pages / period_days
    overall_status = "achievable" if daily_pace >= required_pace else "not achievable"
    deadlines = calculate_deadlines(books, start_date, end_date, daily_pace)

    print_plan(
        deadlines=deadlines,
        start_date=start_date,
        end_date=end_date,
        daily_pace=daily_pace,
        total_pages=total_pages,
        required_pace=required_pace,
        overall_status=overall_status,
        end_label=end_label,
        end_name=end_name,
    )

    if prompt_yes_no("\nSave this plan to a CSV file?"):
        filename = input("CSV filename [reading_plan.csv]: ").strip() or "reading_plan.csv"
        write_csv(
            filename=filename,
            deadlines=deadlines,
            start_date=start_date,
            end_date=end_date,
            daily_pace=daily_pace,
            total_pages=total_pages,
            required_pace=required_pace,
            overall_status=overall_status,
            end_label=end_label,
        )
        print(f"Saved to {Path(filename).resolve()}")


if __name__ == "__main__":
    main()
