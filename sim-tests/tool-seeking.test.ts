/**
 * A bare-handed villager's dedicated errand for a tool (`sendForTool`/`nearestBarnWithTool` in
 * `simulation.ts`/`storage.ts`) — the fix for a worker who drops a load at a tool-less barn and
 * would otherwise keep working bare-handed forever even though a *different* barn has one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game/state';
import { update } from '../src/game/simulation';
import { nearestBarnWithTool } from '../src/game/storage';
import { BUILDING_DEFS } from '../src/types';
import type { GameState, Building, BuildingType, Citizen } from '../src/types';

const noLog = () => {};
const mk = (seed: number, diff: any = 'normal') => newGame('small', diff, false, seed);
const barnOf = (s: GameState) => s.buildings.find((b) => b.type === 'barn')!;

/** Clear, reachable grass for a w×h footprint, searched outward from `center` (default the
 *  village origin) — so a "far" building lands somewhere a villager can actually walk to, not on
 *  water or rock a few tiles off. */
function findClear(
  s: GameState, w: number, h: number, center: { x: number; y: number } = s.origin,
): { x: number; y: number } {
  const occ = (x: number, y: number) => s.buildings.some((b) => {
    const bw = b.w ?? BUILDING_DEFS[b.type].w, bh = b.h ?? BUILDING_DEFS[b.type].h;
    return x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y;
  });
  for (let r = 0; r < 40; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = center.x + dx, y = center.y + dy;
        if (x < 1 || y < 1 || x + w >= s.w - 1 || y + h >= s.h - 1) continue;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w && ok; xx++) {
            const t = s.tiles[(y + yy) * s.w + (x + xx)];
            if (!t || t.type !== 'grass') ok = false;
          }
        if (ok && !occ(x, y)) return { x, y };
      }
  throw new Error('no clear spot');
}
function builtWorkplace(s: GameState, type: BuildingType): Building {
  const { x, y } = findClear(s, BUILDING_DEFS[type].w, BUILDING_DEFS[type].h);
  const b: Building = {
    id: s.nextId++, type, x, y, built: true, progress: BUILDING_DEFS[type].work, workers: [],
    desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}
/** A barn on clear, reachable ground near `(cx, cy)` — walks the same outward search as
 *  `findClear` rather than trusting the raw coordinate to be buildable. */
function barnAt(s: GameState, cx: number, cy: number): Building {
  const { x, y } = findClear(s, BUILDING_DEFS.barn.w, BUILDING_DEFS.barn.h, { x: cx, y: cy });
  const b: Building = {
    id: s.nextId++, type: 'barn', x, y, built: true, progress: BUILDING_DEFS.barn.work, workers: [],
    desiredWorkers: 0, growth: 0, output: 'coal', recipe: 'iron', replant: false, animal: 'cattle', store: {},
  };
  s.buildings.push(b);
  s.navVersion = (s.navVersion ?? 0) + 1;
  return b;
}
function addAdults(s: GameState, n: number) {
  for (let i = 0; i < n; i++)
    s.citizens.push({
      id: s.nextId++, name: 'X', x: s.origin.x, y: s.origin.y, tx: s.origin.x, ty: s.origin.y,
      homeId: null, jobId: null, carry: null, task: { kind: 'idle' }, timer: 0,
      sex: i % 2 ? 'm' : 'f', age: 25, health: 80, happiness: 80, educated: false, sick: false,
    } as Citizen);
}
/** A blacksmith with iron already on hand, so it never needs a barn trip of its own — isolating
 *  the tool-seeking behaviour from ordinary input fetching. */
function idleSmith(s: GameState): Building {
  const smith = builtWorkplace(s, 'blacksmith');
  smith.recipe = 'iron';
  smith.store.iron = 100000;
  smith.desiredWorkers = 1;
  return smith;
}

test('a tool at the nearest barn is picked up in the ordinary course of working', () => {
  const s = mk(5001);
  const barn = barnOf(s);
  barn.store.tools = 20;
  barn.store.fruit = 4000; barn.store.firewood = 2000;
  addAdults(s, 3);
  idleSmith(s);
  for (let i = 0; i < 200; i++) update(s, 0.5, noLog);
  const worker = s.citizens.find((c) => c.tool !== undefined);
  assert.ok(worker, 'a worker equipped a tool');
  assert.equal(worker!.tool, 'iron');
});

test('no tool at the current barn, but one at another — the worker travels there for it', () => {
  const s = mk(5002);
  const nearBarn = barnOf(s);
  delete nearBarn.store.tools;
  delete nearBarn.store.steeltools;
  nearBarn.store.fruit = 4000; nearBarn.store.firewood = 2000;
  // A second barn, well away from the smith, holding the only tools in the village.
  const farBarn = barnAt(s, nearBarn.x + 40, nearBarn.y + 40);
  farBarn.store.tools = 10;
  addAdults(s, 3);
  idleSmith(s);
  let equipped = false;
  for (let i = 0; i < 1200 && !equipped; i++) {
    update(s, 0.5, noLog);
    equipped = s.citizens.some((c) => c.tool !== undefined);
  }
  assert.ok(equipped, 'a worker eventually made the trip to the far barn and equipped a tool');
  assert.equal(farBarn.store.tools, 9, 'the tool came from the far barn specifically');
});

test('no tools anywhere: the villager works bare-handed instead of searching forever', () => {
  const s = mk(5003);
  const barn = barnOf(s);
  delete barn.store.tools;
  delete barn.store.steeltools;
  barn.store.fruit = 4000; barn.store.firewood = 2000;
  addAdults(s, 3);
  const cutter = builtWorkplace(s, 'woodcutter');
  cutter.store.wood = 100000;
  cutter.desiredWorkers = 1;

  // Structurally, "does not endlessly search" holds because `sendForTool` only ever issues a trip
  // when `nearestBarnWithTool` actually finds one — with the village's only barn cleared, there is
  // nowhere to send anyone, so the errand never fires at all.
  assert.equal(nearestBarnWithTool(s, { x: cutter.x, y: cutter.y }), null, 'no barn anywhere has a tool to fetch');

  for (let i = 0; i < 400; i++) update(s, 0.5, noLog);
  assert.ok(s.citizens.every((c) => c.tool === undefined), 'nobody found a tool that was never there');
  assert.equal(barn.store.tools ?? 0, 0, 'and none appeared in the barn either');
  assert.ok(s.gameOver !== true, 'the village is still ticking along — nobody got stuck mid-search');
});

test('multiple barns hold tools: the nearer one is the one a villager is sent to', () => {
  const s = mk(5004);
  delete barnOf(s).store.tools; // the founding barn starts stocked; keep only the two test barns in play
  delete barnOf(s).store.steeltools;
  const pos = { x: s.origin.x, y: s.origin.y };
  const near = barnAt(s, s.origin.x + 6, s.origin.y); // a handful of tiles away
  const far = barnAt(s, s.origin.x + 28, s.origin.y); // clear across the map
  near.store.tools = 5;
  far.store.tools = 5;
  const picked = nearestBarnWithTool(s, pos);
  assert.equal(picked?.id, near.id, 'the closer stock is the one picked, not merely the first found');
});

test('barns hold different tool tiers: distance decides which barn, not the tier', () => {
  const s = mk(5005);
  delete barnOf(s).store.tools; // the founding barn starts stocked; keep only the two test barns in play
  delete barnOf(s).store.steeltools;
  const pos = { x: s.origin.x, y: s.origin.y };
  const near = barnAt(s, s.origin.x + 6, s.origin.y); // a handful of tiles away — plain iron only
  const far = barnAt(s, s.origin.x + 28, s.origin.y); // clear across the map — steel only
  near.store.tools = 5;
  far.store.steeltools = 5;
  const picked = nearestBarnWithTool(s, pos);
  assert.equal(picked?.id, near.id, 'the nearer barn is picked even though it only has iron');

  // And once there, `tryEquipTool` still applies its own steel-first rule to *that* barn's own
  // shelf — a barn holding only iron hands over iron, not the far barn's steel.
  const s2 = mk(5006);
  const nearBarn = barnOf(s2);
  delete nearBarn.store.tools;
  delete nearBarn.store.steeltools;
  nearBarn.store.tools = 10; // this barn only ever has iron
  nearBarn.store.fruit = 4000; nearBarn.store.firewood = 2000;
  addAdults(s2, 3);
  idleSmith(s2);
  let worker: Citizen | undefined;
  for (let i = 0; i < 400 && !worker; i++) {
    update(s2, 0.5, noLog);
    worker = s2.citizens.find((c) => c.tool !== undefined);
  }
  assert.ok(worker, 'equipped from the only barn available');
  assert.equal(worker!.tool, 'iron', 'iron is recognised and taken when it is what the barn has');
});
