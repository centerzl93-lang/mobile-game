/**
 * Regenerates the Unity parity-harness golden-master fixtures under `parity-fixtures/` (see
 * `parity-fixtures/README.md` and ROADMAP.md's Phase 3 "Parity harness" section).
 *
 * Run with: npm run parity:export
 *
 * This is a deliberate, reviewed step — not run automatically. `sim-tests/parity-fixtures.test.ts`
 * is the automatic half: it re-runs every scenario and fails if the live simulation no longer
 * reproduces what's committed here, so regenerating is only ever done alongside an intentional
 * simulation change, with the resulting diff reviewed like any other behavioural change.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARITY_SCENARIOS, runScenario } from './scenarios';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..', '..', 'parity-fixtures');

for (const scenario of PARITY_SCENARIOS) {
  const dir = join(fixturesRoot, scenario.name);
  mkdirSync(dir, { recursive: true });
  const results = runScenario(scenario);
  for (const { label, state } of results) {
    const fixture = {
      scenario: scenario.name,
      seed: scenario.seed,
      checkpoint: label,
      state,
    };
    const path = join(dir, `${label}.json`);
    writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n');
    console.log(`wrote ${path}`);
  }
}
