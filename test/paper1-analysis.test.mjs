import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPaper1Analysis } from "../src/paper1-analysis.mjs";

const rows9 = await readFile(new URL("../fixtures/vam_pems_9b_reconstruction_rows.csv", import.meta.url), "utf8");
const rows10 = await readFile(new URL("../fixtures/vam_pems_10_reconstruction_rows.csv", import.meta.url), "utf8");

test("Paper 1 analysis is deterministic and preserves the failed Experiment 10 floor", () => {
  const first = buildPaper1Analysis(rows9, rows10, {
    bootstrapResamples: 500,
    permutationResamples: 1_000
  });
  const second = buildPaper1Analysis(rows9, rows10, {
    bootstrapResamples: 500,
    permutationResamples: 1_000
  });

  assert.deepEqual(first, second);
  assert.ok(first.experiment_9b.principal_comparisons[0].ci95_low > 0);
  assert.ok(first.experiment_10.principal_comparisons[0].ci95_low > 0);
  assert.ok(first.experiment_10.levels.corrupt_accuracy_minus_fixed_floor.ci95_high < 0);
});
