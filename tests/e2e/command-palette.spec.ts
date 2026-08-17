import { expect, test } from '@playwright/test';

test('command palette filters commands and activates an existing selection tool', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try example' }).click();
  await expect(page.locator('#topology-status')).toHaveText('Topology ready');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#command-palette')).toBeVisible();
  await page.locator('#command-search').fill('lasso');
  await page.getByRole('button', { name: /Lasso selection/i }).click();
  await expect(page.locator('#command-palette')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Lasso' })).toHaveAttribute('aria-pressed', 'true');
});
