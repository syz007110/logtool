/**
 * Print registry-derived API function tools (tools[] payload).
 * Usage (from backend directory):
 *   node src/scripts/printAgentToolPrompt.js
 *   node src/scripts/printAgentToolPrompt.js --provider deepseek-chat
 *   node src/scripts/printAgentToolPrompt.js --lang en
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (_) {
  /* optional */
}

const { buildFunctionToolsFromRegistry } = require('../agentization/tools/toolSchemaBuilder');
const { mapFunctionToolsForProvider } = require('../agentization/tools/toolProviderAdapter');
const { resolveProvider } = require('../services/smartSearchLlmService');

const args = process.argv.slice(2);
let lang = 'zh';
let providerId = '';
const langIdx = args.indexOf('--lang');
if (langIdx >= 0 && args[langIdx + 1]) {
  lang = String(args[langIdx + 1] || 'zh').trim();
}
const providerIdx = args.indexOf('--provider');
if (providerIdx >= 0 && args[providerIdx + 1]) {
  providerId = String(args[providerIdx + 1] || '').trim();
}

const built = buildFunctionToolsFromRegistry({ lang });
const provider = resolveProvider(providerId);
const mapped = mapFunctionToolsForProvider(built.tools, provider);

process.stdout.write(`${JSON.stringify({
  registryVersion: built.registryVersion,
  toolNames: built.toolNames,
  provider: provider?.id || null,
  tools: mapped.tools,
  tool_choice: mapped.tool_choice || null
}, null, 2)}\n`);
