function readPositiveInt(envValue, fallback) {
  const num = parseInt(envValue, 10);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

function defaultTurnPolicy() {
  return {
    maxSteps: 4,
    maxToolCalls: 2,
    timeoutBudgetMs: 12000,
    clarifyRoundLimit: 2
  };
}

function getRuntimeTimeouts() {
  return {
    prepareMs: readPositiveInt(process.env.SESSION_PREPARE_TIMEOUT_MS, 20000),
    stepMs: readPositiveInt(process.env.SESSION_STEP_TIMEOUT_MS, 25000)
  };
}

module.exports = {
  defaultTurnPolicy,
  getRuntimeTimeouts
};
