const OBJECT_COUNT = 3;
const MATERIALS_PER_OBJECT = 2;
const MATERIAL_CLASS_COUNT = OBJECT_COUNT * MATERIALS_PER_OBJECT;
const CLASS_COUNT = MATERIAL_CLASS_COUNT + 1;
const DEFAULT_SEVERITIES = [
  { id: "standard", missingFraction: 0.32 },
  { id: "hard", missingFraction: 0.52 },
  { id: "extreme", missingFraction: 0.7 }
];
const MODES = [
  "present_only",
  "global_scene_memory",
  "object_separated_memory",
  "object_contour_memory",
  "shuffled_object_memory_control",
  "oracle"
];

export function runVamPems10Reconstruction(options = {}) {
  const seedCount = integerOption(options.seedCount, 40, 1);
  const size = integerOption(options.size, 56, 36);
  const historyFrames = integerOption(options.historyFrames, 8, 4);
  const localGridSize = integerOption(options.localGridSize, 20, 12);
  const severities = options.severities ?? DEFAULT_SEVERITIES;
  const rows = [];

  for (let seed = 1; seed <= seedCount; seed += 1) {
    const specs = generateObjectSpecs(seed, size);
    const testScene = rasterizeScene(specs, historyFrames, size);

    for (let severityIndex = 0; severityIndex < severities.length; severityIndex += 1) {
      const severity = severities[severityIndex];
      const testMask = createObjectOcclusionMask(
        testScene,
        severity.missingFraction,
        hash32(seed, severityIndex, 7001)
      );
      const presentPriors = visibleObjectPriors(testScene, testMask);

      for (const condition of ["clean", "corrupt"]) {
        const memory = buildMemory(specs, {
          size,
          historyFrames,
          localGridSize,
          corruptionRate: condition === "clean" ? 0.05 : 0.3,
          crossObjectCorruptionRate: condition === "clean" ? 0.005 : 0.08,
          coordinateNoise: condition === "clean" ? 0.01 : 0.07,
          seed: hash32(seed, severityIndex, condition === "clean" ? 43 : 79)
        });
        const predictions = buildPredictions({
          scene: testScene,
          testMask,
          presentPriors,
          memory,
          localGridSize
        });

        for (const mode of MODES) {
          rows.push({
            seed,
            severity: severity.id,
            condition,
            mode,
            ...evaluatePrediction(testScene, testMask, predictions[mode])
          });
        }
      }
    }
  }

  const aggregates = aggregateRows(rows);
  const bestNonOracle = Math.max(
    aggregates.clean_object_contour_memory_missing_accuracy,
    aggregates.clean_object_separated_memory_missing_accuracy,
    aggregates.clean_global_scene_memory_missing_accuracy,
    aggregates.clean_present_only_missing_accuracy,
    aggregates.clean_shuffled_object_memory_control_missing_accuracy
  );

  const summary = {
    experiment: "vam-pems-10-reconstruction-v1",
    status: "reconstruction_candidate",
    historical_equivalence_claimed: false,
    supervised_object_masks_provided: true,
    object_tracking_scope: "synthetic_supervised",
    seed_count: seedCount,
    severity_count: severities.length,
    scenario_count: seedCount * severities.length * 2,
    object_count: OBJECT_COUNT,
    history_frames: historyFrames,
    grid_size: size,
    local_grid_size: localGridSize,
    split_overlap_count: 0,
    candidate_truth_label_access_count: 0,
    oracle_missing_accuracy: aggregates.clean_oracle_missing_accuracy,
    oracle_minus_best_non_oracle_missing_accuracy:
      aggregates.clean_oracle_missing_accuracy - bestNonOracle,
    ...aggregates,
    clean_object_over_present_missing_accuracy_ratio: safeRatio(
      aggregates.clean_object_separated_memory_missing_accuracy,
      aggregates.clean_present_only_missing_accuracy
    ),
    clean_object_over_global_missing_accuracy_ratio: safeRatio(
      aggregates.clean_object_separated_memory_missing_accuracy,
      aggregates.clean_global_scene_memory_missing_accuracy
    ),
    clean_object_over_shuffled_missing_accuracy_ratio: safeRatio(
      aggregates.clean_object_separated_memory_missing_accuracy,
      aggregates.clean_shuffled_object_memory_control_missing_accuracy
    ),
    clean_object_minus_shuffled_missing_accuracy:
      aggregates.clean_object_separated_memory_missing_accuracy -
      aggregates.clean_shuffled_object_memory_control_missing_accuracy,
    corrupt_object_over_present_missing_accuracy_ratio: safeRatio(
      aggregates.corrupt_object_separated_memory_missing_accuracy,
      aggregates.corrupt_present_only_missing_accuracy
    ),
    clean_contour_minus_object_missing_accuracy:
      aggregates.clean_object_contour_memory_missing_accuracy -
      aggregates.clean_object_separated_memory_missing_accuracy,
    clean_object_minus_contour_brier:
      aggregates.clean_object_separated_memory_missing_brier -
      aggregates.clean_object_contour_memory_missing_brier,
    clean_object_minus_contour_ece:
      aggregates.clean_object_separated_memory_missing_ece -
      aggregates.clean_object_contour_memory_missing_ece
  };

  return { summary, rows };
}

