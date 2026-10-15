import { expect, type Page, type Locator } from '@playwright/test';

export async function dragPreviewJourney(page: Page) {
  const origin = new URL(page.url()).origin;
  const account = (await (await page.request.get(origin + '/api/v1/auth/session')).json()).account;
  const root = origin + '/api/v1/households/' + account.households[0].id;
  async function create(title: string) {
    const response = await page.request.post(root + '/tasks', { headers: { origin }, data: { title, column: 'within_month' } });
    expect(response.ok()).toBe(true); return response.json();
  }
  const parent = await create('Drag preview parent'), child = await create('Drag preview child');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Board', exact: true }).filter({ visible: true }).click();
  const source = page.getByRole('button', { name: child.title, exact: true });
  const target = page.getByRole('button', { name: parent.title, exact: true });
  const wrapper = target.locator('..').locator('..');
  async function begin(locator: Locator) {
    const rect = (await locator.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 12, rect.y + rect.height / 2, { steps: 5 });
  }
  await target.scrollIntoViewIfNeeded();
  const initial = (await wrapper.boundingBox())!;
  await begin(source);
  await page.mouse.move(initial.x + 50, initial.y + 5, { steps: 10 });
  await expect(page.locator('.drag-placeholder')).toBeVisible();
  expect((await wrapper.boundingBox())!.y).toBeGreaterThan(initial.y);
  await page.screenshot({ path: 'test-results/drag-insertion-preview.png' });
  // WebKit's synthetic drag needs a pointer event over the newly inserted slot.
  const slot = (await page.locator('.drag-placeholder').boundingBox())!;
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
  await page.mouse.up();
  await expect(page.locator('.drag-placeholder')).toHaveCount(0);
  await expect.poll(async () => page.locator('.column-cards').filter({ has: target }).locator('.card-open').allTextContents()).toEqual([child.title, parent.title]);
  await begin(source);
  const center = (await wrapper.boundingBox())!;
  // Aim at the visible middle, without sweeping through the reorder edge first.
  await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
  await page.mouse.move(center.x + center.width / 2 + 1, center.y + center.height / 2);
  await expect(wrapper).toHaveAttribute('data-nest-pending', 'true');
  await expect(wrapper).toHaveAttribute('data-nest-target', 'true');
  await expect(page.locator('.drag-placeholder')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/drag-subtask-preview.png' });
  page.once('dialog', dialog => void dialog.accept());
  await page.mouse.up();
  await expect.poll(async () => (await (await page.request.get(root + '/tasks/' + child.id)).json()).parentId).toBe(parent.id);
}
