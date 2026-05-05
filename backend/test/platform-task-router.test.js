const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlatformTaskRouter } = require('../src/agentization/router/platformTaskRouter');

function buildRequest(text) {
  return {
    message: {
      text: text == null ? '' : String(text)
    },
    channel: {
      type: 'api'
    },
    context: {}
  };
}

test('router routes by default rules with rule-first strategy', () => {
  const router = createPlatformTaskRouter();
  const out = router.route(buildRequest('查询日志 error code'));

  assert.equal(out.intent, 'log_query');
  assert.equal(out.fallback, false);
  assert.equal(out.slots.query, '查询日志 error code');
});

test('router falls back to smart_search when no rule matches', () => {
  const router = createPlatformTaskRouter();
  const out = router.route(buildRequest('今天天气怎么样'));

  assert.equal(out.intent, 'smart_search');
  assert.equal(out.fallback, false);
});

test('router marks fallback=true on empty query', () => {
  const router = createPlatformTaskRouter();
  const out = router.route(buildRequest('   '));

  assert.equal(out.intent, 'smart_search');
  assert.equal(out.fallback, true);
});

test('router supports custom rules injection', () => {
  const router = createPlatformTaskRouter({
    rules: [
      {
        intent: 'custom_intent',
        keywords: ['自定义关键字']
      }
    ]
  });

  const out = router.route(buildRequest('这是一个自定义关键字命中'));
  assert.equal(out.intent, 'custom_intent');
  assert.equal(out.fallback, false);
});
