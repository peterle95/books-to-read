from __future__ import annotations

import calendar
import csv
import json
import math
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path


DATE_FORMAT = "%Y-%m-%d"
QUARTER_START_MONTHS = (1, 4, 7, 10)
PHYSICAL_BOOKS_LABEL = "Physical books"
DIGITAL_BOOKS_LABEL = "Digital books"
AUDIOBOOKS_LABEL = "Audiobooks"
BOOK_SECTION_LABELS = (PHYSICAL_BOOKS_LABEL, DIGITAL_BOOKS_LABEL, AUDIOBOOKS_LABEL)


def canonical_section_label(label: object, default_label: str) -> str:
    raw_label = str(label).strip()
    if not raw_label:
        raw_label = default_label
    normalized = "".join(character for character in raw_label.lower() if character.isalnum())
    aliases = {
        "physical": PHYSICAL_BOOKS_LABEL,
        "physicalbook": PHYSICAL_BOOKS_LABEL,
        "physicalbooks": PHYSICAL_BOOKS_LABEL,
        "paperbook": PHYSICAL_BOOKS_LABEL,
        "paperbooks": PHYSICAL_BOOKS_LABEL,
        "printbook": PHYSICAL_BOOKS_LABEL,
        "printbooks": PHYSICAL_BOOKS_LABEL,
        "digital": DIGITAL_BOOKS_LABEL,
        "digitalbook": DIGITAL_BOOKS_LABEL,
        "digitalbooks": DIGITAL_BOOKS_LABEL,
        "ebook": DIGITAL_BOOKS_LABEL,
        "ebooks": DIGITAL_BOOKS_LABEL,
        "kindlebook": DIGITAL_BOOKS_LABEL,
        "kindlebooks": DIGITAL_BOOKS_LABEL,
        "audio": AUDIOBOOKS_LABEL,
        "audiobook": AUDIOBOOKS_LABEL,
        "audiobooks": AUDIOBOOKS_LABEL,
    }
    if normalized in aliases:
        return aliases[normalized]
    if default_label in BOOK_SECTION_LABELS and raw_label not in BOOK_SECTION_LABELS:
        return default_label
    return raw_label


@dataclass
class ReadingSession:
    date: date
    current_page: int
    pages_read: int


@dataclass
class Book:
    number: int
    title: str
    start_page: int
    end_page: int
    current_page: int | None = None
    reading_sessions: list[ReadingSession] = field(default_factory=list)

    @property
    def pages(self) -> int:
        return self.end_page - self.start_page + 1

    @property
    def pages_read(self) -> int:
        if self.current_page is None:
            return 0
        return min(max(self.current_page - self.start_page + 1, 0), self.pages)


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


@dataclass
class SummaryStatsOptions:
    book_counts: bool
    page_share: bool
    average_pages: bool
    reading_period: bool
    pace_driver: bool


def parse_date(value: str) -> date:
    return datetime.strptime(value, DATE_FORMAT).date()


def add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(start.day, last_day)
    return date(year, month, day)


def next_quarter_start(today: date | None = None) -> date:
    today = today or date.today()
    for month in QUARTER_START_MONTHS:
        candidate = date(today.year, month, 1)
        if candidate > today:
            return candidate
    return date(today.year + 1, 1, 1)


def period_end_from_start(start: date) -> date:
    return add_months(start, 3) - timedelta(days=1)


def inclusive_days_between(start: date, end: date) -> int:
    return (end - start).days + 1


def pages_remaining(book: Book) -> int:
    return max(book.pages - book.pages_read, 0)


def is_audiobook_section(label: str) -> bool:
    return label == AUDIOBOOKS_LABEL


def parse_duration(value: str) -> int:
    parts = value.strip().split(":")
    if len(parts) not in {2, 3}:
        raise ValueError("time must be HH:MM or HH:MM:SS")
    try:
        numbers = [int(part) for part in parts]
    except ValueError as error:
        raise ValueError("time fields must be whole numbers") from error
    if any(number < 0 for number in numbers):
        raise ValueError("time cannot be negative")
    if len(numbers) == 2:
        hours, minutes = numbers
        seconds = 0
    else:
        hours, minutes, seconds = numbers
    if minutes >= 60 or seconds >= 60:
        raise ValueError("minutes and seconds must be below 60")
    return hours * 3600 + minutes * 60 + seconds


def format_duration(total_seconds: int | float) -> str:
    seconds = max(0, int(round(total_seconds)))
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if seconds:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{hours}:{minutes:02d}"


def total_units(book: Book, section_label: str) -> int:
    if is_audiobook_section(section_label):
        return book.end_page - book.start_page
    return book.pages


