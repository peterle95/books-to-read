import hashlib
import json
import tempfile
import tkinter as tk
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from reading_plan import (
    BOOK_SECTION_LABELS, Book, BookSection, PlannedQuarter, SummaryStatsOptions,
    activate_planned_quarter, add_reading_session, load_json_bundle,
    next_quarter_start, period_end_from_start, planned_quarter_from_json,
    planned_quarter_to_json, write_json_bundle, json_bundle_snapshot_payload,
)
from reading_plan_gui import ReadingPlanApp


def sections(*books):
    return [BookSection(label, list(books) if i == 0 else [], [])
            for i, label in enumerate(BOOK_SECTION_LABELS)]


class QuarterPlanningTests(unittest.TestCase):
    def test_boundaries_and_carryover_preserve_progress_identity_and_groups(self):
        for start in (date(2027, 1, 1), date(2026, 4, 1), date(2026, 7, 1), date(2026, 10, 1)):
            with self.subTest(start=start):
                finished = Book(1, "Finished", 1, 100, current_page=100)
                ongoing = Book(2, "Continue", 1, 100)
                add_reading_session(ongoing, start - timedelta(days=1), 40)
                ongoing.deadline_override = start - timedelta(days=1)
                current = sections(finished, ongoing, Book(3, "Also continue", 1, 50))
                current[0].simultaneous_groups = [(1, 2, 3)]
                audio = Book(1, "Audio", 0, 3600)
                add_reading_session(audio, start - timedelta(days=1), 1200, BOOK_SECTION_LABELS[2])
                current[2].books.append(audio)
                future = PlannedQuarter(start, sections(Book(1, "Next", 1, 200)))
                self.assertEqual(start, next_quarter_start(start - timedelta(days=1)))
                self.assertIsNone(activate_planned_quarter(current, future, start - timedelta(days=1)))
                result, actual_start, end = activate_planned_quarter(current, future, start)
                self.assertEqual(start, actual_start)
                self.assertEqual(period_end_from_start(start), end)
                self.assertEqual(["Continue", "Also continue", "Next"], [b.title for b in result[0].books])
                carried = result[0].books[0]
                self.assertEqual(ongoing.id, carried.id)
                self.assertEqual(40, carried.current_page)
                self.assertEqual(ongoing.reading_sessions, carried.reading_sessions)
                self.assertIsNone(carried.deadline_override)
                self.assertEqual([(1, 2)], result[0].simultaneous_groups)
                self.assertEqual(1200, result[2].books[0].current_page)
                self.assertEqual([1, 2, 3], [b.number for b in result[0].books])
                self.assertIsNotNone(ongoing.deadline_override)  # Input state remains safe until saved.

    def test_completed_plan_replaced_and_late_launch_catches_up(self):
        current = sections(Book(1, "Done", 1, 20, current_page=20))
        future = PlannedQuarter(date(2026, 10, 1), sections(Book(1, "Next", 1, 100)))
        result, start, end = activate_planned_quarter(current, future, date(2027, 2, 12))
        self.assertEqual(["Next"], [b.title for b in result[0].books])
        self.assertEqual((date(2027, 1, 1), date(2027, 3, 31)), (start, end))

    def test_bundle_round_trip_preservation_consumption_and_snapshot(self):
        current = sections(Book(1, "Current", 1, 100))
        future = PlannedQuarter(date(2026, 10, 1), sections(Book(1, "Next", 1, 200)))
        options = SummaryStatsOptions(True, True, True, True, True)
        with tempfile.TemporaryDirectory() as directory:
            metadata = write_json_bundle(directory, current, date(2026, 7, 1), date(2026, 9, 30),
                                         "Quarter end", options, planned_quarter=future)
            loaded = load_json_bundle(directory, include_planned=True)
            self.assertEqual(future, loaded[-1])
            self.assertIn("planned_quarter", json_bundle_snapshot_payload(directory))
            metadata = write_json_bundle(directory, current, date(2026, 7, 1), date(2026, 9, 30),
                                         "Quarter end", options, metadata=metadata)
            self.assertEqual(future, load_json_bundle(directory, include_planned=True)[-1])
            activated, start, end = activate_planned_quarter(current, future, date(2026, 10, 1))
            write_json_bundle(directory, activated, start, end, "Quarter end", options,
                              metadata=metadata, planned_quarter=None)
            reloaded = load_json_bundle(directory, include_planned=True)
            self.assertIsNone(reloaded[-1])
            self.assertEqual(2, len(reloaded[0][0].books))
            self.assertEqual(2, json.loads((Path(directory) / "manifest.json").read_text())["schema_version"])

    def test_rejects_malformed_or_overlapping_planned_books(self):
        current = sections(Book(1, "Current", 1, 100))
        future = PlannedQuarter(date(2026, 10, 1), sections(Book(1, "Next", 1, 200)))
        payload = planned_quarter_to_json(future)
        payload["start_date"] = "2026-10-02"
        with self.assertRaises(ValueError):
            planned_quarter_from_json(payload, current)
        payload["start_date"] = "2026-10-01"
        payload["sections"][0]["books"][0]["id"] = current[0].books[0].id
        with self.assertRaises(ValueError):
            planned_quarter_from_json(payload, current)

    def test_reads_existing_schema_one_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_json_bundle(root, sections(Book(1, "Old plan", 1, 100)),
                              date(2026, 7, 1), date(2026, 9, 30), "Quarter end",
                              SummaryStatsOptions(True, True, True, True, True))
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["schema_version"] = 1
            for filename in manifest["files"]:
                path = root / filename
                payload = json.loads(path.read_text())
                payload["schema_version"] = 1
                payload.pop("planned_quarter", None)
                raw = json.dumps(payload).encode("utf-8")
                path.write_bytes(raw)
                manifest["files"][filename] = hashlib.sha256(raw).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            loaded = load_json_bundle(root, include_planned=True)
            self.assertIsNone(loaded[-1])
            self.assertEqual("Old plan", loaded[0][0].books[0].title)
    def test_desktop_chart_filter_and_rollover_are_idempotent(self):
        with patch.object(ReadingPlanApp, "load_initial_plan"):
            try:
                app = ReadingPlanApp()
            except tk.TclError as error:
                self.skipTest(str(error))
        app.withdraw()
        try:
            app.sections = sections(Book(1, "Done", 1, 20, current_page=20), Book(2, "Continue", 1, 100, current_page=10))
            app.refresh_charts()
            self.assertEqual(["Continue"], [b.title for _, b in app.chart_books])
            app.toggle_all_charts()
            self.assertEqual(2, len(app.chart_books))
            app.toggle_all_charts()
            self.assertEqual(1, len(app.chart_books))
            app.plan_loaded = True
            app.planned_quarter = PlannedQuarter(date(2020, 1, 1), sections(Book(1, "Next", 1, 40)))
            with patch.object(app, "refresh_all") as refresh:
                app.check_quarter_rollover()
                app.check_quarter_rollover()
                refresh.assert_called_once_with(autosave=True)
            self.assertIsNone(app.planned_quarter)
            self.assertEqual(["Continue", "Next"], [b.title for b in app.sections[0].books])
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                write_json_bundle(root, sections(Book(1, "Done", 1, 10, current_page=10)),
                                  date(2019, 10, 1), date(2019, 12, 31), "Quarter end",
                                  SummaryStatsOptions(True, True, True, True, True),
                                  planned_quarter=PlannedQuarter(date(2020, 1, 1), sections(Book(1, "Next", 1, 40))))
                app.load_plan_from_json(root)
                self.assertFalse(app.has_unsaved_changes)
                self.assertIsNone(load_json_bundle(root, include_planned=True)[-1])
                revision = app.loaded_metadata.revision
                app.load_plan_from_json(root)
                self.assertEqual(revision, app.loaded_metadata.revision)
                self.assertEqual(["Next"], [b.title for b in app.sections[0].books])
        finally:
            app.destroy()


if __name__ == "__main__":
    unittest.main()
