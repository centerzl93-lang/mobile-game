/**
 * Unity parity-harness regression gate (ROADMAP.md Phase 3 "Parity harness").
 *
 * Re-runs every scenario in `tools/parity/scenarios.ts` and asserts the freshly computed
 * `GameState` at each checkpoint deep-equals the committed fixture under `parity-fixtures/`. This is
 * what stops the golden masters silently drifting out from under the future C# port whenever
 * `simulation.ts` changes: a real behavioural change makes this test fail until someone regenerates
 * the fixtures on purpose (`npm run parity:export`) and reviews the diff, the same way a save-schema
 * change requires a deliberate `VERSION` bump rather than a silent one.
 *
 * Run with:  npx tsx --test sim-tests/*.test.ts   (or `npm run test:sim`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARITY_SCENARIOS, runScenario } from '../tools/parity/scenarios';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..', 'parity-fixtures');

for (const scenario of PARITY_SCENARIOS) {
  test(`parity fixture: ${scenario.name}`, () => {
    const results = runScenario(scenario);
    assert.equal(
      results.length,
      scenario.checkpoints.length,
      'one snapshot per declared checkpoint',
    );
    for (const { label, state } of results) {
      const path = join(fixturesRoot, scenario.name, `${label}.json`);
      let raw: string;
      try {
        raw = readFileSync(path, 'utf8');
      } catch {
        throw new Error(
          `missing fixture ${path} — run \`npm run parity:export\` and commit the result`,
        );
      }
      const fixture = JSON.parse(raw) as { scenario: string; seed: number; checkpoint: string; state: unknown };
      assert.deepEqual(
        JSON.parse(JSON.stringify(state)),
        fixture.state,
        `${scenario.name}/${label}: live simulation no longer matches the committed golden master — ` +
          `if this is an intentional simulation change, run \`npm run parity:export\` and review the diff`,
      );
    }
  });
}
