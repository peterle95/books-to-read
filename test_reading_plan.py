import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from reading_plan import (
    Book,
    BookSection,
    RestDayRange,
    SummaryStatsOptions,
    available_reading_days,
    available_reading_days_count,
    add_reading_session,
    apply_deadline_override,
    validate_deadline_override,
    build_remaining_section_plans,
    calculate_baseline_schedules,
    load_json_plan,
    recalculate_baseline_schedules,
    write_json_plan,
)


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
    def test_current_required_pace_uses_each_book_baseline_deadline(self):
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

        self.assertEqual(10 / 6, plans[0].daily_pace)
    def test_current_required_pace_uses_the_persisted_baseline_dates(self):
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

        self.assertEqual(date(2026, 7, 1), plan.deadlines[0].start_date)
        self.assertEqual(date(2026, 9, 30), plan.deadlines[0].deadline)
        self.assertEqual(100 / 92, plan.deadlines[0].daily_pages)
        self.assertEqual(90 / 83, plan.daily_pace)


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
        self.assertEqual(date(2026, 7, 1), book.baseline_schedule.start_date)
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
        self.assertEqual(date(2026, 7, 1), overridden.start_date)
        self.assertEqual(date(2026, 8, 1), sections[0].books[1].deadline_override)
        self.assertEqual(original_first.deadline, sections[0].books[0].baseline_schedule.deadline)
        self.assertEqual(original_third.deadline, sections[0].books[2].baseline_schedule.deadline)
        self.assertEqual(
            sections[0].books[0].baseline_schedule.deadline,
            sections[0].books[2].baseline_schedule.deadline,
        )

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

class VarianceStatusTests(unittest.TestCase):
    def make_sections(self, books, groups=()):
        return [
            BookSection("Physical books", books, list(groups)),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]

    def test_variance_on_track_when_pace_matches_baseline(self):
        sections = self.make_sections([Book(1, "One", 1, 100)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 1)
        )
        deadline = plans[0].deadlines[0]
        self.assertIsNotNone(deadline.current_pace)
        self.assertIsNotNone(deadline.variance_status)
        self.assertAlmostEqual(deadline.daily_pages, deadline.current_pace, places=10)
        self.assertEqual("on track", deadline.variance_status)

    def test_variance_behind_when_progress_lags(self):
        sections = self.make_sections([Book(1, "One", 1, 100)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 10)
        )
        deadline = plans[0].deadlines[0]
        self.assertIsNotNone(deadline.current_pace)
        self.assertGreater(deadline.current_pace, deadline.daily_pages)
        self.assertEqual("behind", deadline.variance_status)

    def test_variance_ahead_when_progress_ahead(self):
        sections = self.make_sections([Book(1, "One", 1, 100)])
        calculate_baseline_schedules(sections, date(2026, 7, 1), date(2026, 9, 30))
        add_reading_session(sections[0].books[0], date(2026, 7, 10), 90)
        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 10)
        )
        deadline = plans[0].deadlines[0]
        self.assertIsNotNone(deadline.current_pace)
        self.assertLess(deadline.current_pace, deadline.daily_pages)
        self.assertEqual("ahead", deadline.variance_status)

    def test_variance_none_when_no_baseline(self):
        sections = self.make_sections([Book(1, "One", 1, 100)])
        plans, *_ = build_remaining_section_plans(
            sections, date(2026, 7, 1), date(2026, 9, 30), date(2026, 7, 1)
        )
        deadline = plans[0].deadlines[0]
        self.assertIsNone(deadline.current_pace)
        self.assertIsNone(deadline.variance_status)


if __name__ == "__main__":
    unittest.main()
