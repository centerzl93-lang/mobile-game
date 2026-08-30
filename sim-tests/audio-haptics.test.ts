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
import { audioBus } from '../src/audio/events';

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
