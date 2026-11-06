const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let directory;
test.beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-editor-atomicity-'));
  execFileSync('python', ['-c', `
import sys
from datetime import date, timedelta
from reading_plan import Book, BookSection, SummaryStatsOptions, add_reading_session, write_json_bundle
today = date.today()
paper = Book(1, 'Paper', 1, 100, id='paper')
add_reading_session(paper, today, 20)
sections = [BookSection('Physical books', [paper, Book(2, 'Other', 1, 100, id='other')], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [], [])]
write_json_bundle(sys.argv[1], sections, today - timedelta(days=5), today + timedelta(days=30), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
});
test.afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  await expect(page.locator('#history-list details').first()).toHaveAttribute('open', '');
  await page.evaluate(() => {
    const bundle = readBundleData();
    const state = window.ReadingSchedule.stateFromBundle(bundle.plan, bundle.books);
    state.endDate = window.ReadingSchedule.iso(window.ReadingSchedule.parseDate(state.endDate) + 5);
    state.restDays = [{ start: state.endDate, end: state.endDate }];
    state.groups['Physical books'] = [[1, 2]];
    state.overrides.paper = state.endDate;
    state.startOverrides.paper = state.startDate;
    state.baselines.paper = { startDate: state.startDate, deadline: state.endDate, dailyTarget: 3 };
    localStorage.setItem(scheduleKey, JSON.stringify(state));
    scheduleState = null;
  });
});

const snapshot = (page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const openEntry = async (page, remove = false) => {
  await page.getByRole('button', { name: new RegExp(`${remove ? 'Delete' : 'Edit'} session Paper`) }).click();
  return page.locator('#session-entry-dialog');
};

test('invalid history edit does not migrate legacy storage', async ({ page }) => {
  const dialog = await openEntry(page);
  const before = await snapshot(page);
  await dialog.locator('#session-entry-position').fill('101');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#session-entry-status')).not.toBeEmpty();
  expect(await snapshot(page)).toEqual(before);
});

test('stale history delete does not migrate legacy storage', async ({ page }) => {
  const dialog = await openEntry(page, true);
  await page.evaluate(async () => {
    const current = readBundleFiles();
    const sessions = current.sessions.sessions.paper;
    sessions.find((session) => session.id === entryTarget.sessionId).deleted = true;
    window.recalculateReadingHistory(current.books.sections[0].books[0], sessions, 'Physical books');
    await writeBundleFiles({ 'books.json': current.books, 'sessions.json': current.sessions });
  });
  const before = await snapshot(page);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#session-entry-status')).not.toBeEmpty();
  expect(await snapshot(page)).toEqual(before);
});

test('successful edit commits legacy settings and history in one revision', async ({ page }) => {
  const before = await page.evaluate(() => ({ state: JSON.parse(localStorage.getItem(scheduleKey)), revision: readBundleFiles().manifest.revision }));
  const dialog = await openEntry(page);
  await dialog.locator('#session-entry-position').fill('21');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() => ({ bundle: readBundleFiles(), legacy: localStorage.getItem(scheduleKey) }));
  expect(saved.legacy).toBeNull();
  expect(saved.bundle.manifest.revision).toBe(before.revision + 1);
  expect(saved.bundle.plan.end_date).toBe(before.state.endDate);
  expect(saved.bundle.plan.rest_days).toEqual([{ start_date: before.state.endDate, end_date: before.state.endDate }]);
  const section = saved.bundle.books.sections[0];
  expect(section.simultaneous_groups).toEqual([['paper', 'other']]);
  expect(section.books[0].deadline_override).toBe(before.state.endDate);
  expect(section.books[0].start_date_override).toBe(before.state.startDate);
  expect(section.books[0].baseline_schedule).toEqual({ start_date: before.state.startDate, deadline: before.state.endDate, daily_target: 3 });
  expect(saved.bundle.sessions.sessions.paper[0].current_page).toBe(21);
});

test('persistence failure keeps the dialog draft and all raw storage', async ({ page }) => {
  const dialog = await openEntry(page);
  const before = await snapshot(page);
  await dialog.locator('#session-entry-position').fill('21');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === bundleKey) throw new Error('Injected storage failure');
      return setItem.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#session-entry-position')).toHaveValue('21');
  await expect(dialog.locator('#session-entry-status')).toHaveText('Injected storage failure');
  expect(await snapshot(page)).toEqual(before);
});

test('postcommit renderer failure reports a saved change and closes the dialog', async ({ page }) => {
  const dialog = await openEntry(page);
  await dialog.locator('#session-entry-position').fill('21');
  await page.evaluate(() => { window.renderEditor = () => { throw new Error('Injected render failure'); }; });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('editor-status')).toContainText('Reading session saved. Unable to refresh the display: Injected render failure');
  expect(await page.evaluate(() => readBundleFiles().sessions.sessions.paper[0].current_page)).toBe(21);
  expect(await page.evaluate(() => localStorage.getItem(scheduleKey))).toBeNull();
});
