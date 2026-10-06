/**
 * Bundles the API with esbuild into one CommonJS file, then assembles `deploy/` — the
 * self-contained folder CI uploads as the SWA `api_location` (deployed as-is, nothing installed).
 *
 *   node scripts/build.mjs           dist/index.cjs + deploy/{host.json, package.json, dist/}
 *   node scripts/build.mjs --watch   rebuild dist/index.cjs on change (local dev; no deploy/)
 *
 * Why CJS: the Functions Node worker cannot load an ESM bundle of the Azure SDKs ("Dynamic
 * require of 'util' is not supported"). The `.cjs` extension makes the worker require() it even
 * though package.json says "type": "module".
 */
import console from 'node:console';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import * as esbuild from 'esbuild';

const apiDir = join(import.meta.dirname, '..');
const at = (path) => join(apiDir, path);

/** @type {import('esbuild').BuildOptions} */
const options = {
  absWorkingDir: apiDir,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  // Provided by the Functions worker at runtime. If it were bundled, @azure/functions would not
  // find the real one and silently fall back to "test mode" (no functions registered).
  external: ['@azure/functions-core'],
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await rm(at('dist'), { recursive: true, force: true });
  await esbuild.build(options);
  await assembleDeploy();
}

async function assembleDeploy() {
  const deployDir = at('deploy');
  await rm(deployDir, { recursive: true, force: true });
  await mkdir(deployDir);
  await copyFile(at('host.json'), at('deploy/host.json'));
  await cp(at('dist'), at('deploy/dist'), { recursive: true });

  // No dependencies: everything the worker needs is in the bundle.
  const { name, version, main, type } = JSON.parse(await readFile(at('package.json'), 'utf8'));
  const manifest = { name, version, private: true, main, type };
  await writeFile(at('deploy/package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Assembled ${deployDir}`);
}
