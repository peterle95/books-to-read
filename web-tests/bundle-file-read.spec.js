const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

test.use({ timezoneId: 'UTC' });

// Chromium's description for NotReadableError, reported when the backing file
// becomes unreadable after the input acquired a reference to it.
const notReadable = 'The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.';

const today = '2026-11-07';

const bundleFiles = () => {
  const section = (label, books) => ({ label, books, simultaneous_groups: [] });
  const data = {
    'plan.json': { schema_version: 2, start_date: today, end_date: today, end_label: 'Target finish date' },
    'books.json': { schema_version: 2, sections: [
      section('Physical books', [{ id: 'Pace', number: 1, title: 'Pace', start_page: 1, end_page: 100 }]),
      section('Digital books', []),
      section('Audiobooks', []),
    ] },
    'sessions.json': { schema_version: 2, sessions: { Pace: [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: today, modified_by: 'test',
    files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])),
  })) });
  return files;
};

// Replaces the disk read with the browser error this issue observed, so the
// recovery path is checked without depending on operating-system timing.
const failReads = (page, count) => page.evaluate((failures) => {
  const original = File.prototype.arrayBuffer;
  let remaining = failures;
  File.prototype.arrayBuffer = function (...args) {
    if (remaining === 0) return original.apply(this, args);
    remaining -= 1;
    return Promise.reject(new DOMException(
      'The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.',
      'NotReadableError'));
  };
}, count);

const openSettings = async (page) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
};

const storage = (page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

test('retries a file read that fails once, then imports the bundle', async ({ page }) => {
  await openSettings(page);
  await page.getByLabel('Bundle files').setInputFiles(bundleFiles());
  await failReads(page, 1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  expect(Object.keys(JSON.parse(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1')))))
    .toEqual(['plan.json', 'books.json', 'sessions.json', 'manifest.json']);
});

test('reports a persistent read failure and keeps the stored bundle', async ({ page }) => {
  await openSettings(page);
  await page.getByLabel('Bundle files').setInputFiles(bundleFiles());
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  const before = await storage(page);

  await page.getByLabel('Bundle files').setInputFiles(bundleFiles());
  await failReads(page, Infinity);
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText(`Bundle could not be imported: ${notReadable}`);
  expect(await storage(page)).toEqual(before);
});
