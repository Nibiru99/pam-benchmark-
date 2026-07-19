const STRING_FIELDS = new Set(["severity", "condition", "mode"]);
const SEVERITIES = ["standard", "hard", "extreme"];

export function buildPaper1Analysis(rows9Csv, rows10Csv, options = {}) {
  const rows9 = parseCsv(rows9Csv);
  const rows10 = parseCsv(rows10Csv);
  const bootstrapResamples = integerOption(options.bootstrapResamples, 10_000);
  const permutationResamples = integerOption(options.permutationResamples, 100_000);

  assertLockedShape(rows9, 40, "Experiment 9B");
  assertLockedShape(rows10, 40, "Experiment 10");

  const comparison9 = [
    comparison(rows9, {
      id: "clean_decayed_minus_present",
      condition: "clean",
      modeA: "decayed_material_memory",
      modeB: "present_only",
      field: "missing_accuracy"
    }, 9_000, bootstrapResamples, permutationResamples),
    comparison(rows9, {
      id: "clean_decayed_minus_shuffled",
      condition: "clean",
      modeA: "decayed_material_memory",
      modeB: "shuffled_memory_control",
      field: "missing_accuracy"
    }, 9_001, bootstrapResamples, permutationResamples),
    comparison(rows9, {
      id: "corrupt_decayed_minus_present",
      condition: "corrupt",
      modeA: "decayed_material_memory",
      modeB: "present_only",
      field: "missing_accuracy"
    }, 9_002, bootstrapResamples, permutationResamples)
  ];
  const secondary9 = [
    comparison(rows9, {
      id: "clean_contour_minus_decayed_accuracy",
      condition: "clean",
      modeA: "contour_material_memory",
      modeB: "decayed_material_memory",
      field: "missing_accuracy"
    }, 9_003, bootstrapResamples, permutationResamples),
    comparison(rows9, {
      id: "clean_decayed_minus_contour_brier",
      condition: "clean",
      modeA: "decayed_material_memory",
      modeB: "contour_material_memory",
      field: "missing_brier"
    }, 9_004, bootstrapResamples, permutationResamples),
    comparison(rows9, {
      id: "clean_decayed_minus_contour_ece",
      condition: "clean",
      modeA: "decayed_material_memory",
      modeB: "contour_material_memory",
      field: "missing_ece"
    }, 9_005, bootstrapResamples, permutationResamples)
  ];

  const comparison10 = [
    comparison(rows10, {
      id: "clean_object_minus_present",
      condition: "clean",
      modeA: "object_separated_memory",
      modeB: "present_only",
      field: "missing_accuracy"
    }, 10_000, bootstrapResamples, permutationResamples),
    comparison(rows10, {
      id: "clean_object_minus_global",
      condition: "clean",
      modeA: "object_separated_memory",
      modeB: "global_scene_memory",
      field: "missing_accuracy"
    }, 10_001, bootstrapResamples, permutationResamples),
    comparison(rows10, {
      id: "clean_object_minus_shuffled",
      condition: "clean",
      modeA: "object_separated_memory",
      modeB: "shuffled_object_memory_control",
      field: "missing_accuracy"
    }, 10_002, bootstrapResamples, permutationResamples),
    comparison(rows10, {
      id: "corrupt_object_minus_present",
      condition: "corrupt",
      modeA: "object_separated_memory",
      modeB: "present_only",
      field: "missing_accuracy"
    }, 10_003, bootstrapResamples, permutationResamples)
  ];
  const secondary10 = [
    comparison(rows10, {
      id: "clean_contour_minus_object_accuracy",
      condition: "clean",
      modeA: "object_contour_memory",
      modeB: "object_separated_memory",
      field: "missing_accuracy"
    }, 10_004, bootstrapResamples, permutationResamples),
    crossConditionComparison(rows10, {
      id: "object_clean_minus_corrupt_accuracy",
      mode: "object_separated_memory",
      conditionA: "clean",
      conditionB: "corrupt",
      field: "missing_accuracy"
    }, 10_005, bootstrapResamples, permutationResamples)
  ];

  return {
    analysis_id: "vam-pems-paper1-statistical-analysis-v1",
    source_scope: "clean-room synthetic reconstructions; no historical-equivalence claim",
    inference: {
      independent_unit: "locked seed",
      within_seed_rows: "three severity rows retained as a block",
      point_estimate: "unweighted mean across seed-by-severity scenario rows",
      interval: "two-sided 95% percentile seed-block bootstrap",
      bootstrap_resamples: bootstrapResamples,
      test: "two-sided paired seed-level sign-flip Monte Carlo test",
      permutation_resamples: permutationResamples,
      multiplicity: "Holm correction within each experiment's principal comparison family",
      randomization: "deterministic 32-bit LCG with comparison-specific fixed seeds"
    },
    experiment_9b: {
      principal_comparisons: applyHolm(comparison9),
      secondary_comparisons: secondary9,
      levels: {
        clean_decayed_accuracy: level(rows9, "clean", "decayed_material_memory", "missing_accuracy", 9_101, bootstrapResamples),
        corrupt_decayed_accuracy: level(rows9, "corrupt", "decayed_material_memory", "missing_accuracy", 9_102, bootstrapResamples),
        clean_decayed_brier: level(rows9, "clean", "decayed_material_memory", "missing_brier", 9_103, bootstrapResamples),
        clean_contour_brier: level(rows9, "clean", "contour_material_memory", "missing_brier", 9_104, bootstrapResamples),
        clean_decayed_ece: level(rows9, "clean", "decayed_material_memory", "missing_ece", 9_105, bootstrapResamples),
        clean_contour_ece: level(rows9, "clean", "contour_material_memory", "missing_ece", 9_106, bootstrapResamples)
      },
      severity_accuracy: severityTable(rows9, [
        ["clean", "present_only", "clean_present"],
        ["clean", "decayed_material_memory", "clean_decayed"],
        ["corrupt", "decayed_material_memory", "corrupt_decayed"]
      ])
    },
    experiment_10: {
      principal_comparisons: applyHolm(comparison10),
      secondary_comparisons: secondary10,
      levels: {
        clean_object_accuracy: level(rows10, "clean", "object_separated_memory", "missing_accuracy", 10_101, bootstrapResamples),
        corrupt_object_accuracy: level(rows10, "corrupt", "object_separated_memory", "missing_accuracy", 10_102, bootstrapResamples),
        corrupt_accuracy_minus_fixed_floor: shiftedLevel(rows10, "corrupt", "object_separated_memory", "missing_accuracy", -0.65, 10_103, bootstrapResamples),
        clean_worst_object_accuracy: level(rows10, "clean", "object_separated_memory", "worst_object_accuracy", 10_104, bootstrapResamples),
        clean_cross_object_leakage: level(rows10, "clean", "object_separated_memory", "cross_object_leakage_rate", 10_105, bootstrapResamples),
        corrupt_cross_object_leakage: level(rows10, "corrupt", "object_separated_memory", "cross_object_leakage_rate", 10_106, bootstrapResamples),
        clean_object_brier: level(rows10, "clean", "object_separated_memory", "missing_brier", 10_107, bootstrapResamples),
        clean_contour_brier: level(rows10, "clean", "object_contour_memory", "missing_brier", 10_108, bootstrapResamples),
        clean_object_ece: level(rows10, "clean", "object_separated_memory", "missing_ece", 10_109, bootstrapResamples),
        clean_contour_ece: level(rows10, "clean", "object_contour_memory", "missing_ece", 10_110, bootstrapResamples)
      },
      severity_accuracy: severityTable(rows10, [
        ["clean", "present_only", "clean_present"],
        ["clean", "global_scene_memory", "clean_global"],
        ["clean", "object_separated_memory", "clean_object"],
        ["corrupt", "object_separated_memory", "corrupt_object"]
      ])
    }
  };
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(header.map((field, index) => [
      field,
      STRING_FIELDS.has(field) ? values[index] : Number(values[index])
    ]));
  });
}

