/**
 * Pick one of `variations`, avoiding an immediate repeat of `last` when more than one option exists
 * — CLAUDE.md "Support Variations"/"Prevent Repeated Sound Selection": "a simple 'don't immediately
 * repeat the previous sound' rule is sufficient... do not build a complex audio recommendation
 * algorithm." Shared by one-shot sfx (`AudioManager.playSfx`, via `decidePlay`'s `pickVariation`
 * hook) and progression music (`AudioManager.pickMusicVariation`) so there is one rule for "don't
 * play the same file twice running," not two.
 *
 * Falls back to a plain random pick when there's nothing to avoid repeating (a single variation, or
 * no previous play yet). Returns `undefined` only when `variations` itself is empty — every call
 * site already guards that case before calling (an empty array means "no asset for this event yet,"
 * handled upstream), so this never actually returns it in practice, but the type stays honest about
 * the input rather than asserting.
 */
export function pickVariationAvoidingRepeat(
  variations: string[],
  last: string | null,
  rand: () => number = Math.random,
): string | undefined {
  if (variations.length === 0) return undefined;
  if (variations.length === 1 || last === null) return variations[(rand() * variations.length) | 0];
  const others = variations.filter((v) => v !== last);
  return others.length > 0 ? others[(rand() * others.length) | 0] : variations[0];
}
