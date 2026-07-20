const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildHistoryMessages } = require('./historyProjection');

describe('buildHistoryMessages', () => {
  it('excludes system message rows from history context', () => {
    const messages = buildHistoryMessages([
      {
        role: 'user',
        message_type: 'text',
        content: '你好'
      },
      {
        role: 'assistant',
        message_type: 'system',
        content: '当前请求不支持直接处理。'
      },
      {
        role: 'assistant',
        message_type: 'text',
        content: '这里是正常回复'
      }
    ], 5);

    assert.deepEqual(messages, [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '这里是正常回复' }
    ]);
  });
});
