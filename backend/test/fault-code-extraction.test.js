const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeErrorCodeInput,
  resolveAgentFaultCodeToken,
  extractSubsystemPrefixFromUserText,
  resolveSubsystemPrefixLabel
} = require('../src/services/faultCodeExtractionService');

test('normalizeErrorCodeInput accepts type code with/without prefix', () => {
  assert.equal(normalizeErrorCodeInput('33ed'), '0X33ED');
  assert.equal(normalizeErrorCodeInput('0x33ed'), '0X33ED');
});

test('normalizeErrorCodeInput accepts full fault code', () => {
  assert.equal(normalizeErrorCodeInput('10033ed'), '0X33ED');
});

test('resolveAgentFaultCodeToken keeps full code when present', () => {
  assert.equal(resolveAgentFaultCodeToken('查 142020A 故障'), '142020A');
  assert.equal(resolveAgentFaultCodeToken('141010A'), '141010A');
});

test('resolveAgentFaultCodeToken keeps type-only when no full code', () => {
  assert.equal(resolveAgentFaultCodeToken('0x020a'), '0X020A');
  assert.equal(resolveAgentFaultCodeToken('只有 020A'), '0X020A');
});

test('extractSubsystemPrefixFromUserText maps full code subsystem to label', () => {
  assert.match(
    extractSubsystemPrefixFromUserText('报警 141010A 怎么处理', 'zh-CN'),
    /运动控制/
  );
  assert.equal(extractSubsystemPrefixFromUserText('只有0X020A', 'zh-CN'), '');
});

test('resolveSubsystemPrefixLabel respects language', () => {
  assert.match(resolveSubsystemPrefixLabel('1', 'zh-CN'), /运动/);
  assert.match(resolveSubsystemPrefixLabel('1', 'en'), /Motion/i);
});

