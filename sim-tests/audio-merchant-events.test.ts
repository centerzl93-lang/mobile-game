/**
 * Phase 4 (Event Sound Effects) — merchant/trading audio.
 *
 * Covers the boat → bell → arrival sequence (CLAUDE.md/Phase 4 brief "Merchant Arrival Sequence")
 * for both merchant lifecycles the game actually has: a river trader visiting a Trading Post, and
 * a Port fleet on its scheduled seasonal call. `MERCHANT_BOAT` fires when the boat launches
 * (`spawnMerchant`/`spawnPortMerchant`), `MERCHANT_BELL` + `MERCHANT_ARRIVAL` fire together the one
 * instant the boat actually docks (`updateMerchantBoat`'s `arriving` → `docked` transition) —
 * never repeating while the same visit stays docked. The Port half of this is also the regression
 * test for a real Phase-3-era gap this phase closed: `spawnPortMerchant` launched its fleet
 * silently, with no `MERCHANT_BOAT` at all, unlike the river path.
 *
 * The audio layer itself contains no scheduling knowledge — no season, no category, no "is this a
 * river or a Port visit" branch (see CLAUDE.md "Merchant Audio and Randomized Merchants"); these
 * tests drive the real, randomized/scheduled lifecycle rather than calling anything merchant-audio-
 * specific.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update, berthReachesOpenWater } from '../src/game/simulation';
import { canPlace } from '../src/game/buildings';
import { pinRandom } from '../src/game/rng';
import { audioBus, type AudioEvent } from '../src/audio/events';
import { BUILDING_DEFS, SEASON_LENGTH } from '../src/types';
import type { GameState, Building } from '../src/types';

const noLog = () => {};
const mk = (seed: number) => newGame('small', 'normal', false, seed);

function withCapture(fn: () => void): AudioEvent[] {
  const seen: AudioEvent[] = [];
  const off = audioBus.on((event) => seen.push(event));
  try {
    fn();
  } finally {
    off();
  }
  return seen;
}

/** Advance `seconds` of sim time in small fixed steps — the same shape `merchant-redesign.test.ts`
 *  uses, so a boat's per-tick sail/dock logic runs exactly as it does in the real game rather than
 *  in one oversized jump. */
function advance(s: GameState, seconds: number, capture?: AudioEvent[]): void {
  const off = capture ? audioBus.on((e) => capture.push(e)) : undefined;
  try {
    const step = 1;
    for (let t = 0; t < seconds; t += step) update(s, step, noLog);
  } finally {
    off?.();
  }
}

/** A built, water-connected Trading Post at the founding barn's own spot — reliably reachable by
 *  boat, the same trick `sim-tests/merchant-redesign.test.ts` relies on. */
function riverPost(s: GameState): Building {
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  const b = {
    id: s.nextId++, type: 'trading', x: barn.x, y: barn.y, built: true, progress: 99,
    workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {},
  } as unknown as Building;
  s.buildings.push(b);
  return b;
}

/** A buildable, sea-reaching Port spot near the founding barn — same search
 *  `merchant-redesign.test.ts`'s own `findPortSpot` uses (the Port's larger footprint doesn't
 *  reliably fit a fixed offset the way the Trading Post's does). */
function findPortSpot(s: GameState): { x: number; y: number; rot: number } | null {
  const barn = s.buildings.find((b) => b.type === 'barn')!;
  const def = BUILDING_DEFS.port;
  for (let r = 3; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const rot of [0, 1, 2, 3] as const) {
          const x = barn.x + dx;
          const y = barn.y + dy;
          if (!canPlace(s, 'port', x, y, def.w, def.h, rot, { ignoreTier: true }).ok) continue;
          if (!berthReachesOpenWater(s, { type: 'port', x, y, rot } as Building)) continue;
          return { x, y, rot };
        }
      }
    }
  }
  return null;
}

/** A built Port at a buildable, sea-reaching spot — retrying across seeds the same way
 *  `merchant-redesign.test.ts`'s `mkWithPort` does, since not every map's river reaches the Port's
 *  larger footprint from the barn's own corner. `canPlace` also checks affordability, so the barn
 *  is stocked well past the Port's cost before searching — a fresh village's starting stock alone
 *  would read as "no site found" for the same reason an unreachable river would. */
function mkWithPort(seed: number): { s: GameState; port: Building } {
  for (let attempt = 0; attempt < 12; attempt++) {
    const s = mk(seed + attempt * 7919);
    const barn = s.buildings.find((b) => b.type === 'barn')!;
    barn.store.wood = 5000;
    barn.store.stone = 5000;
    barn.store.iron = 5000;
    const spot = findPortSpot(s);
    if (!spot) continue;
    const port = {
      id: s.nextId++, type: 'port', x: spot.x, y: spot.y, rot: spot.rot, built: true, progress: 99,
      workers: [], desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', store: {}, orders: {},
    } as unknown as Building;
    s.buildings.push(port);
    return { s, port };
  }
  throw new Error(`no water-connected Port site found within 12 attempts from seed ${seed}`);
}

test('river merchant: the boat launches (MERCHANT_BOAT), then docking rings the bell and announces arrival exactly once', () => {
  const s = mk(200);
  riverPost(s);

  // Guarantees the arrival roll succeeds on the very first tick — nothing else about the sequence
  // depends on randomness from here (the boat's own movement is plain pathing).
  pinRandom(0);
  const spawnEvents = withCapture(() => update(s, 1, noLog));
  pinRandom(null);
  assert.ok(spawnEvents.includes('MERCHANT_BOAT'));
  assert.equal(s.merchant.phase, 'arriving');

  const dockEvents: AudioEvent[] = [];
  advance(s, 600, dockEvents); // generous budget — the post sits right at the barn
  assert.equal(s.merchant.phase, 'docked', 'the boat reached the post within budget');
  assert.equal(dockEvents.filter((e) => e === 'MERCHANT_BELL').length, 1);
  assert.equal(dockEvents.filter((e) => e === 'MERCHANT_ARRIVAL').length, 1);

  // Staying docked must not repeat the bell (or the arrival announcement) a second time.
  const staying: AudioEvent[] = [];
  advance(s, 60, staying);
  assert.equal(staying.filter((e) => e === 'MERCHANT_BELL').length, 0);
  assert.equal(staying.filter((e) => e === 'MERCHANT_ARRIVAL').length, 0);
});

test('port merchant: the fleet launching also rings MERCHANT_BOAT — the same cue a river trader gets', () => {
  const { s } = mkWithPort(201);
  s.seasonTimer = 0; // so the season-turn budget below crosses exactly one boundary

  // Pinning only the arrival-chance roll would still leave `portSeason`'s own roll to chance; 0
  // guarantees both the season's fleet sails and, further below, that it actually docks.
  pinRandom(0);
  const events: AudioEvent[] = [];
  try {
    advance(s, SEASON_LENGTH + 10, events);
  } finally {
    pinRandom(null);
  }
  assert.equal(s.merchant.viaPort, true, 'sanity: this was a Port visit, not a river one');
  assert.ok(events.includes('MERCHANT_BOAT'), 'a Port fleet launching must sound the same boat cue a river trader does');
  assert.ok(events.includes('MERCHANT_BELL'), 'and dock to the same bell + arrival cue once it ties up');
  assert.ok(events.includes('MERCHANT_ARRIVAL'));
});
