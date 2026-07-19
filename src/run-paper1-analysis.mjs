import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPaper1Analysis } from "./paper1-analysis.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argumentsMap = parseArguments(process.argv.slice(2));
const rows9Path = resolve(root, argumentsMap.rows9 ?? "fixtures/vam_pems_9b_reconstruction_rows.csv");
const rows10Path = resolve(root, argumentsMap.rows10 ?? "fixtures/vam_pems_10_reconstruction_rows.csv");
const outputPath = resolve(root, argumentsMap.out ?? "outputs/paper1_statistical_analysis.json");
const [rows9, rows10] = await Promise.all([
  readFile(rows9Path, "utf8"),
  readFile(rows10Path, "utf8")
]);

const analysis = {
  ...buildPaper1Analysis(rows9, rows10),
  source_fixtures: {
    vam_pems_9b_reconstruction_rows_csv_sha256: sha256(rows9),
    vam_pems_10_reconstruction_rows_csv_sha256: sha256(rows10)
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--") || index + 1 >= values.length) {
      throw new Error(`Invalid argument sequence near ${key}`);
    }
    parsed[key.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