function assertLockedShape(rows, seedCount, label) {
  const seeds = new Set(rows.map((row) => row.seed));
  const severities = new Set(rows.map((row) => row.severity));
  if (seeds.size !== seedCount || severities.size !== 3) {
    throw new Error(`${label} fixture does not have ${seedCount} seeds and three severities`);
  }
}

function comparison(rows, spec, seed, bootstrapResamples, permutationResamples) {
  const vector = pairedVector(rows, spec.condition, spec.modeA, spec.modeB, spec.field);
  return summarizeDifference(spec.id, vector, seed, bootstrapResamples, permutationResamples);
}

function crossConditionComparison(rows, spec, seed, bootstrapResamples, permutationResamples) {
  const first = perSeed(rows, spec.conditionA, spec.mode, spec.field);
  const second = perSeed(rows, spec.conditionB, spec.mode, spec.field);
  const vector = first.map((value, index) => value - second[index]);
  return summarizeDifference(spec.id, vector, seed, bootstrapResamples, permutationResamples);
}

function summarizeDifference(id, vector, seed, bootstrapResamples, permutationResamples) {
  const interval = bootstrap(vector, seed, bootstrapResamples);
  return {
    id,
    estimate: interval.estimate,
    ci95_low: interval.ci95_low,
    ci95_high: interval.ci95_high,
    p_monte_carlo: permutationP(vector, seed + 100_000, permutationResamples)
  };
}

