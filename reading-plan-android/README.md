# Reading Plan Android

Native Android companion app for the desktop `reading_plan_gui.py` program.

The app reads and writes the same `reading_plan.json` schema as the computer program:

- `schema_version: 3`
- physical and digital book sections
- start/end dates and optional summary settings
- reading sessions and current-page progress
- simultaneous reading groups

## Syncthing setup

1. Sync the desktop `reading_plan.json` file to the Android phone with Syncthing.
2. Open the Android app.
3. Tap **Connect synced reading_plan.json** and choose the synced JSON file through Android's file picker.
4. The app keeps that document permission and auto-saves changes back to the same file.

For fewer sync conflicts, enable Syncthing file versioning and avoid editing the desktop and Android app at the exact same time.

## Features

- Session tab: log reading sessions by format, book, date, and current page.
- Plan tab: edit start/finish dates, toggle optional summary stats, and recalculate.
- Books tab: add, insert, replace, delete, reorder, and group physical or digital books.
- Summary tab: view remaining-page totals and per-format deadline tables.
- CSV import/export is included for compatibility with the desktop program's CSV flow.

## Build

Open `reading-plan-android` in Android Studio and run the `app` configuration, or build from a shell with a JDK and Android SDK available:

```powershell
gradle :app:assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.
