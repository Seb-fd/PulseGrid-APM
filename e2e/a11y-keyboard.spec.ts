import { test, expect } from '@playwright/test';

/**
 * Delta 003 E2E: keyboard operability + accessible names. Hermetic where a
 * stream is needed (dead-port WS forces sim fallback); plain routes elsewhere.
 */
const DEAD = 'ws://127.0.0.1:9/dead';

test.describe('GIVEN keyboard-only navigation', () => {
  test('WHEN Tab enters the page THEN skip link comes first and jumps to main', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await skip.press('Enter');
    expect(await page.evaluate(() => location.hash)).toBe('#main');
  });

  test('WHEN dashboard controls render THEN icon buttons expose names', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Hide Topology' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move Latency earlier' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move Latency later' })).toBeVisible();
  });
});

test.describe('GIVEN the topology map in outage sim mode', () => {
  test('WHEN Enter hits a node THEN detail opens; WHEN Space hits THEN no scroll', async ({
    page,
  }) => {
    await page.goto(`/topology?liveUrl=${DEAD}&scenario=outage`);
    await expect(page.getByTestId('topology-svg')).toBeVisible({ timeout: 30_000 });

    const ledger = page.getByTestId('node-ledger');
    await ledger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('topology-detail')).toContainText('Ledger');

    const auth = page.getByTestId('node-auth');
    await auth.focus();
    const y0 = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('topology-detail')).toContainText('Auth');
    expect(await page.evaluate(() => window.scrollY)).toBe(y0);
  });
});

test.describe('GIVEN telemetry charts', () => {
  test('WHEN cards render THEN each carries a screen-reader data summary', async ({ page }) => {
    await page.goto('/telemetry');
    await expect(page.getByTestId('chart-cpu')).toBeVisible({ timeout: 30_000 });
    // The stream (live or sim fallback) lands asynchronously — poll like other stream specs.
    await expect
      .poll(async () => page.getByTestId('chart-alt-cpu').textContent(), { timeout: 45_000 })
      .toContain('Latest');
    await expect(page.getByTestId('chart-alt-cpu')).toContainText('window average');
  });
});

test.describe('GIVEN the alerts page', () => {
  test('WHEN quiet THEN the alert live region persists without a banner', async ({ page }) => {
    await page.goto(`/alerts?liveUrl=${DEAD}&scenario=latency-burst`);
    await expect(page.getByTestId('rule-save')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('incident-alert-region')).toBeAttached({ timeout: 30_000 });
  });
});
