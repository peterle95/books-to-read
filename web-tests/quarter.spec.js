const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const section = (label, books, groups = []) => ({ label, baseline_needs_recalculation: false, simultaneous_groups: groups, books });
const page = (id, title, start, end, current) => ({
  id, number: 1, title, baseline_schedule: null, deadline_override: null, start_date_override: null, target_completed_date: null,
  start_page: start, end_page: end, current_page: current, pages: end - start + 1,
  pages_read: current == null ? 0 : current - start + 1,
});
const audio = (id, title, duration, current) => ({
  id, number: 1, title, baseline_schedule: null, deadline_override: null, start_date_override: null, target_completed_date: null,
  start_time_seconds: 0, end_time_seconds: duration, current_time_seconds: current,
  duration_seconds: duration, time_listened_seconds: current, remaining_time_seconds: duration - current,
});
const plannedBook = (id, title, start, end) => page(id, title, start, end, null);
const plannedAudio = (id, title, duration) => ({
  ...audio(id, title, duration, null),
  current_time_seconds: null,
  time_listened_seconds: 0,
  remaining_time_seconds: null,
});
const bundle = (sections, planned) => ({ schema_version: 2, sections, planned_quarter: planned });
const plannedQuarter = (start, sections) => ({ start_date: start, sections });

const desktop = `
import json, sys
from datetime import date
from reading_plan import (_bundle_books_values, planned_quarter_from_json, activate_planned_quarter,
                          remaining_units, rest_day_ranges_from_json)

payload = json.loads(sys.stdin.buffer.read().decode('utf-8'))
current = _bundle_books_values(payload['books'])
planned = planned_quarter_from_json(payload['books'].get('planned_quarter'), current)
result = activate_planned_quarter(current, planned, date.fromisoformat(payload['today']),
                                  rest_day_ranges_from_json(payload['restDays']))
if result is None:
    out = None
else:
    sections, start, end = result
    out = {'start': start.isoformat(), 'end': end.isoformat(), 'sections': [
        {'label': section.label,
         'groups': [[section.books[number - 1].id for number in group]
                    for group in section.simultaneous_groups],
         'books': [{'id': book.id, 'number': book.number, 'title': book.title,
                    'remaining': remaining_units(book, section.label),
                    'baseline': None if book.baseline_schedule is None else {
                        'startDate': book.baseline_schedule.start_date.isoformat(),
                        'deadline': book.baseline_schedule.deadline.isoformat(),
                        'dailyTarget': book.baseline_schedule.daily_target}}
                   for book in section.books]}
        for section in sections
    ]}
sys.stdout.write(json.dumps(out))
`;

