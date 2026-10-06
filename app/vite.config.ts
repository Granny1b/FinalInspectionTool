import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `npm run dev` puts the SWA CLI (port 4280) in front of this server, so the port must be fixed.
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
