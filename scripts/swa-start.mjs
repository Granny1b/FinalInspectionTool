// @ts-check
/**
 * `swa start` (configured in swa-cli.config.json) with a small environment, for `npm run dev`.
 *
 * SWA CLI 2.0.10 copies the whole of `process.env` about a hundred times per request: its logger
 * reads the environment again for every debug line, even when debug output is off. With the
 * 150–200 variables a developer's shell can hold, every module it proxies from Vite cost about
 * 35 ms, and a page took 6 s to load in dev. With only the variables below it takes about 1.3 s.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// What the CLI and the shells it starts need: the path, home and temp folders, the Windows shell,
// locale and terminal settings, proxies, Node options, debugging and update-check switches and
// the CLI's own SWA_* settings.
const KEEP =
  /^(PATH|PATHEXT|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|SYSTEMROOT|SYSTEMDRIVE|COMSPEC|WINDIR|LANG|LC_\w+|TERM|COLORTERM|FORCE_COLOR|NO_COLOR|CI|NODE_\w+|SWA_\w+|HTTPS?_PROXY|NO_PROXY|DEBUG|NO_UPDATE_NOTIFIER)$/i;
for (const name of Object.keys(process.env)) {
  if (!KEEP.test(name)) delete process.env[name];
}

// Run the CLI's own `swa` bin in this process as `swa start`, followed by any arguments given
// (e.g. `npm run dev:swa -- --verbose=silly`).
const require = createRequire(import.meta.url);
const manifest = require.resolve('@azure/static-web-apps-cli/package.json');
const { bin } = require(manifest);
process.argv.splice(2, 0, 'start');
await import(pathToFileURL(path.join(path.dirname(manifest), bin.swa)).href);
