import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateAudit } from "../src/audit-validator.mjs";
import { runVamPems9BReconstruction } from "../src/vam-pems-9b/simulator.mjs";

const contract = JSON.parse(
  await readFile(
    new URL("../benchmark-contracts/vam-pems-9b-reconstruction-v1.json", import.meta.url),
    "utf8"
  )
);

test("VAM-PEMS 9B reconstruction is deterministic", () => {
  const first = runVamPems9BReconstruction({ seedCount: 6, size: 32, historyFrames: 8 });
  const second = runVamPems9BReconstruction({ seedCount: 6, size: 32, historyFrames: 8 });

  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.rows, second.rows);
});

test("locked reconstruction supports memory diagnosis but not contour candidate", () => {
  const { summary } = runVamPems9BReconstruction({
    seedCount: 30,
    size: 40,
    historyFrames: 8
  });
  const evaluation = evaluateAudit(summary, contract);

  assert.equal(evaluation.structurally_valid, true);
  assert.equal(evaluation.diagnosis_supported, true);
  assert.equal(evaluation.candidate_supported, false);
  assert.equal(
    evaluation.candidate_checks.find((check) => check.id === "contour_brier_increment").pass,
    false
  );
});

test("oracle remains exact and candidates declare no truth access", () => {
  const { summary } = runVamPems9BReconstruction({
    seedCount: 5,
    size: 32,
    historyFrames: 8
  });

  assert.equal(summary.historical_equivalence_claimed, false);
  assert.equal(summary.candidate_truth_access_count, 0);
  assert.equal(summary.split_overlap_count, 0);
  assert.equal(summary.oracle_missing_accuracy, 1);
  assert.ok(summary.oracle_minus_best_non_oracle_missing_accuracy >= 0);
});

test("decayed memory separates present-only and shuffled controls", () => {
  const { summary } = runVamPems9BReconstruction({
    seedCount: 8,
    size: 36,
    historyFrames: 10
  });

  assert.ok(summary.clean_decayed_over_present_missing_accuracy_ratio > 1.35);
  assert.ok(summary.clean_decayed_over_shuffled_missing_accuracy_ratio > 1.35);
  assert.ok(summary.corrupt_decayed_over_present_missing_accuracy_ratio > 1.2);
});
