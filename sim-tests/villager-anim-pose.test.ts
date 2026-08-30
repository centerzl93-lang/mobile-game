/**
 * Pure unit coverage for the villager job animation system's classification layer
 * (`src/render/villagerAnim.ts`) — no simulation, no renderer, no browser. `computeVillagerPose`
 * takes a citizen-shaped fixture and a clock and returns plain pose numbers, so this file exercises
 * it the same way `audio-decision.test.ts` exercises `decidePlay`: fixtures in, assertions on the
 * returned pose out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVillagerPose, idleSway, fishPhaseAt } from '../src/render/villagerAnim';
import type { Citizen } from '../src/types';

/** A minimal citizen-shaped fixture — only the fields `computeVillagerPose` actually reads. */
function fixture(overrides: Partial<Citizen> = {}): Citizen {
  return {
    id: 1, name: 'X', x: 0, y: 0, tx: 0, ty: 0, homeId: null, jobId: null, carry: null,
    task: { kind: 'idle' }, timer: 0, sex: 'm', age: 30, health: 80, happiness: 80,
    educated: false, sick: false, ...overrides,
  } as Citizen;
}

test('pose: no activity, not carrying, not moving -> idle, no tool', () => {
  const pose = computeVillagerPose(fixture(), false, 0);
  assert.equal(pose.state, 'idle');
  assert.equal(pose.showTool, false);
  assert.equal(pose.toolSwing, 0);
});

test('pose: a plain move with no job state -> walking, no tool', () => {
  const pose = computeVillagerPose(fixture(), true, 0);
  assert.equal(pose.state, 'walking');
  assert.equal(pose.showTool, false);
});

test('pose: carrying a load -> carrying, no tool, regardless of moving', () => {
  const carrying = fixture({ carry: { kind: 'wood', amount: 5 } });
  assert.equal(computeVillagerPose(carrying, true, 0).state, 'carrying');
  assert.equal(computeVillagerPose(carrying, false, 0).state, 'carrying');
  assert.equal(computeVillagerPose(carrying, false, 0).showTool, false);
});

for (const activity of [
  'woodcutting',
  'mining',
  'building',
  'farming',
  'gathering',
  'herbalist',
  'blacksmithing',
  'tailoring',
] as const) {
  test(`pose: stationary '${activity}' activity -> working, tool shown`, () => {
    const c = fixture({ activity });
    const pose = computeVillagerPose(c, false, 1.23);
    assert.equal(pose.state, 'working');
    assert.equal(pose.showTool, true);
    assert.ok(Number.isFinite(pose.toolSwing));
  });

  test(`pose: '${activity}' activity while still moving never swings — Phase 9's "no work animations while walking"`, () => {
    const c = fixture({ activity });
    const pose = computeVillagerPose(c, true, 1.23);
    assert.notEqual(pose.state, 'working');
    assert.equal(pose.showTool, false);
  });
}

test('pose: fishing activity -> working, tool shown, on its own cast/wait/reel clock', () => {
  const c = fixture({ activity: 'fishing' });
  const pose = computeVillagerPose(c, false, 2.0);
  assert.equal(pose.state, 'working');
  assert.equal(pose.showTool, true);
});

test('pose: hunting activity -> working, tool shown, on its own draw/release clock', () => {
  const c = fixture({ activity: 'hunting' });
  const pose = computeVillagerPose(c, false, 1.5);
  assert.equal(pose.state, 'working');
  assert.equal(pose.showTool, true);
  assert.ok(Number.isFinite(pose.toolSwing));
});

test('pose: hunting activity while still moving never swings — same "no work animations while walking" rule', () => {
  const c = fixture({ activity: 'hunting' });
  const pose = computeVillagerPose(c, true, 1.5);
  assert.notEqual(pose.state, 'working');
  assert.equal(pose.showTool, false);
});

test('pose: the bow draw actually varies over a cycle (it is not a frozen stance)', () => {
  const c = fixture({ activity: 'hunting' });
  const angles = new Set<number>();
  for (let t = 0; t < 3; t += 0.2) angles.add(Math.round(computeVillagerPose(c, false, t).toolSwing * 1000));
  assert.ok(angles.size > 2, 'the bow angle should move through several distinct values over a few seconds');
});

test('pose: the swing actually varies over time (it is not a frozen stance)', () => {
  const c = fixture({ activity: 'woodcutting' });
  const angles = new Set<number>();
  for (let t = 0; t < 4; t += 0.3) angles.add(Math.round(computeVillagerPose(c, false, t).toolSwing * 1000));
  assert.ok(angles.size > 2, 'the tool angle should move through several distinct values over a few seconds');
});

test('pose: two different villagers working the same job are not synchronized (jittered by id)', () => {
  const a = computeVillagerPose(fixture({ id: 1, activity: 'mining' }), false, 5);
  const b = computeVillagerPose(fixture({ id: 2, activity: 'mining' }), false, 5);
  assert.notEqual(a.toolSwing, b.toolSwing);
});

test('pose: a job with no animation mapped (activity undefined) never shows a tool even while stationary', () => {
  const pose = computeVillagerPose(fixture({ activity: undefined }), false, 0);
  assert.equal(pose.showTool, false);
});

test('fishPhaseAt: cycles through cast, wait and reel over one cycle', () => {
  const seen = new Set<string>();
  for (let t = 0; t < 4.2; t += 0.05) seen.add(fishPhaseAt(t, 0));
  assert.deepEqual(seen, new Set(['cast', 'wait', 'reel']));
});

test('idleSway: stays small — an understated stand-still animation, not a distracting one', () => {
  for (let t = 0; t < 10; t += 0.37) {
    const { bob, yawWobble } = idleSway(t, 7);
    assert.ok(Math.abs(bob) <= 0.01, `bob ${bob} should be subtle`);
    assert.ok(Math.abs(yawWobble) <= 0.15, `yawWobble ${yawWobble} should be subtle`);
  }
});
