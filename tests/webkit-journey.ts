import { dragPreviewJourney } from './drag-preview-journey.js';
import { expect, webkit, type BrowserContext } from '@playwright/test';

export async function webkitEditorJourney(source: BrowserContext, origin: string) {
  const browser = await webkit.launch();
  try {
    // Reuse the isolated test account's session; WebKit has no CDP virtual authenticator.
    const context = await browser.newContext({ storageState: await source.storageState(), locale: 'en-US' });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('navigation').getByRole('button', { name: 'Board', exact: true }).filter({ visible: true }).click();
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole('button', { name: 'VP household inspection', exact: true }).click();
      const description = page.getByRole('textbox', { name: 'Description', exact: true });
      await expect(description).toBeVisible();
      if (attempt === 0) {
        await description.fill('Inspection notes saved from WebKit');
        await expect(page.locator('.save-status')).toHaveText('Saved');
      } else await expect(description).toContainText('Inspection notes saved from WebKit');
      await expect(page.locator('.comments-list')).toContainText('Remember the brass fitting');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await dragPreviewJourney(page);
    const card = page.getByRole('button', { name: 'VP household inspection', exact: true });
    const target = page.locator('.board-column').filter({ has: page.getByRole('heading', { name: 'Within a Month', exact: true }) });
    await card.dragTo(target);
    await expect(target.getByRole('button', { name: 'VP household inspection', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Move task · VP household inspection', exact: true }).click();
    const menu = page.locator('.card-action-menu');
    await expect(menu).toBeVisible();
    // The menu must remain hit-testable even beyond the board's scroll boundary.
    const hint = menu.locator('small');
    await expect(hint).toBeVisible();
    expect(await hint.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.mobile-column-select select').selectOption('within_month');
    const moveButton = page.getByRole('button', { name: 'Move task · VP household inspection', exact: true });
    await moveButton.click();
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: 'test-results/board-menu-mobile-webkit.png' });
    await menu.getByRole('combobox').selectOption('todo');
    await expect(card).toBeHidden();
    await page.locator('.mobile-column-select select').selectOption('todo');
    await expect(card).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
