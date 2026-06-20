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
    start_date: date
    deadline: date
    days_allocated: int
    daily_pages: float
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


def prompt_book_replacement(books: list[Book]) -> None:
    """Replace one book while keeping its original position in the plan."""
    while True:
        book_id = prompt_int("Book ID to replace")
        if book_id <= len(books):
            break
        print(f"Please enter a Book ID from 1 to {len(books)}.")

    old_book = books[book_id - 1]
    print(f"\nNew details for Book {book_id} ({old_book.title})")
    title = input(f"Title [{old_book.title}]: ").strip() or old_book.title
    pages = prompt_int("Pages", default=old_book.pages)
    books[book_id - 1] = Book(number=book_id, title=title, pages=pages)


def renumber_books(books: list[Book]) -> None:
    """Keep displayed Book IDs aligned with the current reading order."""
    for number, book in enumerate(books, start=1):
        book.number = number


def prompt_book_reorder(books: list[Book]) -> None:
    """Move one book to a new position in the reading order."""
    while True:
        book_id = prompt_int("Book ID to move")
        if book_id <= len(books):
            break
        print(f"Please enter a Book ID from 1 to {len(books)}.")

    while True:
        new_position = prompt_int("New position")
        if new_position <= len(books):
            break
        print(f"Please enter a position from 1 to {len(books)}.")

    book = books.pop(book_id - 1)
    books.insert(new_position - 1, book)
    renumber_books(books)


def validate_simultaneous_groups(
    books: list[Book], groups: list[tuple[int, ...]]
) -> list[tuple[int, ...]]:
    """Validate groups of consecutive Book IDs that are read in parallel."""
    used_ids: set[int] = set()
    valid_groups: list[tuple[int, ...]] = []

    for group in groups:
        ids = tuple(sorted(group))
        if len(ids) < 2:
            raise ValueError("choose at least two Book IDs")
        if len(set(ids)) != len(ids):
            raise ValueError("each Book ID can appear only once in a group")
        if ids[0] < 1 or ids[-1] > len(books):
            raise ValueError(f"Book IDs must be from 1 to {len(books)}")
        if ids != tuple(range(ids[0], ids[-1] + 1)):
            raise ValueError("Book IDs read together must be consecutive")
        if used_ids.intersection(ids):
            raise ValueError("a book can belong to only one simultaneous group")

        used_ids.update(ids)
        valid_groups.append(ids)

    return valid_groups


def prompt_simultaneous_groups(
    books: list[Book], groups: list[tuple[int, ...]]
) -> list[tuple[int, ...]]:
    """Let the reader add consecutive books that should be read together."""
    groups = list(groups)

    while prompt_yes_no("\nRead books simultaneously?"):
        raw_ids = input("Consecutive Book IDs to read together (for example 2,3): ").strip()
        try:
            group = tuple(int(value.strip()) for value in raw_ids.split(","))
            groups = validate_simultaneous_groups(books, [*groups, group])
        except ValueError as error:
            print(f"Could not add simultaneous books: {error}")
            continue

        print(f"Books {', '.join(map(str, group))} will be read together.")

    return groups


def calculate_deadlines(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
    simultaneous_groups: list[tuple[int, ...]] | None = None,
) -> list[BookDeadline]:
    simultaneous_groups = validate_simultaneous_groups(
        books, simultaneous_groups or []
    )
    group_by_first_book = {group[0]: group for group in simultaneous_groups}
    grouped_book_ids = {book_id for group in simultaneous_groups for book_id in group}
    deadlines: list[BookDeadline] = []
    cumulative_pages = 0
    previous_cumulative_days = 0
    book_index = 0

    while book_index < len(books):
        book = books[book_index]
        if book.number in grouped_book_ids and book.number not in group_by_first_book:
            book_index += 1
            continue

        group_ids = group_by_first_book.get(book.number, (book.number,))
        group_books = books[book_index : book_index + len(group_ids)]
        group_pages = sum(group_book.pages for group_book in group_books)
        cumulative_pages += group_pages
        # Use cumulative pages so rounding does not compound from book to book.
        # The tiny tolerance avoids floating-point noise turning an exact
        # whole-day pace into one extra day (for example, 103.00000000000001).
        cumulative_days = max(1, math.ceil(cumulative_pages / daily_pace - 1e-9))
        days_allocated = cumulative_days - previous_cumulative_days
        # The start date is the end of the first reading day, so a one-day
        # book has a deadline of the start date rather than the next day.
        deadline = start_date + timedelta(days=cumulative_days - 1)
        group_start_date = (
            deadline
            if days_allocated == 0
            else start_date + timedelta(days=previous_cumulative_days)
        )

        if deadline < end_date:
            status = "before end"
        elif deadline == end_date:
            status = "on end date"
        else:
            status = "after end"

        individual_cumulative_pages = cumulative_pages - group_pages
        for group_book in group_books:
            individual_cumulative_pages += group_book.pages
            daily_pages = (
                daily_pace
                if len(group_books) == 1
                else daily_pace * group_book.pages / group_pages
            )
            deadlines.append(
                BookDeadline(
                    book=group_book,
                    cumulative_pages=individual_cumulative_pages,
                    start_date=group_start_date,
                    deadline=deadline,
                    days_allocated=days_allocated,
                    daily_pages=daily_pages,
                    status=status,
                )
            )

        previous_cumulative_days = cumulative_days
        book_index += len(group_books)

    return deadlines


