const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 360, height: 732 }, deviceScaleFactor: 3, timezoneId: 'Europe/Berlin', locale: 'en-US' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
  await page.goto('./');
  await page.evaluate(async () => {
    const sections = ReadingQuarter.blankSections();
    sections[0].books = [{ ...ReadingQuarter.newBook('Physical books', 'Synthetic paper - history and projection', 1, 100), id: 'physical-id', current_page: 30, pages_read: 30 }];
    sections[2].books = [{ ...ReadingQuarter.newBook('Audiobooks', 'Synthetic audio - seconds history', 0, 3600), id: 'audio-id', current_time_seconds: 1800, time_listened_seconds: 1800, remaining_time_seconds: 1800 }];
    const planned = ReadingQuarter.blankSections();
    planned[0].books = [{ ...ReadingQuarter.newBook('Physical books', 'Synthetic next quarter', 1, 100), id: 'planned-id' }];
    await writeBundleFiles({
      'plan.json': { schema_version: 2, start_date: '2026-10-27', end_date: '2026-12-31', end_label: 'Quarter end', rest_days: [] },
      'books.json': { schema_version: 2, sections, planned_quarter: { start_date: '2027-01-01', sections: planned } },
      'sessions.json': { schema_version: 2, sessions: { 'physical-id': [], 'audio-id': [] } },
    });
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
});

const tab = (page, name) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
const stored = (page) => page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
const near = (actual, expected) => expect(Math.abs(actual - expected)).toBeLessThan(1 / 3);
const capture = (page, info, name) => page.screenshot({ path: info.outputPath(`${name}.png`) });

test('Books and Charts popup bounds follow native heading and label line boxes', async ({ page }) => {
  const before = await stored(page);
  // Accepted native-control crop: 360x732 CSS px, 48dp rows.
  for (const [screen, selector, bounds] of [
    ['Books', '#screen-books', { x: 24, y: 167 + 1 / 3, width: 312, height: 144 }],
    ['Charts', '#screen-charts', { x: 0, y: 148 + 1 / 3, width: 360, height: 96 }],
  ]) {
    await tab(page, screen);
    const combo = page.locator(selector).getByRole('combobox', { name: screen === 'Books' ? 'Format' : 'Book', exact: true });
    await combo.click();
    const popup = page.getByRole('listbox');
    const box = await popup.boundingBox();
    for (const key of Object.keys(bounds)) near(box[key], bounds[key]);
    near((await combo.boundingBox()).y, bounds.y);
    for (const row of await popup.getByRole('option').all()) near((await row.boundingBox()).height, 48);
    await combo.press('Escape');
    await expect(combo).toBeFocused();
    expect(await stored(page)).toBe(before);
  }
});

test('history spinner follows native handle, heading and row without browser button margins', async ({ page }, info) => {
  const before = await stored(page);
  await tab(page, 'Session');
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reading history', exact: true });
  const combo = dialog.getByRole('combobox', { name: 'Book', exact: true });
  await combo.click();
  const sheet = await dialog.boundingBox(), anchor = await combo.boundingBox();
  // Display-relative native sheet sizing cannot be equated to browser dvh.
  // Check the native content geometry independently of that responsive origin.
  near(anchor.y - sheet.y, 12 + 5 + 12 + 4 + 4 + 97 / 3 + 12 + 4);
  const popup = await page.getByRole('listbox').boundingBox();
  near(popup.x, 0); near(popup.width, 360); near(popup.y, anchor.y);
  await expect(dialog).toHaveCSS('border-width', '0px');
  await expect(combo).toHaveCSS('margin', '0px');
  await capture(page, info, 'history-popup');
  await combo.press('Escape');
  await expect(combo).toBeFocused();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await stored(page)).toBe(before);
});

test.describe('mobile display-sized history', () => {
  test.use({ screen: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('matches the native sheet and popup origin within one physical pixel', async ({ page }, info) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json']
      .map((name) => `fixtures/issue-45-populated/${name}`));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    const before = await stored(page);
    await tab(page, 'Session');
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Reading history', exact: true });
    const combo = sheet.getByRole('combobox', { name: 'Book', exact: true });
    near((await sheet.boundingBox()).y, 61 + 1 / 3);
    await combo.click();
    const popup = page.getByRole('listbox');
    near((await popup.boundingBox()).y, 146 + 2 / 3);
    near((await popup.boundingBox()).height, 192);
    for (const option of await popup.getByRole('option').all()) near((await option.boundingBox()).height, 48);
    await capture(page, info, 'history-display-sized-popup');
    await combo.press('Escape');
    await expect(combo).toBeFocused();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Entries', exact: true })).toBeFocused();
    expect(await stored(page)).toBe(before);
    await tab(page, 'Charts');
    await page.getByRole('button', { name: 'Metrics', exact: true }).click();
    near((await page.locator('#metrics-dialog').boundingBox()).y, 61 + 1 / 3);
  });

  test('keeps the sheet usable when the viewport becomes shorter or taller', async ({ page }) => {
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Reading history', exact: true });
    for (const height of [600, 900]) {
      await page.setViewportSize({ width: 360, height });
      await expect.poll(async () => { const box = await sheet.boundingBox(); return box.y + box.height; }).toBe(height);
      const box = await sheet.boundingBox();
      expect(box.height).toBeGreaterThan(height * 0.8);
      expect(box.height).toBeLessThan(height);
      near(box.y + box.height, height);
      await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    }
  });
});

