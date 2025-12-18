const fs = require('fs');
const path = require('path');

// 加载转义表
const faultMappingsPath = path.join(__dirname, '../config/FaultMappings.json');
let faultMappings = null;

// 加载单位换算表（可选）
const unitMappingsPath = path.join(__dirname, '../config/unitMappings.json');
let unitMappings = null;

// 加载前缀规则
const prefixMappingsPath = path.join(__dirname, '../config/prefixMappings.json');
let prefixMappings = null;

function loadFaultMappings() {
  if (!faultMappings) {
    try {
      const mappingsContent = fs.readFileSync(faultMappingsPath, 'utf-8');
      faultMappings = JSON.parse(mappingsContent);
    } catch (error) {
      console.error('加载转义表失败:', error);
      faultMappings = {};
    }
  }
  return faultMappings;
}

function loadUnitMappings() {
  if (!unitMappings) {
    try {
      const content = fs.readFileSync(unitMappingsPath, 'utf-8');
      unitMappings = JSON.parse(content);
    } catch (error) {
      // 允许没有配置文件，提供常见的默认换算
      unitMappings = {
        'ms->s': 0.001,
        's->ms': 1000,
        'us->ms': 0.001,
        'ms->us': 1000,
        'mm->cm': 0.1,
        'cm->mm': 10,
        'cm->m': 0.01,
        'm->cm': 100,
        'mm->m': 0.001,
        'm->mm': 1000,
        'deg->rad': Math.PI / 180,
        'rad->deg': 180 / Math.PI
      };
    }
  }
  return unitMappings;
}

function loadPrefixMappings() {
  if (!prefixMappings) {
    try {
      const content = fs.readFileSync(prefixMappingsPath, 'utf-8');
      prefixMappings = JSON.parse(content);
    } catch (error) {
      // 默认配置（与先前硬编码一致）
      prefixMappings = {
        enabledSubsystems: ['1','3','5','8','9','A'],
        subsystems: {},
        default: { joinWithSpace: true }
      };
    }
  }
  return prefixMappings;
}

function toNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? NaN : n;
}

