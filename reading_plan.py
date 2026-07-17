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
class BaselineSchedule:
    start_date: date
    deadline: date
    daily_target: float


@dataclass(frozen=True)
class RestDayRange:
    start_date: date
    end_date: date


def validate_rest_day_range(start_date: date, end_date: date) -> None:
    if end_date < start_date:
        raise ValueError("rest-day end date must be on or after the start date")


def normalize_rest_day_ranges(
    ranges: list[RestDayRange] | None,
) -> list[RestDayRange]:
    normalized = sorted(ranges or [], key=lambda item: item.start_date)
    for item in normalized:
        validate_rest_day_range(item.start_date, item.end_date)
    merged: list[RestDayRange] = []
    for item in normalized:
        if not merged or item.start_date > merged[-1].end_date + timedelta(days=1):
            merged.append(item)
        else:
            merged[-1] = RestDayRange(
                merged[-1].start_date,
                max(merged[-1].end_date, item.end_date),
            )
    return merged


@dataclass
class Book:
    number: int
    title: str
    start_page: int
    end_page: int
    current_page: int | None = None
    reading_sessions: list[ReadingSession] = field(default_factory=list)
    baseline_schedule: BaselineSchedule | None = None
    deadline_override: date | None = None

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
    baseline_needs_recalculation: bool = False


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


def validate_deadline_override(
    deadline: date, plan_end: date, today: date | None = None
) -> None:
    today = today or date.today()
    if deadline < today:
        raise ValueError("deadline override cannot be before today")
    if deadline > plan_end:
        raise ValueError("deadline override cannot be after the plan finish date")


def active_simultaneous_groups(section: BookSection) -> list[tuple[int, ...]]:
    """Return groups after independently scheduled books are excluded."""
    active_groups: list[tuple[int, ...]] = []
    for group in section.simultaneous_groups:
        active_ids = tuple(
            book_id
            for book_id in group
            if section.books[book_id - 1].deadline_override is None
        )
        if len(active_ids) >= 2:
            active_groups.append(active_ids)
    return active_groups


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


def available_reading_days(
    start: date, end: date, rest_days: list[RestDayRange] | None = None
) -> list[date]:
    if end < start:
        return []
    rest_days = normalize_rest_day_ranges(rest_days)
    return [
        start + timedelta(days=offset)
        for offset in range(inclusive_days_between(start, end))
        if not any(
            rest.start_date
            <= start + timedelta(days=offset)
            <= rest.end_date
            for rest in rest_days
        )
    ]


def available_reading_days_count(
    start: date, end: date, rest_days: list[RestDayRange] | None = None
) -> int:
    return len(available_reading_days(start, end, rest_days))


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
    start_date: date,
    end_date: date,
    today: date | None = None,
    rest_days: list[RestDayRange] | None = None,
) -> date:
    today = today or date.today()
    candidate = min(max(start_date, today), end_date)
    return next(iter(available_reading_days(candidate, end_date, rest_days)), end_date)


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
    books: list[Book], groups: list[tuple[int, ...]], require_consecutive: bool = True
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
        if require_consecutive and ids != tuple(range(ids[0], ids[-1] + 1)):
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


def _deadline_status(deadline: date, end_date: date) -> str:
    if deadline < end_date:
        return "before end"
    if deadline == end_date:
        return "on end date"
    return "after end"

