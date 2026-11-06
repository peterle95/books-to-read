const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

let directory;
test.beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-picker-legacy-'));
  execFileSync('python', ['-c', `
import sys
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
sections = [BookSection('Physical books', [Book(i+1, title, 1, 100, id=title.lower()) for i,title in enumerate('ABCD')], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [], [])]
write_json_bundle(sys.argv[1], sections, date(2030,1,1), date(2030,3,31), 'Quarter end', SummaryStatsOptions(False,False,False,False,False))
`, directory]);
});
test.afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  await page.getByRole('button', { name: 'Books', exact: true }).click();
  await page.evaluate(() => {
    const bundle = readBundleData();
    const state = window.ReadingSchedule.stateFromBundle(bundle.plan, bundle.books);
    state.endDate = '2030-04-05';
    state.restDays = [{ start: '2030-02-01', end: '2030-02-02' }];
    state.groups['Physical books'] = [[3, 4]];
    state.overrides.a = '2030-03-01';
    state.startOverrides.a = '2030-01-02';
    state.baselines.a = { startDate: '2030-01-01', deadline: '2030-03-31', dailyTarget: 2 };
    localStorage.setItem(scheduleKey, JSON.stringify(state));
    scheduleState = null;
  });
});

const raw = (page) => page.evaluate(() => ({ bundle: localStorage.getItem(bundleKey), legacy: localStorage.getItem(scheduleKey) }));
const open = (page) => page.getByRole('button', { name: 'Select simultaneous books', exact: true }).click();
const save = (page) => page.locator('#book-group-dialog').getByRole('button', { name: 'Apply', exact: true }).click();
const choose = async (page, titles) => {
  const dialog = page.locator('#book-group-dialog');
  for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.uncheck();
  for (const title of titles) await dialog.getByRole('checkbox', { name: `${title.charCodeAt(0) - 64}. ${title}`, exact: true }).check();
};

test('unchanged legacy token allows a pair and migrates all settings in one revision', async ({ page }) => {
  const before = await page.evaluate(() => readBundleFiles());
  const beforeRaw = await raw(page);
  await open(page);
  expect(await raw(page)).toEqual(beforeRaw);
  await choose(page, ['A', 'B']);
  await save(page);
  await expect(page.locator('#book-group-dialog')).not.toBeVisible();
  const after = await page.evaluate(() => readBundleFiles());
  expect((await raw(page)).legacy).toBeNull();
  expect(after.manifest.revision).toBe(before.manifest.revision + 1);
  expect(after.plan.end_date).toBe('2030-04-05');
  expect(after.plan.rest_days).toEqual([{ start_date: '2030-02-01', end_date: '2030-02-02' }]);
  expect(after.books.sections[0].simultaneous_groups).toEqual([['c', 'd'], ['a', 'b']]);
  expect(after.books.sections[0].books[0]).toMatchObject({ deadline_override: '2030-03-01', start_date_override: '2030-01-02', baseline_schedule: { start_date: '2030-01-01', deadline: '2030-03-31', daily_target: 2 } });
  expect(after.sessions).toEqual(before.sessions);
  expect(after.encoded['sessions.json']).toBe(before.encoded['sessions.json']);
  expect(after.manifest.files['sessions.json']).toBe(before.manifest.files['sessions.json']);
  for (const name of ['plan.json', 'books.json', 'sessions.json']) {
    expect(after.manifest.files[name]).toBe(createHash('sha256').update(Buffer.from(after.encoded[name], 'base64')).digest('hex'));
  }
});

test('legacy group is preselected and may be saved without changing selection', async ({ page }) => {
  await page.locator('#open-book-picker').click();
  await page.getByRole('radio', { name: '3. C', exact: true }).click();
  await open(page);
  await expect(page.locator('#book-group-dialog input:checked')).toHaveCount(2);
  await expect(page.locator('#book-group-dialog').getByRole('checkbox', { name: '3. C', exact: true })).toBeChecked();
  await save(page);
  await expect(page.locator('#book-group-dialog')).not.toBeVisible();
  expect(await page.evaluate(() => readBundleFiles().books.sections[0].simultaneous_groups)).toEqual([['c', 'd']]);
  expect((await raw(page)).legacy).toBeNull();
});

test('history changes still rewrite sessions and checksums while migrating legacy settings', async ({ page }) => {
  const before = await page.evaluate(() => readBundleFiles());
  expect(await page.evaluate(() => editorAction((current) => saveReadingSession(current, 'a', window.ReadingSchedule.today(), '20')))).toBe(true);
  const after = await page.evaluate(() => readBundleFiles());
  expect(after.encoded['sessions.json']).not.toBe(before.encoded['sessions.json']);
  expect(after.sessions.sessions.a[0].current_page).toBe(20);
  expect(after.manifest.revision).toBe(before.manifest.revision + 1);
  expect(after.manifest.files['sessions.json']).not.toBe(before.manifest.files['sessions.json']);
  expect(after.manifest.files['sessions.json']).toBe(createHash('sha256').update(Buffer.from(after.encoded['sessions.json'], 'base64')).digest('hex'));
  expect((await raw(page)).legacy).toBeNull();
});

for (const store of ['legacy', 'bundle']) {
  test(`changed ${store} token rejects without modifying either raw store`, async ({ page }) => {
    await open(page);
    await choose(page, ['A', 'B']);
    await page.evaluate((store) => {
      const key = store === 'legacy' ? scheduleKey : bundleKey;
      localStorage.setItem(key, localStorage.getItem(key) + ' ');
    }, store);
    const before = await raw(page);
    await save(page);
    await expect(page.locator('#book-group-status')).toContainText('plan changed');
    await expect(page.locator('#book-group-dialog')).toBeVisible();
    expect(await raw(page)).toEqual(before);
  });
}

test('invalid groups never write or migrate legacy storage', async ({ page }) => {
  await open(page);
  const before = await raw(page);
  for (const [titles, error] of [[['A'], 'at least two'], [['A', 'C'], 'consecutive']]) {
    await choose(page, titles);
    await save(page);
    await expect(page.locator('#book-group-status')).toContainText(error);
    expect(await raw(page)).toEqual(before);
  }
});
