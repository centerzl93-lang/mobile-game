/**
 * The distance/spatial-audio *interface* CLAUDE.md's "Distance / Spatial Audio Architecture" asks
 * for, deliberately kept to one pure function — no stereo panning, no `PannerNode`, no inverse-
 * square curve. A linear falloff to silence at `radius` tiles is enough to make a fire on the far
 * side of the village sound distant without building a spatial audio engine (CLAUDE.md: "do NOT
 * implement a complicated spatial audio engine in this phase").
 *
 * Takes plain `{x,y}` tile-space coordinates — the same units `Building.x`/`Citizen.x` already
 * use — never a `THREE.Vector3` or camera object, so gameplay call sites (`emitAudio(event, {x,
 * y})`) and this function both stay free of any renderer dependency.
 */
export function attenuationFor(
  source: { x: number; y: number } | undefined,
  listener: { x: number; y: number } | undefined,
  radius: number,
): number {
  if (!source || !listener || radius <= 0) return 1; // no position info: always full volume (e.g. UI sounds)
  const dist = Math.hypot(source.x - listener.x, source.y - listener.y);
  if (dist >= radius) return 0;
  return 1 - dist / radius;
}