def build_plan(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
    simultaneous_groups: list[tuple[int, ...]] | None = None,
) -> tuple[list[BookDeadline], int, float, str]:
    """Calculate all values needed to display or export the current plan."""
    total_pages = sum(book.pages for book in books)
    period_days = inclusive_days_between(start_date, end_date)
    required_pace = total_pages / period_days
    overall_status = "achievable" if daily_pace >= required_pace else "not achievable"
    deadlines = calculate_deadlines(
        books, start_date, end_date, daily_pace, simultaneous_groups
    )
    return deadlines, total_pages, required_pace, overall_status


def format_table(deadlines: list[BookDeadline]) -> str:
    headers = [
        "Book",
        "Title",
        "Pages",
        "Daily pages",
        "Cumulative pages",
        "Start date",
        "Deadline",
        "Days allocated",
        "Status",
    ]
    rows = [
        [
            str(deadline.book.number),
            deadline.book.title,
            str(deadline.book.pages),
            f"{deadline.daily_pages:.2f}",
            str(deadline.cumulative_pages),
            deadline.start_date.isoformat(),
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
    simultaneous_groups: list[tuple[int, ...]],
) -> None:
    path = Path(filename)

    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Reading plan"])
        writer.writerow(["Start date", start_date.isoformat()])
        writer.writerow([end_label, end_date.isoformat()])
        # Keep enough precision for a reopened plan to retain its exact final
        # deadline after a replacement recalculates the pace.
        writer.writerow(["Daily pace", f"{daily_pace:.15g} pages/day"])
        writer.writerow(["Total pages", total_pages])
        writer.writerow(["Required pace", f"{required_pace:.2f} pages/day"])
        writer.writerow(["Status", overall_status])
        if simultaneous_groups:
            writer.writerow(
                [
                    "Simultaneous groups",
                    ";".join(",".join(map(str, group)) for group in simultaneous_groups),
                ]
            )
        writer.writerow([])
        writer.writerow(
            [
                "Book",
                "Title",
                "Pages",
                "Daily pages",
                "Cumulative pages",
                "Start date",
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
                    f"{deadline.daily_pages:.15g}",
                    deadline.cumulative_pages,
                    deadline.start_date.isoformat(),
                    deadline.deadline.isoformat(),
                    deadline.days_allocated,
                    deadline.status,
                ]
            )


def load_csv_plan(
    filename: str,
) -> tuple[list[Book], date, date, float, str, str, list[tuple[int, ...]]]:
    """Load the books and settings written by ``write_csv``."""
    with Path(filename).open(newline="", encoding="utf-8") as csv_file:
        rows = list(csv.reader(csv_file))

    metadata = {
        row[0]: row[1]
        for row in rows
        if len(row) >= 2 and row[0] and row[0] != "Book"
    }
    required_fields = {"Start date", "Daily pace"}
    missing_fields = required_fields - metadata.keys()
    if missing_fields:
        names = ", ".join(sorted(missing_fields))
        raise ValueError(f"missing required field(s): {names}")

    if "Target finish date" in metadata:
        end_label = "Target finish date"
        end_name = "target finish date"
    elif "Quarter end" in metadata:
        end_label = "Quarter end"
        end_name = "quarter end date"
    else:
        raise ValueError("missing Target finish date or Quarter end")

    try:
        start_date = parse_date(metadata["Start date"])
        end_date = parse_date(metadata[end_label])
        daily_pace = float(metadata["Daily pace"].split()[0])
    except (ValueError, IndexError) as error:
        raise ValueError("invalid date or daily pace") from error

    if daily_pace <= 0:
        raise ValueError("daily pace must be positive")
    if end_date < start_date:
        raise ValueError("finish date must be on or after the start date")

    try:
        header_index = next(
            index
            for index, row in enumerate(rows)
            if row[:3] == ["Book", "Title", "Pages"]
        )
    except StopIteration as error:
        raise ValueError("missing book table header") from error

    books: list[Book] = []
    for row in rows[header_index + 1 :]:
        if not row or not any(cell.strip() for cell in row):
            continue
        if len(row) < 3:
            raise ValueError("a book row is incomplete")
        try:
            number = int(row[0])
            pages = int(row[2])
        except ValueError as error:
            raise ValueError("book IDs and pages must be whole numbers") from error
        title = row[1].strip()
        if number <= 0 or pages <= 0 or not title:
            raise ValueError("each book needs a positive ID, title, and page count")
        books.append(Book(number=number, title=title, pages=pages))

    if not books:
        raise ValueError("no books found")

    renumber_books(books)
    raw_groups = metadata.get("Simultaneous groups", "").strip()
    try:
        simultaneous_groups = validate_simultaneous_groups(
            books,
            [
                tuple(int(book_id) for book_id in group.split(","))
                for group in raw_groups.split(";")
                if group
            ],
        )
    except ValueError as error:
        raise ValueError(f"invalid simultaneous groups: {error}") from error

    return (
        books,
        start_date,
        end_date,
        daily_pace,
        end_label,
        end_name,
        simultaneous_groups,
    )


def prompt_csv_plan(
) -> tuple[list[Book], date, date, float, str, str, list[tuple[int, ...]]]:
    """Keep asking for a saved CSV file until a valid plan is loaded."""
    while True:
        filename = input("CSV filename [reading_plan.csv]: ").strip() or "reading_plan.csv"
        try:
            return load_csv_plan(filename)
        except (OSError, csv.Error, ValueError) as error:
            print(f"Could not import the CSV file: {error}")


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


def resolve_plan(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
    end_label: str,
    end_name: str,
    simultaneous_groups: list[tuple[int, ...]],
) -> tuple[float, list[BookDeadline], int, float, str]:
    """Show the plan and resolve any pace shortfall before it can be saved."""
    while True:
        deadlines, total_pages, required_pace, overall_status = build_plan(
            books, start_date, end_date, daily_pace, simultaneous_groups
        )
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

        if overall_status == "achievable":
            return daily_pace, deadlines, total_pages, required_pace, overall_status

        if prompt_yes_no(
            "\nUse the proposed required pace to finish by the deadline?"
        ):
            daily_pace = required_pace
        else:
            prompt_book_replacement(books)


def main() -> None:
    print("Quarterly reading deadline planner\n")

    loaded_from_csv = prompt_yes_no("Import a previously saved CSV plan?")
    if loaded_from_csv:
        (
            books,
            start_date,
            end_date,
            daily_pace,
            end_label,
            end_name,
            simultaneous_groups,
        ) = prompt_csv_plan()
    else:
        daily_pace = prompt_float("Daily reading pace in pages")
        start_date = prompt_date("Quarter start date", default=next_quarter_start())

        use_custom_target = prompt_yes_no(
            "Use a custom target finish date instead of a 3-month quarter?"
        )
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
        simultaneous_groups: list[tuple[int, ...]] = []

    daily_pace, deadlines, total_pages, required_pace, overall_status = resolve_plan(
        books,
        start_date,
        end_date,
        daily_pace,
        end_label,
        end_name,
        simultaneous_groups,
    )

    plan_changed = False
    replacement_made = False
    if loaded_from_csv:
        if prompt_yes_no("\nReplace a book in the imported plan?"):
            prompt_book_replacement(books)
            plan_changed = True
            replacement_made = True
        elif prompt_yes_no("Change the order of books in the imported plan?"):
            prompt_book_reorder(books)
            plan_changed = True
            simultaneous_groups = []
    elif prompt_yes_no("\nChange the order of a book before saving?"):
        prompt_book_reorder(books)
        plan_changed = True

    if plan_changed:
        if replacement_made:
            # A replacement changes the total pages. Recalculate the daily
            # pace from the fixed reading window so the final book remains
            # scheduled for the chosen end date.
            daily_pace = sum(book.pages for book in books) / inclusive_days_between(
                start_date, end_date
            )
        daily_pace, deadlines, total_pages, required_pace, overall_status = resolve_plan(
            books,
            start_date,
            end_date,
            daily_pace,
            end_label,
            end_name,
            simultaneous_groups,
        )

    updated_simultaneous_groups = prompt_simultaneous_groups(
        books, simultaneous_groups
    )
    if updated_simultaneous_groups != simultaneous_groups:
        simultaneous_groups = updated_simultaneous_groups
        daily_pace, deadlines, total_pages, required_pace, overall_status = resolve_plan(
            books,
            start_date,
            end_date,
            daily_pace,
            end_label,
            end_name,
            simultaneous_groups,
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
            simultaneous_groups=simultaneous_groups,
        )
        print(f"Saved to {Path(filename).resolve()}")


if __name__ == "__main__":
    main()
