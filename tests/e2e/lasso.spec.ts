import { expect, test } from '@playwright/test';

test('Lasso updates the SelectionSet as one undoable gesture', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try example' }).click();
  await expect(page.locator('#topology-status')).toHaveText('Topology ready');
  await page.getByRole('button', { name: 'Lasso' }).click();
  const canvas = page.locator('#viewport canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.3;
  const y = box!.y + box!.height * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + box!.width * 0.4, y);
  await page.mouse.move(x + box!.width * 0.4, y + box!.height * 0.4);
  await page.mouse.move(x, y + box!.height * 0.4);
  await page.mouse.move(x, y);
  await page.mouse.up();
  await expect(page.locator('#selection-count')).not.toHaveText('0 selected faces');
  const count = await page.locator('#selection-count').innerText();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#selection-count')).toHaveText('0 selected faces');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#selection-count')).toHaveText(count);
});
