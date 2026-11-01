import { expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { readFile } from 'node:fs/promises';
export async function contentJourney(page: Page, context: BrowserContext, browser: Browser) {
  const origin = new URL(page.url()).origin;
  const account = (await (await context.request.get(origin + '/api/v1/auth/session')).json())
    .account;
  const base = origin + '/api/v1/households/' + account.households[0].id;
  const created = await context.request.post(base + '/tasks', {
    headers: { origin },
    data: { title: 'Stage 7 household notes', column: 'todo' },
  });
  expect(created.ok()).toBe(true);
  const taskId = (await created.json()).id;
  await page.reload();
  await page.getByRole('button', { name: 'Stage 7 household notes', exact: true }).click();
  const description = page.getByRole('textbox', {
    name: 'Description',
    exact: true,
  });
  await description.fill('Repair notes with literal <text>');
  await expect(page.getByRole('dialog').locator('.save-status')).toHaveText('Saved');
  await description.press('End');
  await description.press('Enter');
  await description.press('ControlOrMeta+b');
  await description.pressSequentially('Important detail');
  await description.press('ControlOrMeta+b');
  await expect(description.locator('strong')).toContainText('Important detail');
  await expect(page.getByRole('dialog').locator('.save-status')).toHaveText('Saved');
  await description.press('Enter');
  await description.pressSequentially('Local undo after autosave');
  await expect(page.getByRole('dialog').locator('.save-status')).toHaveText('Saved');
  await description.press('ControlOrMeta+z');
  await expect(description).not.toContainText('Local undo after autosave');
  await expect(description).toContainText('Important detail');
  await expect(page.getByRole('dialog').locator('.save-status')).toHaveText('Saved');
  await description.press('End');
  await description.press('Enter');
  await page
    .locator('.rich-editor')
    .first()
    .getByRole('button', { name: 'Checklist', exact: true })
    .click();
  await description.pressSequentially('Bring the toolbox');
  await description.getByRole('checkbox').check();
  await expect(description.getByRole('checkbox')).toBeChecked();
  await page.screenshot({ path: 'test-results/checklist-preview.png' });
  await expect(page.getByRole('dialog').locator('.save-status')).toHaveText('Saved');
  await page
    .getByRole('textbox', { name: 'Write a comment', exact: true })
    .fill('Remember the ladder SearchNeedle7');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.locator('.comment')).toContainText('SearchNeedle7');
  await page.locator('.comment').getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Edit comment', exact: true })
    .fill('SearchNeedle7 updated');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.comment')).toContainText('updated');
  await page.locator('.comment').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.comment')).toHaveCount(0);
  await page
    .getByRole('status')
    .filter({ hasText: 'Comment deleted' })
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect(page.locator('.comment')).toContainText('updated');
  const fileInput = page.locator('.task-content > .button-row input[type=file]').first();
  await fileInput.setInputFiles([
    'tests/fixtures/photo.png',
    'tests/fixtures/photo.heic',
    'tests/fixtures/notes.pdf',
  ]);
  await expect(page.locator('.attachment-list li')).toHaveCount(3, {
    timeout: 30000,
  });
  const heic = page.locator('.attachment-list li').filter({ hasText: 'photo.heic' });
  const original = await context.request.get(
    (await heic
      .getByRole('link', { name: 'Download', exact: true })
      .getAttribute('href')) as string,
  );
  expect(await original.body()).toEqual(await readFile('tests/fixtures/photo.heic'));
  await heic.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog').last().locator('img')).toBeVisible();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .locator('.attachment-list li')
    .filter({ hasText: 'notes.pdf' })
    .getByRole('button', { name: 'Preview', exact: true })
    .click();
  await expect(page.getByRole('dialog').last().locator('iframe')).toBeVisible();
  await page.screenshot({ path: 'test-results/pdf-preview.png' });
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(
    async (bytes) => {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([Uint8Array.from(bytes)], {
            type: 'image/png',
          }),
        }),
      ]);
    },
    Array.from(await readFile('tests/fixtures/photo.png')),
  );
  const composer = page.getByRole('textbox', {
    name: 'Write a comment',
    exact: true,
  });
  await composer.focus();
  await composer.press('ControlOrMeta+v');
  await expect(composer.locator('img')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.locator('.comment img')).toBeVisible();
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page.locator('.activity-list')).toContainText('Description');
  await page.getByRole('tab', { name: 'Comments', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Write a comment', exact: true })
    .fill('Draft survives closing');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Stage 7 household notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Write a comment', exact: true })).toContainText(
    'Draft survives closing',
  );
  await page.getByRole('textbox', { name: 'Write a comment', exact: true }).fill('');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('searchbox').fill('SearchNeedle7');
  await expect(page.locator('.search-results')).toContainText('Stage 7 household notes');
  await page.locator('.search-results button').click();
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toContainText(
    'Important detail',
  );
  const other = await browser.newContext({
    storageState: await context.storageState(),
    locale: 'en-US',
    viewport: { width: 390, height: 844 },
  });
  try {
    const phone = await other.newPage();
    await phone.goto(origin);
    await phone.getByRole('button', { name: 'Stage 7 household notes', exact: true }).click();
    await phone
      .getByRole('textbox', { name: 'Write a comment', exact: true })
      .fill('Posted from mobile');
    await phone
      .locator('.task-content')
      .getByRole('combobox', { name: 'Mention someone', exact: true })
      .selectOption(account.id);
    await expect(
      phone.getByRole('textbox', { name: 'Write a comment', exact: true }).locator('.mention'),
    ).toContainText(account.name);
    await phone.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(page.locator('.comment')).toContainText(
      ['Posted from mobile', 'SearchNeedle7 updated'],
      { timeout: 5000 },
    );
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await phone.route('**/tasks/' + taskId, async (route) => {
      if (route.request().method() === 'PATCH') await gate;
      await route.continue();
    });
    const started = phone.waitForRequest(
      (r) => r.method() === 'PATCH' && r.url().endsWith('/tasks/' + taskId),
    );
    await phone
      .getByRole('textbox', { name: 'Description', exact: true })
      .fill('Pending phone draft');
    await started;
    await description.fill('Desktop conflict winner');
    await expect(page.getByRole('dialog').locator('.save-status')).toHaveText('Saved');
    release();
    await expect(phone.getByRole('button', { name: 'Use latest', exact: true })).toBeVisible();
    await expect(phone.getByRole('textbox', { name: 'Description', exact: true })).toContainText(
      'Pending phone draft',
    );
    await phone.getByRole('button', { name: 'Use latest', exact: true }).click();
    await expect(phone.getByRole('textbox', { name: 'Description', exact: true })).toContainText(
      'Desktop conflict winner',
    );
    await phone
      .locator('.rich-editor')
      .first()
      .getByRole('button', { name: 'Undo', exact: true })
      .click();
    await expect(phone.getByRole('textbox', { name: 'Description', exact: true })).toContainText(
      'Desktop conflict winner',
    );
    await phone.unroute('**/tasks/' + taskId);
    await phone
      .getByRole('textbox', { name: 'Write a comment', exact: true })
      .scrollIntoViewIfNeeded();
    await phone.screenshot({
      path: 'test-results/content-mobile.png',
      fullPage: true,
    });
    await page.screenshot({
      path: 'test-results/content-desktop.png',
      fullPage: true,
    });
  } finally {
    await other.close();
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'More', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('button', { name: 'Account & household', exact: true }).click();
  await page.getByRole('button', { name: 'Household', exact: true }).click();
  const householdName = page.getByLabel('Household name', { exact: true });
  await householdName.fill('Local settings draft');
  const home = account.households[0];
  expect(
    (
      await context.request.patch(base, {
        headers: { origin },
        data: {
          baseName: home.name,
          baseTimezone: home.timezone,
          name: 'Concurrent household name',
          timezone: home.timezone,
        },
      })
    ).ok(),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'Load latest', exact: true })).toBeVisible();
  await expect(householdName).toHaveValue('Local settings draft');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Household settings changed');
  await page.getByRole('button', { name: 'Load latest', exact: true }).click();
  await expect(householdName).toHaveValue('Concurrent household name');
  await householdName.fill(home.name);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
}
