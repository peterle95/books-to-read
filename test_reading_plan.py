import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from reading_plan import (
    Book,
    BookDeadline,
    BookSection,
    RestDayRange,
    SummaryStatsOptions,
    available_reading_days,
    available_reading_days_count,
    add_reading_session,
    apply_persisted_deadline_overrides,
    apply_deadline_override,
    apply_start_date_override,
    validate_deadline_override,
    build_remaining_section_plans,
    calculate_baseline_schedules,
    load_json_plan,
    recalculate_baseline_schedules,
    write_json_plan,
)
from reading_plan_gui import ReadingPlanApp, target_units_for_date


class BaselineSchedulePersistenceTests(unittest.TestCase):
    def test_writing_a_plan_persists_a_per_book_baseline_schedule(self):
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 100)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 9, 30),
                "Quarter end",
                SummaryStatsOptions(True, True, True, True, True),
            )
            payload = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(7, payload["schema_version"])
        self.assertEqual(
            {
                "start_date": "2026-07-01",
                "deadline": "2026-09-30",
                "daily_target": 100 / 92,
            },
            payload["sections"][0]["books"][0]["baseline_schedule"],
        )

    def test_loading_a_legacy_plan_migrates_the_baseline_without_losing_sessions(self):
        legacy_plan = {
            "schema_version": 4,
            "start_date": "2026-07-01",
            "end_date": "2026-09-30",
            "sections": [
                {
                    "label": "Physical books",
                    "books": [
                        {
                            "title": "One",
                            "start_page": 1,
                            "end_page": 100,
                            "current_page": 10,
                            "reading_sessions": [
                                {"date": "2026-07-02", "current_page": 10, "pages_read": 10}
                            ],
                        }
                    ],
                    "simultaneous_groups": [],
                }
            ],
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.json"
            path.write_text(json.dumps(legacy_plan), encoding="utf-8")
            sections, *_ = load_json_plan(str(path))

        book = sections[0].books[0]
        self.assertEqual(date(2026, 7, 1), book.baseline_schedule.start_date)
        self.assertEqual(date(2026, 9, 30), book.baseline_schedule.deadline)
        self.assertEqual(10, book.reading_sessions[0].current_page)

    def test_explicit_recalculation_replaces_the_baseline_schedule(self):
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 100)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        calculate_baseline_schedules(sections, date(2026, 8, 1), date(2026, 10, 31))

        baseline = sections[0].books[0].baseline_schedule
        self.assertEqual(date(2026, 8, 1), baseline.start_date)
        self.assertEqual(date(2026, 10, 31), baseline.deadline)
        self.assertEqual(100 / 92, baseline.daily_target)
    def test_current_required_pace_sums_a_simultaneous_group(self):
        sections = [
            BookSection(
                "Physical books",
                [Book(1, "First", 1, 10), Book(2, "Second", 1, 10)],
                [(1, 2)],
            ),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 1)
        )

        self.assertEqual(20 / 92, plans[0].daily_pace)
    def test_daily_pace_covers_all_remaining_work(self):
        sections = [
            BookSection(
                "Physical books",
                [Book(1, "First", 1, 10), Book(2, "Second", 1, 90)],
                [],
            ),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 5)
        )

        self.assertAlmostEqual(100 / 88, plans[0].daily_pace)
    def test_remaining_plan_starts_from_today_and_adapts_pace(self):
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 100)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 9, 30),
                "Quarter end",
                SummaryStatsOptions(True, True, True, True, True),
            )
        add_reading_session(sections[0].books[0], date(2026, 7, 10), 10)

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 10)
        )
        plan = plans[0]

        self.assertEqual(date(2026, 7, 10), plan.deadlines[0].start_date)
        self.assertEqual(date(2026, 9, 30), plan.deadlines[0].deadline)
        self.assertAlmostEqual(90 / 83, plan.deadlines[0].daily_pages)
        self.assertAlmostEqual(90 / 83, plan.daily_pace)


    def test_structural_changes_round_trip_without_rewriting_the_baseline(self):
        section = BookSection(
            "Physical books", [Book(1, "One", 1, 100)], [],
        )
        sections = [section, BookSection("Digital books", [], []), BookSection("Audiobooks", [], [])]
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        original_baseline = sections[0].books[0].baseline_schedule
        sections[0].books.append(Book(2, "Two", 1, 20))
        sections[0].baseline_needs_recalculation = True

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 9, 30),
                "Quarter end",
                SummaryStatsOptions(True, True, True, True, True),
            )
            payload = json.loads(path.read_text(encoding="utf-8"))
            loaded_sections, *_ = load_json_plan(str(path))

        self.assertEqual(original_baseline, sections[0].books[0].baseline_schedule)
        self.assertIsNone(payload["sections"][0]["books"][1]["baseline_schedule"])
        self.assertTrue(payload["sections"][0]["baseline_needs_recalculation"])
        self.assertEqual(original_baseline, loaded_sections[0].books[0].baseline_schedule)
        self.assertIsNone(loaded_sections[0].books[1].baseline_schedule)
        self.assertTrue(loaded_sections[0].baseline_needs_recalculation)

    def test_explicit_recalculation_uses_unfinished_work_and_preserves_sessions(self):
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 100)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]
        add_reading_session(sections[0].books[0], date(2026, 7, 10), 10)
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))

        recalculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))

        book = sections[0].books[0]
        self.assertAlmostEqual(90 / 92, book.baseline_schedule.daily_target)
        self.assertEqual(10, book.current_page)
        self.assertEqual(1, len(book.reading_sessions))
        self.assertFalse(sections[0].baseline_needs_recalculation)
    def test_logging_progress_does_not_change_a_persisted_baseline_schedule(self):
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 100)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 9, 30),
                "Quarter end",
                SummaryStatsOptions(True, True, True, True, True),
            )
            baseline = sections[0].books[0].baseline_schedule
            add_reading_session(sections[0].books[0], date(2026, 7, 2), 10)
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 9, 30),
                "Quarter end",
                SummaryStatsOptions(True, True, True, True, True),
            )

        self.assertEqual(baseline, sections[0].books[0].baseline_schedule)


