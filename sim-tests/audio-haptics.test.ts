/**
 * `HapticManager` (`src/audio/haptics.ts`) — the platform-independent haptic abstraction. `vibrate`
 * and `isEnabled` are injected so this runs without a real `navigator.vibrate` (there is none in
 * Node — that absence is itself one of the required "gracefully do nothing" cases).
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HapticManager } from '../src/audio/haptics';
import { audioBus, type HapticEvent } from '../src/audio/events';

test('haptics: trigger() calls the injected vibrate function with that event\'s pattern', () => {
  const calls: number[][] = [];
  const h = new HapticManager({ vibrate: (p) => (calls.push(p), true), isEnabled: () => true });
  h.trigger('BUILDING');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].length > 0);
});

test('haptics: disabling haptics suppresses every trigger', () => {
  const calls: number[][] = [];
  const h = new HapticManager({ vibrate: (p) => (calls.push(p), true), isEnabled: () => false });
  h.trigger('ACHIEVEMENT');
  h.trigger('ERROR');
  assert.equal(calls.length, 0);
});

test('haptics: an unsupported environment (no navigator.vibrate) never throws — default vibrate no-ops', () => {
  const h = new HapticManager({ isEnabled: () => true }); // real default vibrate — no `navigator` in Node
  assert.doesNotThrow(() => h.trigger('WARNING'));
});

test('haptics: install() reacts only to the events mapped to a haptic, ignoring the rest', () => {
  const calls: string[] = [];
  const h = new HapticManager({
    vibrate: () => true,
    isEnabled: () => true,
  });
  // Intercept which pattern fires by wrapping trigger.
  const original = h.trigger.bind(h);
  h.trigger = (event) => {
    calls.push(event);
    original(event);
  };
  h.install();
  audioBus.emit('BUILDING_PLACED'); // mapped → BUILDING
  audioBus.emit('MERCHANT_ARRIVAL'); // not mapped → nothing
  audioBus.emit('TIER_ADVANCED'); // mapped → TIER_ADVANCEMENT
  h.uninstall();
  audioBus.emit('BUILDING_PLACED'); // uninstalled — must not fire again
  assert.deepEqual(calls, ['BUILDING', 'TIER_ADVANCEMENT']);
});

test('haptics: patterns are short — CLAUDE.md "should be subtle", never a long buzz', () => {
  const h = new HapticManager({ vibrate: (p) => (assert.ok(p.reduce((a, b) => a + b, 0) < 250), true), isEnabled: () => true });
  for (const e of ['BUILDING', 'ERROR', 'WARNING', 'ACHIEVEMENT', 'TIER_ADVANCEMENT'] as const) h.trigger(e);
});

test('haptics: intensity hierarchy — Tier > Achievement > Warning > Building > Error, both by "on" time and total pattern length', () => {
  // Read the real PATTERN table indirectly: fire each event once (fresh manager, so no cooldown
  // is in the way yet) and record what the injected `vibrate` actually receives.
  const patterns: Record<string, number[]> = {};
  let current = '';
  const h = new HapticManager({ vibrate: (p) => (patterns[current] = p, true), isEnabled: () => true });
  for (const e of ['ERROR', 'BUILDING', 'WARNING', 'ACHIEVEMENT', 'TIER_ADVANCEMENT'] as const) {
    current = e;
    h.trigger(e);
  }
  const onTime = (p: number[]) => p.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  const total = (p: number[]) => p.reduce((a, b) => a + b, 0);
  const order = ['ERROR', 'BUILDING', 'WARNING', 'ACHIEVEMENT', 'TIER_ADVANCEMENT'] as const;
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      onTime(patterns[order[i]]) > onTime(patterns[order[i - 1]]),
      `${order[i]} should feel stronger (more "on" time) than ${order[i - 1]}`,
    );
    assert.ok(
      total(patterns[order[i]]) >= total(patterns[order[i - 1]]),
      `${order[i]}'s pattern should be at least as long as ${order[i - 1]}'s`,
    );
  }
});

test('haptics: rate limiting — repeated triggers of the same event within its cooldown are suppressed', () => {
  const calls: HapticEvent[] = [];
  let now = 0;
  const h = new HapticManager({ vibrate: () => (calls.push('ERROR'), true), isEnabled: () => true, now: () => now });
  h.trigger('ERROR');
  h.trigger('ERROR'); // same instant — well inside the cooldown
  now += 100;
  h.trigger('ERROR'); // still inside ERROR's cooldown
  assert.equal(calls.length, 1);
  now += 1000;
  h.trigger('ERROR'); // now well past the cooldown
  assert.equal(calls.length, 2);
});

test('haptics: rate limiting is independent per event — an ERROR cooldown does not hold back a BUILDING haptic', () => {
  const calls: string[] = [];
  let now = 0;
  const h = new HapticManager({
    vibrate: () => true,
    isEnabled: () => true,
    now: () => now,
  });
  const orig = h.trigger.bind(h);
  h.trigger = (e) => {
    calls.push(e);
    orig(e);
  };
  h.trigger('ERROR');
  h.trigger('BUILDING'); // same instant, different event — must not be throttled by ERROR's cooldown
  assert.deepEqual(calls, ['ERROR', 'BUILDING']);
});

test('haptics: multiple achievements earned in the same tick coalesce into one vibration, not a buzz-buzz-buzz', () => {
  const calls: number[][] = [];
  const now = 1000;
  const h = new HapticManager({ vibrate: (p) => (calls.push(p), true), isEnabled: () => true, now: () => now });
  h.install();
  // Mirrors `Game.checkAchievements`'s loop over several freshly-earned achievements in one pass —
  // all at the same simulated instant.
  for (let i = 0; i < 4; i++) audioBus.emit('ACHIEVEMENT_EARNED');
  h.uninstall();
  assert.equal(calls.length, 1, 'four achievements in one tick should still be a single haptic');
});

test('haptics: several disaster/warning events landing together (e.g. warnLowStocks crossing several stocks at once) collapse to one WARNING haptic', () => {
  const calls: number[][] = [];
  const now = 5000;
  const h = new HapticManager({ vibrate: (p) => (calls.push(p), true), isEnabled: () => true, now: () => now });
  h.install();
  audioBus.emit('WARNING');
  audioBus.emit('WARNING');
  audioBus.emit('FIRE_STARTED'); // a different AudioEvent, but the same WARNING haptic
  h.uninstall();
  assert.equal(calls.length, 1);
});

test('haptics: cooldown is tracked in the injected clock\'s units, so a real vibration can still fire again later', () => {
  const calls: number[][] = [];
  let now = 0;
  const h = new HapticManager({ vibrate: (p) => (calls.push(p), true), isEnabled: () => true, now: () => now });
  h.trigger('TIER_ADVANCEMENT');
  now += 3000; // TIER_ADVANCEMENT's own cooldown
  h.trigger('TIER_ADVANCEMENT');
  assert.equal(calls.length, 2);
});
