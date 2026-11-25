const { expect } = require('@playwright/test');

async function confirmBundleImport(page, accept = true) {
  const button = page.getByRole('button', { name: 'Import bundle', exact: true });
  let prompted = false;
  page.once('dialog', (dialog) => {
    prompted = true;
    return accept ? dialog.accept() : dialog.dismiss();
  });
  await button.click();
  // The JSON source status may already be "loaded" before a replacement starts.
  await expect(button).toBeEnabled();
  await expect(page.getByTestId('bundle-status')).toBeEmpty();
  expect(prompted, 'Import should ask for confirmation').toBe(true);
}

module.exports = { confirmBundleImport };
