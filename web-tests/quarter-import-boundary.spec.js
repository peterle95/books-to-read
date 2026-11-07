const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const fixture = (startDate) => {
  const sections = ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({
    label, books: [], simultaneous_groups: [], baseline_needs_recalculation: false,
  }));
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-01-01', end_date: '2026-03-31', end_label: 'Quarter end', rest_days: [] },
    'books.json': { schema_version: 2, sections, planned_quarter: { start_date: startDate, sections } },
    'sessions.json': { schema_version: 2, sessions: {} },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-01-01', modified_by: 'fixture',
    files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])),
  })) });
  return files;
};

test('off-boundary planned quarter imports fail without replacing the stored bundle', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(fixture('2030-04-01'));
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));

  for (const startDate of ['2030-04-02', '2030-05-01']) {
    await page.getByLabel('Bundle files').setInputFiles(fixture(startDate));
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle could not be imported: books.json planned_quarter: must start at a quarter boundary');
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
  }
});
