const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

test('a reading plan survives reload and an offline reopening', async ({ page, context }) => {
  await page.goto('./');
  await page.getByLabel('Reading plan').fill('Read The Hobbit');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.getByText('Plan saved on this device.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Reading plan')).toHaveValue('Read The Hobbit');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('./');
  await expect(reopened.getByLabel('Reading plan')).toHaveValue('Read The Hobbit');
  await reopened.getByLabel('Reading plan').fill('Read Dune');
  await reopened.getByRole('button', { name: 'Save plan' }).click();
  await reopened.reload();
  await expect(reopened.getByLabel('Reading plan')).toHaveValue('Read Dune');
});

test('rejects an incomplete bundle without changing the saved plan', async ({ page }) => {
  const files = ['plan.json', 'books.json', 'sessions.json'].map((name) => ({
    name, mimeType: 'application/json', buffer: Buffer.from(name === 'plan.json'
      ? '{"schema_version":2,"start_date":"2026-01-01","end_date":"2026-03-31"}'
      : '{"schema_version":2}')
  }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-01-01', modified_by: 'test', files: hashes
  })) });
  await page.goto('./');
  await page.getByLabel('Reading plan').fill('My existing plan');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText(/could not be imported/i);
  await page.reload();
  await expect(page.getByLabel('Reading plan')).toHaveValue('My existing plan');
  files[0].buffer = Buffer.from('corrupted');
  await page.getByLabel('Bundle files').setInputFiles(files);
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText(/could not be imported/i);
  await expect(page.getByLabel('Reading plan')).toHaveValue('My existing plan');
});

test('rejects checksum-valid bundles with invalid plan dates', async ({ page }) => {
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-02-30', end_date: '2026-03-31', end_label: 'Quarter end' },
    'books.json': { schema_version: 2, sections: [] },
    'sessions.json': { schema_version: 2, sessions: {} }
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-01-01', modified_by: 'test', files: hashes
  })) });
  await page.goto('./');
  await page.getByLabel('Reading plan').fill('Existing draft');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText(/invalid date/i);
  await page.reload();
  await expect(page.getByLabel('Reading plan')).toHaveValue('Existing draft');
});

