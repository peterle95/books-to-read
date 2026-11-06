const { test, expect } = require('@playwright/test');

test('four tabs show one screen at a time and preserve an unsaved plan draft', async ({ page }) => {
  await page.goto('./');
  const tabs = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(page.locator('main > .screen:not([hidden])')).toHaveCount(1);
  await expect(page.locator('#screen-session')).toBeVisible();
  await tabs.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Reading schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next quarter' })).toBeVisible();
  await page.getByLabel('Reading plan').fill('Unsaved draft');
  await tabs.getByRole('button', { name: 'Books' }).click();
  await expect(page.locator('#screen-plan')).toBeHidden();
  await expect(page.locator('#screen-books')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reading schedule' })).toBeHidden();
  await tabs.getByRole('button', { name: 'Charts' }).click();
  await tabs.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByLabel('Reading plan')).toHaveValue('Unsaved draft');
  await expect(page.locator('main > .screen:not([hidden])')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.reload();
  await tabs.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByLabel('Reading plan')).toHaveValue('Unsaved draft');
});

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
