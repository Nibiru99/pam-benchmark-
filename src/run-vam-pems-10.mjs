import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runVamPems10Reconstruction } from "./vam-pems-10/simulator.mjs";

const options = parseArguments(process.argv.slice(2));
const result = runVamPems10Reconstruction({
  seedCount: options.seeds,
  size: options.size,
  historyFrames: options.historyFrames,
  localGridSize: options.localGridSize
});

if (options.out) {
  await mkdir(options.out, { recursive: true });
  await writeFile(
    path.join(options.out, "vam_pems_10_reconstruction_summary.json"),
    JSON.stringify(result.summary, null, 2) + "\n",
    "utf8"
  );
  await writeFile(
    path.join(options.out, "vam_pems_10_reconstruction_rows.csv"),
    rowsToCsv(result.rows),
    "utf8"
  );
}

console.log(JSON.stringify(result.summary, null, 2));

function parseArguments(args) {
  const parsed = {
    seeds: 40,
    size: 56,
    historyFrames: 8,
    localGridSize: 20,
    out: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--seeds") {
      parsed.seeds = integerValue(args[++index], "--seeds", 1);
    } else if (argument === "--size") {
      parsed.size = integerValue(args[++index], "--size", 36);
    } else if (argument === "--history-frames") {
      parsed.historyFrames = integerValue(args[++index], "--history-frames", 4);
    } else if (argument === "--local-grid-size") {
      parsed.localGridSize = integerValue(args[++index], "--local-grid-size", 12);
    } else if (argument === "--out") {
      parsed.out = args[++index];
      if (!parsed.out) {
        throw new TypeError("--out requires a directory path");
      }
    } else if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new TypeError("Unknown argument: " + argument);
    }
  }

  return parsed;
}

function integerValue(value, flag, minimum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new TypeError(flag + " must be an integer >= " + minimum);
  }
  return parsed;
}

function rowsToCsv(rows) {
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvValue(row[column])).join(","));
  }
  return lines.join("\n") + "\n";
}

function csvValue(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return '"' + text.replaceAll('"', '""') + '"';
  }
  return text;
}

function printHelp() {
  console.log(
    [
      "Usage: node src/run-vam-pems-10.mjs [options]",
      "",
      "Options:",
      "  --seeds N            Locked seed count (default: 40)",
      "  --size N             Square grid size (default: 56)",
      "  --history-frames N   Memory observation frames (default: 8)",
      "  --local-grid-size N  Object-local memory grid (default: 20)",
      "  --out DIR            Write summary JSON and seed-level CSV",
      "  -h, --help           Show this message"
    ].join("\n")
  );
}
