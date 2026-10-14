import { expect, type Page } from '@playwright/test';
export async function taskJourney(page: Page) {
  await expect(page.getByRole('heading', { name: 'Now', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'More', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: /Organize your home/ }).click();
  await page.getByRole('button', { name: 'Add Epic', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('House');
  await page.getByRole('button', { name: 'red', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Now', exact: true }).filter({ visible: true }).click();
  await page.keyboard.press('n');
  await page.getByLabel('What needs doing?', { exact: true }).fill('Clean the gutters');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open task', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Column', exact: true })).toHaveValue('someday');
  await page.getByRole('combobox', { name: 'Column', exact: true }).selectOption('within_year');
  await page.getByRole('combobox', { name: 'Epic', exact: true }).selectOption({ label: 'House' });
  await page.getByRole('combobox', { name: 'Size', exact: true }).selectOption('M');
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Saved');
  await page.getByRole('combobox', { name: 'Column', exact: true }).selectOption('in_progress');
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Saved');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clean the gutters', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete task · Clean the gutters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clean the gutters', exact: true })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Board', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Reopen task · Clean the gutters', exact: true }).click();
  await expect(page.locator('.board-column').filter({ has: page.getByRole('heading', { name: 'In Progress', exact: true }) }).getByRole('button', { name: 'Clean the gutters', exact: true })).toBeVisible();
  // Simulate another device editing this field while this editor is open.
  await page.getByRole('button', { name: 'Clean the gutters', exact: true }).click();
  const account = (await (await page.request.get('/api/v1/auth/session')).json()).account;
  const prefix = '/api/v1/households/' + account.households[0].id + '/tasks';
  const task = (await (await page.request.get(prefix)).json()).items.find((t: { title: string }) => t.title === 'Clean the gutters');
  const remote = await page.request.patch(prefix + '/' + task.id, { headers: { origin: new URL(page.url()).origin }, data: { baseVersion: task.version, changes: { title: 'Remote edit' } } });
  expect(remote.ok()).toBe(true);
  await page.getByLabel('What needs doing?', { exact: true }).fill('My edit');
  await expect(page.getByRole('button', { name: 'Apply my edit' })).toBeVisible();
  await expect(page.getByLabel('What needs doing?', { exact: true })).toHaveValue('My edit');
  await page.getByRole('button', { name: 'Use latest', exact: true }).click();
  await expect(page.getByLabel('What needs doing?', { exact: true })).toHaveValue('Remote edit');
  await page.getByLabel('What needs doing?', { exact: true }).fill('Clean the gutters');
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Saved');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click(); // dismiss change toast
  for (const [name, color, icon, title, size] of [
    ['Garden', 'green', 'sprout', 'Mow the lawn', 'S'], ['Car', 'blue', 'car', 'Book a tyre change', 'M'],
    ['Projects', 'purple', 'wrench', 'Build the deck', 'L'], ['Cat', 'orange', 'cat', 'Order cat food', 'XS'],
  ]) {
    const entity = await page.request.post('/api/v1/households/' + account.households[0].id + '/entities', { headers: { origin: new URL(page.url()).origin }, data: { name, color, icon, kind: 'epic' } });
    expect(entity.ok()).toBe(true);
    const response = await page.request.post(prefix, { headers: { origin: new URL(page.url()).origin }, data: { title, size, epicId: (await entity.json()).id, column: 'todo' } });
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Board', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Mow the lawn', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'test-results/board-desktop.png' , fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Column', exact: true }).selectOption('in_progress');
  await expect(page.getByRole('button', { name: 'Clean the gutters', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/board-mobile.png', fullPage: true });
  await page.getByRole('navigation').getByRole('button', { name: 'Now', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Mow the lawn', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/now-mobile-light.png', fullPage: true });
  await page.getByRole('navigation').getByRole('button', { name: 'More', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Account & household', exact: true }).click();
  await page.getByLabel('Appearance').selectOption('dark');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('navigation').getByRole('button', { name: 'Now', exact: true }).filter({ visible: true }).click();
  await page.screenshot({ path: 'test-results/now-mobile-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Clean the gutters', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible();
  await page.screenshot({ path: 'test-results/task-mobile-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
}
