"""Desktop reader accepts the bundle emitted by the Android device check."""

from datetime import date
from pathlib import Path
from shutil import copytree
from tempfile import TemporaryDirectory
import unittest

from reading_plan import load_json_bundle, write_json_bundle


class AndroidBundleContractTests(unittest.TestCase):
    def test_android_repaired_sessions_survive_desktop_read_and_write(self):
        with TemporaryDirectory() as directory:
            fixture = Path(__file__).parent / "fixtures" / "android-session-contract"
            bundle = copytree(fixture, Path(directory) / "bundle")
            sections, start, end, label, _, options, rest = load_json_bundle(bundle)
            self.assertEqual((start, end), (date(2026, 9, 1), date(2026, 9, 30)))
            pages = sections[0].books[0]
            audio = sections[2].books[0]
            self.assertEqual((pages.id, pages.current_page), ("physical-id", 30))
            self.assertEqual(
                [(session.current_page, session.pages_read) for session in pages.reading_sessions],
                [(10, 10), (20, 10), (30, 10)],
            )
            self.assertEqual((audio.id, audio.current_page), ("audio-id", 1800))
            self.assertEqual(
                [(session.current_page, session.pages_read) for session in audio.reading_sessions],
                [(600, 600), (1800, 1200)],
            )
            saved_bundle = Path(directory) / "saved"
            write_json_bundle(saved_bundle, sections, start, end, label, options, rest)
            saved = load_json_bundle(saved_bundle)[0]
            self.assertEqual(saved[0].books[0].current_page, 30)
            self.assertEqual(saved[2].books[0].reading_sessions[1].pages_read, 1200)


if __name__ == "__main__":
    unittest.main()
