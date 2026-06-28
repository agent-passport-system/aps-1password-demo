import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app fetches the gateway same-origin; Vite proxies these paths to the
// gateway process so there are no CORS surprises and SSE works through the proxy.
const GW = process.env.GATEWAY_URL || 'http://localhost:8787';
const paths = ['/act', '/tree', '/receipts', '/events', '/scenario', '/mode', '/run', '/trace', '/reset'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(paths.map((p) => [p, { target: GW, changeOrigin: true }])),
  },
});
