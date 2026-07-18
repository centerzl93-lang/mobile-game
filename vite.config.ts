import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Project page on GitHub Pages is served under /<repo>/.
// If you rename the repo, update this base path to match.
const BASE = '/mobile-game/';

export default defineConfig({
  base: BASE,
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
      },
    }),
  ],
});
