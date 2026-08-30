import type { Citizen, VillagerActivity } from '../types';

/**
 * The villager job animation system's classification layer — Phase 2 of the design brief:
 *
 *   Simulation Job State (`Citizen.activity`/`carry`/`tx,ty` vs `x,y`)
 *     -> Villager Activity State (`VillagerPose.state`, this file)
 *     -> Animation State (the pose numbers below)
 *     -> Visible Animation (`Renderer3D.syncCitizens` turns them into instance transforms)
 *
 * Deliberately pure and THREE-free — see CLAUDE.md "Unity migration architecture": this is the
 * reusable design (Category B) a C# port keeps, swapping only the last step (an Animator/Mecanim
 * driver instead of instanced-mesh matrices). It reads simulation state that already exists
 * (`Citizen.activity`, set by `simulation.ts` at the exact moment real work happens — see its own
 * doc comment) rather than re-deriving "is this villager working" from scratch, so there is exactly
 * one place that decides that question.
 *
 * No state is stored here: every function takes the citizen and a clock and returns a plain
 * object, the same "compute, don't store, derived facts" rule the rest of the codebase follows.
 * That also means the swing keeps ticking smoothly across game-speed changes, pause/unpause, and a
 * save/reload — it is a function of wall-clock time and the citizen's own id, not of any animation
 * clock that would need saving or resetting.
 */

export type AnimState = 'idle' | 'walking' | 'carrying' | 'working';

/** One instant's worth of pose numbers for `Renderer3D` to turn into transforms. Everything here
 *  is a plain number/enum/boolean — cheap to compute fresh every frame for every villager, which
 *  is the whole performance strategy (see CLAUDE.md Phase 10: no per-frame allocation, no stored
 *  animation objects). */
export interface VillagerPose {
  state: AnimState;
  /** The tool prop's pitch this instant, in radians, about its grip (see `toolGeometry` in
   *  `render/villager.ts`) — an absolute angle, not a -1..1 fraction, so the renderer can apply it
   *  directly alongside the villager's yaw. 0 (and `showTool` false) whenever no tool should be
   *  drawn at all. */
  toolSwing: number;
  /** Whether a tool prop should be drawn this instant. False while walking/idle/carrying, and
   *  false for any `Citizen.activity` with no animation mapped yet — see `types.ts`'s
   *  `JOB_ANIMATION` table for which jobs currently have one. */
  showTool: boolean;
}

/**
 * Jobs whose work animation is one continuous sine-wave swing on the shared tool prop — as opposed
 * to `fishing`/`hunting`, which model a distinct cast/draw-and-release cycle below on their own
 * clocks. `farming`/`blacksmithing` share their arc with an existing job (a hoe strokes through a
 * field the same way an axe fells a tree; a smith's hammer is a builder's hammer at a different
 * bench) rather than inventing a fourth shape — the same "one shape stands in for the axe, the
 * pickaxe, the hammer" reasoning `render/villager.ts`'s `toolGeometry` already applies to the prop
 * itself, applied here to the *motion* instead of the mesh.
 */
type SineSwingJob =
  | 'woodcutting'
  | 'mining'
  | 'building'
  | 'farming'
  | 'blacksmithing'
  | 'tailoring'
  | 'gathering'
  | 'herbalist';

/** How fast each sine-swing job's arc cycles, in swings per second. Tuned by eye purely for how the
 *  animation reads; it has no bearing on `WORK_SECONDS` or any other simulation timing (Phase 10's
 *  "don't duplicate simulation logic in the renderer" cuts both ways — this must never be mistaken
 *  for an actual production rate). */
const SWING_HZ: Record<SineSwingJob, number> = {
  woodcutting: 0.62,
  mining: 0.7,
  building: 1.35, // a hammer taps quicker than an axe or pickaxe swings
  farming: 0.5, // a hoe/scythe stroke through a field is unhurried next to felling a tree
  blacksmithing: 1.1, // a hammer on an anvil — a beat slower than a builder's tap, more deliberate
  tailoring: 1.9, // the quickest, smallest beat of any job — short stitches, not a swung tool
  gathering: 0.42, // a reach-down-and-rise dip, not a swing — see `pickMotion`
  herbalist: 0.42,
};

