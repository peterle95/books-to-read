import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from compare_reading_sessions import differences, render_table
from export_reading_sessions import export_snapshot, meaningful_plan
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle


class PlanSnapshotTests(unittest.TestCase):
    def test_export_reads_the_split_data_directory(self):
        sections = [
            BookSection("Physical books", [Book(1, "One", 1, 10)], []),
            BookSection("Digital books", [], []),
            BookSection("Audiobooks", [], []),
        ]
        with tempfile.TemporaryDirectory() as directory:
            data_directory = Path(directory) / "reading_plan_data"
            snapshot = Path(directory) / "reading_plan_snapshot.json"
            write_json_bundle(
                data_directory,
                sections,
                date(2026, 7, 1),
                date(2026, 9, 30),
                "Quarter end",
                SummaryStatsOptions(True, True, True, True, True),
            )
            export_snapshot(data_directory, snapshot)

            payload = json.loads(snapshot.read_text(encoding="utf-8"))

        self.assertIn("sections", payload)
        self.assertNotIn("files", payload)
        self.assertNotIn("modified_by", payload)

    def test_export_preserves_meaningful_plan_data(self):
        plan = {"revision": 1, "start_date": "2026-07-01", "sections": []}

        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "reading_plan.json"
            snapshot = Path(directory) / "reading_plan_snapshot.json"
            source.write_text(json.dumps(plan), encoding="utf-8")
            export_snapshot(source, snapshot)

            self.assertEqual(
                {"start_date": "2026-07-01", "sections": []},
                json.loads(snapshot.read_text(encoding="utf-8")),
            )

    def test_automatic_fields_do_not_create_differences(self):
        snapshot = {
            "revision": 1,
            "last_modified": "2026-08-05T10:00:00+02:00",
            "modified_by": "desktop",
            "start_date": "2026-07-01",
        }
        current = {
            "revision": 2,
            "last_modified": "2026-08-06T10:00:00+02:00",
            "modified_by": "android",
            "start_date": "2026-07-01",
        }

        self.assertEqual([], differences(meaningful_plan(snapshot), meaningful_plan(current)))

    def test_reports_changed_plan_date_and_missing_session(self):
        snapshot = {
            "end_date": "2026-09-30",
            "sections": [{"books": [{"reading_sessions": [{"id": "session-1"}]}]}],
        }
        current = {
            "end_date": "2026-10-07",
            "sections": [{"books": [{"reading_sessions": []}]}],
        }

        self.assertEqual(
            [
                ("Changed", "end_date"),
                ("Missing", "sections[0].books[0].reading_sessions[id=session-1]"),
            ],
            [(change["status"], change["path"]) for change in differences(snapshot, current)],
        )

    def test_table_uses_book_context_and_readable_audiobook_times(self):
        snapshot = {"sections": [{"label": "Audiobooks", "books": [{
            "title": "Example audio", "current_time_seconds": 20814, "reading_sessions": [],
        }]}]}
        current = {"sections": [{"label": "Audiobooks", "books": [{
            "title": "Example audio", "current_time_seconds": 24414,
            "reading_sessions": [{"date": "2026-08-05"}],
        }]}]}

        table = render_table(differences(snapshot, current))

        self.assertIn("Audiobooks", table)
        self.assertIn("Example audio", table)
        self.assertIn("Listening progress", table)
        self.assertIn("5h 47m", table)
        self.assertIn("6h 47m", table)
        self.assertIn("Reading session", table)
        self.assertIn("Session on 2026-08-05", table)
        self.assertIn("\033[33m", render_table(differences(snapshot, current), use_color=True))
        self.assertIn("\033[32m", render_table(differences(snapshot, current), use_color=True))


if __name__ == "__main__":
    unittest.main()
