const { test, expect } = require('@playwright/test');

test('format spinner is the sole labelled visible control; commit, cancel and Tab preserve semantics', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await writeBundleFiles({
      'plan.json': { schema_version: 2, start_date: '2028-01-01', end_date: '2028-03-31', end_label: 'Quarter end', rest_days: [] },
      'books.json': { schema_version: 2, sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({ label, books: [], simultaneous_groups: [] })) },
      'sessions.json': { schema_version: 2, sessions: {} },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Books', exact: true }).click();
  const combo = page.getByRole('combobox', { name: 'Format', exact: true });
  await expect(combo).toHaveCount(1);
  await expect(page.locator('#book-format')).toBeHidden();
  await expect(combo).toHaveText('Physical books');
  await expect(combo).toHaveCSS('min-height', '48px');
  await expect(combo).toHaveCSS('font-size', '15px');
  await combo.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await combo.press('End');
  await combo.press('Escape');
  await expect(combo).toHaveText('Physical books');
  await combo.click();
  await combo.press('a');
  await combo.press('Enter');
  await expect(combo).toHaveText('Audiobooks');
  await expect(page.locator('#book-from-label')).toHaveText('Start time');
  await combo.click();
  await combo.press('Home');
  await combo.press('Tab');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(combo).toHaveText('Audiobooks');
  await expect(combo).not.toBeFocused();
  await combo.click();
  await page.getByRole('heading', { name: 'Reading Plan', exact: true }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await combo.click();
  await page.getByRole('option', { name: 'Digital books', exact: true }).click();
  await expect(combo).toHaveText('Digital books');
  await expect(combo).toBeFocused();
  await expect(page.locator('select:not([hidden]):not(.visually-hidden)')).toHaveCount(0);
});

test('all screens and selection dialogs expose no visible native select', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await writeBundleFiles({
      'plan.json': { schema_version: 2, start_date: '2028-01-01', end_date: '2028-03-31', end_label: 'Quarter end', rest_days: [] },
      'books.json': { schema_version: 2, sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({ label, books: [], simultaneous_groups: [] })) },
      'sessions.json': { schema_version: 2, sessions: {} },
    });
  });
  await page.reload();
  const noNativeSelect = async () => {
    // Session uses format/book buttons; its visually-hidden backing select is intentional.
    for (const select of await page.locator('select:not(#session-book)').all()) await expect(select).toBeHidden();
  };
  for (const name of ['Session', 'Books', 'Plan', 'Charts']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await noNativeSelect();
  }
  await page.getByRole('button', { name: 'Metrics', exact: true }).click();
  await noNativeSelect();
  await page.getByRole('dialog', { name: 'Reading metrics' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await noNativeSelect();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Session', exact: true }).click();
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  await noNativeSelect();
  await expect(page.getByRole('dialog', { name: 'Reading history' }).getByRole('combobox', { name: 'Book', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
  await noNativeSelect();
  await expect(page.locator('#quarter-dialog').getByRole('combobox', { name: 'Format', exact: true })).toBeVisible();
});

test('shared bounded listbox works in modal, skips disabled options, scrolls and explicitly syncs replacements', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'spinner-test';
    const label = document.createElement('label');
    label.htmlFor = 'test-select'; label.textContent = 'Test spinner';
    const input = document.createElement('select');
    input.id = input.name = 'test-select';
    input.append(...Array.from({ length: 30 }, (_, index) => new Option(`Choice ${index}`, String(index))));
    input.options[1].disabled = true;
    dialog.append(label, input);
    document.body.append(dialog);
    AndroidControls.select(input);
    dialog.showModal();
  });
  const combo = page.getByRole('combobox', { name: 'Test spinner' });
  await combo.click();
  await combo.press('ArrowDown');
  await combo.press('Enter');
  await expect(combo).toHaveText('Choice 2');
  await combo.click();
  await combo.press('End');
  const popup = page.getByRole('listbox');
  expect(await popup.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const box = await popup.boundingBox();
  expect(box.height).toBeLessThanOrEqual(288);
  await combo.press('Enter');
  await expect(combo).toHaveText('Choice 29');
  await combo.click();
  await combo.press('Escape');
  await expect(page.locator('#spinner-test')).toBeVisible();
  await page.evaluate(() => {
    const input = document.querySelector('#test-select');
    input.replaceChildren(new Option('Loaded', 'loaded'));
    input.disabled = true;
    AndroidControls.syncSelect(input);
  });
  await expect(combo).toHaveText('Loaded');
  await expect(combo).toBeDisabled();
  await expect(page.locator('.android-select-popup')).toHaveCount(1);
  // The same modal-owned listbox remains usable without the Popover API.
  await page.evaluate(() => {
    const popup = document.querySelector('.android-select-popup');
    popup.showPopover = undefined;
    popup.hidePopover = undefined;
    const input = document.querySelector('#test-select');
    input.disabled = false;
    input.append(new Option('Fallback choice', 'fallback'));
    AndroidControls.syncSelect(input);
  });
  await combo.click();
  await page.getByRole('option', { name: 'Fallback choice', exact: true }).click();
  await expect(combo).toHaveText('Fallback choice');
  await expect(combo).toBeFocused();
});
