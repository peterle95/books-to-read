const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const pad = (value) => String(value).padStart(2, '0');
const localDate = (offset) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return { iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
};
const labelOn = (offset) => {
  const { year, month, day } = localDate(offset);
  const text = `${pad(day)}/${pad(month)}`;
  return year === new Date().getFullYear() ? text : `${text}/${year}`;
};

test('browser projections follow the Android forecast checks', async ({ page }) => {
  await page.goto('./');
  const results = await page.evaluate(() => {
    const { forecast } = window.ReadingProjection;
    const { parseDate, iso, normalizeRestDays } = window.ReadingSchedule;
    const TODAY = '2026-10-01';
    const today = parseDate(TODAY);
    const rests = (offsets) => offsets.map(([from, to]) => ({ start: iso(today + from), end: iso(today + to) }));
    const isRest = (ranges, day) => normalizeRestDays(ranges).some((range) => range.start <= day && day <= range.end);

    // Mirror of the Android chart check's history fixture.
    const history = ({ audio = false, start = 1, total, initial = 0, amounts = [], todayAmount = 0, day = TODAY }) => {
      const offset = audio ? 0 : 1;
      const first = parseDate(day) - (amounts.length + 1);
      const sessions = [];
      const mark = (id, date, position) => (audio
        ? { id, date, current_time_seconds: position, time_listened_seconds: 0 }
        : { id, date, current_page: position, pages_read: 0 });
      let position = start + initial - offset;
      sessions.push(mark('first', iso(first), position));
      amounts.forEach((amount, index) => {
        position += amount;
        if (amount > 0) sessions.push(mark(`day-${index}`, iso(first + index + 1), position));
      });
      position += todayAmount;
      if (todayAmount > 0) sessions.push(mark('today', iso(parseDate(day)), position));
      const book = audio
        ? {
          id: 'audio', title: 'Projection', start_time_seconds: start, end_time_seconds: start + total,
          current_time_seconds: position, duration_seconds: total, time_listened_seconds: position - start,
        }
        : {
          id: 'pages', title: 'Projection', start_page: start, end_page: start + total - 1,
          current_page: position, pages_read: position - start + 1,
        };
      return { book, sessions, sectionLabel: audio ? 'Audiobooks' : 'Digital books' };
    };

    const report = ({ book, sessions = [], sectionLabel = 'Digital books', restDays = [], day = TODAY }) => {
      const result = forecast({ book, sessions, sectionLabel, restDays, today: day });
      const firstDay = parseDate(day);
      const firstCompletion = (direction) => {
        let readingDays = 0;
        for (let candidate = firstDay + 1; candidate <= parseDate(result.horizon); candidate += 1) {
          if (isRest(restDays, candidate)) continue;
          readingDays += 1;
          const value = direction === 0 ? result.centralAt(readingDays)
            : direction > 0 ? result.upperAt(readingDays) : result.lowerAt(readingDays);
          if (value === result.total) return iso(candidate);
        }
        return null;
      };
      // The chart plots one value per calendar day, so future rest days repeat the previous point.
      let plottedDays = 0;
      const series = [1, 2, 3].map((offset) => {
        if (!isRest(restDays, firstDay + offset)) plottedDays += 1;
        return result.centralAt(plottedDays);
      });
      return {
        completed: result.completed, total: result.total, pace: result.pace, variance: result.variance,
        observationDays: result.observationDays, rangeAvailable: result.rangeAvailable,
        projectedDeadline: result.projectedDeadline, earliestDeadline: result.earliestDeadline,
        latestDeadline: result.latestDeadline, horizon: result.horizon,
        projectionLabel: result.projectionLabel, rangeLabel: result.rangeLabel,
        central1: result.centralAt(1), central2: result.centralAt(2),
        lower1: result.lowerAt(1), upper1: result.upperAt(1),
        band1: result.upperAt(1) - result.lowerAt(1),
        band5: result.upperAt(5) - result.lowerAt(5),
        band7: result.upperAt(7) - result.lowerAt(7),
        centralFinish: firstCompletion(0), earliestFinish: firstCompletion(1), latestFinish: firstCompletion(-1),
        series,
      };
    };

    const pageBook = () => history({ total: 120, initial: 15, amounts: [4, 8, 4, 8, 4, 8, 6], todayAmount: 6 });
    const futureBook = pageBook();
    futureBook.book.current_page = 120;
    futureBook.book.pages_read = 120;
    futureBook.sessions.push({ id: 'future', date: iso(today + 1), current_page: 120, pages_read: 57 });
    const splitBook = pageBook();
    splitBook.sessions.push({ id: 'same-day', date: iso(today - 7), current_page: 17, pages_read: 2 });
    splitBook.sessions.push({ id: 'removed', date: iso(today - 100), current_page: 100, pages_read: 100, deleted: true });
    splitBook.sessions.reverse();
    const noPace = (extra = {}) => ({
      book: { id: 'unknown', title: 'No usable pace', start_page: 1, end_page: 300, current_page: 200, pages_read: 200 },
      sessions: extra.sessions || [],
    });
    const isolated = pageBook();
    const snapshot = JSON.stringify(isolated.book);
    const isolatedResult = forecast({ book: isolated.book, sessions: isolated.sessions, sectionLabel: isolated.sectionLabel, restDays: [], today: TODAY });

    return {
      reference: report(pageBook()),
      repeated: report(pageBook()),
      fractional: report(history({ total: 17, initial: 15, amounts: [1, 0, 0, 0, 0, 0, 0] })),
      split: report(splitBook),
      future: report(futureBook),
      highInitial: report(history({ total: 10000, initial: 200, amounts: [4, 8, 4, 8, 4, 8, 6], todayAmount: 100 })),
      restDays: report({ ...pageBook(), restDays: rests([[2, 3]]) }),
      todayRest: report({ ...pageBook(), restDays: rests([[0, 0]]) }),
      offset: report(history({ start: 101, total: 120, initial: 15, amounts: [4, 8, 4, 8, 4, 8, 6], todayAmount: 6 })),
      restingHistory: report({
        ...history({ total: 120, initial: 15, amounts: [4, 0, 8, 4, 8, 4, 8, 6], todayAmount: 6 }),
        restDays: rests([[-8, -7]]),
      }),
      audio: report({
        ...history({ audio: true, start: 100, total: 1200, initial: 150, amounts: [40, 80, 40, 80, 40, 80, 60], todayAmount: 60 }),
        restDays: rests([[2, 3]]),
      }),
      shortHistory: report(history({ total: 10000, initial: 15, amounts: [4, 8, 4, 8, 4, 8, 6], todayAmount: 6 })),
      longHistory: report(history({
        total: 10000, initial: 15, todayAmount: 6,
        amounts: Array.from({ length: 28 }, (_, index) => [4, 8, 4, 8, 4, 8, 6][index % 7]),
      })),
      irregular: report(history({ total: 10000, initial: 15, amounts: [0, 12, 0, 12, 0, 12, 6], todayAmount: 6 })),
      constant: report(history({ total: 10000, initial: 15, amounts: [6, 6, 6, 6, 6, 6, 6], todayAmount: 6 })),
      sporadic: report(history({ total: 120, initial: 15, amounts: [0, 0, 0, 0, 0, 0, 42], todayAmount: 6 })),
      sparse: report(history({ total: 120, initial: 15, amounts: [4, 8, 4, 8, 4, 8], todayAmount: 6 })),
      unknown: report(noPace()),
      todayOnly: report(noPace({ sessions: [{ id: 'today', date: TODAY, current_page: 200, pages_read: 200 }] })),
      deletedOnly: report(noPace({ sessions: [{ id: 'deleted', date: iso(today - 10), current_page: 200, pages_read: 200, deleted: true }] })),
      firstDayOnly: report(noPace({ sessions: [{ id: 'first', date: iso(today - 10), current_page: 200, pages_read: 200 }] })),
      finished: report({
        book: { id: 'pages', title: 'Projection', start_page: 1, end_page: 120, current_page: 120, pages_read: 120 },
        sessions: pageBook().sessions,
      }),
      remote: report(history({ total: 1000000, initial: 15, amounts: [1, 1, 1, 1, 1, 1, 1] })),
      nextYear: report({ ...history({ total: 120, initial: 15, amounts: [4, 8, 4, 8, 4, 8, 6], todayAmount: 6, day: '2026-12-28' }), day: '2026-12-28' }),
      isolated: { unchanged: JSON.stringify(isolated.book) === snapshot, finish: isolatedResult.projectedDeadline },
    };
  });

  const {
    reference, repeated, fractional, split, future, highInitial, restDays, todayRest, offset, restingHistory,
    audio, shortHistory, longHistory, irregular, constant, sporadic, sparse,
    unknown, todayOnly, deletedOnly, firstDayOnly, finished, remote, nextYear, isolated,
  } = results;

  // Central forecast, finish date and range.
  expect(reference.completed).toBe(63);
  expect(reference.pace).toBeCloseTo(6, 10);
  expect(reference.variance).toBeCloseTo(4, 10);
  expect(reference.observationDays).toBe(7);
  expect(reference.central1).toBe(69);
  expect(reference.central2).toBe(75);
  expect(reference.projectionLabel).toBe('Projection · est. end date: 11/10');
  expect(reference.projectedDeadline).toBe('2026-10-11');
  expect(reference.earliestDeadline).toBe('2026-10-09');
  expect(reference.latestDeadline).toBe('2026-10-14');
  expect(reference.rangeLabel).toBe('Estimated finish range: 09/10–14/10');
  expect(reference.centralFinish).toBe(reference.projectedDeadline);
  expect(reference.earliestFinish).toBe(reference.earliestDeadline);
  expect(reference.latestFinish).toBe(reference.latestDeadline);
  expect(reference.upper1).toBeGreaterThanOrEqual(reference.central1);
  expect(reference.lower1).toBeLessThanOrEqual(reference.central1);
  expect(reference.lower1).toBeGreaterThanOrEqual(reference.completed);
  expect(reference.upper1).toBeLessThanOrEqual(reference.total);

  // Identical input produces identical output.
  expect(repeated.central1).toBe(reference.central1);
  expect(repeated.lower1).toBe(reference.lower1);
  expect(repeated.upper1).toBe(reference.upper1);
  expect(repeated.rangeLabel).toBe(reference.rangeLabel);

  // Rounding must not claim the last page before the mean forecast reaches it.
  expect(fractional.projectedDeadline).toBe('2026-10-08');
  expect(fractional.projectionLabel).toBe('Projection · est. end date: 08/10');
  expect(fractional.central1).toBe(16);

  // Observation rules: same-day sessions, deleted logs and future logs.
  expect(split.observationDays).toBe(7);
  expect(split.pace).toBeCloseTo(reference.pace, 10);
  expect(split.lower1).toBe(reference.lower1);
  expect(future.completed).toBe(63);
  expect(future.central1).toBe(reference.central1);
  expect(future.projectionLabel).toBe(reference.projectionLabel);
  expect(highInitial.pace).toBeCloseTo(6, 10);
  expect(highInitial.variance).toBeCloseTo(4, 10);
  expect(highInitial.completed).toBe(342);

  // Rest days move the finish later and repeat the plotted point without changing observations.
  expect(restDays.projectedDeadline).toBe('2026-10-13');
  expect(restDays.earliestDeadline).toBe('2026-10-11');
  expect(restDays.latestDeadline).toBe('2026-10-16');
  expect(restDays.projectionLabel).toBe('Projection · est. end date: 13/10');
  expect(restDays.series[0]).toBe(restDays.series[1]);
  expect(restDays.series[1]).toBe(restDays.series[2]);
  expect(restDays.centralFinish).toBe(restDays.projectedDeadline);
  expect(restDays.earliestFinish).toBe(restDays.earliestDeadline);
  expect(restDays.latestFinish).toBe(restDays.latestDeadline);
  expect(todayRest.projectedDeadline).toBe('2026-10-11');
  expect(restingHistory.observationDays).toBe(7);
  expect(restingHistory.pace).toBeCloseTo(6, 10);

  // Units: page and second offsets do not change the forecast.
  expect(offset.central1).toBe(reference.central1);
  expect(offset.rangeLabel).toBe(reference.rangeLabel);
  expect(audio.completed).toBe(630);
  expect(audio.pace).toBeCloseTo(60, 10);
  expect(audio.projectedDeadline).toBe('2026-10-13');
  expect(audio.latestDeadline).toBe('2026-10-16');

  // Uncertainty learning.
  expect(longHistory.band5).toBeLessThan(shortHistory.band5);
  expect(longHistory.band5).toBeGreaterThan(0);
  expect(shortHistory.band7).toBeGreaterThan(shortHistory.band1);
  expect(irregular.band5).toBeGreaterThan(shortHistory.band5);
  expect(constant.band5).toBe(0);

  // Open-ended range: the lower curve never reaches completion at a positive rate.
  expect(sporadic.earliestDeadline).toBe('2026-10-04');
  expect(sporadic.latestDeadline).toBeNull();
  expect(sporadic.rangeLabel).toBe('Estimated finish range: 04/10 onward; latest finish uncertain');

  // Availability.
  expect(sparse.projectedDeadline).toBe('2026-10-12');
  expect(sparse.rangeAvailable).toBe(false);
  expect(sparse.rangeLabel).toContain('Not enough history (6/7 reading days)');
  expect(sparse.lower1).toBe(-1);
  for (const scenario of [unknown, todayOnly, deletedOnly, firstDayOnly]) {
    expect(scenario.projectedDeadline).toBeNull();
    expect(scenario.rangeAvailable).toBe(false);
    expect(scenario.projectionLabel).toBe('Projection · est. end date: —');
    expect(scenario.central1).toBe(-1);
  }
  expect(finished.projectedDeadline).toBe('2026-10-01');
  expect(finished.rangeLabel).toBe('Book finished — no future uncertainty');

  // Bounded horizon for remote or unfinishable forecasts.
  expect(remote.projectedDeadline).toBeNull();
  expect(remote.latestDeadline).toBeNull();
  expect(remote.horizon).toBe('2036-10-01');
  expect(remote.projectionLabel).toContain('beyond 10 years');
  expect(remote.rangeLabel).toBe('Estimated finish range: beyond 10-year forecast horizon');

  // Dates outside the current year include it.
  expect(nextYear.projectionLabel).toBe('Projection · est. end date: 07/01/2027');
  expect(nextYear.rangeLabel).toBe('Estimated finish range: 05/01/2027–10/01/2027');

  // Forecasts are read-only.
  expect(isolated.unchanged).toBe(true);
  expect(isolated.finish).toBe(reference.projectedDeadline);
});

