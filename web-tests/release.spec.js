const { test, expect } = require('@playwright/test');
const { chooseDate } = require('./calendar-helper');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
const tab = (page, name) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
async function editBook(page, title) {
  const format = await page.evaluate((title) => readBundleFiles().books.sections.find((section) => section.books.some((book) => book.title === title)).label.trim(), title);
  await page.getByRole('combobox', { name: 'Format', exact: true }).click();
  await page.getByRole('option', { name: format, exact: true }).click();
  await page.locator('#open-book-picker').click();
  await page.locator('#book-picker-choices').getByRole('radio', { name: new RegExp(title) }).click();
}
async function withPlan(page, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-release-'));
  try {
    execFileSync('python', ['-c', `
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
import sys
write_json_bundle(sys.argv[1], [BookSection(label, [], []) for label in ['Physical books', 'Digital books', 'Audiobooks']], date(2026, 10, 1), date(2026, 12, 31), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(names.map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function checkExport(page, directory, assertions) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
  const zip = path.join(directory, 'backup.zip');
  await (await download).saveAs(zip);
  execFileSync('python', ['-c', `
import sys, zipfile
from pathlib import Path
from reading_plan import load_json_bundle, SummaryStatsOptions
destination = Path(sys.argv[1]) / 'exported'
destination.mkdir(exist_ok=True)
with zipfile.ZipFile(sys.argv[2]) as archive:
    assert sorted(archive.namelist()) == sorted(['plan.json', 'books.json', 'sessions.json', 'manifest.json'])
    archive.extractall(destination)
sections, start, end, label, name, options, rest, planned = load_json_bundle(destination, include_planned=True)
${assertions}
`, directory, zip]);
}

test('saved web plan dates and rest days transfer to desktop', async ({ page }) => {
  await withPlan(page, async (directory) => {
    await tab(page, 'Plan');
    await page.getByLabel('Plan finish', { exact: true }).fill('2026-12-20');
    await page.getByRole('button', { name: 'Save plan dates' }).click();
    await chooseDate(page, page.getByLabel('Rest day from'), '2026-11-10');
    await chooseDate(page, page.getByLabel('Rest day to'), '2026-11-11');
    await page.getByRole('button', { name: 'Add rest days' }).click();
    await page.reload();
    await tab(page, 'Plan');
    await expect(page.getByLabel('Plan finish', { exact: true })).toHaveValue('2026-12-20');
    await checkExport(page, directory, `assert end.isoformat() == '2026-12-20'
assert len(rest) == 1 and rest[0].start_date.isoformat() == '2026-11-10'`);
  });
});

test('books in all formats can be created and edited offline, then opened on desktop', async ({ page, context }) => {
  await withPlan(page, async (directory) => {
    await tab(page, 'Books');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    for (const [format, title, from, to] of [
      ['Physical books', 'Paper', '1', '100'], ['Digital books', 'Digital', '10', '60'], ['Audiobooks', 'Audio', '0:00', '1:00'],
    ]) {
      await page.getByRole('combobox', { name: 'Format', exact: true }).click();
      await page.getByRole('option', { name: format, exact: true }).click();
      await page.locator('#book-title').fill(title);
      await page.locator('#book-from').fill(from);
      await page.locator('#book-to').fill(to);
      await page.locator('#add-book').click();
      await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    }
    await editBook(page, 'Paper');
    await page.locator('#book-title').fill('Paper revised');
    await page.locator('#replace-book').click();
    await page.reload();
    await tab(page, 'Books');
    await editBook(page, 'Paper revised');
    await expect(page.locator('#book-title')).toHaveValue('Paper revised');
    await tab(page, 'Session');
    await page.getByRole('button', { name: 'Choose Audiobooks' }).click();
    await page.locator('#session-date').fill('2026-11-01');
    await page.getByLabel('Time left', { exact: true }).fill('3000');
    await page.getByRole('button', { name: 'Add session', exact: true }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
    await checkExport(page, directory, `assert [s.books[0].title for s in sections] == ['Paper revised', 'Digital', 'Audio']
assert sections[1].books[0].start_page == 10
assert sections[2].books[0].end_page == 3600
assert sections[2].books[0].current_page == 600
assert sections[2].books[0].reading_sessions[0].pages_read == 600`);
  });
});

test('positive imported chain mismatches self-heal and export canonical history', async ({ page }) => {
  await withPlan(page, async (directory) => {
    execFileSync('python', ['-c', `
from datetime import date
from pathlib import Path
import sys, json, hashlib
from reading_plan import Book, BookSection, SummaryStatsOptions, add_reading_session, write_json_bundle, read_json_bundle_metadata
p = Path(sys.argv[1])
b = Book(1, 'Repair', 1, 100, id='repair')
add_reading_session(b, date(2026,11,1), 10)
add_reading_session(b, date(2026,11,2), 30)
write_json_bundle(p, [BookSection('Physical books', [b], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [], [])], date(2026,10,1), date(2026,12,31), 'Quarter end', SummaryStatsOptions(True,True,True,True,True), metadata=read_json_bundle_metadata(p))
s = json.loads((p/'sessions.json').read_text())
s['sessions']['repair'].reverse()
for event in s['sessions']['repair']: event['pages_read'] = 1
(p/'sessions.json').write_text(json.dumps(s))
m = json.loads((p/'manifest.json').read_text())
m['files']['sessions.json'] = hashlib.sha256((p/'sessions.json').read_bytes()).hexdigest()
(p/'manifest.json').write_text(json.dumps(m))
`, directory]);
    await page.getByLabel('Bundle files').setInputFiles(names.map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toContainText('repaired');
    await page.reload();
    await tab(page, 'Session');
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Reading history', exact: true })).toContainText('contribution 20');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await checkExport(page, directory, `assert [s.pages_read for s in sections[0].books[0].reading_sessions] == [10, 20]`);
  });
});

test('import canonicalizes reversed history even when its contributions already match', async ({ page }) => {
  await withPlan(page, async (directory) => {
    const files = names.map((name) => path.join(directory, name));
    execFileSync('python', ['-c', `
from datetime import date
from pathlib import Path
import sys, json, hashlib
from reading_plan import Book, BookSection, SummaryStatsOptions, add_reading_session, write_json_bundle, read_json_bundle_metadata
p = Path(sys.argv[1]); b = Book(1, 'Ordered', 1, 100, id='ordered')
add_reading_session(b, date(2026,11,1), 10); add_reading_session(b, date(2026,11,2), 30)
write_json_bundle(p, [BookSection('Physical books', [b], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [], [])], date(2026,10,1), date(2026,12,31), 'Quarter end', SummaryStatsOptions(True,True,True,True,True), metadata=read_json_bundle_metadata(p))
s = json.loads((p/'sessions.json').read_text()); s['sessions']['ordered'].reverse()
(p/'sessions.json').write_text(json.dumps(s)); m = json.loads((p/'manifest.json').read_text())
m['files']['sessions.json'] = hashlib.sha256((p/'sessions.json').read_bytes()).hexdigest()
(p/'manifest.json').write_text(json.dumps(m))
`, directory]);
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toContainText('repaired');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    const zip = path.join(directory, 'ordered.zip'); await (await download).saveAs(zip);
    execFileSync('python', ['-c', `
import sys, zipfile, json
with zipfile.ZipFile(sys.argv[1]) as archive: events = json.loads(archive.read('sessions.json'))['sessions']['ordered']
assert [s['current_page'] for s in events] == [10,30]
assert [s['pages_read'] for s in events] == [10,20]
`, zip]);
  });
});

test('renaming imported books retains progress represented without a current-position field', async ({ page }) => {
  await withPlan(page, async (directory) => {
    execFileSync('python', ['-c', `
from datetime import date
from pathlib import Path
import sys, json, hashlib
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle, read_json_bundle_metadata
p=Path(sys.argv[1])
write_json_bundle(p,[BookSection('Physical books',[Book(1,'Implicit paper',1,100,current_page=40,id='paper')],[]),BookSection('Digital books',[],[]),BookSection('Audiobooks',[Book(1,'Implicit audio',0,3600,current_page=600,id='audio')],[])],date(2026,10,1),date(2026,12,31),'Quarter end',SummaryStatsOptions(True,True,True,True,True),metadata=read_json_bundle_metadata(p))
b=json.loads((p/'books.json').read_text()); del b['sections'][0]['books'][0]['current_page']; del b['sections'][2]['books'][0]['current_time_seconds']
(p/'books.json').write_text(json.dumps(b)); m=json.loads((p/'manifest.json').read_text()); m['files']['books.json']=hashlib.sha256((p/'books.json').read_bytes()).hexdigest(); (p/'manifest.json').write_text(json.dumps(m))
`, directory]);
    await page.getByLabel('Bundle files').setInputFiles(names.map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await tab(page, 'Books');
    for (const title of ['Implicit paper', 'Implicit audio']) {
      await editBook(page, title);
      await page.locator('#book-title').fill(`${title} revised`);
      await page.locator('#replace-book').click();
      await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    }
    await page.reload();
    await checkExport(page, directory, `assert sections[0].books[0].current_page == 40
assert sections[2].books[0].current_page == 600`);
  });
});

test('backdated history can be recorded, corrected and deleted without changing the baseline', async ({ page, context }) => {
  await withPlan(page, async (directory) => {
    await tab(page, 'Books');
    await page.locator('#book-title').fill('History');
    await page.locator('#book-from').fill('1');
    await page.locator('#book-to').fill('100');
    await page.locator('#add-book').click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    await tab(page, 'Plan');
    await page.getByRole('button', { name: 'Calculate schedule' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule calculated on this device.');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await tab(page, 'Session');
    for (const [date, position] of [['2026-11-02', '30'], ['2026-11-01', '10']]) {
      await page.locator('#session-date').fill(date);
      await page.getByLabel('Current page', { exact: true }).fill(position);
      await page.getByRole('button', { name: 'Add session', exact: true }).click();
      await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
    }
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await page.getByRole('button', { name: 'Edit session History 2026-11-01', exact: true }).click();
    await page.locator('#session-entry-position').fill('15');
    await page.locator('#session-entry-save').click();
    await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
    await page.reload();
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Reading history', exact: true })).toContainText('contribution 15');
    // Moving a later reading session behind the earlier one must not save partial progress.
    await page.getByRole('button', { name: 'Edit session History 2026-11-02', exact: true }).click();
    await page.locator('#session-entry-position').fill('5');
    await page.locator('#session-entry-save').click();
    await expect(page.getByTestId('editor-status')).toContainText('advance');
    await page.locator('#session-entry-cancel').click();
    await page.locator('#close-entries').click();
    await checkExport(page, directory, `book = sections[0].books[0]
assert book.current_page == 30
assert [s.pages_read for s in book.reading_sessions] == [15, 15]
assert book.baseline_schedule.daily_target == 100 / 92`);
    await tab(page, 'Session');
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await page.getByRole('button', { name: 'Delete session History 2026-11-01', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete entry?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Reading session deleted.');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await checkExport(page, directory, `book = sections[0].books[0]
assert book.current_page == 30
assert [s.pages_read for s in book.reading_sessions if not s.deleted] == [30]
assert sum(s.deleted for s in book.reading_sessions) == 1`);
  });
});

test('a synthetic reading plan transfers desktop to web and back without losing history', async ({ page }) => {
  await withPlan(page, async (directory) => {
    const source = path.join(directory, 'source');
    execFileSync('python', ['-c', `
from datetime import date
import sys
from reading_plan import Book, BookSection, SummaryStatsOptions, add_reading_session, write_json_bundle
sections = [
    BookSection('Physical books', [Book(1, 'Paper history', 1, 100, id='paper'), Book(2, 'Paper companion', 1, 80, id='paper-companion')], [(1, 2)]),
    BookSection('Digital books', [Book(1, 'Digital history', 1, 120, id='digital'), Book(2, 'Digital companion', 1, 60, id='digital-companion')], []),
    BookSection('Audiobooks', [Book(1, 'Audio history', 0, 3600, id='audio'), Book(2, 'Audio companion', 0, 7200, id='audio-companion')], []),
]
add_reading_session(sections[0].books[0], date(2026, 11, 1), 10)
add_reading_session(sections[0].books[0], date(2026, 11, 2), 30)
add_reading_session(sections[1].books[0], date(2026, 11, 1), 20, 'Digital books')
add_reading_session(sections[2].books[0], date(2026, 11, 1), 3000, 'Audiobooks')
write_json_bundle(sys.argv[1], sections, date(2026, 10, 1), date(2026, 12, 31), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, source]);
    const original = Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(source, name))]));
    const first = JSON.parse(original['books.json']).sections[0].books[0];
    await page.getByLabel('Bundle files').setInputFiles(names.map((name) => ({ name, mimeType: 'application/json', buffer: original[name] })));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await tab(page, 'Books');
    await editBook(page, first.title);
    await page.locator('#book-title').fill(`${first.title} — web transfer check`);
    await page.locator('#replace-book').click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    await checkExport(page, directory, `from shutil import copy2
from reading_plan import write_json_bundle, read_json_bundle_metadata
source = Path(sys.argv[1]) / 'source'
baseline = Path(sys.argv[1]) / 'baseline'
baseline.mkdir()
for filename in ['plan.json', 'books.json', 'sessions.json', 'manifest.json']: copy2(source / filename, baseline / filename)
expected, *details = load_json_bundle(baseline, include_planned=True)
assert sum(len(section.books) for section in expected) == 6
assert sum(len(book.reading_sessions) for section in expected for book in section.books) == 4
expected[0].books[0].title += ' — web transfer check'
# Editing a book marks its section's baseline for recalculation.
expected[0].baseline_needs_recalculation = True
assert sections == expected
assert [start, end, label, name, options, rest, planned] == details
write_json_bundle(destination, sections, start, end, label, options, rest, planned_quarter=planned, metadata=read_json_bundle_metadata(destination))`);
    // Complete the second desktop → web leg using the desktop-written generation.
    await page.getByLabel('Bundle files').setInputFiles(names.map((name) => path.join(directory, 'exported', name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await tab(page, 'Books');
    await editBook(page, `${first.title} — web transfer check`);
    await expect(page.locator('#book-title')).toHaveValue(`${first.title} — web transfer check`);
    for (const name of names) expect(fs.readFileSync(path.join(source, name))).toEqual(original[name]);
  });
});

