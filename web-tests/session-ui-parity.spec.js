const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('session choices and entries sheet group, edit and delete cross-format history', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-session-ui-'));
  try {
    execFileSync('python', ['-c', `
import sys
from datetime import date, timedelta
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
today = date.today()
sections = [BookSection('Physical books', [Book(1, 'Paper', 1, 100, id='paper')], []),
            BookSection('Digital books', [], []),
            BookSection('Audiobooks', [Book(1, 'Audio', 0, 3600, id='audio')], [])]
write_json_bundle(sys.argv[1], sections, today, today + timedelta(days=30), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await page.getByRole('button', { name: 'Session', exact: true }).click();
    await expect(page.locator('#session-formats button')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Choose Physical books' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Choose book Paper' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Choose Digital books' }).click();
    await expect(page.locator('#session-books')).toHaveText('Add a book to record a reading session.');
    await expect(page.locator('#session-book')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Add session' })).toBeDisabled();
    await page.getByRole('button', { name: 'Choose Physical books' }).click();
    await page.locator('#session-position').fill('10');
    await page.getByRole('button', { name: 'Add session' }).click();
    await page.locator('#session-position').fill('20');
    await page.getByRole('button', { name: 'Add session' }).click();
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    const sheet = page.locator('#entries-dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('combobox', { name: 'Book', exact: true }).click();
    await expect(sheet.getByRole('option')).toHaveText(['Physical books - 1. Paper', 'Audiobooks - 1. Audio']);
    await page.keyboard.press('Escape');
    const geometry = await sheet.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(geometry.bottom).toBeCloseTo(page.viewportSize().height, 0);
    expect(geometry.height).toBeCloseTo(page.viewportSize().height * .92, 0);
    await expect(sheet.locator('#history-list details')).toHaveCount(1);
    await expect(sheet.locator('#history-list details')).toHaveAttribute('open', '');
    await expect(sheet.getByRole('button', { name: /Edit session Paper/ })).toHaveCount(2);
    await sheet.getByRole('button', { name: /Edit session Paper/ }).first().click();
    await expect(sheet).toBeVisible();
    const editor = page.getByRole('dialog', { name: 'Edit session', exact: true });
    await expect(editor).toBeVisible();
    await editor.getByLabel('Session current page', { exact: true }).fill('21');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('editor-status')).toHaveText('Reading session saved.');
    await expect(sheet.locator('#history-list details')).toHaveAttribute('open', '');
    await sheet.getByRole('combobox', { name: 'Book', exact: true }).click();
    await sheet.getByRole('option', { name: 'Audiobooks - 1. Audio', exact: true }).click();
    await expect(sheet.getByText('No reading entries for this book yet.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Audiobooks' }).click();
    await expect(page.locator('#session-position-label')).toHaveText('Time left');
    await page.locator('#session-position').fill('00:30:00');
    await page.getByRole('button', { name: 'Add session' }).click();
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await expect(sheet.locator('#history-list')).toContainText('contribution 0:30:00');
    await sheet.getByRole('button', { name: /Delete session Audio/ }).click();
    await page.getByRole('dialog', { name: 'Delete entry?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(sheet.getByText('No reading entries for this book yet.')).toBeVisible();
    const handle = await sheet.locator('.entries-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 150);
    await page.mouse.up();
    await expect(sheet).not.toBeVisible();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('history dialogs isolate page and audio drafts, validate atomically and reject stale targets', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-session-dialogs-'));
  try {
    execFileSync('python', ['-c', `
import sys
from datetime import date, timedelta
from reading_plan import Book, BookSection, SummaryStatsOptions, add_reading_session, write_json_bundle
today = date.today()
paper = Book(1, 'Paper', 1, 100, id='paper')
audio = Book(1, 'Audio', 0, 3600, id='audio')
for day, position in [(today - timedelta(days=1), 10), (today, 20), (today, 30)]:
    add_reading_session(paper, day, position)
for day, remaining in [(today - timedelta(days=1), 3000), (today, 2400), (today, 1800)]:
    add_reading_session(audio, day, 3600 - remaining, 'Audiobooks')
write_json_bundle(sys.argv[1], [BookSection('Physical books', [paper], []), BookSection('Digital books', [], []), BookSection('Audiobooks', [audio], [])], today - timedelta(days=5), today + timedelta(days=30), 'Quarter end', SummaryStatsOptions(True, True, True, True, True))
`, directory]);
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(['plan.json', 'books.json', 'sessions.json', 'manifest.json'].map((name) => path.join(directory, name)));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle' }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    await page.getByRole('button', { name: 'Session', exact: true }).click();
    let draftDate = '2026-10-15';
    await page.locator('#session-date').fill(draftDate);
    await page.locator('#session-position').fill('77');
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    const sheet = page.locator('#entries-dialog');
    const dialog = page.locator('#session-entry-dialog');
    const snapshot = () => page.evaluate(() => localStorage.getItem(bundleKey));
    const expectDraft = async () => {
      await expect(page.locator('#session-book')).toHaveValue('paper');
      await expect(page.locator('#session-date')).toHaveValue(draftDate);
      await expect(page.locator('#session-position')).toHaveValue('77');
    };
    for (const [id, title, initial, invalid, valid] of [
      ['paper', 'Paper', '30', '101', '31'], ['audio', 'Audio', '0:30:00', '00:60:00', '00:29:00'],
    ]) {
      await sheet.getByRole('combobox', { name: 'Book', exact: true }).click();
      await sheet.getByRole('option', { name: `${id === 'audio' ? 'Audiobooks' : 'Physical books'} - 1. ${title}`, exact: true }).click();
      await sheet.locator('#history-list summary').first().click();
      const edit = sheet.getByRole('button', { name: new RegExp(`Edit session ${title}`) }).first();
      const before = await snapshot();
      await edit.click();
      await expect(dialog).toHaveAccessibleName('Edit session');
      await expect(sheet).toBeVisible();
      await expect(dialog.locator('#session-entry-position')).toHaveValue(initial);
      await dialog.locator('#session-entry-position').fill(valid);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(edit).toBeFocused();
      expect(await snapshot()).toBe(before);
      await edit.click();
      await dialog.locator('#session-entry-position').fill(invalid);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('#session-entry-status')).not.toBeEmpty();
      await expect(dialog.locator('#session-entry-position')).toHaveValue(invalid);
      expect(await snapshot()).toBe(before);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(sheet).toBeVisible();
      await expect(edit).toBeFocused();
      expect(await snapshot()).toBe(before);
      await edit.click();
      await dialog.locator('#session-entry-position').fill(valid);
      const originalDate = await dialog.locator('#session-entry-date').inputValue();
      const previousDate = await page.evaluate(() => window.ReadingSchedule.iso(window.ReadingSchedule.parseDate(window.ReadingSchedule.today()) - 1));
      await dialog.locator('#session-entry-date').fill(previousDate);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('#session-entry-date')).toHaveValue(previousDate);
      await expect(dialog.locator('#session-entry-status')).toContainText('advance');
      expect(await snapshot()).toBe(before);
      await dialog.locator('#session-entry-date').fill(originalDate);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(sheet.getByRole('combobox', { name: 'Book', exact: true })).toHaveText(`${id === 'audio' ? 'Audiobooks' : 'Physical books'} - 1. ${title}`);
      await expect(sheet.locator('#history-list details').first()).toHaveAttribute('open', '');
      await expectDraft();
      const remove = sheet.getByRole('button', { name: new RegExp(`Delete session ${title}`) }).first();
      const saved = await snapshot();
      await remove.click();
      await expect(dialog).toHaveAccessibleName('Delete entry?');
      await expect(dialog).toContainText('This session will be removed and progress recalculated.');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(remove).toBeFocused();
      expect(await snapshot()).toBe(saved);
      await remove.click();
      await page.keyboard.press('Escape');
      expect(await snapshot()).toBe(saved);
      await remove.click();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(sheet.getByRole('combobox', { name: 'Book', exact: true })).toHaveText(`${id === 'audio' ? 'Audiobooks' : 'Physical books'} - 1. ${title}`);
      await expect(sheet.locator('#history-list details').first()).toHaveAttribute('open', '');
      expect(await page.evaluate((bookId) => readBundleFiles().sessions.sessions[bookId].filter((session) => session.deleted).length, id)).toBe(1);
      await expectDraft();
    }
    // A temporarily empty date is also an unsaved main-form draft.
    draftDate = '';
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('#session-date').fill(draftDate);
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    // A target can be deleted or removed after its dialog opens. Never revive it.
    for (const [remove, missing] of [[false, false], [true, false], [false, true], [true, true]]) {
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Entries', exact: true }).click();
      await sheet.getByRole('combobox', { name: 'Book', exact: true }).click();
      await sheet.getByRole('option', { name: missing ? 'Audiobooks - 1. Audio' : 'Physical books - 1. Paper', exact: true }).click();
      await sheet.getByRole('button', { name: new RegExp(`${remove ? 'Delete' : 'Edit'} session`) }).first().click();
      await expect(dialog).toBeVisible();
      await page.evaluate(async (removeBook) => {
        const { bookId, sessionId } = entryTarget;
        const current = readBundleFiles();
        if (removeBook) {
          // Remove the session for Save; remove the book for Delete.
          if (entryTarget.remove) {
            for (const section of current.books.sections) section.books = section.books.filter((book) => book.id !== bookId);
            delete current.sessions.sessions[bookId];
          } else current.sessions.sessions[bookId] = current.sessions.sessions[bookId].filter((session) => session.id !== sessionId);
        } else current.sessions.sessions[bookId].find((session) => session.id === sessionId).deleted = true;
        const section = current.books.sections.find((section) => section.books.some((book) => book.id === bookId));
        if (section) window.recalculateReadingHistory(section.books.find((book) => book.id === bookId), current.sessions.sessions[bookId], section.label);
        await writeBundleFiles({ 'books.json': current.books, 'sessions.json': current.sessions });
      }, missing);
      const changed = await snapshot();
      await dialog.locator('#session-entry-save').click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('#session-entry-status')).not.toBeEmpty();
      expect(await snapshot()).toBe(changed);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expectDraft();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