/** A wide, plain-sine arc from raised-back to struck-down-forward and back. Shared by the axe, the
 *  pickaxe and the hoe/scythe — at the few dozen pixels a villager stands on screen, what reads is
 *  the swinging motion and the silhouette of *something* in their hands, not a distinct arc shape
 *  per tool (the same reasoning the model already applies to leg/torso geometry, see
 *  `render/villager.ts`'s file doc comment). Returns the tool's absolute pitch in radians. */
function chopSwing(phase: number): number {
  return -0.65 + Math.sin(phase) * 0.95;
}

/** A hammer's arc is shorter as well as faster — `SWING_HZ.building`/`SWING_HZ.blacksmithing`
 *  already carry the extra speed, so the reduced amplitude here is what also makes it read as a
 *  smaller tool. Shared by construction and the blacksmith's anvil — both are a hammer striking
 *  down onto a fixed point, just at a different pace. */
function hammerSwing(phase: number): number {
  return -0.3 + Math.sin(phase) * 0.5;
}

/** The tailor's needle: the smallest arc of any job — a quick stitch, not a swing a viewer should
 *  read as a weapon or a tool with any weight to it. */
function stitchSwing(phase: number): number {
  return -0.12 + Math.sin(phase) * 0.18;
}

/** A gatherer or herbalist reaching down to a low patch and rising back up — a dip, not a strike,
 *  so the arc sits mostly forward-and-down rather than swinging up past the shoulder the way a
 *  chopping tool does. Shared by both jobs: a hand picking berries and a hand picking herbs read
 *  identically at this figure's scale. */
function pickMotion(phase: number): number {
  return 0.2 + Math.sin(phase) * 0.55;
}

/** How long one cast-wait-reel cycle takes. Not a swing beat like the other three jobs — a
 *  fisherman holds a rod out and mostly waits, so this models three named phases explicitly
 *  (Phase 7's "cast / fishing idle-wait / reel") on one continuous clock rather than a single sine,
 *  even though the current model can only show it as one prop's pitch. Splitting the phases out
 *  now, instead of collapsing straight to a sine, is the extension point Phase 7 asks for: a future
 *  pass with a proper rod-and-line asset swaps in richer motion per phase without touching how this
 *  is driven from simulation state. */
const FISH_CYCLE_SECONDS = 4.2;
const FISH_CAST_FRACTION = 0.12; // rod arcs out from the body
const FISH_REEL_FRACTION = 0.18; // rod tugs back in — the tail end of the cycle

export type FishPhase = 'cast' | 'wait' | 'reel';

export function fishPhaseAt(now: number, id: number): FishPhase {
  const t = (((now + id * 0.97) % FISH_CYCLE_SECONDS) / FISH_CYCLE_SECONDS + 1) % 1;
  if (t < FISH_CAST_FRACTION) return 'cast';
  if (t > 1 - FISH_REEL_FRACTION) return 'reel';
  return 'wait';
}

/** Returns the rod's absolute pitch in radians — a raised, mostly-horizontal hold (a fishing rod
 *  is carried further from vertical than a chopping tool ever is), not the wide down-swing the
 *  other three jobs use. */
function fishingSwing(now: number, id: number): number {
  const t = (((now + id * 0.97) % FISH_CYCLE_SECONDS) / FISH_CYCLE_SECONDS + 1) % 1;
  if (t < FISH_CAST_FRACTION) {
    // Cast: sweep up from a low ready position to the held-out angle.
    return 0.2 + (t / FISH_CAST_FRACTION) * 1.0;
  }
  if (t > 1 - FISH_REEL_FRACTION) {
    // Reel: dips back toward the body, then the cycle restarts into another cast.
    const rt = (t - (1 - FISH_REEL_FRACTION)) / FISH_REEL_FRACTION;
    return 1.2 - rt * 0.6;
  }
  // Wait: held steady, just a faint tremor so it doesn't read as frozen.
  return 1.2 + Math.sin(t * 46) * 0.03;
}

/**
 * How long one bow draw-and-release cycle takes. Modelled the same way as fishing above — named
 * phases on one continuous clock, not a single sine — because a hunter's motion is asymmetric: a
 * slow pull followed by an almost-instant release reads as "drawing a bow", where a symmetric sine
 * would just read as another swung tool.
 */
const HUNT_CYCLE_SECONDS = 2.6;
const HUNT_DRAW_FRACTION = 0.6; // slow pull back to full draw
const HUNT_RELEASE_FRACTION = 0.12; // the string snaps forward almost instantly