def completed_units(book: Book, section_label: str) -> int:
    if book.current_page is None:
        return 0
    if is_audiobook_section(section_label):
        return min(max(book.current_page - book.start_page, 0), total_units(book, section_label))
    return book.pages_read


def remaining_units(book: Book, section_label: str) -> int:
    return max(total_units(book, section_label) - completed_units(book, section_label), 0)


def remaining_time_at_current(book: Book, current_time: int) -> int:
    return max(book.end_page - current_time, 0)


def current_time_from_remaining_time(
    start_time: int, end_time: int, remaining_time: int
) -> int:
    duration = end_time - start_time
    if remaining_time < 0:
        raise ValueError("remaining time cannot be negative")
    if remaining_time > duration:
        raise ValueError("remaining time cannot be greater than the audiobook duration")
    return end_time - remaining_time


def current_time_from_remaining(book: Book, remaining_time: int) -> int:
    return current_time_from_remaining_time(
        book.start_page, book.end_page, remaining_time
    )


def validate_page_range(start_page: int, end_page: int) -> None:
    if start_page < 0:
        raise ValueError("start page cannot be negative")
    if end_page < start_page:
        raise ValueError("end page must be on or after the start page")


def validate_book_range(section_label: str, start: int, end: int) -> None:
    if not is_audiobook_section(section_label):
        validate_page_range(start, end)
        return
    if start < 0:
        raise ValueError("start time cannot be negative")
    if end < start:
        raise ValueError("end time must be on or after the start time")


def effective_remaining_start_date(
    start_date: date, end_date: date, today: date | None = None
) -> date:
    today = today or date.today()
    return min(max(start_date, today), end_date)


def set_book_progress(
    book: Book, current_page: int | None, section_label: str = PHYSICAL_BOOKS_LABEL
) -> None:
    if current_page is None:
        book.current_page = None
        return
    if current_page < book.start_page:
        if is_audiobook_section(section_label):
            raise ValueError("time left cannot be greater than the audiobook duration")
        raise ValueError("current page cannot be before the book's start page")
    if current_page > book.end_page:
        if is_audiobook_section(section_label):
            raise ValueError("time left cannot be negative")
        raise ValueError("current page cannot be after the book's end page")
    book.current_page = current_page


def add_reading_session(
    book: Book,
    session_date: date,
    current_page: int,
    section_label: str = PHYSICAL_BOOKS_LABEL,
) -> None:
    previous_completed = completed_units(book, section_label)
    set_book_progress(book, current_page, section_label)
    units_read = completed_units(book, section_label) - previous_completed
    if units_read <= 0:
        if is_audiobook_section(section_label):
            raise ValueError(
                "time left must be less than the previously recorded time left"
            )
        raise ValueError("current page must be after the previously recorded page")
    book.reading_sessions.append(ReadingSession(session_date, current_page, units_read))


def remove_reading_session(book: Book, session_index: int) -> None:
    try:
        book.reading_sessions.pop(session_index)
    except IndexError as error:
        raise ValueError("reading session not found") from error
    if not book.reading_sessions:
        book.current_page = None
        return
    book.current_page = max(session.current_page for session in book.reading_sessions)


def renumber_books(books: list[Book]) -> None:
    for number, book in enumerate(books, start=1):
        book.number = number


def validate_simultaneous_groups(
    books: list[Book], groups: list[tuple[int, ...]]
) -> list[tuple[int, ...]]:
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


def remap_simultaneous_groups_after_deletion(
    groups: list[tuple[int, ...]], deleted_book_id: int, books: list[Book]
) -> list[tuple[int, ...]]:
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
    for group in simultaneous_groups:
        if group[0] < position <= group[-1]:
            return group
    return None


