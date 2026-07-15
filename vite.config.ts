import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';
  const directus = (env.VITE_DIRECTUS_URL || 'https://websites-games.chn0vc.easypanel.host').replace(/\/$/, '');
  const apiPattern = new RegExp(`^${escapeRegExp(directus)}/items/`);
  const assetPattern = new RegExp(`^${escapeRegExp(directus)}/assets/`);

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: base,
          name: '¿Te animás?',
          short_name: '¿Te animás?',
          description: 'Juego íntimo configurable para parejas adultas.',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#13070B',
          theme_color: '#6E0F2A',
          lang: 'es-AR',
          categories: ['entertainment', 'lifestyle'],
          icons: [
            { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          navigateFallback: `${base}index.html`,
          globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: apiPattern,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'te-animas-content-v281',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: assetPattern,
              handler: 'CacheFirst',
              options: {
                cacheName: 'te-animas-images-v281',
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        },
        devOptions: { enabled: false }
      })
    ],
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
    build: { sourcemap: false, target: 'es2022' },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/tests/**/*.test.ts']
    }
  };
});