/** Returns the bow's absolute pitch in radians. */
function huntingSwing(now: number, id: number): number {
  const t = (((now + id * 0.83) % HUNT_CYCLE_SECONDS) / HUNT_CYCLE_SECONDS + 1) % 1;
  if (t < HUNT_DRAW_FRACTION) {
    // Draw: a slow pull back from a raised ready stance to full draw.
    return -0.2 + (t / HUNT_DRAW_FRACTION) * 1.1;
  }
  if (t < HUNT_DRAW_FRACTION + HUNT_RELEASE_FRACTION) {
    // Release: the string snaps forward almost instantly.
    const rt = (t - HUNT_DRAW_FRACTION) / HUNT_RELEASE_FRACTION;
    return 0.9 - rt * 1.3;
  }
  // Hold: back to the ready stance before the next draw begins.
  return -0.4;
}

/** The waveform for one instant of a sine-swing job's arc — see `SineSwingJob`'s own doc comment
 *  for why each pair shares a shape rather than authoring eight distinct arcs. */
function sineSwingShape(activity: SineSwingJob, phase: number): number {
  switch (activity) {
    case 'woodcutting':
    case 'mining':
    case 'farming':
      return chopSwing(phase);
    case 'building':
    case 'blacksmithing':
      return hammerSwing(phase);
    case 'tailoring':
      return stitchSwing(phase);
    case 'gathering':
    case 'herbalist':
      return pickMotion(phase);
  }
}

/** Jobs with an authored swing on the shared tool prop, driven by the plain sine clock above.
 *  `fishing`/`hunting` are not included — they get their own named-phase clocks (`fishingSwing`/
 *  `huntingSwing`), handled separately in `computeVillagerPose`. Everything else in
 *  `VillagerActivity` falls through `showTool: false`. */
function isSineSwingJob(activity: VillagerActivity): activity is SineSwingJob {
  return (
    activity === 'woodcutting' ||
    activity === 'mining' ||
    activity === 'building' ||
    activity === 'farming' ||
    activity === 'blacksmithing' ||
    activity === 'tailoring' ||
    activity === 'gathering' ||
    activity === 'herbalist'
  );
}

/**
 * The pose for one villager this instant.
 *
 * `moving` is the renderer's own already-computed "is this citizen more than a hair from its
 * destination" test (`Renderer3D.syncCitizens`) — passed in rather than recomputed here, per Phase
 * 10's "don't duplicate simulation/derived logic". A villager mid-stride never swings a tool even
 * if `Citizen.activity` happens to still be set from the tick before they set off again: `activity`
 * is cleared the instant `runCitizen` takes a different branch, but the guard here costs nothing
 * and is the belt-and-suspenders Phase 9 asks for against "work animations while walking".
 */
export function computeVillagerPose(c: Citizen, moving: boolean, now: number): VillagerPose {
  const activity = moving ? undefined : c.activity;
  if (activity === 'fishing') {
    return { state: 'working', toolSwing: fishingSwing(now, c.id), showTool: true };
  }
  if (activity === 'hunting') {
    return { state: 'working', toolSwing: huntingSwing(now, c.id), showTool: true };
  }
  if (activity && isSineSwingJob(activity)) {
    // Phase offset by id (not synchronized) so a crew of woodcutters doesn't chop in lockstep —
    // the same reason `ActivitySoundScheduler`'s jitter exists for the audio side of this.
    const phase = (now * SWING_HZ[activity] + c.id * 0.61) * Math.PI * 2;
    return { state: 'working', toolSwing: sineSwingShape(activity, phase), showTool: true };
  }
  if (c.carry) return { state: 'carrying', toolSwing: 0, showTool: false };
  if (moving) return { state: 'walking', toolSwing: 0, showTool: false };
  return { state: 'idle', toolSwing: 0, showTool: false };
}

/**
 * A subtle stand-still animation so an idle villager doesn't read as frozen — Phase 3's "small
 * body movement, breathing, minor posture variation", kept understated on purpose. `bob` is a tiny
 * vertical rise/fall; `yawWobble` a faint side-to-side turn of the head/shoulders standing in for
 * "looking around". Both are 0 for every other `AnimState` — the caller only applies this to a
 * villager who is genuinely idle (not working, not carrying, not walking).
 */
export function idleSway(now: number, id: number): { bob: number; yawWobble: number } {
  return {
    bob: Math.sin(now * 0.9 + id * 0.73) * 0.006,
    yawWobble: Math.sin(now * 0.35 + id * 1.31) * 0.09,
  };
}
