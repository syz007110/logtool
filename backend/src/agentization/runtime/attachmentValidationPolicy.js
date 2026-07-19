const {
  buildAttachmentShortCircuit,
  validateAttachmentCount,
  validateAttachmentCandidateDescriptor,
  validateResolvedAttachments
} = require('../../services/agentAttachmentPolicy');

function validatePreOrchestratorAttachmentCandidates(candidates, options = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  validateAttachmentCount(list.length, options);
  for (const candidate of list) {
    validateAttachmentCandidateDescriptor({
      filename: candidate?.name
    }, options);
  }
}

function evaluateAttachmentValidationPolicy(attachments, options = {}) {
  try {
    validateResolvedAttachments(attachments, options);
    return null;
  } catch (error) {
    const shortCircuit = buildAttachmentShortCircuit(error);
    if (shortCircuit) return shortCircuit;
    throw error;
  }
}

module.exports = {
  evaluateAttachmentValidationPolicy,
  validatePreOrchestratorAttachmentCandidates
};