def calculate_deadlines(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
    simultaneous_groups: list[tuple[int, ...]] | None = None,
    page_count: Callable[[Book], int] | None = None,
) -> list[BookDeadline]:
    simultaneous_groups = validate_simultaneous_groups(
        books, simultaneous_groups or []
    )
    page_count = page_count or (lambda book: book.pages)
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
        group_pages = sum(page_count(group_book) for group_book in group_books)
        cumulative_pages += group_pages
        if daily_pace <= 0 or cumulative_pages == 0:
            cumulative_days = previous_cumulative_days
        else:
            cumulative_days = max(
                1, math.ceil(cumulative_pages / daily_pace - 1e-9)
            )
        days_allocated = cumulative_days - previous_cumulative_days
        deadline = start_date + timedelta(days=max(cumulative_days - 1, 0))
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
            book_pages = page_count(group_book)
            individual_cumulative_pages += book_pages
            if book_pages == 0:
                daily_pages = 0.0
            elif len(group_books) == 1:
                daily_pages = daily_pace
            elif group_pages == 0:
                daily_pages = 0.0
            else:
                daily_pages = daily_pace * book_pages / group_pages
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
    page_count: Callable[[Book], int] | None = None,
) -> tuple[list[BookDeadline], int, float, str]:
    page_count = page_count or (lambda book: book.pages)
    total_pages = sum(page_count(book) for book in books)
    period_days = inclusive_days_between(start_date, end_date)
    required_pace = total_pages / period_days
    deadlines = calculate_deadlines(
        books,
        start_date,
        end_date,
        daily_pace,
        simultaneous_groups,
        page_count,
    )
    overall_status = (
        "achievable"
        if not deadlines or deadlines[-1].deadline <= end_date
        else "not achievable"
    )
    return deadlines, total_pages, required_pace, overall_status


