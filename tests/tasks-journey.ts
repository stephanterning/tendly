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
  await placeAndIconJourney(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Now', exact: true }).filter({ visible: true }).click();
  await page.keyboard.press('n');
  await page.getByLabel('What needs doing?', { exact: true }).fill('Clean the gutters');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open task', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Column', exact: true })).toHaveValue('someday');
  await page.getByRole('combobox', { name: 'Column', exact: true }).selectOption('within_year');
  await page.getByRole('combobox', { name: 'Epic', exact: true }).selectOption({ label: 'House' });
  const medium = page.getByRole('group', { name: 'Size', exact: true }).getByRole('button', { name: 'M', exact: true });
  await medium.click();
  await expect(medium).toHaveAttribute('aria-pressed', 'true');
  await medium.click();
  await expect(medium).toHaveAttribute('aria-pressed', 'false');
  await medium.click();
  await expect(page.getByRole('heading', { name: 'Dates', exact: true })).toBeVisible();
  await expect(page.getByLabel('Earliest start', { exact: true })).toBeVisible();
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
  expect((await page.locator('.board-toolbar').boundingBox())!.height).toBeLessThanOrEqual(64);
  await expect(page.locator('.board-column')).toHaveCount(6);
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

async function placeAndIconJourney(page: Page) {
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.getByRole('button', { name: 'Add Place', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Workshop');
  await page.getByLabel('Find an icon').fill('trailer');
  await expect(page.getByRole('group', { name: 'Icon', exact: true }).getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: 'covered trailer', exact: true }).click();
  await page.getByLabel('Find an icon').fill('släp');
  await expect(page.getByRole('group', { name: 'Icon', exact: true }).getByRole('button')).toHaveCount(2);
  // The searchable catalog includes icons beyond the initially displayed page.
  await page.getByLabel('Find an icon').fill('telescope');
  await expect(page.getByRole('button', { name: 'telescope', exact: true }).locator('svg')).toBeVisible();
  await page.getByLabel('Find an icon').fill('trailer');
  await page.getByLabel('Latitude', { exact: true }).fill('59.3293');
  await page.getByLabel('Longitude', { exact: true }).fill('18.0686');
  // CI never depends on a public tile service. Failure must leave geodata editable.
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  const map = page.getByRole('region', { name: 'Location map', exact: true });
  await expect(map).toBeVisible();
  await map.click({ position: { x: 160, y: 130 } });
  await expect(page.getByLabel('Latitude', { exact: true })).not.toHaveValue('59.3293');
  const pin = await map.locator('.place-pin').boundingBox();
  const beforeDrag = await page.getByLabel('Latitude', { exact: true }).inputValue();
  expect(pin).not.toBeNull();
  await page.mouse.move(pin!.x + 14, pin!.y + 14);
  await page.mouse.down();
  await page.mouse.move(pin!.x + 45, pin!.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel('Latitude', { exact: true })).not.toHaveValue(beforeDrag);
  await page.getByRole('slider', { name: 'Adjust radius' }).fill('300');
  await expect(page.getByLabel('Radius (metres)', { exact: true })).toHaveValue('300');
  await page.getByLabel('Radius (metres)', { exact: true }).fill('250');
  await page.getByRole('button', { name: 'Show selected area', exact: true }).click();
  await expect(page.getByText('Some map tiles could not load.', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await map.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/place-map-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const lat = await page.getByLabel('Latitude', { exact: true }).inputValue();
  const lng = await page.getByLabel('Longitude', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Workshop', exact: true }).click();
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue(lat);
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue(lng);
  await expect(page.getByLabel('Radius (metres)', { exact: true })).toHaveValue('250');
  await expect(page.getByRole('button', { name: 'covered trailer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Remove coordinates and radius', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Workshop', exact: true }).click();
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue(lat);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.unroute('https://tile.openstreetmap.org/**');
  await page.setViewportSize({ width: 1280, height: 900 });
}
