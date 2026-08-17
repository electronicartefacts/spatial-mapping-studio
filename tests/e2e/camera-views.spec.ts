import { expect, test } from '@playwright/test';

test('camera orientation controls frame the loaded model on an axis', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try example' }).click();
  await expect(page.locator('#topology-status')).toHaveText('Topology ready');

  await page.locator('[data-camera-view="top"]').click();
  await expect(page.locator('[data-camera-view="top"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-camera-view="front"]')).toHaveAttribute('aria-pressed', 'false');
});
