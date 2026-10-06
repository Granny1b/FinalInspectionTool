/**
 * Imported first in main.tsx, before anything that builds zod schemas (i.e. @modig/shared).
 *
 * Our Content-Security-Policy has no 'unsafe-eval'. When zod 4 builds an object schema it probes
 * `new Function` to decide whether to JIT-compile the parser; the probe fails safely, but the
 * browser still reports a CSP violation on every page load. `jitless` skips the probe. The API
 * payloads are small, so parsing without JIT makes no noticeable difference.
 */
import { config } from 'zod';

config({ jitless: true });
