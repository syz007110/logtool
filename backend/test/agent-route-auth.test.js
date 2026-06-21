const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('agent execute route applies auth and permission middleware', () => {
  const file = path.join(__dirname, '../src/routes/agent.js');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(
    source,
    /router\.post\(\s*['"]\/execute['"]\s*,\s*auth\s*,\s*enrichAgentUser\s*,\s*checkPermission\(['"]smart_search:use['"]\)\s*,\s*executeAgentTask\s*\)/,
    'POST /execute should include auth + checkPermission middleware'
  );
});

