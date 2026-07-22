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

- **Pan:** drag one finger. **Zoom:** pinch.
- **Toolbar:** the bottom bar has **Inspect**, build categories (**Housing /
  Food / Resources / Civic / Trade**), **Paths**, **Harvest**, and **Demolish**.
  Tap a category to pop out its buildings.
- **Build:** choose a building, **pan to line up the green outline at the centre
  of the screen, and tap to place it**. Placing only marks a **site** — it costs
  nothing yet. Your **builders walk to a barn, carry the materials to the site,
  and construct it on the spot**. Some buildings must sit on the right terrain.
- **Everything is hauled by hand.** Resources live in **barns** (5000 each), and
  villagers physically **fetch and carry** goods: a gatherer works, then walks a
  load of food to the nearest barn; a blacksmith's worker fetches iron from a
  barn before forging. **Keep barns close to the work** or trips get slow — build
  more barns as you grow (total storage = 5000 × barns).
- **Inspect (👆):** tap any building or villager to see its inventory — a barn's
  contents, a workshop's buffer, or what a villager is carrying right now.
- **Demolish (💥):** tap a building or path to remove it and reclaim **25%** of
  its materials into storage.
- **Paths:** pick **Dirt Path** (free, 1.5× walk speed), **Stone Path**
  (1 stone/tile, 2× speed), or **Bridge** (3 wood/tile, spans water) and **drag one
  finger to draw** a route (pan with two fingers while drawing). Villagers build the
  planned tiles; paths speed all their hauling, so a well-paved village runs much faster.
- **Harvest (🪓):** **drag a square** over the map to mark **trees** and **loose stone**
  for gathering. Idle villagers (your builders) walk out, chop wood or dig stone, and
  haul it back to a barn — a marked forest is **clear-cut to open ground** once emptied.
  It's the way to get wood and stone early, before you've built a lumberyard or quarry.
  (Tap a marked tile with **Demolish** to un-mark it.)
- **Water blocks travel.** Villagers **cannot cross water** — they walk around it and
  over bridges. A **river runs down the middle** of the map with **lakes off the sides**,
  so your village starts on one bank; **build a bridge** to reach and settle the far side.
- **Mountains block travel too.** The tall grey **mountains** are impassable — villagers
  route around them (there are no tunnels). Each mountain has a low, rocky **foothill** band
  at its base where the ground turns back to plain: it's buildable, and the **only** place a
  **Mine** can go. **Quarries** are built against the mountainside to cut stone.

### Buildings

| | Building | Makes | Needs |
|---|---|---|---|
| 🏠 | House | housing for 4 (grows the village) | — |
| 🏡 | Stone House | housing for 5 — cheap winter heat | some **stone** |
| 🧺 | Gatherer | 🍎 fruit | forest in its work-circle |
| 🌱 | Field | a chosen crop, harvested each autumn — pick from any of the **16 varieties** you have the **seed** for | that crop's **seed** (buy from traders) |
| 🎣 | Fishing Hut | 🐟 fish | built on the **shoreline** |
| 🏹 | Hunting Cabin | 🍖 meat + leather | forest in its work-circle |
| 🐄 | Ranch | a chosen animal — 🐄 cattle (meat + leather), 🐖 pigs (meat), or 🐔 chickens (🥚 eggs + meat) | that animal's herd (buy from traders) |
| 🌲 | Lumberyard | wood | forest in its work-circle (it replants) |
| 🪓 | Woodcutter | firewood (from wood) | — |
| ⛏️ | Quarry | stone | built against a **mountainside** |
| 🕳️ | Mine | coal **or** iron (toggle) | built in a mountain's **foothills** |
| ⚒️ | Blacksmith | tools (iron) or steel tools (iron+coal) | — |
| 🧵 | Tailor | clothing (from leather) | — |
| 🚢 | Trading Post | barter with merchants | built on the **shoreline** |
| 🍺 | Tavern | happiness (brews grain into ale) | a worker + **grain** |
| ⛪ | Chapel | happiness | — |
| 🪦 | Cemetery | happiness; eases grief when villagers die | — |
| 🛖 | Barn | more storage | — |

### Jobs & the job board (📋)

Villagers are **builders** by default — they raise your placed buildings and
paths. A newly built workplace starts **unstaffed** — open the **job board**
(📋, top-right) or tap the building to set how many workers it should have with
**− / +**. Mines toggle **Coal/Iron**, blacksmiths toggle **Iron/Steel**, fields
pick a **crop**, ranches pick an **animal**. On the map, a badge shows staffing
(`2/2` green = full). The 🔨 HUD number is how many free builders remain.

### Survival

- Every season villagers eat **food**. Food comes in **many kinds** — wild 🍎 fruit,
  🐟 fish, 🍖 meat, 🥚 eggs, and the **16 farm crops** (grain, corn, potato, carrot,
  tomato, apple, grapes…) — but the HUD shows them as a **single 🍽️ food total**;
  a meal is drawn from whatever's in stock. A **varied diet** (several kinds in
  stock at once) keeps villagers healthier. Every **winter** they burn fuel
  (**firewood** first, then **coal** — coal burns twice as hot) *and* need
  **clothing**; the unclothed can fall ill. Keep all three stocked for winter.
