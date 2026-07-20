const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertDingtalkDeliveryResponseSuccess
} = require('./dingtalkOutboundService');

describe('assertDingtalkDeliveryResponseSuccess', () => {
  it('accepts successful http and empty business body', () => {
    assert.doesNotThrow(() => {
      assertDingtalkDeliveryResponseSuccess({
        _httpStatus: 200
      }, { stage: 'test_delivery' });
    });
  });

  it('rejects non-2xx http responses', () => {
    assert.throws(
      () => assertDingtalkDeliveryResponseSuccess({
        _httpStatus: 500,
        errmsg: 'server error'
      }, { stage: 'test_delivery' }),
      (error) => error && error.code === 'DINGTALK_HTTP_ERROR'
    );
  });

  it('accepts 2xx http even when body contains business-like fields', () => {
    assert.doesNotThrow(() => {
      assertDingtalkDeliveryResponseSuccess({
        _httpStatus: 200,
        errcode: 40035,
        errmsg: 'invalid message'
      }, { stage: 'test_delivery' });
    });
  });
});
