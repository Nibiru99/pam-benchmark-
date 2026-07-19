import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateAudit } from "../src/audit-validator.mjs";
import { runVamPems10Reconstruction } from "../src/vam-pems-10/simulator.mjs";

const contract = JSON.parse(
  await readFile(
    new URL("../benchmark-contracts/vam-pems-10-reconstruction-v1.json", import.meta.url),
    "utf8"
  )
);

test("VAM-PEMS 10 reconstruction is deterministic", () => {
  const first = runVamPems10Reconstruction({
    seedCount: 4,
    size: 42,
    historyFrames: 6,
    localGridSize: 14
  });
  const second = runVamPems10Reconstruction({
    seedCount: 4,
    size: 42,
    historyFrames: 6,
    localGridSize: 14
  });

  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.rows, second.rows);
});

test("locked multi-object reconstruction supports protocol but not corrupt candidate", () => {
  const { summary } = runVamPems10Reconstruction({
    seedCount: 30,
    size: 48,
    historyFrames: 8,
    localGridSize: 18
  });
  const evaluation = evaluateAudit(summary, contract);

  assert.equal(evaluation.structurally_valid, true);
  assert.equal(evaluation.diagnosis_supported, true);
  assert.equal(evaluation.candidate_supported, false);
  assert.equal(
    evaluation.candidate_checks.find((check) => check.id === "corrupt_object_accuracy").pass,
    false
  );
  assert.equal(
    evaluation.candidate_checks.find((check) => check.id === "corrupt_present_separation").pass,
    false
  );
});

test("oracle remains isolated and exact", () => {
  const { summary } = runVamPems10Reconstruction({
    seedCount: 5,
    size: 42,
    historyFrames: 6,
    localGridSize: 14
  });

  assert.equal(summary.historical_equivalence_claimed, false);
  assert.equal(summary.supervised_object_masks_provided, true);
  assert.equal(summary.candidate_truth_label_access_count, 0);
  assert.equal(summary.oracle_missing_accuracy, 1);
  assert.ok(summary.oracle_minus_best_non_oracle_missing_accuracy >= 0);
});

test("object-local memory separates global and shuffled controls", () => {
  const { summary } = runVamPems10Reconstruction({
    seedCount: 8,
    size: 44,
    historyFrames: 8,
    localGridSize: 16
  });

  assert.ok(summary.clean_object_over_present_missing_accuracy_ratio > 1.35);
  assert.ok(summary.clean_object_over_global_missing_accuracy_ratio > 1.15);
  assert.ok(summary.clean_object_minus_shuffled_missing_accuracy > 0.35);
});
