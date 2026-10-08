// @ts-check
/**
 * For checking the built app locally only. Its Content-Security-Policy lets the browser load and
 * upload photos on https://*.blob.core.windows.net, which locally is Azurite on plain
 * http://127.0.0.1:10000. This writes a copy of app/dist/staticwebapp.config.json with Azurite
 * added to img-src and connect-src into .swa-local/ (git-ignored) for `swa start` to read.
 * Neither app/public nor app/dist changes, so what is deployed keeps the Azure-only policy.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const AZURITE_BLOB = 'http://127.0.0.1:10000';
const SOURCE = 'app/dist/staticwebapp.config.json';
const TARGET_DIR = '.swa-local';

/** @type {{ globalHeaders: Record<string, string> }} */
const config = JSON.parse(readFileSync(SOURCE, 'utf8'));
const csp = config.globalHeaders['Content-Security-Policy'];
if (!csp) throw new Error(`${SOURCE} has no Content-Security-Policy header.`);
config.globalHeaders['Content-Security-Policy'] = csp
  .split('; ')
  .map((directive) =>
    /^(img|connect)-src /.test(directive) ? `${directive} ${AZURITE_BLOB}` : directive,
  )
  .join('; ');

mkdirSync(TARGET_DIR, { recursive: true });
writeFileSync(`${TARGET_DIR}/staticwebapp.config.json`, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${TARGET_DIR}/staticwebapp.config.json: ${SOURCE} with Azurite allowed.`);