def build_section_plan(
    section: BookSection, start_date: date, end_date: date
) -> SectionPlan:
    if not section.books:
        return SectionPlan(section, [], 0.0, 0, 0.0, "achievable")

    period_days = inclusive_days_between(start_date, end_date)
    daily_pace = (
        sum(total_units(book, section.label) for book in section.books) / period_days
    )
    deadlines, total_pages, required_pace, overall_status = build_plan(
        section.books,
        start_date,
        end_date,
        daily_pace,
        section.simultaneous_groups,
        lambda book: total_units(book, section.label),
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
    return summarize_section_plans(section_plans)


def build_remaining_section_plan(
    section: BookSection,
    start_date: date,
    end_date: date,
    today: date | None = None,
) -> SectionPlan:
    if not section.books:
        return SectionPlan(section, [], 0.0, 0, 0.0, "achievable")

    remaining_start = effective_remaining_start_date(start_date, end_date, today)
    period_days = inclusive_days_between(remaining_start, end_date)
    remaining_total = sum(remaining_units(book, section.label) for book in section.books)
    daily_pace = 0.0 if remaining_total == 0 else remaining_total / period_days
    deadlines, total_pages, required_pace, overall_status = build_plan(
        section.books,
        remaining_start,
        end_date,
        daily_pace,
        section.simultaneous_groups,
        lambda book: remaining_units(book, section.label),
    )
    return SectionPlan(
        section, deadlines, daily_pace, total_pages, required_pace, overall_status
    )


def build_remaining_section_plans(
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    today: date | None = None,
) -> tuple[list[SectionPlan], int, float, str]:
    section_plans = [
        build_remaining_section_plan(section, start_date, end_date, today)
        for section in sections
    ]
    return summarize_section_plans(section_plans)


def summarize_section_plans(
    section_plans: list[SectionPlan],
) -> tuple[list[SectionPlan], int, float, str]:
    page_plans = [
        section_plan
        for section_plan in section_plans
        if not is_audiobook_section(section_plan.section.label)
    ]
    total_pages = sum(section_plan.total_pages for section_plan in page_plans)
    highest_daily_pace = max(
        (section_plan.daily_pace for section_plan in page_plans), default=0.0
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


def section_plan_by_label(
    section_plans: list[SectionPlan], label: str
) -> SectionPlan:
    return next(
        section_plan
        for section_plan in section_plans
        if section_plan.section.label == label
    )


def section_plan_value(section_plan: SectionPlan, value: int | float) -> str:
    if is_audiobook_section(section_plan.section.label):
        return format_duration(value)
    return str(int(value))


def section_daily_pace(section_plan: SectionPlan) -> str:
    if is_audiobook_section(section_plan.section.label):
        return f"{format_duration(section_plan.daily_pace)}/day"
    return f"{section_plan.daily_pace:.2f} pages/day"


def section_csv_daily_pace(section_plan: SectionPlan) -> str:
    if is_audiobook_section(section_plan.section.label):
        return f"{format_duration(section_plan.daily_pace)}/day"
    return f"{section_plan.daily_pace:.15g} pages/day"


def average_pages_per_book(section_plan: SectionPlan) -> float:
    book_count = len(section_plan.section.books)
    return 0.0 if book_count == 0 else section_plan.total_pages / book_count


def optional_summary_stat_rows(
    section_plans: list[SectionPlan],
    start_date: date,
    end_date: date,
    highest_daily_pace: float,
    stats_options: SummaryStatsOptions,
) -> list[tuple[str, str]]:
    physical_plan = section_plan_by_label(section_plans, PHYSICAL_BOOKS_LABEL)
    digital_plan = section_plan_by_label(section_plans, DIGITAL_BOOKS_LABEL)
    audiobook_plan = section_plan_by_label(section_plans, AUDIOBOOKS_LABEL)
    rows: list[tuple[str, str]] = []

    if stats_options.book_counts:
        rows.extend(
            [
                ("Physical book count", str(len(physical_plan.section.books))),
                ("Digital book count", str(len(digital_plan.section.books))),
                ("Audiobook count", str(len(audiobook_plan.section.books))),
            ]
        )
    if stats_options.page_share:
        total_pages = physical_plan.total_pages + digital_plan.total_pages
        physical_share = (
            0.0 if total_pages == 0 else physical_plan.total_pages / total_pages * 100
        )
        digital_share = (
            0.0 if total_pages == 0 else digital_plan.total_pages / total_pages * 100
        )
        rows.extend(
            [
                ("Physical page share", f"{physical_share:.1f}%"),
                ("Digital page share", f"{digital_share:.1f}%"),
            ]
        )
    if stats_options.average_pages:
        rows.extend(
            [
                (
                    "Physical average pages/book",
                    f"{average_pages_per_book(physical_plan):.1f}",
                ),
                (
                    "Digital average pages/book",
                    f"{average_pages_per_book(digital_plan):.1f}",
                ),
                (
                    "Audiobook average duration",
                    format_duration(average_pages_per_book(audiobook_plan)),
                ),
            ]
        )
    if stats_options.reading_period:
        rows.append(
            ("Reading period", f"{inclusive_days_between(start_date, end_date)} days")
        )
    if stats_options.pace_driver:
        pace_drivers = [
            section_plan.section.label
            for section_plan in section_plans
            if not is_audiobook_section(section_plan.section.label)
            and section_plan.total_pages > 0
            and abs(section_plan.daily_pace - highest_daily_pace) < 1e-9
        ]
        driver_label = ", ".join(pace_drivers) if pace_drivers else "None"
        rows.append(
            (
                "Pace driver",
                f"{driver_label} ({highest_daily_pace:.2f} pages/day)",
            )
        )

    return rows


def final_result_message(final_deadline: date, end_date: date, end_name: str) -> str:
    difference = (end_date - final_deadline).days
    if difference > 0:
        return f"You finish {difference} day{'s' if difference != 1 else ''} before the {end_name}."
    if difference == 0:
        return f"You finish exactly on the {end_name}."
    late_days = abs(difference)
    return f"You finish {late_days} day{'s' if late_days != 1 else ''} after the {end_name}."


def csv_table_headers(section_label: str) -> list[str]:
    if is_audiobook_section(section_label):
        return [
            "Book",
            "Title",
            "Start time",
            "End time",
            "Remaining time",
            "Duration",
            "Daily time",
            "Cumulative remaining time",
            "Start date",
            "Deadline",
            "Days allocated",
            "Status",
        ]
    return [
        "Book",
        "Title",
        "Start page",
        "End page",
        "Current page",
        "Pages",
        "Read pages",
        "Remaining pages",
        "Daily pages",
        "Cumulative remaining pages",
        "Start date",
        "Deadline",
        "Days allocated",
        "Status",
    ]


def csv_table_row(deadline: BookDeadline, section_label: str) -> list[object]:
    book = deadline.book
    if is_audiobook_section(section_label):
        return [
            book.number,
            book.title,
            format_duration(book.start_page),
            format_duration(book.end_page),
            format_duration(remaining_units(book, section_label)),
            format_duration(total_units(book, section_label)),
            format_duration(deadline.daily_pages),
            format_duration(deadline.cumulative_pages),
            deadline.start_date.isoformat(),
            deadline.deadline.isoformat(),
            deadline.days_allocated,
            deadline.status,
        ]
    return [
        book.number,
        book.title,
        book.start_page,
        book.end_page,
        "" if book.current_page is None else book.current_page,
        book.pages,
        book.pages_read,
        pages_remaining(book),
        f"{deadline.daily_pages:.15g}",
        deadline.cumulative_pages,
        deadline.start_date.isoformat(),
        deadline.deadline.isoformat(),
        deadline.days_allocated,
        deadline.status,
    ]


def write_csv(
    filename: str,
    section_plans: list[SectionPlan],
    start_date: date,
    end_date: date,
    total_pages: int,
    highest_daily_pace: float,
    overall_status: str,
    end_label: str,
    stats_options: SummaryStatsOptions,
) -> None:
    path = Path(filename)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Reading plan"])
        writer.writerow(["Start date", start_date.isoformat()])
        writer.writerow([end_label, end_date.isoformat()])
        physical_plan = section_plan_by_label(section_plans, PHYSICAL_BOOKS_LABEL)
        digital_plan = section_plan_by_label(section_plans, DIGITAL_BOOKS_LABEL)
        audiobook_plan = section_plan_by_label(section_plans, AUDIOBOOKS_LABEL)
        writer.writerow(["Total remaining pages", total_pages])
        writer.writerow(["Physical remaining pages", physical_plan.total_pages])
        writer.writerow(["Digital remaining pages", digital_plan.total_pages])
        writer.writerow(
            ["Audiobook remaining time", format_duration(audiobook_plan.total_pages)]
        )
        writer.writerow(["Highest daily pace", f"{highest_daily_pace:.15g} pages/day"])
        writer.writerow(
            ["Audiobook daily time", format_duration(audiobook_plan.daily_pace) + "/day"]
        )
        writer.writerow(["Status", overall_status])
        for label, value in optional_summary_stat_rows(
            section_plans, start_date, end_date, highest_daily_pace, stats_options
        ):
            writer.writerow([label, value])

        for section_plan in section_plans:
            writer.writerow([])
            writer.writerow([section_plan.section.label])
            writer.writerow(["Daily pace", section_csv_daily_pace(section_plan)])
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
            writer.writerow(csv_table_headers(section_plan.section.label))
            for deadline in section_plan.deadlines:
                writer.writerow(csv_table_row(deadline, section_plan.section.label))


def parse_csv_book_table(
    rows: list[list[str]], header_index: int, stop_at_blank: bool, section_label: str
) -> tuple[list[Book], int]:
    books: list[Book] = []
    index = header_index + 1
    headers = rows[header_index]
    header_indexes = {header: idx for idx, header in enumerate(headers)}
    start_page_index = header_indexes.get("Start page")
    end_page_index = header_indexes.get("End page")
    current_page_index = header_indexes.get("Current page")
    start_time_index = header_indexes.get("Start time")
    end_time_index = header_indexes.get("End time")
    current_time_index = header_indexes.get("Current time")
    remaining_time_index = header_indexes.get("Remaining time")
    pages_index = header_indexes.get("Pages", 2)
    pages_read_index = header_indexes.get("Read pages", header_indexes.get("Pages read"))
    duration_index = header_indexes.get("Duration")
    time_listened_index = header_indexes.get("Time listened")

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
            if is_audiobook_section(section_label):
                if start_time_index is not None and end_time_index is not None:
                    start_page = parse_duration(row[start_time_index])
                    end_page = parse_duration(row[end_time_index])
                else:
                    duration = (
                        parse_duration(row[duration_index])
                        if duration_index is not None
                        else parse_duration(row[pages_index])
                    )
                    start_page = 0
                    end_page = duration
                pages_read = (
                    parse_duration(row[time_listened_index])
                    if time_listened_index is not None
                    and len(row) > time_listened_index
                    and row[time_listened_index].strip()
                    else 0
                )
                if (
                    remaining_time_index is not None
                    and len(row) > remaining_time_index
                    and row[remaining_time_index].strip()
                ):
                    current_page = current_time_from_remaining_time(
                        start_page,
                        end_page,
                        parse_duration(row[remaining_time_index]),
                    )
                else:
                    current_page = (
                        parse_duration(row[current_time_index])
                        if current_time_index is not None
                        and len(row) > current_time_index
                        and row[current_time_index].strip()
                        else None
                    )
            elif start_page_index is not None and end_page_index is not None:
                start_page = int(row[start_page_index])
                end_page = int(row[end_page_index])
                pages_read = (
                    int(row[pages_read_index])
                    if pages_read_index is not None and len(row) > pages_read_index
                    else 0
                )
                current_page = (
                    int(row[current_page_index])
                    if current_page_index is not None
                    and len(row) > current_page_index
                    and row[current_page_index].strip()
                    else None
                )
            else:
                pages = int(row[pages_index])
                start_page = 1
                end_page = pages
                pages_read = (
                    int(row[pages_read_index])
                    if pages_read_index is not None and len(row) > pages_read_index
                    else 0
                )
                current_page = (
                    int(row[current_page_index])
                    if current_page_index is not None
                    and len(row) > current_page_index
                    and row[current_page_index].strip()
                    else None
                )
        except ValueError as error:
            if is_audiobook_section(section_label):
                raise ValueError("audiobook time fields must be HH:MM or HH:MM:SS") from error
            raise ValueError("book page fields must be whole numbers") from error
        title = row[1].strip()
        validate_book_range(section_label, start_page, end_page)
        if pages_read < 0 or not title:
            raise ValueError("each book needs a title and valid range")
        if current_page is None and pages_read > 0:
            current_page = (
                start_page + pages_read
                if is_audiobook_section(section_label)
                else start_page + pages_read - 1
            )
        if current_page is not None:
            current_page = min(max(current_page, start_page), end_page)
        books.append(
            Book(
                number=len(books) + 1,
                title=title,
                start_page=start_page,
                end_page=end_page,
                current_page=current_page,
            )
        )
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
                or row[:3] == ["Book", "Title", "Start page"]
                or row[:3] == ["Book", "Title", "Start time"]
            )
        ),
        len(rows),
    )
    metadata = {
        row[0]: row[1]
        for row in rows[:first_plan_row_index]
        if len(row) >= 2 and row[0] and row[0] != "Book"
    }
    if "Start date" not in metadata:
        raise ValueError("missing required field: Start date")

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
            if index >= len(rows) or rows[index][:2] != ["Book", "Title"]:
                raise ValueError(f"missing {label} book table header")
            books, index = parse_csv_book_table(
                rows, index, stop_at_blank=True, section_label=label
            )
            groups = parse_csv_simultaneous_groups(books, raw_groups, label)
            sections_by_label[label] = BookSection(label, books, groups)
        sections = [sections_by_label[label] for label in BOOK_SECTION_LABELS]
    else:
        try:
            header_index = next(
                index
                for index, row in enumerate(rows)
                if row[:3] == ["Book", "Title", "Pages"]
                or row[:3] == ["Book", "Title", "Start page"]
                or row[:3] == ["Book", "Title", "Start time"]
            )
        except StopIteration as error:
            raise ValueError("missing book table header") from error
        books, _ = parse_csv_book_table(
            rows,
            header_index,
            stop_at_blank=False,
            section_label=PHYSICAL_BOOKS_LABEL,
        )
        groups = parse_csv_simultaneous_groups(
            books, metadata.get("Simultaneous groups", "").strip(), PHYSICAL_BOOKS_LABEL
        )
        sections = [
            BookSection(PHYSICAL_BOOKS_LABEL, books, groups),
            BookSection(DIGITAL_BOOKS_LABEL, [], []),
            BookSection(AUDIOBOOKS_LABEL, [], []),
        ]

    if not any(section.books for section in sections):
        raise ValueError("no books found")
    return sections, start_date, end_date, end_label, end_name


