const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMessageInputFromDingtalkPayload
} = require('./buildMessageInputFromDingtalk');

describe('buildMessageInputFromDingtalkPayload', () => {
  it('maps dingtalk audio content.recognition into message.text without attachments', async () => {
    const request = await buildMessageInputFromDingtalkPayload({
      msgtype: 'audio',
      conversationId: 'cid_123',
      msgId: 'mid_123',
      senderId: 'user_1',
      content: {
        duration: 4000,
        downloadCode: 'download_code_1',
        recognition: '钉钉，让进步发生'
      }
    });

    assert.equal(request.message.type, 'text');
    assert.equal(request.message.text, '钉钉，让进步发生');
    assert.deepEqual(request.message.attachments, []);
  });
});
