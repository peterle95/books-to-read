const { test, expect } = require('@playwright/test');

for (const [name, viewport] of Object.entries({
  mobile: { width: 375, height: 812 },
  tablet: { width: 1280, height: 800 },
  desktop: { width: 1440, height: 900 },
})) {
  test(`${name} screens keep Android-style navigation and content inside the viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const screens = ['session', 'plan', 'books', 'charts', 'settings'];

    for (const screen of screens) {
      if (screen === 'settings') {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
      } else if (screen !== 'session') {
        await nav.getByRole('button', { name: screen[0].toUpperCase() + screen.slice(1), exact: true }).click();
      }
      const panel = page.locator(`#screen-${screen}`);
      await expect(panel).toBeVisible();
      await expect(page.locator('main > .screen:not([hidden])')).toHaveCount(1);
      const layout = await page.evaluate(() => {
        const bounds = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          header: bounds('.app-header'),
          main: bounds('main'),
          nav: bounds('.tab-bar'),
          screen: bounds('main > .screen:not([hidden])'),
        };
      });
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.main.left).toBeGreaterThanOrEqual(0);
      expect(layout.main.right).toBeLessThanOrEqual(viewport.width);
      expect(layout.screen.left).toBeGreaterThanOrEqual(layout.main.left);
      expect(layout.screen.right).toBeLessThanOrEqual(layout.main.right);
      expect(layout.header.bottom).toBeLessThanOrEqual(layout.screen.top);
      expect(layout.nav.top).toBeGreaterThan(viewport.height - 110);
      expect(layout.nav.bottom).toBeLessThanOrEqual(viewport.height);
      const items = await page.locator(`#screen-${screen} > section, #screen-${screen} > form, #screen-session, .tab-bar button`).evaluateAll((nodes) =>
        nodes.filter((node) => node.getClientRects().length).map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        }));
      for (const item of items) {
        expect(item.width).toBeGreaterThan(0);
        expect(item.left).toBeGreaterThanOrEqual(0);
        expect(item.right).toBeLessThanOrEqual(viewport.width);
      }
      const screenshot = testInfo.outputPath(`${name}-${screen}.png`);
      await page.screenshot({ path: screenshot });
      await testInfo.attach(`${name}-${screen}`, { path: screenshot, contentType: 'image/png' });
    }
  });
}
