import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateAudit } from "../src/audit-validator.mjs";

const fixture = JSON.parse(await readFile(new URL("../fixtures/pac5r_metrics_summary.json", import.meta.url), "utf8"));
const contract = JSON.parse(await readFile(new URL("../benchmark-contracts/pac5r-lineage-address-v1.json", import.meta.url), "utf8"));

test("PAC-5R fixture supports the diagnosis but not the candidate voxel contract", () => {
  const result = evaluateAudit(fixture, contract);

  assert.equal(result.structurally_valid, true);
  assert.equal(result.diagnosis_supported, true);
  assert.equal(result.candidate_supported, false);
  assert.equal(result.candidate_checks.find((check) => check.id === "voxel_identity_separation").pass, false);
  assert.equal(result.candidate_checks.find((check) => check.id === "voxel_spatial_separation").pass, true);
});

test("missing required metrics fail structural validation", () => {
  const result = evaluateAudit({ experiment: "incomplete" }, contract);

  assert.equal(result.structurally_valid, false);
  assert.ok(result.missing_fields.includes("frame_count"));
});