test.describe('mobile sheet with reduced viewport', () => {
  test.use({ viewport: { width: 360, height: 600 }, screen: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('caps display-sized sheets to leave room for browser chrome or keyboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Reading history', exact: true });
    near((await sheet.boundingBox()).height, 552);
    await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  });
});

test('quarter popup keeps native horizontal bounds inside the wider custom-content anchor', async ({ page }, info) => {
  const before = await stored(page);
  await tab(page, 'Plan');
  await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
  const dialog = page.locator('#quarter-dialog');
  await dialog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const combo = dialog.getByRole('combobox', { name: 'Format', exact: true });
  // API35 Format TextView: 81 physical px at density 3, including 4dp
  // padding on each side. CSS distributes font padding differently; assert
  // the measured overall box, not an inferred browser line-height.
  const label = dialog.locator('label').first();
  near((await label.boundingBox()).height, 27);
  await combo.click();
  const anchor = await combo.boundingBox(), popup = await page.getByRole('listbox').boundingBox();
  near(anchor.x, 41); near(anchor.width, 278);
  near(anchor.y, (await label.boundingBox()).y + 27);
  near(popup.x, 49); near(popup.width, 262); near(popup.height, 144);
  near(popup.y, anchor.y);
  await capture(page, info, 'quarter-popup');
  await combo.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(combo).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await stored(page)).toBe(before);
});

test('calendar preserves framework month boxes and a styled scrollable year list', async ({ page }, info) => {
  const before = await stored(page);
  await tab(page, 'Plan');
  const field = page.locator('#rest-start');
  await field.click();
  const calendar = page.getByRole('dialog', { name: 'Choose date', exact: true });
  const box = await calendar.boundingBox();
  near(box.x, 36); near(box.y, 119.5); near(box.width, 288); near(box.height, 493);
  await expect(page.locator('.reading-calendar-date')).toHaveCSS('font-size', '34px');
  await expect(calendar.locator('[aria-current="date"]')).toHaveCSS('font-weight', '400');
  // API35 dimens_material.xml / date_picker_month_item_material.xml:
  // 6dp inset + 56dp month + 36dp weekdays, then 40dp day rows.
  const header = await calendar.locator('.reading-calendar-header').boundingBox();
  const navigation = await calendar.locator('.reading-calendar-navigation').boundingBox();
  const weekdays = await calendar.locator('.reading-calendar-weekdays').boundingBox();
  const row = await calendar.getByRole('row').first().boundingBox();
  near(header.height, 93);
  near(navigation.y, header.y + header.height + 6); near(navigation.height, 56);
  near(weekdays.y, navigation.y + navigation.height); near(weekdays.height, 36);
  near(row.y, weekdays.y + weekdays.height); near(row.height, 40);
  near(row.x, box.x + 20); near(row.width, 248);
  // Paint-style metrics are scoped to month content, never the matched header/date.
  await expect(calendar.locator('.reading-calendar-body')).toHaveCSS('font-family', 'AndroidCalendarRoboto, AndroidRoboto, sans-serif');
  await expect(calendar.locator('.reading-calendar-header')).toHaveCSS('font-family', 'AndroidRoboto, Roboto, Arial, sans-serif');
  await capture(page, info, 'calendar-month');
  await calendar.getByRole('button', { name: 'Choose year', exact: true }).click();
  const years = page.locator('.reading-calendar-years');
  await expect(years).toHaveCSS('overflow-y', 'auto');
  await expect(years).toHaveCSS('scrollbar-width', 'auto');
  const scrollbar = await years.evaluate((element) => {
    const bar = getComputedStyle(element, '::-webkit-scrollbar');
    const thumb = getComputedStyle(element, '::-webkit-scrollbar-thumb');
    const track = getComputedStyle(element, '::-webkit-scrollbar-track');
    return { width: bar.width, display: bar.display, color: thumb.backgroundColor, radius: thumb.borderRadius, track: track.backgroundColor, gutter: element.offsetWidth - element.clientWidth };
  });
  expect(scrollbar).toEqual({ width: '4px', display: 'inline', color: 'rgb(176, 176, 176)', radius: '0px', track: 'rgba(0, 0, 0, 0)', gutter: 4 });
  const selectedYear = await years.locator('[aria-pressed="true"]').boundingBox();
  near(selectedYear.y, 293.5); near(selectedYear.height, 59);
  near(selectedYear.x, box.x); near(selectedYear.width, box.width);
  await capture(page, info, 'calendar-year');
  const scroll = await years.evaluate((element) => {
    const before = element.scrollTop;
    element.scrollTop += 48;
    return { before, after: element.scrollTop, overflow: element.scrollHeight > element.clientHeight };
  });
  expect(scroll.overflow).toBe(true);
  expect(scroll.after).toBeGreaterThan(scroll.before);
  await page.keyboard.press('Escape');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  expect(await stored(page)).toBe(before);
});
