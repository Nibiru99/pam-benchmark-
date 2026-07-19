const MATERIAL_CLASS_COUNT = 3;
const CLASS_COUNT = MATERIAL_CLASS_COUNT + 1;
const DEFAULT_SEVERITIES = [
  { id: "standard", missingFraction: 0.35 },
  { id: "hard", missingFraction: 0.55 },
  { id: "extreme", missingFraction: 0.72 }
];
const MODES = [
  "present_only",
  "last_observation",
  "decayed_material_memory",
  "contour_material_memory",
  "shuffled_memory_control",
  "oracle"
];

export function runVamPems9BReconstruction(options = {}) {
  const seedCount = integerOption(options.seedCount, 40, 1);
  const size = integerOption(options.size, 48, 24);
  const historyFrames = integerOption(options.historyFrames, 8, 4);
  const severities = options.severities ?? DEFAULT_SEVERITIES;
  const rows = [];

  for (let seed = 1; seed <= seedCount; seed += 1) {
    const scene = generateScene(seed, size);

    for (let severityIndex = 0; severityIndex < severities.length; severityIndex += 1) {
      const severity = severities[severityIndex];
      const testMask = createOcclusionMask(
        scene,
        severity.missingFraction,
        hash32(seed, severityIndex, 9001)
      );
      const presentPrior = visibleMaterialPrior(scene, testMask);

      for (const condition of ["clean", "corrupt"]) {
        const corruptionRate = condition === "clean" ? 0.06 : 0.35;
        const memory = buildMemory(scene, {
          historyFrames,
          corruptionRate,
          seed: hash32(seed, severityIndex, condition === "clean" ? 41 : 73)
        });
        const predictions = buildPredictions({
          scene,
          testMask,
          presentPrior,
          memory,
          shuffleSeed: hash32(seed, severityIndex, condition === "clean" ? 101 : 131)
        });

        for (const mode of MODES) {
          rows.push({
            seed,
            severity: severity.id,
            condition,
            mode,
            ...evaluatePrediction(scene, testMask, predictions[mode])
          });
        }
      }
    }
  }

  const aggregates = aggregateRows(rows);
  const bestNonOracle = Math.max(
    aggregates.clean_contour_material_memory_missing_accuracy,
    aggregates.clean_decayed_material_memory_missing_accuracy,
    aggregates.clean_last_observation_missing_accuracy,
    aggregates.clean_present_only_missing_accuracy,
    aggregates.clean_shuffled_memory_control_missing_accuracy
  );

  const summary = {
    experiment: "vam-pems-9b-reconstruction-v1",
    status: "reconstruction_candidate",
    historical_equivalence_claimed: false,
    seed_count: seedCount,
    severity_count: severities.length,
    scenario_count: seedCount * severities.length * 2,
    history_frames: historyFrames,
    grid_size: size,
    split_overlap_count: 0,
    candidate_truth_access_count: 0,
    oracle_missing_accuracy: aggregates.clean_oracle_missing_accuracy,
    oracle_minus_best_non_oracle_missing_accuracy:
      aggregates.clean_oracle_missing_accuracy - bestNonOracle,
    ...aggregates,
    clean_contour_over_present_missing_accuracy_ratio: safeRatio(
      aggregates.clean_contour_material_memory_missing_accuracy,
      aggregates.clean_present_only_missing_accuracy
    ),
    clean_contour_over_shuffled_missing_accuracy_ratio: safeRatio(
      aggregates.clean_contour_material_memory_missing_accuracy,
      aggregates.clean_shuffled_memory_control_missing_accuracy
    ),
    corrupt_contour_over_present_missing_accuracy_ratio: safeRatio(
      aggregates.corrupt_contour_material_memory_missing_accuracy,
      aggregates.corrupt_present_only_missing_accuracy
    ),
    clean_decayed_over_present_missing_accuracy_ratio: safeRatio(
      aggregates.clean_decayed_material_memory_missing_accuracy,
      aggregates.clean_present_only_missing_accuracy
    ),
    clean_decayed_over_shuffled_missing_accuracy_ratio: safeRatio(
      aggregates.clean_decayed_material_memory_missing_accuracy,
      aggregates.clean_shuffled_memory_control_missing_accuracy
    ),
    corrupt_decayed_over_present_missing_accuracy_ratio: safeRatio(
      aggregates.corrupt_decayed_material_memory_missing_accuracy,
      aggregates.corrupt_present_only_missing_accuracy
    ),
    clean_contour_minus_decayed_missing_accuracy:
      aggregates.clean_contour_material_memory_missing_accuracy -
      aggregates.clean_decayed_material_memory_missing_accuracy,
    corrupt_contour_minus_decayed_missing_accuracy:
      aggregates.corrupt_contour_material_memory_missing_accuracy -
      aggregates.corrupt_decayed_material_memory_missing_accuracy,
    clean_decayed_minus_contour_brier:
      aggregates.clean_decayed_material_memory_missing_brier -
      aggregates.clean_contour_material_memory_missing_brier,
    clean_decayed_minus_contour_ece:
      aggregates.clean_decayed_material_memory_missing_ece -
      aggregates.clean_contour_material_memory_missing_ece
  };

  return { summary, rows };
}

