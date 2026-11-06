const { defineConfig } = require('@playwright/test');
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);

module.exports = defineConfig({
  testDir: './web-tests',
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}/books-to-read/` },
  webServer: {
    command: 'node web-tests/server.js',
    port,
    reuseExistingServer: false,
  },
});
