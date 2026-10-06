import type { BrowserContext } from '@playwright/test';

/**
 * Sign in the way the SWA CLI's mock login does: it only sets this cookie (base64 JSON of the
 * client principal), so setting it directly skips the emulator's form.
 */
export async function signIn(
  context: BrowserContext,
  email: string,
  appRoles: string[],
): Promise<void> {
  const principal = {
    identityProvider: 'aad',
    userId: `e2e-${email}`,
    userDetails: email,
    userRoles: ['anonymous', 'authenticated', ...appRoles],
    claims: [],
  };
  await context.addCookies([
    {
      name: 'StaticWebAppsAuthCookie',
      value: Buffer.from(JSON.stringify(principal)).toString('base64'),
      domain: 'localhost',
      path: '/',
    },
  ]);
}
