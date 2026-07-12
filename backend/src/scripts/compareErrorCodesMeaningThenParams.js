/**
 * 两系列故障码：先判含义是否同一，再仅对同含义码比对参数。
 * 输出 exports/error-codes-meaning-then-params-*.{json,md}
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

function normLoose(v) {
  return normText(v)
    .toLowerCase()
    .replace(/[，。；;、\s]/g, '')
    .replace(/的/g, '');
}

function meaningOf(row) {
  const sm = normText(row.short_message);
  if (sm) return { text: sm, source: 'short_message' };
  const d = normText(row.detail);
  if (d) return { text: d.slice(0, 200), source: 'detail' };
  return { text: '', source: 'empty' };
}

function sameMeaning(a, b) {
  const ma = meaningOf(a);
  const mb = meaningOf(b);
  if (!ma.text && !mb.text) return { same: false, reason: 'both_empty', ma, mb };
  if (!ma.text || !mb.text) return { same: false, reason: 'one_empty', ma, mb };
  if (ma.text === mb.text) return { same: true, reason: 'exact', ma, mb };
  if (normLoose(ma.text) === normLoose(mb.text)) return { same: true, reason: 'normalized', ma, mb };
  // 极近：一方包含另一方且较短方长度>=4
  const na = normLoose(ma.text);
  const nb = normLoose(mb.text);
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) {
    return { same: true, reason: 'contains', ma, mb };
  }
  return { same: false, reason: 'different', ma, mb };
}

function normParam(v) {
  return normText(v).toLowerCase().replace(/\s+/g, ' ');
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

function classifyParamDiff(diffs, a, b) {
  const empty = (r) => !normParam(r.param1) && !normParam(r.param2) && !normParam(r.param3) && !normParam(r.param4);
  if (empty(b) && !empty(a)) return 'series2_all_empty';
  if (empty(a) && !empty(b)) return 'series1_all_empty';

  // 仅用词近义差异（指令↔期望）且字段一一对应
  const synonymPairs = [
    ['指令', '期望'],
    ['指令位置', '期望位置'],
    ['指令速度', '期望速度']
  ];
  const isSynonym = (x, y) => {
    const nx = normParam(x);
    const ny = normParam(y);
    if (nx === ny) return true;
    for (const [p, q] of synonymPairs) {
      if ((nx.includes(p) && ny.includes(q)) || (nx.includes(q) && ny.includes(p))) {
        // 去掉指令/期望后剩余大致相同
        const rx = nx.replace(/指令|期望/g, '');
        const ry = ny.replace(/指令|期望/g, '');
        if (rx === ry || rx.includes(ry) || ry.includes(rx)) return true;
      }
    }
    return false;
  };

  if (diffs.length > 0 && diffs.every((d) => isSynonym(d.series1, d.series2))) {
    return 'wording_synonym';
  }
  return 'semantic_or_slot_mismatch';
}

(async () => {
  defineAssociations();

  const [seriesNames] = await sequelize.query(`
    SELECT id, series_code, series_name_zh FROM device_series_dict WHERE id IN (1,2) ORDER BY id
  `);

  const [rows] = await sequelize.query(`
    SELECT
      ec.id, ec.series_id, ec.subsystem, ec.code,
      i.short_message, i.detail, i.param1, i.param2, i.param3, i.param4,
      CASE WHEN i.explanation IS NULL OR TRIM(i.explanation)='' THEN 0 ELSE 1 END AS has_explanation
    FROM error_codes ec
    LEFT JOIN i18n_error_codes i ON i.error_code_id = ec.id AND i.lang='zh'
    WHERE ec.series_id IN (1,2)
  `);

  const bySeries = { 1: new Map(), 2: new Map() };
  for (const r of rows) {
    bySeries[r.series_id].set(`${r.subsystem}||${r.code}`, r);
  }

  const both = [...bySeries[1].keys()].filter((k) => bySeries[2].has(k)).sort();

  const sameMeaningSameParams = [];
  const sameMeaningDiffParams = [];
  const differentMeaning = [];
  const meaningEmpty = [];

  const paramClassCount = {
    series2_all_empty: 0,
    series1_all_empty: 0,
    wording_synonym: 0,
    semantic_or_slot_mismatch: 0
  };

  for (const key of both) {
    const a = bySeries[1].get(key);
    const b = bySeries[2].get(key);
    const [subsystem, code] = key.split('||');
    const m = sameMeaning(a, b);

    const item = {
      subsystem,
      code,
      fault_key: `${subsystem}${code}`,
      meaningReason: m.reason,
      meaning1: m.ma.text,
      meaning2: m.mb.text,
      series1: {
        id: a.id,
        param1: a.param1 || '',
        param2: a.param2 || '',
        param3: a.param3 || '',
        param4: a.param4 || '',
        has_explanation: Number(a.has_explanation) === 1
      },
      series2: {
        id: b.id,
        param1: b.param1 || '',
        param2: b.param2 || '',
        param3: b.param3 || '',
        param4: b.param4 || '',
        has_explanation: Number(b.has_explanation) === 1
      }
    };

    if (m.reason === 'both_empty' || m.reason === 'one_empty') {
      meaningEmpty.push(item);
      continue;
    }

    if (!m.same) {
      differentMeaning.push(item);
      continue;
    }

    // 同含义 → 比参数
    const diffs = paramDiff(a, b);
    if (diffs.length === 0) {
      sameMeaningSameParams.push(item);
    } else {
      const cls = classifyParamDiff(diffs, a, b);
      paramClassCount[cls] += 1;
      sameMeaningDiffParams.push({
        ...item,
        paramClass: cls,
        paramDiffs: diffs
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    method: [
      'Step1: 用 zh short_message（空则 detail）判断是否同一含义（精确 / 去标点归一 / 包含关系）',
      'Step2: 仅对同含义码比较 param1-4 是否一致，并分类差异'
    ],
    series: seriesNames,
    sharedTotal: both.length,
    step1: {
      sameMeaning: sameMeaningSameParams.length + sameMeaningDiffParams.length,
      differentMeaning: differentMeaning.length,
      meaningIncomplete: meaningEmpty.length
    },
    step2_onlySameMeaning: {
      paramsConsistent: sameMeaningSameParams.length,
      paramsInconsistent: sameMeaningDiffParams.length,
      inconsistentBreakdown: paramClassCount
    },
    sameMeaningSameParams,
    sameMeaningDiffParams,
    differentMeaning,
    meaningEmpty
  };

  const outDir = path.resolve(__dirname, '../../../exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(outDir, `error-codes-meaning-then-params-${stamp}.json`);
  const mdPath = path.join(outDir, `error-codes-meaning-then-params-${stamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const s1 = sameMeaningSameParams.length + sameMeaningDiffParams.length;
  const md = [];
  md.push('# 两系列故障码：先含义、后参数');
  md.push('');
  md.push(`生成时间: ${report.generatedAt}`);
  md.push('');
  md.push('## 方法');
  report.method.forEach((x) => md.push(`- ${x}`));
  md.push('');
  md.push('## Step1 是否同一含义（共有同码）');
  md.push(`| 分类 | 数量 | 占共有(${both.length}) |`);
  md.push('|---|---|---|');
  md.push(`| 同一含义 | ${s1} | ${((100 * s1) / both.length).toFixed(1)}% |`);
  md.push(`| 含义不同 | ${differentMeaning.length} | ${((100 * differentMeaning.length) / both.length).toFixed(1)}% |`);
  md.push(`| 含义文本缺失（一侧/两侧空） | ${meaningEmpty.length} | ${((100 * meaningEmpty.length) / both.length).toFixed(1)}% |`);
  md.push('');
  md.push('## Step2 仅「同一含义」时的参数核对');
  md.push(`| 分类 | 数量 | 占同含义(${s1 || 1}) |`);
  md.push('|---|---|---|');
  md.push(`| 参数一致 | ${sameMeaningSameParams.length} | ${((100 * sameMeaningSameParams.length) / (s1 || 1)).toFixed(1)}% |`);
  md.push(`| 参数不一致 | ${sameMeaningDiffParams.length} | ${((100 * sameMeaningDiffParams.length) / (s1 || 1)).toFixed(1)}% |`);
  md.push('');
  md.push('### 参数不一致细分');
  md.push(`| 类型 | 数量 | 说明 |`);
  md.push('|---|---|---|');
  md.push(`| series2_all_empty | ${paramClassCount.series2_all_empty} | 同含义，但 SA 四参数全空 |`);
  md.push(`| wording_synonym | ${paramClassCount.wording_synonym} | 多为「指令/期望」用词差，槽位大体对应 |`);
  md.push(`| semantic_or_slot_mismatch | ${paramClassCount.semantic_or_slot_mismatch} | 参数含义或槽位映射不同 |`);
  md.push(`| series1_all_empty | ${paramClassCount.series1_all_empty} | 同含义，但 SR 四参数全空 |`);
  md.push('');

  md.push('## 同含义但参数语义/槽位不一致（重点，最多 40）');
  sameMeaningDiffParams
    .filter((x) => x.paramClass === 'semantic_or_slot_mismatch')
    .slice(0, 40)
    .forEach((x) => {
      md.push(`- \`${x.fault_key}\` 含义: ${x.meaning1}`);
      x.paramDiffs.forEach((d) => {
        md.push(`  - ${d.field}: SR=\`${d.series1 || '(空)'}\` | SA=\`${d.series2 || '(空)'}\``);
      });
    });
  md.push('');

  md.push('## 同含义但仅用词差异（指令/期望，最多 20）');
  sameMeaningDiffParams
    .filter((x) => x.paramClass === 'wording_synonym')
    .slice(0, 20)
    .forEach((x) => {
      md.push(`- \`${x.fault_key}\` ${x.meaning1}`);
      x.paramDiffs.forEach((d) => {
        md.push(`  - ${d.field}: \`${d.series1}\` vs \`${d.series2}\``);
      });
    });
  md.push('');

  md.push('## 含义不同样例（最多 30，不做参数结论）');
  differentMeaning.slice(0, 30).forEach((x) => {
    md.push(`- \`${x.fault_key}\``);
    md.push(`  - SR: ${x.meaning1 || '(空)'}`);
    md.push(`  - SA: ${x.meaning2 || '(空)'}`);
  });
  md.push('');
  md.push(`完整 JSON: ${jsonPath}`);

  fs.writeFileSync(mdPath, md.join('\n'), 'utf8');
  console.log(JSON.stringify({
    mdPath,
    jsonPath,
    sharedTotal: both.length,
    step1: report.step1,
    step2: report.step2_onlySameMeaning
  }, null, 2));

  await sequelize.close();
})().catch(async (e) => {
  console.error(e);
  try { await sequelize.close(); } catch (_) {}
  process.exit(1);
});
