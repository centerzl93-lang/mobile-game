import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Project page on GitHub Pages is served under /<repo>/.
// If you rename the repo, update this base path to match.
const BASE = '/mobile-game/';

/**
 * Build stamp shown on the main menu, so it is possible to tell at a glance whether the device is
 * running the newest deploy or a service-worker copy of an older one.
 *
 * The patch number is the **commit count**, so it goes up by itself on every push — nobody has to
 * remember to bump anything, and it can't drift out of step with what is deployed. A version that
 * simply increases is what makes "am I on the latest?" answerable at a glance; the short commit
 * after it pins exactly which build, and the date is there for builds made outside git.
 *
 * Note CI must check out full history (`fetch-depth: 0`) or the count is 1 for every build — see
 * the comments in .github/workflows/.
 */
function git(command: string, fallback: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback; // building from a tarball, or no git available
  }
}
const pkgVersion: string = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version;
const [major = '0', minor = '0'] = pkgVersion.split('.');
// A shallow clone counts only the commits it has, which would show a *lower* number than the
// previous deploy — precisely the "am I on the latest?" confusion this is meant to remove. Show an
// obvious placeholder instead of a plausible-but-wrong version.
const shallow = git('git rev-parse --is-shallow-repository', 'false') === 'true';
const buildNumber = shallow ? '?' : git('git rev-list --count HEAD', '?');
const shortSha = git('git rev-parse --short HEAD', 'local');
const BUILD_STAMP = `v${major}.${minor}.${buildNumber} · ${shortSha} · ${new Date().toISOString().slice(0, 10)}`;

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
