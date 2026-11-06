const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const calendar = (page) => page.getByRole('dialog', { name: 'Choose date', exact: true });
const rawBundle = (page) => page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
const snapshot = (page) => page.evaluate(() => readBundleFiles());
const tab = (page, name) => page.getByRole('button', { name, exact: true }).click();

async function load(page) {
  await page.clock.install({ time: new Date('2028-11-06T12:00:00Z') });
  await page.goto('./');
  const files = await page.evaluate(() => {
    const sections = ReadingQuarter.blankSections();
    sections[0].books = ['First', 'Second'].map((title, index) => ({
      ...ReadingQuarter.newBook('Physical books', title, 1, 100), id: title.toLowerCase(), number: index + 1,
      start_date_override: index ? null : '2030-03-11', deadline_override: index ? null : '2030-11-05',
      baseline_schedule: { start_date: index ? '2030-01-01' : '2030-03-11', deadline: index ? '2030-12-31' : '2030-11-05', daily_target: 1 },
    }));
    return {
      'plan.json': { schema_version: 2, start_date: '2030-01-01', end_date: '2030-12-31', end_label: 'Target finish date', rest_days: [] },
      'books.json': { schema_version: 2, sections, planned_quarter: null },
      'sessions.json': { schema_version: 2, sessions: { first: [], second: [] } },
    };
  });
  const payloads = Object.entries(files).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  payloads.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2028-11-06', modified_by: 'calendar fixture',
    files: Object.fromEntries(payloads.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])),
  })) });
  await tab(page, 'Settings');
  await page.getByLabel('Bundle files').setInputFiles(payloads);
  page.once('dialog', (dialog) => dialog.accept());
  await tab(page, 'Import bundle');
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
}

