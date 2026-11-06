const { expect } = require('@playwright/test');

async function chooseDate(page, field, value) {
  const [year, month, day] = value.split('-').map(Number);
  await field.click();
  const calendar = page.getByRole('dialog', { name: 'Choose date', exact: true });
  await calendar.getByRole('button', { name: 'Choose year', exact: true }).click();
  await calendar.getByRole('button', { name: String(year), exact: true }).click();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonth = months.indexOf((await calendar.locator('#reading-calendar-month').textContent()).split(' ')[0]) + 1;
  for (let step = 0; step < Math.abs(month - currentMonth); step++) {
    await calendar.getByRole('button', { name: month < currentMonth ? 'Previous month' : 'Next month', exact: true }).click();
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const name = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  await calendar.getByRole('gridcell', { name, exact: true }).click();
  await calendar.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(field).toHaveValue(value);
}

module.exports = { chooseDate };
