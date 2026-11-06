const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

async function populate(page, withBaselines = false) {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
  await page.goto('./');
  const data = await page.evaluate((withBaselines) => {
    const sections = ReadingQuarter.blankSections();
    sections[0].books = ['Synthetic paper - history and projection', 'Synthetic simultaneous partner'].map((title, index) => ({
      ...ReadingQuarter.newBook('Physical books', title, 1, 100), id: `paper-${index}`, number: index + 1,
      ...(withBaselines ? { baseline_schedule: { start_date: '2026-11-06', deadline: '2026-12-01', daily_target: 2 } } : {}),
    }));
    sections[1].books = [{ ...ReadingQuarter.newBook('Digital books', 'Synthetic digital - future start', 1, 100), id: 'digital', number: 1 }];
    sections[2].books = [{ ...ReadingQuarter.newBook('Audiobooks', 'Synthetic audio - seconds history', 0, 3600), id: 'audio', number: 1 }];
    sections[0].simultaneous_groups = [['paper-0', 'paper-1']];
    const sessions = Object.fromEntries(sections.flatMap((section) => section.books.map((book) => [book.id, []])));
    sessions['paper-0'] = [
      { id: 'first', date: '2026-11-05', current_page: 10, pages_read: 10 },
      { id: 'second', date: '2026-11-06', current_page: 20, pages_read: 10 },
      { id: 'third', date: '2026-11-06', current_page: 30, pages_read: 10 },
    ];
    recalculateReadingHistory(sections[0].books[0], sessions['paper-0'], 'Physical books');
    const planned = { startDate: '2027-01-01', sections: ReadingQuarter.blankSections() };
    planned.sections[0].books = [{ ...ReadingQuarter.newBook('Physical books', 'Future paper', 1, 100), number: 1 }];
    return {
      'plan.json': { schema_version: 2, start_date: '2026-11-06', end_date: '2026-12-01', end_label: 'Target finish date',
        rest_days: [{ start_date: '2026-11-08', end_date: '2026-11-09' }],
        stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true } },
      'books.json': { schema_version: 2, sections, planned_quarter: ReadingQuarter.plannedToJson(planned) },
      'sessions.json': { schema_version: 2, sessions },
    };
  }, withBaselines);
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-11-06', modified_by: 'layout fixture',
    files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])),
  })) });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
}

const tab = async (page, name) => {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
};

