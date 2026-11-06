const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const key = 'reading-plan-bundle-v1';
const labels = ['Physical books', 'Digital books', 'Audiobooks'];
const book = (id, number) => ({ id, number, title: id, start_page: 1, end_page: 20, current_page: null, pages: 20, pages_read: 0,
  baseline_schedule: null, deadline_override: null, start_date_override: null, target_completed_date: null });
const fixture = (group = ['First', 'Second', 'Third'], configure = () => {}) => {
  const sections = labels.map((label) => ({ label, books: [], simultaneous_groups: [], baseline_needs_recalculation: false }));
  const planned = structuredClone(sections);
  planned[0].books = [book('First', 1), book('Second', 2), book('Third', 3)];
  planned[0].simultaneous_groups = [group];
  configure(planned);
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-01-01', end_date: '2026-03-31', end_label: 'Quarter end', rest_days: [],
      stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true } },
    'books.json': { schema_version: 2, sections, planned_quarter: { start_date: '2030-04-01', sections: planned } },
    'sessions.json': { schema_version: 2, sessions: {} },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value, null, 2) + '\n') }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema_version: 2, revision: 7,
    last_modified: '2026-01-01', modified_by: 'fixture', files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])) })) });
  return files;
};
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), key);
const read = (page) => page.evaluate(() => readBundleFiles());
const open = (page) => page.getByRole('button', { name: 'Edit next-quarter plan' }).click();
const fields = async (page, title = 'Added', format = 'Digital books', from = '1', to = '30') => {
  await page.locator('#quarter-dialog').getByRole('combobox', { name: 'Format', exact: true }).click();
  await page.getByRole('option', { name: format, exact: true }).click();
  await page.locator('#quarter-title').fill(title);
  await page.locator('#quarter-from').fill(from);
  await page.locator('#quarter-to').fill(to);
};
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(fixture());
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
});

