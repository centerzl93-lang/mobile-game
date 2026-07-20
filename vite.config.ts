import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Project page on GitHub Pages is served under /<repo>/.
// If you rename the repo, update this base path to match.
const BASE = '/mobile-game/';

export default defineConfig({
  base: BASE,
  build: {
    rollupOptions: {
      output: {
        // Split Three.js into its own chunk so the app code stays small and the large,
        // rarely-changing vendor bundle can be cached across app updates.
        manualChunks: {
          'vendor-three': ['three'],
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/apple-touch-icon.png',
        'icons/favicon.svg',
      ],
      manifest: {
        name: 'Little Village',
        short_name: 'Village',
        description: 'A survival village-builder. Keep your people fed and warm through the seasons.',
        theme_color: '#3b7d4f',
        background_color: '#20361f',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Serve index.html for any navigation so the installed app works offline.
        navigateFallback: `${BASE}index.html`,
        // 3D models are optional runtime assets (dropped into public/models/). Cache them on
        // first use rather than precaching, so the install stays light and offline works after
        // the first online view.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'village-models',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