- **Tools** wear out as people work. If the tool stockpile empties, everyone
  works slower — keep a blacksmith going.
- **Resource chains:** Lumberyard → wood → Woodcutter → firewood; Mine → iron →
  Blacksmith → tools (add coal for longer-lasting steel); Hunting/Ranch →
  leather → Tailor → clothing.

### Villagers & families

Villagers are **men and women** who **age one year per in-game year** (seasons are 10
minutes). To grow, you need **families**: a house with an **adult man and woman**,
**spare room**, and a **food surplus** bears **children**. Children take a housing
slot, eat a **half ration**, **can't work**, and grow into adults at **age 4**.
**Old age** claims villagers from about **35 onward** (a rising yearly chance up to
~48), so keep raising the next generation.

**Nomads (immigration).** You don't only grow from within: when you keep a **comfortable
food surplus**, a band of wandering **nomads** (4–12 adults) may show up at the gate —
whether or not you have spare housing. A prompt lets you **welcome them or turn them
away**, so growth is your call. Now and then some newcomers arrive **already sick**
(you'll get a warning), so a village with no way to treat illness takes a risk letting
strangers in — and accepting more mouths than you can house or feed has its own cost.

**Health & Happiness** (shown as averages ❤️/😊 in the HUD, per-villager on inspect):
- **Health** rises with a **varied diet** — the more of the **four food kinds** (fruit,
  grain, fish, meat) you keep in storage at once, the healthier the village. Living on a
  single crop keeps people fed but unwell; low health means more illness and earlier
  old-age death.
- **Happiness** rises with **housing room**, **clothing**, and a **food surplus**, and is
  lifted further by **amenities** — a staffed **🍺 Tavern** (it brews stored grain into
  ale), a **⛪ Chapel**, and a **🪦 Cemetery**. When villagers die with **no cemetery** to
  bury them, morale takes an extra hit. Happier villages have **more children**.
- Both also affect **work output** — unhealthy or unhappy villagers produce less.

**Warmth.** A **🏡 Stone House** shelters 5 and keeps its residents so warm that they burn
far less **firewood** each winter than folk in a timber house — worth the stone once you
can spare it.

**Schools (🏫, Civic).** Staff a school with a teacher and the **children who grow up
while it runs become educated adults who produce ~30% more**. The HUD's age chip shows
🧒 children · 🧑 adults · 👴 elders.

### Disease & disasters (Civic)

- **Disease** outbreaks strike from time to time. The **sick can't work** until they
  recover. A **🌿 Herbalist** gathers herbs into **💊 medicine**, and a **🏥 Hospital**
  with doctors speeds recovery — without them, the ill can die. Keep some medicine
  stocked. A 🤒 count appears in the HUD during an outbreak.
- **Fire** can break out and **burn a building down**, spreading to neighbours. Build
  **⛲ Wells** near your town — buildings within range are usually saved.

### Markets (🛒)

A **Market** is extra storage you place among your homes and workshops. Villagers
deliver and fetch at the **nearest** storage, so a market cuts long hauling trips, and
its **vendors keep a bit of every good in stock** by ferrying from your barns. Storage
capacity now = your barns (5000 each) + markets (2000 each).

### Trading (🚢)

Build a **Trading Post** on the shore and staff it. Every few seasons a
**merchant** docks (a 📦 button appears) — open it to **barter** goods by value
(no money). Traders are the only place to buy **cattle, pigs, or chickens** to
stock a ranch, and **crop seeds** to unlock new fields — each seed is a one-time
purchase that lets you plant that crop on any field from then on. (Easy mode
starts you with one random seed; Normal and Hard start with none.)

### Time

Each season lasts **20 minutes** at 1×; use **speed** (1×/2×/3×) and **pause**.
The game auto-saves, so you can close it and come back.

Tip: gatherers/lumberyard near forest, a woodcutter and tailor for winter, then
push into the hills for a quarry, mine, and blacksmith — and pave paths between
them so villagers move quickly.

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

### 3D view

The world renders in **3D** (Three.js): a low-poly medieval-village look with a tilted
RTS camera — **drag to pan, pinch to zoom, twist two fingers to rotate**, tap to inspect.
The sun casts **shadows**, the sky/light **shift with the seasons** (the ground turns
**snowy in winter**), the **river ripples**, **chimney smoke** rises from homes and
workshops, and villagers **bob as they walk**.

- **Graphics quality** auto-selects: weaker/small phones drop shadows & smoke. Force it with
  **`?gfx=low`** or **`?gfx=high`** in the URL.
- Append **`?2d`** to fall back to the original flat 2D renderer (handy for comparison).

Buildings, trees, and rocks show **placeholder shapes** until you drop in real low-poly
`.glb` models. It's optional and incremental — add one or all. See
[`public/models/README.md`](public/models/README.md) for the drop-in steps, the building keys,
and where to get free **CC0** packs (KayKit, Kenney, Quaternius, Poly Pizza). The loader
auto-centers and scales each model, so exact size/orientation in the file doesn't matter.
Models are cached for offline use after the first online load.

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
