const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  truncateTitle,
  isDialogueHistoryRow,
  getHistoryVisibleDays,
  buildHistoryVisibleSince
} = require('./agentConversationQueryService');

describe('truncateTitle', () => {
  it('returns default for empty', () => assert.equal(truncateTitle(''), '新对话'));
  it('truncates long text', () => assert.ok(truncateTitle('a'.repeat(50), 40).endsWith('…')));
});

describe('isDialogueHistoryRow', () => {
  it('keeps user/assistant text dialogue', () => {
    assert.equal(isDialogueHistoryRow({ role: 'user', messageType: 'text' }), true);
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'text' }), true);
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'attachment' }), true);
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'system' }), true);
  });

  it('drops orchestrator and other pipeline assistant rows', () => {
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'orchestrator' }), false);
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'plan' }), false);
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'tool' }), false);
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'clarify' }), false);
    assert.equal(isDialogueHistoryRow({ role: 'assistant', messageType: 'error' }), false);
  });

  it('drops non user/assistant roles', () => {
    assert.equal(isDialogueHistoryRow({ role: 'tool', messageType: 'tool' }), false);
    assert.equal(isDialogueHistoryRow({ role: 'system', messageType: 'text' }), false);
  });
});

describe('attachments parsing', () => {
  it('keeps array attachments as-is', () => {
    const { parseAttachments } = require('./agentConversationQueryService');
    assert.deepEqual(parseAttachments([{ assetId: 'a1' }]), [{ assetId: 'a1' }]);
  });

  it('parses json string attachments', () => {
    const { parseAttachments } = require('./agentConversationQueryService');
    assert.deepEqual(parseAttachments('[{"assetId":"a1"}]'), [{ assetId: 'a1' }]);
  });

  it('returns empty array for invalid attachments', () => {
    const { parseAttachments } = require('./agentConversationQueryService');
    assert.deepEqual(parseAttachments('{bad json}'), []);
    assert.deepEqual(parseAttachments(null), []);
  });
});

describe('history visibility config', () => {
  it('uses 15 days by default', () => {
    const oldValue = process.env.AGENT_HISTORY_VISIBLE_DAYS;
    delete process.env.AGENT_HISTORY_VISIBLE_DAYS;
    assert.equal(getHistoryVisibleDays(), 15);
    if (oldValue === undefined) delete process.env.AGENT_HISTORY_VISIBLE_DAYS;
    else process.env.AGENT_HISTORY_VISIBLE_DAYS = oldValue;
  });

  it('builds visible since timestamp from configured days', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const visibleSince = buildHistoryVisibleSince(15, now);
    assert.equal(visibleSince.toISOString(), '2026-07-05T12:00:00.000Z');
  });
});
