// 轻量级中文自然语言 -> 高级筛选表达式 解析器
// 目标：将用户输入的中文查询句子解析为 { logic, conditions } 结构
// 说明：
// - 为了零依赖与可移植性，此处采用规则/正则法，而非重型NLP依赖
// - 覆盖常见表达：包含/不包含、等于/不等于、大于/小于、介于/在X到Y之间、正则、IN集合
// - 逻辑词：且/并且 -> AND；或/或者 -> OR
// - 字段同义词：错误码/故障码 -> error_code；释义/描述/内容 -> explanation；参数1..4/p1..p4 -> param1..4；时间/起止时间 -> timestamp

const path = require('path');
const fs = require('fs');
const { segment, segmentAsync, analyze } = require('./segmenter');
const { loadConfig: loadNlpConfig } = require('./hanlpClient');

let MAPPINGS_CACHE = null;
function loadMappings() {
  if (MAPPINGS_CACHE) return MAPPINGS_CACHE;
  try {
    const p = path.join(__dirname, '../config/nlpMappings.json');
    const raw = fs.readFileSync(p, 'utf-8');
    MAPPINGS_CACHE = JSON.parse(raw);
  } catch (_) {
    MAPPINGS_CACHE = null;
  }
  return MAPPINGS_CACHE;
}

let NLP_DEBUG = null;
function isNlpDebugEnabled() {
  if (NLP_DEBUG != null) return NLP_DEBUG;
  try {
    const p = path.join(__dirname, '../config/nlpConfig.json');
    const raw = fs.readFileSync(p, 'utf-8');
    const cfg = JSON.parse(raw);
    NLP_DEBUG = !!cfg.debug;
  } catch (_) {
    NLP_DEBUG = false;
  }
  return NLP_DEBUG;
}

function loadNlpRuntimeConfig() {
  try {
    const p = path.join(__dirname, '../config/nlpConfig.json');
    const raw = fs.readFileSync(p, 'utf-8');
    const cfg = JSON.parse(raw);
    return cfg || {};
  } catch (_) {
    return {};
  }
}

function normalizeByMappings(text) {
  return String(text || '')
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .replace(/[，]/g, ',')
    .replace(/[。]/g, '.')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[：]/g, ':')
    .replace(/[；]/g, ';')
    .trim();
}

function buildFieldSynonyms() {
  const cfg = loadMappings();
  if (!cfg || !cfg.fields) return [];
  const list = [];
  for (const [field, arr] of Object.entries(cfg.fields)) {
    const re = new RegExp('(' + arr.map(a => escapeRegExp(a)).join('|') + ')', 'i');
    list.push({ re, field });
  }
  return list;
}

const FIELD_SYNONYMS = buildFieldSynonyms();

function normalizeField(token) {
  if (!token) return null;
  for (const m of FIELD_SYNONYMS) {
    if (m.re.test(token)) return m.field;
  }
  return null;
}

function parseNumber(val) {
  if (val == null) return null;
  const n = Number(String(val).trim());
  return Number.isNaN(n) ? null : n;
}

