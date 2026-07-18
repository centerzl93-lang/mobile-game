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
  resources (shown on each button).
  - 🏠 **House** — homes up to 4 villagers and lets the village grow.
  - 🧺 **Gatherer** — collects food from nearby forest year-round.
  - 🌱 **Field** — grows crops, harvested each **autumn**.
  - 🌲 **Lumberyard** — foresters tend the woods and fell trees for **wood**.
  - 🪓 **Woodcutter** — splits stockpiled **wood → firewood** to heat homes.
  - ⛏️ **Quarry** — cuts **stone** from a rocky outcrop (build next to rock).
  - 🕳️ **Coal Mine** — digs **coal**, a hotter winter fuel (needs stone to build).
  - 🛖 **Barn** — raises how much of every resource you can store.
- **Jobs:** villagers are **builders** by default (they raise your placed
  buildings). Each workplace automatically staffs itself from free builders — a
  badge on the building shows workers, e.g. `2/2` (green = full, amber = short).
  The 🔨 count in the HUD is how many free builders you have.
- **Resource chain:** Lumberyard → wood → Woodcutter → firewood. Quarry → stone
  (also needed to build a mine). Mine → coal.
- **Survive:** every season villagers eat food; every **winter** they burn fuel
  (firewood first, then coal — coal burns twice as hot). Run out of food or heat
  and people die. Zero people is game over.
- **Time:** each season lasts **20 minutes** at 1×; use **speed** (1×/2×/3×) and
  **pause** (top-right) to manage it. The game auto-saves, so you can close it
  and come back.

Tip: start with gatherers near forest, a lumberyard + woodcutter for winter
firewood, and houses — then push toward a quarry and mine in the hills.

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