def calculate_deadlines(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
    simultaneous_groups: list[tuple[int, ...]] | None = None,
    page_count: Callable[[Book], int] | None = None,
    rest_days: list[RestDayRange] | None = None,
) -> list[BookDeadline]:
    simultaneous_groups = validate_simultaneous_groups(
        books, simultaneous_groups or [], require_consecutive=False
    )
    page_count = page_count or (lambda book: book.pages)
    group_by_first_book = {group[0]: group for group in simultaneous_groups}
    books_by_number = {book.number: book for book in books}
    grouped_book_ids = {book_id for group in simultaneous_groups for book_id in group}
    deadlines: list[BookDeadline] = []
    reading_dates = available_reading_days(start_date, end_date, rest_days)
    cumulative_pages = 0
    previous_cumulative_days = 0
    book_index = 0

    while book_index < len(books):
        book = books[book_index]
        if book.number in grouped_book_ids and book.number not in group_by_first_book:
            book_index += 1
            continue

        group_ids = group_by_first_book.get(book.number, (book.number,))
        group_books = [books_by_number[book_id] for book_id in group_ids]
        group_pages = sum(page_count(group_book) for group_book in group_books)
        cumulative_pages += group_pages
        if daily_pace <= 0 or cumulative_pages == 0:
            cumulative_days = previous_cumulative_days
        else:
            cumulative_days = max(
                1, math.ceil(cumulative_pages / daily_pace - 1e-9)
            )
        days_allocated = cumulative_days - previous_cumulative_days
        if reading_dates:
            deadline = reading_dates[min(cumulative_days, len(reading_dates)) - 1]
            group_start_date = (
                deadline
                if days_allocated == 0
                else reading_dates[previous_cumulative_days]
            )
        else:
            deadline = end_date
            group_start_date = end_date

        status = _deadline_status(deadline, end_date)

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
        book_index += 1

    return deadlines


def build_plan(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
    simultaneous_groups: list[tuple[int, ...]] | None = None,
    page_count: Callable[[Book], int] | None = None,
    rest_days: list[RestDayRange] | None = None,
) -> tuple[list[BookDeadline], int, float, str]:
    page_count = page_count or (lambda book: book.pages)
    total_pages = sum(page_count(book) for book in books)
    period_days = available_reading_days_count(start_date, end_date, rest_days)
    required_pace = total_pages / period_days if period_days else 0.0
    deadlines = calculate_deadlines(
        books,
        start_date,
        end_date,
        daily_pace,
        simultaneous_groups,
        page_count,
        rest_days,
    )
    overall_status = (
        "achievable"
        if (
            not total_pages
            or (
                period_days
                and (not deadlines or deadlines[-1].deadline <= end_date)
            )
        )
        else "not achievable"
    )
    return deadlines, total_pages, required_pace, overall_status


def build_section_plan(
    section: BookSection,
    start_date: date,
    end_date: date,
    rest_days: list[RestDayRange] | None = None,
) -> SectionPlan:
    if not section.books:
        return SectionPlan(section, [], 0.0, 0, 0.0, "achievable")

    period_days = available_reading_days_count(start_date, end_date, rest_days)
    daily_pace = (
        sum(total_units(book, section.label) for book in section.books) / period_days
        if period_days
        else 0.0
    )
    deadlines, total_pages, required_pace, overall_status = build_plan(
        section.books,
        start_date,
        end_date,
        daily_pace,
        active_simultaneous_groups(section),
        lambda book: total_units(book, section.label),
        rest_days,
    )
    return SectionPlan(
        section, deadlines, daily_pace, total_pages, required_pace, overall_status
    )


def build_section_plans(
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    rest_days: list[RestDayRange] | None = None,
) -> tuple[list[SectionPlan], int, float, str]:
    section_plans = [
        build_section_plan(section, start_date, end_date, rest_days)
        for section in sections
    ]
    return summarize_section_plans(section_plans)


def calculate_baseline_schedules(
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    rest_days: list[RestDayRange] | None = None,
) -> None:
    for section in sections:
        for deadline in build_section_plan(
            section, start_date, end_date, rest_days
        ).deadlines:
            deadline.book.baseline_schedule = BaselineSchedule(
                deadline.start_date, deadline.deadline, deadline.daily_pages
            )
        apply_persisted_deadline_overrides(section, end_date, rest_days=rest_days)
        section.baseline_needs_recalculation = False


def recalculate_baseline_schedules(
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    rest_days: list[RestDayRange] | None = None,
) -> None:
    """Replace every baseline with a schedule for the current unfinished work."""
    for section in sections:
        daily_pace = (
            sum(remaining_units(book, section.label) for book in section.books)
            / available_reading_days_count(start_date, end_date, rest_days)
            if section.books
            and available_reading_days_count(start_date, end_date, rest_days)
            else 0.0
        )
        deadlines, _total_units, _required_pace, _overall_status = build_plan(
            section.books,
            start_date,
            end_date,
            daily_pace,
            active_simultaneous_groups(section),
            lambda book: remaining_units(book, section.label),
            rest_days,
        )
        for deadline in deadlines:
            deadline.book.baseline_schedule = BaselineSchedule(
                deadline.start_date, deadline.deadline, deadline.daily_pages
            )
        apply_persisted_deadline_overrides(section, end_date, rest_days=rest_days)
        section.baseline_needs_recalculation = False




