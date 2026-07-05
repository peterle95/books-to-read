from __future__ import annotations

import calendar
import csv
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path


DATE_FORMAT = "%Y-%m-%d"
QUARTER_START_MONTHS = (1, 4, 7, 10)
PHYSICAL_BOOKS_LABEL = "Physical books"
DIGITAL_BOOKS_LABEL = "Digital books"
BOOK_SECTION_LABELS = (PHYSICAL_BOOKS_LABEL, DIGITAL_BOOKS_LABEL)


@dataclass
class Book:
    number: int
    title: str
    pages: int


@dataclass
class BookSection:
    label: str
    books: list[Book]
    simultaneous_groups: list[tuple[int, ...]]


@dataclass
class BookDeadline:
    book: Book
    cumulative_pages: int
    start_date: date
    deadline: date
    days_allocated: int
    daily_pages: float
    status: str


@dataclass
class SectionPlan:
    section: BookSection
    deadlines: list[BookDeadline]
    daily_pace: float
    total_pages: int
    required_pace: float
    overall_status: str


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


def prompt_int(prompt: str, default: int | None = None, minimum: int = 1) -> int:
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

        if value < minimum:
            if minimum == 0:
                print("Please enter zero or a positive integer.")
            else:
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


def collect_books(count: int, label: str = "Book") -> list[Book]:
    books: list[Book] = []

    for number in range(1, count + 1):
        default_title = f"{label} {number}"
        print(f"\n{default_title}")
        title = input(f"Title [{default_title}]: ").strip() or default_title
        pages = prompt_int("Pages")
        books.append(Book(number=number, title=title, pages=pages))

    return books


def collect_book_sections() -> list[BookSection]:
    """Collect physical books first, then digital books."""
    while True:
        physical_count = prompt_int(
            "Number of physical books", default=5, minimum=0
        )
        physical_books = collect_books(physical_count, "Physical book")
        digital_count = prompt_int("Number of digital books", default=0, minimum=0)
        digital_books = collect_books(digital_count, "Digital book")

        if physical_books or digital_books:
            return [
                BookSection(PHYSICAL_BOOKS_LABEL, physical_books, []),
                BookSection(DIGITAL_BOOKS_LABEL, digital_books, []),
            ]

        print("Please enter at least one physical or digital book.")


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


def remap_simultaneous_groups_after_deletion(
    groups: list[tuple[int, ...]], deleted_book_id: int, books: list[Book]
) -> list[tuple[int, ...]]:
    """Keep simultaneous groups aligned after one Book ID is removed."""
    remapped_groups: list[tuple[int, ...]] = []

    for group in groups:
        remapped_group = tuple(
            book_id - 1 if book_id > deleted_book_id else book_id
            for book_id in group
            if book_id != deleted_book_id
        )
        if len(remapped_group) >= 2:
            remapped_groups.append(remapped_group)

    return validate_simultaneous_groups(books, remapped_groups)


def remap_simultaneous_groups_after_addition(
    groups: list[tuple[int, ...]], new_book_position: int, books: list[Book]
) -> list[tuple[int, ...]]:
    """Keep simultaneous groups aligned after one Book ID is inserted."""
    remapped_groups = [
        tuple(
            book_id + 1 if book_id >= new_book_position else book_id
            for book_id in group
        )
        for group in groups
    ]
    return validate_simultaneous_groups(books, remapped_groups)


def insertion_splits_simultaneous_group(
    position: int, simultaneous_groups: list[tuple[int, ...]]
) -> tuple[int, ...] | None:
    """Return the simultaneous group that would be split by an insertion."""
    for group in simultaneous_groups:
        if group[0] < position <= group[-1]:
            return group
    return None


def prompt_book_deletion(
    books: list[Book], simultaneous_groups: list[tuple[int, ...]]
) -> tuple[bool, list[tuple[int, ...]]]:
    """Delete one book and preserve simultaneous groups among remaining books."""
    if not books:
        print("No books to delete.")
        return False, simultaneous_groups

    while True:
        book_id = prompt_int("Book ID to delete")
        if book_id <= len(books):
            break
        print(f"Please enter a Book ID from 1 to {len(books)}.")

    deleted_book = books.pop(book_id - 1)
    renumber_books(books)
    print(f"Deleted Book {book_id} ({deleted_book.title}).")

    return True, remap_simultaneous_groups_after_deletion(
        simultaneous_groups, book_id, books
    )


