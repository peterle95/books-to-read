const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

test('metrics sheet shows format schedules and focused detail tables, and closes by drag', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const section = (label, books) => ({ label, books, simultaneous_groups: [] });
  const baseline_schedule = { start_date: today, deadline: end, daily_target: 2 };
  const book = (id, title) => ({ id, title, start_page: 1, end_page: 100, current_page: 30, baseline_schedule });
  const data = {
    'plan.json': { schema_version: 2, start_date: today, end_date: end, end_label: 'Quarter end' },
    'books.json': { schema_version: 2, sections: [section('Physical books', [book('paper', 'Paper')]),
      section('Digital books', [book('digital', 'Digital')]), section('Audiobooks', [{ id: 'audio', title: 'Audio',
        start_time_seconds: 0, end_time_seconds: 3600, current_time_seconds: 600, baseline_schedule }])] },
    'sessions.json': { schema_version: 2, sessions: { paper: [], digital: [], audio: [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: today, modified_by: 'test', files: hashes,
  })) });

  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await page.getByRole('button', { name: 'Metrics', exact: true }).click();
  const sheet = page.locator('#metrics-dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(':scope > .metrics-heading').getByRole('heading', { name: 'Metrics', exact: true })).toBeVisible();
  await expect(sheet.locator(':scope > .metrics-heading').getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(sheet.locator('#metrics-content > .metrics-heading').getByRole('heading', { name: 'Metrics', exact: true })).toBeVisible();
  await expect(sheet.locator('#metrics-content > .metrics-heading').getByRole('button', { name: 'Back to charts', exact: true })).toBeVisible();
  for (const label of ['Physical books', 'Digital books', 'Audiobooks']) {
    const card = sheet.locator('.metrics-card').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
    await expect(card.getByRole('table')).toHaveCount(1);
    await expect(card.locator('thead th')).toHaveText(['Book', 'Daily', 'Remaining', 'Remaining days', 'Start date', 'Deadline', 'Status']);
    await expect(card.locator('tbody td')).toHaveCount(7);
  }
  await expect(sheet.getByRole('table', { name: 'Physical books schedules' })).toContainText('Paper');
  await expect(sheet.getByRole('table', { name: 'Audiobooks schedules' })).toContainText('Audio');
  for (const detail of ['Key metrics', 'Summary metrics', 'Schedule information']) {
    await sheet.getByRole('button', { name: detail, exact: true }).click();
    const table = sheet.getByRole('table', { name: detail, exact: true });
    await expect(table.locator('thead th')).toHaveText(['Area', 'Metric', 'Value', 'Details']);
    await expect(table.locator('tbody td').first()).not.toBeEmpty();
    await sheet.getByRole('button', { name: 'Back to metrics' }).click();
  }
  await expect(sheet.getByRole('table', { name: 'Physical books schedules' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  const geometry = await sheet.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
  });
  expect(geometry.bottom).toBeCloseTo(800, 0);
  // Native 86% display height is approximately 92% of the cropped content viewport.
  expect(geometry.height).toBeCloseTo(736, 0);
  const cell = sheet.locator('thead th').first();
  await expect(cell).toHaveCSS('font-size', '13px');
  await expect(cell).toHaveCSS('padding', '8px 10px');
  await expect(cell).toHaveCSS('min-width', '96px');
  const handle = sheet.locator('.metrics-handle');
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 150);
  await page.mouse.up();
  await expect(sheet).not.toBeVisible();
  await page.getByRole('button', { name: 'Metrics', exact: true }).click();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await page.getByRole('button', { name: 'Metrics', exact: true }).click();
  await sheet.getByRole('button', { name: 'Back to charts', exact: true }).click();
  await expect(sheet).not.toBeVisible();
});

test('current daily pace uses remaining work and saved windows without changing baselines or bundle bytes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00'));
  const baseline = (start_date = '2026-10-27', deadline = '2026-11-18') => ({ start_date, deadline, daily_target: 218 });
  const book = (id, current_page, baseline_schedule = baseline()) => ({ id, title: id, start_page: 1, end_page: 100, current_page, baseline_schedule });
  const section = (label, books) => ({ label, books, simultaneous_groups: [] });
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-10-27', end_date: '2026-12-31', end_label: 'Quarter end',
      rest_days: ['2026-11-06', '2026-11-09', '2026-11-12'].map((date) => ({ start_date: date, end_date: date })) },
    'books.json': { schema_version: 2, sections: [
      section('Physical books', [book('paper', 73), book('finished', 100)]),
      section('Digital books', [book('future', 72, baseline('2026-11-11')), book('no-days', 30, baseline('2026-11-09', '2026-11-09'))]),
      section('Audiobooks', [{ id: 'audio', title: 'Audio', start_time_seconds: 0, end_time_seconds: 3600,
        current_time_seconds: 600, baseline_schedule: baseline() }, { id: 'seconds', title: 'Seconds', start_time_seconds: 0,
        end_time_seconds: 3630, current_time_seconds: 600, baseline_schedule: baseline() }]),
    ] },
    'sessions.json': { schema_version: 2, sessions: { paper: [], finished: [], future: [], 'no-days': [], audio: [], seconds: [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-11-06', modified_by: 'test', files: hashes,
  })) });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  const storage = () => page.evaluate(() => ({ bundle: localStorage.getItem('reading-plan-bundle-v1'), schedule: localStorage.getItem('reading-plan-schedule-v1') }));
  const original = await storage();
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await page.getByRole('button', { name: 'Metrics', exact: true }).click();
  const sheet = page.locator('#metrics-dialog');
  const daily = (name) => sheet.locator('tbody tr').filter({ has: page.getByRole('cell', { name, exact: true }) }).locator('td').nth(1);
  await expect(daily('1. paper')).toHaveText('2.70 pages');
  await expect(daily('2. finished')).toHaveText('0.00 pages');
  await expect(daily('1. future')).toHaveText('4.00 pages');
  await expect(daily('2. no-days')).toHaveText('0.00 pages');
  await expect(daily('1. Audio')).toHaveText('0:05');
  await expect(daily('2. Seconds')).toHaveText('0:05:03');
  for (const detail of ['Summary metrics', 'Schedule information', 'Key metrics']) {
    await sheet.getByRole('button', { name: detail, exact: true }).click();
    await sheet.getByRole('button', { name: 'Back to metrics' }).click();
  }
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await storage()).toEqual(original);
});
