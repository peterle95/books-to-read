const { test, expect } = require('@playwright/test');
const { chooseDate } = require('./calendar-helper');
const { createHash } = require('node:crypto');

async function openBooks(page) {
  await page.goto('./');
  const files = await page.evaluate(() => {
    const sections = ReadingQuarter.blankSections();
    sections[0].books = ['First', 'Second'].map((title, index) => ({ ...ReadingQuarter.newBook('Physical books', title, 1, 100), id: title.toLowerCase(), number: index + 1 }));
    sections[1].books = [{ ...ReadingQuarter.newBook('Digital books', 'Digital', 1, 50), id: 'digital', number: 1 }];
    sections[2].books = [{ ...ReadingQuarter.newBook('Audiobooks', 'Audio', 0, 3630), id: 'audio', number: 1 }];
    return {
      'plan.json': { schema_version: 2, start_date: '2030-01-01', end_date: '2030-03-31', end_label: 'Quarter end', rest_days: [], stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true } },
      'books.json': { schema_version: 2, sections, planned_quarter: null },
      'sessions.json': { schema_version: 2, sessions: Object.fromEntries(sections.flatMap((section) => section.books.map((book) => [book.id, []]))) },
    };
  });
  const payloads = Object.entries(files).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  payloads.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema_version: 2, revision: 1, last_modified: '2026-11-01', modified_by: 'fixture', files: Object.fromEntries(payloads.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])) })) });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(payloads);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  await page.getByRole('button', { name: 'Books', exact: true }).click();
}
const choose = async (page, title) => {
  await page.getByRole('button', { name: 'Choose book to edit', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose a book to edit' }).getByRole('radio', { name: title, exact: true }).click();
};

for (const audio of [false, true]) {
  for (const action of ['Add', 'Replace Selected', 'Insert Before']) {
    test(`${audio ? 'audio' : 'page'} ${action} uses native blank defaults and rejects invalid typed ranges atomically`, async ({ page }) => {
      await openBooks(page);
      const index = audio ? 2 : 0;
      const title = audio ? 'Audio' : 'Second';
      await page.getByRole('combobox', { name: 'Format', exact: true }).click();
      await page.getByRole('option', { name: audio ? 'Audiobooks' : 'Physical books', exact: true }).click();
      await choose(page, `${audio ? 1 : 2}. ${title}`);
      if (action === 'Replace Selected') {
        await page.getByRole('button', { name: 'Complete Selected', exact: true }).click();
        await expect(page.getByTestId('editor-status')).toHaveText('Book completed.');
      }
      const snapshot = () => page.evaluate(() => readBundleFiles());
      const before = await snapshot();
      const raw = await page.evaluate(() => localStorage.getItem(bundleKey));
      const fields = page.locator('#book-form');
      const fill = async (from, to) => {
        await fields.getByLabel('Title', { exact: true }).fill('   ');
        await fields.getByLabel(audio ? 'Start time' : 'Start page', { exact: true }).fill(from);
        await fields.getByLabel(audio ? 'End time' : 'End page', { exact: true }).fill(to);
      };
      const invalid = audio
        ? [['10', '0:30'], ['0:00', '30'], ['0:60', '1:00'], ['0:00', '0:00:60'], ['-1:00', '1:00'], ['0:20', '0:10'], ['0:00', 'oops']]
        : [['1.5', '100'], ['1', 'oops'], ['-1', '100'], ['10', '9'], ['1', '2147483648']];
      if (action !== 'Replace Selected') invalid.push(['   ', '   ']);
      for (const [from, to] of invalid) {
        await fill(from, to);
        await page.getByRole('button', { name: action, exact: true }).click();
        await expect(page.getByTestId('editor-status')).not.toBeEmpty();
        expect(await page.evaluate(() => localStorage.getItem(bundleKey))).toBe(raw);
        await expect(fields.getByLabel('Title', { exact: true })).toHaveValue('   ');
        await expect(fields.getByLabel(audio ? 'Start time' : 'Start page', { exact: true })).toHaveValue(from);
        await expect(fields.getByLabel(audio ? 'End time' : 'End page', { exact: true })).toHaveValue(to);
      }
      // Replacement defaults both endpoints; new books still require an end.
      await fill('   ', action === 'Replace Selected' ? '   ' : audio ? '0:1:2' : '10');
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
      const after = await snapshot();
      const position = action === 'Add' ? before.books.sections[index].books.length : audio ? 0 : 1;
      const saved = after.books.sections[index].books[position];
      expect(saved.title).toBe(action === 'Replace Selected' ? title : `Book ${position + 1}`);
      expect(saved[audio ? 'start_time_seconds' : 'start_page']).toBe(audio ? 0 : 1);
      expect(saved[audio ? 'end_time_seconds' : 'end_page']).toBe(action === 'Replace Selected' ? audio ? 3630 : 100 : audio ? 62 : 10);
      if (action === 'Replace Selected') {
        expect(saved).toEqual(before.books.sections[index].books[position]);
        expect(after.sessions).toEqual(before.sessions);
      } else {
        expect(after.books.sections[index].books.filter((book) => book.id !== saved.id)).toEqual(before.books.sections[index].books.map((book, offset) => ({ ...book, number: offset + 1 + (action === 'Insert Before' && offset >= position ? 1 : 0) })));
        expect(after.sessions.sessions[saved.id]).toEqual([]);
      }
      expect(after.books.sections.filter((section, offset) => offset !== index)).toEqual(before.books.sections.filter((section, offset) => offset !== index));
      expect(after.plan).toEqual(before.plan);
      expect(after.manifest.revision).toBe(before.manifest.revision + 1);
      await page.reload();
      expect((await snapshot()).books).toEqual(after.books);
      expect((await snapshot()).sessions).toEqual(after.sessions);
    });
  }
}

test('Books accepts native page zero and equal endpoints', async ({ page }) => {
  await openBooks(page);
  await page.locator('#book-form').getByLabel('Title', { exact: true }).fill('Zero');
  await page.getByLabel('Start page', { exact: true }).fill('0');
  await page.getByLabel('End page', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
  expect(await page.evaluate(() => readBundleFiles().books.sections[0].books.at(-1))).toMatchObject({ start_page: 0, end_page: 0, pages: 1 });
});

test('book picker does not steal focus after selection closes', async ({ page }) => {
  await openBooks(page);
  await page.locator('#open-book-picker').click();
  const result = await page.evaluate(async () => {
    const picker = document.querySelector('#book-picker-dialog');
    const closed = new Promise((resolve) => picker.addEventListener('close', resolve, { once: true }));
    picker.querySelector('input').click();
    const selectedFocus = document.activeElement.id;
    document.querySelector('#book-from').focus();
    await closed;
    return { selectedFocus, finalFocus: document.activeElement.id };
  });
  expect(result).toEqual({ selectedFocus: 'book-title', finalFocus: 'book-from' });
});

test('Books hierarchy uses a numbered current-format modal, restores cancel focus and switches editable formats', async ({ page }) => {
  await openBooks(page);
  await expect(page.locator('#books-heading')).toHaveText('Books');
  await expect(page.getByLabel('Start page', { exact: true })).toHaveValue('1');
  await expect(page.locator('#book-list, #choose-book, #book-position')).toHaveCount(0);
  const trigger = page.locator('#open-book-picker');
  await page.locator('#book-form').getByLabel('Title', { exact: true }).fill('Draft');
  await trigger.click();
  await expect(page.locator('#book-picker-choices').getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: '1. First', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: '2. Second', exact: true })).toBeVisible();
  await page.locator('#cancel-book-picker').click();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#book-title')).toHaveValue('Draft');
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await choose(page, '2. Second');
  await expect(page.locator('#book-title')).toHaveValue('Second');
  await expect(page.locator('#book-title')).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Format', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Format', exact: true }).click();
  await page.getByRole('option', { name: 'Audiobooks', exact: true }).click();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('0:00');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('');
  await expect(page.locator('#book-title')).toHaveValue('');
  await page.locator('#complete-book').click();
  await expect(page.getByTestId('editor-status')).toContainText('Choose a book');
  await choose(page, '1. Audio');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('1:00:30');
  await page.locator('#book-title').fill('Audio copy');
  await page.locator('#add-book').click();
  await expect(page.getByTestId('editor-status')).toHaveText('Book saved.');
  expect(await page.evaluate(() => readBundleFiles().books.sections[2].books.map((book) => book.title))).toEqual(['Audio', 'Audio copy']);
  await expect(page.locator('#today-reading section')).toHaveCount(3);
});

