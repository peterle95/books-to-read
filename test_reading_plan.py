import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from reading_plan import (
    Book,
    BookSection,
    SummaryStatsOptions,
    add_reading_session,
    build_remaining_section_plans,
    calculate_baseline_schedules,
    load_json_plan,
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

        self.assertEqual(5, payload["schema_version"])
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


if __name__ == "__main__":
    unittest.main()
