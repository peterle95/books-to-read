const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const bundleFiles = () => {
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-01-01', end_date: '2026-03-31', end_label: 'Quarter end' },
    'books.json': {
      schema_version: 2,
      sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({ label, books: [], simultaneous_groups: [] })),
    },
    'sessions.json': { schema_version: 2, sessions: {} },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-01-01', modified_by: 'test', files: hashes
  })) });
  return files;
};

const importBundle = async (page) => {
  await page.getByLabel('Bundle files').setInputFiles(bundleFiles());
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
};

test('an update is offered without interrupting the reader and saved data survives it', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByLabel('Reading plan').fill('Saved before the update');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await importBundle(page);
  await expect(page.getByTestId('update-notice')).toBeHidden();
  await page.evaluate(() => { window.__noAutomaticReload = true; });
  await page.request.get(new URL('__bump-sw', page.url()).href);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await expect(page.getByTestId('update-notice')).toBeVisible();
  await expect(page.getByTestId('update-notice')).toContainText(/new version/i);
  // The reader is not interrupted: the page did not reload and the draft is untouched.
  expect(await page.evaluate(() => window.__noAutomaticReload)).toBe(true);
  await expect(page.getByLabel('Reading plan')).toHaveValue('Saved before the update');
  await page.getByRole('button', { name: 'Reload to update' }).click();
  await page.waitForFunction(() => !window.__noAutomaticReload);
  await expect(page.getByTestId('update-notice')).toBeHidden();
  // Saved data and the imported bundle survive the update.
  await expect(page.getByLabel('Reading plan')).toHaveValue('Saved before the update');
  await expect(page.getByRole('button', { name: 'Export bundle ZIP' })).toBeVisible();
});

test('backup export is available and the reminder returns when a backup is a week old', async ({ page }) => {
  await page.goto('./');
  const reminder = page.getByTestId('backup-reminder');
  await expect(page.getByRole('button', { name: 'Export bundle ZIP' })).toBeHidden();
  await expect(reminder).toBeHidden();
  await importBundle(page);
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText(/no backup/i);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('reading-plan-bundle.zip');
  await expect(reminder).toBeHidden();
  await page.evaluate(() => localStorage.setItem('reading-plan-last-backup-v1', new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()));
  await page.reload();
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText(/last backup/i);
});