test('readers see projections for an imported bundle without changing its schedule', async ({ page }) => {
  const sessionDays = Array.from({ length: 8 }, (_, index) => localDate(index - 8).iso);
  const sessions = [
    { id: 'first', date: sessionDays[0], current_page: 15, pages_read: 15 },
    { id: 'd1', date: sessionDays[1], current_page: 19, pages_read: 4 },
    { id: 'd2', date: sessionDays[2], current_page: 27, pages_read: 8 },
    { id: 'd3', date: sessionDays[3], current_page: 31, pages_read: 4 },
    { id: 'd4', date: sessionDays[4], current_page: 39, pages_read: 8 },
    { id: 'd5', date: sessionDays[5], current_page: 43, pages_read: 4 },
    { id: 'd6', date: sessionDays[6], current_page: 51, pages_read: 8 },
    { id: 'd7', date: sessionDays[7], current_page: 57, pages_read: 6 },
    { id: 'today', date: localDate(0).iso, current_page: 63, pages_read: 6 },
  ];
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-01-01', end_date: '2026-12-31', end_label: 'Quarter end' },
    'books.json': {
      schema_version: 2,
      sections: [
        { label: 'Physical books', books: [], simultaneous_groups: [] },
        {
          label: 'Digital books',
          books: [{
            id: 'digital-1', title: 'Projection example', start_page: 1, end_page: 120,
            current_page: 63, pages_read: 63, baseline_schedule: null,
          }],
          simultaneous_groups: [],
        },
        { label: 'Audiobooks', books: [], simultaneous_groups: [] },
      ],
    },
    'sessions.json': { schema_version: 2, sessions: { 'digital-1': sessions } },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  const hashes = Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')]));
  files.push({
    name: 'manifest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schema_version: 2, revision: 1, last_modified: '2026-01-01', modified_by: 'test', files: hashes })),
  });

  await page.goto('./');
  await expect(page.getByTestId('projection-empty')).toBeVisible();
  await page.getByLabel('Bundle files').setInputFiles(files);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import bundle' }).click();
  await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');

  const rows = page.locator('#projection-rows tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText('Digital books · pages');
  await expect(rows.nth(1).locator('td').nth(0)).toHaveText('Projection example');
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText(`Projection · est. end date: ${labelOn(10)}`);
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText(`Estimated finish range: ${labelOn(8)}–${labelOn(13)}`);
  await expect(page.getByText('it is not a guarantee')).toBeVisible();

  // A range day count that is visible to readers does not change the stored bundle or draft.
  const stored = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
  expect(JSON.parse(stored)['books.json']).toBe(files[1].buffer.toString('base64'));
  expect(JSON.parse(stored)['sessions.json']).toBe(files[2].buffer.toString('base64'));
});