def summary_stats_options_to_json(options: SummaryStatsOptions) -> dict[str, bool]:
    return {
        "book_counts": options.book_counts,
        "page_share": options.page_share,
        "average_pages": options.average_pages,
        "reading_period": options.reading_period,
        "pace_driver": options.pace_driver,
    }


def summary_stats_options_from_json(value: object | None) -> SummaryStatsOptions:
    if not isinstance(value, dict):
        return SummaryStatsOptions(True, True, True, True, True)
    return SummaryStatsOptions(
        book_counts=bool(value.get("book_counts", True)),
        page_share=bool(value.get("page_share", True)),
        average_pages=bool(value.get("average_pages", True)),
        reading_period=bool(value.get("reading_period", True)),
        pace_driver=bool(value.get("pace_driver", True)),
    )


def reading_session_to_json(
    session: ReadingSession, section_label: str, book: Book | None = None
) -> dict[str, object]:
    if is_audiobook_section(section_label):
        payload: dict[str, object] = {
            "date": session.date.isoformat(),
            "current_time_seconds": session.current_page,
            "time_listened_seconds": session.pages_read,
        }
        if book is not None:
            payload["remaining_time_seconds"] = remaining_time_at_current(
                book, session.current_page
            )
        return payload
    return {
        "date": session.date.isoformat(),
        "current_page": session.current_page,
        "pages_read": session.pages_read,
    }


