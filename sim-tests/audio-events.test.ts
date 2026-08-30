/**
 * The semantic event bus (`src/audio/events.ts`) — the decoupling layer between gameplay
 * (`emitAudio`) and the audio/haptic backends (`AudioManager`/`HapticManager`, each `install()`-ed
 * onto it independently). Pure pub/sub, no browser APIs, so it is exercised directly here.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEventBus, audioBus, emitAudio } from '../src/audio/events';

test('audio-events: a subscriber receives the event and payload it was emitted with', () => {
  const bus = new AudioEventBus();
  const received: { event: string; payload: unknown }[] = [];
  bus.on((event, payload) => received.push({ event, payload }));
  bus.emit('BUILDING_PLACED', { x: 3, y: 4 });
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], { event: 'BUILDING_PLACED', payload: { x: 3, y: 4 } });
});

test('audio-events: emit with no payload delivers an empty object, never undefined', () => {
  const bus = new AudioEventBus();
  let payload: unknown;
  bus.on((_event, p) => (payload = p));
  bus.emit('TRADE_COMPLETED');
  assert.deepEqual(payload, {});
});

test('audio-events: multiple independent subscribers (audio + haptics) each see every event', () => {
  const bus = new AudioEventBus();
  let a = 0;
  let b = 0;
  bus.on(() => a++);
  bus.on(() => b++);
  bus.emit('FIRE_STARTED');
  bus.emit('FIRE_STARTED');
  assert.equal(a, 2);
  assert.equal(b, 2);
});

test('audio-events: unsubscribing (the function `on` returns) stops further delivery', () => {
  const bus = new AudioEventBus();
  let count = 0;
  const off = bus.on(() => count++);
  bus.emit('WARNING');
  off();
  bus.emit('WARNING');
  assert.equal(count, 1);
});

test('audio-events: off() also stops delivery', () => {
  const bus = new AudioEventBus();
  let count = 0;
  const fn = () => count++;
  bus.on(fn);
  bus.off(fn);
  bus.emit('WARNING');
  assert.equal(count, 0);
});

test('audio-events: a subscriber that throws never breaks emit for the others, or the caller', () => {
  const bus = new AudioEventBus();
  let secondRan = false;
  bus.on(() => {
    throw new Error('broken audio backend');
  });
  bus.on(() => {
    secondRan = true;
  });
  assert.doesNotThrow(() => bus.emit('INVALID_ACTION'));
  assert.equal(secondRan, true);
});

test('audio-events: the shared singleton bus/emitAudio wiring works end to end', () => {
  let seen: string | undefined;
  const off = audioBus.on((event) => (seen = event));
  emitAudio('ACHIEVEMENT_EARNED');
  off();
  assert.equal(seen, 'ACHIEVEMENT_EARNED');
});
