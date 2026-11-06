const { test, expect } = require('@playwright/test');

const seed = async (page) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await writeBundleFiles({
      'plan.json': { schema_version: 2, start_date: '2028-01-01', end_date: '2028-03-31', end_label: 'Quarter end', rest_days: [],
        stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true } },
      'books.json': { schema_version: 2, sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({
        label, simultaneous_groups: [], baseline_needs_recalculation: false,
        books: label === 'Physical books' ? [{ id: 'paper', number: 1, title: 'Paper', start_page: 1, end_page: 100,
          baseline_schedule: { start_date: '2028-01-01', deadline: '2028-03-31', daily_target: 100 / 91 } }] : [],
      })) },
      'sessions.json': { schema_version: 2, sessions: { paper: [] } },
    });
  });
  await page.reload();
  await expect(page.locator('#session-form')).toBeVisible();
};
const snapshot = (page) => page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));

test('visible ISO typing validates actual dates before writes and refreshes session targets', async ({ page }) => {
  await seed(page);
  const date = page.locator('#session-date');
  await expect(date).toHaveAttribute('type', 'text');
  await expect(date).toHaveAttribute('data-date-mode', 'text');
  await date.fill('');
  await date.pressSequentially('2028-02-28');
  const target = page.locator('.session-metrics strong').first();
  const beforeTarget = await target.textContent();
  await date.fill('2028-02-29');
  await expect(target).not.toHaveText(beforeTarget);
  await date.evaluate((input) => { input.value = '2028-02-28'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(target).toHaveText(beforeTarget);
  await page.locator('#session-position').fill('10');
  const before = await snapshot(page);
  for (const invalid of ['2027-02-29', '2028-04-31', '2028-2-29', '2028-02-29x', '']) {
    await date.fill(invalid);
    await expect(target).toHaveText('-');
    await page.locator('#save-session').click();
    expect(await snapshot(page)).toBe(before);
    expect(await date.evaluate((input) => input.checkValidity())).toBe(false);
  }
  // Assignment without input/change is still checked before the submit handler.
  await date.fill('2028-02-29');
  await date.evaluate((input) => { input.value = '2028-02-30'; });
  await page.locator('#save-session').click();
  expect(await snapshot(page)).toBe(before);
  await page.locator('#session-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(await snapshot(page)).toBe(before);
  await date.fill('2028-02-29');
  await page.locator('#save-session').click();
  await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
  expect(await page.evaluate(() => readBundleFiles().sessions.sessions.paper[0].date)).toBe('2028-02-29');

  await page.locator('#open-entries').click();
  await page.getByRole('button', { name: /Edit session Paper/ }).click();
  const entry = page.locator('#session-entry-date');
  await expect(entry).toHaveValue('2028-02-29');
  await entry.fill('2028-02-30');
  const saved = await snapshot(page);
  await page.locator('#session-entry-save').click();
  await expect(page.locator('#session-entry-dialog')).toBeVisible();
  expect(await snapshot(page)).toBe(saved);
  await page.locator('#session-entry-cancel').click();
  await page.getByRole('button', { name: /Edit session Paper/ }).click();
  expect(await entry.evaluate((input) => input.checkValidity())).toBe(true);
  await page.locator('#session-entry-cancel').click();
  await page.getByRole('button', { name: /Delete session Paper/ }).click();
  await expect(entry).toBeDisabled();
  await page.locator('#session-entry-save').click();
  await expect(page.locator('#session-entry-dialog')).not.toBeVisible();
});

test('create-plan and plan date text reject impossible dates without changing the bundle', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const before = await snapshot(page);
  await page.locator('#plan-start').fill('2028-02-30');
  await page.getByRole('button', { name: 'Save plan dates', exact: true }).click();
  expect(await snapshot(page)).toBe(before);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#new-plan').click();
  await page.locator('#create-plan-start').fill('2028-02-29');
  await page.locator('#create-plan-finish').fill('2028-04-31');
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  expect(await snapshot(page)).toBe(before);
  await page.locator('#create-plan-finish').fill('2028-03-31');
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  await expect(page.locator('#new-plan-status')).toHaveText('Plan recalculated.');
});

test('ISO control preserves required, disabled, ID and form values; sync handles programmatic loads', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.id = input.name = 'test-date';
    input.required = true;
    form.append(input);
    document.body.append(form);
    const same = AndroidControls.date(input, { mode: 'text' }) === input;
    const required = !AndroidControls.sync(input, '');
    const invalid = !AndroidControls.sync(input, '1900-02-29');
    input.disabled = true;
    const disabled = AndroidControls.sync(input) && !new FormData(form).has(input.name);
    input.disabled = false;
    const valid = AndroidControls.sync(input, '2000-02-29');
    return { same, required, invalid, disabled, valid, id: input.id, requiredAttribute: input.required,
      value: new FormData(form).get(input.name) };
  });
  expect(result).toEqual({ same: true, required: true, invalid: true, disabled: true, valid: true,
    id: 'test-date', requiredAttribute: true, value: '2000-02-29' });
});