def apply_deadline_override(
    section: BookSection,
    book: Book,
    deadline_override: date | None,
    plan_end: date,
    today: date | None = None,
    rest_days: list[RestDayRange] | None = None,
) -> None:
    """Apply one book deadline without changing unrelated baseline schedules."""
    today = today or date.today()
    if book.baseline_schedule is None:
        raise ValueError("calculate the plan before setting a deadline override")
    if deadline_override is not None:
        validate_deadline_override(deadline_override, plan_end, today)

    containing_group = next(
        (group for group in section.simultaneous_groups if book.number in group), None
    )
    book.deadline_override = deadline_override
    if deadline_override is None:
        reference_deadline = plan_end
        if containing_group:
            other_books = [
                section.books[book_id - 1]
                for book_id in containing_group
                if book_id != book.number
                and section.books[book_id - 1].baseline_schedule is not None
            ]
            if other_books:
                reference_deadline = other_books[0].baseline_schedule.deadline
        deadline = reference_deadline
    else:
        deadline = deadline_override

    start_date = book.baseline_schedule.start_date
    remaining = remaining_units(book, section.label)
    pace_start = effective_remaining_start_date(start_date, deadline, today, rest_days)
    available_days = available_reading_days_count(pace_start, deadline, rest_days)
    daily_target = remaining / available_days if remaining and available_days else 0.0
    book.baseline_schedule = BaselineSchedule(pace_start, deadline, daily_target)

    if containing_group:
        active_group = tuple(
            book_id
            for book_id in containing_group
            if section.books[book_id - 1].deadline_override is None
        )
        if len(active_group) >= 2:
            reference = section.books[active_group[0] - 1].baseline_schedule
            shared_start = reference.start_date
            shared_deadline = reference.deadline
            group_books = [section.books[book_id - 1] for book_id in active_group]
            group_remaining = sum(
                remaining_units(group_book, section.label) for group_book in group_books
            )
            group_start = effective_remaining_start_date(
                shared_start, shared_deadline, today, rest_days
            )
            group_days = available_reading_days_count(
                group_start, shared_deadline, rest_days
            )
            group_pace = (
                group_remaining / group_days if group_remaining and group_days else 0.0
            )
            for group_book in group_books:
                book_remaining = remaining_units(group_book, section.label)
                daily_target = (
                    group_pace * book_remaining / group_remaining
                    if group_remaining and book_remaining
                    else 0.0
                )
                group_book.baseline_schedule = BaselineSchedule(
                    shared_start, shared_deadline, daily_target
                )

    section.baseline_needs_recalculation = False


def apply_persisted_deadline_overrides(
    section: BookSection,
    plan_end: date,
    today: date | None = None,
    rest_days: list[RestDayRange] | None = None,
) -> None:
    for book in section.books:
        if book.deadline_override is not None:
            apply_deadline_override(
                section, book, book.deadline_override, plan_end, today, rest_days
            )



def _next_reading_day_after(
    day: date, end_date: date, rest_days: list[RestDayRange] | None
) -> date:
    reading_dates = available_reading_days(day + timedelta(days=1), end_date, rest_days)
    return reading_dates[0] if reading_dates else end_date + timedelta(days=1)


