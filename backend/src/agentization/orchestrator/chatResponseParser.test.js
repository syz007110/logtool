const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeChatCompletionResponse } = require('./chatResponseParser');

const sample = {
  id: 'x',
  object: 'chat.completion',
  created: 1,
  model: 'm',
  choices: [{
    index: 0,
    finish_reason: 'stop',
    message: {
      role: 'assistant',
      content: 'answer',
      reasoning_content: 'secret thoughts'
    }
  }],
  usage: {}
};

describe('normalizeChatCompletionResponse', () => {
  it('drops reasoning_content by default', () => {
    const out = normalizeChatCompletionResponse(sample);
    assert.equal(out.choices[0].message.content, 'answer');
    assert.equal(out.choices[0].message.reasoning_content, undefined);
  });

  it('keeps reasoning_content when capabilities say so', () => {
    const out = normalizeChatCompletionResponse(sample, {
      preserveReasoningContent: true
    });
    assert.equal(out.choices[0].message.reasoning_content, 'secret thoughts');
  });
});