test('360x732 chart controls, group rows and Metrics table viewport retain native geometry', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 732 });
  await populate(page, true);
  const original = await page.evaluate(() => localStorage.getItem(bundleKey));
  await tab(page, 'Charts');
  const bookSelector = page.locator('#charts').getByRole('combobox', { name: 'Book', exact: true });
  await expect(bookSelector).toBeVisible();
  const selector = await bookSelector.boundingBox();
  const toggle = await page.locator('.chart-projection-toggle').boundingBox();
  const plot = await page.locator('#charts svg').boundingBox();
  expect(selector.height).toBe(48); // ReadingPlanUi.spinner minimum height.
  expect(toggle.height).toBe(44); // ReadingPlanUi.checkBox minimum height.
  const projectionCheckbox = page.locator('#charts input[type="checkbox"]');
  const indicator = await projectionCheckbox.boundingBox();
  expect([indicator.width, indicator.height, indicator.x]).toEqual([18, 18, 23]);
  await projectionCheckbox.focus();
  await page.keyboard.press('Space');
  await expect(projectionCheckbox).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(projectionCheckbox).toBeChecked();
  expect(toggle.y).toBe(selector.y + selector.height);
  expect(plot.y).toBe(toggle.y + toggle.height);
  // parity-reference-v2/android-run-20261106-1140/android-charts.xml: (793 - 72) / 3 = 240⅓ CSS px.
  expect(Math.abs(plot.y - (240 + 1 / 3))).toBeLessThanOrEqual(0.02); // Chromium 1/64px layout quantization.
  await page.screenshot({ path: testInfo.outputPath('charts-control-geometry.png') });
  await page.locator('#metrics-open').click();
  const card = page.locator('#metrics-content .metrics-card').first();
  const table = card.getByRole('table');
  const cardBox = await card.boundingBox(), tableBox = await table.boundingBox();
  expect(cardBox.x).toBe(36); // 20dp sheet + 16dp verticalBox padding.
  expect(Math.abs(cardBox.y - 278)).toBeLessThan(1); // Native first card; sheet viewport rounding is sub-dp.
  expect(tableBox.x - cardBox.x).toBe(14); // Drawable stroke is inside native padding.
  expect(cardBox.x + cardBox.width - tableBox.x - tableBox.width).toBe(14);
  expect(await card.evaluate(node => node.scrollWidth)).toBe(await card.evaluate(node => node.clientWidth));
  expect(await table.evaluate(node => node.scrollWidth)).toBeGreaterThan(tableBox.width);
  const titleBefore = await card.getByRole('heading').boundingBox();
  await table.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  expect(await table.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  expect(await card.getByRole('heading').boundingBox()).toEqual(titleBefore);
  expect(await table.boundingBox()).toEqual(tableBox);
  await table.evaluate(node => { node.scrollLeft = 0; });
  await page.screenshot({ path: testInfo.outputPath('metrics-inner-viewport.png') });
  await page.locator('#metrics-close').click();
  await tab(page, 'Books');
  await page.locator('#select-book-group').click();
  const dialog = page.locator('#book-group-dialog');
  expect((await dialog.boundingBox()).width).toBe(310);
  const rows = dialog.locator('#book-group-choices label');
  const first = await rows.nth(0).boundingBox(), second = await rows.nth(1).boundingBox();
  expect(first.height).toBe(48);
  expect(second.y).toBe(first.y + first.height);
  const checkbox = await rows.first().getByRole('checkbox').boundingBox();
  expect(checkbox.width).toBe(18);
  expect(checkbox.x).toBe(52);
  await expect(rows.first().getByRole('checkbox')).toHaveCSS('border-width', '2px');
  expect((await dialog.locator('.dialog-actions').boundingBox()).height).toBe(62);
  await expect(page.locator('#book-group-status')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('group-picker-geometry.png') });
  await page.locator('#cancel-book-group').click();
  expect(await page.evaluate(() => localStorage.getItem(bundleKey))).toBe(original);
});

