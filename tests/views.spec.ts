import { test, expect, type Page, type Locator, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
async function recover(context: BrowserContext, page: Page, email: string) {
  if (!process.env.COMPOSE_PROJECT_NAME?.includes('test'))
    throw new Error('Use an isolated test Compose project');
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const link = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'api', 'node', 'apps/api/dist/accounts/cli.js', 'recover', email],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')[0]!;
  await page.goto(link);
  await page.getByRole('button', { name: 'Create a new passkey', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Now', exact: true })).toBeVisible();
}
async function library(page: Page) {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'More', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('button', { name: 'Views & filters', exact: true }).click();
}
async function drag(page: Page, source: Locator, target: Locator) {
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  // Two pointer moves reliably dispatch native dragover after switching windows.
  const moved = page.waitForResponse(
    (r) => r.url().endsWith('/move') && r.request().method() === 'POST',
  );
  await source.hover();
  await page.mouse.down();
  await target.hover();
  await target.hover();
  await page.mouse.up();
  expect((await moved).ok()).toBe(true);
}
test('shared nested filters and views, personal chips, preview, conflicts, lanes and accessible moves', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await recover(context, page, 'owner@example.test');
  const started = Date.now();
  const run = 'Stage5 ' + Date.now().toString(36);
  const account = (await (await page.request.get('/api/v1/auth/session')).json()).account,
    householdId = account.households[0].id,
    prefix = '/api/v1/households/' + householdId,
    headers = { origin: new URL(page.url()).origin };
  const create = async (path: string, data: unknown) => {
    const response = await page.request.post(prefix + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const garden = await create('/entities', {
    kind: 'epic',
    name: `${run} Garden`,
    icon: 'sprout',
    color: 'green',
  });
  await create('/tasks', {
    title: `${run} small`,
    column: 'todo',
    size: 'S',
    epicId: garden.id,
  });
  await create('/tasks', {
    title: `${run} large`,
    column: 'todo',
    size: 'XL',
    epicId: garden.id,
  });
  await create('/tasks', { title: `${run} someday`, column: 'someday', size: 'S' });
  await library(page);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'New filter', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Filter name', { exact: true }).fill(`${run} ready`);
  await dialog.getByRole('button', { name: 'Add condition', exact: true }).click();
  await dialog.getByLabel('Field', { exact: true }).nth(0).selectOption('title');
  await dialog.getByLabel('Value', { exact: true }).nth(0).fill(`${run}`);
  await dialog.getByRole('button', { name: 'Add group', exact: true }).click();
  await dialog.getByLabel('Value', { exact: true }).nth(1).selectOption(['within_month', 'todo']);
  // Add two conditions to the root, preserving the nested OR group.
  await dialog.getByRole('button', { name: 'Add condition', exact: true }).last().click();
  await dialog.getByLabel('Field', { exact: true }).nth(2).selectOption('size');
  await dialog.getByLabel('Value', { exact: true }).nth(2).selectOption(['XS', 'S']);
  await dialog.getByRole('button', { name: 'Add condition', exact: true }).last().click();
  await dialog.getByLabel('Field', { exact: true }).nth(3).selectOption('available');
  await expect(
    dialog.getByRole('heading', { name: '1 matching tasks', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/stage5-filter-desktop.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(run + ' ready.*Alex') }).click();
  await dialog.getByLabel('Filter name', { exact: true }).fill('Discard this');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes and leave', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(run + ' ready.*Alex') })).toBeVisible();
  await page.getByRole('button', { name: 'Views', exact: true }).click();
  await page.getByRole('button', { name: 'New view', exact: true }).click();
  await dialog.getByLabel('View name', { exact: true }).fill(`${run} board`);
  await dialog.getByRole('button', { name: 'Add condition', exact: true }).click();
  await dialog.getByLabel('Field', { exact: true }).selectOption('title');
  await dialog.getByLabel('Value', { exact: true }).fill(`${run}`);
  await dialog.getByLabel('Group into epic lanes', { exact: true }).check();
  await dialog.getByLabel(`${run} ready`, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: `Favorite ${run} board`, exact: true }).click();
  await page
    .locator('.definition-name')
    .filter({ hasText: `${run} board` })
    .click();
  await expect(page.getByRole('heading', { name: `${run} board`, exact: true })).toBeVisible();
  const header = page.locator('.view-title');
  await expect(header.getByRole('button', { name: 'View settings', exact: true })).toBeVisible();
  await expect(header.getByRole('checkbox', { name: 'Show separate future columns' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Current place', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Future 1', exact: true })).toBeVisible();
  await expect(page.locator('.epic-lane>summary').last()).toContainText('Unassigned');
  await page.getByRole('button', { name: `${run} ready`, exact: true }).click();
  await expect(page.getByRole('link', { name: `${run} large`, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: `${run} small`, exact: true })).toBeVisible();
  // A definition dialog must close after approving Forward to a task, even
  // though its underlying view stays mounted.
  await page.getByRole('link', { name: `${run} small`, exact: true }).click();
  await page.getByRole('button', { name: 'Back to tasks', exact: true }).click();
  await page.getByRole('button', { name: 'View settings', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('Unsaved view');
  await page.goForward();
  await page.getByRole('button', { name: 'Discard changes and leave', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Task details', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const splitFuture = page.getByRole('checkbox', { name: 'Show separate future columns' });
  await expect(splitFuture).not.toBeChecked();
  await splitFuture.click();
  await expect(splitFuture).toBeChecked();
  await expect(page.getByRole('heading', { name: /^Future \d+$/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Within a Month/ }).first()).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Views', exact: true })
    .getByRole('button', { name: `${run} board`, exact: true })
    .click();
  await expect(page.getByRole('button', { name: `${run} ready`, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: /^Within a Month/ }).first()).toBeVisible();
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'en-US',
    }),
    member = await mobile.newPage();
  await recover(mobile, member, 'member@example.test');
  await library(member);
  await member
    .locator('.definition-name')
    .filter({ hasText: `${run} board` })
    .click();
  await expect(member.getByRole('button', { name: `${run} ready`, exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(member.getByRole('link', { name: `${run} large`, exact: true })).toBeVisible();
  await expect(member.getByRole('option', { name: 'Future (1)', exact: true })).toHaveCount(1);
  // Shared editing propagates, while the other member's toggle remains off.
  await page.getByRole('button', { name: `${run} ready`, exact: true }).focus();
  await page.keyboard.press('Shift+F10');
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Filter name', { exact: true }).fill(`${run} revised`);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(member.getByRole('button', { name: `${run} revised`, exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: `${run} revised`, exact: true })
    .click({ button: 'right' });
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByText('Version history', { exact: true }).first().click();
  await dialog.getByRole('combobox', { name: 'Version history', exact: true }).selectOption('1');
  await dialog.getByRole('button', { name: 'Restore this version', exact: true }).click();
  await expect(member.getByRole('button', { name: `${run} ready`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `${run} ready`, exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.bringToFront();
  await expect(page.getByRole('link', { name: `${run} large`, exact: true })).toBeVisible();

  await drag(
    page,
    page.getByRole('button', { name: `Move task · ${run} large`, exact: true }),
    page.getByRole('link', { name: `${run} small`, exact: true }),
  );
  const ordered = () =>
    page
      .locator('.epic-lane')
      .filter({ has: page.locator('summary').filter({ hasText: `${run} Garden` }) })
      .locator('.card-open');
  await expect(ordered().first()).toHaveText(new RegExp(run + ' large'));
  await page
    .locator('.history-controls')
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect(ordered().first()).toHaveText(new RegExp(run + ' small'));
  const unassigned = page
    .locator('.epic-lane')
    .filter({ has: page.locator('summary').filter({ hasText: 'Unassigned' }) });
  await drag(
    page,
    page.getByRole('button', { name: `Move task · ${run} large`, exact: true }),
    unassigned
      .locator('.board-column')
      .filter({ has: page.getByRole('heading', { name: /^Within a Month/ }) }),
  );
  await expect(unassigned.getByRole('link', { name: `${run} large`, exact: true })).toBeVisible();
  await page
    .locator('.history-controls')
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect(ordered().nth(1)).toHaveText(new RegExp(run + ' large'));
  await page.screenshot({ path: 'test-results/stage5-lanes-desktop.png', fullPage: true });
  await member.getByRole('button', { name: `Move task · ${run} small`, exact: true }).click();
  const md = member.getByRole('dialog');
  await md.getByRole('combobox', { name: 'Column', exact: true }).selectOption('within_month');
  await md.getByRole('combobox', { name: 'Epic', exact: true }).selectOption('');
  await md.getByRole('button', { name: 'Move task', exact: true }).click();
  await expect(md).toHaveCount(0);
  await member.getByRole('combobox', { name: 'Column', exact: true }).selectOption('future');
  await expect(member.getByRole('link', { name: `${run} small`, exact: true })).toBeVisible();
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await member.screenshot({ path: 'test-results/stage5-lanes-mobile.png', fullPage: true });
  await member
    .locator('.history-controls')
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  // Contextual creation knows both the lane and column.
  const lane = page
    .locator('.epic-lane')
    .filter({ has: page.locator('summary').filter({ hasText: `${run} Garden` }) });
  await lane.getByRole('button', { name: 'Add task · Within a Month', exact: true }).click();
  await dialog.getByLabel('What needs doing?', { exact: true }).fill(`${run} contextual`);
  await dialog.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(lane.getByRole('link', { name: `${run} contextual`, exact: true })).toBeVisible();
  const year = await create('/tasks', {
    title: `${run} year`,
    column: 'within_year',
    epicId: garden.id,
  });
  await splitFuture.click();
  await expect(splitFuture).not.toBeChecked();
  const future = lane.locator('.board-column').filter({
    has: page.getByRole('heading', { name: 'Future 2', exact: true }),
  });
  await expect(future.getByRole('link', { name: year.title, exact: true })).toBeVisible();
  await drag(
    page,
    future.getByRole('button', { name: `Move task · ${year.title}`, exact: true }),
    future.getByRole('link', { name: `${run} contextual`, exact: true }),
  );
  await expect(future.locator('.card-open').first()).toHaveText(year.title);
  await drag(
    page,
    lane.getByRole('button', { name: `Move task · ${run} large`, exact: true }),
    future.getByRole('link', { name: `${run} contextual`, exact: true }),
  );
  await lane.getByRole('button', { name: 'Add task · Future', exact: true }).click();
  await dialog.getByLabel('What needs doing?', { exact: true }).fill(`${run} future capture`);
  await dialog.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(lane.getByRole('link', { name: `${run} future capture`, exact: true })).toBeVisible();
  const all = (await (await page.request.get(prefix + '/tasks?limit=100')).json()).items;
  expect(all.find((task: { title: string }) => task.title === `${run} contextual`)).toMatchObject({
    column: 'within_month',
    epicId: garden.id,
  });
  expect(all.find((task: { id: string }) => task.id === year.id)?.column).toBe('within_year');
  expect(all.find((task: { title: string }) => task.title === `${run} large`)?.column).toBe('someday');
  expect(all.find((task: { title: string }) => task.title === `${run} future capture`)).toMatchObject({
    column: 'someday',
    epicId: garden.id,
  });
  // Pace the next phase instead of relaxing the production account rate limit.
  await page.waitForTimeout(Math.max(0, 61000 - (Date.now() - started)));
  await page.getByRole('button', { name: 'View settings', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Presentation', exact: true }).selectOption('list');
  await dialog.getByRole('combobox', { name: 'Sorting', exact: true }).selectOption('effort');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.board')).toHaveCount(0);
  await expect(member.locator('.board')).toHaveCount(0);
  await member
    .getByRole('button', { name: `${run} ready`, exact: true })
    .click({ button: 'right' });
  await member.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  await member.screenshot({ path: 'test-results/stage5-filter-mobile.png', fullPage: true });
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await member.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: `${run} ready`, exact: true }).click({ button: 'right' });
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Filter name', { exact: true }).fill('My draft');
  const catalog = await (await page.request.get(prefix + '/view-catalog')).json(),
    filter = catalog.filters.find((f: { name: string }) => f.name === `${run} ready`);
  expect(
    (
      await mobile.request.put(prefix + '/filters/' + filter.id, {
        headers,
        data: { baseVersion: filter.version, changes: { ...filter, name: `${run} remote` } },
      })
    ).ok(),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Your draft is kept');
  await expect(dialog.getByLabel('Filter name', { exact: true })).toHaveValue('My draft');
  await dialog.getByRole('button', { name: 'Load latest', exact: true }).click();
  await expect(dialog.getByLabel('Filter name', { exact: true })).toHaveValue(`${run} remote`);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox').fill(`${run}`);
  await page.getByText('Filter tasks and their comments', { exact: true }).click();
  await page.getByLabel(`${run} remote`, { exact: true }).check();
  await expect(page.locator('.search-results li')).toHaveCount(1);
  await expect(page.locator('.search-results')).toContainText(`${run} small`);
  expect(browserErrors).toEqual([]);
  await mobile.close();
});

test('activating the location filter starts browser location across Board, Now and search', async ({ page, context }) => {
  const homePosition = { latitude: 60.5, longitude: 18.3 };
  const workPosition = { latitude: 60.6, longitude: 18.3 };
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(homePosition);
  await context.addInitScript(() => {
    const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    let watchCount = 0;
    navigator.geolocation.watchPosition = (...args) => {
      document.documentElement.dataset.locationWatches = String(++watchCount);
      return watch(...args);
    };
  });
  await recover(context, page, 'owner@example.test');

  const account = (await (await page.request.get('/api/v1/auth/session')).json()).account;
  const prefix = `/api/v1/households/${account.households[0].id}`;
  const headers = { origin: new URL(page.url()).origin };
  const run = 'GPS ' + Date.now().toString(36);
  const create = async (path: string, data: unknown) => {
    const response = await page.request.post(prefix + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const home = await create('/entities', { name: `${run} home`, kind: 'place', radius: 100, ...homePosition });
  const work = await create('/entities', { name: `${run} work`, kind: 'place', radius: 100, ...workPosition });
  await create('/tasks', { title: `${run} at home`, column: 'todo', places: [home.id] });
  await create('/tasks', { title: `${run} at work`, column: 'todo', places: [work.id] });
  await create('/tasks', { title: `${run} anywhere`, column: 'todo' });

  const chip = page.getByRole('button', { name: 'At my current place', exact: true });
  const task = (suffix: string) => page.getByRole('link', { name: `${run} ${suffix}`, exact: true });
  const entitiesLoaded = page.waitForResponse(response => response.url().endsWith('/entities'));
  await page.goto('/?view=board');
  await entitiesLoaded;
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(task('at work')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-location-watches', /.+/);
  await chip.click();
  await expect(page.locator('html')).toHaveAttribute('data-location-watches', '1');
  await expect(task('at home')).toBeVisible();
  await expect(task('anywhere')).toBeVisible();
  await expect(task('at work')).toHaveCount(0);

  await context.setGeolocation(workPosition);
  await expect(task('at work')).toBeVisible();
  await expect(task('at home')).toHaveCount(0);
  await page.reload();
  await expect(task('at work')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-location-watches', '1');

  await page.getByRole('navigation', { name: 'Tendly', exact: true })
    .getByRole('button', { name: 'Now', exact: true }).click();
  if (await chip.getAttribute('aria-pressed') === 'false') await chip.click();
  await expect(task('at work')).toBeVisible();
  await expect(task('at home')).toHaveCount(0);

  await page.goto('/?view=search');
  await page.getByRole('searchbox').fill(run);
  await page.getByText('Filter tasks and their comments', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'At my current place', exact: true }).check();
  const hits = page.locator('.search-results');
  await expect(hits.getByText(`${run} at work`, { exact: true })).toBeVisible();
  await expect(hits.getByText(`${run} at home`, { exact: true })).toHaveCount(0);

  await context.setGeolocation({ latitude: 61, longitude: 18.3 });
  await expect(hits.getByText(`${run} anywhere`, { exact: true })).toBeVisible();
  await expect(hits.getByText(`${run} at work`, { exact: true })).toHaveCount(0);
});
