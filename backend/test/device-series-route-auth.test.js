const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('device series route applies auth and device:read permission', () => {
  const routePath = path.resolve(__dirname, '../src/routes/deviceSeries.js');
  const content = fs.readFileSync(routePath, 'utf8');
  assert.match(content, /router\.get\('\/',\s*auth,\s*checkPermission\('device:read'\)/);
});

test('app mounts device series router on /api/device-series', () => {
  const appPath = path.resolve(__dirname, '../src/app.js');
  const content = fs.readFileSync(appPath, 'utf8');
  assert.match(content, /app\.use\('\/api\/device-series',\s*deviceSeriesRouter\)/);
});
