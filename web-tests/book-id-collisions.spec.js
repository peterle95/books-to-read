const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const labels = ['Physical books', 'Digital books', 'Audiobooks'];
const book = (id, title) => ({ id, title, start_page: 1, end_page: 100 });
const sections = (books) => labels.map((label) => ({ label, books: books[label] || [], simultaneous_groups: [] }));

const bundleFiles = ({ books, sessions = {}, plannedQuarter }) => {
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-01-01', end_date: '2026-03-31', end_label: 'Quarter end', rest_days: [] },
    'books.json': { schema_version: 2, sections: books, ...(plannedQuarter ? { planned_quarter: plannedQuarter } : {}) },
    'sessions.json': { schema_version: 2, sessions },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: '2026-01-01', modified_by: 'fixture',
    files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])),
  })) });
  return files;
};

const baseline = bundleFiles({ books: sections({ 'Physical books': [book('baseline', 'Baseline')] }), sessions: { baseline: [] } });

const snapshot = (page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

const importBundle = async (page, files, { confirm = false } = {}) => {
  await page.getByLabel('Bundle files').setInputFiles(files);
  if (confirm) page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await importBundle(page, baseline, { confirm: true });
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
});

test('book IDs that collide only after trimming are rejected in one section', async ({ page }) => {
  const before = await snapshot(page);
  await importBundle(page, bundleFiles({
    books: sections({ 'Physical books': [book('same', 'First'), book(' same ', 'Second')] }),
    sessions: { same: [] },
  }));
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle could not be imported: books.json Physical books book 2: duplicate book ID');
  expect(await snapshot(page)).toEqual(before);
});

test('book IDs that collide only after trimming are rejected across sections', async ({ page }) => {
  const before = await snapshot(page);
  await importBundle(page, bundleFiles({
    books: sections({ 'Physical books': [book('same', 'First')], 'Digital books': [book(' same ', 'Second')] }),
    sessions: { same: [] },
  }));
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle could not be imported: books.json Digital books book 1: duplicate book ID');
  expect(await snapshot(page)).toEqual(before);
});

test('planned-quarter book IDs that collide only after trimming are rejected', async ({ page }) => {
  const before = await snapshot(page);
  const planned = { start_date: '2026-04-01', sections: sections({ 'Physical books': [book('plan', 'First'), book(' plan ', 'Second')] }) };
  await importBundle(page, bundleFiles({ books: sections({}), plannedQuarter: planned }));
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle could not be imported: books.json planned_quarter Physical books book 2: duplicate book ID');
  expect(await snapshot(page)).toEqual(before);
});

test('planned books still cannot reuse an active book ID after trimming', async ({ page }) => {
  const before = await snapshot(page);
  const planned = { start_date: '2026-04-01', sections: sections({ 'Digital books': [book(' same ', 'Planned')] }) };
  await importBundle(page, bundleFiles({
    books: sections({ 'Physical books': [book('same', 'Active')] }),
    sessions: { same: [] },
    plannedQuarter: planned,
  }));
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle could not be imported: books.json planned_quarter: planned books must have unique IDs and no progress');
  expect(await snapshot(page)).toEqual(before);
});

test('normal distinct book IDs still import and keep their histories', async ({ page }) => {
  await importBundle(page, bundleFiles({
    books: sections({ 'Physical books': [book('paper', 'Paper')], 'Digital books': [book('digital', 'Digital')] }),
    sessions: { paper: [], digital: [] },
  }), { confirm: true });
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  const stored = await page.evaluate(() => {
    const current = readBundleData();
    return {
      ids: current.books.sections.flatMap((section) => section.books.map((item) => item.id)),
      sessionKeys: Object.keys(current.sessions).sort(),
    };
  });
  expect(stored).toEqual({ ids: ['paper', 'digital'], sessionKeys: ['digital', 'paper'] });
});

test('a single padded book ID without a collision still imports unchanged', async ({ page }) => {
  await importBundle(page, bundleFiles({
    books: sections({ 'Physical books': [book(' padded ', 'Padded')] }),
    sessions: { padded: [] },
  }), { confirm: true });
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  const stored = await page.evaluate(() => {
    const current = readBundleData();
    return {
      id: current.books.sections[0].books[0].id,
      sessions: current.sessions.padded,
    };
  });
  expect(stored).toEqual({ id: ' padded ', sessions: [] });
});
