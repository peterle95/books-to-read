const { test, expect } = require('@playwright/test');
const { chooseDate } = require('./calendar-helper');
const { createHash } = require('node:crypto');

const fixture = () => {
  const data = {
    'plan.json': { schema_version: 2, start_date: '2030-01-01', end_date: '2030-03-31', end_label: 'Quarter end', rest_days: [],
      stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true } },
    'books.json': { schema_version: 2, sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({
      label, books: label === 'Physical books' ? [{ id: 'book', number: 1, title: 'Book', start_page: 1, end_page: 90,
        current_page: null, pages: 90, pages_read: 0, baseline_schedule: null, deadline_override: null, start_date_override: null }] : [],
      simultaneous_groups: [], baseline_needs_recalculation: false,
    })) },
    'sessions.json': { schema_version: 2, sessions: { book: [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2030-01-01', modified_by: 'test',
    files: Object.fromEntries(files.map((file) => [file.name, createHash('sha256').update(file.buffer).digest('hex')])),
  })) });
  return files;
};

test('active plan actions expose next quarter and explicit recalculation; rest and date edits preserve baseline', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  expect(await page.locator('#rest-heading').evaluate((element) => !!(element.compareDocumentPosition(document.querySelector('#plan-form')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.getByRole('button', { name: 'Recalculate current plan' })).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(fixture());
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Your current plan is active. Press New plan to choose start and finish dates.')).toBeVisible();
  await page.getByRole('button', { name: 'Plan next quarter' }).click();
  await expect(page.locator('#quarter-dialog-heading')).toHaveText('Next quarter — 2030-04-01');
  await expect(page.locator('#quarter-dialog-heading')).toBeInViewport();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate schedule' }).click();
  const baseline = await page.evaluate(() => readBundleFiles().books.sections[0].books[0].baseline_schedule);
  await page.getByLabel('Plan finish').fill('2030-03-30');
  await page.getByRole('button', { name: 'Save plan dates' }).click();
  await chooseDate(page, page.getByLabel('Rest day from'), '2030-02-01');
  await chooseDate(page, page.getByLabel('Rest day to'), '2030-02-02');
  await page.getByRole('button', { name: 'Add rest days' }).click();
  await expect(page.getByTestId('schedule-status')).toHaveText(/baseline stays unchanged/);
  expect(await page.evaluate(() => readBundleFiles().books.sections[0].books[0].baseline_schedule)).toEqual(baseline);
  await page.reload();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  expect(await page.evaluate(() => readBundleFiles().books.sections[0].books[0].baseline_schedule)).toEqual(baseline);
  await page.getByRole('button', { name: 'Recalculate current plan' }).click();
  await expect(page.getByTestId('schedule-status')).toHaveText('Baseline schedule calculated on this device.');
  expect(await page.evaluate(() => readBundleFiles().books.sections[0].books[0].baseline_schedule)).not.toEqual(baseline);
});