function generateObjectSpecs(seed, size) {
  const rng = mulberry32(hash32(seed, size, 311));
  const anchors = [
    [0.3, 0.32],
    [0.7, 0.34],
    [0.5, 0.7]
  ];

  return anchors.map(([anchorX, anchorY], index) => ({
    id: index + 1,
    baseX: size * (anchorX + (rng() - 0.5) * 0.025),
    baseY: size * (anchorY + (rng() - 0.5) * 0.025),
    radiusX: size * (0.135 + rng() * 0.015),
    radiusY: size * (0.105 + rng() * 0.015),
    baseTheta: (rng() - 0.5) * 0.8,
    motionPhase: rng() * Math.PI * 2,
    motionX: size * (0.035 + rng() * 0.012),
    motionY: size * (0.025 + rng() * 0.01),
    materialPhase: rng() * Math.PI * 2
  }));
}

function rasterizeScene(specs, frame, size) {
  const truth = new Uint8Array(size * size);
  const objectIds = new Uint8Array(size * size);
  const localU = new Float64Array(size * size);
  const localV = new Float64Array(size * size);
  const transforms = new Map();

  for (const spec of specs) {
    const transform = objectTransform(spec, frame);
    transforms.set(spec.id, transform);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        if (objectIds[index] !== 0) {
          continue;
        }
        const coordinates = localCoordinates(x + 0.5, y + 0.5, transform);
        if (coordinates.u * coordinates.u + coordinates.v * coordinates.v > 1) {
          continue;
        }

        objectIds[index] = spec.id;
        localU[index] = coordinates.u;
        localV[index] = coordinates.v;
        const pair = objectMaterialPair(spec.id);
        const wave =
          coordinates.u * 5 +
          0.85 * Math.sin(coordinates.v * 5 + spec.materialPhase) +
          0.35 * Math.cos((coordinates.u - coordinates.v) * 4);
        truth[index] = pair[positiveModulo(Math.floor(wave + 6), MATERIALS_PER_OBJECT)];
      }
    }
  }

  return { size, truth, objectIds, localU, localV, transforms };
}

function objectTransform(spec, frame) {
  const phase = spec.motionPhase + frame * 0.57;
  const centerX = spec.baseX + spec.motionX * Math.sin(phase);
  const centerY = spec.baseY + spec.motionY * Math.cos(phase * 0.83);
  const theta = spec.baseTheta + 0.22 * Math.sin(phase * 0.71);
  return {
    centerX,
    centerY,
    radiusX: spec.radiusX,
    radiusY: spec.radiusY,
    theta,
    cosTheta: Math.cos(theta),
    sinTheta: Math.sin(theta)
  };
}

function localCoordinates(x, y, transform) {
  const dx = x - transform.centerX;
  const dy = y - transform.centerY;
  return {
    u: (dx * transform.cosTheta + dy * transform.sinTheta) / transform.radiusX,
    v: (-dx * transform.sinTheta + dy * transform.cosTheta) / transform.radiusY
  };
}

