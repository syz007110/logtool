const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { generateUlid, generateUuidV4 } = require('../src/utils/idGenerators');

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const UUIDV4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('generateUlid returns 26-char crockford id', () => {
  const id = generateUlid();
  assert.match(id, ULID_RE);
});

test('generateUuidV4 returns uuid v4', () => {
  const id = generateUuidV4();
  assert.match(id, UUIDV4_RE);
});

test('agentController uses ULID/UUIDv4 generators for web fallbacks', () => {
  const file = path.join(__dirname, '../src/controllers/agentController.js');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /const \{ generateUlid, generateUuidV4 \} = require\('\.\.\/utils\/idGenerators'\);/);
  assert.match(source, /function buildWebMessageId\([\s\S]*?\)\s*\{\s*return generateUlid\(/);
  assert.match(source, /function buildRequestId\(\)\s*\{\s*return generateUuidV4\(\);/);
  assert.match(source, /function buildTraceId\([^\)]*\)\s*\{[\s\S]*return generateUuidV4\(\);/);
});
