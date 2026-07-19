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

## Scope Boundary

- Synthetic data and exported measurements only.
- No camera, microphone, speech, compass, external model, API, or network input.
- No private vault inventory or private implementation source.
- No claims beyond the measurements represented in an audit artifact.

