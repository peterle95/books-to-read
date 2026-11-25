const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('four tabs show one screen at a time', async ({ page }) => {
  await page.goto('./');
  const tabs = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(page.locator('main > .screen:not([hidden])')).toHaveCount(1);
  await expect(page.locator('#screen-session')).toBeVisible();
  await tabs.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Reading schedule' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Plan next quarter' })).toBeVisible();
  await tabs.getByRole('button', { name: 'Books' }).click();
  await expect(page.locator('#screen-plan')).toBeHidden();
  await expect(page.locator('#screen-books')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reading schedule' })).toBeHidden();
  await tabs.getByRole('button', { name: 'Charts' }).click();
  await expect(page.locator('#screen-charts')).toBeVisible();
  await tabs.getByRole('button', { name: 'Plan' }).click();
  await expect(page.locator('#screen-plan')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reading schedule' })).toBeHidden();
  await expect(page.locator('main > .screen:not([hidden])')).toHaveCount(1);
});

for (const width of [320, 1440]) {
  test(`Plan sections switch independently and reset on re-entry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    const main = page.getByRole('navigation', { name: 'Main navigation' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(['plan', 'books', 'sessions', 'manifest'].map((name) =>
      path.join(__dirname, '..', 'fixtures', 'issue-45-populated', `${name}.json`)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.locator('#source-status')).toHaveText('JSON loaded in this browser. Transfers are manual.');
    const sections = page.getByRole('navigation', { name: 'Plan sections' });
    const plan = sections.getByRole('button', { name: 'Plan', exact: true });
    const schedule = sections.getByRole('button', { name: 'Reading schedule' });
    const projections = sections.getByRole('button', { name: 'Reading projections' });
    await main.getByRole('button', { name: 'Plan' }).click();
    await expect(plan).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#plan-rest')).toBeVisible();
    await expect(page.locator('#plan-book-count')).toContainText('in progress');
    await schedule.focus();
    await page.keyboard.press('Enter');
    await expect(schedule).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#plan-schedule')).toBeVisible();
    await expect(page.locator('#schedule-table')).toBeVisible();
    await expect(page.locator('#schedule-rows input, #schedule-rows button')).toHaveCount(0);
    await expect(page.locator('#plan-setup')).toBeHidden();
    await expect(page.locator('#plan-rest')).toBeHidden();
    await projections.click();
    await expect(projections).toHaveAttribute('aria-pressed', 'true');
    await expect(schedule).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#plan-projections')).toBeVisible();
    await expect(page.locator('#projection-table')).toBeVisible();
    await expect(page.locator('#plan-schedule')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await main.getByRole('button', { name: 'Books' }).click();
    await main.getByRole('button', { name: 'Plan' }).click();
    await expect(plan).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#plan-projections')).toBeHidden();
    await schedule.click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(plan).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#plan-schedule')).toBeHidden();
  });
}

test('settings remain accessible by keyboard and return to the previous tab', async ({ page }) => {
  await page.goto('./');
  const tabs = page.getByRole('navigation', { name: 'Main navigation' });
  await tabs.getByRole('button', { name: 'Books' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-settings')).toBeVisible();
  await expect(page.getByLabel('Bundle files')).toBeVisible();
  await expect(page.getByLabel('CSV plan file')).toBeVisible();
  await expect(page.locator('#screen-books')).toBeHidden();
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#screen-books')).toBeVisible();
  await expect(tabs.getByRole('button', { name: 'Books' })).toHaveAttribute('aria-current', 'page');
});