def _reflow_deadlines_for_books(
    books: list[Book],
    start_date: date,
    end_date: date,
    daily_pace: float,
    page_count: Callable[[Book], int],
    rest_days: list[RestDayRange] | None,
    cumulative_pages: int,
) -> tuple[list[BookDeadline], date, int]:
    group_pages = sum(page_count(book) for book in books)
    cumulative_pages += group_pages
    if group_pages and daily_pace > 0:
        days_allocated = max(1, math.ceil(group_pages / daily_pace - 1e-9))
    else:
        days_allocated = 0

    reading_dates = available_reading_days(start_date, end_date, rest_days)
    fits = not group_pages or (
        daily_pace > 0 and len(reading_dates) >= days_allocated
    )
    if not group_pages:
        deadline = start_date if reading_dates else end_date
        group_start = deadline
    elif fits:
        group_start = reading_dates[0]
        deadline = reading_dates[days_allocated - 1]
    else:
        group_start = reading_dates[0] if reading_dates else end_date + timedelta(days=1)
        deadline = end_date + timedelta(days=1)

    status = _deadline_status(deadline, end_date)

    deadlines: list[BookDeadline] = []
    individual_cumulative_pages = cumulative_pages - group_pages
    for book in books:
        book_pages = page_count(book)
        individual_cumulative_pages += book_pages
        if book_pages == 0:
            daily_pages = 0.0
        elif len(books) == 1:
            daily_pages = daily_pace
        elif group_pages == 0:
            daily_pages = 0.0
        else:
            daily_pages = daily_pace * book_pages / group_pages
        deadlines.append(
            BookDeadline(
                book=book,
                cumulative_pages=individual_cumulative_pages,
                start_date=group_start,
                deadline=deadline,
                days_allocated=days_allocated,
                daily_pages=daily_pages,
                status=status,
            )
        )
    return deadlines, deadline, cumulative_pages

def build_remaining_section_plan(
    section: BookSection,
    start_date: date,
    end_date: date,
    today: date | None = None,
    rest_days: list[RestDayRange] | None = None,
) -> SectionPlan:
    if not section.books:
        return SectionPlan(section, [], 0.0, 0, 0.0, "achievable")

    today = today or date.today()
    remaining_start = effective_remaining_start_date(
        start_date, end_date, today, rest_days
    )
    period_days = available_reading_days_count(
        remaining_start, end_date, rest_days
    )
    remaining_total = sum(remaining_units(book, section.label) for book in section.books)
    daily_pace = (
        0.0
        if remaining_total == 0 or period_days == 0
        else remaining_total / period_days
    )
    required_pace = daily_pace
    overridden_books = {
        book.number: book
        for book in section.books
        if book.deadline_override is not None
    }

    if overridden_books:
        page_count = lambda book: remaining_units(book, section.label)
        scheduled_deadlines, _scheduled_total, _scheduled_required, _scheduled_status = (
            build_plan(
                section.books,
                remaining_start,
                end_date,
                daily_pace,
                active_simultaneous_groups(section),
                lambda book: 0 if book.number in overridden_books else page_count(book),
                rest_days,
            )
        )
        ordinary_by_number = {
            deadline.book.number: deadline
            for deadline in scheduled_deadlines
            if deadline.book.number not in overridden_books
        }
        active_groups = active_simultaneous_groups(section)
        group_by_first = {group[0]: group for group in active_groups}
        grouped_book_ids = {book_id for group in active_groups for book_id in group}
        books_by_number = {book.number: book for book in section.books}
        scheduling_units: list[tuple[Book, list[Book]]] = []
        for book in section.books:
            if book.number in grouped_book_ids and book.number not in group_by_first:
                continue
            group_ids = group_by_first.get(book.number, (book.number,))
            scheduling_units.append(
                (book, [books_by_number[book_id] for book_id in group_ids])
            )

        deadlines: list[BookDeadline] = []
        cursor = remaining_start
        cumulative_pages = 0
        reflowing = False
        last_override_deadline: date | None = None
        schedule_conflict = False
        for first_book, unit_books in scheduling_units:
            if first_book.number in overridden_books:
                override_deadline = first_book.deadline_override
                override_schedule_start = first_book.baseline_schedule.start_date
                override_start = effective_remaining_start_date(
                    override_schedule_start, override_deadline, today, rest_days
                )
                available_days = available_reading_days_count(
                    override_start, override_deadline, rest_days
                )
                remaining = page_count(first_book)
                cumulative_pages += remaining
                override_pace = (
                    remaining / available_days if remaining and available_days else 0.0
                )
                status = _deadline_status(override_deadline, end_date)
                deadlines.append(
                    BookDeadline(
                        book=first_book,
                        cumulative_pages=cumulative_pages,
                        start_date=override_start,
                        deadline=override_deadline,
                        days_allocated=available_days,
                        daily_pages=override_pace,
                        status=status,
                    )
                )
                if remaining:
                    if (
                        override_deadline < cursor
                        or (
                            reflowing
                            and override_start < cursor
                        )
                        or (
                            last_override_deadline is not None
                            and override_start <= last_override_deadline
                        )
                    ):
                        schedule_conflict = True
                    last_override_deadline = override_deadline
                    cursor = max(
                        cursor,
                        _next_reading_day_after(override_deadline, end_date, rest_days),
                    )
                continue

            unit_work = sum(page_count(book) for book in unit_books)
            ordinary = ordinary_by_number[first_book.number]
            if not unit_work:
                deadlines.extend(
                    ordinary_by_number[book.number] for book in unit_books
                )
                continue
            if not reflowing and ordinary.start_date >= cursor:
                deadlines.extend(
                    ordinary_by_number[book.number] for book in unit_books
                )
                cursor = _next_reading_day_after(ordinary.deadline, end_date, rest_days)
                cumulative_pages = max(
                    cumulative_pages,
                    max(
                        ordinary_by_number[book.number].cumulative_pages
                        for book in unit_books
                    ),
                )
                continue

            reflowing = True
            reflowed, reflow_deadline, cumulative_pages = _reflow_deadlines_for_books(
                unit_books,
                cursor,
                end_date,
                daily_pace,
                page_count,
                rest_days,
                cumulative_pages,
            )
            deadlines.extend(reflowed)
            cursor = _next_reading_day_after(reflow_deadline, end_date, rest_days)

        deadlines.sort(key=lambda deadline: deadline.book.number)
        overall_status = (
            "achievable"
            if not remaining_total
            or (
                period_days
                and not schedule_conflict
                and all(deadline.deadline <= end_date for deadline in deadlines)
            )
            else "not achievable"
        )
        return SectionPlan(
            section, deadlines, daily_pace, remaining_total, required_pace, overall_status
        )

    deadlines, _total_pages, required_pace, overall_status = build_plan(
        section.books,
        remaining_start,
        end_date,
        daily_pace,
        active_simultaneous_groups(section),
        lambda book: remaining_units(book, section.label),
        rest_days,
    )
    return SectionPlan(
        section, deadlines, daily_pace, _total_pages, required_pace, overall_status
    )