def parse_session_date(value: object) -> date:
    if not isinstance(value, dict):
        raise ValueError("each reading session must be a JSON object")
    try:
        return parse_date(str(value["date"]))
    except KeyError as error:
        raise ValueError(f"missing reading session field: {error.args[0]}") from error
    except ValueError as error:
        raise ValueError("invalid reading session") from error


def book_to_json(book: Book, section_label: str) -> dict[str, object]:
    if is_audiobook_section(section_label):
        return {
            "number": book.number,
            "title": book.title,
            "start_time_seconds": book.start_page,
            "end_time_seconds": book.end_page,
            "current_time_seconds": book.current_page,
            "duration_seconds": total_units(book, section_label),
            "time_listened_seconds": completed_units(book, section_label),
            "remaining_time_seconds": (
                None
                if book.current_page is None
                else remaining_units(book, section_label)
            ),
            "reading_sessions": [
                reading_session_to_json(session, section_label, book)
                for session in book.reading_sessions
            ],
        }
    return {
        "number": book.number,
        "title": book.title,
        "start_page": book.start_page,
        "end_page": book.end_page,
        "current_page": book.current_page,
        "pages": book.pages,
        "pages_read": book.pages_read,
        "reading_sessions": [
            reading_session_to_json(session, section_label)
            for session in book.reading_sessions
        ],
    }


