import { defineConfig, devices } from '@playwright/test';

// The app is served under /mobile-game/ (GitHub Pages project base), so tests navigate there.
const BASE = 'http://localhost:4173/mobile-game/';

// SwiftShader software-GL flags so the Three.js WebGL scene renders in headless CI (no GPU).
const GL_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    launchOptions: { args: GL_ARGS },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Build the app and serve the production bundle before the suite runs.
  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
