---
type: data contract
title: JSON and CSV persistence
description: Portable schema, migration, stable identity, group encoding, metadata, and CSV interchange shared by desktop and Android.
tags: [persistence, json, csv, compatibility]
---

# JSON and CSV persistence

Python `json_plan_payload` writes schema version 8 with plan dates/label, three canonical sections, books, sessions, schedules, overrides, groups, rest ranges, summary options, and sync metadata. `write_json_plan_with_metadata` increments revision, records `last_modified`/`modified_by`, hashes the payload, and writes atomically through a temporary file. `load_json_plan` parses legacy versions, canonicalizes section labels, restores defaults, validates groups and ranges, and materializes missing baseline schedules without losing sessions.

Books and sessions carry stable UUID-like `id` values. Book identity survives reorder, add/delete remapping, JSON round trips, CSV import/export where represented, and snapshot comparison. `simultaneous_groups` encode one-based book-number tuples; `validate_simultaneous_groups` requires known, distinct, consecutive members, while insertion/deletion remaps references and unknown IDs are rejected. Snapshot comparison matches keyed lists by `id`, so stable identity is part of the cross-tool contract.

Book serialization preserves page or audiobook units, progress, reading sessions, `BaselineSchedule`, deadline/start overrides, completion fields, and Android-originated fields rather than dropping them. `canonical_section_label` accepts aliases but emits `Physical books`, `Digital books`, and `Audiobooks`. Android mirrors the contract in `BookModels`, `BookCollections`, `PlanPrimitives`, and `MainActivity`; both sides must update together for schema changes.

CSV uses section-specific headers and rows: page columns contain start/end/current pages, while audiobook columns contain `HH:MM` times and formatted remaining/duration values. Python uses `csv_table_headers`, `csv_table_row`, `parse_csv_book_table`, and `load_csv_plan`; Android uses `CsvSupport.csvHeaders`, `csvRow`, and `parseCsv`. CSV is an interchange view, not a complete replacement for JSON metadata and all stable fields.

Before overwrite, `ensure_json_plan_unchanged` compares loaded revision/hash and raises `ExternalPlanChangeError`; this protects desktop and Android edits from clobbering another client. Tests in `test_reading_plan.py` cover schema 8 round trips, legacy migration, Android-field preservation, group validation, CSV behavior, metadata, and stale-hash rejection. See [snapshots](../snapshots/comparison.md).
