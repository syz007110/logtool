const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadHandler({ DeviceSeriesDict, searchErrorCodesUnified }) {
  const handlerPath = path.resolve(__dirname, '../src/agentization/tools/handlers/errorCodeLookupHandler.js');
  const seriesPath = path.resolve(__dirname, '../src/models/device_series_dict.js');
  const unifiedPath = path.resolve(__dirname, '../src/services/errorCodeUnifiedService.js');
  const previewPath = path.resolve(__dirname, '../src/utils/explanationPreview.js');
  const faultPath = path.resolve(__dirname, '../src/services/faultCodeExtractionService.js');

  delete require.cache[handlerPath];
  require.cache[seriesPath] = { exports: DeviceSeriesDict };
  require.cache[unifiedPath] = { exports: { searchErrorCodesUnified } };
  require.cache[previewPath] = {
    exports: {
      composeExplanationPreviewFromI18n: () => ({
        explanation: null,
        prefix: null,
        prefixRaw: null
      })
    }
  };
  require.cache[faultPath] = {
    exports: { resolveSubsystemPrefixLabel: () => '' }
  };

  return require(handlerPath);
}

test('errorCodeLookupHandler passes resolved series_id into unified search', async () => {
  let captured = null;
  const handler = loadHandler({
    DeviceSeriesDict: {
      findOne: async ({ where }) => {
        assert.equal(where.series_code, 'SA');
        return { id: 2, series_code: 'SA' };
      }
    },
    searchErrorCodesUnified: async (args) => {
      captured = args;
      return { errorCodes: [], total: 0, _meta: { searchMethod: 'none' } };
    }
  });

  await handler.execute({
    args: {
      errorCode: '141010A',
      queryType: 'single_code',
      seriesCode: 'SA',
      language: 'zh-CN'
    }
  });

  assert.ok(captured);
  assert.equal(captured.series_id, 2);
  assert.equal(captured.q, '141010A');
});

test('errorCodeLookupHandler rejects unknown seriesCode', async () => {
  const handler = loadHandler({
    DeviceSeriesDict: {
      findOne: async () => null
    },
    searchErrorCodesUnified: async () => {
      throw new Error('should not be called');
    }
  });

  await assert.rejects(
    () => handler.execute({
      args: { errorCode: '141010A', queryType: 'single_code', seriesCode: 'XX', language: 'zh-CN' }
    }),
    /invalid seriesCode/i
  );
});

test('errorCodeLookupHandler batches multiple error codes into one tool execution', async () => {
  const calls = [];
  const handler = loadHandler({
    DeviceSeriesDict: {
      findOne: async () => ({ id: 1, series_code: 'SR' })
    },
    searchErrorCodesUnified: async (args) => {
      calls.push(args.q);
      return {
        errorCodes: [{
          id: calls.length,
          subsystem: '1',
          code: '0X010A',
          short_message: 'msg',
          user_hint: '',
          operation: '',
          param1: '',
          param2: '',
          param3: '',
          param4: '',
          detail: '',
          method: '',
          tech_solution: '',
          category: ''
        }],
        total: 1,
        _meta: { searchMethod: 'db', recognized: { kind: 'full_code' } }
      };
    }
  });

  const result = await handler.execute({
    args: {
      errorCodes: ['141010A', '241010A'],
      queryType: 'multiple_codes',
      seriesCode: 'SR',
      language: 'zh-CN'
    }
  });

  assert.deepEqual(calls, ['141010A', '241010A']);
  assert.equal(result.debugMeta.queryCount, 2);
  assert.equal(result.data.queries.length, 2);
  assert.match(result.text, /141010A/);
  assert.match(result.text, /241010A/);
});