function createObjectOcclusionMask(scene, missingFraction, seed) {
  const mask = new Uint8Array(scene.truth.length);
  const rng = mulberry32(seed);

  for (let objectId = 1; objectId <= OBJECT_COUNT; objectId += 1) {
    const angle = rng() * Math.PI * 2;
    const phase = rng() * Math.PI * 2;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const scored = [];

    for (let index = 0; index < scene.truth.length; index += 1) {
      if (scene.objectIds[index] !== objectId) {
        continue;
      }
      const u = scene.localU[index];
      const v = scene.localV[index];
      scored.push({
        index,
        score:
          u * cosAngle +
          v * sinAngle +
          0.24 * Math.sin(4 * u - 3 * v + phase) +
          rng() * 0.02
      });
    }

    scored.sort((left, right) => right.score - left.score);
    const count = Math.max(1, Math.round(scored.length * missingFraction));
    for (let i = 0; i < count; i += 1) {
      mask[scored[i].index] = 1;
    }
  }

  return mask;
}

function visibleObjectPriors(scene, testMask) {
  const counts = Array.from({ length: OBJECT_COUNT + 1 }, () => new Float64Array(CLASS_COUNT));
  for (let index = 0; index < scene.truth.length; index += 1) {
    const objectId = scene.objectIds[index];
    if (objectId > 0 && !testMask[index]) {
      counts[objectId][scene.truth[index]] += 1;
    }
  }
  return counts.map((entry, objectId) => {
    return objectId === 0 ? new Float64Array(CLASS_COUNT) : normalizeObjectCounts(entry, objectId);
  });
}

function buildMemory(specs, options) {
  const globalVotes = new Float64Array(options.size * options.size * CLASS_COUNT);
  const localCellCount = options.localGridSize * options.localGridSize;
  const objectVotes = new Float64Array((OBJECT_COUNT + 1) * localCellCount * CLASS_COUNT);
  const globalCounts = new Float64Array(CLASS_COUNT);
  const objectCounts = Array.from(
    { length: OBJECT_COUNT + 1 },
    () => new Float64Array(CLASS_COUNT)
  );
  const rng = mulberry32(options.seed);

  for (let frame = 0; frame < options.historyFrames; frame += 1) {
    const scene = rasterizeScene(specs, frame, options.size);
    const mask = createObjectOcclusionMask(
      scene,
      0.3 + 0.2 * rng(),
      hash32(options.seed, frame, 503)
    );
    const weight = Math.pow(0.87, options.historyFrames - frame - 1);

    for (let index = 0; index < scene.truth.length; index += 1) {
      const objectId = scene.objectIds[index];
      if (objectId === 0 || mask[index]) {
        continue;
      }

      let label = scene.truth[index];
      if (rng() < options.crossObjectCorruptionRate) {
        const wrongObject = 1 + positiveModulo(objectId, OBJECT_COUNT);
        const pair = objectMaterialPair(wrongObject);
        label = pair[Math.floor(rng() * pair.length)];
      } else if (rng() < options.corruptionRate) {
        const pair = objectMaterialPair(objectId);
        label = pair[0] === label ? pair[1] : pair[0];
      }

      const noisyU = scene.localU[index] + (rng() - 0.5) * options.coordinateNoise;
      const noisyV = scene.localV[index] + (rng() - 0.5) * options.coordinateNoise;
      const localIndex = localCellIndex(noisyU, noisyV, options.localGridSize);
      globalVotes[index * CLASS_COUNT + label] += weight;
      globalCounts[label] += weight;
      objectCounts[objectId][label] += weight;
      if (localIndex >= 0) {
        objectVotes[
          objectVoteOffset(objectId, localIndex, localCellCount) + label
        ] += weight;
      }
    }
  }

  return {
    globalVotes,
    objectVotes,
    globalPrior: normalizeAllMaterialCounts(globalCounts),
    objectPriors: objectCounts.map((counts, objectId) => {
      return objectId === 0
        ? new Float64Array(CLASS_COUNT)
        : normalizeObjectCounts(counts, objectId, true);
    })
  };
}

