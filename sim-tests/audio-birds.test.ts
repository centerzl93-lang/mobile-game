/**
 * `nextBirdCallAt` (`src/audio/birds.ts`) — pure scheduling math for CLAUDE.md "Bird Audio":
 * "occasional, not continuous... randomized intervals... slight timing variation." Deterministic
 * throughout by injecting `rand` rather than trusting `Math.random` — CLAUDE.md/the task brief:
 * "avoid tests that depend on exact random timing unless the game's RNG architecture supports
 * deterministic testing," which this function's injectable `rand` param does.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextBirdCallAt } from '../src/audio/birds';

test('nextBirdCallAt: never fires immediately — always some gap ahead of now', () => {
  for (const season of ['Spring', 'Summer', 'Autumn', 'Winter'] as const) {
    for (const r of [0, 0.5, 0.999]) {
      const at = nextBirdCallAt(1000, season, () => r);
      assert.ok(at > 1000, `${season} @rand=${r} should be scheduled after now, got ${at}`);
    }
  }
});

test('nextBirdCallAt: a different rand() draw produces a different gap — not a fixed period', () => {
  const a = nextBirdCallAt(0, 'Summer', () => 0);
  const b = nextBirdCallAt(0, 'Summer', () => 1);
  assert.notEqual(a, b);
});

test('nextBirdCallAt: Winter waits noticeably longer than Summer for the same rand() draw', () => {
  const summer = nextBirdCallAt(0, 'Summer', () => 0.5);
  const winter = nextBirdCallAt(0, 'Winter', () => 0.5);
  assert.ok(winter > summer * 2, `expected Winter to be much sparser than Summer (${winter} vs ${summer})`);
});

test('nextBirdCallAt: Winter is quieter, not silent — still schedules a call, never Infinity/NaN', () => {
  const at = nextBirdCallAt(0, 'Winter', () => 0.99);
  assert.ok(Number.isFinite(at));
  assert.ok(at > 0);
});

test('nextBirdCallAt: with no rand() supplied, defaults to Math.random and still produces a sane finite time', () => {
  const at = nextBirdCallAt(5000, 'Spring');
  assert.ok(Number.isFinite(at));
  assert.ok(at > 5000);
});
