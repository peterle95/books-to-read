const { test, expect } = require('@playwright/test');

test('a reading plan survives reload and an offline reopening', async ({ page, context }) => {
  await page.goto('./');
  await page.getByLabel('Reading plan').fill('Read The Hobbit');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.getByRole('status')).toHaveText('Plan saved on this device.');
  await page.reload();
  await expect(page.getByLabel('Reading plan')).toHaveValue('Read The Hobbit');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('./');
  await expect(reopened.getByLabel('Reading plan')).toHaveValue('Read The Hobbit');
  await reopened.getByLabel('Reading plan').fill('Read Dune');
  await reopened.getByRole('button', { name: 'Save plan' }).click();
  await reopened.reload();
  await expect(reopened.getByLabel('Reading plan')).toHaveValue('Read Dune');
});
