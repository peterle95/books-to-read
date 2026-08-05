import csv
import json
from pathlib import Path


FIELDS = ["section", "book_id", "book_number", "book_title", "session_id", "date",
          "progress_value", "units_read", "status"]


def _value(item, *names):
    for name in names:
        if name in item:
            return item[name]
    return ""


def session_rows(plan):
    sections = plan.get("sections")
    if not isinstance(sections, list):
        raise ValueError("reading_plan.json has no valid sections list")
    rows = []
    for section in sections:
        if not isinstance(section, dict) or not isinstance(section.get("books"), list):
            raise ValueError("reading_plan.json contains an invalid section")
        section_name = _value(section, "label", "name")
        for book in section["books"]:
            if not isinstance(book, dict) or not isinstance(book.get("reading_sessions", []), list):
                raise ValueError("reading_plan.json contains an invalid book")
            audio = str(section_name).lower() == "audiobooks"
            for session in book.get("reading_sessions", []):
                if not isinstance(session, dict):
                    raise ValueError("reading_plan.json contains an invalid reading session")
                rows.append({
                    "section": section_name, "book_id": _value(book, "id", "book_id"),
                    "book_number": _value(book, "number", "book_number"),
                    "book_title": _value(book, "title", "name"),
                    "session_id": _value(session, "id", "session_id"),
                    "date": _value(session, "date"),
                    "progress_value": _value(session, "current_time_seconds", "current_time") if audio else _value(session, "current_page"),
                    "units_read": _value(session, "time_listened_seconds") if audio else _value(session, "pages_read"),
                    "status": "deleted" if session.get("deleted") is True else "active",
                })
    return rows


def load_rows(path="reading_plan.json"):
    try:
        with open(path, encoding="utf-8") as handle:
            return session_rows(json.load(handle))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("could not read reading_plan.json: " + str(exc)) from exc


def main():
    try:
        rows = load_rows()
        with open("reading_sessions.csv", "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
    except (OSError, ValueError) as exc:
        print("Error: " + str(exc))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
