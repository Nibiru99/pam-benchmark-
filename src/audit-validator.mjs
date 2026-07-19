const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);

export function evaluateAudit(metrics, contract) {
  const missingFields = contract.required_fields.filter((field) => !(field in metrics));
  const nonFiniteFields = contract.required_fields.filter((field) => {
    return field in metrics && typeof metrics[field] === "number" && !finiteNumber(metrics[field]);
  });
  const diagnosisChecks = contract.diagnosis_gates.map((gate) => evaluateGate(metrics, gate));
  const candidateChecks = contract.candidate_gates.map((gate) => evaluateGate(metrics, gate));
  const structurallyValid = missingFields.length === 0 && nonFiniteFields.length === 0;

  return {
    schema: "pam_benchmark_evaluation_v1",
    contract_id: contract.id,
    experiment: metrics.experiment ?? null,
    structurally_valid: structurallyValid,
    diagnosis_supported: structurallyValid && diagnosisChecks.every((check) => check.pass),
    candidate_supported: structurallyValid && candidateChecks.every((check) => check.pass),
    missing_fields: missingFields,
    non_finite_fields: nonFiniteFields,
    diagnosis_checks: diagnosisChecks,
    candidate_checks: candidateChecks
  };
}

function evaluateGate(metrics, gate) {
  const measured = metrics[gate.field];
  const finite = finiteNumber(measured);
  let pass = false;

  if (finite && gate.comparison === "minimum") {
    pass = measured >= gate.threshold;
  } else if (finite && gate.comparison === "strict_minimum") {
    pass = measured > gate.threshold;
  } else if (finite && gate.comparison === "maximum") {
    pass = measured <= gate.threshold;
  }

  return {
    id: gate.id,
    field: gate.field,
    measured: finite ? measured : null,
    comparison: gate.comparison,
    threshold: gate.threshold,
    pass
  };
}

