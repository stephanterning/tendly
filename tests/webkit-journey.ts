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
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}
