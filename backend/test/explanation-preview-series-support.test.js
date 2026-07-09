const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function loadExplanationController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/explanationController.js');
  const previewPath = path.resolve(__dirname, '../src/utils/explanationPreview.js');

  delete require.cache[controllerPath];
  require.cache[previewPath] = { exports: stubs.explanationPreview };

  return require(controllerPath);
}

function loadExplanationPreview(stubs) {
  const previewPath = path.resolve(__dirname, '../src/utils/explanationPreview.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const i18nPath = path.resolve(__dirname, '../src/models/i18n_error_code.js');

  delete require.cache[previewPath];
  require.cache[errorCodePath] = { exports: stubs.ErrorCode };
  require.cache[i18nPath] = { exports: stubs.I18nErrorCode || { findAll: async () => [] } };

  return require(previewPath);
}

test('previewParse forwards series_id to buildExplanationPreview', async () => {
  let capturedPayload = null;
  const controller = loadExplanationController({
    explanationPreview: {
      buildExplanationPreview: async (payload) => {
        capturedPayload = payload;
        return { ok: true };
      }
    }
  });

  const req = {
    body: {
      code: '1010A',
      subsystem: '1',
      series_id: 2,
      param1: 'a'
    },
    t: (key) => key
  };
  const res = createRes();

  await controller.previewParse(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedPayload.series_id, 2);
});

test('buildExplanationPreview uses series_id with subsystem+code lookup', async () => {
  let capturedWhere = null;
  const { buildExplanationPreview } = loadExplanationPreview({
    ErrorCode: {
      findOne: async ({ where }) => {
        capturedWhere = where;
        return { id: 7, subsystem: '1' };
      }
    },
    I18nErrorCode: {
      findAll: async () => [{ lang: 'zh', explanation: '模板' }]
    }
  });

  const out = await buildExplanationPreview({
    rawCode: '1010A',
    subsystem: '1',
    series_id: 2,
    params: {},
    lang: 'zh',
    t: (key) => key
  });

  assert.deepEqual(capturedWhere, { series_id: 2, subsystem: '1', code: '0X010A' });
  assert.equal(out.code, '0X010A');
});