test('populated 360x732 first fold preserves native page gutters and useful landmarks', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 732 });
  await populate(page);
  const original = await page.evaluate(() => localStorage.getItem(bundleKey));
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const settingsIcon = settings.locator('.native-settings-icon');
  await expect(settingsIcon).toHaveCount(1);
  await expect(settingsIcon).toHaveAttribute('aria-hidden', 'true');
  await expect(settingsIcon).toHaveCSS('mask-image', /\/books-to-read\/assets\/android\/ic-menu-manage-api35-xxhdpi\.png/);
  await expect(settingsIcon).toHaveCSS('mask-mode', 'alpha');
  await tab(page, 'Books');
  const books = await page.locator('#screen-books > section').boundingBox();
  expect(books.x).toBe(16);
  expect(books.width).toBe(328);
  await expect(page.locator('#screen-books > section')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('#editor-status')).toBeHidden();
  expect((await page.locator('#books-heading').boundingBox()).y).toBeLessThan(110);
  await expect(page.getByLabel('Start page', { exact: true })).toHaveCSS('height', '50px');
  await expect(page.locator('label[for="book-title"]')).toHaveCSS('font-weight', '400');
  const nav = await page.getByRole('navigation').boundingBox();
  const deadline = await page.locator('label[for="book-deadline-override"]').boundingBox();
  expect(deadline.y + deadline.height).toBeLessThan(nav.y);
  await page.screenshot({ path: testInfo.outputPath('populated-books-360x732.png') });

  await tab(page, 'Plan');
  await expect(page.getByRole('button', { name: 'Edit next quarter — 2027-01-01', exact: true })).toBeVisible();
  const restEnd = await page.locator('#rest-end').boundingBox();
  const addRange = await page.locator('#rest-form button').boundingBox();
  expect(restEnd.y + restEnd.height).toBeLessThan(nav.y);
  expect(addRange.y + addRange.height).toBeLessThan(nav.y);
  const range = await page.locator('#rest-list li').boundingBox();
  const remove = await page.getByRole('button', { name: /Remove rest days/ }).boundingBox();
  expect(remove.y).toBeGreaterThanOrEqual(range.y);
  expect(remove.y + remove.height).toBeLessThanOrEqual(range.y + range.height);
  await expect(page.locator('#rest-list')).toHaveCSS('list-style-type', 'none');
  await page.screenshot({ path: testInfo.outputPath('populated-plan-360x732.png') });

  await tab(page, 'Charts');
  const heading = await page.locator('.charts-heading').boundingBox();
  for (const id of ['#charts-heading', '#charts-all', '#metrics-open']) {
    const box = await page.locator(id).boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(heading.y);
    expect(box.y + box.height).toBeLessThanOrEqual(heading.y + heading.height);
  }
  const plot = await page.locator('#charts svg').first().boundingBox();
  expect(plot.height).toBe(500);
  expect(plot.width).toBeLessThanOrEqual(328);
  expect(nav.y - plot.y).toBeGreaterThan(350);
  expect(await page.locator('#screen-charts > section > p').evaluate((node) => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(plot.y + plot.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.screenshot({ path: testInfo.outputPath('populated-charts-360x732.png') });
  expect(await page.evaluate(() => localStorage.getItem(bundleKey))).toBe(original);
});

test('populated chooser, group and history use native alert actions without losing accessible controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 732 });
  await populate(page);
  const original = await page.evaluate(() => localStorage.getItem(bundleKey));
  await tab(page, 'Books');
  await page.getByRole('button', { name: 'Choose book to edit', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a book to edit', exact: true });
  await expect(chooser).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(chooser.getByRole('heading')).toHaveCSS('font-weight', '400');
  await chooser.getByRole('radio', { name: '1. Synthetic paper - history and projection', exact: true }).click();
  await expect(chooser).not.toBeVisible();
  await page.getByRole('button', { name: 'Select simultaneous books', exact: true }).click();
  const group = page.getByRole('dialog', { name: 'Select books to read simultaneously', exact: true });
  await expect(group.getByRole('checkbox', { name: '1. Synthetic paper - history and projection', exact: true })).toBeChecked();
  await expect(group.getByRole('button')).toHaveText(['Cancel', 'Apply']);
  await group.getByRole('button', { name: 'Cancel', exact: true }).click();
  await tab(page, 'Session');
  await expect(page.locator('#session-books button').first()).toHaveCSS('font-weight', '400');
  const bookButtons = page.locator('#session-books button');
  const firstBook = await bookButtons.nth(0).boundingBox(), secondBook = await bookButtons.nth(1).boundingBox();
  expect(firstBook.x).toBe(30); // surfaceCard 14dp inset, including its drawable stroke.
  expect(secondBook.x - firstBook.x - firstBook.width).toBe(6);
  await expect(page.locator('.session-metrics strong')).toHaveCount(2);
  await expect(page.locator('.session-metrics strong').first()).toHaveCSS('font-size', '21px');
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const sheet = page.locator('#entries-dialog');
  await expect(sheet.getByLabel('Book', { exact: true })).toBeVisible();
  await expect(sheet.locator('#history-list summary').first()).toHaveCSS('list-style-type', 'none');
  await sheet.locator('#history-list summary').first().click();
  const actions = sheet.locator('.history-actions').first();
  const edit = await actions.getByRole('button', { name: /Edit session/ }).boundingBox();
  const remove = await actions.getByRole('button', { name: /Delete session/ }).boundingBox();
  expect(edit.y).toBe(remove.y);
  await actions.getByRole('button', { name: /Edit session/ }).click();
  await expect(page.locator('.session-entry-actions button')).toHaveText(['Cancel', 'Save']);
  await page.locator('#session-entry-cancel').click();
  expect(await page.evaluate(() => localStorage.getItem(bundleKey))).toBe(original);
});

test('quarter shortcut refreshes after save and rollover, including an empty saved plan', async ({ page }) => {
  await populate(page);
  await tab(page, 'Plan');
  await page.getByRole('button', { name: 'Edit next quarter — 2027-01-01', exact: true }).click();
  await page.locator('#quarter-list button').click();
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
  await page.locator('#save-quarter').click();
  await expect(page.getByRole('button', { name: 'Edit next quarter — 2027-01-01', exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00Z'));
  await page.evaluate(() => checkRollover());
  await expect(page.getByRole('button', { name: 'Plan next quarter', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Edit next quarter —/ })).toHaveCount(0);
});

test('360x732 populated sheets preserve native hierarchy, density and pinned chrome', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 732 });
  await populate(page);
  const original = await page.evaluate(() => localStorage.getItem(bundleKey));
  await tab(page, 'Session');
  const format = await page.locator('.session-card').first().boundingBox();
  expect(format.height).toBeGreaterThanOrEqual(118);
  expect(format.height).toBeLessThanOrEqual(124);
  await page.screenshot({ path: testInfo.outputPath('session-density.png') });
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const sheet = page.locator('#entries-dialog');
  const bounds = await sheet.boundingBox();
  expect(bounds.y).toBeCloseTo(58.56, 0);
  expect(bounds.y + bounds.height).toBe(732);
  await expect(sheet).toHaveCSS('border-top-left-radius', '0px');
  const title = sheet.locator('#entries-content h3');
  await expect(title).toHaveText('Synthetic paper - history and projection');
  await expect(title).toHaveCSS('font-size', '16px');
  expect((await title.boundingBox()).height).toBe(40); // 20px line + native 12/8px padding.
  await title.evaluate((node) => { node.textContent = 'A much longer book title that must wrap instead of being clipped or hidden for visual parity'; });
  expect((await title.boundingBox()).height).toBeGreaterThan(40);
  await expect(title).toHaveCSS('text-overflow', 'clip');
  await expect(title).toHaveCSS('overflow', 'visible');
  await title.evaluate((node) => { node.textContent = 'Synthetic paper - history and projection'; });
  await sheet.locator('summary').first().click();
  const buttons = sheet.locator('.history-actions').first().getByRole('button');
  const edit = await buttons.nth(0).boundingBox(), remove = await buttons.nth(1).boundingBox();
  expect(edit.x + edit.width).toBeCloseTo(remove.x, 0);
  const lastAction = await sheet.locator('.history-actions').last().boundingBox();
  expect(lastAction.y + lastAction.height).toBeLessThan(732);
  await page.screenshot({ path: testInfo.outputPath('history-density.png') });
  const headingBefore = await sheet.locator('.entries-heading').boundingBox();
  await sheet.locator('#entries-content').evaluate((node) => { node.scrollTop = node.scrollHeight; });
  expect(await sheet.locator('.entries-heading').boundingBox()).toEqual(headingBefore);
  await sheet.getByRole('button', { name: /Edit session/ }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Edit session', exact: true });
  await expect(dialog.getByLabel('Session date', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Session current page', { exact: true })).toBeVisible();
  await expect(dialog.locator('#session-entry-date')).toHaveCSS('border-bottom-style', 'solid');
  await expect(dialog.locator('#session-entry-date')).toHaveCSS('border-top-width', '0px');
  expect((await dialog.boundingBox()).height).toBeLessThan(250);
  await page.screenshot({ path: testInfo.outputPath('edit-hierarchy.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await sheet.getByRole('button', { name: /Delete session/ }).last().click();
  const deletion = page.getByRole('dialog', { name: 'Delete entry?', exact: true });
  await expect(deletion.locator('#session-entry-fields')).toBeHidden();
  expect((await deletion.boundingBox()).height).toBeLessThan(200);
  await page.screenshot({ path: testInfo.outputPath('delete-hierarchy.png') });
  await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await tab(page, 'Books');
  await page.locator('#open-book-picker').click();
  const chooser = page.locator('#book-picker-dialog');
  const cancel = await chooser.getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
  const chooserBox = await chooser.boundingBox();
  expect(cancel.x).toBeGreaterThan(chooserBox.x + chooserBox.width / 2);
  await page.screenshot({ path: testInfo.outputPath('chooser-actions.png') });
  await page.keyboard.press('Escape');
  await page.locator('#today-reading').scrollIntoViewIfNeeded();
  expect((await page.locator('.app-header').boundingBox()).y).toBe(0);
  await expect(page.locator('#today-reading table').first()).toHaveCSS('white-space', 'nowrap');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.screenshot({ path: testInfo.outputPath('books-pinned-header.png') });
  expect(await page.evaluate(() => localStorage.getItem(bundleKey))).toBe(original);
});
