# Reading Plan Android

Native Android companion app for the desktop `reading_plan_gui.py` program.

The app reads and writes the same `reading_plan.json` schema as the computer program:

- `schema_version: 8 (with revision metadata, stable book/session IDs, and per-book baseline schedules)`
- physical, digital, and audiobook sections
- start/end dates and optional summary settings
- reading sessions, current-page progress, and audiobook time left
- simultaneous reading groups

## Syncthing setup

1. Sync the desktop `reading_plan.json` file to the Android phone with Syncthing.
2. Open the Android app.
3. Tap **Connect synced reading_plan.json** and choose the synced JSON file through Android's file picker.
4. The app keeps that document permission and auto-saves changes back to the same file.

The apps compare the loaded revision and SHA-256 hash before saving. If another device changed the file, the app stops rather than overwriting it; reload or resolve the conflict first.

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
