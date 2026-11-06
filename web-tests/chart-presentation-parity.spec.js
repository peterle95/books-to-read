const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const date = (offset) => {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
};

const importFixture = async (page, fixture) => {
  const baseline_schedule = { start_date: date(-10), deadline: date(40), daily_target: 2 };
  const section = (label, books) => ({ label, books, simultaneous_groups: [] });
  const data = fixture || {
    'plan.json': { schema_version: 2, start_date: date(-10), end_date: date(40), end_label: 'Quarter end',
      stats_options: { book_counts: false, page_share: false, average_pages: false, reading_period: false, pace_driver: false } },
    'books.json': { schema_version: 2, sections: [
      section('Physical books', [{ id: 'paper', number: 1, title: 'Paper', start_page: 1, end_page: 100, current_page: 30, baseline_schedule }]),
      section('Digital books', []),
      section('Audiobooks', [{ id: 'audio', number: 1, title: 'Audio', start_time_seconds: 0, end_time_seconds: 3601,
        current_time_seconds: 600, baseline_schedule }]),
    ] },
    'sessions.json': { schema_version: 2, sessions: { paper: [], audio: [] } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    schema_version: 2, revision: 1, last_modified: date(0), modified_by: 'test', files: hashes,
  })) });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
  return page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
};

test('chart stays 500px tall across widths with wrapped violet forecasts, separate axes and five dates', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  const svg = page.locator('#charts svg');
  for (const width of [360, 390, 900]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(async () => svg.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(500);
    await expect.poll(async () => svg.evaluate((element) => Math.abs(element.viewBox.baseVal.width - element.getBoundingClientRect().width))).toBeLessThan(2);
    expect(await svg.evaluate((element) => element.getBoundingClientRect().width <= element.closest('#charts').clientWidth)).toBe(true);
    expect(await svg.evaluate((element) => element.nextElementSibling.tagName)).toBe('FIGCAPTION');
    expect(await svg.evaluate((element) => element.previousElementSibling)).toBeNull();
    const legend = svg.locator('foreignObject p');
    await expect(legend).toContainText('Estimated finish range:');
    await expect(legend).toHaveCSS('color', 'rgb(124, 58, 237)');
    expect(await legend.evaluate((element) => element.scrollHeight <= element.parentElement.height.baseVal.value)).toBe(true);
    const left = svg.locator('text').filter({ hasText: /^Pages$/ });
    const right = svg.locator('text').filter({ hasText: /^Pages\/day$/ });
    await expect(left).toHaveAttribute('transform', /^rotate\(-90 /);
    expect(Number(await right.getAttribute('x'))).toBeGreaterThan(Number(await left.getAttribute('x')));
    const legendHeight = await legend.evaluate((element) => Math.ceil(element.getBoundingClientRect().height));
    expect(Number(await right.getAttribute('y'))).toBeCloseTo(40 + legendHeight, 1);
    await expect(svg.locator('.chart-date-label')).toHaveCount(5);
    for (const label of await svg.locator('.chart-date-label').allTextContents()) expect(label).toMatch(/^\d{2}-\d{2}$/);
  }
  await page.locator('#charts').getByRole('combobox', { name: 'Book' }).click();
  await page.getByRole('option', { name: 'Audiobooks - 1. Audio', exact: true }).click();
  await expect(page.locator('#charts').getByRole('combobox', { name: 'Book' })).toBeFocused();
  await expect(svg.locator('text').filter({ hasText: /^Time$/ })).toHaveCount(1);
  await expect(svg.locator('text').filter({ hasText: /^Time\/day$/ })).toHaveCount(1);
  await expect(svg.locator('.chart-left-tick')).toHaveText(['0:00:00', '0:15:01', '0:30:01', '0:45:01', '1:00:01']);
  await expect(svg.locator('.chart-right-tick')).toHaveText(['0:00:00', '0:12:31', '0:25:01', '0:37:31', '0:50:01']);
  await page.getByRole('checkbox', { name: 'Show projection and estimated finish range' }).uncheck();
  await expect(svg.locator('foreignObject')).toHaveCount(0);
  await expect(svg.locator('polyline')).toHaveCount(3);
  expect(await svg.evaluate((element) => element.getBoundingClientRect().height)).toBe(500);
});

// Same synthetic four-book/five-session state used by the settled Android/web screenshots.
const screenshotFixture = () => {
  const baseline = (start_date = '2026-10-27', deadline = '2026-12-06', daily_target = 2) => ({ start_date, deadline, daily_target });
  const book = (id, number, title, current_page, extra = {}) => ({ id, number, title, baseline_schedule: baseline(),
    deadline_override: null, start_date_override: null, target_completed_date: null,
    start_page: 1, end_page: 100, current_page, pages: 100, pages_read: current_page || 0, ...extra });
  const section = (label, books, simultaneous_groups = []) => ({ label, baseline_needs_recalculation: false, simultaneous_groups, books });
  return {
    'plan.json': { schema_version: 2, start_date: '2026-10-27', end_date: '2026-12-16', end_label: 'Target finish date',
      stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true },
      rest_days: [{ start_date: '2026-11-08', end_date: '2026-11-09' }] },
    'books.json': { schema_version: 2, sections: [
      section('Physical books', [book('physical-id', 1, 'Synthetic paper - history and projection', 30, { deadline_override: '2026-12-01' }),
        book('paper-partner', 2, 'Synthetic simultaneous partner', null)], [['physical-id', 'paper-partner']]),
      section('Digital books', [book('digital-id', 1, 'Synthetic digital - future start', null, {
        baseline_schedule: baseline('2026-11-10', '2026-12-16', 3), start_date_override: '2026-11-10' })]),
      section('Audiobooks', [{ id: 'audio-id', number: 1, title: 'Synthetic audio - seconds history', baseline_schedule: baseline('2026-10-27', '2026-12-06', 120),
        deadline_override: null, start_date_override: null, target_completed_date: null, start_time_seconds: 0, end_time_seconds: 3600,
        current_time_seconds: 1800, duration_seconds: 3600, time_listened_seconds: 1800, remaining_time_seconds: 1800 }]),
    ], planned_quarter: { start_date: '2027-01-01', sections: [
      section('Physical books', [book('next-paper', 1, 'Synthetic next quarter', null, { baseline_schedule: null })]),
      section('Digital books', []), section('Audiobooks', []),
    ] } },
    'sessions.json': { schema_version: 2, sessions: {
      'physical-id': [{ id: 'first', date: '2026-11-05', current_page: 10, pages_read: 10 },
        { id: 'middle', date: '2026-11-06', current_page: 20, pages_read: 10 },
        { id: 'last', date: '2026-11-06', current_page: 30, pages_read: 10 }],
      'audio-id': [{ id: 'audio-first', date: '2026-11-05', current_time_seconds: 600, time_listened_seconds: 600, remaining_time_seconds: 3000 },
        { id: 'audio-last', date: '2026-11-06', current_time_seconds: 1800, time_listened_seconds: 1200, remaining_time_seconds: 1800 }],
      'paper-partner': [], 'digital-id': [],
    } },
  };
};

