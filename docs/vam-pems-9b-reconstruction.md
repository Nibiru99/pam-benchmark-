# VAM–PEMS 9B clean-room reconstruction

## Scope

This benchmark is a new, public, dependency-free reconstruction of the scientific question in the historical VAM–PEMS Experiment 9B report:

> Can retained material evidence improve missing-region reconstruction under standard, hard, extreme, and corrupted synthetic conditions while a true oracle remains the upper bound?

It is not the missing historical implementation and does not claim numerical equivalence with the archived report.

## Deterministic protocol

- 40 locked seeds by default.
- Three occlusion levels: standard, hard, and extreme.
- Clean and corrupted-memory conditions.
- Eight history frames.
- A synthetic elliptical material region with three coordinate-dependent material classes.
- Candidate prediction code receives observations and retained votes, not test labels.
- The oracle is isolated as a separate one-hot upper bound.

## Compared modes

1. present-only material prior;
2. last observation carried forward;
3. exponentially decayed per-cell material memory;
4. contour/neighborhood-smoothed material memory;
5. spatially shuffled memory control;
6. exact one-hot oracle.

## Metrics

- missing-region accuracy;
- missing-region soft IoU;
- multiclass Brier score;
- expected calibration error;
- outside-region hallucination probability;
- separation ratios against present-only and shuffled controls.

The runner emits seed-level rows for every mode, severity, and corruption condition.

## Locked fixture result

The default 40-seed fixture supports the memory diagnosis:

~~~text
oracle missing accuracy                    1.000000
clean decayed-memory missing accuracy      0.987246
corrupt decayed-memory missing accuracy    0.800257
clean memory / present-only ratio          3.059199
clean memory / shuffled ratio              2.984608
corrupt memory / present-only ratio        2.479774
~~~

The contour candidate is intentionally not marked supported:

~~~text
clean contour minus decayed accuracy       +0.002104
corrupt contour minus decayed accuracy     +0.013458
decayed minus contour Brier improvement    -0.004825
decayed minus contour ECE improvement      -0.069706
~~~

Contour smoothing slightly improves classification accuracy but worsens probability quality. The contract therefore reports:

~~~text
diagnosis_supported = true
candidate_supported = false
~~~

This is a useful result. It reproduces the broad memory advantage under a new explicit protocol while rejecting the stronger claim that the contour-smoothed variant is currently better.

## Run

~~~bash
npm run benchmark:vam9b
npm run validate:vam9b:sample
~~~

Custom run:

~~~bash
node src/run-vam-pems-9b.mjs \
  --seeds 40 \
  --size 48 \
  --history-frames 8 \
  --out outputs/vam-pems-9b
~~~

## Claim boundary

This benchmark does not establish:

- equivalence to the archived historical experiment;
- real-image or camera performance;
- learned visual completion;
- privacy protection;
- cognitive or biological equivalence;
- superiority over external AI systems.

Its supported result is limited to deterministic synthetic missing-region reconstruction under the declared generator and controls.
