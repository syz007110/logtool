const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

const ERROR_CODE_HEADERS = [
  'series_id',
  'subsystem',
  'code',
  'is_axis_error',
  'is_arm_error',
  'solution',
  'for_expert',
  'for_novice',
  'related_log',
  'level',
  'category'
];

const I18N_HEADERS = [
  'series_id',
  'subsystem',
  'code',
  'lang',
  'short_message',
  'user_hint',
  'operation',
  'detail',
  'method',
  'param1',
  'param2',
  'param3',
  'param4'
];

function textOf(value) {
  if (Array.isArray(value)) return textOf(value[0]);
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return '';
  if (code.startsWith('0X')) return code;
  return `0X${code.replace(/^0X/i, '')}`;
}

function parseBoolNumber(value, fallback = 0) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', '1.0', 'yes', 'on'].includes(raw)) return 1;
  if (['false', '0', '0.0', 'no', 'off'].includes(raw)) return 0;
  return fallback;
}

function deriveLevelFromCode(code) {
  const match = String(code || '').toUpperCase().match(/^0X[0-9A-F]{3}([ABCDE])$/);
  if (!match) return 'none';
  const severity = match[1];
  if (severity === 'A') return 'high';
  if (severity === 'B') return 'medium';
  if (severity === 'C') return 'low';
  return 'none';
}

function deriveSolutionFromCode(code) {
  const match = String(code || '').toUpperCase().match(/^0X[0-9A-F]{3}([ABCDE])$/);
  if (!match) return 'tips';
  const severity = match[1];
  if (severity === 'A' || severity === 'B') return 'recoverable';
  if (severity === 'C') return 'ignorable';
  if (severity === 'D') return 'tips';
  if (severity === 'E') return 'log';
  return 'tips';
}

async function parseFaultAnalysisXml(xmlContent) {
  const parsed = await parseStringPromise(xmlContent, {
    explicitArray: true,
    trim: true
  });
  const subsystemNodes = parsed?.Medbot?.instance?.[0]?.subsystem || [];
  const records = [];

  for (const subsystemNode of subsystemNodes) {
    const subsystem = String(subsystemNode?.$?.id || '').trim();
    const errorCodes = subsystemNode?.error_code || [];
    for (const errorNode of errorCodes) {
      records.push({
        subsystem,
        code: normalizeCode(errorNode?.$?.id || ''),
        axis: textOf(errorNode.axis),
        description: textOf(errorNode.description),
        simple: textOf(errorNode.simple),
        userInfo: textOf(errorNode.userInfo),
        opinfo: textOf(errorNode.opinfo),
        isArm: textOf(errorNode.isArm),
        detInfo: textOf(errorNode.detInfo),
        method: textOf(errorNode.method),
        para1: textOf(errorNode.para1),
        para2: textOf(errorNode.para2),
        para3: textOf(errorNode.para3),
        para4: textOf(errorNode.para4),
        expert: textOf(errorNode.expert),
        learner: textOf(errorNode.learner),
        log: textOf(errorNode.log),
        action: textOf(errorNode.action)
      });
    }
  }

  return records;
}

function buildMainRecord(seriesId, zhRow) {
  return {
    series_id: Number(seriesId),
    subsystem: zhRow.subsystem,
    code: zhRow.code,
    is_axis_error: parseBoolNumber(zhRow.axis),
    is_arm_error: parseBoolNumber(zhRow.isArm),
    solution: zhRow.action || deriveSolutionFromCode(zhRow.code),
    for_expert: parseBoolNumber(zhRow.expert, 1),
    for_novice: parseBoolNumber(zhRow.learner, 1),
    related_log: parseBoolNumber(zhRow.log, 0),
    level: deriveLevelFromCode(zhRow.code),
    category: ''
  };
}

function buildI18nRecord(seriesId, lang, row) {
  return {
    series_id: Number(seriesId),
    subsystem: row.subsystem,
    code: row.code,
    lang,
    short_message: row.simple || '',
    user_hint: row.userInfo || '',
    operation: row.opinfo || '',
    detail: row.detInfo || row.description || '',
    method: row.method || '',
    param1: row.para1 || '',
    param2: row.para2 || '',
    param3: row.para3 || '',
    param4: row.para4 || ''
  };
}

