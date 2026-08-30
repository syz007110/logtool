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

  it('uses resolved local user id for dingtalk messages', async () => {
    const request = await buildMessageInputFromDingtalkPayload({
      msgtype: 'text',
      conversationId: 'cid_456',
      msgId: 'mid_456',
      senderId: 'dt_user_1',
      senderNick: '张三',
      text: { content: '你好' }
    }, {
      resolveDingtalkUser: async () => ({
        user: {
          id: 88,
          username: 'dd_dt_user_1',
          dingtalk_nick: '张三'
        }
      })
    });

    assert.equal(request.user.id, '88');
    assert.equal(request.user.platformUserId, 'dt_user_1');
    assert.equal(request.user.name, '张三');
  });

  it('falls back to raw sender when dingtalk user resolver fails', async () => {
    const request = await buildMessageInputFromDingtalkPayload({
      msgtype: 'text',
      conversationId: 'cid_789',
      msgId: 'mid_789',
      senderId: 'dt_user_2',
      senderNick: '李四',
      text: { content: 'hello' }
    }, {
      resolveDingtalkUser: async () => {
        throw new Error('resolver failed');
      }
    });

    assert.equal(request.user.id, 'dt_user_2');
    assert.equal(request.user.name, '李四');
  });
});
