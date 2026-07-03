function readPositiveInt(envValue, fallback) {
  const num = parseInt(envValue, 10);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

function getLoopPolicy() {
  return {
    maxSteps: readPositiveInt(process.env.RUNTIME_MAX_STEPS, 4),
    maxToolCalls: readPositiveInt(process.env.RUNTIME_MAX_TOOL_CALLS, 3),
    timeoutBudgetMs: readPositiveInt(process.env.RUNTIME_TIMEOUT_BUDGET_MS, 12000),
    clarifyRoundLimit: readPositiveInt(process.env.RUNTIME_CLARIFY_ROUND_LIMIT, 2)
  };
}

function defaultTurnPolicy() {
  return getLoopPolicy();
}

function getRuntimeTimeouts() {
  return {
    prepareMs: readPositiveInt(process.env.SESSION_PREPARE_TIMEOUT_MS, 20000),
    stepMs: readPositiveInt(process.env.SESSION_STEP_TIMEOUT_MS, 25000)
  };
}

module.exports = {
  getLoopPolicy,
  defaultTurnPolicy,
  getRuntimeTimeouts
};