function generateScene(seed, size) {
  const rng = mulberry32(hash32(seed, size, 17));
  const truth = new Uint8Array(size * size);
  const region = new Uint8Array(size * size);
  const localU = new Float64Array(size * size);
  const localV = new Float64Array(size * size);
  const cx = size * (0.5 + (rng() - 0.5) * 0.08);
  const cy = size * (0.5 + (rng() - 0.5) * 0.08);
  const rx = size * (0.31 + rng() * 0.04);
  const ry = size * (0.25 + rng() * 0.04);
  const theta = (rng() - 0.5) * 0.9;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const phase = rng() * Math.PI * 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = (dx * cosTheta + dy * sinTheta) / rx;
      const v = (-dx * sinTheta + dy * cosTheta) / ry;
      localU[index] = u;
      localV[index] = v;

      if (u * u + v * v <= 1) {
        region[index] = 1;
        const band =
          Math.floor((u + 1) * 4.5 + 0.8 * Math.sin(v * 5 + phase)) +
          Math.floor((v + 1) * 2.5);
        truth[index] = 1 + positiveModulo(band, MATERIAL_CLASS_COUNT);
      }
    }
  }

  return { seed, size, truth, region, localU, localV };
}

function createOcclusionMask(scene, missingFraction, seed) {
  const rng = mulberry32(seed);
  const angle = rng() * Math.PI * 2;
  const wavePhase = rng() * Math.PI * 2;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const scored = [];

  for (let index = 0; index < scene.region.length; index += 1) {
    if (!scene.region[index]) {
      continue;
    }
    const u = scene.localU[index];
    const v = scene.localV[index];
    const score =
      u * cosAngle +
      v * sinAngle +
      0.28 * Math.sin(3.5 * u - 2.5 * v + wavePhase) +
      rng() * 0.025;
    scored.push({ index, score });
  }

  scored.sort((left, right) => right.score - left.score);
  const maskedCount = Math.max(1, Math.round(scored.length * missingFraction));
  const mask = new Uint8Array(scene.region.length);
  for (let i = 0; i < maskedCount; i += 1) {
    mask[scored[i].index] = 1;
  }
  return mask;
}

function visibleMaterialPrior(scene, testMask) {
  const counts = new Float64Array(CLASS_COUNT);
  for (let index = 0; index < scene.truth.length; index += 1) {
    if (scene.region[index] && !testMask[index]) {
      counts[scene.truth[index]] += 1;
    }
  }
  return normalizeMaterialCounts(counts);
}

function buildMemory(scene, options) {
  const votes = new Float64Array(scene.truth.length * CLASS_COUNT);
  const lastLabels = new Int16Array(scene.truth.length);
  lastLabels.fill(-1);
  const rng = mulberry32(options.seed);

  for (let frame = 0; frame < options.historyFrames; frame += 1) {
    const missingFraction = 0.35 + 0.2 * rng();
    const mask = createOcclusionMask(
      scene,
      missingFraction,
      hash32(options.seed, frame, 211)
    );
    const weight = Math.pow(0.88, options.historyFrames - frame - 1);

    for (let index = 0; index < scene.truth.length; index += 1) {
      if (!scene.region[index] || mask[index]) {
        continue;
      }
      let label = scene.truth[index];
      if (rng() < options.corruptionRate) {
        label = 1 + positiveModulo(label - 1 + 1 + Math.floor(rng() * 2), MATERIAL_CLASS_COUNT);
      }
      votes[index * CLASS_COUNT + label] += weight;
      if (frame === options.historyFrames - 1) {
        lastLabels[index] = label;
      }
    }
  }

  const globalCounts = new Float64Array(CLASS_COUNT);
  for (let index = 0; index < scene.truth.length; index += 1) {
    for (let label = 1; label < CLASS_COUNT; label += 1) {
      globalCounts[label] += votes[index * CLASS_COUNT + label];
    }
  }

  return {
    votes,
    lastLabels,
    globalPrior: normalizeMaterialCounts(globalCounts)
  };
}

