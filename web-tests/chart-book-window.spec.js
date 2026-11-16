const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

// A book added after the plan was created has no saved baseline yet. Both the chart
// and the metrics sheet must show that book's own scheduled window, not the plan's.
test('charts and metrics fall back to the book schedule when no baseline is saved', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00'));
  const section = (label, books) => ({ label, baseline_needs_recalculation: true, books, simultaneous_groups: [] });
  const book = (id, number, title, end_page) => ({ id, number, title, baseline_schedule: null,
    deadline_override: null, start_date_override: null, target_completed_date: null,
    start_page: 1, end_page, current_page: null, pages: end_page, pages_read: 0 });
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-11-16', end_date: '2027-01-31', end_label: 'Target finish date',
      stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true },
      rest_days: [] },
    'books.json': { schema_version: 2, sections: [
      section('Physical books', [book('test', 1, 'test', 100), book('test2', 2, 'test2', 50)]),
      section('Digital books', []),
      section('Audiobooks', []),
    ], planned_quarter: null },
    'sessions.json': { schema_version: 2, sessions: { test: [], test2: [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-11-16', modified_by: 'test', files: hashes,
  })) });

  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');

  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const caption = page.locator('#charts figcaption');
  await expect(caption).toHaveText('Physical books: test — 2026-11-16 to 2027-01-06');
  await page.locator('#charts').getByRole('combobox', { name: 'Book' }).click();
  await page.getByRole('option', { name: 'Physical books - 2. test2', exact: true }).click();
  await expect(caption).toHaveText('Physical books: test2 — 2027-01-07 to 2027-01-31');

  await page.getByRole('button', { name: 'Metrics', exact: true }).click();
  const sheet = page.locator('#metrics-dialog');
  const card = sheet.locator('.metrics-card').filter({ has: page.getByRole('heading', { name: 'Physical books', exact: true }) });
  const rows = card.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('td').nth(4)).toHaveText('2026-11-16');
  await expect(rows.nth(0).locator('td').nth(5)).toHaveText('2027-01-06');
  await expect(rows.nth(1).locator('td').nth(4)).toHaveText('2027-01-07');
  await expect(rows.nth(1).locator('td').nth(5)).toHaveText('2027-01-31');
});
