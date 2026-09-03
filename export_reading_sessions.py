import json
from pathlib import Path

from reading_plan import BUNDLE_DIRECTORY, json_bundle_snapshot_payload


SNAPSHOT_PATH = Path("reading_plan_snapshot.json")
AUTOMATIC_FIELDS = {"revision", "last_modified", "modified_by"}


def load_plan(path=BUNDLE_DIRECTORY):
    path = Path(path)
    if path.is_dir():
        return json_bundle_snapshot_payload(path)
    try:
        with open(path, encoding="utf-8") as handle:
            plan = json.load(handle)
    except FileNotFoundError:
        raise
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("could not read {}: {}".format(path, exc)) from exc
    if not isinstance(plan, dict):
        raise ValueError("{} must contain a JSON object".format(path))
    return plan


def meaningful_plan(plan):
    return {key: value for key, value in plan.items() if key not in AUTOMATIC_FIELDS}


def export_snapshot(source=BUNDLE_DIRECTORY, destination=SNAPSHOT_PATH):
    with open(destination, "w", encoding="utf-8") as handle:
        json.dump(meaningful_plan(load_plan(source)), handle, indent=2, sort_keys=True)
        handle.write("\n")


def main():
    try:
        export_snapshot()
    except (OSError, ValueError) as exc:
        print("Error: " + str(exc))
        return 1
    print("Exported reading-plan snapshot to " + str(SNAPSHOT_PATH))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