test('settled screenshot fixture carries Actual through plot end with native page ticks and unchanged storage', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00'));
  await page.setViewportSize({ width: 360, height: 732 });
  await importFixture(page, screenshotFixture());
  const storage = () => page.evaluate(() => ({ bundle: localStorage.getItem('reading-plan-bundle-v1'), schedule: localStorage.getItem('reading-plan-schedule-v1') }));
  const original = await storage();
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  const svg = page.locator('#charts svg');
  const projection = page.getByRole('checkbox', { name: 'Show projection and estimated finish range' });
  for (const all of [false, true]) {
    if (all) await page.getByRole('button', { name: 'All', exact: true }).click();
    for (const visible of [true, false]) {
      await projection.setChecked(visible);
      await expect(svg.locator('.chart-left-tick')).toHaveText(['0', '25', '50', '75', '100']);
      await expect(svg.locator('.chart-right-tick')).toHaveText(['0', '18', '35', '53', '70']);
      const points = await svg.evaluate((element) => {
        const series = [...element.querySelectorAll('polyline')].map((line) => [...line.points].map(({ x, y }) => ({ x, y })));
        const today = element.querySelector('line[stroke="#9f3a2b"]');
        return { plan: series[0], actual: series[1], todayX: Number(today.getAttribute('x1')),
          top: Number(today.getAttribute('y1')), bottom: Number(today.getAttribute('y2')) };
      });
      expect(points.actual.length).toBe(points.plan.length);
      expect(points.actual.at(-1).x).toBe(points.plan.at(-1).x);
      const future = points.actual.filter(({ x }) => x >= points.todayX);
      expect(future.length).toBeGreaterThan(1);
      for (const { y } of future) expect(y).toBe(Math.fround(points.bottom - .3 * (points.bottom - points.top)));
    }
  }
  await page.locator('#charts').getByRole('combobox', { name: 'Book' }).click();
  await page.getByRole('option', { name: /Synthetic audio - seconds history/ }).click();
  const ends = await svg.locator('polyline').evaluateAll((lines) => lines.slice(0, 2).map((line) => ({
    x: line.points.getItem(line.points.numberOfItems - 1).x, count: line.points.numberOfItems,
  })));
  expect(ends[1]).toEqual(ends[0]);
  expect(await storage()).toEqual(original);
});

test('Summary metrics always shows every optional row without rewriting imported false options', async ({ page }) => {
  const original = await importFixture(page);
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await page.getByRole('button', { name: 'Metrics', exact: true }).click();
  await page.getByRole('button', { name: 'Summary metrics', exact: true }).click();
  const table = page.getByRole('table', { name: 'Summary metrics', exact: true });
  await expect(table.locator('caption')).toHaveCount(0);
  await expect(table.locator('tbody tr')).toHaveCount(10);
  for (const label of ['Physical book count', 'Digital book count', 'Audiobook count', 'Physical page share', 'Digital page share',
    'Physical average pages/book', 'Digital average pages/book', 'Audiobook average duration', 'Reading period', 'Pace driver']) {
    await expect(table.getByRole('cell', { name: label, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
});