test('desktop bundle survives import, cancellation, offline reload and export', async ({ page, context }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-bundle-'));
  const output = path.join(directory, 'export');
  fs.mkdirSync(output);
  const names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
  try {
    execFileSync('python', ['-c', `
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, BaselineSchedule, RestDayRange, PlannedQuarter, add_reading_session, write_json_bundle
import sys
book = Book(1, 'Café 世界', 1, 100, id='book-stable', baseline_schedule=BaselineSchedule(date(2026, 7, 1), date(2026, 9, 30), 2.5))
add_reading_session(book, date(2026, 7, 2), 10)
book.reading_sessions[0].id = 'session-stable'
audio = Book(1, 'Audio', 0, 3600, id='audio-stable')
add_reading_session(audio, date(2026, 7, 3), 600, 'Audiobooks')
audio.reading_sessions[0].id = 'audio-session'
planned = PlannedQuarter(date(2026, 10, 1), [BookSection('Physical books', [Book(1, 'Next', 1, 50, id='planned-stable')], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [], [])])
write_json_bundle(sys.argv[1], [BookSection('Physical books', [book], []), BookSection('Digital books', [Book(1, 'First', 1, 20, id='first'), Book(2, 'Companion', 1, 20, id='companion')], [(1, 2)]), BookSection('Audiobooks', [audio], [])], date(2026, 7, 1), date(2026, 9, 30), 'Quarter end', SummaryStatsOptions(True, False, True, False, True), [RestDayRange(date(2026, 8, 1), date(2026, 8, 2))], planned_quarter=planned)
`, directory]);
    const files = names.map((name) => ({ name, mimeType: 'application/json', buffer: fs.readFileSync(path.join(directory, name)) }));
    await page.goto('./');
    await page.getByLabel('Reading plan').fill('Separate draft');
    await page.getByRole('button', { name: 'Save plan' }).click();
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText(/imported/);
    const stored = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
    const planData = JSON.parse(files[0].buffer), bookData = JSON.parse(files[1].buffer), sessionData = JSON.parse(files[2].buffer);
    expect(planData.rest_days).toHaveLength(1);
    expect(planData.stats_options.page_share).toBe(false);
    expect(bookData.sections[0].books[0].baseline_schedule.daily_target).toBe(100 / 90);
    expect(bookData.planned_quarter.sections[0].books[0].id).toBe('planned-stable');
    expect(sessionData.sessions['book-stable'][0].id).toBe('session-stable');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText(/cancelled/);
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(stored);
    const corrupt = files.map((file) => ({ ...file }));
    corrupt[1].buffer = Buffer.concat([files[1].buffer, Buffer.from(' ')]);
    await page.getByLabel('Bundle files').setInputFiles(corrupt);
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText(/checksum mismatch/i);
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(stored);
    await page.getByLabel('Bundle files').setInputFiles(files.slice(0, 3));
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText(/exactly the four/i);
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(stored);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByLabel('Reading plan')).toHaveValue('Separate draft');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe('reading-plan-bundle.zip');
    const zip = path.join(directory, 'bundle.zip');
    await saved.saveAs(zip);
    execFileSync('python', ['-c', `
from pathlib import Path
from reading_plan import load_json_bundle
import sys, zipfile
with zipfile.ZipFile(sys.argv[2]) as archive:
    names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json']
    assert sorted(archive.namelist()) == sorted(names)
    archive.extractall(sys.argv[1])
    for name in names:
        assert (Path(sys.argv[1]) / name).read_bytes() == (Path(sys.argv[3]) / name).read_bytes()
sections, start, end, label, name, options, rest, planned = load_json_bundle(sys.argv[1], include_planned=True)
assert sections[0].books[0].id == 'book-stable'
assert sections[0].books[0].reading_sessions[0].id == 'session-stable'
assert sections[0].books[0].baseline_schedule.daily_target == 100 / 90
assert sections[1].simultaneous_groups == [(1, 2)]
assert sections[2].books[0].reading_sessions[0].id == 'audio-session'
assert not options.page_share and len(rest) == 1
assert planned.sections[0].books[0].id == 'planned-stable'
`, output, zip, directory]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

for (const legacy of [false, true]) test(`desktop and browser agree on lexical integers and semantic edge cases (legacy parser: ${legacy})`, async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-parity-'));
  const names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
  try {
    execFileSync('python', ['-c', `
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
import sys
write_json_bundle(sys.argv[1], [BookSection('Physical books', [Book(1, 'Title', 1, 10, id='b')], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [Book(1, 'Audio', 0, 10, id='a')], [])], date(2026, 7, 1), date(2026, 9, 30), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
    const original = Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(directory, name), 'utf8')]));
    const cases = [
      ['baseline', () => {}, true],
      ['nonpadded plan dates', (v) => { const p = JSON.parse(v['plan.json']); p.start_date = '2026-7-1'; p.end_date = '2026-9-30'; v['plan.json'] = JSON.stringify(p); }, true],
      ['nonpadded reversed dates', (v) => { const p = JSON.parse(v['plan.json']); p.start_date = '2026-10-1'; p.end_date = '2026-9-30'; v['plan.json'] = JSON.stringify(p); }, false],
      ['decimal target and marker collision', (v) => { const b = JSON.parse(v['books.json']); b.sections[0].books[0].baseline_schedule = { start_date: '2026-7-1', deadline: '2026-9-30', daily_target: 2.5, __decimal_token__: '1.0' }; v['books.json'] = JSON.stringify(b); }, true],
      ['schema decimal', (v) => { v['plan.json'] = v['plan.json'].replace('"schema_version": 2', '"schema_version": 2.0'); }, false],
      ['revision exponent', (v) => { v['manifest.json'] = v['manifest.json'].replace('"revision": 1', '"revision": 1e0'); }, false],
      ['book progress decimal', (v) => { v['books.json'] = v['books.json'].replace('"pages_read": 0', '"pages_read": 0.0'); }, false],
      ...[false, true].map((decimal) => [decimal ? 'session progress decimal' : 'session progress integer', (v) => {
        const b = JSON.parse(v['books.json']); b.sections[0].books[0].current_page = 1; b.sections[0].books[0].pages_read = 1; v['books.json'] = JSON.stringify(b);
        const s = JSON.parse(v['sessions.json']); s.sessions.b = [{ id: 's', date: '2026-07-02', current_page: 1, pages_read: 1 }];
        v['sessions.json'] = JSON.stringify(s); if (decimal) v['sessions.json'] = v['sessions.json'].replace('"current_page":1', '"current_page":1.0');
      }, !decimal]),
      ...[false, true].map((conflict) => [conflict ? 'trimmed session ID conflict' : 'trimmed identical session IDs', (v) => {
        const b = JSON.parse(v['books.json']); b.sections[0].books[0].current_page = 1; b.sections[0].books[0].pages_read = 1; v['books.json'] = JSON.stringify(b);
        const s = JSON.parse(v['sessions.json']); s.sessions.b = [
          { id: 's', date: '2026-07-02', current_page: 1, pages_read: 1 },
          { id: ' s ', date: conflict ? '2026-07-03' : '2026-07-02', current_page: 1, pages_read: 1 }
        ]; v['sessions.json'] = JSON.stringify(s);
      }, !conflict]),
      ['null duration', (v) => { const b = JSON.parse(v['books.json']); const a = b.sections[2].books[0]; delete a.start_time_seconds; delete a.end_time_seconds; a.duration_seconds = null; v['books.json'] = JSON.stringify(b); }, false],
      ['date newline', (v) => { const b = JSON.parse(v['books.json']); b.sections[0].books[0].deadline_override = '2026-08-01\n'; v['books.json'] = JSON.stringify(b); }, false],
      ['empty array title', (v) => { const b = JSON.parse(v['books.json']); b.sections[0].books[0].title = []; v['books.json'] = JSON.stringify(b); }, true],
      ['blank title', (v) => { const b = JSON.parse(v['books.json']); b.sections[0].books[0].title = ' '; v['books.json'] = JSON.stringify(b); }, false],
      ['reversed baseline', (v) => { const b = JSON.parse(v['books.json']); b.sections[0].books[0].baseline_schedule = { start_date: '2026-09-01', deadline: '2026-08-01', daily_target: 1.0 }; v['books.json'] = JSON.stringify(b); }, true],
    ];
    if (legacy) await page.addInitScript(() => {
      const parse = JSON.parse;
      JSON.parse = (text, reviver) => parse(text, reviver && function (key, value) { return reviver.call(this, key, value); });
    });
    await page.goto('./');
    let stored = null;
    for (const [label, mutate, accepted] of cases) {
      const values = { ...original };
      mutate(values);
      const manifest = JSON.parse(values['manifest.json']);
      for (const name of names.slice(0, 3)) manifest.files[name] = createHash('sha256').update(values[name]).digest('hex');
      // Preserve the raw manifest token under test.
      if (label !== 'revision exponent') values['manifest.json'] = JSON.stringify(manifest);
      for (const name of names) fs.writeFileSync(path.join(directory, name), values[name]);
      const desktop = spawnSync('python', ['-c', 'from reading_plan import load_json_bundle; import sys; load_json_bundle(sys.argv[1])', directory]);
      expect(desktop.status === 0, `${label}: ${desktop.stderr}`).toBe(accepted);
      await page.getByLabel('Bundle files').setInputFiles(names.map((name) => ({ name, mimeType: 'application/json', buffer: Buffer.from(values[name]) })));
      if (accepted) page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Import bundle' }).click();
      await expect(page.getByTestId('bundle-status'), label).toHaveText(accepted ? /imported/ : /could not be imported/);
      const current = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
      if (!accepted) expect(current, label).toBe(stored);
      stored = current;
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