function parseDateLike(s) {
  if (!s) return null;
  // 允许 2025-08-01 10:00:00 / 2025/08/01 10:00 / 10:00 / 10:00:00
  const str = String(s).trim();
  // 若只有时:分，回传字符串以便前端/后端再精确处理
  const d = new Date(str.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-'));
  if (!isNaN(d.getTime())) return d;
  return null;
}

function extractBetweenValues(text) {
  // 匹配 X 到 Y / 介于 X 与 Y 之间 / 在 X - Y 之间
  const m = text.match(/(?:从|在)?\s*([^,，\s]+)\s*(?:到|\-|~|至|与)\s*([^,，\s]+)(?:\s*之间)?/);
  if (!m) return null;
  return [m[1], m[2]];
}

function splitByLogic(text) {
  // 用 保留分隔符 的方式拆分 AND/OR 段落
  const parts = [];
  const regex = /(\s*(?:且|并且|and)\s*|\s*(?:或|或者|or)\s*)/i;
  let rest = text;
  let match;
  let lastLogic = null;
  while ((match = regex.exec(rest)) !== null) {
    const idx = match.index;
    const left = rest.slice(0, idx).trim();
    if (left) parts.push({ text: left, logicToNext: null });
    const logicWord = match[0];
    lastLogic = /(或|或者|or)/i.test(logicWord) ? 'OR' : 'AND';
    rest = rest.slice(idx + logicWord.length);
    // 标记上一段与下一段的连接逻辑
    if (parts.length > 0) parts[parts.length - 1].logicToNext = lastLogic;
  }
  const tail = rest.trim();
  if (tail) parts.push({ text: tail, logicToNext: null });
  return parts;
}

function buildCondition(field, operator, value) {
  if (!field || !operator) return null;
  return { field, operator, value };
}

function tryPatternRules(clause) {
  const cfg = loadMappings();
  if (!cfg || !Array.isArray(cfg.patterns)) return null;
  // 仅在模式允许的情况下启用 patterns
  try {
    const plc = loadNlpConfig() || {};
    const mode = String(plc.parserMode || 'hybrid').toLowerCase();
    if (mode === 'mappings-only') {
      // 在 mappings-only 模式下，patterns 仍可用；此判断留空以明确意图
    }
  } catch (_) {}
  const buildFromTemplate = (tmpl, m) => {
    if (!tmpl || typeof tmpl !== 'object') return null;
    if (tmpl.logic && Array.isArray(tmpl.conditions)) {
      const children = tmpl.conditions
        .map(child => buildFromTemplate(child, m))
        .filter(Boolean);
      if (children.length === 0) return null;
      return { logic: tmpl.logic, conditions: children };
    }
    // leaf condition template
    const field = tmpl.field;
    const operator = tmpl.operator || 'contains';
    let value = tmpl.value;
    if (tmpl.value_from_group != null) {
      const gi = parseInt(String(tmpl.value_from_group), 10);
      value = m[gi];
    }
    if (tmpl.transform === 'int' && value != null) {
      const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
      if (!Number.isNaN(n)) value = n;
    }
    if (tmpl.value_from_lookup && cfg.lookups) {
      const table = String(tmpl.value_from_lookup.table || '');
      const keyGroup = parseInt(String(tmpl.value_from_lookup.key_from_group || 0), 10);
      const key = m[keyGroup];
      const map = cfg.lookups[table] || {};
      const mapped = map[String(key)] || map[String(parseInt(String(key), 10))];
      value = mapped != null ? mapped : (tmpl.value_from_lookup.default ?? value);
    }
    return buildCondition(field, operator, value);
  };
  for (const rule of cfg.patterns) {
    try {
      const re = new RegExp(rule.regex, 'i');
      const m = clause.match(re);
      if (!m) continue;
      if (rule.group) {
        const node = buildFromTemplate(rule.group, m);
        if (node) return node;
      } else if (Array.isArray(rule.conditions)) {
        const conditions = [];
        for (const tmpl of rule.conditions) {
          const cond = buildFromTemplate(tmpl, m);
          if (cond) conditions.push(cond);
        }
        if (conditions.length > 0) {
          return { logic: 'AND', conditions };
        }
      }
    } catch (_) { /* ignore bad rule */ }
  }
  return null;
}

function parseClauseToCondition(clause) {
  // 若启用 mappings-only，则不走规则解析，直接回退到 explanation contains
  try {
    const plc = loadNlpConfig() || {};
    const mode = String(plc.parserMode || 'hybrid').toLowerCase();
    if (mode === 'mappings-only') {
      return buildCondition('explanation', 'contains', clause);
    }
  } catch (_) {}
  // 首次/第一个/第一次 + 可选故障码：提取故障码并标记 firstof（作用于 error_code）
  try {
    const mFirst = clause.match(/(第一次|首次|第一个)[^\w]*?(?:触发|出现)?[^0-9a-zA-Z]*([0-9a-fA-F]{3,6})?/);
    if (mFirst) {
      const code = mFirst[2] ? String(mFirst[2]).toLowerCase() : null;
      if (code) {
        return {
          logic: 'AND',
          conditions: [
            // 日志中的 error_code 通常为“子系统 + 后4位”，因此使用后缀匹配更稳
            { field: 'error_code', operator: 'endswith', value: code },
            { field: 'error_code', operator: 'firstof', value: null }
          ]
        };
      }
      // 没有显式故障码，仅设置 firstof 标志
      return { field: 'error_code', operator: 'firstof', value: null };
    }
  } catch (_) { /* ignore */ }

  // 优先规则："X相关的(日志|记录|释义|内容)" => explanation contains 所有关键词（AND）
  try {
    const mRel = clause.match(/(.+?)\s*相关的\s*(日志|记录|释义|内容)/);
    if (mRel && mRel[1]) {
      const core = mRel[1].trim();
      // 优先按连接词与标点分割，保留原短语，不依赖分词器，避免将“状态机”切成“状态/机”
      const parts = String(core)
        .split(/\s+|[,，、]+|(?:和|与|及|以及|并且)/)
        .map(s => s.trim())
        .filter(Boolean);
      const stop = new Set(['相关', '的', '日志', '记录', '释义', '内容', '和', '与', '及', '以及', '并且']);
      const tokens = Array.from(new Set(parts.filter(t => t && !stop.has(t))));
      if (tokens.length > 0) {
        return {
          logic: 'AND',
          conditions: tokens.map(tok => ({ field: 'explanation', operator: 'contains', value: tok }))
        };
      }
      // 若无可用token，回退为整句 contains
      return { field: 'explanation', operator: 'contains', value: core };
    }
  } catch (_) { /* ignore */ }

  // 1) field detection
  const field = normalizeField(clause);
  // 2) operator + value parsing
  // 优先处理 between
  if (/介于|之间/.test(clause) || /到|至|~|\-/.test(clause) && /在|从/.test(clause)) {
    const vals = extractBetweenValues(clause);
    if (vals && field) {
      const [a, b] = vals;
      // 日期或数值自动判断
      const da = parseDateLike(a);
      const db = parseDateLike(b);
      if (da && db) return buildCondition(field, 'between', [da, db]);
      const na = parseNumber(a);
      const nb = parseNumber(b);
      if (na != null && nb != null) return buildCondition(field, 'between', [na, nb]);
      return buildCondition(field, 'between', [a, b]);
    }
  }

  // 包含/不包含（加入“相关/有关/关于”）
  if (/不包含|不含|不包括/.test(clause) && field) {
    const m = clause.match(/不(?:包含|包括|含)\s*[“"'‘’《》（）()【】]?([^，。,\.\s"'“”]+)[”"'‘’》）)】]?/);
    if (m) return buildCondition(field, 'notcontains', m[1]);
  }
  if (/(包含|包括|含|like|相关|有关|关于)/i.test(clause) && field) {
    const m = clause.match(/(?:包含|包括|含|like|相关|有关|关于)\s*[“"'‘’《》（）()【】]?([^，。,\.\s"'“”]+)[”"'‘’》）)】]?/i);
    if (m) return buildCondition(field, 'contains', m[1]);
  }

  // 等于/不等于
  if (/(不等于|不为|!=|<>)/.test(clause) && field) {
    const m = clause.match(/(?:不等于|不为|!=|<>)\s*([^，。,\s]+)/);
    if (m) return buildCondition(field, '!=', normalizeScalar(m[1]));
  }
  if (/(等于|为|=)/.test(clause) && field) {
    const m = clause.match(/(?:等于|为|=)\s*([^，。,\s]+)/);
    if (m) return buildCondition(field, '=', normalizeScalar(m[1]));
  }

  // 比较：大于/小于/大于等于/小于等于
  if (/大于等于|>=/.test(clause) && field) {
    const m = clause.match(/(?:大于等于|>=)\s*([^，。,\s]+)/);
    if (m) return buildCondition(field, '>=', toNumberOrSelf(m[1]));
  }
  if (/小于等于|<=/.test(clause) && field) {
    const m = clause.match(/(?:小于等于|<=)\s*([^，。,\s]+)/);
    if (m) return buildCondition(field, '<=', toNumberOrSelf(m[1]));
  }
  if (/大于|>/.test(clause) && field) {
    const m = clause.match(/(?:大于|>)\s*([^，。,\s]+)/);
    if (m) return buildCondition(field, '>', toNumberOrSelf(m[1]));
  }
  if (/小于|</.test(clause) && field) {
    const m = clause.match(/(?:小于|<)\s*([^，。,\s]+)/);
    if (m) return buildCondition(field, '<', toNumberOrSelf(m[1]));
  }

  // IN：属于/之一/在{...}中
  if (/(属于|之一|之一为|在.*(集合|列表|\{))/i.test(clause) && field) {
    // 提取逗号分隔值
    const m = clause.match(/(?:属于|之一为|之一|在)\s*[\{\[]?([^\}\]，。]*)[\}\]]?/i);
    if (m) {
      const arr = String(m[1] || '')
        .split(/[,，\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
      if (arr.length > 0) return buildCondition(field, 'in', arr);
    }
  }

  // 时间范围（专门匹配：时间在 A 到 B / 从A到B）
  if (/时间|timestamp|起止时间/.test(clause)) {
    const vals = extractBetweenValues(clause);
    if (vals) {
      const a = parseDateLike(vals[0]);
      const b = parseDateLike(vals[1]);
      if (a && b) return buildCondition('timestamp', 'between', [a, b]);
      return buildCondition('timestamp', 'between', vals);
    }
  }

  // 回退：若识别到字段但没有操作符，默认 contains 其余词
  if (field) {
    const cleaned = clause.replace(/(错误码|故障码|code|释义|描述|内容|explanation|时间|起止时间|timestamp|参数\s*\d|参\s*\d|p\d)/ig, '').trim();
    if (cleaned) return buildCondition(field, 'contains', cleaned);
    return buildCondition(field, 'contains', clause);
  }
  // 无字段：若切词有多个关键词，则按 OR 合并到 explanation contains
  try {
    const rawTokens = segment(clause) || [];
    const stop = new Set(['相关', '的', '日志', '记录', '释义', '内容', '和', '与', '及', '以及', '并且']);
    const tokens = Array.from(new Set(rawTokens
      .map(t => String(t).trim())
      .filter(t => t && !stop.has(t))));
    if (tokens.length >= 2) {
      return { logic: 'OR', conditions: tokens.map(tok => ({ field: 'explanation', operator: 'contains', value: tok })) };
    }
  } catch (_) { /* ignore */ }
  // 无字段且无有效多词切分，默认落到 explanation contains 全句
  return buildCondition('explanation', 'contains', clause);
}

