const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validatePreOrchestratorAttachmentCandidates
} = require('./attachmentValidationPolicy');

describe('validatePreOrchestratorAttachmentCandidates', () => {
  it('allows known whitelisted attachment names', () => {
    assert.doesNotThrow(() => {
      validatePreOrchestratorAttachmentCandidates([
        { name: 'log.medbot' },
        { name: 'bundle.7z' },
        { name: 'capture.png' }
      ], { language: 'zh' });
    });
  });

  it('rejects unsupported extension before attachment download', () => {
    assert.throws(
      () => validatePreOrchestratorAttachmentCandidates([
        { name: 'report.docx' }
      ], { language: 'zh' }),
      (error) => error && error.code === 'UNSUPPORTED_FILE_EXTENSION'
    );
  });

  it('skips extension rejection when candidate filename is absent', () => {
    assert.doesNotThrow(() => {
      validatePreOrchestratorAttachmentCandidates([
        { downloadCode: 'abc123' }
      ], { language: 'zh' });
    });
  });
});
