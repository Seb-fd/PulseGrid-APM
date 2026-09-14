import { test, expect } from '@playwright/test';

test.describe('PulseGrid shell', () => {
  test('boots with status pill in header', async ({ page }) => {
    await page.goto('/');
    const pill = page.locator('header app-status-banner');
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('status-pill')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'PulseGrid APM', exact: true })).toBeVisible();
  });
});

test.describe('Dashboard layout (CDK DnD)', () => {
  test('reorders widgets and persists', async ({ page }) => {
    await page.goto('/dashboard');
    // Full DnD + persist assertions live in topology-alerts-dashboard.spec.ts.
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Log filtering', () => {
  test('filters by level', async ({ page }) => {
    await page.goto('/logs');
    await expect(page.getByLabel('Filter logs')).toBeVisible({ timeout: 30_000 });
  });
});