test('Books overrides save fresh persisted data, preserve drafts and unrelated records on success and failure', async ({ page }) => {
  await openBooks(page);
  await expect(page.locator('#clear-book-start')).toBeHidden();
  await expect(page.locator('#clear-book-deadline')).toBeHidden();
  await expect(page.locator('#set-book-start')).toBeEnabled();
  await expect(page.locator('#set-book-deadline')).toBeEnabled();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.locator('#calculate-schedule').click();
  await expect(page.getByTestId('schedule-status')).toContainText('Baseline schedule calculated');
  await page.getByRole('button', { name: 'Books', exact: true }).click();
  await choose(page, '1. First');
  await expect(page.locator('#clear-book-start')).toBeHidden();
  const setStart = await page.locator('#set-book-start').boundingBox();
  const form = await page.locator('#book-form').boundingBox();
  expect(setStart.width).toBeLessThan(form.width);
  await page.locator('#book-title').fill('Unsaved title');
  await page.locator('#book-from').fill('invalid draft');
  await page.locator('#book-to').fill('999');
  // Simulate a saved change after selection; overrides must not use the old book snapshot.
  await page.evaluate(async () => {
    const current = readBundleFiles();
    current.books.sections[0].books[0].title = 'Fresh saved title';
    await writeBundleFiles({ 'books.json': current.books });
  });
  const snapshot = () => page.evaluate(() => readBundleFiles());
  const before = await snapshot();
  const draft = () => page.locator('#book-title, #book-from, #book-to').evaluateAll((inputs) => inputs.map((input) => input.value));
  const originalDraft = await draft();
  await chooseDate(page, page.getByLabel('Start date override', { exact: true }), '2030-01-03');
  await expect(page.locator('#clear-book-start')).toBeVisible();
  await page.locator('#set-book-start').click();
  await expect(page.getByTestId('editor-status')).toHaveText('Start date override saved for Fresh saved title.');
  await chooseDate(page, page.getByLabel('Deadline override', { exact: true }), '2030-02-01');
  await page.locator('#set-book-deadline').click();
  await expect(page.getByTestId('editor-status')).toHaveText('Deadline override saved for Fresh saved title.');
  const after = await snapshot();
  expect(after.books.sections[0].books[0]).toMatchObject({ title: 'Fresh saved title', start_page: 1, end_page: 100, start_date_override: '2030-01-03', deadline_override: '2030-02-01' });
  expect(after.books.sections[0].books[1]).toEqual(before.books.sections[0].books[1]);
  expect(after.books.sections.slice(1)).toEqual(before.books.sections.slice(1));
  expect(after.sessions).toEqual(before.sessions);
  expect(after.plan).toEqual(before.plan);
  expect(await draft()).toEqual(originalDraft);
  const raw = await page.evaluate(() => localStorage.getItem(bundleKey));
  await chooseDate(page, page.getByLabel('Start date override', { exact: true }), '2030-03-01');
  await page.locator('#set-book-start').click();
  await expect(page.getByTestId('editor-status')).toContainText('after the deadline');
  expect(await page.evaluate(() => localStorage.getItem(bundleKey))).toBe(raw);
  expect(await draft()).toEqual(originalDraft);
  await page.locator('#clear-book-start').click();
  await expect(page.getByTestId('editor-status')).toContainText('Start date override cleared');
  await expect(page.locator('#clear-book-start')).toBeHidden();
  await page.locator('#clear-book-deadline').click();
  await expect(page.getByTestId('editor-status')).toContainText('Deadline override cleared');
  await expect(page.locator('#clear-book-deadline')).toBeHidden();
  expect(await draft()).toEqual(originalDraft);
  await page.reload();
  await page.getByRole('button', { name: 'Books', exact: true }).click();
  await choose(page, '1. Fresh saved title');
  await expect(page.getByLabel('Start date override', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Deadline override', { exact: true })).toHaveValue('');
  const saved = (await snapshot()).books.sections[0].books[0];
  expect(saved.baseline_schedule.start_date).toBe('2030-01-01');
  expect(saved.baseline_schedule.deadline).toBe('2030-03-31');
});
