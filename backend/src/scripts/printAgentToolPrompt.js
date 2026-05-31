/**
 * 单独打印意图模型使用的 tool 段落（与 qwenService 中 buildIntentToolPrompt 一致）。
 * 用法（在 backend 目录）：
 *   node src/scripts/printAgentToolPrompt.js
 *   node src/scripts/printAgentToolPrompt.js --full
 *   node src/scripts/printAgentToolPrompt.js --json
 *   node src/scripts/printAgentToolPrompt.js --lang en
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (_) {
  /* optional */
}

const { buildIntentToolPrompt } = require('../agentization/tools/registry/toolPromptBinder');

const args = process.argv.slice(2);
const full = args.includes('--full');
const jsonOut = args.includes('--json');
let lang = 'zh';
const langIdx = args.indexOf('--lang');
if (langIdx >= 0 && args[langIdx + 1]) {
  lang = String(args[langIdx + 1] || 'zh').trim();
}

const built = buildIntentToolPrompt({ lang });

if (jsonOut) {
  process.stdout.write(`${JSON.stringify(built, null, 2)}\n`);
  process.exit(0);
}

const body = String(built.toolPrompt || '').trim();
if (full) {
  process.stdout.write(`[tool]\n${body}\n`);
} else {
  process.stdout.write(`${body}\n`);
}