def book_from_json(
    value: object, fallback_number: int, section_label: str
) -> Book:
    if not isinstance(value, dict):
        raise ValueError("each book must be a JSON object")
    title = str(value.get("title", "")).strip()
    if not title:
        raise ValueError("each book needs a title")
    try:
        if is_audiobook_section(section_label):
            if "start_time_seconds" in value and "end_time_seconds" in value:
                start_page = int(value["start_time_seconds"])
                end_page = int(value["end_time_seconds"])
            else:
                duration = int(value.get("duration_seconds", value.get("pages", 0)))
                start_page = 0
                end_page = duration
            pages_read = int(value.get("time_listened_seconds", 0))
            raw_remaining_time = value.get("remaining_time_seconds")
            raw_current_page = value.get("current_time_seconds")
        elif "start_page" in value and "end_page" in value:
            start_page = int(value["start_page"])
            end_page = int(value["end_page"])
            pages_read = int(value.get("pages_read", 0))
            raw_remaining_time = None
            raw_current_page = value.get("current_page")
        else:
            pages = int(value.get("pages", 0))
            start_page = 1
            end_page = pages
            pages_read = int(value.get("pages_read", 0))
            raw_remaining_time = None
            raw_current_page = value.get("current_page")
        if is_audiobook_section(section_label) and raw_remaining_time not in (None, ""):
            current_page = current_time_from_remaining_time(
                start_page, end_page, int(raw_remaining_time)
            )
        else:
            current_page = (
                None
                if raw_current_page is None or raw_current_page == ""
                else int(raw_current_page)
            )
    except (TypeError, ValueError) as error:
        if is_audiobook_section(section_label):
            raise ValueError("audiobook time fields must be whole numbers") from error
        raise ValueError("book page fields must be whole numbers") from error
    validate_book_range(section_label, start_page, end_page)
    if pages_read < 0:
        if is_audiobook_section(section_label):
            raise ValueError("time listened cannot be negative")
        raise ValueError("pages read cannot be negative")

    raw_sessions = value.get("reading_sessions", [])
    if not isinstance(raw_sessions, list):
        raise ValueError("reading_sessions must be a list")
    reading_sessions: list[ReadingSession] = []
    previous_current_page: int | None = None
    for raw_session in raw_sessions:
        if not isinstance(raw_session, dict):
            raise ValueError("each reading session must be a JSON object")
        session_date = parse_session_date(raw_session)
        try:
            if is_audiobook_section(section_label):
                raw_remaining_time = raw_session.get("remaining_time_seconds")
                if raw_remaining_time not in (None, ""):
                    session_current_page = current_time_from_remaining_time(
                        start_page, end_page, int(raw_remaining_time)
                    )
                    previous_total = (
                        0
                        if previous_current_page is None
                        else previous_current_page - start_page
                    )
                    session_pages_read = int(
                        raw_session.get(
                            "time_listened_seconds",
                            session_current_page - start_page - previous_total,
                        )
                    )
                elif "current_time_seconds" in raw_session:
                    session_current_page = int(raw_session["current_time_seconds"])
                    previous_total = (
                        0
                        if previous_current_page is None
                        else previous_current_page - start_page
                    )
                    session_pages_read = int(
                        raw_session.get(
                            "time_listened_seconds",
                            session_current_page - start_page - previous_total,
                        )
                    )
                else:
                    session_pages_read = int(
                        raw_session.get("pages", raw_session.get("pages_read"))
                    )
                    session_current_page = (
                        start_page + session_pages_read
                        if previous_current_page is None
                        else previous_current_page + session_pages_read
                    )
            elif "current_page" in raw_session:
                session_current_page = int(raw_session["current_page"])
                previous_total = (
                    0
                    if previous_current_page is None
                    else previous_current_page - start_page + 1
                )
                session_pages_read = int(
                    raw_session.get(
                        "pages_read",
                        session_current_page - start_page + 1 - previous_total,
                    )
                )
            else:
                session_pages_read = int(raw_session["pages"])
                session_current_page = (
                    start_page + session_pages_read - 1
                    if previous_current_page is None
                    else previous_current_page + session_pages_read
                )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("invalid reading session") from error
        if session_pages_read <= 0:
            if is_audiobook_section(section_label):
                raise ValueError("reading session time must be positive")
            raise ValueError("reading session pages must be positive")
        session_current_page = min(max(session_current_page, start_page), end_page)
        reading_sessions.append(
            ReadingSession(session_date, session_current_page, session_pages_read)
        )
        previous_current_page = max(
            previous_current_page or session_current_page, session_current_page
        )

    if current_page is None and reading_sessions:
        current_page = max(session.current_page for session in reading_sessions)
    elif current_page is None and pages_read > 0:
        current_page = (
            start_page + pages_read
            if is_audiobook_section(section_label)
            else start_page + pages_read - 1
        )
    if current_page is not None:
        current_page = min(max(current_page, start_page), end_page)

    return Book(
        number=fallback_number,
        title=title,
        start_page=start_page,
        end_page=end_page,
        current_page=current_page,
        reading_sessions=reading_sessions,
    )


