const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { truncateTitle } = require('./agentConversationQueryService');

describe('truncateTitle', () => {
  it('returns default for empty', () => assert.equal(truncateTitle(''), '新对话'));
  it('truncates long text', () => assert.ok(truncateTitle('a'.repeat(50), 40).endsWith('…')));
});
