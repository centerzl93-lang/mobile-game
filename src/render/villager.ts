import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The villager figure, built as a handful of separately-instanced body parts.
 *
 * A busy Large map carries several hundred villagers, all moving every frame, so they cannot be
 * individual models in the scene graph — they have to be instanced. But a single instanced mesh
 * can only carry one transform and one colour per villager, which is what limited them to a
 * tinted capsule. Splitting the figure into parts that are each their own `InstancedMesh` buys
 * back both things that were missing: the tunic, skin, hair and coat can be coloured
 * independently, and the legs get their own transforms, so they can actually swing when walking.
 *
 * Everything is authored here rather than in the Blender pipeline because these need to be
 * per-part geometries with pivots in specific places (a leg pivots at the hip, not at its centre),
 * which is exactly what a merged, exported model would flatten away.
 *
 * Proportions are in tile units, adult standing height ≈ 0.95 — about half a storey of a house,
 * which is the scale Banished-like villages read best at from the play camera.
 */

export const ADULT_HEIGHT = 0.95;
/** Vertical centre of the head, and where the neck meets the body. */
export const HEAD_Y = 0.80;
export const SHOULDER_Y = 0.66;
export const HIP_Y = 0.365;
/** Sideways offset of each leg and arm from the centre line. */
export const LEG_X = 0.055;

// Radial segments. Deliberately miserly: a villager is a few dozen pixels tall on a phone, and
// there can be several hundred of them, so every segment here is paid for hundreds of times over.
const SEG = 5;
const BALL_SEG = 6;
const BALL_RINGS = 4;

function cyl(rTop: number, rBottom: number, height: number, y: number, x = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, SEG, 1);
  g.translate(x, y, z);
  return g;
}

function ball(r: number, y: number, x = 0, z = 0, squashY = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, BALL_SEG, BALL_RINGS);
  g.scale(1, squashY, 1);
  g.translate(x, y, z);
  return g;
}

/**
 * Torso, shoulders and both arms, pivoting at the villager's feet.
 *
 * Arms are modelled into this rather than instanced separately: swinging arms would double the
 * per-frame transform work for a motion cue the legs already carry at this size.
 */
export function bodyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Torso: narrower at the waist than the shoulders, which is most of what makes a shape read as
  // a person rather than as a post.
  parts.push(cyl(0.115, 0.085, SHOULDER_Y - HIP_Y, (SHOULDER_Y + HIP_Y) / 2));
  parts.push(ball(0.115, SHOULDER_Y, 0, 0, 0.55)); // shoulder line
  parts.push(cyl(0.075, 0.09, 0.06, HIP_Y - 0.01)); // hips, where the tunic flares
  for (const sx of [-1, 1]) parts.push(cyl(0.042, 0.032, 0.31, 0.50, sx * 0.128)); // arms
  parts.push(cyl(0.036, 0.036, 0.05, HEAD_Y - 0.115)); // neck
  return mergeGeometries(parts, false)!;
}

/** Head and both hands — everything that takes a skin tone. */
export function skinGeometry(): THREE.BufferGeometry {
  const parts = [ball(0.105, HEAD_Y, 0, 0, 1.06)];
  for (const sx of [-1, 1]) parts.push(ball(0.036, 0.345, sx * 0.132)); // hands at the hem
  return mergeGeometries(parts, false)!;
}

/**
 * Hair: a crown cap plus a short fall at the back.
 *
 * The play camera looks down at a steep angle, so the crown is most of what is ever seen — but a
 * cap alone leaves the figure bald in profile, hence the back piece.
 */
export function hairGeometry(): THREE.BufferGeometry {
  const cap = new THREE.SphereGeometry(0.112, BALL_SEG + 1, 3, 0, Math.PI * 2, 0, Math.PI * 0.52);
  cap.scale(1, 1.02, 1);
  cap.translate(0, HEAD_Y, 0);
  const back = ball(0.085, HEAD_Y - 0.045, 0, -0.045, 0.9);
  return mergeGeometries([cap, back], false)!;
}

/** One leg, pivoting at the hip so the instance transform can swing it. */
export function legGeometry(): THREE.BufferGeometry {
  const thigh = cyl(0.045, 0.036, 0.34, -0.17);
  const foot = ball(0.05, -0.335, 0, 0.018, 0.55);
  return mergeGeometries([thigh, foot], false)!;
}

/**
 * The tool a working villager holds: a handle plus a small head, pivoting at the grip so the
 * instance transform can swing it exactly the way `legGeometry` swings a leg about the hip.
 *
 * One shape stands in for the axe, the pickaxe, the hammer and the fishing rod alike — at this
 * figure's scale (see the file doc comment) a distinct silhouette per tool would not read any
 * differently from a shared one; what actually sells "swinging an axe" versus "casting a line" is
 * the arc it moves through (`render/villagerAnim.ts`), not the prop's shape. Keeping it to one
 * geometry also keeps it to one extra instanced layer alongside legs/hair/coats, not four.
 */
export function toolGeometry(): THREE.BufferGeometry {
  const handle = cyl(0.013, 0.017, 0.30, 0.15);
  const head = ball(0.04, 0.30, 0, 0, 0.65);
  return mergeGeometries([handle, head], false)!;
}

/**
 * The coat: a heavier over-layer covering the torso and upper arms, hanging past the hip.
 *
 * Drawn only for villagers whose household has warm clothing in store, so it needs a silhouette
 * that is obvious at a glance from above — hence the flared hem and the collar, which are the two
 * parts that stay visible when the body itself is mostly hidden by the head and shoulders.
 */
export function coatGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cyl(0.128, 0.155, SHOULDER_Y - HIP_Y + 0.10, (SHOULDER_Y + HIP_Y) / 2 - 0.03)); // flared body
  parts.push(ball(0.128, SHOULDER_Y, 0, 0, 0.6)); // shoulders
  parts.push(cyl(0.088, 0.078, 0.05, HEAD_Y - 0.135)); // collar standing at the neck
  for (const sx of [-1, 1]) parts.push(cyl(0.05, 0.042, 0.22, 0.545, sx * 0.132)); // sleeves
  return mergeGeometries(parts, false)!;
}
