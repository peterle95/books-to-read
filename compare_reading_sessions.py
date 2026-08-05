import csv
from collections import Counter
import sys

from export_reading_sessions import FIELDS, load_rows


RED = "\033[31m"
GREEN = "\033[32m"
RESET = "\033[0m"


def csv_rows(path="reading_sessions.csv"):
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [field for field in FIELDS if field not in (reader.fieldnames or [])]
        if missing:
            raise ValueError("CSV is missing required headers: " + ", ".join(missing))
        return list(reader)


def identity(row):
    context = (row.get("section", ""), row.get("book_id", "") or row.get("book_title", ""))
    session_id = row.get("session_id", "")
    if session_id:
        return ("id", context, session_id)
    return ("values", context, row.get("date", ""), row.get("progress_value", ""),
            row.get("units_read", ""), row.get("status", ""))


def describe(row):
    text = ("section={section} book={book} date={date} id={session_id} status={status} "
            "progress_value={progress_value} units_read={units_read}").format(
                section=row.get("section", ""), book=row.get("book_title", ""),
                date=row.get("date", ""), session_id=row.get("session_id", ""),
                status=row.get("status", ""), progress_value=row.get("progress_value", ""),
                units_read=row.get("units_read", ""))
    if not sys.stdout.isatty():
        return text
    color = RED if row.get("status") == "deleted" else GREEN
    return color + text + RESET


def main():
    try:
        json_data = load_rows()
        csv_data = csv_rows()
    except FileNotFoundError:
        print("CSV file missing. Run python3 export_reading_sessions.py first.")
        return 1
    except (OSError, ValueError) as exc:
        print("Error: " + str(exc))
        return 1
    json_counter, csv_counter = Counter(map(identity, json_data)), Counter(map(identity, csv_data))
    missing_json = json_counter - csv_counter
    missing_csv = csv_counter - json_counter
    difference_count = sum(missing_json.values()) + sum(missing_csv.values())
    print("Missing from JSON: {}".format(sum(missing_csv.values())))
    for row in csv_data:
        if missing_csv[identity(row)]:
            print(describe(row)); missing_csv[identity(row)] -= 1
    print("Missing from CSV: {}".format(sum(missing_json.values())))
    for row in json_data:
        if missing_json[identity(row)]:
            print(describe(row)); missing_json[identity(row)] -= 1
    if difference_count == 0:
        print("No differences found. JSON and CSV contain the same reading sessions.")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
