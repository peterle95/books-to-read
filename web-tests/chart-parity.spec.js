const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const date = (offset) => {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
};
const pages = (id, title, current) => ({
  id, number: 1, title, start_page: 1, end_page: 100, current_page: current,
  pages: 100, pages_read: current || 0, baseline_schedule: null,
});
const section = (label, books) => ({ label, books, simultaneous_groups: [] });

test('charts select one eligible book across formats; All and projection toggle match Android', async ({ page }) => {
  const data = {
    'plan.json': { schema_version: 2, start_date: date(-20), end_date: date(40), end_label: 'Quarter end' },
    'books.json': { schema_version: 2, sections: [
      section('Physical books', [pages('paper', 'Paper', 30), pages('finished', 'Finished', 100)]),
      section('Digital books', [pages('digital', 'Digital', 20), pages('unstarted', 'Unstarted', null)]),
      section('Audiobooks', [{ id: 'audio', number: 1, title: 'Audio', start_time_seconds: 0, end_time_seconds: 3600,
        current_time_seconds: 600, duration_seconds: 3600, time_listened_seconds: 600, remaining_time_seconds: 3000, baseline_schedule: null }]),
    ] },
    'sessions.json': { schema_version: 2, sessions: {
      paper: [
        { id: 'initial', date: date(-9), current_page: 9, pages_read: 9 },
        ...Array.from({ length: 8 }, (_, index) => ({ id: `paper-${index}`, date: date(index - 8),
          current_page: 9 + (index + 1) * 2, pages_read: 2 })),
        { id: 'paper-today', date: date(0), current_page: 30, pages_read: 5 },
      ],
      finished: [], digital: [], unstarted: [], audio: [],
    } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: date(0), modified_by: 'test', files: hashes,
  })) });

  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  const selector = page.locator('#charts').getByRole('combobox', { name: 'Book' });
  const toggle = page.locator('#charts').getByRole('checkbox', { name: 'Show projection and estimated finish range' });
  await selector.click();
  await expect(page.getByRole('option')).toHaveText([
    'Physical books - 1. Paper', 'Digital books - 1. Digital', 'Audiobooks - 1. Audio',
  ]);
  await selector.press('Escape');
  await expect(page.locator('#charts figure')).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Reading chart for Paper' })).toBeVisible();
  await expect(toggle).toBeChecked();
  await expect(page.locator('#charts polygon')).toHaveCount(1);
  await expect(page.locator('#charts figure p')).toContainText('Estimated finish range:');

  await selector.click();
  await page.getByRole('option', { name: 'Digital books - 1. Digital', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Reading chart for Digital' })).toBeVisible();
  await toggle.uncheck();
  await expect(page.locator('#charts polygon')).toHaveCount(0);
  await expect(page.locator('#charts figure p')).toHaveCount(0);
  await expect(page.locator('#charts svg')).not.toContainText('Projection / 80% range');
  await expect(page.locator('#charts polyline')).toHaveCount(3);
  await selector.press('End');
  await selector.press('Enter');
  await expect(selector).toHaveText('Audiobooks - 1. Audio');
  await expect(selector).toBeFocused();
  await expect(page.getByRole('img', { name: 'Reading chart for Audio' })).toBeVisible();
  await expect(page.locator('#charts svg')).toContainText('Time (left); time/day (right)');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.locator('#charts polyline')).toHaveCount(4);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await selector.click();
  await expect(page.getByRole('option')).toHaveText([
    'Physical books - 1. Paper', 'Physical books - 1. Finished', 'Digital books - 1. Digital',
    'Digital books - 1. Unstarted', 'Audiobooks - 1. Audio',
  ]);
  await expect(selector).toHaveText('Audiobooks - 1. Audio');
  await expect(page.getByRole('option', { name: 'Audiobooks - 1. Audio', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('option', { name: 'Digital books - 1. Unstarted', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Reading chart for Unstarted' })).toBeVisible();
  await selector.click();
  await page.getByRole('option', { name: 'Physical books - 1. Finished', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Reading chart for Finished' })).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(selector).toHaveText('Physical books - 1. Paper');
  await expect(page.getByRole('img', { name: 'Reading chart for Finished' })).toHaveCount(0);
  await expect(page.locator('#charts figure')).toHaveCount(1);
});
