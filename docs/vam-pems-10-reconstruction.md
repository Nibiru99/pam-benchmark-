# VAM–PEMS 10 clean-room reconstruction

## Scope

This benchmark is a new public reconstruction of the multi-region/object-separation question in the historical VAM–PEMS Experiment 10 report.

It does not reproduce or claim equivalence to the missing historical implementation.

The tested question is:

> Does supervised object-local memory improve missing-material reconstruction over present-only evidence, global-coordinate memory, and shuffled-object controls in a moving three-object synthetic scene?

The object masks and track identities are supplied by the synthetic harness. This is not autonomous segmentation or object discovery.

## Deterministic protocol

- 40 locked seeds.
- Three moving elliptical objects.
- Two object-specific material labels per object.
- Eight occluded history frames.
- Standard, hard, and extreme target occlusion.
- Clean and corrupted-memory conditions.
- Object motion and rotation between memory and target frames.
- Supervised object-local coordinates.
- Isolated one-hot oracle.

## Compared modes

1. present-only object-specific material prior;
2. global-coordinate scene memory;
3. object-separated local-coordinate memory;
4. object-local memory with neighborhood/contour smoothing;
5. shuffled-object memory control;
6. exact oracle.

## Metrics

- missing-region material accuracy;
- macro and worst-object accuracy;
- multiclass Brier score;
- expected calibration error;
- cross-object material leakage;
- outside-scene hallucination probability;
- separation from present-only, global, and shuffled controls.

## Locked fixture result

Clean object-local memory is strongly separated:

~~~text
present-only missing accuracy             0.498004
global-coordinate memory accuracy         0.480945
object-local memory accuracy              0.781789
object-local worst-object accuracy        0.736591
object-local / present-only ratio         1.569844
object-local / global-memory ratio        1.625526
clean cross-object leakage                0.034016
oracle accuracy                           1.000000
~~~

The corrupted-memory gate remains open:

~~~text
corrupt object-local accuracy             0.600382
required corrupt accuracy                 0.650000
corrupt object-local / present ratio      1.205576
~~~

The contour-smoothed branch trades a negligible accuracy loss for better probability quality:

~~~text
contour minus object-local accuracy      -0.000528
object-local minus contour Brier         +0.002359
object-local minus contour ECE           +0.039526
~~~

Positive Brier/ECE differences mean the contour branch has lower error.

The fixed contract therefore reports:

~~~text
structurally_valid = true
diagnosis_supported = true
candidate_supported = false
~~~

The clean supervised object-local mechanism is promising, but the full candidate is not supported because it misses the preregistered corrupted-memory accuracy floor.

## Run

~~~bash
npm run benchmark:vam10
npm run validate:vam10:sample
~~~

Custom run:

~~~bash
node src/run-vam-pems-10.mjs \
  --seeds 40 \
  --size 56 \
  --history-frames 8 \
  --local-grid-size 20 \
  --out outputs/vam-pems-10
~~~

## Claim boundary

This benchmark does not establish:

- equivalence to the archived Experiment 10 implementation;
- autonomous object detection or tracking;
- real-image or camera performance;
- privacy protection;
- general scene understanding;
- cognition, consciousness, or biological equivalence.

Its clean result is limited to supervised object-local reconstruction under the declared synthetic motion, occlusion, and label protocol. Robust operation under the declared corruption remains unconfirmed.
