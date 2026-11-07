const { test, expect } = require('@playwright/test');
const path = require('node:path');

const load = async (page, value = '2026-11-06', nested = false) => {
  await page.goto('./');
  await page.addStyleTag({ path: path.join(__dirname, '../web/android-calendar.css') });
  await page.addScriptTag({ path: path.join(__dirname, '../web/android-calendar.js') });
  await page.evaluate(({ value, nested }) => {
    const host = document.createElement(nested ? 'dialog' : 'div'); host.id = 'calendar-host';
    host.style.cssText = 'position:fixed;top:0;left:0;background:white;z-index:10000;padding:8px';
    host.innerHTML = '<label for="calendar-date">Reading date</label><input id="calendar-date" name="date" required><button type="button">Other</button>';
    document.body.append(host);
    const input = host.querySelector('input'); input.value = value;
    window.calendarEvents = [];
    for (const type of ['input', 'change']) input.addEventListener(type, () => calendarEvents.push([type, input.value]));
    ReadingCalendar.attach(input);
    ReadingCalendar.attach(input);
    if (nested) host.showModal();
  }, { value, nested });
};
const field = (page) => page.getByLabel('Reading date', { exact: true });
const calendar = (page) => page.getByRole('dialog', { name: 'Choose date' });
const cell = (page, name) => page.getByRole('gridcell', { name, exact: true });
const events = (page) => page.evaluate(() => calendarEvents);
const bundle = (page) => page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));

test('visible readonly field preserves identity; pointer selection drafts and commits exactly once', async ({ page }) => {
  await load(page);
  const before = await bundle(page);
  await expect(field(page)).toHaveAttribute('readonly', '');
  await expect(field(page)).toHaveAttribute('required', '');
  await expect(field(page)).toHaveAttribute('id', 'calendar-date');
  expect(await page.locator('#reading-calendar').count()).toBe(0);
  await field(page).click();
  await expect(cell(page, 'Friday, November 6, 2026')).toHaveAttribute('aria-selected', 'true');
  await cell(page, 'Saturday, November 7, 2026').click();
  await expect(field(page)).toHaveValue('2026-11-06');
  expect(await events(page)).toEqual([]);
  await calendar(page).getByRole('button', { name: 'CANCEL', exact: true }).click();
  await expect(field(page)).toBeFocused();
  await field(page).press('Enter');
  await cell(page, 'Saturday, November 7, 2026').click();
  await calendar(page).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(field(page)).toHaveValue('2026-11-07');
  expect(await events(page)).toEqual([['input', '2026-11-07'], ['change', '2026-11-07']]);
  await field(page).click();
  await calendar(page).getByRole('button', { name: 'OK', exact: true }).click();
  expect(await events(page)).toHaveLength(2);
  expect(await bundle(page)).toBe(before);
  expect(await page.locator('#reading-calendar').count()).toBe(1);
});