async function convertSaXmlPair({ zhXmlContent, enXmlContent, seriesId }) {
  const zhRows = await parseFaultAnalysisXml(zhXmlContent);
  const enRows = await parseFaultAnalysisXml(enXmlContent);

  const zhMap = new Map(zhRows.map((row) => [`${row.subsystem}::${row.code}`, row]));
  const enMap = new Map(enRows.map((row) => [`${row.subsystem}::${row.code}`, row]));
  const allKeys = Array.from(new Set([...zhMap.keys(), ...enMap.keys()])).sort();

  const errorCodes = [];
  const i18nZh = [];
  const i18nEn = [];

  for (const key of allKeys) {
    const zhRow = zhMap.get(key);
    const enRow = enMap.get(key);
    const baseRow = zhRow || enRow;
    if (!baseRow) continue;

    errorCodes.push(buildMainRecord(seriesId, baseRow));
    if (zhRow) i18nZh.push(buildI18nRecord(seriesId, 'zh', zhRow));
    if (enRow) i18nEn.push(buildI18nRecord(seriesId, 'en', enRow));
  }

  return { errorCodes, i18nZh, i18nEn };
}

function escapeCsvCell(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows || []) {
    lines.push(headers.map((header) => escapeCsvCell(row?.[header] ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function convertFiles({ zhXmlPath, enXmlPath, seriesId, outputDir }) {
  const zhXmlContent = fs.readFileSync(zhXmlPath, 'utf8');
  const enXmlContent = fs.readFileSync(enXmlPath, 'utf8');
  const converted = await convertSaXmlPair({ zhXmlContent, enXmlContent, seriesId });

  fs.mkdirSync(outputDir, { recursive: true });
  const errorCodesCsv = serializeCsv(converted.errorCodes, ERROR_CODE_HEADERS);
  const zhCsv = serializeCsv(converted.i18nZh, I18N_HEADERS);
  const enCsv = serializeCsv(converted.i18nEn, I18N_HEADERS);

  const errorCodesPath = path.join(outputDir, 'sa_error_codes.csv');
  const zhPath = path.join(outputDir, 'sa_i18n_zh.csv');
  const enPath = path.join(outputDir, 'sa_i18n_en.csv');

  fs.writeFileSync(errorCodesPath, errorCodesCsv, 'utf8');
  fs.writeFileSync(zhPath, zhCsv, 'utf8');
  fs.writeFileSync(enPath, enCsv, 'utf8');

  return {
    ...converted,
    output: {
      errorCodesPath,
      zhPath,
      enPath
    }
  };
}

async function main() {
  const [, , zhXmlArg, enXmlArg, seriesIdArg, outputDirArg] = process.argv;
  if (!zhXmlArg || !enXmlArg || !seriesIdArg) {
    console.error('用法: node backend/src/scripts/convertSaXmlToCsv.js <zhXmlPath> <enXmlPath> <seriesId> [outputDir]');
    process.exit(1);
  }

  const outputDir = outputDirArg
    ? path.resolve(outputDirArg)
    : path.resolve(process.cwd(), 'example', 'ErrorCode_i18n', 'converted-sa');

  const result = await convertFiles({
    zhXmlPath: path.resolve(zhXmlArg),
    enXmlPath: path.resolve(enXmlArg),
    seriesId: Number(seriesIdArg),
    outputDir
  });

  console.log('✅ SA XML 转换完成');
  console.log(`- 主表 CSV: ${result.output.errorCodesPath}`);
  console.log(`- 中文 i18n CSV: ${result.output.zhPath}`);
  console.log(`- 英文 i18n CSV: ${result.output.enPath}`);
  console.log(`- 主表记录数: ${result.errorCodes.length}`);
  console.log(`- 中文记录数: ${result.i18nZh.length}`);
  console.log(`- 英文记录数: ${result.i18nEn.length}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ SA XML 转换失败:', error);
    process.exit(1);
  });
}

module.exports = {
  ERROR_CODE_HEADERS,
  I18N_HEADERS,
  normalizeCode,
  parseFaultAnalysisXml,
  convertSaXmlPair,
  serializeCsv,
  convertFiles
};
