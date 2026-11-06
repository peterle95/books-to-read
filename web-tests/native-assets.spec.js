const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const hashes = {
  'Roboto-Regular.woff2': '697837d196a61b1dfc60928a80e35164c3f2525871b811e363517752a952d593',
  'ic-menu-manage-api35-xxhdpi.png': '1463cc538c405e5d1d33b9b298d0773a8f65e7b55f9246fe3b6b1f7a458d9065',
  'LICENSE-Apache-2.0.txt': '3ddf9be5c28fe27dad143a5dc76eea25222ad1dd68934a047064e56ed2fa40c5',
};
const assets = ['android-native.css', ...Object.keys(hashes).map(name => `assets/android/${name}`), 'assets/android/THIRD-PARTY-NOTICES.md'];

async function expectRoboto(page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => {
    const face = [...document.fonts].find(face => face.family === 'AndroidRoboto');
    return face?.status === 'loaded' && face.weight === '100 900'
      && [400, 500, 700].every(weight => document.fonts.check(`${weight} 16px AndroidRoboto`, 'Reading Plan'));
  })).toBe(true);
}

test('distributed assets retain exact API35 source hashes and are served locally', async ({ request }) => {
  for (const [name, expected] of Object.entries(hashes)) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', 'android', name));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
    const response = await request.get(`assets/android/${name}`);
    expect(response.ok()).toBe(true);
    expect(await response.body()).toEqual(bytes);
    if (name.endsWith('.woff2')) expect(response.headers()['content-type']).toBe('font/woff2');
  }
  expect((await request.get('assets/other/file.png')).status()).toBe(404);
});

test('local variable Roboto replaces browser and scoped history fallbacks', async ({ page }) => {
  await page.goto('./');
  await expectRoboto(page);
  for (const selector of ['html', 'body', '#open-entries', '#session-date', '#entries-book', '#plan']) {
    await expect(page.locator(selector)).toHaveCSS('font-family', 'AndroidRoboto, sans-serif');
  }
  await expect(page.locator('body')).toHaveCSS('font-weight', '400');
  // Native actionButton leaves AppTheme's explicit sans family at normal weight.
  await expect(page.locator('#open-entries')).toHaveCSS('font-weight', '400');
  await expect(page.locator('h1')).toHaveCSS('font-weight', '700');
  // Exercise the scoped rule without importing or changing a reading plan.
  await page.locator('#entries-content').evaluate(element => {
    const title = document.createElement('h3');
    title.textContent = 'Synthetic history title';
    element.prepend(title);
  });
  const title = page.locator('#entries-content h3');
  await expect(title).toHaveCSS('font-family', 'AndroidRoboto, sans-serif');
  await expect(title).toHaveCSS('letter-spacing', 'normal');
  await expect(title).toHaveCSS('font-size', '16px');
});

test('Settings uses the exact centered 32dp alpha-mask resource inside its 48dp button', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 732 });
  await page.goto('./');
  await expectRoboto(page);
  const button = page.getByRole('button', { name: 'Settings', exact: true });
  const icon = button.locator('.native-settings-icon');
  await expect(icon).toHaveAttribute('aria-hidden', 'true');
  await expect(icon).toHaveCSS('mask-image', /\/books-to-read\/assets\/android\/ic-menu-manage-api35-xxhdpi\.png/);
  await expect(icon).toHaveCSS('mask-mode', 'alpha');
  await expect(icon).toHaveCSS('background-color', 'rgb(255, 248, 240)');
  await expect(icon).toHaveCSS('opacity', '1');
  const box = await button.boundingBox(), glyph = await icon.boundingBox();
  expect([box.width, box.height, glyph.width, glyph.height]).toEqual([48, 48, 32, 32]);
  expect([glyph.x - box.x, glyph.y - box.y]).toEqual([8, 8]);
  expect(await page.evaluate(async () => {
    const image = new Image();
    image.src = './assets/android/ic-menu-manage-api35-xxhdpi.png';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let alpha = 0;
    for (let index = 3; index < pixels.length; index += 4) alpha = Math.max(alpha, pixels[index]);
    return [image.width, image.height, alpha];
  })).toEqual([96, 96, 153]);
  await button.click();
  await expect(page.locator('#screen-settings')).toBeVisible();
});

test('native stylesheet, font, icon and attribution survive a network-blocked offline reload', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  expect(await page.evaluate(async (assets) => {
    const keys = (await caches.keys()).filter(key => key.startsWith('reading-plan-'));
    const cache = await caches.open(keys[0]);
    return Promise.all(assets.map(async name => !!await cache.match(new URL(name, location.href).href)));
  }, assets)).toEqual(assets.map(() => true));
  await context.route('**/*', route => route.abort());
  await context.setOffline(true);
  await page.reload();
  await expectRoboto(page);
  await expect(page.locator('.native-settings-icon')).toBeVisible();
  for (const name of assets) {
    const responsePromise = page.waitForResponse(response => response.url().endsWith(`/${name}`));
    const ok = await page.evaluate(async name => (await fetch(new URL(name, location.href))).ok, name);
    expect(ok).toBe(true);
    expect((await responsePromise).fromServiceWorker()).toBe(true);
  }
});
