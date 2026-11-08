const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/createApp');
const { sequelize } = require('../../src/models');

let server;
let baseUrl;

test.before(async () => {
  const app = createApp({ testMode: true });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('authentication options are public and do not expose deployment secrets', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login-options`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['dingtalkEnabled', 'emergencyLoginEnabled', 'localLoginEnabled']);
  assert.equal(typeof body.dingtalkEnabled, 'boolean');
  assert.equal(typeof body.localLoginEnabled, 'boolean');
  assert.equal(body.emergencyLoginEnabled, true);
});

test('retired public registration endpoint is explicit', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST' });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, 'AUTH_ENDPOINT_RETIRED');
});
