const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const chooseBook = async (page, id) => {
  await page.locator('#open-book-picker').click();
  await page.locator(`#book-picker-choices input[data-book-id="${id}"]`).click();
};

test('Books moves groups as blocks, rejects split insertions, completes audio and round-trips', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'books-parity-'));
  try {
    execFileSync('python', ['-c', `
import sys
from datetime import date, timedelta
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
today = date.today()
sections = [BookSection('Physical books', [Book(1, 'A', 1, 8, id='a'), Book(2, 'B', 1, 8, id='b'), Book(3, 'C', 1, 8, id='c')], [(1, 2)]),
            BookSection('Digital books', [Book(1, 'Digital', 1, 4, id='digital')], []),
            BookSection('Audiobooks', [Book(1, 'Audio', 0, 8, id='audio')], [])]
write_json_bundle(sys.argv[1], sections, today, today + timedelta(days=3), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await page.getByRole('button', { name: 'Books', exact: true }).click();
    await expect(page.locator('#today-reading section')).toHaveCount(3);
    await expect(page.locator('#today-reading')).toContainText('Audiobooks');
    const snapshot = () => page.evaluate(() => readBundleFiles());
    await chooseBook(page, 'b');
    await page.getByRole('button', { name: 'Insert Before' }).click();
    await expect(page.getByTestId('editor-status')).toContainText('simultaneous group');
    expect((await snapshot()).books.sections[0].books.map((book) => book.id)).toEqual(['a', 'b', 'c']);
    await page.getByRole('button', { name: 'Move Down' }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book moved.');
    expect((await snapshot()).books.sections[0]).toMatchObject({ simultaneous_groups: [['a', 'b']] });
    expect((await snapshot()).books.sections[0].books.map((book) => book.id)).toEqual(['c', 'a', 'b']);
    await chooseBook(page, 'a');
    await page.getByRole('button', { name: 'Move Up' }).click();
    expect((await snapshot()).books.sections[0].books.map((book) => book.id)).toEqual(['a', 'b', 'c']);
    await page.getByRole('button', { name: 'Cancel book edit' }).click();
    await page.getByRole('combobox', { name: 'Format', exact: true }).click();
    await page.getByRole('option', { name: 'Audiobooks', exact: true }).click();
    await chooseBook(page, 'audio');
    await page.getByRole('button', { name: 'Complete Selected' }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book completed.');
    const data = await snapshot();
    expect(data.books.sections[2].books[0].remaining_time_seconds).toBe(0);
    expect(data.sessions.sessions.audio.at(-1)).toMatchObject({ remaining_time_seconds: 0, date: await page.evaluate(() => ReadingSchedule.today()) });
    await page.getByRole('button', { name: 'Clear groups' }).click();
    expect((await snapshot()).books.sections[0].simultaneous_groups).toEqual([['a', 'b']]);
    await page.getByRole('button', { name: 'Cancel book edit' }).click();
    await page.getByRole('combobox', { name: 'Format', exact: true }).click();
    await page.getByRole('option', { name: 'Physical books', exact: true }).click();
    await chooseBook(page, 'a');
    await page.getByRole('button', { name: 'Clear groups' }).click();
    expect((await snapshot()).books.sections[0].simultaneous_groups).toEqual([]);
    await page.getByRole('button', { name: 'Insert Before' }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
    expect((await snapshot()).books.sections[0].books.map((book) => book.id).slice(1)).toEqual(['a', 'b', 'c']);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
    const download = await downloadPromise;
    execFileSync('python', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', await download.path(), directory]);
    await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    expect((await snapshot()).books.sections[0].simultaneous_groups).toEqual([]);
    expect((await snapshot()).books.sections[0].books.map((book) => book.id).slice(1)).toEqual(['a', 'b', 'c']);
    expect((await snapshot()).sessions.sessions.audio.at(-1).remaining_time_seconds).toBe(0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('today reading uses remaining work for three formats and skips rest days', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() => {
    const plan = { start_date: '2026-01-01', end_date: '2026-01-04', rest_days: [{ start_date: '2026-01-02', end_date: '2026-01-02' }] };
    const books = { sections: ['Physical books', 'Digital books', 'Audiobooks'].map((label, index) => ({
      label, simultaneous_groups: [], books: [{ id: `book${index}`, title: label, start_page: 1, end_page: 3,
        start_time_seconds: 0, end_time_seconds: 9, current_page: null, current_time_seconds: null }],
    })) };
    return [1, 2, 3].map((day) => Object.fromEntries(books.sections.map((section) =>
      [section.label, ReadingSchedule.todayReading(plan, books, section.label, `2026-01-0${day}`)[section.books[0].id].value])));
  });
  expect(result[0]).toEqual({ 'Physical books': '1', 'Digital books': '1', Audiobooks: '0:00:03' });
  expect(result[1]).toEqual({ 'Physical books': '0', 'Digital books': '0', Audiobooks: '0:00' });
  expect(result[2]).toEqual({ 'Physical books': '2', 'Digital books': '2', Audiobooks: '0:00:05' });
});
