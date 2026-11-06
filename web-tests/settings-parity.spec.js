const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const options = { book_counts: false, page_share: true, average_pages: false, reading_period: true, pace_driver: false };
const names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
const fixture = () => {
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-10-01', end_date: '2026-12-31', end_label: 'Quarter end', rest_days: [], stats_options: options },
    'books.json': { schema_version: 2, sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({ label, books: [], simultaneous_groups: [], baseline_needs_recalculation: false })), planned_quarter: null },
    'sessions.json': { schema_version: 2, sessions: {} },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema_version: 2, revision: 1, last_modified: '2026-11-01', modified_by: 'fixture',
    files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])) })) });
  return files;
};
const importFiles = async (page, files) => {
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
};

for (const width of [390, 1440]) {
  test(`header actions open Settings idempotently and Done returns to each tab at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    for (const tab of ['Session', 'Plan', 'Books', 'Charts']) {
      await page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
      await page.locator('#json-status').focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.locator('#json-status').click();
      await expect(page.locator('#screen-settings')).toBeVisible();
      await expect(page.locator('.header-actions button[aria-expanded="true"]')).toHaveCount(2);
      await expect(page.locator('main > .screen:not([hidden])')).toHaveCount(1);
      const box = await page.locator('.header-actions').boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.locator(`#screen-${tab.toLowerCase()}`)).toBeVisible();
      await expect(page.getByRole('navigation').getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.header-actions button[aria-expanded="false"]')).toHaveCount(2);
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    expect(await page.locator('#screen-settings').evaluate((screen) => {
      const before = (left, right) => !!(screen.querySelector(left).compareDocumentPosition(screen.querySelector(right)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return before('#source-heading', '#bundle-heading') && before('#bundle-heading', '#csv-heading');
    })).toBe(true);
    await expect(page.getByRole('button', { name: 'Save summary settings' })).toHaveCount(0);
  });
}

test('JSON status validates stored data, survives failed imports and updates after writes and reload', async ({ page }) => {
  await page.goto('./');
  const status = page.locator('#json-status');
  await expect(status).toHaveAccessibleName('JSON not loaded. Open Settings');
  await expect(status).toHaveText('JSON');
  await expect(status).toHaveCSS('background-color', 'rgb(161, 46, 34)');
  await status.click();
  await importFiles(page, fixture());
  await expect(status).toHaveAccessibleName('JSON loaded. Open Settings');
  await expect(status).toHaveCSS('background-color', 'rgb(59, 106, 80)');
  const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
  const invalid = fixture();
  invalid[0].buffer = Buffer.from(JSON.stringify({ ...JSON.parse(invalid[0].buffer), end_label: 'Tampered' }));
  await page.getByLabel('Bundle files').setInputFiles(invalid);
  await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
  await expect(page.getByTestId('bundle-status')).toContainText('Checksum mismatch');
  expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
  await expect(status).toHaveAttribute('data-loaded', 'true');
  await page.evaluate(async () => { const current = readBundleFiles(); await writeBundleFiles({ 'plan.json': { ...current.plan, end_label: 'Target finish date' } }); });
  await page.reload();
  await expect(status).toHaveAccessibleName('JSON loaded. Open Settings');
  for (const corrupt of ['checksum', 'json']) {
    await page.evaluate(({ original, corrupt }) => {
      const encoded = JSON.parse(original);
      encoded['plan.json'] = btoa(corrupt === 'json' ? '{' : JSON.stringify({ ...JSON.parse(atob(encoded['plan.json'])), end_label: 'changed' }));
      localStorage.setItem('reading-plan-bundle-v1', JSON.stringify(encoded));
    }, { original, corrupt });
    await page.reload();
    await expect(status).toHaveAccessibleName('JSON not loaded. Open Settings');
    await expect(status).toHaveAttribute('data-loaded', 'false');
  }
});

test('imported summary options survive book edits and manual ZIP round-trip without a Settings editor', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-parity-'));
  try {
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await importFiles(page, fixture());
    await page.getByRole('button', { name: 'Books', exact: true }).click();
    await page.locator('#book-title').fill('Preserve options');
    await page.locator('#book-from').fill('1');
    await page.locator('#book-to').fill('20');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    expect(await page.evaluate(() => readBundleFiles().plan.stats_options)).toEqual(options);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    execFileSync('python', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', await (await download).path(), directory]);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'plan.json'))).stats_options).toEqual(options);
    await importFiles(page, names.map((name) => path.join(directory, name)));
    expect(await page.evaluate(() => readBundleFiles().plan.stats_options)).toEqual(options);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
