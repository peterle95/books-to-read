const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './web-tests',
  use: { baseURL: 'http://127.0.0.1:4173/books-to-read/' },
  webServer: {
    command: 'node web-tests/server.js',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
