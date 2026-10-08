/**
 * Vitest globalSetup: a throwaway in-memory Azurite (blob + table) on free ports, so the storage
 * tests never depend on — or write into — a developer's Azurite on the default ports.
 * Tests read the connection string with `inject('storageConnectionString')`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { connect, createServer, type AddressInfo, type Server } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    storageConnectionString: string;
  }
}

const HOST = '127.0.0.1';
/** Azurite's documented development account and key (public, not a secret). */
const ACCOUNT = 'devstoreaccount1';
const ACCOUNT_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [blobPort, tablePort] = await freePorts(2);
  if (!blobPort || !tablePort) throw new Error('Could not find free ports for Azurite');

  const blob = startAzurite('azurite-blob', [
    ...['--blobHost', HOST, '--blobPort', String(blobPort)],
    // @azure/storage-blob 12.34 sends a newer API version than Azurite 3.37 knows.
    '--skipApiVersionCheck',
  ]);
  const table = startAzurite('azurite-table', [
    '--tableHost',
    HOST,
    '--tablePort',
    String(tablePort),
  ]);
  const stop = async (): Promise<void> => {
    await Promise.all([stopProcess(blob), stopProcess(table)]);
  };

  try {
    await Promise.all([waitForPort(blob, blobPort), waitForPort(table, tablePort)]);
  } catch (error) {
    await stop();
    throw error;
  }

  project.provide(
    'storageConnectionString',
    [
      'DefaultEndpointsProtocol=http',
      `AccountName=${ACCOUNT}`,
      `AccountKey=${ACCOUNT_KEY}`,
      `BlobEndpoint=http://${HOST}:${blobPort}/${ACCOUNT}`,
      `TableEndpoint=http://${HOST}:${tablePort}/${ACCOUNT}`,
    ].join(';'),
  );
  return stop;
}

/** Runs the package's bin script with this Node binary (no shell, no platform-specific shims). */
function startAzurite(bin: 'azurite-blob' | 'azurite-table', args: string[]): ChildProcess {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('azurite/package.json');
  const { bin: bins } = require(pkgPath) as { bin: Record<string, string> };
  const script = bins[bin];
  if (!script) throw new Error(`azurite has no "${bin}" bin`);
  return spawn(
    process.execPath,
    [
      join(dirname(pkgPath), script),
      ...['--inMemoryPersistence', '--silent', '--disableTelemetry'],
      ...args,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

/** Ask the OS for free ports, holding them all open at once so they are distinct. */
async function freePorts(count: number): Promise<number[]> {
  const servers: Server[] = [];
  for (let i = 0; i < count; i++) {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
  }
  const ports = servers.map((server) => (server.address() as AddressInfo).port);
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  return ports;
}

async function waitForPort(child: ChildProcess, port: number, timeoutMs = 15_000): Promise<void> {
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Azurite exited (${child.exitCode ?? child.signalCode}): ${stderr.trim()}`);
    }
    if (await accepts(port)) return;
    await sleep(100);
  }
  throw new Error(`Azurite did not listen on port ${port} within ${timeoutMs} ms`);
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, HOST);
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** SIGTERM, then SIGKILL if it lingers (Azurite can stay alive after "closed"). */
async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const result = await Promise.race([exited.then(() => 'exited'), sleep(3_000, 'timeout')]);
  if (result === 'timeout') {
    child.kill('SIGKILL');
    await exited;
  }
}