test('saved month/year, impossible-date fallback, disabled and shared owner are respected', async ({ page }) => {
  await load(page, '2026-12-01');
  await field(page).click();
  await expect(page.locator('#reading-calendar-month')).toHaveText('December 2026');
  await expect(cell(page, 'Tuesday, December 1, 2026')).toHaveAttribute('aria-selected', 'true');
  await calendar(page).getByRole('button', { name: 'Choose year' }).click();
  await calendar(page).getByRole('button', { name: '2028', exact: true }).click();
  await expect(page.locator('#reading-calendar-month')).toHaveText('December 2028');
  await calendar(page).getByRole('button', { name: 'Previous month' }).click();
  await expect(page.locator('#reading-calendar-month')).toHaveText('November 2028');
  await page.keyboard.press('Escape');
  await expect(field(page)).toHaveValue('2026-12-01');
  expect(await events(page)).toEqual([]);
  await page.evaluate(() => { document.querySelector('#calendar-date').value = '2027-02-29'; });
  await field(page).click();
  const current = await page.evaluate(() => { const date = new Date(); return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date); });
  await expect(page.locator('#reading-calendar-month')).toHaveText(current);
  await expect(calendar(page).locator('[aria-current="date"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(field(page)).toHaveValue('2027-02-29');
  await field(page).evaluate((input) => { input.disabled = true; input.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await expect(calendar(page)).not.toBeVisible();
  expect(await events(page)).toEqual([]);
});

test('roving keyboard handles weeks, clamped months/years, selection and native Tab containment', async ({ page }) => {
  await load(page, '2028-01-31');
  await field(page).press('Space');
  await expect(cell(page, 'Monday, January 31, 2028')).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(cell(page, 'Tuesday, February 29, 2028')).toBeFocused();
  await page.keyboard.press('Shift+PageDown');
  await expect(cell(page, 'Wednesday, February 28, 2029')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(cell(page, 'Sunday, February 25, 2029')).toBeFocused();
  await page.keyboard.press('End');
  await expect(cell(page, 'Saturday, March 3, 2029')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 'Saturday, March 3, 2029')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cell(page, 'Saturday, March 3, 2029')).toHaveAttribute('aria-selected', 'true');
  await expect(field(page)).toHaveValue('2028-01-31');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await calendar(page).evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await calendar(page).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(field(page)).toHaveValue('2029-03-03');
});

test('nested editor stays open on topmost Escape and focus returns without events', async ({ page }) => {
  await load(page, '0099-12-31', true);
  const before = await bundle(page);
  await field(page).click();
  await expect(cell(page, 'Thursday, December 31, 99')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await expect(page.locator('#calendar-host')).toBeVisible();
  await expect(calendar(page)).not.toBeVisible();
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('0099-12-31');
  expect(await events(page)).toEqual([]);
  expect(await bundle(page)).toBe(before);
  await field(page).press('ArrowDown');
  await expect(calendar(page)).toBeVisible();
});

test('year navigation does not select until activated, scroll range extends, shared picker loads another field', async ({ page }) => {
  await load(page, '2028-02-29');
  await field(page).click();
  await calendar(page).getByRole('button', { name: 'Choose year' }).click();
  await page.keyboard.press('ArrowDown');
  await expect(calendar(page).getByRole('button', { name: '2029', exact: true })).toBeFocused();
  await expect(calendar(page).getByRole('button', { name: '2028', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'Wednesday, February 28, 2029')).toHaveAttribute('aria-selected', 'true');
  await calendar(page).getByRole('button', { name: 'Choose year' }).click();
  await page.locator('.reading-calendar-years').evaluate((list) => { list.scrollTop = list.scrollHeight; });
  await expect(calendar(page).getByRole('button', { name: '2200', exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'another-date'; input.setAttribute('aria-label', 'Another date');
    document.querySelector('#calendar-host').append(input);
    ReadingCalendar.attach(input, { initialDate: '2000-02-29' });
  });
  await page.getByLabel('Another date').click();
  await expect(cell(page, 'Tuesday, February 29, 2000')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Another date')).toHaveValue('');
  await expect(page.getByLabel('Another date')).toBeFocused();
  expect(await page.locator('#reading-calendar').count()).toBe(1);
  expect(await events(page)).toEqual([]);
});

for (const timezoneId of ['America/Los_Angeles', 'Pacific/Auckland']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('leap dates, early years and DST use calendar components without rollover', async ({ page }) => {
      await load(page, '0004-02-29');
      await field(page).click();
      await expect(calendar(page).locator('[aria-selected="true"]')).toHaveText('29');
      await page.keyboard.press('PageDown');
      await page.keyboard.press('Space');
      await calendar(page).getByRole('button', { name: 'OK', exact: true }).click();
      await expect(field(page)).toHaveValue('0004-03-29');
      for (const [start, end] of [['2028-03-11', '2028-03-12'], ['2028-04-01', '2028-04-02'], ['2028-11-04', '2028-11-05'], ['0099-12-31', '0100-01-01']]) {
        await field(page).evaluate((input, value) => { input.value = value; }, start);
        await field(page).click();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Space');
        await calendar(page).getByRole('button', { name: 'OK', exact: true }).click();
        await expect(field(page)).toHaveValue(end);
      }
    });
  });
}

test('calendar follows bundle year bounds and never offers year zero', async ({ page }) => {
  await load(page, '0001-01-01');
  const before = await bundle(page);
  await field(page).click();
  await expect(calendar(page).getByRole('button', { name: 'Previous month' })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(calendar(page).locator('[aria-selected="true"]')).toBeFocused();
  await calendar(page).getByRole('button', { name: 'Choose year' }).click();
  await expect(calendar(page).getByRole('button', { name: '0', exact: true })).toHaveCount(0);
  await page.keyboard.press('Home');
  await expect(calendar(page).getByRole('button', { name: '1', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(calendar(page).getByRole('button', { name: '1', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  for (const value of ['0001-01-01', '0004-02-29', '0096-02-29', '0099-12-31', '0100-03-01', '9999-12-31']) {
    await field(page).evaluate((input, value) => { input.value = value; }, value);
    await field(page).click();
    await expect(calendar(page).getByRole('button', { name: 'Choose year' })).toHaveText(String(Number(value.slice(0, 4))));
    await expect(calendar(page).locator('[aria-selected="true"]')).toHaveText(String(Number(value.slice(-2))));
    if (value === '9999-12-31') {
      await expect(calendar(page).getByRole('button', { name: 'Next month' })).toBeDisabled();
      await page.keyboard.press('ArrowRight');
      await expect(calendar(page).locator('[aria-selected="true"]')).toBeFocused();
    }
    await calendar(page).getByRole('button', { name: 'OK', exact: true }).click();
    await expect(field(page)).toHaveValue(value);
  }
  for (const value of ['0000-02-29', '0100-02-29']) {
    await field(page).evaluate((input, value) => { input.value = value; AndroidControls.sync(input); }, value);
    expect(await field(page).evaluate((input) => input.validationMessage || input.validity.customError)).toBeTruthy();
    await field(page).click();
    await expect(calendar(page).locator('[aria-current="date"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(field(page)).toHaveValue(value);
  }
  expect(await events(page)).toEqual([]);
  expect(await bundle(page)).toBe(before);
});

test('360x732 framework geometry and screenshot artifact match accepted reference bounds', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 732 });
  await load(page);
  await field(page).click();
  const box = await calendar(page).boundingBox();
  expect(box.x).toBe(36); expect(box.width).toBe(288);
  expect(Math.abs(box.y - (430 - 72) / 3)).toBeLessThan(1);
  await expect(page.locator('.reading-calendar-header')).toHaveCSS('height', '93px');
  await expect(page.locator('.reading-calendar-header')).toHaveCSS('background-color', 'rgb(181, 107, 60)');
  const selected = await cell(page, 'Friday, November 6, 2026').boundingBox();
  expect(Math.abs(selected.x - 698 / 3)).toBeLessThan(1);
  expect(Math.abs(selected.y - (1003 - 72) / 3)).toBeLessThan(1);
  expect(selected.height).toBe(40);
  await page.screenshot({ path: testInfo.outputPath('month-360x732.png') });
  await calendar(page).getByRole('button', { name: 'Choose year' }).click();
  await expect(page.locator('.reading-calendar-years [aria-pressed="true"]')).toHaveCSS('height', '59px');
  const yearBox = await page.locator('.reading-calendar-years [aria-pressed="true"]').boundingBox();
  expect(Math.abs(yearBox.y - (952 - 72) / 3)).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('year-360x732.png') });
});

test('API35 SimpleMonthView typography and source baselines hold at 360x732', async ({ page }) => {
  // AOSP android15-release core/res: date_picker_month_text_size 14sp,
  // date_picker_day_of_week_text_size and date_picker_day_text_size 12sp,
  // date_picker_month_height 56dp, date_picker_day_of_week_height 36dp,
  // date_picker_day_height 40dp and day_picker_padding_top 6dp.
  // SimpleMonthView centers Paint ascent/descent without text-view font padding.
  // Shipped Roboto hhea is 1900/-500 over 2048 upem, so the source baseline in a
  // box of height h is (h + (1900 - 500) * fontSize / 2048) / 2 below its top.
  await page.setViewportSize({ width: 360, height: 732 });
  await load(page);
  await field(page).click();
  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector('#reading-calendar');
    // A zero-height inline-block's top edge sits on the used text baseline.
    const baseline = (element) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;padding:0;margin:0;border:0';
      element.prepend(probe);
      const offset = probe.getBoundingClientRect().top - element.getBoundingClientRect().top;
      probe.remove();
      return offset;
    };
    const style = (element) => getComputedStyle(element);
    const title = dialog.querySelector('.reading-calendar-navigation span');
    const weekdays = dialog.querySelector('.reading-calendar-weekdays');
    const weekday = weekdays.querySelector('span');
    const day = dialog.querySelector('.reading-calendar-grid button');
    return {
      navigation: { height: parseFloat(style(dialog.querySelector('.reading-calendar-navigation')).height) },
      weekdays: { height: parseFloat(style(weekdays).height) },
      title: { size: style(title).fontSize, weight: style(title).fontWeight, height: title.getBoundingClientRect().height, baseline: baseline(title) },
      weekday: { size: style(weekday).fontSize, weight: style(weekday).fontWeight, height: weekday.getBoundingClientRect().height, baseline: baseline(weekday) },
      day: { size: style(day).fontSize, weight: style(day).fontWeight, height: day.getBoundingClientRect().height, baseline: baseline(day) },
    };
  });
  const sourceBaseline = (height, fontSize) => (height + (1900 - 500) * fontSize / 2048) / 2;
  // Chromium quantizes ascent/descent to whole CSS pixels; the remaining delta is
  // under a quarter CSS pixel and is recorded in docs/evidence/issue-46.
  const close = (actual, expected) => expect(Math.abs(actual - expected)).toBeLessThan(0.25);
  expect(metrics.navigation.height).toBe(56);
  expect(metrics.weekdays.height).toBe(36);
  expect(metrics.title.size).toBe('14px');
  expect(metrics.title.weight).toBe('500');
  close(metrics.title.baseline, sourceBaseline(metrics.title.height, 14));
  expect(metrics.weekday.size).toBe('12px');
  expect(metrics.weekday.weight).toBe('400');
  close(metrics.weekday.baseline, sourceBaseline(metrics.weekday.height, 12));
  expect(metrics.day.size).toBe('12px');
  expect(metrics.day.weight).toBe('400');
  expect(metrics.day.height).toBe(40);
  close(metrics.day.baseline, sourceBaseline(metrics.day.height, 12));
});
