import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { GET as proxy } from './api/proxy';
import { APP_VERSION } from './src/version';

// /version.json: the phone checks it to know when a new version is live.
function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/version.json')) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ version: APP_VERSION }));
      });
    },
  };
}

// Runs the same /api/proxy handler locally during `npm run dev`.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname !== '/api/proxy') return next();
        const r = await proxy(new Request(url.toString()));
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    devApi(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'covers/*.jpg'],
      manifest: {
        name: 'Tapedeck',
        short_name: 'Tapedeck',
        description: 'Your podcasts, sorted by category and by series.',
        theme_color: '#222222',
        background_color: '#222222',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // keep the app and its fonts on the phone so titles show in Dirtyline even offline
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,ttf}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname === '/version.json',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: { cacheName: 'artwork', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
});
