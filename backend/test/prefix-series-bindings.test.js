const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadParser() {
  const parserPath = path.resolve(__dirname, '../src/utils/explanationParser.js');
  delete require.cache[parserPath];
  return require(parserPath);
}

test('resolvePrefixProfile loads SR and SA from separate profile files', () => {
  const { resolvePrefixProfile, loadPrefixMappings } = loadParser();
  const root = loadPrefixMappings();
  assert.equal(root.seriesBindings.SR, 'sr');
  assert.equal(root.seriesBindings.SA, 'sa');
  assert.ok(root.profiles.sr);
  assert.ok(root.profiles.sa);
  assert.notEqual(root.profiles.sr, undefined);
  const sr = resolvePrefixProfile('SR');
  const sa = resolvePrefixProfile('SA');
  assert.equal(sr.subsystems['1'].armMap['4'], 'toolArm2');
  assert.equal(sa.subsystems['1'].armMap['4'], 'toolArm2');
  assert.equal(sr.subsystems['1'].jointPattern, 'joint:{value}');
});

test('buildPrefixFromContext emits semantic tokens not Chinese labels', () => {
  const { buildPrefixFromContext, buildPrefixTokensFromContext } = loadParser();
  const tokens = buildPrefixTokensFromContext({
    subsystem: '1',
    arm: '4',
    joint: '1',
    seriesCode: 'SA'
  });
  assert.deepEqual(tokens, ['toolArm2', 'joint:1']);
  const prefix = buildPrefixFromContext({
    subsystem: '1',
    arm: '4',
    joint: '1',
    seriesCode: 'SR'
  });
  assert.equal(prefix, 'toolArm2 joint:1');
  assert.doesNotMatch(prefix, /工具臂|关节/);
});

test('remote subsystem uses remoteEnd token', () => {
  const { buildPrefixFromContext } = loadParser();
  const prefix = buildPrefixFromContext({
    subsystem: '8',
    arm: '3',
    joint: '0',
    seriesCode: 'SR'
  });
  assert.equal(prefix, 'remoteEnd toolArm1');
});
