const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');

test('early-year quarter dates and day arithmetic agree with Python', async ({ page }) => {
  const dates = ['0001-01-01', '0001-03-31', '0001-10-01', '0001-12-31',
    '0099-10-01', '0099-12-31', '0100-01-01', '0100-02-28', '0100-03-01',
    '0004-02-29', '0400-02-29', '2026-01-01', '2026-10-01', '2026-12-31', '9999-07-01'];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json, sys
from datetime import date
from reading_plan import next_quarter_start, period_end_from_start
out = []
for value in json.loads(sys.stdin.read()):
    day = date.fromisoformat(value)
    start = date(day.year, (day.month - 1) // 3 * 3 + 1, 1)
    end = period_end_from_start(start)
    out.append({'start': start.isoformat(), 'next': next_quarter_start(day).isoformat(),
                'end': end.isoformat(), 'days': (end - start).days + 1})
print(json.dumps(out))
`], { input: JSON.stringify(dates) }).toString());
  await page.goto('./');
  const actual = await page.evaluate((dates) => dates.map((day) => {
    const quarter = window.ReadingQuarter;
    const start = quarter.quarterStart(day);
    const end = quarter.periodEnd(start);
    return { start, next: quarter.nextQuarterStart(day), end,
      days: window.ReadingSchedule.parseDate(end) - window.ReadingSchedule.parseDate(start) + 1 };
  }), dates);
  expect(actual).toEqual(expected);
  expect(actual[0]).toEqual({ start: '0001-01-01', next: '0001-04-01', end: '0001-03-31', days: 90 });
  expect(actual[5].next).toBe('0100-01-01');
});

test('year 9999 keeps valid quarter ends and rejects out-of-range results explicitly', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() => {
    const quarter = window.ReadingQuarter;
    const errors = [() => quarter.nextQuarterStart('9999-10-01'),
      () => quarter.nextQuarterStart('9999-12-31'), () => quarter.periodEnd('9999-11-01')]
      .map((calculate) => {
        try { return { value: calculate() }; }
        catch (error) { return { name: error.name, message: error.message }; }
      });
    return { next: quarter.nextQuarterStart('9999-09-30'), start: quarter.quarterStart('9999-12-31'),
      end: quarter.periodEnd('9999-10-01'), errors };
  });
  expect(result).toEqual({ next: '9999-10-01', start: '9999-10-01', end: '9999-12-31',
    errors: Array(3).fill({ name: 'RangeError', message: 'Quarter date must be within years 0001–9999.' }) });
});

test('early-year and final-year activation preserve the quarter dates', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() => ['0001-01-01', '0001-10-01', '0099-10-01', '0100-01-01', '9999-10-01']
    .map((start) => {
      const sections = window.ReadingQuarter.blankSections();
      const books = { sections, planned_quarter: { start_date: start, sections } };
      const activated = window.ReadingQuarter.activate(books, start);
      return { start: activated.start, end: activated.end };
    }));
  expect(result).toEqual([
    { start: '0001-01-01', end: '0001-03-31' }, { start: '0001-10-01', end: '0001-12-31' },
    { start: '0099-10-01', end: '0099-12-31' }, { start: '0100-01-01', end: '0100-03-31' },
    { start: '9999-10-01', end: '9999-12-31' },
  ]);
});
