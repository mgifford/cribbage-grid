// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Desktop – light mode
    {
      name: 'desktop-light',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'light',
      },
    },
    // Desktop – dark mode
    {
      name: 'desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
      },
    },
    // Mobile – light mode
    {
      name: 'mobile-light',
      use: {
        ...devices['Pixel 5'],
        colorScheme: 'light',
      },
    },
    // Mobile – dark mode
    {
      name: 'mobile-dark',
      use: {
        ...devices['Pixel 5'],
        colorScheme: 'dark',
      },
    },
  ],
  webServer: {
    // Serve from a directory that mirrors the /cribbage-grid/ path prefix
    // expected by the production-built assets (see "homepage" in package.json).
    command: 'mkdir -p /tmp/pw_serve && ln -sfn "$(pwd)/build" /tmp/pw_serve/cribbage-grid && npx serve /tmp/pw_serve -l 3000',
    url: 'http://localhost:3000/cribbage-grid/',
    reuseExistingServer: !process.env.CI,
  },
});
