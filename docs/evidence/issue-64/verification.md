# Issue 64 — Reject ambiguous whitespace-normalized book IDs

Synthetic fixtures only; no reader data was read or modified. Browser checks use
the Playwright Chromium build in this repository, the desktop comparison uses the
repository's `reading_plan` package, and the Android reference is the committed
Java source. No Android instrumentation was run.

## Reproduction (before)

`web/bundle-validator.js` detected duplicate book IDs with raw strings, then keyed
its books map and session lookup by trimmed IDs. A checksummed four-file bundle
with `same` and ` same ` in one section, or across sections, passed validation and
reached the replace-confirmation dialog. The planned-quarter parser repeated the
raw check, so `plan` and ` plan ` also collapsed to one planned ID.

The new `web-tests/book-id-collisions.spec.js` reproduced this through the real
import form before the fix. The collision cases failed with the dialog
auto-dismissed because validation did not reject the bundle:

```
Bundle could not be imported: books.json Physical books book 2: duplicate book ID
Received: "Import cancelled. Stored bundle unchanged."
```

The cross-section and planned-quarter cases failed the same way with their own
expected paths. A normal import also showed `Import cancelled.` in that run until
the spec accepted the confirmation dialog; that was a fixture issue, not a
validator result.

## Reference behavior

- **Android rejects the collision.** `ReadingPlanBundleCodec.toLegacyJson`
  (`reading-plan-android/app/src/main/java/com/petermolnar/readingplan/ReadingPlanBundleCodec.java:253`)
  trims each book ID before `bookIds.add(id)`, so `same` and ` same ` fail with
  `duplicate book ID`. The legacy-to-bundle path (`fromLegacyJson`, `:120`) uses
  the same trimmed check.
- **Desktop accepts and collapses it.** `reading_plan.py` checks the raw string
  in `_bundle_books_values` (`:2962`-`:2973`), but `book_from_json` (`:2226`)
  trims the stored `Book.id`. Loading the same synthetic bundle returned both
  books with ID `same`, while the raw `books.json` stayed byte-identical.
  `_bundle_sessions_values` keys histories by the trimmed ID, so one `same` list
  was accepted for both books. Desktop therefore shares the web bug; this change
  matches Android and does not alter desktop behavior.

The web fix follows Android: reject the bundle instead of choosing or merging.

## Change

- `web/bundle-validator.js`: the duplicate-ID set now stores `raw.id.trim()`, the
  same value used as the books map and session-list key. One check covers
  same-section, cross-section, and planned-quarter collisions; the existing
  planned-versus-active check already compared trimmed IDs.
- Stored IDs are not trimmed or rewritten. A single padded ID with a
  whitespace-free session key still imports unchanged, and the raw book ID keeps
  its padding.
- `web-tests/book-id-collisions.spec.js` adds six checks: same-section and
  cross-section normalized collisions, a planned-quarter collision, a planned
  book reusing an active ID after trimming, distinct normal IDs with their
  histories, and a lone padded ID importing unchanged. Every rejected import is
  asserted against a full `localStorage` snapshot so no existing storage is
  rewritten.

## Migration assessment

A repository-wide scan of every JSON file with a `sections` list (excluding
`node_modules`, `graphify-out`, `test-results`, `test-results-books-ui`,
`__pycache__`, and `.git`) found no padded book IDs and no normalized duplicates.
The committed `fixtures/`, `reading_plan_data/`, and Android test assets are
clean.

No migration is added. Web and Android generate UUIDs for new books, so this
shape can only arrive from an external or hand-edited bundle, and there is no
unambiguous way to split one history between two colliding IDs. An
already-stored colliding bundle is left byte-for-byte untouched; importing it is
now rejected, and any write validates before storage so it fails instead of
silently merging, deleting, or rewriting records.

## After

- `npx playwright test web-tests/book-id-collisions.spec.js --workers=1 --retries=0 --reporter=line`
  → **6 passed**.
- `npx playwright test web-tests/book-id-collisions.spec.js web-tests/quarter-import-boundary.spec.js web-tests/updates-and-backups.spec.js web-tests/editor-atomicity.spec.js web-tests/release.spec.js --workers=1 --retries=0 --reporter=line`
  → **25 passed**, 1.0 min, exit 0. This keeps planned-quarter boundaries,
  bundle replacement, atomic edits, and desktop transfers on unchanged
  expectations.
- `node --check` passed for `web/bundle-validator.js` and the new spec.
- `npx playwright test --workers=1 --retries=0 --reporter=line`
  → **186 passed**, 6.8 min, exit 0 (full web suite).

## Limits

- The Android column comes from committed source, not a device or instrumentation
  run; the desktop column runs `load_json_bundle`, not the desktop UI.
- Desktop still accepts the ambiguous input. Fixing it there would change the
  desktop loader and is outside this web issue.
- An ambiguous bundle already in browser storage is not rewritten or auto-split;
  it is rejected on import, reported as invalid by the JSON status check, and
  blocked by validation on the next write. Existing raw bytes stay untouched.
- Reading-session IDs have a related raw-versus-trimmed duplicate pattern
  (`sessionIds` uses raw strings, the event map uses trimmed IDs, and identical
  whitespace variants merge). It is unchanged here and should be handled
  separately if wanted.
- Run logs are retained outside the repository under the identifier
  `issue64-20261107`; machine-specific paths are not linked.