class RestDayScheduleTests(unittest.TestCase):
    def test_rest_days_are_excluded_from_deadlines_and_pace(self):
        rest_days = [RestDayRange(date(2026, 7, 3), date(2026, 7, 4))]
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 10)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

        calculate_baseline_schedules(
            sections, date(2026, 7, 1), date(2026, 7, 7), rest_days
        )

        self.assertEqual(
            [
                date(2026, 7, 1),
                date(2026, 7, 2),
                date(2026, 7, 5),
                date(2026, 7, 6),
                date(2026, 7, 7),
            ],
            available_reading_days(date(2026, 7, 1), date(2026, 7, 7), rest_days),
        )
        self.assertEqual(5, available_reading_days_count(
            date(2026, 7, 1), date(2026, 7, 7), rest_days
        ))
        baseline = sections[0].books[0].baseline_schedule
        self.assertEqual(date(2026, 7, 7), baseline.deadline)
        self.assertEqual(2, baseline.daily_target)

    def test_rest_days_round_trip_in_json(self):
        rest_days = [RestDayRange(date(2026, 7, 3), date(2026, 7, 4))]
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 10)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 7, 7),
                "Target finish date",
                SummaryStatsOptions(True, True, True, True, True),
                rest_days,
            )
            loaded = load_json_plan(str(path))

        self.assertEqual(rest_days, loaded[-1])

    def test_editing_rest_days_does_not_rewrite_baseline_until_recalculation(self):
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 10)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]
        calculate_baseline_schedules(
            sections, date(2026, 7, 1), date(2026, 7, 7)
        )
        original_baseline = sections[0].books[0].baseline_schedule
        sections[0].baseline_needs_recalculation = True
        rest_days = [RestDayRange(date(2026, 7, 3), date(2026, 7, 4))]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 7, 7),
                "Target finish date",
                SummaryStatsOptions(True, True, True, True, True),
                rest_days,
            )

        self.assertEqual(original_baseline, sections[0].books[0].baseline_schedule)
        recalculate_baseline_schedules(
            sections, date(2026, 7, 1), date(2026, 7, 7), rest_days
        )
        self.assertEqual(date(2026, 7, 7), sections[0].books[0].baseline_schedule.deadline)



