import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

// LINT.IfChange(aistudio_media_plugin)
function aistudioMediaPlugin(): Plugin {
  return {
    name: 'vite-plugin-aistudio-media',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/assets/aistudio/')) {
          const rawPath = req.url.split('?')[0].split('#')[0];
          try {
            const decodedPath = decodeURIComponent(rawPath);
            const relativePath = decodedPath.replace(/^\//, '');
            const aistudioDir = path.resolve(
              __dirname,
              'public',
              'assets',
              'aistudio',
            );
            const filePath = path.resolve(__dirname, 'public', relativePath);
            if (
              filePath.startsWith(aistudioDir + path.sep) &&
              fs.existsSync(filePath) &&
              fs.statSync(filePath).isFile()
            ) {
              const ext = path.extname(filePath).toLowerCase();
              const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.bmp': 'image/bmp',
                '.ico': 'image/x-icon',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.ogv': 'video/ogg',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.pdf': 'application/pdf',
              };
              res.setHeader(
                'Content-Type',
                mimeMap[ext] || 'application/octet-stream',
              );
              res.setHeader('Cache-Control', 'no-cache');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          } catch {
            // Fall through if URI decoding or file access fails
          }
        }
        next();
      });
    },
  };
}
// LINT.ThenChange(//depot/google3/java/com/google/alkali/boq/makersuite/applet_dev_service/templates/initializers/react_theme/vite.config.ts:aistudio_media_plugin)

function hmrSilencerPlugin(): Plugin {
  return {
    name: 'vite-plugin-hmr-silencer',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            children: `
(function() {
  if (typeof window === 'undefined') return;
  const OrigWS = window.WebSocket;
  if (OrigWS) {
    window.WebSocket = function(url, protocols) {
      if (protocols === 'vite-hmr' || (typeof url === 'string' && (url.includes('vite-hmr') || url.includes('token=')))) {
        const dummy = new EventTarget();
        dummy.binaryType = 'blob';
        dummy.readyState = 1;
        dummy.send = function() {};
        dummy.close = function() {};
        setTimeout(function() {
          dummy.dispatchEvent(new Event('open'));
        }, 0);
        return dummy;
      }
      return new OrigWS(url, protocols);
    };
    window.WebSocket.prototype = OrigWS.prototype;
    window.WebSocket.CONNECTING = OrigWS.CONNECTING;
    window.WebSocket.OPEN = OrigWS.OPEN;
    window.WebSocket.CLOSING = OrigWS.CLOSING;
    window.WebSocket.CLOSED = OrigWS.CLOSED;
  }
  window.addEventListener('unhandledrejection', function(e) {
    if (e.reason && (
      String(e.reason.message || e.reason).includes('WebSocket closed without opened') ||
      String(e.reason.stack || '').includes('@vite/client')
    )) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });
})();
`,
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(), 
      aistudioMediaPlugin(),
      hmrSilencerPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon.svg', 'roya-logo.svg'],
        manifest: {
          id: '/',
          name: 'کارت ویزیت هوشمند رویا طرح داخلی',
          short_name: 'رویا NFC',
          description: 'سامانه کارت ویزیت هوشمند NFC و پرتال جامع ارتباط با مشتریان شرکت رویا طرح داخلی',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
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
    server: {
      // HMR is disabled in AI Studio preview environment to prevent WebSocket transport errors
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
