# Reading Plan Android

Native Android companion app for the desktop `reading_plan_gui.py` program.

The app reads and writes the same `reading_plan_data/` directory as the computer program:

- `plan.json` contains dates, rest days, and summary settings.
- `books.json` contains stable book IDs, per-book baseline schedules, progress, overrides, and groups.
- `sessions.json` contains reading history keyed by stable book ID.
- `manifest.json` contains the revision metadata and checksums for the three data files.
- physical, digital, and audiobook sections
- normal startup and reload validate all four files before applying any state

## Syncthing setup

1. Sync the desktop `reading_plan_data/` directory to the Android phone with Syncthing.
2. Open the Android app.
3. Tap **Connect synced reading-plan directory** and choose the synced directory through Android's folder picker.
4. The app keeps that directory permission and auto-saves changes back to the four files.

If the selected directory contains only the legacy `reading_plan.json`, the app imports it once and leaves the original untouched. Verify the new files before deleting the legacy file yourself. A damaged or incomplete directory stops loading and offers **Retry** or **Choose directory**; it does not restore, copy, or fall back to another file.

The apps compare the loaded revision and SHA-256 hashes before saving. If another device changed any managed file, the app stops rather than overwriting it; reload or resolve the conflict first. Older Android builds that only understand the mono file must be updated before using the directory format.

## Features

- Session tab: log reading sessions by format, book, date, current page, or audiobook time left.
- Plan tab: manage plan-wide rest-day ranges and recalculate; start and finish dates appear after pressing New plan.
- Books tab: view today's reading targets with planned starts and deadlines, and add, insert, replace, delete, reorder, and group physical, digital, or audiobook entries. Audiobook times use `HH:MM` and also accept `HH:MM:SS`.
- Charts tab: view charts directly, then open Metrics to see key metrics or one focused detail view at a time.
- CSV import/export is included for compatibility with the desktop program's CSV flow.

## Build

Open `reading-plan-android` in Android Studio and run the `app` configuration, or build from a shell with a JDK and Android SDK available:

```powershell
gradle :app:assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.
