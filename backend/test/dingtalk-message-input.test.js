const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMessageInputFromDingtalkPayload
} = require('../src/agentization/adapters/dingtalk/buildMessageInputFromDingtalk');

test('dingtalk input maps to text+attachment when attachments exist', async () => {
  const request = await buildMessageInputFromDingtalkPayload({
    msgId: 'msg-1',
    senderStaffId: 'staff-1',
    conversationId: 'conv-1',
    msgtype: 'picture',
    text: { content: 'with image' },
    content: {
      pictureDownloadCode: 'download-code-1'
    }
  }, {
    traceId: 'trace-1',
    requestId: 'req-1',
    resolveAttachments: async () => ([{
      assetId: 'asset-picture-1',
      type: 'image',
      storage: 'local',
      objectKey: 'tmp/demo.png',
      mimeType: 'image/png',
      originalName: 'demo.png',
      storedName: 'demo.png',
      url: '/static/agent-assets/tmp/demo.png'
    }])
  });

  assert.equal(request.message.type, 'text+attachment');
  assert.equal(request.message.attachments.length, 1);
});

test('dingtalk input maps to text when attachments are absent regardless of msgtype', async () => {
  const request = await buildMessageInputFromDingtalkPayload({
    msgId: 'msg-2',
    senderStaffId: 'staff-2',
    conversationId: 'conv-2',
    msgtype: 'image',
    text: { content: 'plain text only' }
  }, {
    traceId: 'trace-2',
    requestId: 'req-2'
  });

  assert.equal(request.message.type, 'text');
  assert.equal(request.message.text, 'plain text only');
  assert.equal(request.message.attachments.length, 0);
});

test('dingtalk attachment resolver output is persisted as standardized attachments', async () => {
  const request = await buildMessageInputFromDingtalkPayload({
    msgId: 'msg-3',
    senderStaffId: 'staff-3',
    conversationId: 'conv-3',
    msgtype: 'file',
    content: {
      downloadCode: 'download-code-file-1',
      fileName: 'demo.txt'
    }
  }, {
    traceId: 'trace-3',
    requestId: 'req-3',
    resolveAttachments: async () => ([{
      assetId: 'asset-1',
      type: 'file',
      storage: 'oss',
      objectKey: 'agent-assets/tmp/demo.txt',
      mimeType: 'text/plain',
      originalName: 'demo.txt',
      storedName: 'demo.txt',
      url: 'https://example.com/demo.txt'
    }])
  });

  assert.equal(request.message.type, 'text+attachment');
  assert.equal(request.message.attachments.length, 1);
  assert.equal(request.message.attachments[0].assetId, 'asset-1');
  assert.equal(request.message.attachments[0].storage, 'oss');
});

test('audio message falls back to recognition text without downloading source file', async () => {
  const request = await buildMessageInputFromDingtalkPayload({
    msgId: 'msg-4',
    senderStaffId: 'staff-4',
    conversationId: 'conv-4',
    msgtype: 'audio',
    audio: {
      recognition: '识别后的语音文本'
    }
  }, {
    traceId: 'trace-4',
    requestId: 'req-4',
    resolveAttachments: async () => {
      throw new Error('should not be called');
    }
  });

  assert.equal(request.message.type, 'text');
  assert.equal(request.message.text, '识别后的语音文本');
  assert.equal(request.message.attachments.length, 0);
});

test('video message does not resolve or download attachments', async () => {
  const request = await buildMessageInputFromDingtalkPayload({
    msgId: 'msg-5',
    senderStaffId: 'staff-5',
    conversationId: 'conv-5',
    msgtype: 'video',
    content: {
      downloadCode: 'download-code-video-1',
      videoType: 'mp4'
    }
  }, {
    traceId: 'trace-5',
    requestId: 'req-5',
    resolveAttachments: async () => {
      throw new Error('should not be called');
    }
  });

  assert.equal(request.message.attachments.length, 0);
  assert.equal(request.message.type, 'text');
});
