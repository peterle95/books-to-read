---
type: data contract
title: JSON and CSV persistence
description: Version-1 bundle directory, validation, stable identity, CSV interchange, migration, and conflict-safe writes shared by desktop and Android.
tags: [persistence, json, csv, compatibility]
---

# JSON and CSV persistence

The active persistence contract is a version-1 bundle directory, defined by `BUNDLE_SCHEMA_VERSION`, `BUNDLE_DATA_FILES`, and `BUNDLE_FILES` in `reading_plan.py`. It contains `plan.json` (dates, target label, rest days, summary options), `books.json` (the three sections, books, schedules, overrides, progress, and simultaneous groups), `sessions.json` (reading history keyed by stable book ID), and `manifest.json` (revision, timestamps, modifier, and SHA-256 hashes for the three data files). Each JSON file is validated as an object with the supported schema version before it is accepted.

`_bundle_manifest` reads every required file, verifies the manifest's exact file set and checksums, then `_bundle_state` validates cross-file relationships. All three canonical sections must exist; book IDs must be unique; every book must have exactly one session list; sessions must have unique IDs and valid progress; and derived progress must agree with the session history. Missing, malformed, semantically invalid, or checksum-mismatched files raise `JsonBundleError` rather than triggering partial loading or legacy fallback.

`write_json_bundle` serializes a validated candidate state, stages each file with flush/fsync and JSON validation, checks for external changes, then replaces the data files and manifest. `read_json_bundle_metadata` and `ensure_json_bundle_unchanged` compare revision, manifest hash, and individual file hashes, so a desktop or Android writer cannot silently overwrite another client. The directory is authoritative once present. `import_legacy_json_plan` converts the old schema-8 single `reading_plan.json` into a new directory while preserving the source file.

Books and sessions retain stable UUID-like `id` values across reorder, edits, bundle round trips, CSV interchange where represented, and snapshot comparison. `simultaneous_groups` are persisted as book IDs in the bundle and remapped to the in-memory one-based book numbers; validation still requires known, distinct, consecutive members. `book_to_json`/`book_from_json`, `canonical_section_label`, and the Android `ReadingPlanBundleCodec`/`BookModels` implementations are the paired contract surfaces; update both clients when the bundle schema changes.

CSV remains an interchange view rather than a complete bundle replacement. Python uses `csv_table_headers`, `csv_table_row`, `parse_csv_book_table`, and `load_csv_plan`; Android uses `CsvSupport.csvHeaders`, `csvRow`, and `parseCsv`. Tests in `BundlePersistenceTests` in `test_reading_plan.py` cover separation of books and sessions, checksum rejection, range validation, legacy import, and external-change detection. See [snapshots](../snapshots/comparison.md) for the user-meaningful comparison boundary.

## Change navigation

Consult this page for any field, schema, migration, identity, sync, or cross-client change. Change the Python bundle serializers/validators and Android codec/data store together, preserve stable IDs and the four-file checksum invariant, then run `python3 -m unittest test_reading_plan.py`; an Android-facing contract change additionally requires `:app:assembleDebug` and manual load/edit/save/reopen checks. Do not hand-edit `reading_plan_data/manifest.json` without recomputing its hashes.