function buildPredictions({ scene, testMask, presentPriors, memory, localGridSize }) {
  const outputs = Object.fromEntries(MODES.map((mode) => [mode, basePrediction(scene)]));
  const localCellCount = localGridSize * localGridSize;
  const slotMap = [0, 2, 3, 1];

  for (let index = 0; index < scene.truth.length; index += 1) {
    const objectId = scene.objectIds[index];
    if (objectId === 0) {
      for (const mode of MODES) {
        setOneHot(outputs[mode], index, 0);
      }
      continue;
    }

    if (!testMask[index]) {
      for (const mode of MODES) {
        setOneHot(outputs[mode], index, scene.truth[index]);
      }
      continue;
    }

    setDistribution(outputs.present_only, index, presentPriors[objectId]);
    setDistribution(
      outputs.global_scene_memory,
      index,
      globalMemoryDistribution(memory.globalVotes, index, memory.globalPrior)
    );

    const localIndex = localCellIndex(scene.localU[index], scene.localV[index], localGridSize);
    const objectDistribution = objectMemoryDistribution(
      memory,
      objectId,
      localIndex,
      localCellCount
    );
    setDistribution(outputs.object_separated_memory, index, objectDistribution);

    const contourDistribution = objectNeighborhoodDistribution(
      memory,
      objectId,
      localIndex,
      localGridSize
    );
    setDistribution(
      outputs.object_contour_memory,
      index,
      blendDistributions(objectDistribution, contourDistribution, 0.82)
    );

    const shuffledObject = slotMap[objectId];
    setDistribution(
      outputs.shuffled_object_memory_control,
      index,
      objectMemoryDistribution(memory, shuffledObject, localIndex, localCellCount)
    );
    setOneHot(outputs.oracle, index, scene.truth[index]);
  }

  return outputs;
}

function evaluatePrediction(scene, testMask, probabilities) {
  const perObjectCorrect = new Float64Array(OBJECT_COUNT + 1);
  const perObjectCount = new Float64Array(OBJECT_COUNT + 1);
  const confidences = [];
  const correctness = [];
  let correct = 0;
  let missingCount = 0;
  let brier = 0;
  let crossObjectLeakage = 0;
  let outsideProbability = 0;
  let outsideCount = 0;

  for (let index = 0; index < scene.truth.length; index += 1) {
    const objectId = scene.objectIds[index];
    if (objectId === 0) {
      outsideProbability += 1 - probabilities[index * CLASS_COUNT];
      outsideCount += 1;
      continue;
    }
    if (!testMask[index]) {
      continue;
    }

    missingCount += 1;
    perObjectCount[objectId] += 1;
    const truth = scene.truth[index];
    const predicted = argMax(probabilities, index);
    const confidence = probabilities[index * CLASS_COUNT + predicted];
    const isCorrect = predicted === truth ? 1 : 0;
    correct += isCorrect;
    perObjectCorrect[objectId] += isCorrect;
    confidences.push(confidence);
    correctness.push(isCorrect);

    const allowed = new Set(objectMaterialPair(objectId));
    for (let label = 1; label < CLASS_COUNT; label += 1) {
      const probability = probabilities[index * CLASS_COUNT + label];
      const target = truth === label ? 1 : 0;
      const error = probability - target;
      brier += error * error;
      if (!allowed.has(label)) {
        crossObjectLeakage += probability;
      }
    }
  }

  const objectAccuracies = [];
  for (let objectId = 1; objectId <= OBJECT_COUNT; objectId += 1) {
    objectAccuracies.push(safeRatio(perObjectCorrect[objectId], perObjectCount[objectId]));
  }

  return {
    missing_count: missingCount,
    missing_accuracy: safeRatio(correct, missingCount),
    macro_object_accuracy: mean(objectAccuracies),
    worst_object_accuracy: Math.min(...objectAccuracies),
    missing_brier: safeRatio(brier, missingCount * MATERIAL_CLASS_COUNT),
    missing_ece: expectedCalibrationError(confidences, correctness, 10),
    cross_object_leakage_rate: safeRatio(crossObjectLeakage, missingCount),
    outside_hallucination_rate: safeRatio(outsideProbability, outsideCount)
  };
}

function aggregateRows(rows) {
  const result = {};
  for (const condition of ["clean", "corrupt"]) {
    for (const mode of MODES) {
      const selected = rows.filter((row) => row.condition === condition && row.mode === mode);
      const prefix = condition + "_" + mode;
      for (const metric of [
        "missing_accuracy",
        "macro_object_accuracy",
        "worst_object_accuracy",
        "missing_brier",
        "missing_ece",
        "cross_object_leakage_rate",
        "outside_hallucination_rate"
      ]) {
        result[prefix + "_" + metric] = mean(selected.map((row) => row[metric]));
      }
    }
  }
  return result;
}

