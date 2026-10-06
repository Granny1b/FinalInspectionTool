/** Builds requests the way SWA delivers them, for calling handlers directly in tests. */
import { HttpRequest, InvocationContext } from '@azure/functions';
import { CLIENT_PRINCIPAL_HEADER, type ClientPrincipal } from '../src/lib/auth';

export function encodePrincipal(principal: unknown): string {
  return Buffer.from(JSON.stringify(principal), 'utf8').toString('base64');
}

export function principal(userDetails: string, roles: string[]): ClientPrincipal {
  return {
    identityProvider: 'aad',
    userId: 'd2f3c4b5a6e7f8091a2b3c4d5e6f7081',
    userDetails,
    // SWA always adds the built-in roles next to the invited ones.
    userRoles: ['anonymous', 'authenticated', ...roles],
  };
}

export function request(
  options: { principal?: ClientPrincipal; headers?: Record<string, string>; body?: string } = {},
): HttpRequest {
  const headers = { ...options.headers };
  if (options.principal) headers[CLIENT_PRINCIPAL_HEADER] = encodePrincipal(options.principal);
  return new HttpRequest({
    method: options.body === undefined ? 'GET' : 'PUT',
    url: 'http://localhost/api/test',
    headers,
    body: options.body === undefined ? undefined : { string: options.body },
  });
}

export function context(): InvocationContext {
  // Silence the default console logging; tests spy on context.error where it matters.
  return new InvocationContext({ functionName: 'test', logHandler: () => {} });
}
