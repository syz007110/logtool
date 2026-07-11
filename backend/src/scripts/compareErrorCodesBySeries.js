/**
 * Compare error codes between series_id=1 and series_id=2.
 * Outputs JSON report under exports/.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../models');
const { defineAssociations } = require('../models/associations');

function normText(v) {
  if (v == null) return '';
  return String(v).replace(/\r\n/g, '\n').trim();
}

function normParam(v) {
  return normText(v).toLowerCase().replace(/\s+/g, ' ');
}

function meaningFingerprint(shortMessage, detail, explanation) {
  // Prefer human-readable short_message; fall back to detail / stripped explanation
  const sm = normText(shortMessage);
  if (sm) return sm;
  const d = normText(detail);
  if (d) return d.slice(0, 200);
  const e = normText(explanation);
  if (!e) return '';
  // explanation may be JSON rules — keep a stable slice
  return e.replace(/\s+/g, ' ').slice(0, 200);
}

function paramsEqual(a, b) {
  return (
    normParam(a.param1) === normParam(b.param1) &&
    normParam(a.param2) === normParam(b.param2) &&
    normParam(a.param3) === normParam(b.param3) &&
    normParam(a.param4) === normParam(b.param4)
  );
}

function paramDiff(a, b) {
  const diffs = [];
  for (const k of ['param1', 'param2', 'param3', 'param4']) {
    const av = normParam(a[k]);
    const bv = normParam(b[k]);
    if (av !== bv) {
      diffs.push({ field: k, series1: a[k] || '', series2: b[k] || '' });
    }
  }
  return diffs;
}

(async () => {
  defineAssociations();

  const [seriesNames] = await sequelize.query(`
    SELECT id, series_code, series_name_zh, series_name_en
    FROM device_series_dict
    WHERE id IN (1, 2)
    ORDER BY id
  `);

  const [rows] = await sequelize.query(`
    SELECT
      ec.id,
      ec.series_id,
      ec.subsystem,
      ec.code,
      ec.level,
      ec.category,
      ec.is_axis_error,
      ec.is_arm_error,
      i.short_message,
      i.detail,
      i.param1,
      i.param2,
      i.param3,
      i.param4,
      i.explanation,
      CASE
        WHEN i.explanation IS NULL OR TRIM(i.explanation) = '' THEN 0
        ELSE 1
      END AS has_explanation
    FROM error_codes ec
    LEFT JOIN i18n_error_codes i
      ON i.error_code_id = ec.id AND i.lang = 'zh'
    WHERE ec.series_id IN (1, 2)
  `);

  const bySeries = { 1: new Map(), 2: new Map() };
  for (const r of rows) {
    const key = `${r.subsystem}||${r.code}`;
    bySeries[r.series_id].set(key, r);
  }

  const keys1 = new Set(bySeries[1].keys());
  const keys2 = new Set(bySeries[2].keys());
  const only1 = [...keys1].filter((k) => !keys2.has(k)).sort();
  const only2 = [...keys2].filter((k) => !keys1.has(k)).sort();
  const both = [...keys1].filter((k) => keys2.has(k)).sort();

  const comparisons = [];
  let meaningSame = 0;
  let meaningDiff = 0;
  let meaningEmptyBoth = 0;
  let paramsSame = 0;
  let paramsDiff = 0;
  let expl1Only = 0;
  let expl2Only = 0;
  let explBoth = 0;
  let explNeither = 0;

  for (const key of both) {
    const a = bySeries[1].get(key);
    const b = bySeries[2].get(key);
    const [subsystem, code] = key.split('||');

    const fp1 = meaningFingerprint(a.short_message, a.detail, a.explanation);
    const fp2 = meaningFingerprint(b.short_message, b.detail, b.explanation);
    let meaningStatus = 'same';
    if (!fp1 && !fp2) {
      meaningStatus = 'both_empty';
      meaningEmptyBoth += 1;
    } else if (fp1 === fp2) {
      meaningStatus = 'same';
      meaningSame += 1;
    } else {
      meaningStatus = 'different';
      meaningDiff += 1;
    }

    const pSame = paramsEqual(a, b);
    if (pSame) paramsSame += 1;
    else paramsDiff += 1;

    const has1 = Number(a.has_explanation) === 1;
    const has2 = Number(b.has_explanation) === 1;
    if (has1 && has2) explBoth += 1;
    else if (has1) expl1Only += 1;
    else if (has2) expl2Only += 1;
    else explNeither += 1;

    comparisons.push({
      subsystem,
      code,
      meaningStatus,
      paramsSame: pSame,
      paramDiffs: pSame ? [] : paramDiff(a, b),
      series1: {
        id: a.id,
        short_message: a.short_message || '',
        detail: (a.detail || '').slice(0, 120),
        param1: a.param1 || '',
        param2: a.param2 || '',
        param3: a.param3 || '',
        param4: a.param4 || '',
        has_explanation: has1,
        level: a.level || '',
        category: a.category || ''
      },
      series2: {
        id: b.id,
        short_message: b.short_message || '',
        detail: (b.detail || '').slice(0, 120),
        param1: b.param1 || '',
        param2: b.param2 || '',
        param3: b.param3 || '',
        param4: b.param4 || '',
        has_explanation: has2,
        level: b.level || '',
        category: b.category || ''
      },
      levelSame: normText(a.level) === normText(b.level),
      categorySame: normText(a.category) === normText(b.category)
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    series: seriesNames,
    counts: {
      series1Total: bySeries[1].size,
      series2Total: bySeries[2].size,
      onlySeries1: only1.length,
      onlySeries2: only2.length,
      shared: both.length
    },
    sharedStats: {
      meaningSame,
      meaningDifferent: meaningDiff,
      meaningBothEmpty: meaningEmptyBoth,
      paramsSame,
      paramsDifferent: paramsDiff,
      explanationBoth: explBoth,
      explanationOnlySeries1: expl1Only,
      explanationOnlySeries2: expl2Only,
      explanationNeither: explNeither
    },
    onlySeries1: only1.map((k) => {
      const [subsystem, code] = k.split('||');
      const r = bySeries[1].get(k);
      return {
        subsystem,
        code,
        short_message: r.short_message || '',
        param1: r.param1 || '',
        param2: r.param2 || '',
        param3: r.param3 || '',
        param4: r.param4 || '',
        has_explanation: Number(r.has_explanation) === 1
      };
    }),
    onlySeries2: only2.map((k) => {
      const [subsystem, code] = k.split('||');
      const r = bySeries[2].get(k);
      return {
        subsystem,
        code,
        short_message: r.short_message || '',
        param1: r.param1 || '',
        param2: r.param2 || '',
        param3: r.param3 || '',
        param4: r.param4 || '',
        has_explanation: Number(r.has_explanation) === 1
      };
    }),
    meaningDifferentSamples: comparisons
      .filter((c) => c.meaningStatus === 'different')
      .slice(0, 80),
    paramsDifferentSamples: comparisons
      .filter((c) => !c.paramsSame)
      .slice(0, 80),
    bothMeaningAndParamsDifferent: comparisons
      .filter((c) => c.meaningStatus === 'different' && !c.paramsSame)
      .slice(0, 50),
    comparisons
  };

  const outDir = path.resolve(__dirname, '../../../exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(outDir, `error-codes-series-compare-${stamp}.json`);
  const summaryPath = path.join(outDir, `error-codes-series-compare-${stamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const s1name = seriesNames.find((s) => s.id === 1);
  const s2name = seriesNames.find((s) => s.id === 2);
  const md = [];
  md.push(`# 系列故障码对比分析`);
  md.push('');
  md.push(`生成时间: ${report.generatedAt}`);
  md.push('');
  md.push(`- 系列1: id=1 ${s1name ? `${s1name.series_code}/${s1name.series_name_zh}` : ''}`);
  md.push(`- 系列2: id=2 ${s2name ? `${s2name.series_code}/${s2name.series_name_zh}` : ''}`);
  md.push('');
  md.push(`## 覆盖面`);
  md.push(`| 项 | 数量 |`);
  md.push(`|---|---|`);
  md.push(`| 系列1 故障码 | ${report.counts.series1Total} |`);
  md.push(`| 系列2 故障码 | ${report.counts.series2Total} |`);
  md.push(`| 两系列共有（同 subsystem+code） | ${report.counts.shared} |`);
  md.push(`| 仅系列1 | ${report.counts.onlySeries1} |`);
  md.push(`| 仅系列2 | ${report.counts.onlySeries2} |`);
  md.push('');
  md.push(`## 共有故障码：含义 / 参数核对（zh）`);
  md.push(`| 项 | 数量 | 占比(共有) |`);
  md.push(`|---|---|---|`);
  const sh = report.counts.shared || 1;
  md.push(`| 含义一致（short_message/detail） | ${meaningSame} | ${(100 * meaningSame / sh).toFixed(1)}% |`);
  md.push(`| 含义不同 | ${meaningDiff} | ${(100 * meaningDiff / sh).toFixed(1)}% |`);
  md.push(`| 两边含义文本都空 | ${meaningEmptyBoth} | ${(100 * meaningEmptyBoth / sh).toFixed(1)}% |`);
  md.push(`| 参数 param1-4 一致 | ${paramsSame} | ${(100 * paramsSame / sh).toFixed(1)}% |`);
  md.push(`| 参数 param1-4 不一致 | ${paramsDiff} | ${(100 * paramsDiff / sh).toFixed(1)}% |`);
  md.push(`| 两边都有 explanation | ${explBoth} | ${(100 * explBoth / sh).toFixed(1)}% |`);
  md.push(`| 仅系列1有 explanation | ${expl1Only} | ${(100 * expl1Only / sh).toFixed(1)}% |`);
  md.push(`| 仅系列2有 explanation | ${expl2Only} | ${(100 * expl2Only / sh).toFixed(1)}% |`);
  md.push(`| 两边都无 explanation | ${explNeither} | ${(100 * explNeither / sh).toFixed(1)}% |`);
  md.push('');
  md.push(`## 参数不一致样例（最多 30）`);
  for (const c of report.paramsDifferentSamples.slice(0, 30)) {
    md.push(`- \`${c.subsystem}${c.code}\``);
    for (const d of c.paramDiffs) {
      md.push(`  - ${d.field}: S1=\`${d.series1 || '(空)'}\` | S2=\`${d.series2 || '(空)'}\``);
    }
    md.push(`  - S1 short: ${c.series1.short_message || '(空)'}`);
    md.push(`  - S2 short: ${c.series2.short_message || '(空)'}`);
  }
  md.push('');
  md.push(`## 含义不同样例（最多 30）`);
  for (const c of report.meaningDifferentSamples.slice(0, 30)) {
    md.push(`- \`${c.subsystem}${c.code}\``);
    md.push(`  - S1: ${c.series1.short_message || c.series1.detail || '(空)'}`);
    md.push(`  - S2: ${c.series2.short_message || c.series2.detail || '(空)'}`);
    md.push(`  - 参数一致: ${c.paramsSame ? '是' : '否'}`);
  }
  md.push('');
  md.push(`完整 JSON: ${jsonPath}`);

  fs.writeFileSync(summaryPath, md.join('\n'), 'utf8');
  console.log(JSON.stringify({
    summaryPath,
    jsonPath,
    counts: report.counts,
    sharedStats: report.sharedStats
  }, null, 2));

  await sequelize.close();
})().catch(async (e) => {
  console.error(e);
  try { await sequelize.close(); } catch (_) {}
  process.exit(1);
});
