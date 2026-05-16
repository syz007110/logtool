const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('agent tool gateway does not depend on smart-search controller', () => {
  const file = path.resolve(__dirname, '../src/agentization/tools/logtoolToolGateway.js');
  const content = fs.readFileSync(file, 'utf8');
  assert.equal(content.includes('smartSearchController'), false);
  assert.equal(content.includes('smartSearch('), false);
});