class StartDateOverrideTests(unittest.TestCase):
    def make_sections(self):
        return [
            BookSection("Physical books", [Book(1, "One", 1, 100)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

    def test_future_start_date_changes_remaining_daily_pages(self):
        sections = self.make_sections()
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 7, 31))
        apply_start_date_override(
            sections[0], sections[0].books[0], date(2026, 7, 25), date(2026, 7, 31), date(2026, 7, 10)
        )

        book = sections[0].books[0]
        self.assertEqual(date(2026, 7, 25), book.baseline_schedule.start_date)
        self.assertAlmostEqual(100 / 7, book.baseline_schedule.daily_target)

    def test_past_start_date_uses_today_for_daily_pages(self):
        sections = self.make_sections()
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 7, 31))
        apply_start_date_override(
            sections[0], sections[0].books[0], date(2026, 7, 1), date(2026, 7, 31), date(2026, 7, 10)
        )

        book = sections[0].books[0]
        self.assertEqual(date(2026, 7, 1), book.baseline_schedule.start_date)
        self.assertAlmostEqual(100 / 22, book.baseline_schedule.daily_target)

    def test_rest_days_recalculate_pace_without_changing_book_dates(self):
        sections = self.make_sections()
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 7, 7))
        baseline = sections[0].books[0].baseline_schedule
        rest_days = [RestDayRange(date(2026, 7, 3), date(2026, 7, 4))]

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 7, 7), date(2026, 7, 1), rest_days
        )

        deadline = plans[0].deadlines[0]
        self.assertEqual(baseline.start_date, deadline.start_date)
        self.assertEqual(baseline.deadline, deadline.deadline)
        self.assertAlmostEqual(20, deadline.daily_pages)