def prompt_book_addition(
    books: list[Book], simultaneous_groups: list[tuple[int, ...]]
) -> list[tuple[int, ...]]:
    """Add one book to the plan and preserve existing simultaneous groups."""
    while True:
        position = prompt_int("Position for new book", default=len(books) + 1)
        if position > len(books) + 1:
            print(f"Please enter a position from 1 to {len(books) + 1}.")
            continue

        split_group = insertion_splits_simultaneous_group(
            position, simultaneous_groups
        )
        if split_group:
            group_text = ", ".join(map(str, split_group))
            print(
                f"That position would split simultaneous books {group_text}. "
                "Choose a position before or after that group."
            )
            continue

        break

    print(f"\nNew details for Book {position}")
    title = input(f"Title [Book {position}]: ").strip() or f"Book {position}"
    pages = prompt_int("Pages")
    books.insert(position - 1, Book(number=position, title=title, pages=pages))
    renumber_books(books)
    print(f"Added Book {position} ({title}).")

    return remap_simultaneous_groups_after_addition(
        simultaneous_groups, position, books
    )


def prompt_section_choice(
    sections: list[BookSection], question: str, require_books: bool = True
) -> BookSection:
    available_sections = [
        section for section in sections if section.books or not require_books
    ]
    if len(available_sections) == 1:
        return available_sections[0]

    print(f"\n{question}")
    for index, section in enumerate(available_sections, start=1):
        print(f"{index}. {section.label}")

    while True:
        section_id = prompt_int("Table", default=1)
        if section_id <= len(available_sections):
            return available_sections[section_id - 1]
        print(f"Please enter a table from 1 to {len(available_sections)}.")


def prompt_plan_book_replacement(sections: list[BookSection]) -> None:
    section = prompt_section_choice(sections, "Which table contains the book to replace?")
    prompt_book_replacement(section.books)


def prompt_plan_book_deletion(sections: list[BookSection]) -> bool:
    if sum(len(section.books) for section in sections) == 1:
        print("Cannot delete the only book in the plan.")
        return False

    section = prompt_section_choice(sections, "Which table contains the book to delete?")
    book_deleted, section.simultaneous_groups = prompt_book_deletion(
        section.books, section.simultaneous_groups
    )
    return book_deleted


def prompt_plan_book_addition(sections: list[BookSection]) -> None:
    section = prompt_section_choice(
        sections, "Which table should the new book be added to?", require_books=False
    )
    section.simultaneous_groups = prompt_book_addition(
        section.books, section.simultaneous_groups
    )


def prompt_plan_book_reorder(sections: list[BookSection]) -> None:
    section = prompt_section_choice(sections, "Which table contains the book to reorder?")
    prompt_book_reorder(section.books)
    section.simultaneous_groups = []


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


def consecutive_book_runs(book_ids: tuple[int, ...]) -> list[tuple[int, ...]]:
    """Split Book IDs into consecutive runs, keeping only usable groups."""
    runs: list[tuple[int, ...]] = []
    current_run: list[int] = []

    for book_id in book_ids:
        if not current_run or book_id == current_run[-1] + 1:
            current_run.append(book_id)
            continue

        if len(current_run) >= 2:
            runs.append(tuple(current_run))
        current_run = [book_id]

    if len(current_run) >= 2:
        runs.append(tuple(current_run))

    return runs


def add_or_update_simultaneous_group(
    books: list[Book], groups: list[tuple[int, ...]], group: tuple[int, ...]
) -> tuple[list[tuple[int, ...]], bool]:
    """Add a group, moving selected books out of older groups when needed."""
    new_group = validate_simultaneous_groups(books, [group])[0]
    new_group_ids = set(new_group)
    updated_groups: list[tuple[int, ...]] = []
    changed_existing_group = False

    for existing_group in groups:
        remaining_ids = tuple(
            book_id for book_id in existing_group if book_id not in new_group_ids
        )
        if len(remaining_ids) != len(existing_group):
            changed_existing_group = True
        updated_groups.extend(consecutive_book_runs(remaining_ids))

    updated_groups.append(new_group)
    return validate_simultaneous_groups(books, updated_groups), changed_existing_group


