const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

test.use({ timezoneId: 'UTC' });

const fixture = (today) => {
  const day = new Date(`${today}T12:00:00Z`);
  const earlier = (offset) => new Date(day.getTime() - offset * 86400000).toISOString().slice(0, 10);
  const baseline_schedule = { start_date: today, deadline: today, daily_target: 100 };
  const book = (id, number) => ({ id, number, title: id, start_page: 1, end_page: 100, current_page: 30, baseline_schedule });
  const section = (label, books) => ({ label, books, simultaneous_groups: [] });
  const data = {
    'plan.json': { schema_version: 2, start_date: today, end_date: today, end_label: 'Target finish date' },
    'books.json': { schema_version: 2, sections: [section('Physical books', [book('Pace', 1), book('Quiet', 2)]), section('Digital books', []), section('Audiobooks', [])] },
    'sessions.json': { schema_version: 2, sessions: { Pace: today === '0001-01-01' ? [] : [...Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`, date: earlier(8 - index), current_page: 10 + index * 2, pages_read: index ? 2 : 10,
    })), { id: 'today', date: today, current_page: 30, pages_read: 6 }], Quiet: [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: today, modified_by: 'test', files: hashes,
  })) });
  return files;
};

for (const [today, paceLabels, quietLabels] of [
  ['9999-12-29', ['12-29', '12-30', '12-31'], ['12-29', '12-30']],
  ['9999-12-30', ['12-30', '12-31'], ['12-30', '12-31']],
  ['9999-12-31', ['12-30', '12-31'], ['12-30', '12-31']],
  ['0001-01-01', ['01-01', '01-02'], ['01-01', '01-02']],
  ...['0001', '0099', '0100', '2026'].map((year) => [`${year}-10-01`, ['10-01', '10-10', '10-19', '10-27', '11-05'], ['10-01', '10-02']]),
]) {
  test(`chart keeps dates and coordinates valid on ${today} without writes`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date(`${today}T12:00:00Z`));
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(fixture(today));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    if (today.startsWith('9999')) {
      await expect(page.getByTestId('quarter-status')).toHaveText('Quarter date must be within years 0001–9999.');
      await expect(page.locator('#open-quarter')).toBeDisabled();
      await expect(page.locator('section[aria-labelledby="new-plan-heading"] button').filter({ hasText: 'Plan next quarter' })).toBeDisabled();
    } else {
      await expect(page.locator('#open-quarter')).toBeEnabled();
    }
    const storage = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    const original = await storage();
    await page.getByRole('button', { name: 'Charts', exact: true }).click();
    const svg = page.getByRole('img', { name: 'Reading chart for Pace' });
    await expect(svg.locator('.chart-date-label')).toHaveText(paceLabels);
    if (today.startsWith('9999')) await expect(svg).toContainText('beyond supported date range');
    const selector = page.locator('#charts').getByRole('combobox', { name: 'Book' });
    const projection = page.getByRole('checkbox', { name: 'Show projection and estimated finish range' });
    for (const visible of [false, true]) {
      await projection.setChecked(visible);
      await expect(svg.locator('.chart-date-label')).toHaveText(paceLabels);
      expect(await svg.innerHTML()).not.toMatch(/NaN|Infinity|\+010000|0000-\d\d-\d\d/);
    }
    await selector.click();
    await page.getByRole('option', { name: 'Physical books - 2. Quiet' }).click();
    const quiet = page.getByRole('img', { name: 'Reading chart for Quiet' });
    await expect(quiet.locator('.chart-date-label')).toHaveText(quietLabels);
    expect(await quiet.innerHTML()).not.toMatch(/NaN|Infinity|\+010000|0000-\d\d-\d\d/);
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Charts', exact: true }).click();
    await expect(quiet.locator('.chart-date-label')).toHaveText(quietLabels);
    expect(await storage()).toEqual(original);
    expect(errors).toEqual([]);
    if (today === '9999-12-31') {
      await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Bundle files').setInputFiles(fixture('2026-10-01'));
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Import bundle' }).click();
      await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
      await expect(page.locator('#open-quarter')).toBeEnabled();
      await expect(page.locator('section[aria-labelledby="new-plan-heading"] button').filter({ hasText: 'Plan next quarter' })).toBeEnabled();
      expect(errors).toEqual([]);
    }
  });
}