function globalMemoryDistribution(votes, index, fallback) {
  const counts = new Float64Array(CLASS_COUNT);
  let total = 0;
  for (let label = 1; label < CLASS_COUNT; label += 1) {
    const value = votes[index * CLASS_COUNT + label];
    counts[label] = value;
    total += value;
  }
  return total > 1e-9 ? normalizeAllMaterialCounts(counts, 0.02) : fallback;
}

function objectMemoryDistribution(memory, objectId, localIndex, localCellCount) {
  if (localIndex < 0) {
    return memory.objectPriors[objectId];
  }
  const counts = new Float64Array(CLASS_COUNT);
  const offset = objectVoteOffset(objectId, localIndex, localCellCount);
  let total = 0;
  for (let label = 1; label < CLASS_COUNT; label += 1) {
    counts[label] = memory.objectVotes[offset + label];
    total += counts[label];
  }
  return total > 1e-9
    ? normalizeAllMaterialCounts(counts, 0.01)
    : memory.objectPriors[objectId];
}

function objectNeighborhoodDistribution(memory, objectId, localIndex, gridSize) {
  if (localIndex < 0) {
    return memory.objectPriors[objectId];
  }
  const x = localIndex % gridSize;
  const y = Math.floor(localIndex / gridSize);
  const counts = new Float64Array(CLASS_COUNT);
  const localCellCount = gridSize * gridSize;

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) {
        continue;
      }
      const neighbor = ny * gridSize + nx;
      const offset = objectVoteOffset(objectId, neighbor, localCellCount);
      const weight = 1 / (1 + Math.sqrt(dx * dx + dy * dy));
      for (let label = 1; label < CLASS_COUNT; label += 1) {
        counts[label] += memory.objectVotes[offset + label] * weight;
      }
    }
  }

  const total = counts.reduce((sum, value) => sum + value, 0);
  return total > 1e-9
    ? normalizeAllMaterialCounts(counts, 0.01)
    : memory.objectPriors[objectId];
}

function objectVoteOffset(objectId, localIndex, localCellCount) {
  return (objectId * localCellCount + localIndex) * CLASS_COUNT;
}

function localCellIndex(u, v, gridSize) {
  if (u < -1 || u > 1 || v < -1 || v > 1) {
    return -1;
  }
  const x = clamp(Math.floor(((u + 1) / 2) * gridSize), 0, gridSize - 1);
  const y = clamp(Math.floor(((v + 1) / 2) * gridSize), 0, gridSize - 1);
  return y * gridSize + x;
}

function objectMaterialPair(objectId) {
  const first = (objectId - 1) * MATERIALS_PER_OBJECT + 1;
  return [first, first + 1];
}

function normalizeObjectCounts(counts, objectId, preserveLeakage = false) {
  if (preserveLeakage) {
    return normalizeAllMaterialCounts(counts, 0.01);
  }
  const pair = objectMaterialPair(objectId);
  const output = new Float64Array(CLASS_COUNT);
  let total = 0;
  for (const label of pair) {
    output[label] = counts[label] + 0.5;
    total += output[label];
  }
  for (const label of pair) {
    output[label] /= total;
  }
  return output;
}

function normalizeAllMaterialCounts(counts, pseudocount = 0.05) {
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

function basePrediction(scene) {
  return new Float64Array(scene.truth.length * CLASS_COUNT);
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
    if (probabilities[offset + label] > bestValue) {
      bestValue = probabilities[offset + label];
      bestLabel = label;
    }
  }
  return bestLabel;
}

function blendDistributions(first, second, firstWeight) {
  const output = new Float64Array(CLASS_COUNT);
  for (let label = 0; label < CLASS_COUNT; label += 1) {
    output[label] = first[label] * firstWeight + second[label] * (1 - firstWeight);
  }
  return output;
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
      const inBin =
        bin === binCount - 1
          ? value >= low && value <= high
          : value >= low && value < high;
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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
