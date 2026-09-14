import { test, expect } from '@playwright/test';

/**
 * Delta 007 E2E: dashboard overview banner dismiss/restore persists across reload.
 * Hermetic: dead-port WS forces sim fallback so the board renders deterministically.
 */
const DEAD = 'ws://127.0.0.1:9/dead';

test.describe('GIVEN the dashboard overview banner', () => {
  test('WHEN dismissed THEN it stays hidden after reload AND restore re-shows it', async ({
    page,
  }) => {
    await page.goto(`/dashboard?liveUrl=${DEAD}`);
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('dashboard-overview')).toBeVisible();

    await page.getByTestId('overview-dismiss').click();
    await expect(page.getByTestId('dashboard-overview')).toHaveCount(0);
    await expect(page.getByTestId('overview-show')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('dashboard-overview')).toHaveCount(0);

    await page.getByTestId('overview-show').click();
    await expect(page.getByTestId('dashboard-overview')).toBeVisible();
    await expect(page.getByTestId('dashboard-overview')).toContainText('Healthy');
    await expect(page.getByTestId('overview-thresholds')).toContainText('CPU 75/90%');
  });
});