test('clock input, start-date overrides, preserved summary settings and planned-book edits transfer', async ({ page }) => {
  await withPlan(page, async (directory) => {
    await tab(page, 'Books');
    await page.getByRole('combobox', { name: 'Format', exact: true }).click();
    await page.getByRole('option', { name: 'Audiobooks', exact: true }).click();
    await page.locator('#book-title').fill('Clock audio');
    await page.locator('#book-from').fill('0:00');
    await page.locator('#book-to').fill('2:00:30');
    await page.locator('#add-book').click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    await tab(page, 'Plan');
    await page.getByRole('button', { name: 'Calculate schedule' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule calculated on this device.');
    await chooseDate(page, page.getByLabel('Start date override for Clock audio', { exact: true }), '2026-11-10');
    await page.getByRole('button', { name: 'Save the start date for Clock audio', exact: true }).click();
    await expect(page.getByTestId('schedule-status')).toContainText('Start date override saved');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save summary settings' })).toHaveCount(0);
    await tab(page, 'Plan');
    const expectedStart = await page.evaluate(() => ReadingQuarter.nextQuarterStart(ReadingSchedule.today()));
    await page.getByRole('button', { name: 'Edit next-quarter plan' }).click();
    await expect(page.locator('#quarter-dialog-heading')).toHaveText(`Next quarter — ${expectedStart}`);
    await page.locator('#quarter-dialog').getByRole('combobox', { name: 'Format', exact: true }).click();
    await page.getByRole('option', { name: 'Audiobooks', exact: true }).click();
    await page.locator('#quarter-title').fill('Next clock');
    await page.locator('#quarter-from').fill('0:00');
    await page.locator('#quarter-to').fill('1:00');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Audiobooks — Next clock', exact: true }).click();
    await page.locator('#quarter-title').fill('Next revised');
    await page.getByRole('button', { name: 'Update selected', exact: true }).click();
    await page.locator('#save-quarter').click();
    await expect(page.getByTestId('quarter-status')).toHaveText('Next-quarter plan saved.');
    await page.reload();
    await checkExport(page, directory, `book = sections[2].books[0]
assert book.end_page == 7230
assert book.start_date_override.isoformat() == '2026-11-10'
assert book.baseline_schedule.start_date.isoformat() == '2026-11-10'
assert options == SummaryStatsOptions(True, True, True, True, True)
assert planned.start_date.isoformat() == '${expectedStart}'
assert planned.sections[2].books[0].title == 'Next revised'
assert planned.sections[2].books[0].end_page == 3600`);
  });
});

test('desktop CSV imports and web CSV exports preserve ranges, groups, rest days and progress', async ({ page }) => {
  await withPlan(page, async (directory) => {
    const csv = path.join(directory, 'desktop.csv');
    execFileSync('python', ['-c', `
import sys
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, RestDayRange, build_section_plans, write_csv
s = [BookSection('Physical books', [Book(1, 'Quoted, "title"', 5, 104, current_page=20), Book(2, 'Companion', 1, 50)], [(1,2)]), BookSection('Digital books', [Book(1, 'Digital', 1, 20)], []), BookSection('Audiobooks', [Book(1, 'Audio', 0, 7230, current_page=600)], [])]
r = [RestDayRange(date(2026,11,10), date(2026,11,11))]
plans, total, pace, status = build_section_plans(s, date(2026,10,1), date(2026,12,31), r)
write_csv(sys.argv[1], plans, date(2026,10,1), date(2026,12,31), total, pace, status, 'Quarter end', SummaryStatsOptions(True,True,True,True,True), r)
`, csv]);
    await page.getByLabel('CSV plan file').setInputFiles(csv);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import CSV plan', exact: true }).click();
    await expect(page.getByTestId('csv-status')).toHaveText('CSV plan imported. Reading history is not included in CSV.');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV plan', exact: true }).click();
    const exported = path.join(directory, 'web.csv');
    await (await download).saveAs(exported);
    execFileSync('python', ['-c', `
import sys
from reading_plan import load_csv_plan
expected = load_csv_plan(sys.argv[1]); actual = load_csv_plan(sys.argv[2])
assert actual[1:] == expected[1:]
for a, e in zip(actual[0], expected[0]):
    assert a.label == e.label and a.simultaneous_groups == e.simultaneous_groups
    assert [(b.title,b.start_page,b.end_page,b.current_page) for b in a.books] == [(b.title,b.start_page,b.end_page,b.current_page) for b in e.books]
`, csv, exported]);
  });
});

test('charts default to unfinished reading, All includes finished books, and metrics have focused views', async ({ page }) => {
  await withPlan(page, async () => {
    await tab(page, 'Books');
    for (const title of ['Finished', 'Ongoing']) {
      await page.locator('#book-title').fill(title);
      await page.locator('#book-from').fill('1');
      await page.locator('#book-to').fill('100');
      await page.locator('#add-book').click();
      await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    }
    await tab(page, 'Plan');
    await page.getByRole('button', { name: 'Calculate schedule' }).click();
    await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule calculated on this device.');
    await tab(page, 'Session');
    for (const [title, position] of [['Finished', '100'], ['Ongoing', '30']]) {
      await page.getByRole('button', { name: `Choose book ${title}`, exact: true }).click();
      await page.locator('#session-date').fill('2026-11-01');
      await page.getByLabel('Current page', { exact: true }).fill(position);
      await page.getByRole('button', { name: 'Add session', exact: true }).click();
      await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
    }
    await tab(page, 'Charts');
    const selector = page.getByRole('combobox', { name: 'Book', exact: true });
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await selector.click();
    await expect(page.getByRole('option')).toHaveText(['Physical books - 2. Ongoing']);
    await selector.press('Escape');
    await expect(page.locator('#charts figure')).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'Reading chart for Ongoing', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Reading chart for Finished', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await selector.click();
    await expect(page.getByRole('option')).toHaveText(['Physical books - 1. Finished', 'Physical books - 2. Ongoing']);
    await expect(page.getByRole('option', { name: 'Physical books - 2. Ongoing', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('option', { name: 'Physical books - 1. Finished', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Reading chart for Finished', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Reading chart for Ongoing', exact: true })).toHaveCount(0);
    await expect(page.locator('#charts figure')).toHaveCount(1);
    await page.getByRole('button', { name: 'Metrics', exact: true }).click();
    await page.getByRole('button', { name: 'Key metrics', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Key metrics', exact: true })).toContainText('Remaining pages70');
    await page.getByRole('button', { name: 'Back to metrics', exact: true }).click();
    await page.getByRole('button', { name: 'Summary metrics', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Summary metrics', exact: true })).toContainText('Physical book count2');
  });
});

test('book positions and deletion persist, while invalid range edits leave the saved book intact', async ({ page }) => {
  await withPlan(page, async (directory) => {
    await tab(page, 'Books');
    for (const title of ['First', 'Second']) {
      await page.locator('#book-title').fill(title);
      await page.locator('#book-from').fill('1');
      await page.locator('#book-to').fill('50');
      await page.locator('#add-book').click();
      await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    }
    await editBook(page, 'Second');
    await page.getByRole('button', { name: 'Move Up', exact: true }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book moved.');
    await checkExport(page, directory, `assert [b.title for b in sections[0].books] == ['Second', 'First']`);
    await tab(page, 'Books');
    await editBook(page, 'Second');
    await page.locator('#book-to').fill('0');
    await page.locator('#replace-book').click();
    await expect(page.getByTestId('editor-status')).toContainText('valid whole-number range');
    await page.reload();
    await tab(page, 'Books');
    await editBook(page, 'First');
    await page.getByRole('button', { name: 'Delete Selected', exact: true }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book deleted.');
    await checkExport(page, directory, `assert len(sections[0].books) == 1
assert sections[0].books[0].title == 'Second' and sections[0].books[0].end_page == 50`);
  });
});