// Choose exclusively through the visible calendar, never by filling a readonly field.
async function chooseDate(page, input, iso, commit = true) {
  await input.click();
  const picker = calendar(page);
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const [year, month, day] = iso.split('-').map(Number);
  await picker.getByRole('button', { name: 'Choose year', exact: true }).click();
  await picker.getByRole('button', { name: String(year), exact: true }).click();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const current = months.indexOf((await page.locator('#reading-calendar-month').textContent()).split(' ')[0]) + 1;
  for (let step = 0; step < Math.abs(month - current); step++) {
    await picker.getByRole('button', { name: month < current ? 'Previous month' : 'Next month', exact: true }).click();
  }
  const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  await picker.getByRole('gridcell', { name: label, exact: true }).click();
  await picker.getByRole('button', { name: commit ? 'OK' : 'CANCEL', exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
}

async function selectFirst(page) {
  await tab(page, 'Books');
  await tab(page, 'Choose book to edit');
  await page.getByRole('radio', { name: '1. First', exact: true }).click();
}

test('six ISO fields remain editable; only rest and override fields attach readonly calendars', async ({ page }) => {
  await load(page);
  for (const id of ['session-date', 'session-entry-date', 'create-plan-start', 'create-plan-finish', 'plan-start', 'plan-finish']) {
    const input = page.locator(`#${id}`);
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveAttribute('data-date-mode', 'text');
    expect(await input.evaluate((field) => field.readOnly)).toBe(false);
    await expect(input).not.toHaveAttribute('aria-controls', 'reading-calendar');
    await expect(input).not.toHaveAttribute('aria-haspopup', 'dialog');
  }
  await tab(page, 'Plan');
  await expect(page.locator('#plan-start')).toHaveValue('2030-01-01');
  await page.locator('#plan-start').click();
  await expect(calendar(page)).not.toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#new-plan').click();
  // Dismissing the replacement confirmation still exposes the existing plan dates.
  await expect(page.locator('#create-plan-start')).toHaveValue('2030-01-01');
  await page.locator('#create-plan-finish').click();
  await expect(page.locator('#create-plan-finish')).toHaveValue('2030-12-31');
  await expect(calendar(page)).not.toBeVisible();
  for (const id of ['rest-start', 'rest-end']) {
    await page.locator(`#${id}`).click();
    await expect(calendar(page)).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await selectFirst(page);
  for (const [id, month] of [['book-start-override', 'March 2030'], ['book-deadline-override', 'November 2030']]) {
    await page.locator(`#${id}`).click();
    await expect(page.locator('#reading-calendar-month')).toHaveText(month);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  for (const input of await page.locator('input[aria-controls="reading-calendar"]').all()) {
    await expect(input).toHaveAttribute('readonly', '');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveAttribute('aria-haspopup', 'dialog');
  }
  expect(await page.locator('input[aria-controls="reading-calendar"]').count()).toBe(8);
});

test('Books OK only changes draft/events; Cancel, Set and Clear retain unrelated drafts and records', async ({ page }) => {
  await load(page);
  await selectFirst(page);
  await page.locator('#book-title').fill('Unsaved title');
  await page.locator('#book-to').fill('999');
  const before = await snapshot(page), raw = await rawBundle(page);
  const input = page.locator('#book-deadline-override');
  await input.evaluate((field) => {
    window.dateEvents = [];
    for (const name of ['input', 'change']) field.addEventListener(name, () => dateEvents.push(name));
  });
  await chooseDate(page, input, '2031-02-10', false);
  await expect(input).toHaveValue('2030-11-05');
  expect(await page.evaluate(() => dateEvents)).toEqual([]);
  await chooseDate(page, input, '2030-12-10');
  await expect(input).toHaveValue('2030-12-10');
  expect(await page.evaluate(() => dateEvents)).toEqual(['input', 'change']);
  expect(await rawBundle(page)).toBe(raw);
  await page.locator('#set-book-deadline').click();
  await expect(page.getByTestId('editor-status')).toContainText('Deadline override saved');
  const saved = await snapshot(page);
  expect(saved.books.sections[0].books[0].deadline_override).toBe('2030-12-10');
  expect(saved.books.sections[0].books[1]).toEqual(before.books.sections[0].books[1]);
  expect(saved.sessions).toEqual(before.sessions);
  expect(saved.plan).toEqual(before.plan);
  await expect(page.locator('#book-title')).toHaveValue('Unsaved title');
  await expect(page.locator('#book-to')).toHaveValue('999');
  await page.locator('#clear-book-deadline').click();
  await expect(page.getByTestId('editor-status')).toContainText('Deadline override cleared');
  await expect(input).toHaveValue('');
  const cleared = await rawBundle(page);
  await page.locator('#set-book-deadline').click();
  await expect(page.getByTestId('editor-status')).toContainText('real date');
  expect(await rawBundle(page)).toBe(cleared);
});

test('rest ranges reject absent, invalid and reversed drafts; calendar OK never saves before Add', async ({ page }) => {
  await load(page);
  await tab(page, 'Plan');
  const raw = await rawBundle(page), start = page.locator('#rest-start'), end = page.locator('#rest-end');
  await tab(page, 'Add rest days');
  await expect(page.getByTestId('schedule-status')).toHaveText('Set both rest-day dates.');
  await start.click();
  await expect(page.locator('#reading-calendar-month')).toHaveText('November 2028');
  await page.keyboard.press('Escape');
  await expect(start).toHaveValue('');
  await chooseDate(page, start, '2030-03-12');
  await tab(page, 'Add rest days');
  await expect(page.getByTestId('schedule-status')).toHaveText('Set both rest-day dates.');
  await chooseDate(page, end, '2030-03-11');
  await tab(page, 'Add rest days');
  await expect(page.getByTestId('schedule-status')).toContainText('on or after');
  expect(await rawBundle(page)).toBe(raw);
  await end.evaluate((field) => { field.value = '2030-02-30'; });
  await tab(page, 'Add rest days');
  await expect(page.getByTestId('schedule-status')).toContainText('real date');
  expect(await rawBundle(page)).toBe(raw);
  await end.evaluate((field) => { field.value = '0000-02-29'; });
  await tab(page, 'Add rest days');
  await expect(page.getByTestId('schedule-status')).toContainText('real date');
  expect(await rawBundle(page)).toBe(raw);
  await chooseDate(page, end, '2030-03-13');
  expect(await rawBundle(page)).toBe(raw);
  await tab(page, 'Add rest days');
  await expect(page.locator('#rest-list')).toContainText('2030-03-12 to 2030-03-13');
  expect((await snapshot(page)).plan.rest_days).toEqual([{ start_date: '2030-03-12', end_date: '2030-03-13' }]);
});

test('dynamic schedule override calendars reopen saved values and require explicit Set', async ({ page }) => {
  await load(page);
  await tab(page, 'Plan');
  const input = () => page.getByLabel('Start date override for Second', { exact: true });
  const raw = await rawBundle(page);
  await page.getByRole('button', { name: 'Save the start date for Second', exact: true }).click();
  await expect(page.getByTestId('schedule-status')).toContainText('real date');
  expect(await rawBundle(page)).toBe(raw);
  await chooseDate(page, input(), '2030-02-12');
  expect(await rawBundle(page)).toBe(raw);
  await page.getByRole('button', { name: 'Save the start date for Second', exact: true }).click();
  await expect(page.getByTestId('schedule-status')).toContainText('Start date override saved for Second');
  await expect(input()).toHaveValue('2030-02-12');
  await input().click();
  await expect(page.locator('#reading-calendar-month')).toHaveText('February 2030');
  await page.keyboard.press('Escape');
  const deadline = page.getByLabel('Deadline override for Second', { exact: true });
  await chooseDate(page, deadline, '2030-10-20');
  await page.getByRole('button', { name: 'Save the deadline for Second', exact: true }).click();
  await expect(page.getByTestId('schedule-status')).toContainText('Deadline override saved for Second');
  await expect(page.getByLabel('Deadline override for Second', { exact: true })).toHaveValue('2030-10-20');
});

test('editable ISO fields and readonly overrides validate real and required dates before saves', async ({ page }) => {
  await load(page);
  const raw = await rawBundle(page);
  await tab(page, 'Plan');
  for (const [id, value] of [['plan-start', ''], ['plan-start', '2030-02-30'], ['plan-finish', '2030-13-01']]) {
    await page.locator('#plan-start').evaluate((field) => { field.value = '2030-01-01'; });
    await page.locator(`#${id}`).evaluate((field, next) => { field.value = next; }, value);
    await tab(page, 'Save plan dates');
    expect(await page.locator(`#${id}`).evaluate((field) => field.checkValidity())).toBe(false);
    expect(await rawBundle(page)).toBe(raw);
  }
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#new-plan').click();
  for (const value of ['', '2030-02-30']) {
    await page.locator('#create-plan-start').evaluate((field, next) => { field.value = next; }, value);
    await tab(page, 'Create plan');
    expect(await page.locator('#create-plan-start').evaluate((field) => field.checkValidity())).toBe(false);
    expect(await rawBundle(page)).toBe(raw);
  }
  await selectFirst(page);
  for (const kind of ['start', 'deadline']) {
    for (const value of ['', '2030-02-30', '0000-02-29']) {
      await page.locator(`#book-${kind}-override`).evaluate((field, next) => { field.value = next; }, value);
      await page.locator(`#set-book-${kind}`).click();
      await expect(page.getByTestId('editor-status')).toContainText('real date');
      expect(await rawBundle(page)).toBe(raw);
    }
  }
  await tab(page, 'Session');
  await page.locator('#session-position').fill('10');
  for (const value of ['', '2028-02-30']) {
    await page.locator('#session-date').evaluate((field, next) => { field.value = next; }, value);
    await tab(page, 'Add session');
    expect(await page.locator('#session-date').evaluate((field) => field.checkValidity())).toBe(false);
    expect(await rawBundle(page)).toBe(raw);
  }
});

test('nested history editor types ISO dates without a calendar; Cancel retains records and parent sheet', async ({ page }) => {
  await load(page);
  await tab(page, 'Session');
  await page.locator('#session-position').fill('10');
  await tab(page, 'Add session');
  await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
  await tab(page, 'Entries');
  await page.getByRole('button', { name: /Edit session First/ }).click();
  const input = page.locator('#session-entry-date'), raw = await rawBundle(page);
  await input.fill('2028-11-05');
  await expect(calendar(page)).not.toBeVisible();
  await expect(page.locator('#session-entry-dialog')).toBeVisible();
  await expect(page.locator('#entries-dialog')).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('2028-11-05');
  expect(await rawBundle(page)).toBe(raw);
  await page.locator('#session-entry-cancel').click();
  await expect(page.locator('#session-entry-dialog')).not.toBeVisible();
  await expect(page.locator('#entries-dialog')).toBeVisible();
  expect(await rawBundle(page)).toBe(raw);
});

for (const timezoneId of ['America/Los_Angeles', 'Pacific/Auckland']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('session ISO typing saves dates across DST without shifting day', async ({ page }) => {
      await load(page);
      await tab(page, 'Session');
      const input = page.locator('#session-date');
      for (const date of ['2028-03-12', '2028-04-02', '2028-11-05']) {
        const raw = await rawBundle(page);
        await input.fill(date);
        await expect(calendar(page)).not.toBeVisible();
        await expect(input).toHaveValue(date);
        expect(await rawBundle(page)).toBe(raw);
      }
      await page.locator('#session-position').fill('10');
      await tab(page, 'Add session');
      await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
      expect((await snapshot(page)).sessions.sessions.first[0].date).toBe('2028-11-05');
    });
  });
}

test('calendar assets are precached and actual controls survive network-blocked reload', async ({ page, context }) => {
  await load(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const assets = await page.evaluate(async () => {
    const keys = await caches.keys(), name = keys.find((key) => key.endsWith('-android-calendar-v1'));
    return (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname.split('/').at(-1));
  });
  expect(assets).toEqual(expect.arrayContaining(['android-calendar.js', 'android-calendar.css', 'android-controls.js']));
  await context.setOffline(true);
  await page.reload();
  const raw = await rawBundle(page);
  await page.locator('#session-date').fill('2028-11-07');
  await expect(calendar(page)).not.toBeVisible();
  await expect(page.locator('#session-date')).toHaveValue('2028-11-07');
  expect(await rawBundle(page)).toBe(raw);
  await selectFirst(page);
  await page.locator('#book-deadline-override').click();
  await expect(page.locator('#reading-calendar-month')).toHaveText('November 2030');
  await page.keyboard.press('Escape');
  await expect(page.locator('input[type="date"]:visible')).toHaveCount(0);
});
