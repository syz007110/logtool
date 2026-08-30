const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { defineAssociations } = require('../models/associations');
const { sequelize } = require('../models');
const { execute } = require('../agentization/tools/handlers/deviceContextLookupHandler');

defineAssociations();

function printUsage() {
  console.log([
    'Usage:',
    '  node src/scripts/runDeviceContextLookup.js --queryType=device_id --deviceId=SR4339-2509009',
    '  node src/scripts/runDeviceContextLookup.js --queryType=device_model --deviceModel=4339',
    '  node src/scripts/runDeviceContextLookup.js --queryType=series --seriesCode=SR',
    '  node src/scripts/runDeviceContextLookup.js --queryType=decrypt_key --decryptKey=00-01-05-a9-40-dc',
    '',
    'Optional:',
    '  --strict=true|false',
    '  --language=zh-CN|en-US'
  ].join('\n'));
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const text = String(arg || '').trim();
    if (!text.startsWith('--')) continue;
    const eqIdx = text.indexOf('=');
    if (eqIdx < 0) {
      parsed[text.slice(2)] = 'true';
      continue;
    }
    const key = text.slice(2, eqIdx).trim();
    const value = text.slice(eqIdx + 1).trim();
    if (key) parsed[key] = value;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === 'true' || args.h === 'true') {
    printUsage();
    return;
  }

  const payload = {
    queryType: args.queryType || '',
    deviceId: args.deviceId || '',
    deviceModel: args.deviceModel || '',
    seriesCode: args.seriesCode || '',
    decryptKey: args.decryptKey || '',
    strict: args.strict || 'false',
    language: args.language || 'zh-CN'
  };

  if (!payload.queryType) {
    printUsage();
    throw new Error('queryType is required');
  }

  try {
    await sequelize.authenticate();
    const result = await execute({ args: payload });
    console.log(JSON.stringify({
      ok: true,
      payload,
      result
    }, null, 2));
  } finally {
    await sequelize.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: {
      code: String(error?.code || 'RUN_DEVICE_CONTEXT_LOOKUP_FAILED'),
      message: String(error?.message || error || 'runDeviceContextLookup failed')
    }
  }, null, 2));
  process.exitCode = 1;
});
