import json
import sys

from export_reading_sessions import SNAPSHOT_PATH, load_plan, meaningful_plan


TIME_FIELDS = {"current_time_seconds", "remaining_time_seconds", "time_listened_seconds"}
FIELD_LABELS = {
    "current_page": "Current page",
    "current_time_seconds": "Listening progress",
    "deadline_override": "Deadline override",
    "end_date": "End date",
    "pages_read": "Pages read",
    "reading_sessions": "Reading session",
    "remaining_time_seconds": "Time left",
    "start_date": "Start date",
    "time_listened_seconds": "Time listened",
}
STATUS_COLORS = {"Added": "\033[32m", "Changed": "\033[33m", "Missing": "\033[31m"}
RESET = "\033[0m"


def list_key(item):
    return item["id"] if isinstance(item, dict) and "id" in item else None


def difference(status, path, before, now, section, book):
    context = now if now is not None else before
    if isinstance(context, dict):
        section = context.get("label", section)
        book = context.get("title", book)
    return {"status": status, "path": path, "before": before, "now": now, "section": section, "book": book}


def differences(snapshot, current, path="", section="Reading plan", book="-"):
    if type(snapshot) is not type(current):
        return [difference("Changed", path, snapshot, current, section, book)]
    if isinstance(snapshot, dict):
        section = current.get("label", snapshot.get("label", section))
        book = current.get("title", snapshot.get("title", book))
        changes = []
        for key in sorted(snapshot.keys() | current.keys()):
            child_path = key if not path else path + "." + key
            if key not in current:
                changes.append(difference("Missing", child_path, snapshot[key], None, section, book))
            elif key not in snapshot:
                changes.append(difference("Added", child_path, None, current[key], section, book))
            else:
                changes.extend(differences(snapshot[key], current[key], child_path, section, book))
        return changes
    if isinstance(snapshot, list):
        changes = []
        keyed = [item for item in snapshot + current if not list_key(item)]
        if not keyed:
            current_by_id = {list_key(item): item for item in current}
            seen = set()
            for item in snapshot:
                key = list_key(item)
                seen.add(key)
                child_path = "{}[id={}]".format(path, key)
                if key in current_by_id:
                    changes.extend(differences(item, current_by_id[key], child_path, section, book))
                else:
                    changes.append(difference("Missing", child_path, item, None, section, book))
            for item in current:
                if list_key(item) not in seen:
                    changes.append(difference("Added", "{}[id={}]".format(path, list_key(item)), None, item, section, book))
        else:
            for index in range(min(len(snapshot), len(current))):
                changes.extend(differences(snapshot[index], current[index], "{}[{}]".format(path, index), section, book))
            for index in range(len(current), len(snapshot)):
                changes.append(difference("Missing", "{}[{}]".format(path, index), snapshot[index], None, section, book))
            for index in range(len(snapshot), len(current)):
                changes.append(difference("Added", "{}[{}]".format(path, index), None, current[index], section, book))
        return changes
    if snapshot != current:
        return [difference("Changed", path, snapshot, current, section, book)]
    return []


def field_label(path):
    field = path.rsplit(".", 1)[-1].split("[", 1)[0]
    return FIELD_LABELS.get(field, field.replace("_", " ").capitalize())


def format_duration(seconds):
    total_minutes = (seconds + 30) // 60
    hours, minutes = divmod(total_minutes, 60)
    return (str(hours) + "h " if hours else "") + str(minutes) + "m"


def format_value(value, path):
    field = path.rsplit(".", 1)[-1].split("[", 1)[0]
    if value is None:
        return "-"
    if field in TIME_FIELDS and isinstance(value, int):
        return format_duration(value)
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, dict) and field == "reading_sessions":
        return "Session on " + str(value.get("date", "unknown date"))
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True)
    return str(value)


def shorten(value, limit):
    return value if len(value) <= limit else value[:limit - 3] + "..."


def render_table(changes, use_color=False):
    headers = ["Status", "Format", "Book", "What changed", "Before", "Now"]
    limits = [8, 20, 28, 22, 24, 24]
    rows = [[
        change["status"],
        change["section"],
        change["book"],
        field_label(change["path"]),
        format_value(change["before"], change["path"]),
        format_value(change["now"], change["path"]),
    ] for change in changes]
    widths = [min(limit, max(len(header), *(len(cell) for cell in column))) for header, limit, column in zip(headers, limits, zip(*rows))]
    separator = "-+-".join("-" * width for width in widths)
    lines = [separator, " | ".join(header.ljust(width) for header, width in zip(headers, widths)), separator]
    for row in rows:
        cells = [shorten(cell, width).ljust(width) for cell, width in zip(row, widths)]
        if use_color:
            cells[0] = STATUS_COLORS[row[0]] + cells[0] + RESET
        lines.append(" | ".join(cells))
    lines.append(separator)
    return "\n".join(lines)


def main():
    try:
        snapshot = meaningful_plan(load_plan(SNAPSHOT_PATH))
    except FileNotFoundError:
        print("Snapshot missing. Run python3 export_reading_sessions.py first.")
        return 1
    except (OSError, ValueError) as exc:
        print("Error: " + str(exc))
        return 1
    try:
        current = meaningful_plan(load_plan())
    except FileNotFoundError:
        print("Current plan missing: reading_plan.json")
        return 1
    except (OSError, ValueError) as exc:
        print("Error: " + str(exc))
        return 1
    changes = differences(snapshot, current)
    if not changes:
        print("No important differences found. The current plan matches the snapshot.")
        return 0
    print("Important differences: {}".format(len(changes)))
    print(render_table(changes, sys.stdout.isatty()))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
