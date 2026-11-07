const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

test.use({ timezoneId: 'UTC' });

// A valid schema-2 bundle whose plan spans the whole supported calendar range.
const longRangeBundle = () => {
  const book = {
    id: 'Long range', number: 1, title: 'Long range', start_page: 1, end_page: 300, current_page: 10, pages_read: 10,
    baseline_schedule: { start_date: '0001-01-01', deadline: '9999-12-31', daily_target: 0.0001 },
  };
  const section = (label, books) => ({ label, baseline_needs_recalculation: false, simultaneous_groups: [], books });
  const data = {
    'plan.json': { schema_version: 2, start_date: '0001-01-01', end_date: '9999-12-31', end_label: 'Target finish date' },
    'books.json': {
      schema_version: 2,
      sections: [section('Physical books', [book]), section('Digital books', []), section('Audiobooks', [])],
    },
    'sessions.json': { schema_version: 2, sessions: { 'Long range': [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-11-07', modified_by: 'test', files: hashes,
  })) });
  return files;
};

const desktopCounts = `
import json, sys
from datetime import date
from reading_plan import available_reading_days_count, rest_day_ranges_from_json
sys.stdout.write(json.dumps([
    available_reading_days_count(date.fromisoformat(item['start']), date.fromisoformat(item['end']),
                                 rest_day_ranges_from_json(item['restDays']))
    for item in json.loads(sys.stdin.read())
]))
`;

test('reading-day counts match listed days and the desktop model', async ({ page }) => {
  await page.goto('./');
  const cases = [
    { start: '2026-01-01', end: '2026-01-31', restDays: [] },
    {
      start: '2026-01-01', end: '2026-12-31',
      restDays: [{ start_date: '2026-02-01', end_date: '2026-02-05' }, { start_date: '2026-12-31', end_date: '2026-12-31' }],
    },
    { start: '0099-12-31', end: '0100-01-01', restDays: [] },
    { start: '2024-02-28', end: '2024-03-01', restDays: [{ start_date: '2024-02-29', end_date: '2024-02-29' }] },
  ];
  const expected = JSON.parse(execFileSync('python', ['-c', desktopCounts], { input: JSON.stringify(cases) }).toString());
  const actual = await page.evaluate((items) => items.map((item) => {
    const api = window.ReadingSchedule;
    const list = api.availableReadingDays(item.start, item.end, item.restDays);
    return { count: api.availableDayCount(item.start, item.end, item.restDays), length: list.length, first: list[0], last: list.at(-1) };
  }), cases);
  expect(actual.map((item) => item.count)).toEqual(expected);
  for (const [index, item] of actual.entries()) expect(item.count, cases[index].start).toBe(item.length);
  expect(actual[2]).toEqual({ count: 2, length: 2, first: '0099-12-31', last: '0100-01-01' });
  expect(actual[3]).toEqual({ count: 2, length: 2, first: '2024-02-28', last: '2024-03-01' });
});

test('long intervals are counted without building a day list', async ({ page }) => {
  await page.goto('./');
  const measured = await page.evaluate(() => {
    const api = window.ReadingSchedule;
    const countStarted = performance.now();
    const count = api.availableDayCount('0001-01-01', '9999-12-31', []);
    const countMs = performance.now() - countStarted;
    const listStarted = performance.now();
    let error = null, list = null;
    try {
      list = api.availableReadingDays('0001-01-01', '9999-12-31', []);
    } catch (caught) {
      error = caught.message;
    }
    return { count, countMs, list, error, listMs: performance.now() - listStarted };
  });
  expect(measured.count).toBe(3652059);
  expect(measured.list).toBeNull();
  expect(measured.error).toContain('Refusing to list 3652059 reading days');
  expect(measured.countMs).toBeLessThan(1000);
  expect(measured.listMs).toBeLessThan(1000);
});

test('a long-range bundle renders charts, metrics and schedules without unbounded work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00Z'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(longRangeBundle());
  page.once('dialog', (dialog) => dialog.accept());
  const started = Date.now();
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');

  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  const svg = page.getByRole('img', { name: 'Reading chart for Long range' });
  await expect(svg.locator('.chart-date-label')).toHaveCount(5);
  expect(await svg.innerHTML()).not.toMatch(/NaN|Infinity/);

  await page.locator('#metrics-open').click();
  await page.locator('#metrics-content').getByRole('button', { name: 'Summary metrics', exact: true }).click();
  await expect(page.locator('#metrics-content')).toContainText('3652059 days');
  expect(Date.now() - started).toBeLessThan(10000);

  const schedule = await page.evaluate(() => {
    const api = window.ReadingSchedule;
    const plan = { start_date: '0001-01-01', end_date: '9999-12-31', rest_days: [{ start: '2026-01-01', end: '2026-02-01' }] };
    const books = { sections: [{
      label: 'Physical books', baseline_needs_recalculation: false, simultaneous_groups: [],
      books: [{ id: 'a', title: 'A', start_page: 1, end_page: 300, current_page: 10 }],
    }] };
    const sections = api.sectionsFromBooksFile(books);
    let mark = performance.now();
    const baselines = api.calculateBaselines(sections, plan.start_date, plan.end_date, plan.rest_days);
    const calculateMs = performance.now() - mark;
    mark = performance.now();
    const today = api.todayReading(plan, books, 'Physical books', '2026-11-07');
    return { baselines, calculateMs, deadline: today.a.deadline, todayMs: performance.now() - mark };
  });
  expect(schedule.baselines.a.deadline).toBe('9999-12-31');
  expect(schedule.deadline).toBe('9999-12-31');
  expect(schedule.calculateMs).toBeLessThan(2000);
  expect(schedule.todayMs).toBeLessThan(2000);
  expect(errors).toEqual([]);
});
