const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseInbound,
  renderOutbound,
  renderError
} = require('../src/agentization/adapters/web/webAdapter');
const { generateUlid } = require('../src/utils/idGenerators');

function buildReq(overrides = {}) {
  const externalMessageId = generateUlid();
  return {
    headers: {},
    user: { id: 99, username: 'auth_user' },
    body: {
      channel: { type: 'web', conversationType: 'single' },
      message: {
        externalMessageId,
        type: 'text',
        text: 'hello',
        attachments: [],
        sentAt: Date.now()
      }
    },
    ...overrides
  };
}

test('web adapter rejects request when channel is missing', () => {
  const req = buildReq({ body: { message: { externalMessageId: generateUlid(), text: 'hello' } } });
  delete req.body.channel;
  assert.throws(() => parseInbound(req), /channel is required/i);
});

test('web adapter rejects request when externalMessageId is missing', () => {
  const req = buildReq();
  delete req.body.message.externalMessageId;
  assert.throws(() => parseInbound(req), /message\.externalMessageId is required/i);
});

test('web adapter rejects invalid externalMessageId format', () => {
  const req = buildReq();
  req.body.message.externalMessageId = 'not-a-ulid';
  assert.throws(() => parseInbound(req), /message\.externalMessageId format is invalid/i);
});

test('web adapter rejects request without authenticated user', () => {
  const req = buildReq({ user: undefined });
  assert.throws(() => parseInbound(req), /authenticated user is required/i);
});

test('web adapter rejects non-web channel type', () => {
  const req = buildReq();
  req.body.channel.type = 'dingtalk';
  assert.throws(() => parseInbound(req), /channel\.type must be web/i);
});

test('web adapter generates conversationId on first message', () => {
  const req = buildReq();
  const request = parseInbound(req);
  assert.match(request.channel.conversationId, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(request.__conversationIdProvided, false);
});

test('web adapter reuses provided conversationId on continuation', () => {
  const conversationId = generateUlid();
  const req = buildReq({
    body: {
      channel: { type: 'web', conversationType: 'single', conversationId },
      message: {
        externalMessageId: generateUlid(),
        type: 'text',
        text: 'follow up',
        attachments: [],
        sentAt: Date.now()
      }
    }
  });
  const request = parseInbound(req);
  assert.equal(request.channel.conversationId, conversationId);
  assert.equal(request.__conversationIdProvided, true);
});

test('web adapter uses authenticated user instead of body user', () => {
  const req = buildReq({
    body: {
      user: { id: 'spoofed' },
      channel: { type: 'web', conversationType: 'single', conversationId: generateUlid() },
      message: {
        externalMessageId: generateUlid(),
        type: 'text',
        text: 'hello',
        attachments: [],
        sentAt: Date.now()
      }
    }
  });
  const request = parseInbound(req);
  assert.equal(request.user.id, '99');
  assert.equal(request.user.name, 'auth_user');
});

test('web adapter maps isAdmin from authenticated user', () => {
  const req = buildReq({ user: { id: 99, username: 'auth_user', isAdmin: true } });
  const request = parseInbound(req);
  assert.equal(request.user.isAdmin, true);

  const nonAdminReq = buildReq({ user: { id: 99, username: 'auth_user', isAdmin: false } });
  const nonAdminRequest = parseInbound(nonAdminReq);
  assert.equal(nonAdminRequest.user.isAdmin, false);

  const unsetReq = buildReq({ user: { id: 99, username: 'auth_user' } });
  const unsetRequest = parseInbound(unsetReq);
  assert.equal(unsetRequest.user.isAdmin, undefined);
});

test('web adapter renderOutbound includes session on first message only', () => {
  const conversationId = generateUlid();
  const firstRequest = {
    traceId: 'trace-1',
    requestId: 'req-1',
    channel: { conversationId },
    __conversationIdProvided: false
  };
  const continuationRequest = {
    ...firstRequest,
    __conversationIdProvided: true
  };
  const response = {
    mode: 'completed',
    taskId: 'task-1',
    result: { text: 'ok', attachments: [], debug: 'strip-me' }
  };

  const firstPayload = captureJson((payload) => {
    renderOutbound({
      req: {},
      res: { json: (body) => payload.push(body) },
      request: firstRequest,
      response
    });
  });
  assert.equal(firstPayload.response.session.conversationId, conversationId);
  assert.equal(firstPayload.response.text, 'ok');
  assert.deepEqual(firstPayload.response.attachments, []);
  assert.equal(firstPayload.response.debug, undefined);

  const continuationPayload = captureJson((payload) => {
    renderOutbound({
      req: {},
      res: { json: (body) => payload.push(body) },
      request: continuationRequest,
      response
    });
  });
  assert.equal(continuationPayload.response.session, undefined);
});

test('web adapter renderOutbound returns async acceptance payload', () => {
  const conversationId = generateUlid();
  const payload = captureJson((items) => {
    renderOutbound({
      req: {},
      res: { json: (body) => items.push(body) },
      request: {
        traceId: 'trace-async',
        requestId: 'req-async',
        channel: { conversationId },
        __conversationIdProvided: false
      },
      response: {
        mode: 'accepted',
        taskId: 'task-async-1',
        message: '任务已受理'
      }
    });
  });
  assert.equal(payload.mode, 'accepted');
  assert.equal(payload.taskId, 'task-async-1');
  assert.equal(payload.message, '任务已受理');
  assert.equal(payload.response, undefined);
  assert.equal(payload.session.conversationId, conversationId);
});

test('web adapter renderError returns 400 with message', () => {
  let statusCode;
  let body;
  renderError({
    req: {},
    res: {
      status(code) {
        statusCode = code;
        return {
          json(payload) {
            body = payload;
          }
        };
      }
    },
    error: new Error('bad request')
  });
  assert.equal(statusCode, 400);
  assert.equal(body.ok, false);
  assert.equal(body.message, 'bad request');
});

function captureJson(fn) {
  const items = [];
  fn(items);
  return items[0];
}