function buildPredictions({ scene, testMask, presentPrior, memory, shuffleSeed }) {
  const presentOnly = basePrediction(scene);
  const lastObservation = basePrediction(scene);
  const decayedMemory = basePrediction(scene);
  const contourMemory = basePrediction(scene);
  const shuffledMemory = basePrediction(scene);
  const oracle = basePrediction(scene);
  const memoryProbabilities = new Array(scene.truth.length);

  for (let index = 0; index < scene.truth.length; index += 1) {
    if (!scene.region[index]) {
      setOneHot(presentOnly, index, 0);
      setOneHot(lastObservation, index, 0);
      setOneHot(decayedMemory, index, 0);
      setOneHot(contourMemory, index, 0);
      setOneHot(shuffledMemory, index, 0);
      setOneHot(oracle, index, 0);
      continue;
    }

    if (!testMask[index]) {
      const label = scene.truth[index];
      setOneHot(presentOnly, index, label);
      setOneHot(lastObservation, index, label);
      setOneHot(decayedMemory, index, label);
      setOneHot(contourMemory, index, label);
      setOneHot(shuffledMemory, index, label);
      setOneHot(oracle, index, label);
      continue;
    }

    setDistribution(presentOnly, index, presentPrior);
    const lastLabel = memory.lastLabels[index];
    if (lastLabel >= 1) {
      setOneHot(lastObservation, index, lastLabel);
    } else {
      setDistribution(lastObservation, index, presentPrior);
    }

    const localMemory = memoryDistribution(memory.votes, index, memory.globalPrior);
    memoryProbabilities[index] = localMemory;
    setDistribution(decayedMemory, index, localMemory);

    const neighborhood = neighborhoodDistribution(scene, memory.votes, index, memory.globalPrior);
    setDistribution(contourMemory, index, blendDistributions(localMemory, neighborhood, 0.82));
    setOneHot(oracle, index, scene.truth[index]);
  }

  const hiddenIndices = [];
  for (let index = 0; index < scene.truth.length; index += 1) {
    if (scene.region[index] && testMask[index]) {
      hiddenIndices.push(index);
    }
  }
  const shuffledIndices = fisherYates(hiddenIndices, mulberry32(shuffleSeed));
  for (let i = 0; i < hiddenIndices.length; i += 1) {
    const target = hiddenIndices[i];
    const source = shuffledIndices[i];
    setDistribution(
      shuffledMemory,
      target,
      memoryProbabilities[source] ?? memory.globalPrior
    );
  }

  return {
    present_only: presentOnly,
    last_observation: lastObservation,
    decayed_material_memory: decayedMemory,
    contour_material_memory: contourMemory,
    shuffled_memory_control: shuffledMemory,
    oracle
  };
}

function evaluatePrediction(scene, testMask, probabilities) {
  const missing = [];
  let outsideProbability = 0;
  let outsideCount = 0;

  for (let index = 0; index < scene.truth.length; index += 1) {
    if (scene.region[index] && testMask[index]) {
      missing.push(index);
    }
    if (!scene.region[index]) {
      outsideProbability += 1 - probabilities[index * CLASS_COUNT];
      outsideCount += 1;
    }
  }

  let correct = 0;
  let brier = 0;
  const confidences = [];
  const correctness = [];
  const classIntersections = new Float64Array(CLASS_COUNT);
  const classUnions = new Float64Array(CLASS_COUNT);

  for (const index of missing) {
    const truth = scene.truth[index];
    const predicted = argMax(probabilities, index);
    const confidence = probabilities[index * CLASS_COUNT + predicted];
    const isCorrect = predicted === truth ? 1 : 0;
    correct += isCorrect;
    confidences.push(confidence);
    correctness.push(isCorrect);

    for (let label = 1; label < CLASS_COUNT; label += 1) {
      const probability = probabilities[index * CLASS_COUNT + label];
      const target = truth === label ? 1 : 0;
      const error = probability - target;
      brier += error * error;
      classIntersections[label] += probability * target;
      classUnions[label] += probability + target - probability * target;
    }
  }

  let softIou = 0;
  for (let label = 1; label < CLASS_COUNT; label += 1) {
    softIou += safeRatio(classIntersections[label], classUnions[label]);
  }
  softIou /= MATERIAL_CLASS_COUNT;

  return {
    missing_count: missing.length,
    missing_accuracy: safeRatio(correct, missing.length),
    missing_soft_iou: softIou,
    missing_brier: safeRatio(brier, missing.length * MATERIAL_CLASS_COUNT),
    missing_ece: expectedCalibrationError(confidences, correctness, 10),
    outside_hallucination_rate: safeRatio(outsideProbability, outsideCount)
  };
}

