const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

for (const audio of [false, true]) {
  for (const change of [
    { name: 'title only', from: 10, to: 30, position: 20 },
    { name: 'blank fields retain saved values', from: 10, to: 30, position: 20, blank: true },
    { name: 'start inside progress', from: 15, to: 30, position: 20 },
    { name: 'start past progress', from: 25, to: 30, position: null },
    { name: 'end inside progress', from: 10, to: 25, position: 20 },
    { name: 'end before progress', from: 10, to: 15, position: null },
  ]) {
    test(`${audio ? 'audio' : 'page'} replacement: ${change.name}`, async ({ page }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'book-replacement-'));
      try {
        execFileSync('python', ['-c', `
import sys
from datetime import date, timedelta
from reading_plan import BaselineSchedule, Book, BookSection, ReadingSession, SummaryStatsOptions, write_json_bundle
today = date.today()
sections = []
for label in ['Physical books', 'Digital books', 'Audiobooks']:
    audio = label == 'Audiobooks'
    book = Book(1, label, 10, 30, id=label, current_page=20,
                reading_sessions=[ReadingSession(today, 20, 10 if audio else 11, id=label + '-session')],
                baseline_schedule=BaselineSchedule(today, today + timedelta(days=10), 2),
                target_completed_date=today)
    sections.append(BookSection(label, [book, Book(2, 'Partner', 10, 30, id=label + '-partner',
        baseline_schedule=BaselineSchedule(today, today + timedelta(days=10), 2))], [(1, 2)]))
write_json_bundle(sys.argv[1], sections, today, today + timedelta(days=10), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
        await page.goto('./');
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const importBundle = async () => {
          await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
          page.once('dialog', (dialog) => dialog.accept());
          await page.getByRole('button', { name: 'Import bundle' }).click();
          await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
        };
        await importBundle();
        const snapshot = () => page.evaluate(() => readBundleFiles());
        const before = await snapshot();
        const label = audio ? 'Audiobooks' : 'Physical books';
        const index = audio ? 2 : 0;
        await page.getByRole('button', { name: 'Books', exact: true }).click();
        await page.getByRole('combobox', { name: 'Format', exact: true }).click();
        await page.getByRole('option', { name: label, exact: true }).click();
        await page.locator('#open-book-picker').click();
        await page.getByRole('dialog', { name: 'Choose a book to edit' }).getByRole('radio', { name: `1. ${label}`, exact: true }).click();
        await page.locator('#book-title').fill(change.blank ? '   ' : 'Replacement');
        await page.locator('#book-from').fill(change.blank ? '   ' : audio ? `0:00:${change.from}` : String(change.from));
        await page.locator('#book-to').fill(change.blank ? '   ' : audio ? `0:00:${change.to}` : String(change.to));
        // Native replacement does not ask for confirmation, including destructive range changes.
        const dialogs = [];
        const dismissDialog = async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); };
        page.on('dialog', dismissDialog);
        await page.getByRole('button', { name: 'Replace Selected', exact: true }).click();
        await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
        page.off('dialog', dismissDialog);
        expect(dialogs).toEqual([]);
        const after = await snapshot();
        const section = after.books.sections[index];
        expect(section.books.map((book) => book.id)).toEqual(before.books.sections[index].books.map((book) => book.id));
        expect(section.simultaneous_groups).toEqual(before.books.sections[index].simultaneous_groups);
        const book = section.books[0];
        expect(book.baseline_schedule).toEqual(before.books.sections[index].books[0].baseline_schedule);
        expect(section.books[1].baseline_schedule).toEqual(before.books.sections[index].books[1].baseline_schedule);
        expect(section.baseline_needs_recalculation).toBe(true);
        expect(book).toMatchObject({ id: label, number: 1, title: change.blank ? label : 'Replacement', target_completed_date: before.books.sections[index].books[0].target_completed_date });
        expect(book[audio ? 'start_time_seconds' : 'start_page']).toBe(change.from);
        expect(book[audio ? 'end_time_seconds' : 'end_page']).toBe(change.to);
        expect(book[audio ? 'current_time_seconds' : 'current_page']).toBe(change.position);
        expect(book[audio ? 'time_listened_seconds' : 'pages_read']).toBe(change.position === null ? 0 : change.position - change.from + (audio ? 0 : 1));
        if (audio) expect(book.remaining_time_seconds).toBe(change.position === null ? null : change.to - change.position);
        expect(after.sessions.sessions[label]).toEqual(change.from === 10 && change.to === 30 ? before.sessions.sessions[label] : []);
        for (const other of before.books.sections.filter((entry) => entry.label !== label)) {
          expect(after.sessions.sessions[other.books[0].id]).toEqual(before.sessions.sessions[other.books[0].id]);
        }
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export bundle ZIP' }).click();
        const download = await downloadPromise;
        execFileSync('python', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', await download.path(), directory]);
        await importBundle();
        const imported = await snapshot();
        expect(imported.books).toEqual(after.books);
        expect(imported.sessions).toEqual(after.sessions);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
  }
}
