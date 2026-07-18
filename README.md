# Little Village 🏡🌲

A small **survival village-builder** for your iPhone — an original game inspired
by the *gameplay* of Banished (resource-chain, keep-your-people-alive city
building). It uses none of Banished's code, art, or audio; everything here is
original and built for personal use.

It runs as an **installable web app (PWA)** hosted free on GitHub Pages — no App
Store, no Mac, no Xcode, no Apple Developer account. You add it to your Home
Screen once and it behaves like a native app: full-screen, offline, own icon,
and it auto-saves your village.

## Play / install on your iPhone

Once the site is deployed (see below), on your iPhone:

1. Open **Safari** and go to `https://centerzl93-lang.github.io/mobile-game/`
2. Tap the **Share** button (the square with the up-arrow).
3. Tap **Add to Home Screen**, then **Add**.
4. Launch **Village** from your Home Screen — it opens full-screen.

It works offline after the first load, and your village is saved automatically.

## How to play

- **Pan:** drag with one finger. **Zoom:** pinch.
- **Build:** tap a building in the bottom bar, then **pan to line up the green
  outline in the centre of the screen and tap to place it**. Buildings cost
  wood.
  - 🏠 **House** — homes up to 4 villagers and lets the village grow.
  - 🧺 **Gatherer** — collects food from nearby forest year-round.
  - 🪓 **Woodcutter** — turns nearby trees into wood and firewood.
  - 🌱 **Field** — grows crops, harvested each **autumn**.
  - 🛖 **Barn** — raises how much you can store.
- **Survive:** every season your villagers eat food; every **winter** they also
  burn firewood. Run out and people die. Get to zero people and it's game over.
- Use the **speed** (1×/2×/3×) and **pause** buttons (top-right) to manage time.

Tip: your first moves should be a couple of gatherers and a woodcutter near
forest, then houses, and stockpile firewood **before** winter.

## Deploy it to your GitHub (one-time setup)

The repo includes a GitHub Actions workflow that builds and publishes the game to
GitHub Pages on every push.

1. Push this branch to GitHub (already the default for this project).
2. In the repo on GitHub, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. That's it. Each push runs the **Deploy to GitHub Pages** workflow (see the
   **Actions** tab). When it's green, your game is live at
   `https://centerzl93-lang.github.io/mobile-game/`.

> The one manual step is #3 — GitHub requires you to enable Pages yourself; a
> workflow can't turn it on. You only do it once.

## Develop locally

Requires Node 18+.

```bash
npm install
npm run dev          # local dev server (open the printed URL)
npm run build        # production build into dist/
npm run preview      # preview the production build + service worker
```

Icons are generated (no image tools needed) with:

```bash
node scripts/gen-icons.mjs
```

## Project layout

```
index.html              app shell + HUD/menu DOM
src/
  main.ts               bootstrap, game loop, placement, save wiring
  types.ts              shared types + balance constants (tune the game here)
  engine/               camera (pan/zoom) + unified touch/mouse input
  game/                 world gen, buildings, citizens/jobs, simulation, save
  render/renderer.ts    canvas drawing of tiles, buildings, villagers
  ui/ui.ts              HUD, build menu, event log, start/game-over overlays
scripts/gen-icons.mjs   dependency-free PNG icon generator
.github/workflows/      GitHub Pages deploy
```

Want more depth later (mining/blacksmith chains, trading, health, disasters)?
The building/job/resource modules are structured so those slot in without a
rewrite — mostly new entries in `src/types.ts` `BUILDING_DEFS` plus a case in
`src/game/simulation.ts`.
