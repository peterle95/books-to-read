const { test, expect } = require('@playwright/test');

const forecastOn = async (page, today, total = 120) => page.evaluate(({ today, total }) => {
  const { parseDate, iso } = window.ReadingSchedule;
  const first = parseDate(today) - 8;
  let position = 15;
  const sessions = [{ date: iso(first), current_page: position }];
  [4, 8, 4, 8, 4, 8, 6].forEach((amount, index) => {
    position += amount;
    sessions.push({ date: iso(first + index + 1), current_page: position });
  });
  const result = window.ReadingProjection.forecast({
    book: { start_page: 1, end_page: total, current_page: 63 },
    sectionLabel: 'Digital books', sessions, today,
  });
  return { ...result, centralAt: result.centralAt(2), lowerAt: result.lowerAt(2), upperAt: result.upperAt(2) };
}, { today, total });

test('early-year session forecasts preserve the normal-year calculation', async ({ page }) => {
  await page.goto('./');
  const normal = await forecastOn(page, '2026-10-01');
  expect(normal.projectedDeadline).toBe('2026-10-11');
  expect(normal.earliestDeadline).toBe('2026-10-09');
  expect(normal.latestDeadline).toBe('2026-10-14');
  expect(normal.horizon).toBe('2036-10-01');
  for (const year of ['0001', '0099', '0100', '0400']) {
    const actual = await forecastOn(page, `${year}-10-01`);
    expect(actual).toEqual({
      ...normal, horizon: `${String(Number(year) + 10).padStart(4, '0')}-10-01`,
      projectedDeadline: `${year}-10-11`, earliestDeadline: `${year}-10-09`, latestDeadline: `${year}-10-14`,
    });
  }
});

test('leap days and century boundaries retain valid forecast dates', async ({ page }) => {
  await page.goto('./');
  for (const [today, horizon, finish] of [
    ['0004-02-29', '0014-02-28', '0004-03-10'],
    ['0096-02-29', '0106-02-28', '0096-03-10'],
    ['0090-02-28', '0100-02-28', '0090-03-10'],
    ['0390-02-28', '0400-02-28', '0390-03-10'],
    ['0400-02-29', '0410-02-28', '0400-03-10'],
    ['0099-12-28', '0109-12-28', '0100-01-07'],
    ['2026-12-28', '2036-12-28', '2027-01-07'],
  ]) {
    const actual = await forecastOn(page, today);
    expect(actual.horizon).toBe(horizon);
    expect(actual.projectedDeadline).toBe(finish);
    expect(actual.observationDays).toBe(7);
    expect(actual.pace).toBe(6);
  }
});

test('forecasts stop at year 9999 and explicitly label unsupported finish dates', async ({ page }) => {
  await page.goto('./');
  const finite = await forecastOn(page, '9999-10-01');
  expect(finite.horizon).toBe('9999-12-31');
  expect(finite.projectedDeadline).toBe('9999-10-11');
  expect(finite.latestDeadline).toBe('9999-10-14');
  const open = await forecastOn(page, '9999-12-22');
  expect(open.earliestDeadline).toBe('9999-12-30');
  expect(open.projectedDeadline).toBeNull();
  expect(open.latestDeadline).toBeNull();
  expect(open.projectionLabel).toContain('beyond supported date range');
  expect(open.rangeLabel).toContain('latest finish uncertain');
  for (const today of ['9990-10-01', '9999-12-31']) {
    const remote = await forecastOn(page, today, 1000000);
    expect(remote.horizon).toBe('9999-12-31');
    expect(remote.projectedDeadline).toBeNull();
    expect(remote.earliestDeadline).toBeNull();
    expect(remote.latestDeadline).toBeNull();
    expect(remote.projectionLabel).toContain('beyond supported date range');
    expect(remote.rangeLabel).toContain('beyond supported date range');
  }
});
