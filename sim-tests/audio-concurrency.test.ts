/**
 * `ConcurrencyGate` (`src/audio/concurrency.ts`) — pure instance/cooldown accounting, the mechanism
 * behind CLAUDE.md "Sound Concurrency" ("do NOT play one full-volume sound every time every worker
 * performs an action").
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConcurrencyGate } from '../src/audio/concurrency';

test('concurrency: a fresh key is always acquirable', () => {
  const gate = new ConcurrencyGate();
  assert.equal(gate.tryAcquire('woodcut', 0, { maxConcurrent: 3, cooldownMs: 100 }), true);
});

test('concurrency: cooldown blocks a second acquisition of the same key too soon', () => {
  const gate = new ConcurrencyGate();
  assert.equal(gate.tryAcquire('woodcut', 0, { maxConcurrent: 3, cooldownMs: 100 }), true);
  gate.release('woodcut');
  assert.equal(gate.tryAcquire('woodcut', 50, { maxConcurrent: 3, cooldownMs: 100 }), false);
  assert.equal(gate.tryAcquire('woodcut', 150, { maxConcurrent: 3, cooldownMs: 100 }), true);
});

test('concurrency: ten workers finishing the same tick collapse into maxConcurrent, not ten', () => {
  const gate = new ConcurrencyGate();
  let acquired = 0;
  for (let i = 0; i < 10; i++) {
    // Same instant, no cooldown between them — only the concurrency cap should limit this.
    if (gate.tryAcquire('woodcut', 0, { maxConcurrent: 3, cooldownMs: 0 })) acquired++;
  }
  assert.equal(acquired, 3);
  assert.equal(gate.activeCount('woodcut'), 3);
});

test('concurrency: releasing frees a slot for the next acquisition', () => {
  const gate = new ConcurrencyGate();
  for (let i = 0; i < 2; i++) gate.tryAcquire('fire', 0, { maxConcurrent: 2, cooldownMs: 0 });
  assert.equal(gate.tryAcquire('fire', 0, { maxConcurrent: 2, cooldownMs: 0 }), false);
  gate.release('fire');
  assert.equal(gate.tryAcquire('fire', 0, { maxConcurrent: 2, cooldownMs: 0 }), true);
});

test('concurrency: different keys never contend with each other', () => {
  const gate = new ConcurrencyGate();
  assert.equal(gate.tryAcquire('mine', 0, { maxConcurrent: 1, cooldownMs: 1000 }), true);
  assert.equal(gate.tryAcquire('blacksmith', 0, { maxConcurrent: 1, cooldownMs: 1000 }), true);
});

test('concurrency: reset() clears both cooldowns and active counts', () => {
  const gate = new ConcurrencyGate();
  gate.tryAcquire('k', 0, { maxConcurrent: 1, cooldownMs: 1000 });
  gate.reset();
  assert.equal(gate.activeCount('k'), 0);
  assert.equal(gate.tryAcquire('k', 1, { maxConcurrent: 1, cooldownMs: 1000 }), true);
});

test('concurrency: releasing a key with no acquisitions is a harmless no-op', () => {
  const gate = new ConcurrencyGate();
  assert.doesNotThrow(() => gate.release('never-acquired'));
  assert.equal(gate.activeCount('never-acquired'), 0);
});
