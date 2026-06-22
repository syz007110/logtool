const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDingtalkStreamBridge,
  resolveClientConstructor
} = require('../src/agentization/adapters/dingtalk/streamClient');

test('resolveClientConstructor picks DWClient export', () => {
  class FakeClient {}
  const ctor = resolveClientConstructor({ DWClient: FakeClient });
  assert.equal(ctor, FakeClient);
});

test('stream bridge does not start when credentials are missing', async () => {
  const logs = [];
  const bridge = createDingtalkStreamBridge({
    env: {},
    logger: {
      info: (msg) => logs.push(['info', msg]),
      warn: (msg) => logs.push(['warn', msg]),
      error: (msg) => logs.push(['error', msg])
    },
    orchestrator: { execute: async () => ({ mode: 'completed', result: { text: 'ok' } }) },
    clientFactory: () => {
      throw new Error('should not create client');
    }
  });

  const result = await bridge.start();
  assert.equal(result.started, false);
  assert.match(logs.map((x) => x[1]).join('\n'), /skip|credential/i);
});

test('stream bridge handles bot message and replies through session webhook', async () => {
  let callback;
  const postCalls = [];
  const executed = [];
  const fakeClient = {
    registerCallbackListener: (topic, cb) => {
      assert.equal(topic, '/v1.0/im/bot/messages/get');
      callback = cb;
      return fakeClient;
    },
    connect: async () => {},
    getAccessToken: async () => 'token-1',
    socketCallBackResponse: (messageId, payload) => {
      postCalls.push({ ack: true, messageId, payload });
    }
  };

  const bridge = createDingtalkStreamBridge({
    env: {
      DINGTALK_STREAM_CLIENT_ID: 'cid',
      DINGTALK_STREAM_CLIENT_SECRET: 'csecret'
    },
    logger: console,
    orchestrator: {
      execute: async (request) => {
        executed.push(request);
        return { mode: 'completed', result: { text: 'bridge ok' } };
      }
    },
    clientFactory: () => fakeClient,
    postJson: async (url, body, headers) => {
      postCalls.push({ url, body, headers });
      return { ok: true };
    }
  });

  const started = await bridge.start();
  assert.equal(started.started, true);
  assert.equal(typeof callback, 'function');

  await callback({
    headers: { messageId: 'm1' },
    data: JSON.stringify({
      senderStaffId: 'u1',
      senderNick: 'Alice',
      text: { content: 'hello stream' },
      sessionWebhook: 'https://example.com/hook',
      conversationId: 'conv-1',
      robotCode: 'robot-1'
    })
  });

  assert.equal(executed.length, 1);
  assert.equal(executed[0].channel.type, 'dingtalk');
  assert.equal(executed[0].requestId, 'm1');
  assert.equal(executed[0].message.type, 'text');
  assert.equal(executed[0].message.externalMessageId, 'm1');
  assert.equal(executed[0].message.text, 'hello stream');
  assert.equal(executed[0].text, undefined);
  assert.equal(executed[0].context?.raw, undefined);

  const post = postCalls.find((x) => x.url === 'https://example.com/hook');
  assert.ok(post);
  assert.equal(post.body.msgtype, 'text');
  assert.equal(post.body.text.content, 'bridge ok');
  assert.equal(post.headers['x-acs-dingtalk-access-token'], 'token-1');

  const ack = postCalls.find((x) => x.ack);
  assert.ok(ack);
  assert.equal(ack.messageId, 'm1');
});

test('stream bridge does not print payload sample when debug disabled', async () => {
  const infoLogs = [];
  let callback;
  const fakeClient = {
    registerCallbackListener: (_, cb) => {
      callback = cb;
      return fakeClient;
    },
    connect: async () => {},
    getAccessToken: async () => '',
    socketCallBackResponse: () => {}
  };

  const bridge = createDingtalkStreamBridge({
    env: {
      DINGTALK_STREAM_CLIENT_ID: 'cid',
      DINGTALK_STREAM_CLIENT_SECRET: 'csecret'
    },
    logger: {
      info: (...args) => infoLogs.push(args),
      warn: () => {},
      error: () => {}
    },
    orchestrator: {
      execute: async () => ({ mode: 'completed', result: { text: 'ok' } })
    },
    clientFactory: () => fakeClient,
    postJson: async () => ({ ok: true }),
    random: () => 0
  });

  await bridge.start();
  await callback({
    headers: { messageId: 'm2' },
    data: JSON.stringify({
      senderStaffId: 'staff-2',
      text: { content: 'hello2' },
      sessionWebhook: 'https://example.com/hook?a=1'
    })
  });

  const hasPayloadSampleLog = infoLogs.some((x) => String(x[0]).includes('payload_sample'));
  assert.equal(hasPayloadSampleLog, false);
});

test('stream bridge prints payload sample when debug enabled', async () => {
  const infoLogs = [];
  let callback;
  const fakeClient = {
    registerCallbackListener: (_, cb) => {
      callback = cb;
      return fakeClient;
    },
    connect: async () => {},
    getAccessToken: async () => '',
    socketCallBackResponse: () => {}
  };

  const bridge = createDingtalkStreamBridge({
    env: {
      DINGTALK_STREAM_CLIENT_ID: 'cid',
      DINGTALK_STREAM_CLIENT_SECRET: 'csecret',
      DINGTALK_STREAM_DEBUG_PAYLOAD: 'true',
      DINGTALK_STREAM_PAYLOAD_SAMPLE_RATE: '1'
    },
    logger: {
      info: (...args) => infoLogs.push(args),
      warn: () => {},
      error: () => {}
    },
    orchestrator: {
      execute: async () => ({ mode: 'completed', result: { text: 'ok' } })
    },
    clientFactory: () => fakeClient,
    postJson: async () => ({ ok: true }),
    random: () => 0
  });

  await bridge.start();
  await callback({
    headers: { messageId: 'm3' },
    data: JSON.stringify({
      senderStaffId: 'staff-3',
      text: { content: 'hello3' },
      sessionWebhook: 'https://example.com/hook?token=secret',
      conversationId: 'cid-123456'
    })
  });

  const sampleLog = infoLogs.find((x) => String(x[0]).includes('payload_sample'));
  assert.ok(sampleLog);
  const payload = sampleLog[1];
  assert.equal(payload.raw.sessionWebhook, 'https://example.com/hook');
  assert.match(payload.raw.senderStaffId, /\*\*\*/);
  assert.match(payload.raw.conversationId, /\*\*\*/);
});

