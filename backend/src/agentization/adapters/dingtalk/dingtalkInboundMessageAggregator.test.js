const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAggregationKey,
  buildAggregatedPayload,
  createDingtalkInboundMessageAggregator
} = require('./dingtalkInboundMessageAggregator');
const {
  buildMessageInputFromDingtalkPayload
} = require('./buildMessageInputFromDingtalk');

function createManualScheduler() {
  let nowValue = 0;
  let nextId = 1;
  const timers = new Map();

  function setTimer(fn, delay) {
    const id = nextId++;
    timers.set(id, { id, dueAt: nowValue + Number(delay || 0), fn });
    return id;
  }

  function clearTimer(id) {
    timers.delete(id);
  }

  async function advance(ms) {
    nowValue += Number(ms || 0);
    let ran = true;
    while (ran) {
      ran = false;
      const due = Array.from(timers.values())
        .filter((item) => item.dueAt <= nowValue)
        .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);
      for (const timer of due) {
        if (!timers.delete(timer.id)) continue;
        ran = true;
        await timer.fn();
      }
    }
  }

  return {
    now: () => nowValue,
    setTimer,
    clearTimer,
    advance
  };
}

describe('dingtalkInboundMessageAggregator', () => {
  it('builds strict aggregation key from channel, conversation and senderStaffId', () => {
    assert.equal(buildAggregationKey({
      conversationId: 'cid_1',
      senderStaffId: 'staff_1'
    }), 'dingtalk:cid_1:staff_1');
    assert.equal(buildAggregationKey({
      conversationId: 'cid_1',
      senderId: 'user_1'
    }), '');
  });

  it('builds aggregated payload with merged text, attachments and rawMessages', async () => {
    const payload = buildAggregatedPayload({
      startedAt: 1000,
      lastMessageAt: 1500,
      flushedAt: 1800,
      deduplicatedCount: 1,
      messages: [
        {
          arrivedAt: 1000,
          payload: {
            conversationId: 'cid_1',
            senderStaffId: 'staff_1',
            senderId: 'user_1',
            sessionWebhook: 'https://example.com/hook/a',
            text: { content: '第一条' }
          }
        },
        {
          arrivedAt: 1500,
          payload: {
            conversationId: 'cid_1',
            senderStaffId: 'staff_1',
            senderId: 'user_1',
            sessionWebhook: 'https://example.com/hook/b',
            msgtype: 'file',
            content: JSON.stringify({
              downloadCode: 'code_1',
              fileName: 'report.txt',
              fileType: 'text/plain',
              fileSize: 12
            })
          }
        }
      ]
    }, 'silence', 'batch_1');

    assert.equal(payload.messageId, 'batch_1');
    assert.equal(payload.msgtype, 'richtext');
    assert.equal(payload.text.content, '第一条');
    assert.equal(payload.sessionWebhook, 'https://example.com/hook/b');
    assert.equal(payload.rawMessages.length, 2);
    assert.equal(payload.aggregationMeta.flushReason, 'silence');

    const request = await buildMessageInputFromDingtalkPayload(payload, {
      resolveDingtalkUser: async () => ({
        user: { id: 7, username: 'agent_user' }
      }),
      resolveAttachments: async (_rawPayload, options = {}) => {
        return (Array.isArray(options.candidates) ? options.candidates : []).map((item, index) => ({
          type: item.type,
          url: item.url || `https://example.com/asset/${index + 1}`,
          originalName: item.name,
          storedName: item.name,
          mimeType: item.mimeType,
          assetId: `asset_${index + 1}`
        }));
      }
    });

    assert.equal(request.message.externalMessageId, 'batch_1');
    assert.equal(request.message.text, '第一条');
    assert.equal(request.message.attachments.length, 1);
    assert.equal(request.rawPayload.rawMessages.length, 2);
    assert.equal(request.rawPayload.aggregationMeta.batchMessageId, 'batch_1');
  });

  it('flushes by silence and deduplicates repeated message ids', async () => {
    const scheduler = createManualScheduler();
    const flushed = [];
    const aggregator = createDingtalkInboundMessageAggregator({
      env: {
        DINGTALK_STREAM_MESSAGE_AGGREGATION_ENABLED: 'true',
        DINGTALK_STREAM_MESSAGE_AGGREGATION_MAX_WINDOW_MS: '30',
        DINGTALK_STREAM_MESSAGE_AGGREGATION_SILENCE_MS: '10'
      },
      now: scheduler.now,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      onFlush: async (batch) => {
        flushed.push(batch);
      }
    });

    await aggregator.accept({
      headers: { messageId: 'msg_1' },
      payload: {
        conversationId: 'cid_1',
        senderStaffId: 'staff_1',
        messageId: 'msg_1',
        text: { content: 'hello' }
      }
    });
    await aggregator.accept({
      headers: { messageId: 'msg_1' },
      payload: {
        conversationId: 'cid_1',
        senderStaffId: 'staff_1',
        messageId: 'msg_1',
        text: { content: 'hello' }
      }
    });
    await aggregator.accept({
      headers: { messageId: 'msg_2' },
      payload: {
        conversationId: 'cid_1',
        senderStaffId: 'staff_1',
        messageId: 'msg_2',
        text: { content: 'world' }
      }
    });

    await scheduler.advance(10);

    assert.equal(flushed.length, 1);
    assert.equal(flushed[0].flushReason, 'silence');
    assert.equal(flushed[0].payload.text.content, 'hello\nworld');
    assert.equal(flushed[0].payload.rawMessages.length, 2);
    assert.equal(flushed[0].payload.aggregationMeta.deduplicatedCount, 1);
  });

  it('flushes immediately when attachment threshold is reached', async () => {
    const scheduler = createManualScheduler();
    const flushed = [];
    const aggregator = createDingtalkInboundMessageAggregator({
      env: {
        DINGTALK_STREAM_MESSAGE_AGGREGATION_ENABLED: 'true',
        DINGTALK_STREAM_MESSAGE_AGGREGATION_MAX_WINDOW_MS: '3000',
        DINGTALK_STREAM_MESSAGE_AGGREGATION_SILENCE_MS: '800'
      },
      now: scheduler.now,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      onFlush: async (batch) => {
        flushed.push(batch);
      }
    });

    for (let i = 0; i < 10; i += 1) {
      await aggregator.accept({
        headers: { messageId: `msg_${i + 1}` },
        payload: {
          conversationId: 'cid_1',
          senderStaffId: 'staff_1',
          messageId: `msg_${i + 1}`,
          msgtype: 'file',
          content: JSON.stringify({
            downloadCode: `code_${i + 1}`,
            fileName: `file_${i + 1}.txt`,
            fileType: 'text/plain'
          })
        }
      });
    }

    assert.equal(flushed.length, 1);
    assert.equal(flushed[0].flushReason, 'attachment_threshold');
    assert.equal(flushed[0].payload.rawMessages.length, 10);
  });
});
