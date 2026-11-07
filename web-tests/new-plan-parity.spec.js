const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

test('New plan cancellation preserves the bundle; replacement resets current data but keeps the planned quarter and draft', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'new-plan-parity-'));
  try {
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(fixture());
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByLabel('Reading plan').fill('Keep my draft');
    await page.getByRole('button', { name: 'Save plan', exact: true }).click();
    const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'New plan', exact: true }).click();
    await expect(page.getByLabel('Start date', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'New plan', exact: true }).click();
    await expect(page.locator('#new-plan-status')).toHaveText('New plan saved.');
    const expected = await page.evaluate(() => {
      const start = ReadingQuarter.nextQuarterStart(ReadingSchedule.today());
      return { start, end: ReadingQuarter.periodEnd(start) };
    });
    await expect(page.getByLabel('Start date', { exact: true })).toHaveValue(expected.start);
    await expect(page.getByLabel('Finish date', { exact: true })).toHaveValue(expected.end);
    const data = await page.evaluate(() => readBundleFiles());
    expect(data.plan).toMatchObject({ start_date: expected.start, end_date: expected.end, end_label: 'Quarter end', rest_days: [] });
    expect(Object.values(data.plan.stats_options)).toEqual([true, true, true, true, true]);
    expect(data.books.sections.map((section) => [section.label, section.books, section.simultaneous_groups])).toEqual([
      ['Physical books', [], []], ['Digital books', [], []], ['Audiobooks', [], []],
    ]);
    expect(data.books.planned_quarter).toEqual(JSON.parse(fixture()[1].buffer).planned_quarter);
    expect(data.sessions.sessions).toEqual({});
    await expect(page.getByLabel('Reading plan')).toHaveValue('Keep my draft');

    await page.getByLabel('Start date', { exact: true }).fill('2028-04-01');
    await page.getByLabel('Finish date', { exact: true }).fill('2028-03-31');
    await page.getByRole('button', { name: 'Create plan' }).click();
    await expect(page.locator('#new-plan-status')).toHaveText('Finish date must be on or after the start date.');
    expect((await page.evaluate(() => readBundleFiles())).plan.start_date).toBe(expected.start);

    await page.getByLabel('Start date', { exact: true }).fill('2028-01-01');
    await page.getByLabel('Finish date', { exact: true }).fill('2028-02-14');
    await page.getByLabel('Custom finish date').check();
    await page.getByRole('button', { name: 'Create plan' }).click();
    await expect(page.locator('#new-plan-status')).toHaveText('Plan recalculated.');
    expect((await page.evaluate(() => readBundleFiles())).plan).toMatchObject({ start_date: '2028-01-01', end_date: '2028-02-14', end_label: 'Target finish date' });
    await page.getByLabel('Custom finish date').uncheck();
    await page.getByRole('button', { name: 'Create plan' }).click();
    expect((await page.evaluate(() => readBundleFiles())).plan).toMatchObject({ start_date: '2028-01-01', end_date: '2028-03-31', end_label: 'Quarter end' });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    const download = await downloadPromise;
    execFileSync('python', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', await download.path(), directory]);
    await page.getByLabel('Bundle files').setInputFiles([...names, 'manifest.json'].map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    expect((await page.evaluate(() => readBundleFiles())).books.planned_quarter).toEqual(data.books.planned_quarter);
    await page.reload();
    expect((await page.evaluate(() => readBundleFiles())).plan.end_date).toBe('2028-03-31');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByLabel('Reading plan')).toHaveValue('Keep my draft');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('New plan creates a complete bundle without prior import', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'New plan', exact: true }).click();
  await expect(page.locator('#new-plan-status')).toHaveText('New plan saved.');
  expect((await page.evaluate(() => readBundleFiles())).manifest.files).toHaveProperty(['sessions.json']);
});
