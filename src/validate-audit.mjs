import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { evaluateAudit } from "./audit-validator.mjs";

const defaultMetrics = fileURLToPath(new URL("../fixtures/pac5r_metrics_summary.json", import.meta.url));
const defaultContract = fileURLToPath(new URL("../benchmark-contracts/pac5r-lineage-address-v1.json", import.meta.url));
const metricsPath = process.argv[2] ?? defaultMetrics;
const contractPath = process.argv[3] ?? defaultContract;
const metrics = JSON.parse(await readFile(metricsPath, "utf8"));
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const result = evaluateAudit(metrics, contract);

console.log(JSON.stringify(result, null, 2));
if (!result.structurally_valid) {
  process.exitCode = 1;
}

