# Issue 63 — Allow valid page-zero books in CSV reimports

Synthetic fixtures only; no reader data was read. Browser checks use the
Playwright Chromium build in this repository, and the desktop comparisons run the
repository's `reading_plan` package.

## Reproduction (before)

`web/csv.js` writes a book that starts on page 0 as `Start page` `0`, but
`parsePlan` rejected it with `(!audio && from < 1)`, so the app refused the CSV it
had just written for that book.

Observed by running the new spec against the previous condition (temporarily
restored, then reverted):

```
Import CSV plan
Expected: "CSV plan imported. Reading history is not included in CSV."
Received: "CSV could not be imported: Each book needs a title and valid range."
```

Both references allow page zero: `reading_plan.validate_page_range` rejects only a
negative start or an end before the start, and `PlanPrimitives.validatePageRange`
does the same. `web-tests/books-ui-parity.spec.js` already covers `0`-`0` in the
Books editor.

## Change

- `web/csv.js`: `parsePlan` now rejects only a negative start (`from < 0`) with the
  same message, so page-zero ranges import while negative and reversed ranges
  still fail.
- The export path was already correct (`book.start_page ?? 1` writes `0`), and
  progress round-trips as `pages_read = current_page - start_page + 1`.

## After

New `web-tests/csv-page-zero.spec.js`:

1. Desktop `write_csv` output with `Book(1, 'Zero start paper', 0, 100, current_page=10)`
   and `Book(1, 'Zero start digital', 0, 0)` imports as 0-100 (101 pages) and 0-0
   (1 page), keeping current page 10.
2. The web CSV export is read by desktop `load_csv_plan`: ranges 0-100 / 0-0 and
   current page 10 survive.
3. The web-written CSV reimports into the app: 0-100 with `current_page` 10 and
   `pages_read` 11, and 0-0 with no progress.
4. A negative start (`-5`) is rejected with "Use whole page numbers." and a
   reversed range (`20`-`10`) with "Each book needs a title and valid range.";
   raw bundle storage is byte-identical after both rejections.

Results:

- `npx playwright test web-tests/csv-page-zero.spec.js --workers=1 --retries=0 --reporter=line`
  → **1 passed**, 4.2 s, exit 0.
- `npx playwright test web-tests/csv-page-zero.spec.js web-tests/release.spec.js --workers=1 --retries=0 --reporter=line`
  → all **11** `release.spec.js` tests passed, including the desktop CSV
  import/export parity case. The new spec failed in that run only on an
  over-specified rejection message; it was corrected and re-run on its own above.
- The same spec against the previous `from < 1` condition → fails as shown in
  the reproduction.
- `node --check` passed for `web/csv.js` and the new spec.

## Limits

- CSV remains deliberately lossy: no reading history, stable IDs, overrides or
  next-quarter plan. This change adds none of them, and the import dialog and
  README still say so.
- The fixtures are desktop-generated CSV and synthetic books; no live reading data
  was read or exported.
- The desktop leg is checked through `load_csv_plan`, not through the desktop UI.
- Audiobook CSV keeps the native book-time syntax through `window.parseReadingUnits`,
  which still accepts bare seconds on the session/CSV path; that differs from the
  planned editor fixed in issue 62.
- Run logs are retained outside the repository under the identifier
  `issue63-20261107`; machine-specific paths are not linked.
