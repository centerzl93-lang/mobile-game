/**
 * Pure instance/cooldown accounting for sound playback — CLAUDE.md "Sound Concurrency". Holds no
 * audio state of its own (no buffers, no Web Audio nodes, no DOM), so it is trivially unit-testable
 * and, per CLAUDE.md's Unity-migration notes, Category A: the same bookkeeping works verbatim
 * behind a C# audio backend.
 *
 * One gate instance is shared by `manager.ts` for two independent purposes, keyed differently —
 * per-event (`evt:FIRE_STARTED`) and per-category (`cat:sfx`) — so both "don't retrigger this exact
 * sound too often" and "don't let this whole category pile up" are the same mechanism, not two.
 */
export interface ConcurrencyPolicy {
  /** How many instances of this key may be in flight (acquired, not yet released) at once. */
  maxConcurrent: number;
  /** Minimum time between two successful acquisitions of this key, in ms. */
  cooldownMs: number;
}

export class ConcurrencyGate {
  private active = new Map<string, number>();
  private lastAcquired = new Map<string, number>();

  /**
   * Ask permission to start a new instance of `key` at time `now` (ms, any monotonic clock —
   * production uses `performance.now()`/`Date.now()`, tests pass their own). Returns true and
   * books the slot if allowed. The caller must eventually call `release(key)` — once for every
   * successful `tryAcquire` — or the slot leaks and the key throttles forever.
   */
  tryAcquire(key: string, now: number, policy: ConcurrencyPolicy): boolean {
    const last = this.lastAcquired.get(key);
    if (last !== undefined && now - last < policy.cooldownMs) return false;
    const count = this.active.get(key) ?? 0;
    if (count >= policy.maxConcurrent) return false;
    this.active.set(key, count + 1);
    this.lastAcquired.set(key, now);
    return true;
  }

  release(key: string): void {
    const count = this.active.get(key) ?? 0;
    if (count <= 1) this.active.delete(key);
    else this.active.set(key, count - 1);
  }

  /** How many instances of `key` are currently acquired — for tests/inspection. */
  activeCount(key: string): number {
    return this.active.get(key) ?? 0;
  }

  reset(): void {
    this.active.clear();
    this.lastAcquired.clear();
  }
}
