const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');

const fixture = (count = 10) => {
  const sections = ['Physical books', 'Digital books', 'Audiobooks'].map((label) => ({
    label, books: [], simultaneous_groups: [], baseline_needs_recalculation: false,
  }));
  const planned = structuredClone(sections);
  planned[0].books = Array.from({ length: count }, (_, i) => ({
    id: `planned-${i}`, number: i + 1, title: count === 1 ? 'Synthetic next quarter' : `Planned book ${i + 1}`, start_page: 1, end_page: 20,
    current_page: null, pages: 20, pages_read: 0, baseline_schedule: null,
    deadline_override: null, start_date_override: null, target_completed_date: null,
  }));
  const data = {
    'plan.json': { schema_version: 2, start_date: '2026-10-01', end_date: '2026-12-31', end_label: 'Quarter end', rest_days: [],
      stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true } },
    'books.json': { schema_version: 2, sections, planned_quarter: { start_date: '2027-01-01', sections: planned } },
    'sessions.json': { schema_version: 2, sessions: {} },
  };
  const files = Object.entries(data).map(([name, value]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }));
  files.push({ name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema_version: 2,
    revision: 1, last_modified: '2026-11-06', modified_by: 'fixture',
    files: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])) })) });
  return files;
};

test.use({ deviceScaleFactor: 3, timezoneId: 'Europe/Berlin' });
for (const width of [360, 1440]) {
  test(`quarter scroll keeps its title/footer and native action hierarchy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 732 });
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Bundle files').setInputFiles(fixture());
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
    const heading = page.locator('#quarter-dialog-heading');
    const footer = page.locator('.quarter-actions');
    const before = [await heading.boundingBox(), await footer.boundingBox()];
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(footer).toBeInViewport({ ratio: 1 });
    const content = page.locator('#quarter-content');
    expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect([await heading.boundingBox(), await footer.boundingBox()]).toEqual(before);
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(footer).toBeInViewport({ ratio: 1 });
    expect(await page.locator('#quarter-dialog').evaluate((el) => el.scrollTop)).toBe(0);
    const actions = page.locator('#quarter-book-form > button:not([role="combobox"]), .quarter-remove > button');
    await expect(actions).toHaveText(['Add', 'Update selected', 'Remove selected']);
    const boxes = await actions.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].bottom);
    expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[1].bottom);
    expect(boxes.map((box) => box.x)).toEqual([boxes[0].x, boxes[0].x, boxes[0].x]);
    await expect(page.locator('#remove-planned-book')).toHaveCSS('background-color', 'rgb(247, 237, 226)');
    await expect(page.locator('#remove-planned-book')).toHaveCSS('color', 'rgb(58, 36, 26)');
    const combo = page.locator('#quarter-section-trigger');
    await expect(combo).toHaveCSS('font-size', '15px');
    await combo.click();
    for (const option of await page.getByRole('option').all()) await expect(option).toHaveCSS('font-size', '15px');
    await combo.press('End');
    await combo.press('Escape');
    await expect(combo).toBeFocused();
    await expect(combo).toHaveText('Physical books');
    await page.locator('#cancel-quarter').click();
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
  });
}

// Bounded geometry reference: native-quarter-panels-20261106-234244-1117510e.
// Synthetic bundle matches the visible planned date/title/format, not the native
// bundle bytes (that capture already diverged from its original host fixture).
for (const width of [360, 1440]) {
  test(`measured native quarter panels and responsive allocation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 732 });
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const files = fixture(1);
    await testInfo.attach('fixture-boundary', { body: JSON.stringify({
      reference: 'native-quarter-panels-20261106-234244-1117510e/measurements.json',
      byteIdenticalToNative: false, date: '2027-01-01', title: 'Synthetic next quarter', format: 'Physical books',
      sha256: Object.fromEntries(files.map(({ name, buffer }) => [name, createHash('sha256').update(buffer).digest('hex')])),
    }, null, 2), contentType: 'application/json' });
    await page.getByLabel('Bundle files').setInputFiles(files);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Import bundle', exact: true }).click();
    await expect(page.getByTestId('bundle-status')).toHaveText('Bundle imported on this device.');
    const original = await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'));
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#quarter-dialog-heading')).toHaveText('Next quarter — 2027-01-01');
    // Issue #49: paint the API35 decor approximation outside the verified box.
    // Chromium serializes .039 through its 8-bit alpha as .04; the backdrop stays
    // the dimmed page so the measured shadow band is comparable across captures.
    const panel = page.locator('#quarter-dialog');
    await expect(panel).toHaveCSS('box-shadow', 'rgba(0, 0, 0, 0.19) 0px 4px 18px 0px, rgba(0, 0, 0, 0.04) 0px 3px 28px 0px');
    await expect(panel).toHaveCSS('border-radius', '2px');
    expect(await panel.evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0.6)');
    await expect(page.locator('#quarter-title')).toBeEmpty();
    const content = page.locator('#quarter-content');
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const selectors = ['#quarter-dialog', '#quarter-dialog-heading', '#quarter-content', '#quarter-content-box',
      '#quarter-list', '#quarter-list button', '#quarter-book-form label', '#quarter-section-trigger', '#quarter-book-form > button[type="submit"]',
      '#update-planned-book', '#remove-planned-book', '.quarter-actions', '#cancel-quarter', '#save-quarter'];
    const geometry = await page.evaluate((selectors) => Object.fromEntries(selectors.map((selector) => {
      const el = document.querySelector(selector);
      return [selector, { ...el.getBoundingClientRect().toJSON(), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }];
    })), selectors);
    await testInfo.attach('quarter-bottom-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    await testInfo.attach('quarter-bottom', { body: await page.screenshot(), contentType: 'image/png' });
    // Paint intent only: CSS blur is not an exact Android elevation conversion.
    const ordinary = page.locator('#quarter-list button, #quarter-book-form > button:not([role="combobox"]), .quarter-remove > button');
    // Chromium serializes .039 through its 8-bit alpha as .04.
    const shadow = 'rgba(0, 0, 0, 0.19) 0px 2px 3px 0px, rgba(0, 0, 0, 0.04) 0px 0px 2px 0px';
    for (const button of await ordinary.all()) {
      // Full-width planned/Remove shadows live on a clipped sibling: API35
      // clipToPadding keeps only the corner slivers, and the button itself must
      // stay unclipped for its 3px/2px focus outline. Add/Update stay unclipped.
      const direct = await button.evaluate((el) => el.type === 'submit' || el.id === 'update-planned-book');
      await expect(button).toBeEnabled();
      await expect(button).toHaveCSS('box-shadow', direct ? shadow : 'none');
      if (!direct) {
        const cast = button.locator('xpath=preceding-sibling::*[1][@class="quarter-shadow-cast"]');
        await expect(cast).toHaveCount(1);
        const layer = await cast.evaluate((el) => ({
          shadow: getComputedStyle(el, '::before').boxShadow,
          overflow: getComputedStyle(el).overflow,
          pointer: getComputedStyle(el).pointerEvents,
          ancestor: el.closest('button') !== null,
          rect: el.getBoundingClientRect().toJSON(),
        }));
        expect(layer.shadow).toBe(shadow);
        expect(layer.overflow).toBe('hidden');
        expect(layer.pointer).toBe('none');
        expect(layer.ancestor).toBe(false);
        const box = await button.boundingBox();
        expect([layer.rect.x, layer.rect.y, layer.rect.width, layer.rect.height]).toEqual([box.x, box.y, box.width, box.height]);
      }
      const bounds = await button.boundingBox();
      await button.evaluate((el) => { el.disabled = true; });
      await expect(button).toHaveCSS('box-shadow', 'none');
      expect(await button.boundingBox()).toEqual(bounds);
      await button.evaluate((el) => { el.disabled = false; });
      await expect(button).toHaveCSS('box-shadow', direct ? shadow : 'none');
    }
    for (const button of await page.locator('.quarter-actions button, #quarter-section-trigger').all()) {
      await expect(button).toHaveCSS('box-shadow', 'none');
    }
    for (const [index, button] of (await ordinary.all()).entries()) {
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      await expect(button).toHaveCSS('outline-style', 'solid');
      await expect(button).toHaveCSS('outline-width', '3px');
      await expect(button).toHaveCSS('outline-offset', '2px');
      await testInfo.attach(`quarter-button-focus-${index}`, { body: await page.screenshot({ path: testInfo.outputPath(`quarter-button-focus-${index}.png`) }), contentType: 'image/png' });
      await button.blur();
    }
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    for (const button of await page.locator('.quarter-actions button').all()) await expect(button).toHaveCSS('font-weight', '400');
    // Issue #50: native footer glyph ink relative to the footer top at DPR3,
    // measured from the retained API35 capture (docs/evidence/issue-48/
    // native-bottom.png, the source named in the issue's native capture).
    // Native CANCEL is [412,79,153,30] and SAVE PLAN is [641,79,213,30]; the
    // browser previously painted both at y0=81. Allow one physical px of raster
    // tolerance, which still rejects the two-pixel baseline offset.
    const footerInk = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      const pixels = [];
      for (let index = 0; index < data.length; index += 4) {
        const [r, g, b] = [data[index], data[index + 1], data[index + 2]];
        if (r > 120 && r < 215 && g > 60 && g < 145 && b < 110 && r - b > 70 && r - g > 40) {
          pixels.push([(index / 4) % image.width, Math.floor(index / 4 / image.width)]);
        }
      }
      const columns = [...new Set(pixels.map(([x]) => x))].sort((a, b) => a - b);
      const clusters = [];
      for (const column of columns) {
        const last = clusters[clusters.length - 1];
        if (last && column - last.x1 <= 6) last.x1 = column; else clusters.push({ x0: column, x1: column });
      }
      const words = [];
      for (const cluster of clusters) {
        const last = words[words.length - 1];
        if (last && cluster.x0 - last.x1 <= 40) last.x1 = cluster.x1; else words.push({ ...cluster });
      }
      return words.map(({ x0, x1 }) => {
        const rows = pixels.filter(([x]) => x >= x0 && x <= x1).map(([, y]) => y);
        return { x0, width: x1 - x0 + 1, y0: Math.min(...rows), height: Math.max(...rows) - Math.min(...rows) + 1 };
      });
    }, (await page.locator('.quarter-actions').screenshot()).toString('base64'));
    const nativeFooterInk = [{ x0: 412, width: 153, y0: 79 }, { x0: 641, width: 213, y0: 79 }];
    console.log('[DEBUG-ci-footer]', JSON.stringify({ width, footerInk, geometry: geometry['.quarter-actions'] }));
    if (width === 360) {
      expect(footerInk).toHaveLength(nativeFooterInk.length);
      for (const [index, native] of nativeFooterInk.entries()) {
        expect(Math.abs(footerInk[index].x0 - native.x0), `footer word ${index} x0`).toBeLessThanOrEqual(1);
        expect(Math.abs(footerInk[index].width - native.width), `footer word ${index} width`).toBeLessThanOrEqual(1);
        expect(Math.abs(footerInk[index].y0 - native.y0), `footer word ${index} baseline`).toBeLessThanOrEqual(1);
        expect(footerInk[index].height, `footer word ${index} cap height`).toBeLessThanOrEqual(31);
      }
    }
    await testInfo.attach('quarter-footer-ink', { body: JSON.stringify({ native: nativeFooterInk, web: footerInk }, null, 2), contentType: 'application/json' });
    await testInfo.attach('quarter-footer', { body: await page.locator('.quarter-actions').screenshot(), contentType: 'image/png' });
    await testInfo.attach('quarter-footer-text', { body: JSON.stringify(await page.locator('.quarter-actions button').evaluateAll((buttons) => buttons.map((button) => {
      const style = getComputedStyle(button), range = document.createRange();
      range.selectNodeContents(button);
      return { text: button.textContent, weight: style.fontWeight, font: style.font, textBounds: range.getBoundingClientRect().toJSON() };
    })), null, 2), contentType: 'application/json' });
    if (width === 360) {
      const native = {
        '#quarter-dialog': [25, 16, 310, 700], '#quarter-dialog-heading': [25, 16, 310, 45],
        '#quarter-content': [25, 61, 310, 593], '#quarter-content-box': [25, 17, 310, 637],
        '#quarter-list': [41, 72.3333, 278, 87.3333], '#quarter-list button': [57, 84.3333, 246, 55.3333],
        '#quarter-book-form label': [41, 159.6667, 278, 27],
        '#quarter-section-trigger': [41, 186.6667, 278, 48], '#quarter-book-form > button[type="submit"]': [41, 482, 88, 48],
        '#update-planned-book': [41, 534, 131.6667, 48], '#remove-planned-book': [41, 586, 278, 48],
        '.quarter-actions': [25, 654, 310, 62], '#cancel-quarter': [149.3333, 658, 76.6667, 54], '#save-quarter': [226, 658, 97, 54],
      };
      for (const [selector, bounds] of Object.entries(native)) {
        for (const [i, key] of ['x', 'y', 'width', 'height'].entries()) {
          expect(Math.abs(geometry[selector][key] - bounds[i]), `${selector} ${key}`).toBeLessThanOrEqual(1);
        }
      }
      expect(geometry['#quarter-content'].scrollTop).toBe(44);
    } else {
      const wide = geometry['#quarter-dialog'];
      expect(wide.width).toBe(640);
      expect(wide.height).toBeLessThanOrEqual(700);
      expect(wide.y).toBeGreaterThanOrEqual(16);
      expect(wide.bottom).toBeLessThanOrEqual(716);
      expect(geometry['#quarter-content-box'].height).toBeLessThan(637); // wider text reflows
      expect(geometry['#quarter-content'].scrollTop).toBeLessThan(44);
      expect(geometry['#quarter-content'].scrollTop).toBe(geometry['#quarter-content'].scrollHeight - geometry['#quarter-content'].clientHeight);
    }
    const combo = page.locator('#quarter-section-trigger');
    await combo.click();
    const popup = await page.getByRole('listbox').boundingBox();
    await testInfo.attach('quarter-popup-geometry', { body: JSON.stringify(popup), contentType: 'application/json' });
    await testInfo.attach('quarter-popup', { body: await page.screenshot(), contentType: 'image/png' });
    expect(popup.x).toBeCloseTo(geometry['#quarter-section-trigger'].x + 8, 1);
    expect(popup.y).toBeCloseTo(geometry['#quarter-section-trigger'].y, 1);
    expect(popup.width).toBeCloseTo(geometry['#quarter-section-trigger'].width - 16, 1);
    expect(popup.height).toBe(144);
    await combo.press('End');
    await combo.press('Escape');
    await expect(combo).toBeFocused();
    await expect(combo).toHaveText('Physical books');
    await page.locator('#cancel-quarter').click();
    expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
    await testInfo.attach('raw-bundle-after-cancel-sha256', { body: createHash('sha256').update(original).digest('hex'), contentType: 'text/plain' });
    if (width === 1440) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('button', { name: 'Edit next-quarter plan', exact: true }).click();
      const natural = await page.locator('#quarter-dialog').boundingBox();
      expect(natural.height).toBeGreaterThan(700); // no universal 700px cap
      expect(natural.height).toBeLessThan(868);
      expect(await content.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => localStorage.getItem('reading-plan-bundle-v1'))).toBe(original);
    }
  });
}
