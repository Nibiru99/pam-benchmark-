# PAM Benchmark

Public, implementation-independent validation contracts for PAM/PAC/PEMS audit
artifacts.

This repository does not contain the private cognition architecture. It accepts
exported metric summaries and checks whether their declared corruption controls
clear fixed evidence gates.

## Current Contract

`pac5r-lineage-address-v1` checks:

- source-lineage uniqueness
- finite-window address reconstruction
- direct identity-shuffle separation
- direct spatial-permutation separation
- identity-shuffle support-mask preservation
- voxel identity and spatial corruption separation

The required corruption ratio is fixed at `1.35`.

## Run

```bash
npm test
npm run validate:sample
node src/validate-audit.mjs path/to/metrics_summary.json
```

The included PAC 5R fixture demonstrates a supported bottleneck diagnosis and an
experimental candidate voxel contract. This distinction is intentional: a valid
audit artifact does not imply that the candidate architecture passed.

## VAM–PEMS 9B clean-room reconstruction

`vam-pems-9b-reconstruction-v1` turns the historical missing-region question into a new deterministic public benchmark. It does **not** claim to be the missing historical implementation or reproduce its exact values.

The locked 40-seed fixture includes standard, hard, and extreme occlusions under clean and corrupted memory. It compares present-only, last-observation, decayed memory, contour-smoothed memory, shuffled memory, and an isolated one-hot oracle.

The current result intentionally distinguishes two conclusions:

- `diagnosis_supported = true`: decayed memory separates present-only and shuffled controls while the oracle remains the strict upper bound.
- `candidate_supported = false`: contour smoothing slightly improves accuracy but worsens Brier score and calibration.

Run:

```bash
npm run benchmark:vam9b
npm run validate:vam9b:sample
```

Protocol and claim boundaries: [docs/vam-pems-9b-reconstruction.md](docs/vam-pems-9b-reconstruction.md).

## Scope Boundary

- Synthetic data and exported measurements only.
- No camera, microphone, speech, compass, external model, API, or network input.
- No private vault inventory or private implementation source.
- No claims beyond the measurements represented in an audit artifact.