def build_remaining_section_plans(
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    today: date | None = None,
    rest_days: list[RestDayRange] | None = None,
) -> tuple[list[SectionPlan], int, float, str]:
    section_plans = [
        build_remaining_section_plan(
            section, start_date, end_date, today, rest_days
        )
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
    rest_days: list[RestDayRange] | None = None,
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
            (
                "Reading period",
                f"{available_reading_days_count(start_date, end_date, rest_days)} days",
            )
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
    rest_days: list[RestDayRange] | None = None,
) -> None:
    path = Path(filename)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Reading plan"])
        writer.writerow(["Start date", start_date.isoformat()])
        writer.writerow([end_label, end_date.isoformat()])
        if rest_days:
            writer.writerow([
                "Rest days",
                ";".join(
                    f"{item.start_date.isoformat()}/{item.end_date.isoformat()}"
                    for item in normalize_rest_day_ranges(rest_days)
                ),
            ])
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
            section_plans,
            start_date,
            end_date,
            highest_daily_pace,
            stats_options,
            rest_days,
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
) -> tuple[list[BookSection], date, date, str, str, list[RestDayRange]]:
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

    rest_days: list[RestDayRange] = []
    for raw_range in metadata.get("Rest days", "").split(";"):
        if not raw_range.strip():
            continue
        try:
            start_text, end_text = raw_range.split("/", 1)
            rest_days.append(RestDayRange(parse_date(start_text), parse_date(end_text)))
        except (ValueError, TypeError) as error:
            raise ValueError("invalid rest-day range") from error
    rest_days = normalize_rest_day_ranges(rest_days)

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
    return sections, start_date, end_date, end_label, end_name, rest_days


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
    baseline_schedule = (
        None
        if book.baseline_schedule is None
        else {
            "start_date": book.baseline_schedule.start_date.isoformat(),
            "deadline": book.baseline_schedule.deadline.isoformat(),
            "daily_target": book.baseline_schedule.daily_target,
        }
    )
    deadline_override = (
        None if book.deadline_override is None else book.deadline_override.isoformat()
    )
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
            "baseline_schedule": baseline_schedule,
            "deadline_override": deadline_override,
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
        "baseline_schedule": baseline_schedule,
        "deadline_override": deadline_override,
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

    raw_baseline = value.get("baseline_schedule")
    baseline_schedule: BaselineSchedule | None = None
    if raw_baseline is not None:
        if not isinstance(raw_baseline, dict):
            raise ValueError("baseline_schedule must be a JSON object")
        try:
            baseline_schedule = BaselineSchedule(
                parse_date(str(raw_baseline["start_date"])),
                parse_date(str(raw_baseline["deadline"])),
                float(raw_baseline["daily_target"]),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("invalid baseline_schedule") from error

    raw_deadline_override = value.get("deadline_override")
    deadline_override: date | None = None
    if raw_deadline_override not in (None, ""):
        try:
            deadline_override = parse_date(str(raw_deadline_override))
        except ValueError as error:
            raise ValueError("invalid deadline_override") from error

    return Book(
        number=fallback_number,
        title=title,
        start_page=start_page,
        end_page=end_page,
        current_page=current_page,
        reading_sessions=reading_sessions,
        baseline_schedule=baseline_schedule,
        deadline_override=deadline_override,
    )


def book_section_to_json(section: BookSection) -> dict[str, object]:
    return {
        "label": section.label,
        "baseline_needs_recalculation": section.baseline_needs_recalculation,
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
    return BookSection(
        label,
        books,
        validate_simultaneous_groups(books, groups),
        bool(value.get("baseline_needs_recalculation", False)),
    )


def rest_day_ranges_to_json(
    rest_days: list[RestDayRange] | None,
) -> list[dict[str, str]]:
    return [
        {
            "start_date": item.start_date.isoformat(),
            "end_date": item.end_date.isoformat(),
        }
        for item in normalize_rest_day_ranges(rest_days)
    ]


def rest_day_ranges_from_json(value: object) -> list[RestDayRange]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("rest_days must be a list")
    ranges: list[RestDayRange] = []
    for raw_range in value:
        if not isinstance(raw_range, dict):
            raise ValueError("each rest-day range must be a JSON object")
        try:
            start_date = parse_date(str(raw_range["start_date"]))
            end_date = parse_date(str(raw_range["end_date"]))
        except (KeyError, ValueError) as error:
            raise ValueError("invalid rest-day range") from error
        validate_rest_day_range(start_date, end_date)
        ranges.append(RestDayRange(start_date, end_date))
    return normalize_rest_day_ranges(ranges)


def write_json_plan(
    filename: str,
    sections: list[BookSection],
    start_date: date,
    end_date: date,
    end_label: str,
    stats_options: SummaryStatsOptions,
    rest_days: list[RestDayRange] | None = None,
) -> None:
    if (
        not any(section.baseline_needs_recalculation for section in sections)
        and any(
            book.baseline_schedule is None
            for section in sections
            for book in section.books
        )
    ):
        calculate_baseline_schedules(sections, start_date, end_date, rest_days)
    payload = {
        "schema_version": 7,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "end_label": end_label,
        "stats_options": summary_stats_options_to_json(stats_options),
        "rest_days": rest_day_ranges_to_json(rest_days),
        "sections": [book_section_to_json(section) for section in sections],
    }
    Path(filename).write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def load_json_plan(
    filename: str,
) -> tuple[
    list[BookSection],
    date,
    date,
    str,
    str,
    SummaryStatsOptions,
    list[RestDayRange],
]:
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
    rest_days = rest_day_ranges_from_json(payload.get("rest_days"))

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
    try:
        schema_version = int(payload.get("schema_version", 4))
    except (TypeError, ValueError) as error:
        raise ValueError("invalid schema version") from error
    if schema_version < 5:
        calculate_baseline_schedules(sections, start_date, end_date, rest_days)
    return (
        sections,
        start_date,
        end_date,
        end_label,
        end_name,
        summary_stats_options_from_json(payload.get("stats_options")),
        rest_days,
    )
