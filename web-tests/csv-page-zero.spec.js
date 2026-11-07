const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const raw = (page) => page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
const read = (page) => page.evaluate(() => readBundleFiles());
const desktopCsv = (file) => execFileSync('python', ['-c', `
import sys
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, build_section_plans, write_csv
s = [
    BookSection('Physical books', [Book(1, 'Zero start paper', 0, 100, current_page=10)], []),
    BookSection('Digital books', [Book(1, 'Zero start digital', 0, 0)], []),
    BookSection('Audiobooks', [], []),
]
plans, total, pace, status = build_section_plans(s, date(2026, 10, 1), date(2026, 12, 31), [])
write_csv(sys.argv[1], plans, date(2026, 10, 1), date(2026, 12, 31), total, pace, status, 'Quarter end',
          SummaryStatsOptions(True, True, True, True, True), [])
`, file]);

test('page-zero physical and digital books survive CSV import, export and reimport', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-zero-'));
  try {
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const desktop = path.join(directory, 'desktop.csv');
    desktopCsv(desktop);
    await page.getByLabel('CSV plan file').setInputFiles(desktop);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import CSV plan', exact: true }).click();
    await expect(page.getByTestId('csv-status')).toHaveText('CSV plan imported. Reading history is not included in CSV.');
    const imported = await read(page);
    expect(imported.books.sections[0].books.map((book) => [book.title, book.start_page, book.end_page, book.pages])).toEqual([['Zero start paper', 0, 100, 101]]);
    expect(imported.books.sections[1].books.map((book) => [book.title, book.start_page, book.end_page, book.pages])).toEqual([['Zero start digital', 0, 0, 1]]);
    expect(imported.books.sections[0].books[0].current_page).toBe(10);

    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV plan', exact: true }).click();
    const exported = path.join(directory, 'web.csv');
    await (await download).saveAs(exported);
    execFileSync('python', ['-c', `
import sys
from reading_plan import load_csv_plan
sections = load_csv_plan(sys.argv[1])[0]
assert [(b.title, b.start_page, b.end_page, b.current_page) for b in sections[0].books] == [('Zero start paper', 0, 100, 10)]
assert [(b.title, b.start_page, b.end_page, b.current_page) for b in sections[1].books] == [('Zero start digital', 0, 0, None)]
`, exported]);

    // The app must accept the CSV it just wrote for a page-zero book.
    await page.getByLabel('CSV plan file').setInputFiles(exported);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import CSV plan', exact: true }).click();
    await expect(page.getByTestId('csv-status')).toHaveText('CSV plan imported. Reading history is not included in CSV.');
    const reimported = await read(page);
    expect(reimported.books.sections[0].books.map((book) => [book.start_page, book.end_page, book.current_page, book.pages_read])).toEqual([[0, 100, 10, 11]]);
    expect(reimported.books.sections[1].books.map((book) => [book.start_page, book.end_page, book.current_page])).toEqual([[0, 0, null]]);

    // A negative or reversed range is still rejected and leaves the bundle untouched.
    const unchanged = await raw(page);
    const table = ['"Physical books"', '"Book","Title","Start page","End page","Current page","Pages","Read pages"'];
    const header = ['"Reading plan"', '"Start date","2026-10-01"', '"Quarter end","2026-12-31"'];
    const negative = path.join(directory, 'negative.csv');
    fs.writeFileSync(negative, [...header, ...table, '1,"Negative start",-5,10,"",16,0'].join('\r\n'));
    await page.getByLabel('CSV plan file').setInputFiles(negative);
    await page.getByRole('button', { name: 'Import CSV plan', exact: true }).click();
    await expect(page.getByTestId('csv-status')).toHaveText('CSV could not be imported: Use whole page numbers.');
    expect(await raw(page)).toBe(unchanged);
    const reversed = path.join(directory, 'reversed.csv');
    fs.writeFileSync(reversed, [...header, ...table, '1,"Reversed",20,10,"",1,0'].join('\r\n'));
    await page.getByLabel('CSV plan file').setInputFiles(reversed);
    await page.getByRole('button', { name: 'Import CSV plan', exact: true }).click();
    await expect(page.getByTestId('csv-status')).toHaveText('CSV could not be imported: Each book needs a title and valid range.');
    expect(await raw(page)).toBe(unchanged);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