test('legacy ISO years are preserved, while year zero has explicit invalid feedback and no write', async ({ page }) => {
  await seed(page);
  await page.locator('#session-date').fill('0099-02-28');
  await page.locator('#session-position').fill('10');
  await page.locator('#save-session').click();
  await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
  expect(await page.evaluate(() => readBundleFiles().sessions.sessions.paper[0].date)).toBe('0099-02-28');
  const before = await snapshot(page);
  // Match the existing bundle/Python date contract, not JavaScript's year-zero support.
  await page.locator('#session-date').fill('0000-02-29');
  await page.locator('#session-position').fill('20');
  await page.locator('#save-session').click();
  expect(await page.locator('#session-date').evaluate((input) => input.validationMessage)).toBe('Enter a real date as YYYY-MM-DD.');
  expect(await snapshot(page)).toBe(before);
});

test('bundle years survive text parsing, schedule calculation and four-file saves unchanged', async ({ page }) => {
  await seed(page);
  const dates = ['0001-01-01', '0004-02-29', '0096-02-29', '0099-12-31', '0100-03-01', '9999-12-31'];
  for (const value of dates) {
    await page.locator('#session-date').fill(value);
    expect(await page.locator('#session-date').evaluate((input) => input.checkValidity())).toBe(true);
    const saved = await page.evaluate(async (value) => {
      const api = ReadingSchedule, current = readBundleFiles();
      if (AndroidControls.parseDate(value) !== api.parseDate(value)) throw new Error('Date parsers disagree');
      const sections = api.sectionsFromBooksFile(current.books);
      const baselines = api.calculateBaselines(sections, value, value, []);
      current.books.sections[0].books[0].baseline_schedule = {
        start_date: baselines.paper.startDate, deadline: baselines.paper.deadline, daily_target: baselines.paper.dailyTarget,
      };
      await writeBundleFiles({ 'plan.json': { ...current.plan, start_date: value, end_date: value }, 'books.json': current.books });
      return { date: api.iso(api.parseDate(value)), plan: readBundleFiles().plan, baseline: readBundleFiles().books.sections[0].books[0].baseline_schedule };
    }, value);
    expect(saved.date).toBe(value);
    expect(saved.plan.start_date).toBe(value);
    expect(saved.plan.end_date).toBe(value);
    expect(saved.baseline).toEqual({ start_date: value, deadline: value, daily_target: 100 });
  }
  const before = await snapshot(page);
  for (const value of ['0000-02-29', '0100-02-29']) {
    const errors = await page.evaluate(async (value) => {
      const messages = [];
      for (const parse of [AndroidControls.parseDate, ReadingSchedule.parseDate]) {
        try { parse(value); } catch (error) { messages.push(error.message); }
      }
      try { await writeBundleFiles({ 'plan.json': { ...readBundleFiles().plan, start_date: value } }); }
      catch (error) { messages.push(error.message); }
      return messages;
    }, value);
    expect(errors).toHaveLength(3);
    expect(await snapshot(page)).toBe(before);
  }
  expect(await page.evaluate(() => ReadingSchedule.iso(ReadingSchedule.parseDate('0001-1-1')))).toBe('0001-01-01');
});

test('the ISO controls module is precached for offline reload', async ({ page, context }) => {
  await seed(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Seed reload can overlap clients.claim(); navigate under the now-active worker
  // before disconnecting, rather than waiting for a claim already missed.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#session-date').fill('2027-02-29');
  expect(await page.locator('#session-date').evaluate((input) => input.validity.customError)).toBe(true);
});

for (const timezoneId of ['America/Los_Angeles', 'Pacific/Auckland']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('UTC component arithmetic validates bundle years 1–9999 without local rollover', async ({ page }) => {
      await page.goto('./');
      expect(await page.evaluate(() => ['0001-01-01', '0004-02-29', '0096-02-29', '0099-12-31', '0100-03-01', '2000-02-29', '2028-02-29', '9999-12-31'].map((value) =>
        new Date(AndroidControls.parseDate(value) * 86400000).toISOString().slice(0, 10))))
        .toEqual(['0001-01-01', '0004-02-29', '0096-02-29', '0099-12-31', '0100-03-01', '2000-02-29', '2028-02-29', '9999-12-31']);
      for (const value of ['0000-02-29', '0001-02-29', '0100-02-29', '1900-02-29', '2100-02-29', '2028-13-01', '2028-00-01', '2028-01-00']) {
        expect(await page.evaluate((date) => {
          try { AndroidControls.parseDate(date); return false; } catch { return true; }
        }, value)).toBe(true);
      }
    });
  });
}