function applyFilters(rawValue, filterExpr) {
  if (!filterExpr) return rawValue;
  let current = rawValue;

  const steps = filterExpr.split('|').map(s => s.trim()).filter(Boolean);
  for (const step of steps) {
    const m = step.match(/^(\w+)\((.*)\)$/);
    const name = m ? m[1] : step;
    const argStr = m ? m[2] : '';

    switch (name) {
      case 'scale': {
        const factor = Number(argStr);
        const n = toNumber(current);
        if (!Number.isNaN(n) && Number.isFinite(factor)) current = n * factor;
        break;
      }
      case 'mul': {
        const factor = Number(argStr);
        const n = toNumber(current);
        if (!Number.isNaN(n) && Number.isFinite(factor)) current = n * factor;
        break;
      }
      case 'div': {
        const divisor = Number(argStr);
        const n = toNumber(current);
        if (!Number.isNaN(n) && Number.isFinite(divisor) && divisor !== 0) current = n / divisor;
        break;
      }
      case 'round': {
        const digits = Number(argStr);
        const n = toNumber(current);
        if (!Number.isNaN(n)) {
          if (Number.isFinite(digits) && digits >= 0) {
            const p = Math.pow(10, digits);
            current = Math.round(n * p) / p;
          } else {
            current = Math.round(n);
          }
        }
        break;
      }
      case 'fixed': {
        const digits = Number(argStr);
        const n = toNumber(current);
        if (!Number.isNaN(n) && Number.isFinite(digits)) current = n.toFixed(digits);
        break;
      }
      case 'prefix': {
        const v = String(current);
        const arg = argStr.replace(/^['"]|['"]$/g, '');
        current = `${arg}${v}`;
        break;
      }
      case 'suffix': {
        const v = String(current);
        const arg = argStr.replace(/^['"]|['"]$/g, '');
        current = `${v}${arg}`;
        break;
      }
      case 'unit': {
        // 形如 unit(ms->s)
        const mapping = argStr.replace(/^['"]|['"]$/g, '');
        const units = loadUnitMappings();
        const factor = units[mapping];
        const n = toNumber(current);
        if (!Number.isNaN(n) && Number.isFinite(factor)) current = n * factor;
        break;
      }
      case 'highByte': {
        const n = toNumber(current);
        if (!Number.isNaN(n)) current = ((n >>> 8) & 0xFF);
        break;
      }
      case 'lowByte': {
        const n = toNumber(current);
        if (!Number.isNaN(n)) current = (n & 0xFF);
        break;
      }
      case 'hex': {
        // 格式化为大写十六进制，可选指定位数（左侧补0）
        const n = toNumber(current);
        if (!Number.isNaN(n)) {
          const width = Number(argStr);
          let s = Math.abs(Math.trunc(n)).toString(16).toUpperCase();
          if (Number.isFinite(width) && width > 0) s = s.padStart(width, '0');
          current = s;
        }
        break;
      }
      case 'zpad': {
        // 左侧补零至指定位数
        const width = Number(argStr);
        const s = String(current);
        if (Number.isFinite(width) && width > 0) current = s.padStart(width, '0');
        break;
      }
      case 'ascii': {
        // 将数值或由分隔的数字序列转换为 ASCII 字符串
        // 示例：ascii()，针对 65 -> 'A'；"65 66 67" -> 'ABC'
        const s = String(current).trim();
        const parts = s.split(/[,\s]+/).filter(Boolean);
        if (parts.length > 1) {
          let out = '';
          for (const p of parts) {
            const code = Number(p);
            if (Number.isFinite(code) && code >= 0 && code <= 255) out += String.fromCharCode(code);
          }
          current = out;
        } else {
          const n = Number(s);
          if (Number.isFinite(n)) {
            if (n >= 0 && n <= 255) {
              current = String.fromCharCode(n);
            } else {
              // 将 32 位整型拆成字节（大端）再转 ASCII，去除空字符
              const buf = Buffer.allocUnsafe(4);
              try {
                buf.writeUInt32BE(Math.abs(Math.trunc(n)));
                current = buf.toString('ascii').replace(/\u0000/g, '');
              } catch {
                current = s;
              }
            }
          }
        }
        break;
      }
      case 'asciiHex': {
        // 将十六进制字符串转换为 ASCII：'414243' -> 'ABC'
        const raw = String(current).trim().replace(/^0x/i, '');
        const hex = raw.replace(/[^0-9a-f]/gi, '');
        if (hex.length > 0) {
          const even = hex.length % 2 === 0 ? hex : '0' + hex;
          let out = '';
          for (let i = 0; i < even.length; i += 2) {
            const byte = parseInt(even.slice(i, i + 2), 16);
            if (Number.isFinite(byte)) out += String.fromCharCode(byte);
          }
          current = out;
        }
        break;
      }
      default: {
        // 未知过滤器，忽略
        break;
      }
    }
  }
  return current;
}

function evaluateMatchCondition(match, params, context) {
  // 支持 eq/gt/gte/lt/lte/in/between/bitAnd/regex
  const getFieldValue = (key) => {
    const k = String(key).toLowerCase();
    if (k === 'param1' || k === 'p1') return params[0];
    if (k === 'param2' || k === 'p2') return params[1];
    if (k === 'param3' || k === 'p3') return params[2];
    if (k === 'param4' || k === 'p4') return params[3];
    return context && Object.prototype.hasOwnProperty.call(context, key) ? context[key] : undefined;
  };

  for (const [field, cond] of Object.entries(match || {})) {
    const value = getFieldValue(field);
    if (cond === null || cond === undefined) continue;
    if (typeof cond !== 'object') {
      if (String(value) !== String(cond)) return false;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(cond, 'eq') && String(value) !== String(cond.eq)) return false;
    if (Object.prototype.hasOwnProperty.call(cond, 'gt') && !(toNumber(value) > Number(cond.gt))) return false;
    if (Object.prototype.hasOwnProperty.call(cond, 'gte') && !(toNumber(value) >= Number(cond.gte))) return false;
    if (Object.prototype.hasOwnProperty.call(cond, 'lt') && !(toNumber(value) < Number(cond.lt))) return false;
    if (Object.prototype.hasOwnProperty.call(cond, 'lte') && !(toNumber(value) <= Number(cond.lte))) return false;
    if (Object.prototype.hasOwnProperty.call(cond, 'in')) {
      const arr = Array.isArray(cond.in) ? cond.in.map(String) : [];
      if (!arr.includes(String(value))) return false;
    }
    if (Object.prototype.hasOwnProperty.call(cond, 'between')) {
      const [a, b] = cond.between || [];
      const n = toNumber(value);
      if (Number.isNaN(n) || n < Number(a) || n > Number(b)) return false;
    }
    if (Object.prototype.hasOwnProperty.call(cond, 'bitAnd')) {
      const { mask, eq } = cond.bitAnd || {};
      const n = toNumber(value);
      if (!Number.isFinite(n) || !Number.isFinite(mask)) return false;
      if (((n & Number(mask)) !== Number(eq))) return false;
    }
    if (Object.prototype.hasOwnProperty.call(cond, 'regex')) {
      const re = new RegExp(cond.regex);
      if (!re.test(String(value))) return false;
    }
  }
  return true;
}

function tryRenderRules(explanation, params, context) {
  if (!explanation) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(explanation);
  } catch (e) {
    return null;
  }
  const rules = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.rules) ? parsed.rules : null);
  if (!rules || rules.length === 0) return null;

  const ordered = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  for (const rule of ordered) {
    const match = rule.match || {};
    if (evaluateMatchCondition(match, params, context)) {
      return typeof rule.template === 'string' ? rule.template : null;
    }
  }
  const fallback = (parsed && parsed.fallback) || null;
  return typeof fallback === 'string' ? fallback : null;
}

function buildPrefixFromContext(context) {
  if (!context || !context.subsystem) return '';
  const s = String(context.subsystem).toUpperCase();
  let arm = context.arm ? String(context.arm).toUpperCase() : null;
  let joint = context.joint ? String(context.joint).toUpperCase() : null;
  // 当臂号/关节号为 '0' 时，不显示对应前缀
  if (arm === '0') arm = null;
  if (joint === '0') joint = null;

  const cfg = loadPrefixMappings();
  const enabled = cfg.enabledSubsystems || [];
  if (!enabled.includes(s)) return '';

  const subCfg = (cfg.subsystems && cfg.subsystems[s]) || {};
  // 静态前缀
  if (subCfg.staticPrefix) {
    try {
      // 允许使用 ${subsystem}
      // eslint-disable-next-line no-new-func
      const render = new Function('subsystem', `return \
        (function(){ return \
          \
          ` + JSON.stringify(subCfg.staticPrefix) + `
            .replace(/\\$\{subsystem\}/g, String(subsystem)); })();`);
      return render(s);
    } catch { /* ignore */ }
    return String(subCfg.staticPrefix);
  }

  const parts = [];
  const sep = subCfg.joinSeparator !== undefined ? String(subCfg.joinSeparator) : '';

  // 额外的前缀标签，如“远程”
  if (subCfg.prefixLabel) {
    const labelSep = subCfg.labelJoinSeparator !== undefined ? String(subCfg.labelJoinSeparator) : '';
    parts.push(String(subCfg.prefixLabel));
    if (labelSep && !sep) {
      // 若仅配置了 labelJoinSeparator 而未配置 joinSeparator，让标签与后续片段按 labelSep 连接
      // 这里通过在后续 push 时附带分隔控制来实现，简单方案：把 label 作为单独部分，最终 join 时使用 sep；
      // 若希望 label 与 arm/joint 之间强制贴合，可把 labelJoinSeparator 也写入 joinSeparator。
    }
  }

  // arm 名称
  if (arm && subCfg.armMap && subCfg.armMap[arm]) {
    parts.push(subCfg.armMap[arm]);
  }

  // joint 名称
  if (joint) {
    if (subCfg.jointMap && subCfg.jointMap[joint]) {
      parts.push(subCfg.jointMap[joint]);
    } else if (subCfg.jointPattern) {
      parts.push(String(subCfg.jointPattern).replace('{value}', joint));
    }
  }

  const prefixCore = parts.join(sep);
  if (!prefixCore) return '';
  const joinWithSpace = cfg.default && cfg.default.joinWithSpace;
  return joinWithSpace ? prefixCore : prefixCore; // 目前前缀内部已按 sep 连接，这里仅决定是否与正文加空格，已在下方处理
}

/**
 * 解析释义语句中的占位符
 * @param {string} explanation - 原始释义语句
 * @param {number} param0 - 参数0的值
 * @param {number} param1 - 参数1的值
 * @param {number} param2 - 参数2的值
 * @param {number} param3 - 参数3的值
 * @returns {string} - 解析后的释义语句
 */
function parseExplanation(explanation, param0, param1, param2, param3, context = null) {
  if (!explanation) {
    return '';
  }

  const mappings = loadFaultMappings();
  const params = [param0, param1, param2, param3];

  // 若释义是规则 JSON，先挑选模板
  const ruled = tryRenderRules(explanation, params, context);
  const template = typeof ruled === 'string' ? ruled : explanation;

  // 扩展匹配：{i}, {i:d}, {i|filters}, {i:d|filters}
  // i 是参数索引（0-3），d 是转义表下标，filters 为管道表达式
  const placeholderRegex = /\{(\d+)(?::(-?\d+))?(?:\|([^}]+))?\}/g;

  const result = template.replace(placeholderRegex, (_full, idxStr, mapIdxStr, filters) => {
    const paramIndex = parseInt(idxStr);
    const mappingIndex = mapIdxStr !== undefined ? parseInt(mapIdxStr) : undefined;
    const paramValue = params[paramIndex];

    let replacement = '';
    if (mappingIndex !== undefined && mappingIndex !== null && !Number.isNaN(mappingIndex)) {
      if (mappingIndex === 0) {
        replacement = paramValue !== undefined && paramValue !== null ? paramValue.toString() : '';
      } else if (mappingIndex > 0) {
        const mappingTable = mappings[mappingIndex.toString()];
        if (mappingTable && paramValue !== undefined && paramValue !== null) {
          const rawKey = String(paramValue).trim();
          let mapped = mappingTable[rawKey];
          if (mapped === undefined) {
            const n = Number(rawKey);
            if (!Number.isNaN(n)) {
              mapped = mappingTable[String(n)];
            }
          }
          replacement = mapped !== undefined ? mapped : rawKey;
        } else {
          replacement = paramValue !== undefined && paramValue !== null ? String(paramValue).trim() : '';
        }
      } else {
        // mappingIndex < 0: 强制跳过映射
        replacement = paramValue !== undefined && paramValue !== null ? paramValue.toString() : '';
      }
    } else {
      replacement = paramValue !== undefined && paramValue !== null ? paramValue.toString() : '';
    }

    if (filters) {
      const filtered = applyFilters(replacement, filters);
      replacement = typeof filtered === 'number' ? String(filtered) : String(filtered);
    }

    return replacement;
  });

  // 根据需求为特定子系统增加前缀
  const prefix = buildPrefixFromContext(context);
  if (prefix) {
    const cfg = loadPrefixMappings();
    const joinWithSpace = cfg.default && cfg.default.joinWithSpace;
    if (!result) return prefix;
    return joinWithSpace ? `${prefix} ${result}` : `${prefix}${result}`;
  }
  return result;
}

/**
 * 批量解析释义语句
 * @param {Array} entries - 日志条目数组，每个条目包含 explanation, param1, param2, param3, param4
 * @returns {Array} - 解析后的日志条目数组
 */
function parseExplanations(entries) {
  return entries.map(entry => {
    // 根据需求，{i:d} 中的 i 是参数索引，从0开始
    // {0:d} 对应 param1, {1:d} 对应 param2, {2:d} 对应 param3, {3:d} 对应 param4
    const parsedExplanation = parseExplanation(
      entry.explanation,
      entry.param1, // 参数0
      entry.param2, // 参数1
      entry.param3, // 参数2
      entry.param4  // 参数3
    );

    return {
      ...entry,
      explanation: parsedExplanation
    };
  });
}

module.exports = {
  parseExplanation,
  parseExplanations,
  loadFaultMappings,
  loadUnitMappings,
  buildPrefixFromContext
}; 