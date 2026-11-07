# Issue 61 — Bounded scheduling work for long supported date ranges

Synthetic fixtures only; no reader data was read. Measurements are from Node
24.18.0 on Windows 11, and the browser checks use Playwright 1.64.1 Chromium.
Node numbers are not a browser benchmark.

## Reproduction (before)

Run from the repository root against the unchanged `web/schedule.js`:

| Path | Result |
| --- | --- |
| `availableReadingDays('0001-01-01', '9999-12-31', [])` | 3,652,059 days, **9,356 ms**, 342 MB RSS |
| Chart initial-days window `0001-01-01` → `2016-01-01` | 735,964 days, 2,537 ms |
| `calculateBaselines` for a plan `0001-01-01` → `9999-12-31` | 883 ms, 370 MB RSS |
| `requiredPace` on the resulting baseline | 428 ms |
| `todayReading` for the same plan | 827 ms, 362 MB RSS |

Cause: `availableDays` materialized every day of an interval and
`availableReadingDays` mapped the result to ISO strings. Rendering and schedule
paths rebuilt those lists even when they only needed a length, membership, or a
single day.

## Change

- `web/schedule.js`: replaced list building with `countDays`, `dayAt` and
  `firstDay`, plus the exported `availableDayCount`. `calculateDeadlines` uses a
  count plus an index lookup instead of indexing a materialized array;
  `restAdjustedTargets`, `calculateBaselines`, `applyDeadlineOverride`,
  `applyStartOverride`, `requiredPace`, `sessionTarget` and `todayReading` use
  counts; `effectiveRemainingStart` uses the first available day.
- `availableReadingDays` is kept for compatibility and boundary checks, but it is
  now bounded: more than `MAX_LISTED_DAYS` (10,000) available days throws a
  `RangeError` that states the count. Long ranges are refused explicitly rather
  than silently truncated.
- `web/charts.js`: chart membership comes from the normalized rest-day ranges
  (no per-window `Set` of ISO days), and `initialDays`, `daysRemaining`, the
  metrics "Remaining days" column and "Reading period" use counts.
- `web/app.js`: plan-date validation uses a count instead of building a list.

## Measured after

| Path | Result |
| --- | --- |
| `availableDayCount('0001-01-01', '9999-12-31', [])` | 3,652,059 days, **1 ms**, 47 MB RSS |
| `availableReadingDays` same interval | `RangeError` in 1 ms (explicit limit) |
| Chart initial-days count `0001-01-01` → `2016-01-01` | 735,964 days, 0 ms |
| `calculateBaselines` long plan | **7 ms**, output identical to before |
| `requiredPace` | 0 ms, output identical |
| `todayReading` | 3 ms, output identical (48 MB RSS) |

## Regression coverage

New `web-tests/long-range-schedule.spec.js` (3 tests):

1. `availableDayCount` equals the listed days and the desktop
   `available_reading_days_count` for normal, rest-day, `0099`→`0100` and leap-day
   ranges, including first/last listed days.
2. A `0001`→`9999` interval is counted in under a second and refuses to build a
   list in under a second with the exact count in the message.
3. A schema-2 bundle covering `0001-01-01`→`9999-12-31` imports, renders the
   chart (5 date labels, no `NaN`/`Infinity`), opens Metrics to the 3,652,059-day
   reading period, and runs `calculateBaselines`/`todayReading` with deadlines on
   `9999-12-31` under 2 s each, with no page errors.

Commands and results:

- Focused: `npx playwright test web-tests/long-range-schedule.spec.js web-tests/scheduling.spec.js web-tests/chart-date-boundary.spec.js --workers=1 --retries=0 --reporter=line`
  → **16 passed**, 39.3 s, exit 0. This keeps the desktop-parity scheduling
  cases, groups/overrides, and the 0001/0099/0100/9999 chart date cases on
  unchanged expectations.
- Full suite: `npx playwright test --workers=1 --retries=0 --reporter=line`
  → **178 passed**, 6.7 min, exit 0.
- `node --check` passed for `web/schedule.js`, `web/charts.js`, `web/app.js` and
  the new spec. `git diff --check` passed for tracked files; the new spec has no
  trailing whitespace.

## Limits

- Browser timings are bounded by generous ceilings rather than recorded values;
  the 1 s / 2 s / 10 s assertions catch the pathological case but are not a
  performance benchmark.
- Fixed-horizon loops remain: charts iterate their ~10-year window per day and
  projections iterate the 10-year forecast horizon. The change removes work that
  scaled with the plan's interval length, not those bounded horizons.
- The 10,000-day list cap is an explicit behavioral limit. No web view needs a
  day list longer than that; callers that do must count or index instead.
- `countDays`/`dayAt` rely on `normalizeRestDays` returning merged, disjoint,
  sorted ranges.
- `dayAt` returns `null` past the last reading day. A theoretical multi-group
  overflow previously produced an `undefined` group start (and a `RangeError`
  from `iso`); it now falls back to the plan end. No test exercises that case;
  the desktop code raises `IndexError` there. This is a deliberate robustness
  difference, recorded rather than hidden.
- Desktop Python (`available_reading_days_count`, scheduler) still materializes
  day lists and was intentionally not changed here; the issue is scoped to the
  web scheduling code. Very long plans remain slow on the desktop app.
- Run logs are retained outside the repository under the identifier
  `issue61-20261107`; machine-specific paths are not linked.