class DeadlineOverrideTests(unittest.TestCase):
    def make_sections(self, books, groups=()):
        return [
            BookSection("Physical books", books, list(groups)),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

    def test_invalid_deadline_override_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "before today"):
            validate_deadline_override(date(2026, 7, 9), date(2026, 9, 30), date(2026, 7, 10))
        with self.assertRaisesRegex(ValueError, "after the plan finish date"):
            validate_deadline_override(date(2026, 10, 1), date(2026, 9, 30), date(2026, 7, 10))

    def test_override_uses_progress_and_does_not_reshuffle_unrelated_books(self):
        sections = self.make_sections([Book(1, "One", 1, 100), Book(2, "Two", 1, 50)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        unaffected = sections[0].books[1].baseline_schedule
        add_reading_session(sections[0].books[0], date(2026, 7, 10), 20)

        apply_deadline_override(
            sections[0],
            sections[0].books[0],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )

        book = sections[0].books[0]
        self.assertEqual(date(2026, 7, 10), book.baseline_schedule.start_date)
        self.assertEqual(date(2026, 8, 1), book.baseline_schedule.deadline)
        self.assertAlmostEqual(80 / 23, book.baseline_schedule.daily_target)
        self.assertEqual(unaffected, sections[0].books[1].baseline_schedule)

    def test_group_member_override_keeps_remaining_members_shared(self):
        sections = self.make_sections(
            [Book(1, "One", 1, 10), Book(2, "Two", 1, 20), Book(3, "Three", 1, 30)],
            [(1, 2, 3)],
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        original_first = sections[0].books[0].baseline_schedule
        original_third = sections[0].books[2].baseline_schedule

        apply_deadline_override(
            sections[0],
            sections[0].books[1],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )

        overridden = sections[0].books[1].baseline_schedule
        self.assertEqual(date(2026, 8, 1), overridden.deadline)
        self.assertEqual(date(2026, 7, 10), overridden.start_date)
        self.assertEqual(date(2026, 8, 1), sections[0].books[1].deadline_override)
        self.assertEqual(original_first.deadline, sections[0].books[0].baseline_schedule.deadline)
        self.assertEqual(original_third.deadline, sections[0].books[2].baseline_schedule.deadline)
        self.assertEqual(
            sections[0].books[0].baseline_schedule.deadline,
            sections[0].books[2].baseline_schedule.deadline,
        )

    def test_group_override_recalculates_shared_baseline_from_remaining_start(self):
        sections = self.make_sections(
            [
                Book(1, "One", 1, 10),
                Book(2, "Two", 1, 20),
                Book(3, "Three", 1, 30),
            ],
            [(1, 2, 3)],
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        add_reading_session(sections[0].books[0], date(2026, 7, 10), 5)
        apply_deadline_override(
            sections[0],
            sections[0].books[1],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )

        first, third = sections[0].books[0], sections[0].books[2]
        self.assertEqual(date(2026, 7, 10), first.baseline_schedule.start_date)
        self.assertEqual(date(2026, 7, 10), third.baseline_schedule.start_date)
        self.assertEqual(date(2026, 9, 30), first.baseline_schedule.deadline)
        self.assertEqual(date(2026, 9, 30), third.baseline_schedule.deadline)
        self.assertAlmostEqual(5 / 83, first.baseline_schedule.daily_target)
        self.assertAlmostEqual(30 / 83, third.baseline_schedule.daily_target)

    def test_digital_and_audiobook_overrides_use_their_section_units(self):
        sections = [
            BookSection("Physical books", [], []),
            BookSection("Digital books", [Book(1, "Digital", 1, 100)], []),
            BookSection("Audiobooks", [Book(1, "Audio", 0, 3600)], []),
        ]
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 7, 10))
        apply_deadline_override(
            sections[1], sections[1].books[0], date(2026, 7, 5), date(2026, 7, 10), date(2026, 7, 1)
        )
        apply_deadline_override(
            sections[2], sections[2].books[0], date(2026, 7, 5), date(2026, 7, 10), date(2026, 7, 1)
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 7, 10), date(2026, 7, 1)
        )
        self.assertAlmostEqual(20, plans[1].deadlines[0].daily_pages)
        self.assertAlmostEqual(720, plans[2].deadlines[0].daily_pages)

        audio_book = sections[2].books[0]
        audio_deadline = ReadingPlanApp.__new__(ReadingPlanApp).session_deadline(
            sections[2], audio_book
        )
        self.assertAlmostEqual(720, audio_deadline.daily_pages)
        self.assertEqual(
            2160,
            target_units_for_date(
                audio_book, sections[2].label, audio_deadline, date(2026, 7, 3)
            ),
        )

    def test_persisted_group_override_round_trips_and_reapplies(self):
        sections = self.make_sections(
            [
                Book(1, "One", 1, 10),
                Book(2, "Two", 1, 20),
                Book(3, "Three", 1, 30),
            ],
            [(1, 2, 3)],
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        apply_deadline_override(
            sections[0],
            sections[0].books[1],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )
        original_schedules = [
            book.baseline_schedule for book in sections[0].books
        ]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path),
                sections,
                date(2026, 7, 1),
                date(2026, 9, 30),
                "Quarter end",
                SummaryStatsOptions(True, True, True, True, True),
            )
            loaded_sections, *_ = load_json_plan(str(path))

        loaded_books = loaded_sections[0].books
        self.assertEqual(date(2026, 8, 1), loaded_books[1].deadline_override)
        self.assertEqual(original_schedules, [
            book.baseline_schedule for book in loaded_books
        ])

        apply_persisted_deadline_overrides(
            loaded_sections[0], date(2026, 9, 30), today=date(2026, 7, 10)
        )
        self.assertEqual(original_schedules, [
            book.baseline_schedule for book in loaded_books
        ])

    def test_remaining_plan_uses_override_deadline_and_pace(self):
        sections = self.make_sections([Book(1, "One", 1, 100)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        apply_deadline_override(
            sections[0],
            sections[0].books[0],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 10)
        )
        deadline = plans[0].deadlines[0]

        self.assertEqual(date(2026, 7, 10), deadline.start_date)
        self.assertEqual(date(2026, 8, 1), deadline.deadline)
        self.assertEqual(23, deadline.days_allocated)
        self.assertAlmostEqual(100 / 23, deadline.daily_pages)

    def test_remaining_plan_recalculates_group_around_override(self):
        sections = self.make_sections(
            [Book(1, "One", 1, 10), Book(2, "Two", 1, 20), Book(3, "Three", 1, 30)],
            [(1, 2, 3)],
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        apply_deadline_override(
            sections[0],
            sections[0].books[1],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 10)
        )
        deadlines = {item.book.number: item for item in plans[0].deadlines}

        self.assertEqual(date(2026, 8, 1), deadlines[2].deadline)
        self.assertAlmostEqual(20 / 23, deadlines[2].daily_pages)
        self.assertEqual(deadlines[1].deadline, deadlines[3].deadline)
        self.assertEqual(date(2026, 9, 3), deadlines[1].deadline)
        self.assertAlmostEqual(15 / 83, deadlines[1].daily_pages)
        self.assertAlmostEqual(45 / 83, deadlines[3].daily_pages)
    def test_remaining_plan_reflows_later_books_after_an_overlapping_override(self):
        sections = self.make_sections(
            [
                Book(1, "Before", 1, 20),
                Book(2, "Fixed", 1, 100),
                Book(3, "After", 1, 20),
            ]
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 8, 31))
        apply_deadline_override(
            sections[0],
            sections[0].books[1],
            date(2026, 8, 1),
            date(2026, 8, 31),
            date(2026, 7, 1),
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 8, 31), date(2026, 7, 1)
        )
        deadlines = {item.book.number: item for item in plans[0].deadlines}

        self.assertEqual(date(2026, 7, 9), deadlines[1].deadline)
        self.assertEqual(date(2026, 8, 1), deadlines[2].deadline)
        self.assertEqual(date(2026, 8, 10), deadlines[3].deadline)
        self.assertAlmostEqual(140 / 62, deadlines[3].daily_pages)

    def test_remaining_plan_reflow_excludes_rest_days(self):
        sections = self.make_sections(
            [
                Book(1, "Before", 1, 20),
                Book(2, "Fixed", 1, 100),
                Book(3, "After", 1, 20),
            ]
        )
        rest_days = [RestDayRange(date(2026, 8, 2), date(2026, 8, 3))]
        calculate_baseline_schedules(
            sections, date(2026, 7, 1), date(2026, 8, 31), rest_days
        )
        apply_deadline_override(
            sections[0],
            sections[0].books[1],
            date(2026, 8, 1),
            date(2026, 8, 31),
            date(2026, 7, 1),
            rest_days,
        )

        plans, *_ = build_remaining_section_plans(
            sections,
            date(2026, 7, 1),
            date(2026, 8, 31),
            date(2026, 7, 1),
            rest_days,
        )
        deadlines = {item.book.number: item for item in plans[0].deadlines}

        self.assertEqual(date(2026, 8, 24), deadlines[3].start_date)
        self.assertEqual(date(2026, 8, 31), deadlines[3].deadline)
        self.assertEqual(8, deadlines[3].days_allocated)

    def test_remaining_plan_reports_not_achievable_when_reflow_runs_past_plan_end(self):
        sections = self.make_sections(
            [
                Book(1, "Before", 1, 20),
                Book(2, "Fixed", 1, 100),
                Book(3, "After", 1, 40),
            ]
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 8, 10))
        apply_deadline_override(
            sections[0],
            sections[0].books[1],
            date(2026, 8, 1),
            date(2026, 8, 10),
            date(2026, 7, 1),
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 8, 10), date(2026, 7, 1)
        )

        self.assertEqual("not achievable", plans[0].overall_status)
        self.assertGreater(plans[0].deadlines[-1].deadline, date(2026, 8, 10))

    def test_remaining_plan_preserves_multiple_override_schedules(self):
        sections = self.make_sections(
            [
                Book(1, "Before", 1, 20),
                Book(2, "First fixed", 1, 30),
                Book(3, "Between", 1, 10),
                Book(4, "Second fixed", 1, 20),
                Book(5, "After", 1, 10),
            ]
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 8, 31))
        expected_starts = {
            book.number: book.baseline_schedule.start_date
            for book in sections[0].books
        }

        apply_deadline_override(
            sections[0], sections[0].books[1], date(2026, 8, 1), date(2026, 8, 31), date(2026, 7, 1)
        )
        apply_deadline_override(
            sections[0], sections[0].books[3], date(2026, 8, 20), date(2026, 8, 31), date(2026, 7, 1)
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 8, 31), date(2026, 7, 1)
        )
        deadlines = {item.book.number: item for item in plans[0].deadlines}

        self.assertEqual("achievable", plans[0].overall_status)
        self.assertEqual(date(2026, 8, 1), deadlines[2].deadline)
        self.assertEqual(date(2026, 8, 20), deadlines[4].deadline)
        self.assertEqual(50, deadlines[2].cumulative_pages)
        self.assertEqual(80, deadlines[4].cumulative_pages)
        self.assertEqual(expected_starts[2], deadlines[2].start_date)
        self.assertEqual(expected_starts[4], deadlines[4].start_date)
        self.assertEqual(date(2026, 8, 8), deadlines[3].deadline)
        self.assertEqual(date(2026, 8, 27), deadlines[5].deadline)

    def test_remaining_plan_reports_non_monotonic_override_conflict(self):
        sections = self.make_sections(
            [
                Book(1, "Before", 1, 20),
                Book(2, "First fixed", 1, 30),
                Book(3, "Between", 1, 10),
                Book(4, "Second fixed", 1, 20),
            ]
        )
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 8, 31))
        apply_deadline_override(
            sections[0], sections[0].books[1], date(2026, 8, 20), date(2026, 8, 31), date(2026, 7, 1)
        )
        apply_deadline_override(
            sections[0], sections[0].books[3], date(2026, 8, 10), date(2026, 8, 31), date(2026, 7, 1)
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 8, 31), date(2026, 7, 1)
        )
        deadlines = {item.book.number: item for item in plans[0].deadlines}

        self.assertEqual("not achievable", plans[0].overall_status)
        self.assertEqual(date(2026, 8, 20), deadlines[2].deadline)
        self.assertEqual(date(2026, 8, 10), deadlines[4].deadline)

    def test_remaining_plan_reports_override_with_no_reading_days(self):
        sections = self.make_sections([Book(1, "Fixed", 1, 10)])
        rest_days = [RestDayRange(date(2026, 7, 1), date(2026, 7, 3))]
        calculate_baseline_schedules(
            sections, date(2026, 7, 1), date(2026, 7, 3), rest_days
        )
        apply_deadline_override(
            sections[0], sections[0].books[0], date(2026, 7, 3), date(2026, 7, 3), date(2026, 7, 1), rest_days
        )

        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 7, 3), date(2026, 7, 1), rest_days
        )

        self.assertEqual("not achievable", plans[0].overall_status)

    def test_session_target_uses_the_persisted_override_schedule(self):
        sections = self.make_sections([Book(1, "One", 1, 100)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        apply_deadline_override(
            sections[0],
            sections[0].books[0],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )

        session_deadline = ReadingPlanApp.__new__(ReadingPlanApp).session_deadline(
            sections[0], sections[0].books[0]
        )
        target = target_units_for_date(
            sections[0].books[0], sections[0].label, session_deadline, date(2026, 7, 15)
        )

        self.assertEqual(date(2026, 7, 10), session_deadline.start_date)
        self.assertEqual(date(2026, 8, 1), session_deadline.deadline)
        self.assertAlmostEqual(100 / 23, session_deadline.daily_pages)
        self.assertEqual(27, target)

    def test_session_target_starts_from_today_current_page(self):
        book = Book(1, "capital", 1, 1041)
        add_reading_session(book, date(2026, 7, 15), 1000)
        deadline = BookDeadline(
            book=book,
            cumulative_pages=0,
            start_date=date(2026, 7, 5),
            deadline=date(2026, 7, 31),
            days_allocated=0,
            daily_pages=2.93,
            status="",
        )

        target = target_units_for_date(
            book, "Physical books", deadline, date(2026, 7, 17)
        )

        self.assertEqual(1003, target)

    def test_building_remaining_plan_does_not_change_baseline_schedule(self):
        sections = self.make_sections([Book(1, "One", 1, 100)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        apply_deadline_override(
            sections[0],
            sections[0].books[0],
            date(2026, 8, 1),
            date(2026, 9, 30),
            date(2026, 7, 10),
        )
        baseline = sections[0].books[0].baseline_schedule

        build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 20)
        )

        self.assertIs(baseline, sections[0].books[0].baseline_schedule)

    def test_deadline_override_round_trips_in_json(self):
        sections = self.make_sections([Book(1, "One", 1, 10)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        apply_deadline_override(
            sections[0], sections[0].books[0], date(2026, 8, 1), date(2026, 9, 30), date(2026, 7, 10)
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_json_plan(
                str(path), sections, date(2026, 7, 1), date(2026, 9, 30),
                "Quarter end", SummaryStatsOptions(True, True, True, True, True),
            )
            payload = json.loads(path.read_text(encoding="utf-8"))
            loaded_sections, *_ = load_json_plan(str(path))

        self.assertEqual("2026-08-01", payload["sections"][0]["books"][0]["deadline_override"])
        self.assertEqual(date(2026, 8, 1), loaded_sections[0].books[0].deadline_override)




if __name__ == "__main__":
    unittest.main()
