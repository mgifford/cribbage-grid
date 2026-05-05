// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

/**
 * Accessibility tests for Cribbage Grid.
 * Each test runs axe-core on the initial page load and checks for
 * WCAG 2.1 AA violations.  The Playwright config in playwright.config.js
 * drives these tests across four project variants:
 *   - desktop-light  (1280×720, prefers-color-scheme: light)
 *   - desktop-dark   (1280×720, prefers-color-scheme: dark)
 *   - mobile-light   (Pixel 5,  prefers-color-scheme: light)
 *   - mobile-dark    (Pixel 5,  prefers-color-scheme: dark)
 */

/** The app is built with homepage="/cribbage-grid", so assets live under that path. */
const APP_PATH = '/cribbage-grid/';

test.describe('Accessibility – initial page load', () => {
  test('should have no WCAG 2.1 AA violations on the setup screen', async ({ page }) => {
    await page.goto(APP_PATH);

    // Wait for the setup modal to appear (it renders on first load)
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map((v) => {
          const nodes = v.nodes
            .map((n) => `      - ${n.html.slice(0, 120)}`)
            .join('\n');
          return `[${v.impact}] ${v.id}: ${v.description}\n${nodes}`;
        })
        .join('\n\n');
      throw new Error(`Accessibility violations:\n\n${summary}`);
    }

    expect(results.violations).toHaveLength(0);
  });
});

test.describe('Accessibility – in-game view', () => {
  test('should have no WCAG 2.1 AA violations after starting a game', async ({ page }) => {
    await page.goto(APP_PATH);

    // Wait for the setup modal and start a default (1 human vs CPU) game
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

    // Click "Start Game" button (defaults are 1 human + 1 CPU, which is always valid)
    await page.click('button:has-text("Start Game")');

    // Wait for the game board table to render
    await page.waitForSelector('table', { timeout: 10000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map((v) => {
          const nodes = v.nodes
            .map((n) => `      - ${n.html.slice(0, 120)}`)
            .join('\n');
          return `[${v.impact}] ${v.id}: ${v.description}\n${nodes}`;
        })
        .join('\n\n');
      throw new Error(`Accessibility violations:\n\n${summary}`);
    }

    expect(results.violations).toHaveLength(0);
  });
});