def prompt_simultaneous_groups(
    books: list[Book], groups: list[tuple[int, ...]], label: str = "books"
) -> list[tuple[int, ...]]:
    """Let the reader add consecutive books that should be read together."""
    groups = list(groups)
    label_text = label.lower()

    while prompt_yes_no(f"\nRead {label_text} simultaneously?"):
        raw_ids = input("Consecutive Book IDs to read together (for example 2,3): ").strip()
        try:
            group = tuple(int(value.strip()) for value in raw_ids.split(","))
            groups, changed_existing_group = add_or_update_simultaneous_group(
                books, groups, group
            )
        except ValueError as error:
            print(f"Could not add simultaneous books: {error}")
            continue

        if changed_existing_group:
            print("Updated existing simultaneous groups.")
        print(f"Books {', '.join(map(str, group))} will be read together.")

    return groups


def prompt_plan_simultaneous_groups(sections: list[BookSection]) -> bool:
    changed = False

    for section in sections:
        if not section.books:
            continue
        updated_groups = prompt_simultaneous_groups(
            section.books, section.simultaneous_groups, section.label
        )
        if updated_groups != section.simultaneous_groups:
            section.simultaneous_groups = updated_groups
            changed = True

    return changed


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
    deadlines = calculate_deadlines(
        books, start_date, end_date, daily_pace, simultaneous_groups
    )
    overall_status = (
        "achievable" if deadlines[-1].deadline <= end_date else "not achievable"
    )
    return deadlines, total_pages, required_pace, overall_status


def build_section_plan(
    section: BookSection, start_date: date, end_date: date
) -> SectionPlan:
    """Calculate one physical or digital table."""
    if not section.books:
        return SectionPlan(section, [], 0.0, 0, 0.0, "achievable")

    period_days = inclusive_days_between(start_date, end_date)
    daily_pace = sum(book.pages for book in section.books) / period_days
    deadlines, total_pages, required_pace, overall_status = build_plan(
        section.books, start_date, end_date, daily_pace, section.simultaneous_groups
    )
    return SectionPlan(
        section, deadlines, daily_pace, total_pages, required_pace, overall_status
    )


def build_section_plans(
    sections: list[BookSection], start_date: date, end_date: date
) -> tuple[list[SectionPlan], int, float, str]:
    section_plans = [
        build_section_plan(section, start_date, end_date)
        for section in sections
    ]
    total_pages = sum(section_plan.total_pages for section_plan in section_plans)
    highest_daily_pace = max(
        (section_plan.daily_pace for section_plan in section_plans), default=0.0
    )
    overall_status = (
        "achievable"
        if all(
            section_plan.overall_status == "achievable"
            for section_plan in section_plans
        )
        else "not achievable"
    )
    return section_plans, total_pages, highest_daily_pace, overall_status


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
    section_plans: list[SectionPlan],
    start_date: date,
    end_date: date,
    total_pages: int,
    highest_daily_pace: float,
    overall_status: str,
    end_label: str,
) -> None:
    path = Path(filename)

    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Reading plan"])
        writer.writerow(["Start date", start_date.isoformat()])
        writer.writerow([end_label, end_date.isoformat()])
        writer.writerow(["Total pages", total_pages])
        writer.writerow(["Highest daily pace", f"{highest_daily_pace:.15g} pages/day"])
        writer.writerow(["Status", overall_status])

        for section_plan in section_plans:
            writer.writerow([])
            writer.writerow([section_plan.section.label])
            writer.writerow(
                ["Daily pace", f"{section_plan.daily_pace:.15g} pages/day"]
            )
            if section_plan.section.simultaneous_groups:
                writer.writerow(
                    [
                        "Simultaneous groups",
                        ";".join(
                            ",".join(map(str, group))
                            for group in section_plan.section.simultaneous_groups
                        ),
                    ]
                )
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

            for deadline in section_plan.deadlines:
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


