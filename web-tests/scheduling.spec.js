const { test, expect } = require('@playwright/test');
const { chooseDate } = require('./calendar-helper');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const desktop = `
import json, sys
from datetime import date
from reading_plan import (_bundle_books_values, calculate_baseline_schedules, effective_remaining_start_date,
                          available_reading_days_count, remaining_units, rest_day_ranges_from_json)

payload = json.loads(sys.stdin.buffer.read().decode('utf-8'))
start = date.fromisoformat(payload['start'])
end = date.fromisoformat(payload['end'])
today = date.fromisoformat(payload['today'])
rest = rest_day_ranges_from_json(payload['restDays'])
sections = _bundle_books_values(payload['books'])
calculate_baseline_schedules(sections, start, end, rest)
out = {}
for section in sections:
    for book in section.books:
        baseline = book.baseline_schedule
        if baseline is None:
            continue
        pace_start = effective_remaining_start_date(baseline.start_date, baseline.deadline, today, rest)
        days = available_reading_days_count(pace_start, baseline.deadline, rest)
        out[book.id] = {
            'startDate': baseline.start_date.isoformat(),
            'deadline': baseline.deadline.isoformat(),
            'dailyTarget': baseline.daily_target,
            'required': remaining_units(book, section.label) / days if days else 0.0,
        }
sys.stdout.write(json.dumps(out))
`;

const section = (label, books, groups = []) => ({ label, baseline_needs_recalculation: false, simultaneous_groups: groups, books });
const book = (id, title, startPage, endPage, currentPage) => ({
  id, number: 1, title, baseline_schedule: null, deadline_override: null, start_date_override: null, target_completed_date: null,
  start_page: startPage, end_page: endPage, current_page: currentPage,
  pages: endPage - startPage + 1, pages_read: currentPage == null ? 0 : currentPage - startPage + 1,
});
const audiobook = (id, title, duration, current) => ({
  id, number: 1, title, baseline_schedule: null, deadline_override: null, start_date_override: null, target_completed_date: null,
  start_time_seconds: 0, end_time_seconds: duration, current_time_seconds: current,
  duration_seconds: duration, time_listened_seconds: current, remaining_time_seconds: duration - current,
});
const booksFile = (sections) => ({ schema_version: 2, sections });

const reading = (id = 'reading', startPage, endPage, current) => book(id, 'Reading', startPage, endPage, current);

