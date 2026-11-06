const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const title = 'A long imported reading title with <em>literal markup</em> and enough words to expand beyond its spinner';

async function importBooks(page) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'android-select-regression-'));
  try {
    execFileSync('python', ['-c', `
import sys
from datetime import date, timedelta
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
today = date.today()
sections = [BookSection('Physical books', [Book(1, sys.argv[2], 1, 100, id='long'), Book(2, 'Short', 1, 100, id='short')], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [], [])]
write_json_bundle(sys.argv[1], sections, today, today + timedelta(days=30), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory, title]);
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await page.getByRole('button', { name: 'Session', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

for (const fallback of [false, true]) {
  for (const viewportWidth of [1280, 480]) {
    test(`${fallback ? 'fallback' : 'popover'} measures imported option content before painting at ${viewportWidth}px in nested modal`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewportWidth, height: 800 });
      await importBooks(page);
      const stored = await page.evaluate(() => localStorage.getItem(bundleKey));
      await page.getByRole('button', { name: 'Entries', exact: true }).click();
      await page.evaluate((fallback) => {
        const dialog = document.createElement('dialog');
        dialog.id = 'nested-spinner';
        const select = document.createElement('select');
        select.id = 'nested-book';
        select.setAttribute('aria-label', 'Nested book');
        select.append(...[...document.querySelector('#entries-book').options].map((option) => option.cloneNode(true)));
        dialog.append(select);
        document.querySelector('#entries-dialog').append(dialog);
        AndroidControls.select(select);
        dialog.showModal();
        const trigger = document.querySelector('#nested-book-trigger');
        Object.assign(trigger.style, { position: 'fixed', left: `${innerWidth > 1000 ? 24 : innerWidth - 190}px`, top: '100px', width: '180px' });
        if (fallback) {
          const popup = document.querySelector('#android-select-options');
          popup.showPopover = undefined;
          popup.hidePopover = undefined;
        }
      }, fallback);
      const combo = page.getByRole('combobox', { name: 'Nested book', exact: true });
      // Capture geometry synchronously with opening, not after a settling frame.
      const geometry = await combo.evaluate((trigger) => {
        trigger.click();
        const popup = document.querySelector('#android-select-options');
        const row = popup.firstElementChild;
        const style = getComputedStyle(row);
        const reference = document.createElement('span');
        reference.textContent = row.textContent;
        Object.assign(reference.style, { position: 'fixed', whiteSpace: 'nowrap', font: style.font, width: 'max-content' });
        document.body.append(reference);
        const naturalWidth = reference.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        reference.remove();
        return {
          popup: popup.getBoundingClientRect().toJSON(), anchor: trigger.getBoundingClientRect().toJSON(), naturalWidth,
          visibility: getComputedStyle(popup).visibility, popoverOpen: popup.hasAttribute('popover') && popup.matches(':popover-open'),
          parent: popup.parentElement.id,
        };
      });
      await testInfo.attach('popup-reference-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
      const expectedWidth = Math.min(Math.max(geometry.anchor.width - 16, geometry.naturalWidth), viewportWidth);
      expect(geometry.popup.width).toBeCloseTo(expectedWidth, 0);
      expect(geometry.popup.width).toBeGreaterThan(geometry.anchor.width);
      expect(geometry.popup.left).toBeCloseTo(Math.max(0, Math.min(geometry.anchor.left + 8, viewportWidth - expectedWidth)), 0);
      expect(geometry.popup.top).toBeCloseTo(geometry.anchor.top, 0);
      expect(geometry.popup.right).toBeLessThanOrEqual(viewportWidth);
      expect(geometry.visibility).toBe('visible');
      expect(geometry.popoverOpen).toBe(!fallback);
      expect(geometry.parent).toBe('nested-spinner');
      const popup = page.getByRole('listbox');
      await expect(popup.getByRole('option').first()).toContainText(title);
      await expect(popup.locator('em')).toHaveCount(0);
      if (viewportWidth === 1280) {
        expect(geometry.popup.width).toBeLessThan(viewportWidth);
        expect(await popup.getByRole('option').first().evaluate((row) => row.scrollWidth - row.clientWidth)).toBeLessThanOrEqual(1);
      } else {
        expect(geometry.popup.width).toBe(viewportWidth);
      }
      await combo.press('End');
      await combo.press('Escape');
      await expect(combo).toContainText(title);
      await expect(page.locator('#nested-spinner')).toBeVisible();
      await combo.press('Enter');
      await combo.press('End');
      await combo.press('Enter');
      await expect(combo).toContainText('Short');
      await expect(combo).toBeFocused();
      await expect(page.locator('#nested-book')).toHaveValue('short');
      expect(await page.evaluate(() => localStorage.getItem(bundleKey))).toBe(stored);
    });
  }
}

test('session book is internal state, not an extra accessible combobox', async ({ page }) => {
  await importBooks(page);
  await expect(page.locator('#session-form')).toBeVisible();
  await expect(page.locator('#session-book')).toBeHidden();
  await expect(page.locator('#session-book')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#session-book')).toHaveValue('long');
  const snapshot = await page.locator('#screen-session').ariaSnapshot();
  expect(snapshot).not.toContain('combobox');
  expect(snapshot).not.toContain('Reading session book');
  await expect(page.getByRole('button', { name: `Choose book ${title}`, exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Choose Physical books', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Choose book Short', exact: true }).click();
  await expect(page.locator('#session-book')).toHaveValue('short');
  await page.locator('#session-position').fill('10');
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
  await page.reload();
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const combo = page.getByRole('combobox', { name: 'Book', exact: true });
  await expect(combo).toHaveCount(1);
  await combo.click();
  await page.getByRole('option', { name: 'Physical books - 2. Short', exact: true }).click();
  await expect(page.locator('#history-list')).toContainText('10');
});