def parse_csv_book_table(
    rows: list[list[str]], header_index: int, stop_at_blank: bool
) -> tuple[list[Book], int]:
    books: list[Book] = []
    index = header_index + 1

    while index < len(rows):
        row = rows[index]
        if row and row[0] in BOOK_SECTION_LABELS:
            break
        if not row or not any(cell.strip() for cell in row):
            if stop_at_blank:
                break
            index += 1
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
        index += 1

    renumber_books(books)
    return books, index


def parse_csv_simultaneous_groups(
    books: list[Book], raw_groups: str, label: str
) -> list[tuple[int, ...]]:
    try:
        return validate_simultaneous_groups(
            books,
            [
                tuple(int(book_id) for book_id in group.split(","))
                for group in raw_groups.split(";")
                if group
            ],
        )
    except ValueError as error:
        raise ValueError(f"invalid {label} simultaneous groups: {error}") from error


def load_csv_plan(
    filename: str,
) -> tuple[list[BookSection], date, date, str, str]:
    """Load the books and settings written by ``write_csv``."""
    with Path(filename).open(newline="", encoding="utf-8") as csv_file:
        rows = list(csv.reader(csv_file))

    first_plan_row_index = next(
        (
            index
            for index, row in enumerate(rows)
            if row
            and (
                row[0] in BOOK_SECTION_LABELS
                or row[:3] == ["Book", "Title", "Pages"]
            )
        ),
        len(rows),
    )
    metadata = {
        row[0]: row[1]
        for row in rows[:first_plan_row_index]
        if len(row) >= 2 and row[0] and row[0] != "Book"
    }
    required_fields = {"Start date"}
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
    except ValueError as error:
        raise ValueError("invalid date") from error
    if end_date < start_date:
        raise ValueError("finish date must be on or after the start date")

    has_section_labels = any(row and row[0] in BOOK_SECTION_LABELS for row in rows)
    if has_section_labels:
        sections_by_label = {
            label: BookSection(label, [], []) for label in BOOK_SECTION_LABELS
        }
        index = 0
        while index < len(rows):
            row = rows[index]
            if not row or row[0] not in BOOK_SECTION_LABELS:
                index += 1
                continue

            label = row[0]
            index += 1
            raw_groups = ""
            while index < len(rows) and (
                not rows[index] or not any(cell.strip() for cell in rows[index])
            ):
                index += 1
            if (
                index < len(rows)
                and len(rows[index]) >= 2
                and rows[index][0] == "Simultaneous groups"
            ):
                raw_groups = rows[index][1].strip()
                index += 1
            elif (
                index < len(rows)
                and len(rows[index]) >= 2
                and rows[index][0] == "Daily pace"
            ):
                index += 1
                if (
                    index < len(rows)
                    and len(rows[index]) >= 2
                    and rows[index][0] == "Simultaneous groups"
                ):
                    raw_groups = rows[index][1].strip()
                    index += 1
            while index < len(rows) and (
                not rows[index] or not any(cell.strip() for cell in rows[index])
            ):
                index += 1
            if index >= len(rows) or rows[index][:3] != ["Book", "Title", "Pages"]:
                raise ValueError(f"missing {label} book table header")

            books, index = parse_csv_book_table(rows, index, stop_at_blank=True)
            groups = parse_csv_simultaneous_groups(books, raw_groups, label)
            sections_by_label[label] = BookSection(label, books, groups)

        sections = [sections_by_label[label] for label in BOOK_SECTION_LABELS]
    else:
        try:
            header_index = next(
                index
                for index, row in enumerate(rows)
                if row[:3] == ["Book", "Title", "Pages"]
            )
        except StopIteration as error:
            raise ValueError("missing book table header") from error

        books, _ = parse_csv_book_table(rows, header_index, stop_at_blank=False)
        groups = parse_csv_simultaneous_groups(
            books, metadata.get("Simultaneous groups", "").strip(), PHYSICAL_BOOKS_LABEL
        )
        sections = [
            BookSection(PHYSICAL_BOOKS_LABEL, books, groups),
            BookSection(DIGITAL_BOOKS_LABEL, [], []),
        ]

    if not any(section.books for section in sections):
        raise ValueError("no books found")

    return (
        sections,
        start_date,
        end_date,
        end_label,
        end_name,
    )