def book_section_to_json(section: BookSection) -> dict[str, object]:
    return {
        "label": section.label,
        "books": [book_to_json(book, section.label) for book in section.books],
        "simultaneous_groups": [
            list(group) for group in section.simultaneous_groups
        ],
    }


def book_section_from_json(value: object, default_label: str) -> BookSection:
    if not isinstance(value, dict):
        raise ValueError("each section must be a JSON object")
    label = canonical_section_label(value.get("label", default_label), default_label)
    if label not in BOOK_SECTION_LABELS:
        return BookSection(label, [], [])
    raw_books = value.get("books", [])
    if not isinstance(raw_books, list):
        raise ValueError(f"{label} books must be a list")
    books = [
        book_from_json(book_value, fallback_number=index, section_label=label)
        for index, book_value in enumerate(raw_books, start=1)
    ]
    renumber_books(books)

    raw_groups = value.get("simultaneous_groups", [])
    if not isinstance(raw_groups, list):
        raise ValueError(f"{label} simultaneous groups must be a list")
    groups: list[tuple[int, ...]] = []
    for raw_group in raw_groups:
        if not isinstance(raw_group, list):
            raise ValueError(f"{label} simultaneous groups must be lists")
        try:
            groups.append(tuple(int(book_id) for book_id in raw_group))
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"{label} simultaneous group IDs must be whole numbers"
            ) from error
    return BookSection(label, books, validate_simultaneous_groups(books, groups))


def write_json_plan(
    filename: str,
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    end_label: str,
    stats_options: SummaryStatsOptions,
) -> None:
    payload = {
        "schema_version": 4,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "end_label": end_label,
        "stats_options": summary_stats_options_to_json(stats_options),
        "sections": [book_section_to_json(section) for section in sections],
    }
    Path(filename).write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def load_json_plan(
    filename: str,
) -> tuple[list[BookSection], date, date, str, str, SummaryStatsOptions]:
    try:
        payload = json.loads(Path(filename).read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("invalid JSON") from error
    if not isinstance(payload, dict):
        raise ValueError("the JSON plan must be an object")

    try:
        start_date = parse_date(str(payload["start_date"]))
        end_date = parse_date(str(payload["end_date"]))
    except KeyError as error:
        raise ValueError(f"missing required field: {error.args[0]}") from error
    except ValueError as error:
        raise ValueError("invalid date") from error
    if end_date < start_date:
        raise ValueError("finish date must be on or after the start date")

    end_label = str(payload.get("end_label", "")).strip()
    if end_label not in {"Target finish date", "Quarter end"}:
        end_label = (
            "Quarter end"
            if end_date == period_end_from_start(start_date)
            else "Target finish date"
        )
    end_name = (
        "target finish date"
        if end_label == "Target finish date"
        else "quarter end date"
    )

    raw_sections = payload.get("sections", [])
    if not isinstance(raw_sections, list):
        raise ValueError("sections must be a list")
    sections_by_label = {
        label: BookSection(label, [], []) for label in BOOK_SECTION_LABELS
    }
    for index, raw_section in enumerate(raw_sections):
        default_label = (
            BOOK_SECTION_LABELS[index]
            if index < len(BOOK_SECTION_LABELS)
            else f"Section {index + 1}"
        )
        section = book_section_from_json(raw_section, default_label)
        if section.label in BOOK_SECTION_LABELS:
            sections_by_label[section.label] = section

    sections = [sections_by_label[label] for label in BOOK_SECTION_LABELS]
    return (
        sections,
        start_date,
        end_date,
        end_label,
        end_name,
        summary_stats_options_from_json(payload.get("stats_options")),
    )