function normalizeScalar(raw) {
  const n = parseNumber(raw);
  if (n != null) return n;
  return String(raw).replace(/^['"“”‘’]|['"“”‘’]$/g, '');
}

function toNumberOrSelf(raw) {
  const n = parseNumber(raw);
  return n != null ? n : raw;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNaturalLanguageToFilters(inputText) {
  const text = normalizeByMappings(inputText);
  if (!text) return { logic: 'AND', conditions: [] };

  const parts = splitByLogic(text);
  // 预切词（备用）：可作为后续文法/模板的辅助特征
  const tokens = segment(text);
  if (isNlpDebugEnabled()) {
    try {
      console.log('[NLP] tokens:', Array.isArray(tokens) ? tokens : String(tokens));
      analyze(text)
        .then((nlp) => {
          try {
            console.log('[NLP] hanlp.tokens:', nlp && Array.isArray(nlp.tokens) ? nlp.tokens : null);
            console.log('[NLP] hanlp.pos:', nlp && Array.isArray(nlp.pos) ? nlp.pos : null);
            console.log('[NLP] hanlp.ner:', nlp && Array.isArray(nlp.ner) ? nlp.ner : null);
            console.log('[NLP] hanlp.dep:', nlp && nlp.dep ? nlp.dep : null);
            console.log('[NLP] hanlp.keywords:', nlp && Array.isArray(nlp.keywords) ? nlp.keywords : null);
          } catch (_) { /* ignore */ }
        })
        .catch(() => {});
    } catch (_) { /* ignore */ }
  }
  const top = { logic: 'AND', conditions: [] };
  let currentGroup = top;
  let pendingLogic = 'AND';

  for (const [idx, part] of parts.entries()) {
    const clause = part.text;
    let cond = null;
    const ruleNode = tryPatternRules(clause);
    if (ruleNode) {
      cond = ruleNode;
    } else {
      cond = parseClauseToCondition(clause);
    }
    if (cond) {
      // 根据与下一段之间的逻辑，可能需要拆分为 OR 组
      if (idx === 0) {
        currentGroup.conditions.push(cond);
      } else {
        if (pendingLogic === 'OR') {
          // 将最近一个条件与当前条件合并为 OR 子组
          const last = currentGroup.conditions.pop();
          currentGroup.conditions.push({ logic: 'OR', conditions: [last, cond] });
        } else {
          currentGroup.conditions.push(cond);
        }
      }
    }
    pendingLogic = part.logicToNext || 'AND';
  }

  return top;
}

module.exports = {
  parseNaturalLanguageToFilters,
  // 预留的异步版本：当前返回与同步一致的结果，后续可在此接入 HanLP 高级分析增强解析
  parseNaturalLanguageToFiltersAsync: async function parseNaturalLanguageToFiltersAsync(inputText) {
    try {
      const text = normalizeByMappings(inputText);
      // 先用现有同步规则解析，得到基础 AST
      let ast = parseNaturalLanguageToFilters(text);

      // HanLP 综合分析（tokens/pos/ner/dep/keywords）
      let nlp = null;
      try { nlp = await analyze(text); } catch (_) { nlp = null; }

      // 使用关键词增强 explanation contains：将长句 contains 改写为关键词 OR contains
      const runtimeCfg = loadNlpRuntimeConfig();
      const enableHeuristics = runtimeCfg.enableHeuristics !== false;
      if (enableHeuristics && nlp && Array.isArray(nlp.keywords) && nlp.keywords.length >= 2) {
        const stop = new Set(['相关', '的', '日志', '记录', '释义', '内容']);
        const kws = Array.from(new Set(nlp.keywords.map(String).filter(k => k && !stop.has(k))))
          .sort((a, b) => b.length - a.length);

        const enhanceNode = (node) => {
          if (!node) return node;
      if (Array.isArray(node)) return node.map(enhanceNode);
          if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
            return { logic: node.logic, conditions: node.conditions.map(enhanceNode) };
          }
          // 仅改写 explanation contains 的长文本
          if (node && node.field === 'explanation' && (node.operator === 'contains' || node.operator === 'like')) {
            const val = String(node.value || '').trim();
            if (val && val.length >= 6) {
          const hit = kws.filter(k => val.includes(k));
              if (hit.length >= 2) {
            return { logic: 'OR', conditions: hit.map(k => ({ field: 'explanation', operator: 'contains', value: k })) };
              }
            }
          }
          return node;
        };
        ast = enhanceNode(ast);
      }

      // NER 辅助：若识别到显式时间实体对（简单匹配 yyyy-mm-dd 或 yyyy/mm/dd），作为 timestamp between 追加条件
      try {
        const times = [];
        const addTime = (s) => { if (s && /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(s)) times.push(s); };
        if (enableHeuristics && nlp && Array.isArray(nlp.ner)) {
          for (const ent of nlp.ner) {
            // 兼容可能的多种返回格式：[start,end,label,span] 或 {text,label} 或 {span,label}
            const span = Array.isArray(ent) ? ent[3] : (ent && (ent.text || ent.span));
            const label = Array.isArray(ent) ? ent[2] : (ent && ent.label);
            if (label && /TIME|DATE|TIME|t?ime|date/i.test(String(label))) addTime(String(span || ''));
          }
        }
        if (times.length >= 2) {
          const a = parseDateLike(times[0]);
          const b = parseDateLike(times[1]);
          if (a && b) {
            // 以 AND 追加一个时间 between，不破坏已有条件
            if (ast && ast.conditions && ast.logic) {
              ast.conditions.push({ field: 'timestamp', operator: 'between', value: [a, b] });
            }
          }
        }
      } catch (_) { /* ignore */ }

      // POS/依存 + NER 辅助：覆盖更多复合句式（简单 SVO 窗口启发式）
      try {
        if (!enableHeuristics) {
          // 跳过启发式增强
          return dedupeAst(ast);
        }
        const cfg = loadMappings() || {};
        const operatorMap = cfg.operators || {};
        const operatorIndex = [];
        const tokensArr = Array.isArray(nlp?.tokens) ? nlp.tokens.map(String) : [];
        const posArr = Array.isArray(nlp?.pos) ? nlp.pos.map(String) : [];

        const allOpPairs = Object.entries(operatorMap).map(([norm, arr]) => [norm, (arr || []).map(String)]);
        const detectOp = (tok) => {
          const s = String(tok || '').toLowerCase();
          for (const [norm, syns] of allOpPairs) {
            if (syns.some(x => s.includes(String(x).toLowerCase()))) return norm;
          }
          return null;
        };

        const findFieldLeft = (i) => {
          for (let j = i - 1; j >= 0 && j >= i - 4; j -= 1) {
            const t = tokensArr[j];
            const f = normalizeField(t);
            if (f) return { field: f, valueHint: t };
            // 工具臂/arm 映射到 explanation contains（领域定向）
            const m = String(t).match(/(?:(\d+)号臂|臂(\d+)|arm\s*(\d+))/i);
            if (m) {
              const armNo = m[1] || m[2] || m[3];
              return { field: 'explanation', valueHint: `${armNo}号臂` };
            }
          }
          return null;
        };

        const isValuePos = (p) => {
          const tag = String(p || '').toLowerCase();
          return tag.startsWith('n') || tag === 'm' || tag === 'mq' || tag === 'eng' || tag === 'x';
        };

        const collectRightValue = (i) => {
          const vals = [];
          for (let k = i + 1; k < tokensArr.length && k <= i + 6; k += 1) {
            const tok = tokensArr[k];
            const pos = posArr[k];
            if (!tok) break;
            if (!pos || isValuePos(pos)) {
              // 截断到分隔符（逗号/句点/连接词）
              if (/^[,，。.;；]$/.test(tok)) break;
              vals.push(tok);
              // between：在窗口内尝试识别两个值
              if (vals.length >= 4) break;
            } else {
              break;
            }
          }
          return vals.join('').trim();
        };

        // 从 NER 中提取额外的领域实体（工具臂、器械、部位）到 explanation contains
        const nerDrivenConds = [];
        if (Array.isArray(nlp?.ner)) {
          for (const ent of nlp.ner) {
            const span = Array.isArray(ent) ? ent[3] : (ent && (ent.text || ent.span));
            const s = String(span || '').trim();
            if (!s) continue;
            if (/(\d+号臂|臂\d+|arm\s*\d+)/i.test(s)) {
              const m = s.match(/(\d+)(?:号臂)?|(?:臂)(\d+)|arm\s*(\d+)/i);
              const armNo = (m && (m[1] || m[2] || m[3])) ? (m[1] || m[2] || m[3]) : null;
              nerDrivenConds.push({ field: 'explanation', operator: 'contains', value: armNo ? `${armNo}号臂` : s });
            } else if (/[肝胃肠胆胰肺心脑肾脾骨肌腔镜]/.test(s)) {
              nerDrivenConds.push({ field: 'explanation', operator: 'contains', value: s });
            }
          }
        }

        // 基于操作词的 SVO 启发：窗口内抓取 field 与 value
        const svoConds = [];
        for (let i = 0; i < tokensArr.length; i += 1) {
          const op = detectOp(tokensArr[i]);
          if (!op) continue;
          const fld = findFieldLeft(i);
          if (!fld) continue;
          let val = collectRightValue(i);
          if (!val) continue;
          // between：尝试拆成 A 到 B
          if (op === 'between') {
            const pair = extractBetweenValues(val) || null;
            if (pair && pair.length === 2) {
              const [a, b] = pair;
              const da = parseDateLike(a); const db = parseDateLike(b);
              if (da && db) {
                svoConds.push({ field: fld.field, operator: 'between', value: [da, db] });
                continue;
              }
              const na = parseNumber(a); const nb = parseNumber(b);
              if (na != null && nb != null) {
                svoConds.push({ field: fld.field, operator: 'between', value: [na, nb] });
                continue;
              }
              svoConds.push({ field: fld.field, operator: 'between', value: [a, b] });
              continue;
            }
          }
          // 非 between：数值尽量转数
          const num = parseNumber(val);
          const normalizedVal = num != null ? num : val;
          svoConds.push({ field: fld.field, operator: op, value: normalizedVal });
        }

        const extraConds = [...nerDrivenConds, ...svoConds].filter(Boolean);
        if (extraConds.length > 0) {
          if (!ast || (!ast.conditions && !ast.logic)) {
            ast = { logic: 'AND', conditions: [] };
          }
          if (!ast.conditions) ast.conditions = [];
          ast.conditions.push(...extraConds);
        }
      } catch (_) { /* ignore */ }

      return dedupeAst(ast);
    } catch (e) {
      return { logic: 'AND', conditions: [] };
    }
  }
};

function dedupeAst(node) {
  if (!node) return node;
  if (Array.isArray(node)) return node.map(dedupeAst);
  if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
    const child = node.conditions.map(dedupeAst).filter(Boolean);
    const seen = new Set();
    const result = [];
    for (const c of child) {
      if (c && c.field && c.operator) {
        const key = `${c.field}::${String(c.operator).toLowerCase()}::${serializeValue(c.value)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(c);
      } else if (c && c.conditions) {
        // 组去重通过递归内层处理；此处不以 key 去重组，避免误删逻辑结构
        result.push(c);
      }
    }
    // 简单合并 OR 下 explanation contains 的重复
    if (node.logic === 'OR') {
      const explValues = new Set();
      const merged = [];
      for (const c of result) {
        if (c.field === 'explanation' && (c.operator === 'contains' || c.operator === 'like')) {
          const v = String(c.value || '');
          if (explValues.has(v)) continue;
          explValues.add(v);
          merged.push(c);
        } else {
          merged.push(c);
        }
      }
      return { logic: node.logic, conditions: merged };
    }
    return { logic: node.logic, conditions: result };
  }
  return node;
}

function serializeValue(v) {
  if (v == null) return 'null';
  if (Array.isArray(v)) return v.map(serializeValue).join('::');
  if (v instanceof Date) return String(v.getTime());
  return String(v);
}