def prompt_csv_plan(
) -> tuple[list[BookSection], date, date, str, str]:
    """Keep asking for a saved CSV file until a valid plan is loaded."""
    while True:
        filename = input("CSV filename [reading_plan.csv]: ").strip() or "reading_plan.csv"
        try:
            return load_csv_plan(filename)
        except (OSError, csv.Error, ValueError) as error:
            print(f"Could not import the CSV file: {error}")


def print_plan(
    section_plans: list[SectionPlan],
    start_date: date,
    end_date: date,
    total_pages: int,
    highest_daily_pace: float,
    overall_status: str,
    end_label: str,
    end_name: str,
) -> None:
    print("\nReading plan")
    print(f"Start date: {start_date.isoformat()}")
    print(f"{end_label}: {end_date.isoformat()}")
    print(f"Total pages: {total_pages}")
    print(f"Highest daily pace: {highest_daily_pace:.2f} pages/day")
    print(f"Status: {overall_status}")

    for section_plan in section_plans:
        print(f"\n{section_plan.section.label}")
        if not section_plan.deadlines:
            print("No books.")
            continue

        print(f"Daily pace: {section_plan.daily_pace:.2f} pages/day")
        print(format_table(section_plan.deadlines))
        print()
        print("Final result:")
        print(
            final_result_message(
                section_plan.deadlines[-1].deadline, end_date, end_name
            )
        )


def show_plan(
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    end_label: str,
    end_name: str,
) -> tuple[list[SectionPlan], int, float, str]:
    """Build and print the current plan without prompting for edits."""
    section_plans, total_pages, highest_daily_pace, overall_status = build_section_plans(
        sections, start_date, end_date
    )
    print_plan(
        section_plans=section_plans,
        start_date=start_date,
        end_date=end_date,
        total_pages=total_pages,
        highest_daily_pace=highest_daily_pace,
        overall_status=overall_status,
        end_label=end_label,
        end_name=end_name,
    )
    return section_plans, total_pages, highest_daily_pace, overall_status


def main() -> None:
    print("Quarterly reading deadline planner\n")

    loaded_from_csv = prompt_yes_no("Import a previously saved CSV plan?")
    if loaded_from_csv:
        (
            sections,
            start_date,
            end_date,
            end_label,
            end_name,
        ) = prompt_csv_plan()
    else:
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

        sections = collect_book_sections()

    if loaded_from_csv:
        section_plans, total_pages, highest_daily_pace, overall_status = show_plan(
            sections,
            start_date,
            end_date,
            end_label,
            end_name,
        )
    else:
        section_plans, total_pages, highest_daily_pace, overall_status = show_plan(
            sections,
            start_date,
            end_date,
            end_label,
            end_name,
        )

    plan_changed = False
    if loaded_from_csv:
        if prompt_yes_no("\nReplace a book in the imported plan?"):
            prompt_plan_book_replacement(sections)
            plan_changed = True
        elif prompt_yes_no("Delete a book from the imported plan?"):
            book_deleted = prompt_plan_book_deletion(sections)
            plan_changed = book_deleted
        elif prompt_yes_no("Add a book to the imported plan?"):
            prompt_plan_book_addition(sections)
            plan_changed = True
        elif prompt_yes_no("Change the order of books in the imported plan?"):
            prompt_plan_book_reorder(sections)
            plan_changed = True
    elif prompt_yes_no("\nChange the order of a book before saving?"):
        prompt_plan_book_reorder(sections)
        plan_changed = True

    if plan_changed:
        section_plans, total_pages, highest_daily_pace, overall_status = show_plan(
            sections,
            start_date,
            end_date,
            end_label,
            end_name,
        )

    if prompt_plan_simultaneous_groups(sections):
        section_plans, total_pages, highest_daily_pace, overall_status = show_plan(
            sections,
            start_date,
            end_date,
            end_label,
            end_name,
        )

    if prompt_yes_no("\nSave this plan to a CSV file?"):
        filename = input("CSV filename [reading_plan.csv]: ").strip() or "reading_plan.csv"
        write_csv(
            filename=filename,
            section_plans=section_plans,
            start_date=start_date,
            end_date=end_date,
            total_pages=total_pages,
            highest_daily_pace=highest_daily_pace,
            overall_status=overall_status,
            end_label=end_label,
        )
        print(f"Saved to {Path(filename).resolve()}")


if __name__ == "__main__":
    main()