const activationCases = [
  {
    name: 'unfinished books carry forward, finished books leave, groups shrink',
    today: '2026-10-01', restDays: [],
    books: bundle([
      section('Physical books', [
        page('finished', 'Finished', 1, 20, 20),
        page('ongoing', 'Ongoing', 1, 100, 40),
        page('companion', 'Companion', 1, 60, null),
      ], [['finished', 'ongoing']]),
      section('Digital books', []),
      section('Audiobooks', [audio('audio', 'Audio', 3600, 1200)]),
    ], plannedQuarter('2026-10-01', [
      section('Physical books', [plannedBook('next-story', 'Next story', 1, 80)]),
      section('Digital books', [plannedBook('next-digital', 'Next digital', 1, 40)]),
      section('Audiobooks', [plannedAudio('next-audio', 'Next audio', 600)]),
    ])),
  },
  {
    name: 'late launch activates the quarter containing today',
    today: '2027-02-12', restDays: [],
    books: bundle([
      section('Physical books', [page('done', 'Done', 1, 20, 20)]),
      section('Digital books', [page('left', 'Left', 1, 50, 10)]),
      section('Audiobooks', []),
    ], plannedQuarter('2026-10-01', [
      section('Physical books', [plannedBook('next', 'Next', 1, 100)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ])),
  },
  {
    name: 'the quarter has not started yet',
    today: '2026-09-30', restDays: [],
    books: bundle([
      section('Physical books', [page('ongoing', 'Ongoing', 1, 100, 40)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ], plannedQuarter('2026-10-01', [
      section('Physical books', [plannedBook('next', 'Next', 1, 100)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ])),
  },
  {
    name: 'rest days reduce the recalculated baseline without moving its dates',
    today: '2028-01-01', restDays: [{ start_date: '2028-02-01', end_date: '2028-02-05' }],
    books: bundle([
      section('Physical books', [page('ongoing', 'Ongoing', 1, 100, 25)]),
      section('Digital books', []),
      section('Audiobooks', [audio('audio', 'Audio', 7200, 0)]),
    ], plannedQuarter('2028-01-01', [
      section('Physical books', [plannedBook('next', 'Next', 1, 80)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ])),
  },
  {
    name: 'a plan with only finished work keeps the planned books',
    today: '2026-07-01', restDays: [],
    books: bundle([
      section('Physical books', [page('done', 'Done', 1, 10, 10)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ], plannedQuarter('2026-07-01', [
      section('Physical books', [plannedBook('one', 'One', 1, 30), plannedBook('two', 'Two', 1, 30)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ])),
  },
];

test('quarter rollover agrees with the desktop calculation model', async ({ page }) => {
  await page.goto('./');
  for (const item of activationCases) {
    const expected = JSON.parse(execFileSync('python', ['-c', desktop], { input: JSON.stringify(item) }).toString());
    const actual = await page.evaluate((payload) => {
      const result = window.ReadingQuarter.activate(payload.books, payload.today);
      if (!result) return null;
      const sections = window.ReadingSchedule.sectionsFromBooksFile({ sections: result.sections });
      const baselines = window.ReadingSchedule.calculateBaselines(sections, result.start, result.end, payload.restDays, true);
      return {
        start: result.start,
        end: result.end,
        sections: sections.map((section) => ({
          label: section.label,
          groups: section.groups.map((group) => group.map(
            (number) => section.books.find((book) => book.number === number).id,
          )),
          books: section.books.map((book) => ({
            id: book.id,
            number: book.number,
            title: book.title,
            remaining: book.remaining,
            baseline: baselines[book.id]
              ? { startDate: baselines[book.id].startDate, deadline: baselines[book.id].deadline, dailyTarget: baselines[book.id].dailyTarget }
              : null,
          })),
        })),
      };
    }, item);
    expect(actual, item.name).toEqual(expected);
  }
});

const generate = (directory, mode) => execFileSync('python', ['-c', `
import json, sys
from datetime import date, timedelta
from reading_plan import (Book, BookSection, PlannedQuarter, RestDayRange, SummaryStatsOptions,
                          add_reading_session, next_quarter_start, period_end_from_start, write_json_bundle)

today = date.today()
due = date(today.year, (today.month - 1) // 3 * 3 + 1, 1)
future = next_quarter_start(today)
previous_end = due - timedelta(days=1)
previous_start = previous_end - timedelta(days=89)
ongoing = Book(2, 'Ongoing', 1, 100, id='ongoing')
add_reading_session(ongoing, due - timedelta(days=10), 40)
audio = Book(1, 'Audio', 0, 3600, id='audio')
add_reading_session(audio, due - timedelta(days=5), 1200, 'Audiobooks')
current = [
    BookSection('Physical books', [
        Book(1, 'Finished', 1, 20, current_page=20, id='finished'),
        ongoing,
        Book(3, 'Paired', 1, 50, id='paired'),
    ], [(1, 2)]),
    BookSection('Digital books', [], []),
    BookSection('Audiobooks', [audio], []),
]
planned = PlannedQuarter(future if sys.argv[2] == 'future' else due, [
    BookSection('Physical books', [Book(1, 'Next story', 1, 80, id='next-story')], []),
    BookSection('Digital books', [], []),
    BookSection('Audiobooks', [Book(1, 'Next audio', 0, 600, id='next-audio')], []),
])
write_json_bundle(sys.argv[1], current, previous_start, previous_end, 'Quarter end',
                  SummaryStatsOptions(False, False, False, False, False),
                  [RestDayRange(previous_end - timedelta(days=20), previous_end - timedelta(days=19))],
                  planned_quarter=planned)
print(json.dumps({
    'due': due.isoformat(),
    'dueEnd': period_end_from_start(due).isoformat(),
    'future': future.isoformat(),
    'beyond': next_quarter_start(future).isoformat(),
    'notBoundary': (future + timedelta(days=1)).isoformat(),
    'session': ongoing.reading_sessions[0].id,
}))
`, directory, mode]).toString();

const readFiles = (directory) => ['plan.json', 'books.json', 'sessions.json', 'manifest.json']
  .map((name) => ({ name, mimeType: 'application/json', buffer: fs.readFileSync(path.join(directory, name)) }));

test('a due next-quarter plan activates on import, persists and exports to desktop', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-quarter-due-'));
  const output = path.join(directory, 'export');
  fs.mkdirSync(output);
  try {
    const dates = JSON.parse(generate(directory, 'due'));
    const files = readFiles(directory);
    const row = (title) => page.locator('#schedule-rows tr').filter({ has: page.getByRole('cell', { name: title, exact: true }) });

    await page.goto('./');
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('quarter-status')).toHaveText(`Next quarter activated: ${dates.due} to ${dates.dueEnd}.`);

    // Unfinished books carry forward before the planned books; finished work is gone.
    await expect(page.getByLabel('Plan start')).toHaveValue(dates.due);
    await expect(page.getByLabel('Next quarter starts')).toHaveValue(dates.future);
    await expect(row('Ongoing')).toHaveCount(1);
    await expect(row('Paired')).toHaveCount(1);
    await expect(row('Audio')).toHaveCount(1);
    await expect(row('Next story')).toHaveCount(1);
    await expect(row('Next audio')).toHaveCount(1);
    await expect(row('Finished')).toHaveCount(0);
    await expect(page.getByTestId('schedule-status')).toHaveText(`Next quarter activated: ${dates.due} to ${dates.dueEnd}.`);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('reading-plan-bundle-v1')));
    const decode = (name) => Buffer.from(stored[name], 'base64').toString('utf-8');
    expect(JSON.parse(decode('plan.json')).start_date).toBe(dates.due);
    expect(JSON.parse(decode('plan.json')).rest_days).toEqual([]);
    expect(JSON.parse(decode('books.json')).planned_quarter).toBeNull();
    expect(JSON.parse(decode('books.json')).sections[0].books.map((book) => book.id)).toEqual(['ongoing', 'paired', 'next-story']);
    const sessions = JSON.parse(decode('sessions.json')).sessions;
    expect(sessions.ongoing.map((session) => session.id)).toEqual([dates.session]);
    expect(sessions.finished).toBeUndefined();

    await page.reload();
    await expect(page.getByTestId('quarter-status')).toHaveText('No books are planned for the next quarter yet.');
    await expect(row('Next story')).toHaveCount(1);
    await expect(row('Finished')).toHaveCount(0);
    await expect(page.getByLabel('Plan start')).toHaveValue(dates.due);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    const zip = path.join(directory, 'bundle.zip');
    await (await download).saveAs(zip);
    execFileSync('python', ['-c', `
from reading_plan import load_json_bundle
import sys, zipfile
with zipfile.ZipFile(sys.argv[2]) as archive:
    archive.extractall(sys.argv[1])
sections, start, end, label, name, options, rest, planned = load_json_bundle(sys.argv[1], include_planned=True)
assert start.isoformat() == sys.argv[3] and end.isoformat() == sys.argv[4]
assert [book.id for section in sections for book in section.books] == [
    'ongoing', 'paired', 'next-story', 'audio', 'next-audio']
assert sections[0].books[0].reading_sessions[0].id == sys.argv[5]
assert sections[0].books[0].reading_sessions[0].pages_read == 40
assert sections[0].books[0].current_page == 40
assert all(book.baseline_schedule is not None for section in sections for book in section.books)
assert sections[0].simultaneous_groups == [], sections[0].simultaneous_groups
assert planned is None, planned
assert rest == [], rest
`, output, zip, dates.due, dates.dueEnd, dates.session]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the next quarter can be planned, inspected, changed and removed before it starts', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-quarter-future-'));
  try {
    const dates = JSON.parse(generate(directory, 'future'));
    const files = readFiles(directory);

    await page.goto('./');
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('quarter-status')).toHaveText(
      `Next-quarter plan saved: 2 books. Unfinished current books carry forward first, and the plan activates on ${dates.future}.`,
    );
    await expect(page.getByLabel('Next-quarter books').locator('li')).toHaveText([
      'Physical books: Next story (1 to 80 pages) Edit Remove',
      'Audiobooks: Next audio (0 to 600 seconds) Edit Remove',
    ]);

    // The next quarter must start on a calendar quarter boundary.
    await page.getByLabel('Next quarter starts').fill(dates.notBoundary);
    await page.getByRole('button', { name: 'Save quarter start' }).click();
    await expect(page.getByTestId('quarter-status')).toHaveText('A next-quarter plan must start on 1 January, 1 April, 1 July or 1 October.');

    await page.getByLabel('Format', { exact: true }).selectOption('Digital books');
    await page.getByLabel('Book title', { exact: true }).fill('Future read');
    await page.getByLabel('Start page or time in seconds').fill('1');
    await page.getByLabel('End page or time in seconds').fill('30');
    await page.getByRole('button', { name: 'Add planned book' }).click();
    await expect(page.getByTestId('quarter-status')).toHaveText('Planned Future read for the next quarter.');
    await expect(page.getByLabel('Next-quarter books').locator('li')).toHaveCount(3);

    await page.getByRole('button', { name: 'Remove planned book Next audio' }).click();
    await expect(page.getByTestId('quarter-status')).toHaveText('Planned book Next audio removed.');
    await page.getByLabel('Next quarter starts').fill(dates.beyond);
    await page.getByRole('button', { name: 'Save quarter start' }).click();
    await expect(page.getByTestId('quarter-status')).toHaveText(`Next-quarter start date saved: ${dates.beyond}.`);

    await page.reload();
    await expect(page.getByLabel('Next quarter starts')).toHaveValue(dates.beyond);
    await expect(page.getByLabel('Next-quarter books').locator('li')).toHaveText([
      'Physical books: Next story (1 to 80 pages) Edit Remove',
      'Digital books: Future read (1 to 30 pages) Edit Remove',
    ]);
    await expect(page.getByLabel('Plan start')).not.toHaveValue(dates.beyond);

    // The planned books stay readable by the desktop app, with no progress or history.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('reading-plan-bundle-v1')));
    for (const [name, value] of Object.entries(stored)) {
      fs.writeFileSync(path.join(directory, name), Buffer.from(value, 'base64'));
    }
    execFileSync('python', ['-c', `
from reading_plan import load_json_bundle
import sys
sections, start, end, label, name, options, rest, planned = load_json_bundle(sys.argv[1], include_planned=True)
assert planned is not None and planned.start_date.isoformat() == sys.argv[2]
assert [[book.title for book in section.books] for section in planned.sections] == [
    ['Next story'], ['Future read'], []]
assert all(book.current_page is None for section in planned.sections for book in section.books if section.label != 'Physical books')
assert planned.sections[0].books[0].pages == 80
assert len(rest) == 1
`, directory, dates.beyond]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
