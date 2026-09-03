# Split reading-plan storage into a validated data directory

The desktop app, Android app, and command-line tools will share a `reading_plan_data/` directory containing `plan.json`, `books.json`, `sessions.json`, and a checksum-bearing `manifest.json` instead of relying on one mutable JSON document. The directory is authoritative, malformed or incomplete generations fail closed without fallback or recovery, and the existing `reading_plan.json` is imported once and left untouched so the user can remove it after verification.

This separates failures by domain while the manifest preserves one coherent revision across files. Writes stage and validate the data files before publishing the manifest last; old Android builds that only understand the mono file are not supported after migration.
