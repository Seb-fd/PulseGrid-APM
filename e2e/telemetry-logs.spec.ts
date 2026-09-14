import { test, expect } from '@playwright/test';

/**
 * Delta 003a E2E: telemetry charts + log console.
 * Live Wikimedia WS is unreachable from CI sandboxes, so assertions tolerate
 * LIVE or SIMULATED banners and focus on structure + interaction.
 */

test.describe('GIVEN the telemetry page', () => {
  test('WHEN opened THEN 4 chart cards render with units and single footer disclaimer', async ({
    page,
  }) => {
    await page.goto('/telemetry');
    for (const testId of ['chart-cpu', 'chart-memory', 'chart-latency', 'chart-throughput']) {
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByTestId('app-footer')).toBeVisible();
    await expect(page.getByTestId('app-footer')).toContainText(
      'Metrics and telemetry derived from the live Wikimedia EventStreams feed',
    );
    await expect(
      page.getByText(/Metrics and telemetry derived from the live Wikimedia/),
    ).toHaveCount(1);
  });

  test('WHEN dashboard opened THEN a single footer disclaimer renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('app-footer')).toBeVisible();
    await expect(
      page.getByText(/Metrics and telemetry derived from the live Wikimedia/),
    ).toHaveCount(1);
  });

  test('WHEN window changes THEN selection persists across reload', async ({ page }) => {
    await page.goto('/telemetry');
    const scope = page.getByRole('group', { name: 'Time window in seconds' });
    await scope.getByRole('button', { name: '60s' }).click();
    await expect(scope.getByRole('button', { name: '60s' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('pg.telemetry.window')))
      .toBe('60');
    await page.reload();
    await expect(
      page
        .getByRole('group', { name: 'Time window in seconds' })
        .getByRole('button', { name: '60s' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('GIVEN the log viewer in hermetic sim mode (forced outage)', () => {
  // ?liveUrl points at a dead port so the app deterministically falls back to
  // the simulator; ?scenario=outage streams ERROR + WARN logs every tick.
  const outageUrl = '/logs?liveUrl=ws://127.0.0.1:9/dead&scenario=outage';

  async function rowCount(page: import('@playwright/test').Page): Promise<number> {
    const text = (await page.getByTestId('log-count').textContent()) ?? '';
    return Number(text.replace(/[^0-9]/g, '')) || 0;
  }

  test('WHEN opened THEN toolbar, count badge and virtual viewport render', async ({ page }) => {
    await page.goto(outageUrl);
    await expect(page.getByLabel('Filter logs')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('log-count')).toBeVisible();
    await expect(page.getByRole('log', { name: 'Log entries' })).toBeVisible();
    await expect.poll(async () => rowCount(page), { timeout: 30_000 }).toBeGreaterThan(0);
  });

  test('WHEN ERROR filter toggles THEN count badge narrows to errors only', async ({ page }) => {
    await page.goto(outageUrl);
    const badge = page.getByTestId('log-count');
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => rowCount(page), { timeout: 30_000 }).toBeGreaterThan(5);
    const before = await rowCount(page);
    await page.getByRole('button', { name: 'ERROR', exact: true }).click();
    await expect(page.getByRole('button', { name: 'ERROR', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(async () => rowCount(page), { timeout: 15_000 }).toBeLessThan(before);
  });

  test('WHEN pause toggles THEN label flips to Resume', async ({ page }) => {
    await page.goto(outageUrl);
    const toggle = page.getByRole('button', { name: 'Pause' });
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  });
});
