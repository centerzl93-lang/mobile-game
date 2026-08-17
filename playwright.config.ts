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
  // Per-test ceiling. The default is 30s, but several `@slow` specs drive thousands of simulation
  // ticks in one go, and on a loaded CI runner (software-GL 3D competing for the CPU) that can just
  // pip 30s and fail on the clock rather than on an assertion. 90s is generous headroom without
  // letting a genuinely hung test sit forever; a few specs that need even more set their own.
  timeout: 90_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE,
    // Landscape, because that is how the game is played — the manifest asks the installed app
    // for it. A phone on its side is the short-height case the layout has to survive, and it is
    // where the chrome crowds the map, so it is the shape worth testing against.
    viewport: { width: 844, height: 390 },
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
