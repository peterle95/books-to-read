const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const fixture = (count = 10) => {
  const sections = ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({
    label, books: [], simultaneous_groups: [], baseline_needs_recalculation: false,
  }));
  const planned = structuredClone(sections);
  planned[0].books = Array.from({ length: count }, (_, i) => ({
    id: `planned-${i}`, number: i + 1, title: count === 1 ? 'Synthetic next quarter' : `Planned book ${i + 1}`, start_page: 1, end_page: 20,
    current_page: null, pages: 20, pages_read: 0, baseline_schedule: null,
    deadline_override: null, start_date_override: null, target_completed_date: null,
  }));
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-10-01', end_date: '2026-12-31', end_label: 'Quarter end', rest_days: [],
      stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true } },
    'books.json': { schema_version: 2, sections, planned_quarter: { start_date: '2027-01-01', sections: planned } },
    'sessions.json': { schema_version: 2, sessions: {} },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema_version: 2,
    revision: 1, last_modified: '2026-11-06', modified_by: 'fixture',
    files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])) })) });
  return files;
};

test.use({ deviceScaleFactor: 3, timezoneId: 'Europe/Berlin' });
for (const width of [360, 1440]) {
  test(`quarter scroll keeps its title/footer and native action hierarchy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 732 });
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(fixture());
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
    const heading = page.locator('#quarter-dialog-heading');
    const footer = page.locator('.quarter-actions');
    const before = [await heading.boundingBox(), await footer.boundingBox()];
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(footer).toBeInViewport({ ratio: 1 });
    const content = page.locator('#quarter-content');
    expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect([await heading.boundingBox(), await footer.boundingBox()]).toEqual(before);
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(footer).toBeInViewport({ ratio: 1 });
    expect(await page.locator('#quarter-dialog').evaluate((el) => el.scrollTop)).toBe(0);
    const actions = page.locator('#quarter-book-form > button:not([role="combobox"])');
    await expect(actions).toHaveText(['Add', 'Update selected', 'Remove selected']);
    const boxes = await actions.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].bottom);
    expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[1].bottom);
    expect(boxes.map((box) => box.x)).toEqual([boxes[0].x, boxes[0].x, boxes[0].x]);
    await expect(page.locator('#remove-planned-book')).toHaveCSS('background-color', 'rgb(247, 237, 226)');
    await expect(page.locator('#remove-planned-book')).toHaveCSS('color', 'rgb(58, 36, 26)');
    const combo = page.locator('#quarter-section-trigger');
    await expect(combo).toHaveCSS('font-size', '15px');
    await combo.click();
    for (const option of await page.getByRole('option').all()) await expect(option).toHaveCSS('font-size', '15px');
    await combo.press('End');
    await combo.press('Escape');
    await expect(combo).toBeFocused();
    await expect(combo).toHaveText('Physical books');
    await page.locator('#cancel-quarter').click();
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
  });
}

// Bounded geometry reference: native-quarter-panels-20261106-234244-1117510e.
// Synthetic bundle matches the visible planned date/title/format, not the native
// bundle bytes (that capture already diverged from its original host fixture).
for (const width of [360, 1440]) {
  test(`measured native quarter panels and responsive allocation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 732 });
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const files = fixture(1);
    await testInfo.attach('fixture-boundary', { body: JSON.stringify({
      reference: 'native-quarter-panels-20261106-234244-1117510e/measurements.json',
      byteIdenticalToNative: false, date: '2027-01-01', title: 'Synthetic next quarter', format: 'Physical books',
      sha256: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])),
    }, null, 2), contentType: 'application/json' });
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#quarter-dialog-heading')).toHaveText('Next quarter — 2027-01-01');
    await expect(page.locator('#quarter-title')).toBeEmpty();
    const content = page.locator('#quarter-content');
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const selectors = ['#quarter-dialog', '#quarter-dialog-heading', '#quarter-content', '#quarter-content-box',
      '#quarter-list', '#quarter-list button', '#quarter-book-form label', '#quarter-section-trigger', '#quarter-book-form > button[type="submit"]',
      '#update-planned-book', '#remove-planned-book', '.quarter-actions', '#cancel-quarter', '#save-quarter'];
    const geometry = await page.evaluate((selectors) => Object.fromEntries(selectors.map((selector) => {
      const el = document.querySelector(selector);
      return [selector, { ...el.getBoundingClientRect().toJSON(), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }];
    })), selectors);
    await testInfo.attach('quarter-bottom-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    await testInfo.attach('quarter-bottom', { body: await page.screenshot(), contentType: 'image/png' });
    for (const button of await page.locator('.quarter-actions button').all()) await expect(button).toHaveCSS('font-weight', '400');
    await testInfo.attach('quarter-footer', { body: await page.locator('.quarter-actions').screenshot(), contentType: 'image/png' });
    await testInfo.attach('quarter-footer-text', { body: JSON.stringify(await page.locator('.quarter-actions button').evaluateAll((buttons) => buttons.map((button) => {
      const style = getComputedStyle(button), range = document.createRange();
      range.selectNodeContents(button);
      return { text: button.textContent, weight: style.fontWeight, font: style.font, textBounds: range.getBoundingClientRect().toJSON() };
    })), null, 2), contentType: 'application/json' });
    if (width === 360) {
      const native = {
        '#quarter-dialog': [25, 16, 310, 700], '#quarter-dialog-heading': [25, 16, 310, 45],
        '#quarter-content': [25, 61, 310, 593], '#quarter-content-box': [25, 17, 310, 637],
        '#quarter-list': [41, 72.3333, 278, 87.3333], '#quarter-list button': [57, 84.3333, 246, 55.3333],
        '#quarter-book-form label': [41, 159.6667, 278, 27],
        '#quarter-section-trigger': [41, 186.6667, 278, 48], '#quarter-book-form > button[type="submit"]': [41, 482, 88, 48],
        '#update-planned-book': [41, 534, 131.6667, 48], '#remove-planned-book': [41, 586, 278, 48],
        '.quarter-actions': [25, 654, 310, 62], '#cancel-quarter': [149.3333, 658, 76.6667, 54], '#save-quarter': [226, 658, 97, 54],
      };
      for (const [selector, bounds] of Object.entries(native)) {
        for (const [i, key] of ['x', 'y', 'width', 'height'].entries()) {
          expect(Math.abs(geometry[selector][key] - bounds[i]), `${selector} ${key}`).toBeLessThanOrEqual(1);
        }
      }
      expect(geometry['#quarter-content'].scrollTop).toBe(44);
    } else {
      const dialog = geometry['#quarter-dialog'];
      expect(dialog.width).toBe(640);
      expect(dialog.height).toBeLessThanOrEqual(700);
      expect(dialog.y).toBeGreaterThanOrEqual(16);
      expect(dialog.bottom).toBeLessThanOrEqual(716);
      expect(geometry['#quarter-content-box'].height).toBeLessThan(637); // wider text reflows
      expect(geometry['#quarter-content'].scrollTop).toBeLessThan(44);
      expect(geometry['#quarter-content'].scrollTop).toBe(geometry['#quarter-content'].scrollHeight - geometry['#quarter-content'].clientHeight);
    }
    const combo = page.locator('#quarter-section-trigger');
    await combo.click();
    const popup = await page.getByRole('listbox').boundingBox();
    await testInfo.attach('quarter-popup-geometry', { body: JSON.stringify(popup), contentType: 'application/json' });
    await testInfo.attach('quarter-popup', { body: await page.screenshot(), contentType: 'image/png' });
    expect(popup.x).toBeCloseTo(geometry['#quarter-section-trigger'].x + 8, 1);
    expect(popup.y).toBeCloseTo(geometry['#quarter-section-trigger'].y, 1);
    expect(popup.width).toBeCloseTo(geometry['#quarter-section-trigger'].width - 16, 1);
    expect(popup.height).toBe(144);
    await combo.press('End');
    await combo.press('Escape');
    await expect(combo).toBeFocused();
    await expect(combo).toHaveText('Physical books');
    await page.locator('#cancel-quarter').click();
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
    await testInfo.attach('raw-bundle-after-cancel-sha256', { body: createHash('sha256').update(original).digest('hex'), contentType: 'text/plain' });
    if (width === 1440) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
      const natural = await page.locator('#quarter-dialog').boundingBox();
      expect(natural.height).toBeGreaterThan(700); // no universal 700px cap
      expect(natural.height).toBeLessThan(868);
      expect(await content.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
    }
  });
}
