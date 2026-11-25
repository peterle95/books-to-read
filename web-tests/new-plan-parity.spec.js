const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { confirmBundleImport } = require('./bundle-helper');

const names = ['plan.json', 'books.json', 'sessions.json'];
const fixture = () => {
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-07-01', end_date: '2026-09-30', end_label: 'Target finish date',
      rest_days: [{ start_date: '2026-07-04', end_date: '2026-07-05' }],
      stats_options: { book_counts: false, page_share: false, average_pages: false, reading_period: false, pace_driver: false } },
    'books.json': { schema_version: 2, sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({
      label, books: label === 'Physical books' ? [{ id: 'old-book', number: 1, title: 'Old book', start_page: 1, end_page: 10, current_page: 3, pages_read: 3 }] : [],
      simultaneous_groups: [], baseline_needs_recalculation: false,
    })), planned_quarter: { start_date: '2030-01-01', sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({ label, books: [], simultaneous_groups: [] })) } },
    'sessions.json': { schema_version: 2, sessions: { 'old-book': [{ id: 'old-session', date: '2026-07-02', current_page: 3, pages_read: 3 }] } },
  };
  const files = names.map((name) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data[name])) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-07-02', modified_by: 'test',
    files: Object.fromEntries(files.map((file) => [file.name, createHash('sha256').update(file.buffer).digest('hex')])),
  })) });
  return files;
};

test('New plan cancellation preserves the bundle; confirmed replacement clears old data', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'new-plan-parity-'));
  try {
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(fixture());
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.locator('#source-status')).toHaveText('JSON loaded in this browser. Transfers are manual.');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
    const open = page.getByRole('button', { name: 'New plan', exact: true });
    page.once('dialog', (dialog) => dialog.dismiss());
    await open.click();
    await expect(page.locator('#create-plan-dialog')).toBeHidden();
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('reading history, rest days, and the queued quarter');
      return dialog.accept();
    });
    await open.click();
    await expect(page.getByLabel('Start date', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);

    page.once('dialog', (dialog) => dialog.accept());
    await open.click();
    const expected = await page.evaluate(() => {
      const start = ReadingSchedule.today();
      return { start, end: ReadingQuarter.periodEnd(start) };
    });
    await expect(page.getByLabel('Start date', { exact: true })).toHaveValue(expected.start);
    await expect(page.getByLabel('Finish date', { exact: true })).toHaveValue(expected.end);

    await page.getByLabel('Start date', { exact: true }).fill('2028-04-01');
    await page.getByLabel('Finish date', { exact: true }).fill('2028-03-31');
    await page.getByRole('button', { name: 'Create plan' }).click();
    await expect(page.locator('#new-plan-error')).toHaveText('Finish date must be on or after the start date.');
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);

    await page.getByLabel('Start date', { exact: true }).fill('2028-01-01');
    await page.getByLabel('Finish date', { exact: true }).fill('2028-02-14');
    await page.getByRole('button', { name: 'Create plan' }).click();
    await expect(page.locator('#new-plan-status')).toBeEmpty();
    await page.waitForFunction(() => typeof bundleWritePending === 'undefined' || !bundleWritePending);
    const data = await page.evaluate(() => readBundleFiles());
    expect(data.plan).toMatchObject({ start_date: '2028-01-01', end_date: '2028-02-14', end_label: 'Target finish date', rest_days: [] });
    expect(data.books.sections.map((section) => [section.label, section.books, section.simultaneous_groups])).toEqual([
      ['Physical books', [], []], ['Digital books', [], []], ['Audiobooks', [], []],
    ]);
    expect(data.books.planned_quarter ?? null).toBeNull();
    expect(data.sessions.sessions).toEqual({});

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    const download = await downloadPromise;
    execFileSync('python', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', await download.path(), directory]);
    await page.getByLabel('Bundle files').setInputFiles([...names, 'manifest.json'].map((name) => path.join(directory, name)));
    await confirmBundleImport(page);
    await page.reload();
    const restored = await page.evaluate(() => readBundleFiles());
    expect(restored.plan).toEqual(data.plan);
    expect(restored.books).toEqual(data.books);
    expect(restored.sessions).toEqual(data.sessions);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('New plan creates a complete bundle without prior import', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Plan next quarter', exact: true }).click();
  await page.getByRole('button', { name: 'New plan', exact: true }).click();
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  await expect(page.locator('#new-plan-status')).toBeEmpty();
  await page.waitForFunction(() => typeof bundleWritePending === 'undefined' || !bundleWritePending);
  expect((await page.evaluate(() => readBundleFiles())).manifest.files).toHaveProperty(['sessions.json']);
});