const cases = [
  {
    name: 'pages, seconds, finished and unstarted work',
    start: '2026-01-01', end: '2026-03-31', today: '2026-02-10', restDays: [],
    books: booksFile([
      section('Physical books', [reading('pages', 1, 100, 25), reading('fresh', 1, 50, null)]),
      section('Digital books', [reading('done', 1, 30, 30)]),
      section('Audiobooks', [audiobook('audio', 'Audio', 3600, 900)]),
    ]),
  },
  {
    name: 'overlapping rest days merge and only reduce pace',
    start: '2026-01-01', end: '2026-03-31', today: '2026-03-15',
    restDays: [
      { start_date: '2026-02-01', end_date: '2026-02-05' },
      { start_date: '2026-01-20', end_date: '2026-01-22' },
      { start_date: '2026-02-04', end_date: '2026-02-06' },
      { start_date: '2026-03-31', end_date: '2026-03-31' },
    ],
    books: booksFile([
      section('Physical books', [reading('pages', 1, 100, 25), reading('short', 1, 3, 2)]),
      section('Digital books', [reading('digital', 1, 40, 10)]),
      section('Audiobooks', [audiobook('audio', 'Audio', 7200, 1800)]),
    ]),
  },
  {
    name: 'simultaneous groups share a start and finish',
    start: '2026-01-01', end: '2026-03-31', today: '2026-02-01', restDays: [],
    books: booksFile([
      section('Physical books', [reading('first', 1, 60, 20), reading('companion', 1, 40, null), reading('later', 1, 50, null)], [['first', 'companion']]),
      section('Digital books', []),
      section('Audiobooks', []),
    ]),
  },
  {
    name: 'one-day plan and empty sections',
    start: '2026-05-01', end: '2026-05-01', today: '2026-05-01', restDays: [],
    books: booksFile([
      section('Physical books', [reading('small', 1, 10, null), reading('tiny', 1, 10, null)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ]),
  },
  {
    name: 'today after the plan finish',
    start: '2026-01-01', end: '2026-03-31', today: '2026-06-01', restDays: [{ start_date: '2026-03-30', end_date: '2026-03-31' }],
    books: booksFile([
      section('Physical books', [reading('pages', 1, 100, 60)]),
      section('Digital books', []),
      section('Audiobooks', [audiobook('audio', 'Audio', 3600, 3600)]),
    ]),
  },
  {
    name: 'today before the plan starts',
    start: '2026-01-01', end: '2026-03-31', today: '2025-12-01', restDays: [{ start_date: '2026-01-01', end_date: '2026-01-03' }],
    books: booksFile([
      section('Physical books', [reading('pages', 1, 100, 10)]),
      section('Digital books', [reading('digital', 1, 80, 80)]),
      section('Audiobooks', [audiobook('audio', 'Audio', 1800, 0)]),
    ]),
  },
];

test('web scheduling agrees with the desktop calculation model', async ({ page }) => {
  await page.goto('./');
  for (const item of cases) {
    const expected = JSON.parse(execFileSync('python', ['-c', desktop], { input: JSON.stringify(item) }).toString());
    const actual = await page.evaluate((payload) => {
      const api = window.ReadingSchedule;
      const sections = api.sectionsFromBooksFile(payload.books);
      const baselines = api.calculateBaselines(sections, payload.start, payload.end, payload.restDays);
      const pace = api.requiredPace(sections, baselines, payload.today, payload.restDays);
      return Object.fromEntries(Object.entries(baselines).map(([id, value]) => [id, { ...value, required: pace[id] }]));
    }, item);
    expect(actual, item.name).toEqual(expected);
  }
});

test('schedule date domain and UTC day numbers agree with Python for early and boundary years', async ({ page }) => {
  await page.goto('./');
  const dates = ['0001-01-01', '0004-02-29', '0096-02-29', '0099-12-31', '0100-03-01', '9999-12-31', '0000-02-29', '0100-02-29'];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json, sys
from datetime import date
from reading_plan import parse_date
out = []
for value in json.loads(sys.stdin.read()):
    try:
        parsed = parse_date(value)
        out.append({'iso': parsed.isoformat(), 'day': (parsed - date(1970, 1, 1)).days})
    except ValueError:
        out.append(None)
print(json.dumps(out))
`], { input: JSON.stringify(dates) }).toString());
  const actual = await page.evaluate((dates) => dates.map((value) => {
    try { const day = ReadingSchedule.parseDate(value); return { iso: ReadingSchedule.iso(day), day }; }
    catch { return null; }
  }), dates);
  expect(actual).toEqual(expected);
  expect(await page.evaluate(() => ReadingSchedule.availableReadingDays('0099-12-31', '0100-01-01', [])))
    .toEqual(['0099-12-31', '0100-01-01']);
});

test('plan dates, rest days and baselines persist and are only rewritten on request', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-schedule-'));
  const names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
  try {
    execFileSync('python', ['-c', `
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
import sys
write_json_bundle(sys.argv[1], [
    BookSection('Physical books', [Book(1, 'First', 1, 20, id='first'), Book(2, 'Second', 1, 20, id='second')], []),
    BookSection('Digital books', [], []),
    BookSection('Audiobooks', [Book(1, 'Audio', 0, 3600, id='audio')], []),
], date(2026, 1, 1), date(2026, 3, 31), 'Quarter end', SummaryStatsOptions(False, False, False, False, False))
`, directory]);
    const files = names.map((name) => ({ name, mimeType: 'application/json', buffer: fs.readFileSync(path.join(directory, name)) }));
    const row = (title) => page.locator('#schedule-rows tr').filter({ has: page.getByRole('cell', { name: title, exact: true }) });

    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule saved. Required pace reflects today.');
    const storedBundle = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));

    await expect(row('First').locator('td').nth(2)).toHaveText('2026-01-01');
    await expect(row('First').locator('td').nth(3)).toHaveText('2026-02-14');
    await expect(row('First').locator('td').nth(4)).toHaveText('0.44');
    await expect(row('Second').locator('td').nth(2)).toHaveText('2026-02-15');
    await expect(row('Second').locator('td').nth(3)).toHaveText('2026-03-31');
    await expect(row('Audio').locator('td').nth(2)).toHaveText('2026-01-01');
    await expect(row('Audio').locator('td').nth(3)).toHaveText('2026-03-31');
    await expect(row('Audio').locator('td').nth(4)).toHaveText('40');

    await page.getByLabel('Plan finish').fill('2026-03-30');
    await page.getByRole('button', { name: 'Save plan dates' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText(/baseline stays unchanged/);
    await expect(row('Second').locator('td').nth(3)).toHaveText('2026-03-31');

    await chooseDate(page, page.getByLabel('Rest start date'), '2026-02-01');
    await chooseDate(page, page.getByLabel('Rest end date'), '2026-02-02');
    await page.getByRole('button', { name: 'Add rest-day range' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText(/baseline stays unchanged/);
    await expect(row('First').locator('td').nth(3)).toHaveText('2026-02-14');
    await expect(row('First').locator('td').nth(4)).toHaveText('0.44');
    const updatedBundle = JSON.parse(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1')));
    expect(JSON.parse(Buffer.from(updatedBundle['books.json'], 'base64')).sections[0].books[0].baseline_schedule)
      .toEqual(JSON.parse(Buffer.from(JSON.parse(storedBundle)['books.json'], 'base64')).sections[0].books[0].baseline_schedule);

    await page.reload();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByLabel('Plan finish')).toHaveValue('2026-03-30');
    await expect(page.getByLabel('Rest days').locator('li')).toHaveText('2026-02-01 ? 2026-02-02 Remove');
    await expect(page.getByTestId('schedule-status')).toHaveText(/baseline stays unchanged/);
    await expect(row('Second').locator('td').nth(3)).toHaveText('2026-03-31');

    await page.getByRole('button', { name: 'Calculate schedule' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule calculated on this device.');
    await expect(row('First').locator('td').nth(3)).toHaveText('2026-02-14');
    await expect(row('First').locator('td').nth(4)).toHaveText('0.47');
    await expect(row('Second').locator('td').nth(3)).toHaveText('2026-03-30');
    await expect(row('Second').locator('td').nth(4)).toHaveText('0.45');

    // A bundle without saved baselines can still be calculated on this device.
    const books = JSON.parse(files[1].buffer.toString());
    for (const group of books.sections) for (const item of group.books) item.baseline_schedule = null;
    const manifest = JSON.parse(files[3].buffer.toString());
    const cleared = Buffer.from(JSON.stringify(books));
    manifest.files['books.json'] = createHash('sha256').update(cleared).digest('hex');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles([
      files[0],
      { ...files[1], buffer: cleared },
      files[2],
      { ...files[3], buffer: Buffer.from(JSON.stringify(manifest)) },
    ]);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText(/No baseline schedule/);
    await page.getByRole('button', { name: 'Calculate schedule' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule calculated on this device.');
    await expect(row('First').locator('td').nth(3)).toHaveText('2026-02-14');
    await expect(row('First').locator('td').nth(4)).toHaveText('0.44');
    await expect(row('Second').locator('td').nth(3)).toHaveText('2026-03-31');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const overridden = (book, deadline) => ({ ...book, deadline_override: deadline });

const overrideCases = [
  {
    name: 'a group member override detaches only that book',
    start: '2026-07-01', end: '2026-09-30', today: '2026-07-10', restDays: [],
    books: booksFile([
      section('Physical books', [
        overridden(reading('one', 1, 10, 5), '2026-08-01'),
        reading('two', 1, 20, null),
        reading('three', 1, 30, null),
      ], [['one', 'two', 'three']]),
      section('Digital books', []),
      section('Audiobooks', []),
    ]),
  },
  {
    name: 'overrides, groups and rest days in every unit',
    start: '2026-07-01', end: '2026-09-30', today: '2026-07-20',
    restDays: [
      { start_date: '2026-07-05', end_date: '2026-07-07' },
      { start_date: '2026-08-12', end_date: '2026-08-14' },
    ],
    books: booksFile([
      section('Physical books', [
        overridden(reading('first', 1, 40, 10), '2026-08-15'),
        reading('second', 1, 60, null),
      ], [['first', 'second']]),
      section('Digital books', [overridden(reading('digital', 1, 40, 40), '2026-09-01')]),
      section('Audiobooks', [overridden(audiobook('audio', 'Audio', 3600, 900), '2026-08-10')]),
    ]),
  },
  {
    name: 'an ungrouped override keeps the plan finish out of reach',
    start: '2026-07-01', end: '2026-07-10', today: '2026-07-02', restDays: [{ start_date: '2026-07-08', end_date: '2026-07-08' }],
    books: booksFile([
      section('Physical books', [reading('one', 1, 10, null), overridden(reading('two', 1, 90, null), '2026-07-10')]),
      section('Digital books', []),
      section('Audiobooks', []),
    ]),
  },
];

const desktopOverrides = `
import json, sys
from datetime import date
from reading_plan import (_bundle_books_values, build_section_plan, _store_baseline_schedules, total_units,
                          apply_deadline_override, effective_remaining_start_date,
                          available_reading_days_count, remaining_units, rest_day_ranges_from_json)

payload = json.loads(sys.stdin.buffer.read().decode('utf-8'))
start = date.fromisoformat(payload['start'])
end = date.fromisoformat(payload['end'])
today = date.fromisoformat(payload['today'])
rest = rest_day_ranges_from_json(payload['restDays'])
sections = _bundle_books_values(payload['books'])
for section in sections:
    _store_baseline_schedules(
        section,
        build_section_plan(section, start, end).deadlines,
        lambda book, label=section.label: total_units(book, label),
        rest,
    )
for section in sections:
    for book in section.books:
        if book.deadline_override is not None:
            apply_deadline_override(section, book, book.deadline_override, end, today, rest)
out = {}
for section in sections:
    for book in section.books:
        baseline = book.baseline_schedule
        if baseline is None:
            continue
        pace_start = effective_remaining_start_date(baseline.start_date, baseline.deadline, today, rest)
        days = available_reading_days_count(pace_start, baseline.deadline, rest)
        out[book.id] = {
            'startDate': baseline.start_date.isoformat(),
            'deadline': baseline.deadline.isoformat(),
            'dailyTarget': baseline.daily_target,
            'required': remaining_units(book, section.label) / days if days else 0.0,
        }
sys.stdout.write(json.dumps(out))
`;

test('groups and deadline overrides agree with the desktop calculation model', async ({ page }) => {
  await page.goto('./');
  for (const item of overrideCases) {
    const expected = JSON.parse(execFileSync('python', ['-c', desktopOverrides], { input: JSON.stringify(item) }).toString());
    const actual = await page.evaluate((payload) => {
      const api = window.ReadingSchedule;
      const state = api.stateFromBundle({ start_date: payload.start, end_date: payload.end, rest_days: payload.restDays }, payload.books);
      const sections = api.withLocalSettings(api.sectionsFromBooksFile(payload.books), state.groups, state.overrides);
      const baselines = api.calculateBaselines(sections, payload.start, payload.end, payload.restDays);
      api.applyPersistedOverrides(sections, baselines, payload.end, payload.today, payload.restDays);
      const pace = api.requiredPace(sections, baselines, payload.today, payload.restDays);
      return Object.fromEntries(Object.entries(baselines).map(([id, value]) => [id, { ...value, required: pace[id] }]));
    }, item);
    expect(actual, item.name).toEqual(expected);
  }
});

test('groups and deadline overrides can be planned, cleared and persist', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-overrides-'));
  const names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
  try {
    execFileSync('python', ['-c', `
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
import sys
write_json_bundle(sys.argv[1], [
    BookSection('Physical books', [Book(1, 'First', 1, 20, id='first'), Book(2, 'Second', 1, 30, id='second'), Book(3, 'Third', 1, 20, id='third')], []),
    BookSection('Digital books', [], []),
    BookSection('Audiobooks', [], []),
], date(2030, 1, 1), date(2030, 3, 31), 'Quarter end', SummaryStatsOptions(False, False, False, False, False))
`, directory]);
    const files = names.map((name) => ({ name, mimeType: 'application/json', buffer: fs.readFileSync(path.join(directory, name)) }));
    const row = (title) => page.locator('#schedule-rows tr').filter({ has: page.getByRole('cell', { name: title, exact: true }) });

    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule saved. Required pace reflects today.');
    await expect(row('First').locator('td').nth(3)).toHaveText('2030-01-26');

    // Only adjacent books can share one shared schedule.
    await page.getByRole('button', { name: 'Books', exact: true }).click();
    await page.getByRole('button', { name: 'Select simultaneous books', exact: true }).click();
    await page.getByRole('checkbox', { name: 'First' }).check();
    await page.getByRole('checkbox', { name: 'Third' }).check();
    await page.locator('#book-group-dialog').getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.locator('#book-group-status')).toHaveText('Books read together must be consecutive in the section.');
    await expect(page.getByLabel('Simultaneous groups').locator('li')).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Third' }).uncheck();
    await page.getByRole('checkbox', { name: 'Second' }).check();
    await page.locator('#book-group-dialog').getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.locator('#book-group-dialog')).not.toBeVisible();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByLabel('Simultaneous groups').locator('li')).toHaveText('Physical books: First, Second');
    await expect(page.getByTestId('schedule-status')).toHaveText(/baseline stays unchanged/);
    await expect(row('First').locator('td').nth(3)).toHaveText('2030-01-26');

    await page.getByRole('button', { name: 'Calculate schedule' }).click();
    await expect(row('First').locator('td').nth(2)).toHaveText('2030-01-01');
    await expect(row('First').locator('td').nth(3)).toHaveText('2030-03-06');
    await expect(row('Second').locator('td').nth(2)).toHaveText('2030-01-01');
    await expect(row('Second').locator('td').nth(3)).toHaveText('2030-03-06');
    await expect(row('First').locator('td').nth(4)).toHaveText('0.31');
    await expect(row('Second').locator('td').nth(4)).toHaveText('0.46');
    await expect(row('Third').locator('td').nth(2)).toHaveText('2030-03-07');
    await expect(row('Third').locator('td').nth(4)).toHaveText('0.8');

    // A deadline override gives one book an independent schedule.
    await chooseDate(page, page.getByLabel('Deadline override for First'), '2030-04-05');
    await page.getByRole('button', { name: 'Save the deadline for First' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('A deadline override cannot be after the plan finish date.');
    await chooseDate(page, page.getByLabel('Deadline override for First'), '2030-02-14');
    await page.getByRole('button', { name: 'Save the deadline for First' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Deadline override saved for First.');
    await expect(row('First').locator('td').nth(3)).toHaveText('2030-02-14');
    await expect(row('First').locator('td').nth(4)).toHaveText('0.44');
    await expect(row('Second').locator('td').nth(3)).toHaveText('2030-03-06');
    await expect(row('Third').locator('td').nth(3)).toHaveText('2030-03-31');

    await page.reload();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByLabel('Deadline override for First')).toHaveValue('2030-02-14');
    await expect(page.getByLabel('Simultaneous groups').locator('li')).toHaveText('Physical books: First, Second');
    await expect(row('First').locator('td').nth(3)).toHaveText('2030-02-14');

    // Clearing returns the book to the remaining group and leaves the rest alone.
    await page.getByRole('button', { name: 'Clear the deadline for First' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Deadline override cleared for First.');
    await expect(page.getByLabel('Deadline override for First')).toHaveValue('');
    await expect(row('First').locator('td').nth(3)).toHaveText('2030-03-06');
    await expect(row('Second').locator('td').nth(3)).toHaveText('2030-03-06');
    await expect(row('First').locator('td').nth(4)).toHaveText('0.31');
    await expect(row('Second').locator('td').nth(4)).toHaveText('0.46');
    await expect(row('Third').locator('td').nth(3)).toHaveText('2030-03-31');
    await expect(row('Third').locator('td').nth(4)).toHaveText('0.8');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