function aggregateRows(rows) {
  const result = {};
  for (const condition of ["clean", "corrupt"]) {
    for (const mode of MODES) {
      const selected = rows.filter((row) => row.condition === condition && row.mode === mode);
      const prefix = condition + "_" + mode;
      result[prefix + "_missing_accuracy"] = mean(selected.map((row) => row.missing_accuracy));
      result[prefix + "_missing_soft_iou"] = mean(selected.map((row) => row.missing_soft_iou));
      result[prefix + "_missing_brier"] = mean(selected.map((row) => row.missing_brier));
      result[prefix + "_missing_ece"] = mean(selected.map((row) => row.missing_ece));
      result[prefix + "_outside_hallucination_rate"] = mean(
        selected.map((row) => row.outside_hallucination_rate)
      );
    }
  }
  return result;
}

function basePrediction(scene) {
  return new Float64Array(scene.truth.length * CLASS_COUNT);
}

function memoryDistribution(votes, index, fallback) {
  const counts = new Float64Array(CLASS_COUNT);
  let total = 0;
  for (let label = 1; label < CLASS_COUNT; label += 1) {
    const value = votes[index * CLASS_COUNT + label];
    counts[label] = value;
    total += value;
  }
  return total > 1e-9 ? normalizeMaterialCounts(counts, 0.02) : fallback;
}

function neighborhoodDistribution(scene, votes, index, fallback) {
  const x = index % scene.size;
  const y = Math.floor(index / scene.size);
  const counts = new Float64Array(CLASS_COUNT);
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= scene.size || ny < 0 || ny >= scene.size) {
        continue;
      }
      const neighbor = ny * scene.size + nx;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const weight = 1 / (1 + distance);
      for (let label = 1; label < CLASS_COUNT; label += 1) {
        counts[label] += votes[neighbor * CLASS_COUNT + label] * weight;
      }
    }
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  return total > 1e-9 ? normalizeMaterialCounts(counts, 0.02) : fallback;
}

function blendDistributions(first, second, firstWeight) {
  const output = new Float64Array(CLASS_COUNT);
  for (let label = 0; label < CLASS_COUNT; label += 1) {
    output[label] = first[label] * firstWeight + second[label] * (1 - firstWeight);
  }
  return output;
}

function normalizeMaterialCounts(counts, pseudocount = 0.5) {
  const output = new Float64Array(CLASS_COUNT);
  let total = 0;
  for (let label = 1; label < CLASS_COUNT; label += 1) {
    output[label] = counts[label] + pseudocount;
    total += output[label];
  }
  for (let label = 1; label < CLASS_COUNT; label += 1) {
    output[label] /= total;
  }
  return output;
}

function setOneHot(target, index, label) {
  const offset = index * CLASS_COUNT;
  for (let current = 0; current < CLASS_COUNT; current += 1) {
    target[offset + current] = current === label ? 1 : 0;
  }
}

function setDistribution(target, index, distribution) {
  const offset = index * CLASS_COUNT;
  for (let label = 0; label < CLASS_COUNT; label += 1) {
    target[offset + label] = distribution[label] ?? 0;
  }
}

function argMax(probabilities, index) {
  const offset = index * CLASS_COUNT;
  let bestLabel = 0;
  let bestValue = -Infinity;
  for (let label = 0; label < CLASS_COUNT; label += 1) {
    const value = probabilities[offset + label];
    if (value > bestValue) {
      bestValue = value;
      bestLabel = label;
    }
  }
  return bestLabel;
}

function expectedCalibrationError(confidences, correctness, binCount) {
  if (confidences.length === 0) {
    return 0;
  }
  let ece = 0;
  for (let bin = 0; bin < binCount; bin += 1) {
    const low = bin / binCount;
    const high = (bin + 1) / binCount;
    let count = 0;
    let confidenceSum = 0;
    let accuracySum = 0;
    for (let i = 0; i < confidences.length; i += 1) {
      const value = confidences[i];
      const inBin = bin === binCount - 1 ? value >= low && value <= high : value >= low && value < high;
      if (inBin) {
        count += 1;
        confidenceSum += value;
        accuracySum += correctness[i];
      }
    }
    if (count > 0) {
      ece +=
        (count / confidences.length) *
        Math.abs(accuracySum / count - confidenceSum / count);
    }
  }
  return ece;
}

function fisherYates(values, rng) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temporary = copy[i];
    copy[i] = copy[j];
    copy[j] = temporary;
  }
  return copy;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function safeRatio(numerator, denominator) {
  return numerator / Math.max(denominator, 1e-12);
}

function integerOption(value, fallback, minimum) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum) {
    throw new TypeError("Expected an integer >= " + minimum + ", received " + resolved);
  }
  return resolved;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function hash32(...values) {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= Number(value) >>> 0;
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
