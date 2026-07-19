const { evaluatePreOrchestratorShortCircuit } = require('./preOrchestratorShortCircuitPolicy');

module.exports = {
  evaluateDeterministicRequestPolicy: evaluatePreOrchestratorShortCircuit
};
