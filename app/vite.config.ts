import { Server } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The SWA CLI proxies this dev server over keep-alive connections that it never closes itself
 * (its agent has no timeout, so Node ignores the server's `Keep-Alive: timeout=5` hint). When
 * Node's default 5 s idle timeout closed one just as the CLI reused it, the CLI answered with an
 * empty 200 ("socket hang up") and the browser refused that module, so the app failed to start.
 * Idle connections are therefore kept open; only the CLI and the browser connect here.
 */
const keepIdleConnectionsOpen: Plugin = {
  name: 'keep-idle-connections-open',
  configureServer(server) {
    if (server.httpServer instanceof Server) server.httpServer.keepAliveTimeout = 0;
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), keepIdleConnectionsOpen],
  // `npm run dev` puts the SWA CLI (port 4280) in front of this server, so the address must be
  // fixed. 127.0.0.1, not localhost: for a localhost URL the CLI probes the server with wait-on
  // before proxying every single request (about 30 ms each), part of why a page load took 6 s.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