function pairedVector(rows, condition, modeA, modeB, field) {
  const first = perSeed(rows, condition, modeA, field);
  const second = perSeed(rows, condition, modeB, field);
  return first.map((value, index) => value - second[index]);
}

function perSeed(rows, condition, mode, field) {
  const seeds = [...new Set(rows.map((row) => row.seed))].sort((a, b) => a - b);
  return seeds.map((seed) => {
    const selected = rows.filter((row) => (
      row.seed === seed && row.condition === condition && row.mode === mode
    ));
    if (selected.length !== SEVERITIES.length) {
      throw new Error(`Expected three severity rows for seed ${seed}, ${condition}, ${mode}`);
    }
    return mean(selected.map((row) => row[field]));
  });
}

function level(rows, condition, mode, field, seed, bootstrapResamples) {
  return bootstrap(perSeed(rows, condition, mode, field), seed, bootstrapResamples);
}

function shiftedLevel(rows, condition, mode, field, shift, seed, bootstrapResamples) {
  const vector = perSeed(rows, condition, mode, field).map((value) => value + shift);
  return bootstrap(vector, seed, bootstrapResamples);
}

function severityTable(rows, modes) {
  return Object.fromEntries(SEVERITIES.map((severity) => [
    severity,
    Object.fromEntries(modes.map(([condition, mode, label]) => [
      label,
      mean(rows.filter((row) => (
        row.severity === severity && row.condition === condition && row.mode === mode
      )).map((row) => row.missing_accuracy))
    ]))
  ]));
}

function bootstrap(vector, seed, resamples) {
  const rng = lcg(seed);
  const estimates = new Array(resamples);
  for (let sample = 0; sample < resamples; sample += 1) {
    let total = 0;
    for (let index = 0; index < vector.length; index += 1) {
      total += vector[Math.floor(rng() * vector.length)];
    }
    estimates[sample] = total / vector.length;
  }
  estimates.sort((left, right) => left - right);
  return {
    estimate: mean(vector),
    ci95_low: quantile(estimates, 0.025),
    ci95_high: quantile(estimates, 0.975)
  };
}

function permutationP(vector, seed, resamples) {
  const rng = lcg(seed);
  const observed = Math.abs(mean(vector));
  let atLeastAsExtreme = 0;
  for (let sample = 0; sample < resamples; sample += 1) {
    let total = 0;
    for (const value of vector) {
      total += (rng() < 0.5 ? -1 : 1) * value;
    }
    if (Math.abs(total / vector.length) >= observed - 1e-15) {
      atLeastAsExtreme += 1;
    }
  }
  return (atLeastAsExtreme + 1) / (resamples + 1);
}

function applyHolm(comparisons) {
  const ranked = comparisons
    .map((comparisonValue, index) => ({ comparisonValue, index }))
    .sort((left, right) => left.comparisonValue.p_monte_carlo - right.comparisonValue.p_monte_carlo);
  const adjusted = new Array(comparisons.length);
  let previous = 0;
  for (let rank = 0; rank < ranked.length; rank += 1) {
    const value = Math.min(
      1,
      Math.max(previous, (ranked.length - rank) * ranked[rank].comparisonValue.p_monte_carlo)
    );
    previous = value;
    adjusted[ranked[rank].index] = {
      ...ranked[rank].comparisonValue,
      p_holm: value
    };
  }
  return adjusted;
}

function quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function integerOption(value, fallback) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`Expected a positive integer, received ${resolved}`);
  }
  return resolved;
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}
