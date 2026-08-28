/**
 * The Ranch moved from Hamlet to Village tier (it needs livestock, and only a built Trading Post
 * reliably supplies that — a post that is itself a Village building). This pins the whole
 * `BUILDING_TIER` table exhaustively, so a future change to any *other* building's tier fails
 * loudly here instead of only showing up as a surprise in play.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_TIER, buildingUnlocked, villageTier, pinTier } from '../src/game/tiers';
import { newGame } from '../src/game/state';
import type { BuildingType } from '../src/types';
import type { VillageTier } from '../src/game/tiers';

test.after(() => pinTier(null)); // never leak a pinned tier into another test file

// The exhaustive, hand-checked expectation — one line per building, so a diff against this test
// says exactly which building's tier moved and to what.
const EXPECTED_TIER: Record<BuildingType, VillageTier> = {
  house: 'settlement',
  barn: 'settlement',
  woodcutter: 'settlement',
  lumberyard: 'settlement',
  gatherer: 'settlement',
  hunting: 'settlement',
  fishing: 'settlement',
  herbalist: 'settlement',
  well: 'settlement',
  quarry: 'hamlet',
  mine: 'hamlet',
  blacksmith: 'hamlet',
  tailor: 'hamlet',
  stonehouse: 'hamlet',
  shelter: 'hamlet',
  cemetery: 'hamlet',
  farm: 'hamlet',
  townhall: 'village',
  chapel: 'village',
  hospital: 'village',
  school: 'village',
  market: 'village',
  tavern: 'village',
  trading: 'village',
  ranch: 'village', // moved here from 'hamlet' — the change under test
  university: 'town',
  grandhouse: 'town',
  cathedral: 'town',
  luxury: 'town',
  port: 'city',
  monument: 'city',
};

test('tier-progression: BUILDING_TIER matches the expected table exactly, building by building', () => {
  const actualTypes = Object.keys(BUILDING_TIER).sort();
  const expectedTypes = Object.keys(EXPECTED_TIER).sort();
  assert.deepEqual(actualTypes, expectedTypes, 'no building was added or removed from the table');
  for (const type of expectedTypes as BuildingType[]) {
    assert.equal(BUILDING_TIER[type], EXPECTED_TIER[type], `${type} tier`);
  }
});

test('tier-progression: the ranch is locked below Village and unlocks exactly at it, same as the Trading Post', () => {
  const s = newGame('small', 'easy', false, 1);
  pinTier('settlement');
  assert.equal(buildingUnlocked(s, 'ranch'), false, 'locked at Settlement');
  assert.equal(buildingUnlocked(s, 'trading'), false, 'the post is locked too');

  pinTier('hamlet');
  assert.equal(buildingUnlocked(s, 'ranch'), false, 'still locked at Hamlet — no livestock source yet');
  assert.equal(buildingUnlocked(s, 'trading'), false, 'the post the ranch depends on is still locked');
  // Farm is untouched by this change — it stays a Hamlet building even though it also needs a
  // Trading Post (or merchant) for most crops, because Easy grants one free starting seed.
  assert.equal(buildingUnlocked(s, 'farm'), true, 'farm keeps its own tier — unaffected by this change');

  pinTier('village');
  assert.equal(buildingUnlocked(s, 'ranch'), true, 'unlocked exactly when Village is reached');
  assert.equal(buildingUnlocked(s, 'trading'), true, 'the post that supplies it unlocks the same rung');

  pinTier(null);
});

test('tier-progression: a fresh settlement computes as settlement tier, with the ranch locked live (no pin)', () => {
  const s = newGame('small', 'easy', false, 2);
  assert.equal(villageTier(s), 'settlement');
  assert.equal(buildingUnlocked(s, 'ranch'), false);
});