test('stream bridge emits unified agent-request log when AGENT_REQUEST_LOG is enabled', async () => {
  const infoLogs = [];
  let callback;
  const fakeClient = {
    registerCallbackListener: (_, cb) => {
      callback = cb;
      return fakeClient;
    },
    connect: async () => {},
    getAccessToken: async () => '',
    socketCallBackResponse: () => {}
  };

  const bridge = createDingtalkStreamBridge({
    env: {
      DINGTALK_STREAM_CLIENT_ID: 'cid',
      DINGTALK_STREAM_CLIENT_SECRET: 'csecret',
      AGENT_REQUEST_LOG: 'true',
      AGENT_REQUEST_LOG_SAMPLE_RATE: '1'
    },
    logger: {
      info: (...args) => infoLogs.push(args),
      warn: () => {},
      error: () => {}
    },
    orchestrator: {
      execute: async () => ({ mode: 'completed', result: { text: 'ok' } })
    },
    clientFactory: () => fakeClient,
    postJson: async () => ({ ok: true }),
    random: () => 0
  });

  await bridge.start();
  await callback({
    headers: { messageId: 'm4' },
    data: JSON.stringify({
      senderStaffId: 'staff-4',
      senderNick: 'Bob',
      text: { content: 'hello4' },
      sessionWebhook: 'https://example.com/hook?token=secret'
    })
  });

  const unifiedLog = infoLogs.find((x) => String(x[0]).includes('[agent-request] normalized'));
  assert.ok(unifiedLog);
  assert.equal(unifiedLog[1].source, 'dingtalk-stream');
  assert.equal(unifiedLog[1].request.message.type, 'text');
  assert.equal(unifiedLog[1].request.message.text, 'hello4');
  assert.ok(Array.isArray(unifiedLog[1].request.message.attachments));
  assert.equal(unifiedLog[1].request.message.attachmentsCount, undefined);
});

test('stream bridge sends markdown attachment replies when response contains attachments', async () => {
  let callback;
  const postCalls = [];
  const fakeClient = {
    registerCallbackListener: (_, cb) => {
      callback = cb;
      return fakeClient;
    },
    connect: async () => {},
    getAccessToken: async () => 'token-x',
    socketCallBackResponse: () => {}
  };

  const bridge = createDingtalkStreamBridge({
    env: {
      DINGTALK_STREAM_CLIENT_ID: 'cid',
      DINGTALK_STREAM_CLIENT_SECRET: 'csecret'
    },
    logger: console,
    orchestrator: {
      execute: async () => ({
        mode: 'completed',
        result: {
          text: 'with attachments',
          attachments: [
            { type: 'image', url: 'https://files.example.com/a.png', name: 'a.png' },
            { type: 'file', url: 'https://files.example.com/b.txt', name: 'b.txt' }
          ]
        }
      })
    },
    clientFactory: () => fakeClient,
    postJson: async (url, body, headers) => {
      postCalls.push({ url, body, headers });
      return { ok: true };
    }
  });

  await bridge.start();
  await callback({
    headers: { messageId: 'm5' },
    data: JSON.stringify({
      senderStaffId: 'staff-5',
      text: { content: 'hi' },
      sessionWebhook: 'https://example.com/hook',
      conversationId: 'conv-5',
      robotCode: 'robot-5'
    })
  });

  const types = postCalls.map((c) => c.body?.msgtype).filter(Boolean);
  assert.ok(types.includes('text'));
  assert.ok(types.includes('markdown'));
});

test('stream bridge prefers agent answer text over instance/intent stub', async () => {
  let callback;
  const postCalls = [];
  const fakeClient = {
    registerCallbackListener: (_, cb) => {
      callback = cb;
      return fakeClient;
    },
    connect: async () => {},
    getAccessToken: async () => '',
    socketCallBackResponse: () => {}
  };

  const bridge = createDingtalkStreamBridge({
    env: {
      DINGTALK_STREAM_CLIENT_ID: 'cid',
      DINGTALK_STREAM_CLIENT_SECRET: 'csecret'
    },
    logger: console,
    orchestrator: {
      execute: async () => ({
        mode: 'completed',
        taskId: 'job-1',
        result: {
          text: '最终可见回答',
          instance: { instance_no: 3 },
          intent: { intent: 'error_code_lookup' }
        }
      })
    },
    clientFactory: () => fakeClient,
    postJson: async (url, body) => {
      postCalls.push({ url, body });
      return { ok: true };
    }
  });

  await bridge.start();
  await callback({
    headers: { messageId: 'm-pref' },
    data: JSON.stringify({
      senderStaffId: 'u1',
      text: { content: 'hi' },
      sessionWebhook: 'https://example.com/hook',
      conversationId: 'c1'
    })
  });

  const main = postCalls.find((x) => x.body?.msgtype === 'text');
  assert.ok(main);
  assert.equal(main.body.text.content, '最终可见回答');
});