test('Add, Update and Remove change only a copy; Cancel and Escape preserve raw storage', async ({ page }) => {
  const original = await raw(page);
  for (const cancel of ['button', 'escape']) {
    await open(page);
    await expect(page.locator('#quarter-dialog-heading')).toHaveText('Next quarter — 2030-04-01');
    await expect(page.locator('#quarter-dialog input[type="date"]')).toHaveCount(0);
    await fields(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Physical books — First', exact: true }).click();
    await fields(page, 'Changed');
    await page.getByRole('button', { name: 'Update selected', exact: true }).click();
    await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
    expect(await raw(page)).toBe(original);
    if (cancel === 'button') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(page.locator('#quarter-dialog')).not.toBeVisible();
    expect(await raw(page)).toBe(original);
  }
});

test('one validated Save preserves other file bytes, stable IDs, positions and groups; ZIP loads on desktop', async ({ page }) => {
  const original = await read(page);
  await page.evaluate(() => {
    window.quarterWrites = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'reading-plan-bundle-v1') window.quarterWrites++; return set.call(this, key, value); };
  });
  await open(page);
  await page.getByRole('button', { name: 'Physical books — Second', exact: true }).click();
  await fields(page, 'Renamed', 'Physical books', '2', '22');
  await page.getByRole('button', { name: 'Update selected', exact: true }).click();
  await expect(page.locator('#quarter-list button')).toHaveText(['Physical books — First', 'Physical books — Renamed', 'Physical books — Third']);
  await page.getByRole('button', { name: 'Physical books — First', exact: true }).click();
  await fields(page, 'Moved audio', 'Audiobooks', '00:00', '01:30:00');
  await page.getByRole('button', { name: 'Update selected', exact: true }).click();
  await page.getByRole('button', { name: 'Physical books — Third', exact: true }).click();
  await fields(page, 'Also audio', 'Audiobooks', '60', '120');
  await page.getByRole('button', { name: 'Update selected', exact: true }).click();
  await fields(page, 'Added');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  expect(await page.evaluate(() => window.quarterWrites)).toBe(0);
  await page.locator('#save-quarter').click();
  await expect(page.locator('#quarter-dialog')).not.toBeVisible();
  expect(await page.evaluate(() => window.quarterWrites)).toBe(1);
  const saved = await read(page);
  expect(saved.manifest.revision).toBe(original.manifest.revision + 1);
  for (const name of ['plan.json', 'sessions.json']) expect(saved.encoded[name]).toBe(original.encoded[name]);
  expect(saved.books.sections).toEqual(original.books.sections);
  const planned = saved.books.planned_quarter;
  expect(planned.start_date).toBe('2030-04-01');
  expect(planned.sections[0].books.map((book) => [book.id, book.title, book.number])).toEqual([['Second', 'Renamed', 1]]);
  expect(planned.sections[0].simultaneous_groups).toEqual([]);
  expect(planned.sections[2].books.map((book) => [book.id, book.number])).toEqual([['First', 1], ['Third', 2]]);
  expect(planned.sections[2].books[0]).toMatchObject({ start_time_seconds: 0, end_time_seconds: 5400, current_time_seconds: null, time_listened_seconds: 0 });
  expect(planned.sections[2].books[0]).not.toHaveProperty('start_page');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planned-editor-'));
  try {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    const zip = path.join(directory, 'bundle.zip');
    await (await download).saveAs(zip);
    execFileSync('python', ['-c', `
import sys, zipfile
from reading_plan import load_json_bundle
with zipfile.ZipFile(sys.argv[2]) as archive: archive.extractall(sys.argv[1])
*_, planned = load_json_bundle(sys.argv[1], include_planned=True)
assert planned.start_date.isoformat() == '2030-04-01'
assert [book.id for book in planned.sections[2].books] == ['First', 'Third']
assert planned.sections[2].books[0].end_page == 5400
`, directory, zip]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('removing a grouped book retains consecutive survivors and renumbers them', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Physical books — Second', exact: true }).click();
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
  await page.locator('#save-quarter').click();
  await expect(page.locator('#quarter-dialog')).not.toBeVisible();
  const section = (await read(page)).books.planned_quarter.sections[0];
  expect(section.books.map((book) => [book.id, book.number])).toEqual([['First', 1], ['Third', 2]]);
  expect(section.simultaneous_groups).toEqual([['First', 'Third']]);
});

for (const group of [[3, 2, 1], ['Third', 'Second', 'First']]) {
  test(`reversed ${typeof group[0]} groups retain survivors and unrelated stable IDs after cross-format Save`, async ({ page }) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(fixture(group, (sections) => {
      sections[0].books.push(book('Fourth', 4), book('Fifth', 5));
      sections[0].simultaneous_groups.push(['Fifth', 'Fourth']);
      sections[1].books = [book('Digital-first', 1), book('Digital-second', 2)];
      sections[1].simultaneous_groups = [['Digital-second', 'Digital-first']];
    }));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    const original = await raw(page);
    await open(page);
    await page.getByRole('button', { name: 'Physical books — Second', exact: true }).click();
    await fields(page, 'Moved audio', 'Audiobooks', '00:00', '01:30:00');
    await page.getByRole('button', { name: 'Update selected', exact: true }).click();
    expect(await raw(page)).toBe(original);
    await page.locator('#save-quarter').click();
    await expect(page.locator('#quarter-dialog')).not.toBeVisible();
    const sections = (await read(page)).books.planned_quarter.sections;
    expect(sections[0].books.map((book) => [book.id, book.number])).toEqual([['First', 1], ['Third', 2], ['Fourth', 3], ['Fifth', 4]]);
    expect(sections[0].simultaneous_groups).toEqual([['First', 'Third'], ['Fourth', 'Fifth']]);
    expect(sections[1].books.map((book) => [book.id, book.number])).toEqual([['Digital-first', 1], ['Digital-second', 2]]);
    expect(sections[1].simultaneous_groups).toEqual([['Digital-first', 'Digital-second']]);
    expect(sections[2].books).toHaveLength(1);
    expect(sections[2].books[0]).toMatchObject({ id: 'Second', number: 1, title: 'Moved audio', start_time_seconds: 0, end_time_seconds: 5400 });
    expect(sections[2].books[0]).not.toHaveProperty('start_page');
    expect(sections[2].simultaneous_groups).toEqual([]);
  });

  test(`overlapping reversed ${typeof group[0]} planned groups are rejected without replacing storage`, async ({ page }) => {
    const original = await raw(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(fixture(group, (sections) => {
      sections[0].simultaneous_groups.push(typeof group[0] === 'number' ? [3, 2] : ['Third', 'Second']);
    }));
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle could not be imported: books.json planned_quarter: invalid simultaneous group');
    expect(await raw(page)).toBe(original);
  });

  for (const action of ['save', 'rename', 'remove']) {
    test(`reversed ${typeof group[0]} groups survive planned ${action}`, async ({ page }) => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Bundle files').setInputFiles(fixture(group));
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Import bundle' }).click();
      await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
      await page.getByRole('button', { name: 'Plan', exact: true }).click();
      await open(page);
      if (action !== 'save') {
        await page.getByRole('button', { name: 'Physical books — Second', exact: true }).click();
        if (action === 'rename') {
          await page.locator('#quarter-title').fill('Renamed');
          await page.getByRole('button', { name: 'Update selected', exact: true }).click();
        } else await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
      }
      await page.locator('#save-quarter').click();
      await expect(page.locator('#quarter-dialog')).not.toBeVisible();
      const section = (await read(page)).books.planned_quarter.sections[0];
      expect(section.simultaneous_groups).toEqual([action === 'remove' ? ['First', 'Third'] : ['First', 'Second', 'Third']]);
    });
  }
}

test('a changed opening token refuses Save without overwriting another writer', async ({ page }) => {
  await open(page);
  await fields(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.evaluate(async () => { const current = readBundleFiles(); await writeBundleFiles({ 'plan.json': { ...current.plan, end_label: 'Target finish date' } }); });
  const changed = await raw(page);
  await page.locator('#save-quarter').click();
  await expect(page.locator('#quarter-draft-status')).toHaveText('The plan changed while you were editing. Reopen the editor before saving.');
  expect(await raw(page)).toBe(changed);
});

test('Save awaits due rollover then rejects the obsolete draft', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.ReadingSchedule.today = () => '2030-04-01'; });
  await page.locator('#save-quarter').click();
  await expect(page.locator('#quarter-draft-status')).toHaveText('The plan changed while you were editing. Reopen the editor before saving.');
  const saved = await read(page);
  expect(saved.books.planned_quarter).toBeNull();
  expect(saved.plan.start_date).toBe('2030-04-01');
  expect(saved.books.sections[0].books.map((book) => book.id)).toEqual(['First', 'Second', 'Third']);
});

test('invalid fields and a conflict during hashing fail closed', async ({ page }) => {
  const original = await raw(page);
  await open(page);
  await fields(page, 'Invalid', 'Physical books', '20', '1');
  await page.getByRole('button', { name: 'Update selected', exact: true }).click();
  await expect(page.locator('#quarter-draft-status')).toHaveText('Set whole page numbers, with the end page on or after the start page.');
  expect(await raw(page)).toBe(original);
  await fields(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      const result = await digest(...args);
      localStorage.setItem('reading-plan-bundle-v1', localStorage.getItem('reading-plan-bundle-v1') + ' ');
      return result;
    };
  });
  await page.locator('#save-quarter').click();
  await expect(page.locator('#quarter-draft-status')).toHaveText('The plan changed during this save. Try again.');
  expect((await read(page)).manifest.revision).toBe(7);
  expect((await read(page)).books.planned_quarter.sections[1].books).toEqual([]);
});

test('dialog fits phone and desktop viewports', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    const box = await page.locator('#quarter-dialog').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.locator('#quarter-dialog').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});
