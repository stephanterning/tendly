import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const origin = process.env.TEST_ORIGIN ?? 'http://localhost:8081';
function cli(...args: string[]) {
  // Only the dedicated test Compose project may issue bootstrap/recovery tokens.
  if (!process.env.COMPOSE_PROJECT_NAME?.includes('test')) throw new Error('Use an isolated test Compose project');
  return execFileSync('docker', ['compose', 'exec', '-T', 'api', 'node', 'apps/api/dist/accounts/cli.js', ...args], { encoding: 'utf8' }).trim().split('\n')[0]!;
}
async function authenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
}
async function mailLink(recipient: string, purpose: string) {
  let link = '';
  await expect.poll(async () => {
    const listing = await fetch('http://localhost:8025/api/v1/messages').then(r => r.json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    for (const message of listing.messages.filter(m => m.To.some(t => t.Address === recipient))) {
      const detail = await fetch('http://localhost:8025/api/v1/message/' + message.ID).then(r => r.json()) as { Text: string };
      const match = detail.Text.match(new RegExp('http[^\\s]+/#' + purpose + '=[^\\s]+'));
      if (match) { link = match[0]; return true; }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
  return link;
}

test('install, verify, invite, authenticate and recover with real WebAuthn verification', async ({ page, context, browser }) => {
  await authenticator(context, page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make yourself at home' })).toBeVisible();
  await page.screenshot({ path: 'test-results/setup-desktop.png', fullPage: true });
  await page.getByLabel('Setup code').fill(cli('setup-code'));
  await page.getByLabel('Your name').fill('Alex');
  await page.getByLabel('Email address', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Household name').fill('Our home');
  await page.getByLabel('Household timezone').fill('Europe/Stockholm');
  await page.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] });
  const offline = await offlineContext.newPage();
  await authenticator(offlineContext, offline);
  await offline.goto(origin);
  await offline.getByText('Have an invitation code?', { exact: true }).click();
  await page.getByRole('button', { name: 'Household', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('offline@example.test');
  await page.getByRole('button', { name: 'Create invitation code' }).click();
  const invitationCode = await page.getByLabel('Invitation code', { exact: true }).inputValue();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy invitation code', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invitationCode);
  await offline.getByLabel('Invitation code', { exact: true }).fill(invitationCode);
  await offline.getByRole('button', { name: 'Use invitation code', exact: true }).click();
  await offline.getByLabel('Your name').fill('Robin');
  await offline.getByRole('button', { name: 'Join household', exact: true }).click();
  await expect(offline.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  const offlineAccount = (await (await offlineContext.request.get(origin + '/api/v1/auth/session')).json()).account;
  expect(offlineAccount.emailVerified).toBe(false);
  expect(offlineAccount.households[0].role).toBe('member');
  const replay = await offlineContext.request.post(origin + '/api/v1/auth/invitations/accept', { headers: { origin }, data: { token: invitationCode } });
  expect(replay.status()).toBe(400);
  await offlineContext.close();
  await page.getByRole('button', { name: 'Email settings', exact: true }).click();
  await page.getByLabel('SMTP server').fill('mailpit');
  await page.getByLabel('Port', { exact: true }).fill('1025');
  await page.getByLabel('Sender email address').fill('tendly@example.test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  await page.getByRole('button', { name: 'Send verification email' }).click();
  await expect(page.getByRole('status')).toContainText('Email sent');
  await page.goto(await mailLink('owner@example.test', 'verify_email'));
  await page.getByRole('button', { name: 'Verify email address', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send verification email' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Household', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('member@example.test');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('status')).toContainText('Email sent');
  const invitation = await mailLink('member@example.test', 'invite');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const member = await mobile.newPage();
  await authenticator(mobile, member);
  await member.goto(invitation);
  await member.getByLabel('Your name').fill('Sam');
  await member.getByRole('button', { name: 'Join household', exact: true }).click();
  await expect(member.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Email settings' })).toHaveCount(0);
  expect((await mobile.request.get(origin + '/api/v1/settings/smtp')).status()).toBe(403);
  await member.screenshot({ path: 'test-results/account-mobile.png', fullPage: true });
  await member.getByLabel('Appearance').selectOption('dark');
  await member.getByRole('button', { name: 'Save changes' }).click();
  await expect(member.locator('html')).toHaveAttribute('data-theme', 'dark');
  await member.screenshot({ path: 'test-results/account-mobile-dark.png', fullPage: true });
  // A separate browser has no passkey; the recovery email is its only entry path.
  const recovery = await browser.newContext({ locale: 'en-US' });
  const recovered = await recovery.newPage();
  await authenticator(recovery, recovered);
  await recovered.goto(origin);
  await recovered.getByRole('button', { name: 'Lost access to your passkeys?' }).click();
  await recovered.getByLabel('Email address').fill('member@example.test');
  await recovered.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(recovered.getByRole('status')).toContainText('If a verified account');
  await recovered.goto(await mailLink('member@example.test', 'recovery'));
  await recovered.getByRole('button', { name: 'Create a new passkey', exact: true }).click();
  await expect(recovered.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  expect((await (await mobile.request.get(origin + '/api/v1/auth/session')).json()).account).toBeNull();
  await recovered.getByRole('button', { name: 'Sign out', exact: true }).click();
  await recovered.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
  await expect(recovered.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  // CLI recovery remains available when SMTP is unavailable.
  await page.getByRole('button', { name: 'Email settings', exact: true }).click();
  await page.getByLabel('SMTP server').fill('unavailable.invalid');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Changes saved');
  await recovered.goto(cli('recover', 'owner@example.test'));
  await recovered.getByRole('button', { name: 'Create a new passkey', exact: true }).click();
  await expect(recovered.getByRole('button', { name: 'Email settings', exact: true })).toBeVisible();
  expect((await (await context.request.get(origin + '/api/v1/auth/session')).json()).account).toBeNull();
  await recovery.close(); await mobile.close();
});
