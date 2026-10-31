import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(), 
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon.svg', 'roya-logo.svg'],
        manifest: {
          // Installed as the admin panel; visitors just open cards in the browser.
          id: '/admin',
          name: 'پنل کارت‌های دیجیتال رویا',
          short_name: 'کارت‌های رویا',
          description: 'مدیریت کارت ویزیت دیجیتال کارکنان رویا طرح داخلی',
          theme_color: '#f5f5f4',
          background_color: '#f5f5f4',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/admin',
          scope: '/',
          lang: 'fa',
          dir: 'rtl',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // PDFs are not precached: an updated catalog must reach phones without a new release.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Server routes (vCard downloads, uploads, the catalog) must never get the SPA shell.
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /\.(pdf|vcf)$/i],
          runtimeCaching: [
            {
              // Uploaded avatars and logos: show the cached copy instantly, refresh in the background.
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/uploads/images/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'roya-uploads-cache',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // A single public card: always try the network so edits show up, fall back offline.
              urlPattern: ({ url, sameOrigin, request }) =>
                sameOrigin && request.method === 'GET' && /^\/api\/profiles\/[^/]+$/.test(url.pathname),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'roya-api-card-cache',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
