const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('session targets and completion track recorded, corrected and deleted progress in both formats', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-session-parity-'));
  try {
    execFileSync('python', ['-c', `
import sys
from datetime import date, timedelta
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
today = date.today()
books = [BookSection('Physical books', [Book(1, 'Paper', 1, 8, id='paper')], []),
         BookSection('Digital books', [], []),
         BookSection('Audiobooks', [Book(1, 'Audio', 10, 18, id='audio')], [])]
write_json_bundle(sys.argv[1], books, today, today + timedelta(days=3), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await page.getByRole('button', { name: 'Session', exact: true }).click();
    const today = await page.evaluate(() => window.ReadingSchedule.today());
    const getBook = (id) => page.evaluate((bookId) => readBundleFiles().books.sections.flatMap((section) => section.books).find((book) => book.id === bookId), id);
    const bookInput = page.locator('#session-book');
    const position = page.locator('#session-position');
    const edit = async (id, date) => {
      await page.getByRole('button', { name: 'Entries', exact: true }).click();
      await page.locator('#entries-dialog').getByRole('combobox', { name: 'Book', exact: true }).click();
      await page.getByRole('option', { name: id === 'paper' ? 'Physical books - 1. Paper' : 'Audiobooks - 1. Audio', exact: true }).click();
      await page.getByRole('button', { name: `Edit session ${id === 'paper' ? 'Paper' : 'Audio'} ${date}` }).click();
    };
    const remove = async (id, date) => {
      await page.getByRole('button', { name: 'Entries', exact: true }).click();
      await page.locator('#entries-dialog').getByRole('combobox', { name: 'Book', exact: true }).click();
      await page.getByRole('option', { name: id === 'paper' ? 'Physical books - 1. Paper' : 'Audiobooks - 1. Audio', exact: true }).click();
      await page.getByRole('button', { name: `Delete session ${id === 'paper' ? 'Paper' : 'Audio'} ${date}` }).click();
      await page.getByRole('dialog', { name: 'Delete entry?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    };

    await page.getByRole('button', { name: 'Choose book Paper' }).click();
    await expect(page.locator('#session-form')).toContainText(/Target page\s*2/);
    await expect(page.locator('#session-form')).toContainText(/Pages per day\s*2/);
    await position.fill('2');
    await page.getByRole('button', { name: 'Add session' }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
    expect((await getBook('paper')).target_completed_date).toBe(today);

    await edit('paper', today);
    await page.locator('#session-entry-position').fill('1');
    await page.locator('#session-entry-save').click();
    expect((await getBook('paper')).target_completed_date).toBeNull();
    await page.locator('#close-entries').click();
    await edit('paper', today);
    await page.locator('#session-entry-position').fill('8');
    await page.locator('#session-entry-save').click();
    await page.locator('#close-entries').click();
    await expect(page.locator('#session-form')).toContainText(/Target page\s*8/);
    await remove('paper', today);
    expect((await getBook('paper')).current_page).toBeNull();

    const yesterday = await page.evaluate(() => window.ReadingSchedule.iso(window.ReadingSchedule.parseDate(window.ReadingSchedule.today()) - 1));
    await page.locator('#session-date').fill(yesterday);
    await expect(page.locator('#session-form')).toContainText(/Target page\s*1/);
    await position.fill('1');
    await page.getByRole('button', { name: 'Add session' }).click();
    expect((await getBook('paper')).target_completed_date).toBeNull();
    await remove('paper', yesterday);

    await page.getByRole('button', { name: 'Choose Audiobooks' }).click();
    await expect(bookInput).toHaveValue('audio');
    await expect(page.locator('#session-form')).toContainText(/Target time left\s*0:00:06/);
    await expect(page.locator('#session-form')).toContainText(/Time per day\s*0:00:02/);
    await position.fill('6');
    await page.getByRole('button', { name: 'Add session' }).click();
    expect((await getBook('audio')).target_completed_date).toBe(today);
    await remove('audio', today);
    expect((await getBook('audio')).target_completed_date).toBeNull();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
