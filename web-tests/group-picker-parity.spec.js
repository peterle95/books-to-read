const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('Books simultaneous picker replaces overlaps, isolates formats and preserves drafts and history', async ({ page }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-picker-'));
  const names = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
  try {
    execFileSync('python', ['-c', `
import sys
from datetime import date
from reading_plan import Book, BookSection, SummaryStatsOptions, write_json_bundle
sections = [BookSection('Physical books', [Book(i+1, title, 1, 20, id=title.lower()) for i,title in enumerate('ABCDEF')], [(1,2),(3,4),(5,6)]),
            BookSection('Digital books', [Book(1,'Digital A',1,10,id='da'),Book(2,'Digital B',1,10,id='db')], [(1,2)]),
            BookSection('Audiobooks', [], [])]
write_json_bundle(sys.argv[1], sections, date(2030,1,1), date(2030,3,31), 'Quarter end', SummaryStatsOptions(False,False,False,False,False))
`, directory]);
    await page.goto('./');
    const importFiles = async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Bundle files').setInputFiles(names.map((name) => path.join(directory, name)));
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
      await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    };
    await importFiles();
    await page.getByRole('button', { name: 'Books', exact: true }).click();
    const raw = () => page.evaluate(() => localStorage.getItem(bundleKey));
    const snapshot = () => page.evaluate(() => readBundleFiles());
    const dialog = page.locator('#book-group-dialog');
    const trigger = page.getByRole('button', { name: 'Select simultaneous books', exact: true });
    const save = () => dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    const choose = async (titles) => {
      for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.uncheck();
      for (const title of titles) await dialog.getByRole('checkbox', { name: `${title.charCodeAt(0) - 64}. ${title}`, exact: true }).check();
    };
    const groups = async () => (await snapshot()).books.sections[0].simultaneous_groups;
    await page.locator('#open-book-picker').click();
    await page.getByRole('radio', { name: '2. B', exact: true }).click();
    await page.locator('#book-title').fill('Unsaved title');
    await page.locator('#book-from').fill('3');
    await page.locator('#book-to').fill('33');
    const draft = async () => page.locator('#book-form input').evaluateAll((inputs) => inputs.map((input) => input.value));
    const beforeDraft = await draft(), before = await snapshot(), beforeRaw = await raw();
    await trigger.click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(6);
    await expect(dialog.getByRole('checkbox', { name: '1. A', exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: '2. B', exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: '3. C', exact: true })).not.toBeChecked();
    await choose(['B', 'C']);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await raw()).toBe(beforeRaw);
    expect(await draft()).toEqual(beforeDraft);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press('Escape');
    expect(await raw()).toBe(beforeRaw);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await choose(['B']);
    await save();
    await expect(page.locator('#book-group-status')).toContainText('at least two');
    expect(await raw()).toBe(beforeRaw);
    await choose(['A', 'C']);
    await save();
    await expect(page.locator('#book-group-status')).toContainText('consecutive');
    expect(await raw()).toBe(beforeRaw);
    expect(await draft()).toEqual(beforeDraft);
    await choose(['B', 'C']);
    await save();
    await expect(dialog).not.toBeVisible();
    expect(await groups()).toEqual([['e', 'f'], ['b', 'c']]);
    const after = await snapshot();
    expect(after.books.sections[0].books).toEqual(before.books.sections[0].books);
    expect(after.books.sections[0].baseline_needs_recalculation).toBe(true);
    expect(after.books.sections.slice(1)).toEqual(before.books.sections.slice(1));
    expect(after.encoded['sessions.json']).toBe(before.encoded['sessions.json']);
    expect(after.encoded['plan.json']).toBe(before.encoded['plan.json']);
    expect(await draft()).toEqual(beforeDraft);
    await trigger.click();
    await expect(dialog.getByRole('checkbox', { name: '1. A', exact: true })).not.toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: '2. B', exact: true })).toBeChecked();
    await choose([]);
    await save();
    await expect(dialog).not.toBeVisible();
    expect(await groups()).toEqual([['e', 'f']]);
    await trigger.click();
    await expect(dialog.locator('input:checked')).toHaveCount(0);
    await choose(['D', 'E', 'F']);
    await save();
    await expect(dialog).not.toBeVisible();
    expect(await groups()).toEqual([['d', 'e', 'f']]);
    // A changed bundle must never apply an old selection to mutable indexes.
    await trigger.click();
    await page.evaluate(() => localStorage.setItem(bundleKey, localStorage.getItem(bundleKey) + ' '));
    const changedRaw = await raw();
    await save();
    await expect(page.locator('#book-group-status')).toContainText('plan changed');
    expect(await raw()).toBe(changedRaw);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel book edit' }).click();
    await page.getByRole('combobox', { name: 'Format', exact: true }).click();
    await page.getByRole('option', { name: 'Digital books', exact: true }).click();
    await trigger.click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(2);
    await expect(dialog.locator('input:checked')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('#open-book-picker').click();
    await page.getByRole('radio', { name: '1. Digital A', exact: true }).click();
    await trigger.click();
    await expect(dialog.locator('input:checked')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const final = await snapshot();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export bundle ZIP', exact: true }).click();
    const download = await downloading;
    execFileSync('python', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', await download.path(), directory]);
    await importFiles();
    expect((await snapshot()).books).toEqual(final.books);
    expect((await snapshot()).sessions).toEqual(final.sessions);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
