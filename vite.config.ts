import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Project page on GitHub Pages is served under /<repo>/.
// If you rename the repo, update this base path to match.
const BASE = '/mobile-game/';

/**
 * Build stamp shown on the main menu, so it is possible to tell at a glance whether the device is
 * running the newest deploy or a service-worker copy of an older one. The commit is the useful
 * half; the date is there for when a build is made outside git.
 */
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local'; // building from a tarball or a shallow checkout without git
  }
}
const BUILD_STAMP = `v${pkgVersion} · ${gitShortSha()} · ${new Date().toISOString().slice(0, 10)}`;

export default defineConfig({
  base: BASE,
  define: {
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
  },
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
