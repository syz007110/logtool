const dayjs = require('dayjs');

function parseAdvancedFilterPayload(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildAdvancedFilterExpression(root, queryParams = {}) {
  const allowedFields = new Set([
    'timestamp',
    'error_code',
    'param1',
    'param2',
    'param3',
    'param4',
    'explanation'
  ]);

  let advParamIndex = 0;
  const makeParam = (base, chType, value) => {
    const name = `${base}_${advParamIndex++}`;
    queryParams[name] = value;
    return `{${name}:${chType}}`;
  };

  const formatTimestamp = (value) => {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(value)) {
      return value;
    }
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : null;
  };

  const toNum = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const buildNode = (node) => {
    if (!node) return null;

    if (Array.isArray(node)) {
      const parts = node.map(buildNode).filter(Boolean);
      if (parts.length === 0) return null;
      return `(${parts.join(' AND ')})`;
    }

    if (node.field && node.operator) {
      const field = String(node.field);
      const op = String(node.operator || '').toLowerCase();
      const value = node.value;

      if (!allowedFields.has(field)) return null;
      if (value === undefined || value === null || value === '') return null;

      if (field === 'timestamp') {
        if (op === 'between') {
          if (!Array.isArray(value) || value.length !== 2) return null;
          const from = formatTimestamp(value[0]);
          const to = formatTimestamp(value[1]);
          if (!from || !to) return null;
          const p1 = makeParam('adv_ts_from', 'DateTime', from);
          const p2 = makeParam('adv_ts_to', 'DateTime', to);
          return `(timestamp BETWEEN ${p1} AND ${p2})`;
        }

        const formatted = formatTimestamp(value);
        if (!formatted) return null;
        const p = makeParam('adv_ts', 'DateTime', formatted);
        switch (op) {
          case '=':
          case '==':
            return `timestamp = ${p}`;
          case '!=':
          case '<>':
            return `timestamp != ${p}`;
          case '>':
            return `timestamp > ${p}`;
          case '>=':
            return `timestamp >= ${p}`;
          case '<':
            return `timestamp < ${p}`;
          case '<=':
            return `timestamp <= ${p}`;
          default:
            return null;
        }
      }

      if (field === 'error_code') {
        const p = makeParam('adv_ec', 'String', String(value));
        const wrap = (expr) => (node.negate ? `NOT (${expr})` : expr);
        switch (op) {
          case '=':
            return wrap(`error_code = ${p}`);
          case '!=':
          case '<>':
            return wrap(`error_code != ${p}`);
          case 'contains':
          case 'like':
            return wrap(`positionCaseInsensitive(error_code, ${p}) > 0`);
          case 'notcontains':
            return wrap(`positionCaseInsensitive(error_code, ${p}) = 0`);
          case 'regex':
            return wrap(`match(error_code, ${p})`);
          case 'startswith':
            return wrap(`startsWith(error_code, ${p})`);
          case 'endswith':
            return wrap(`endsWith(error_code, ${p})`);
          default:
            return null;
        }
      }

      if (field === 'param1' || field === 'param2' || field === 'param3' || field === 'param4') {
        const colExpr = `toFloat64OrNull(${field})`;
        if (op === 'between') {
          if (!Array.isArray(value) || value.length !== 2) return null;
          const from = toNum(value[0]);
          const to = toNum(value[1]);
          if (from === null || to === null) return null;
          const p1 = makeParam(`adv_${field}_from`, 'Float64', from);
          const p2 = makeParam(`adv_${field}_to`, 'Float64', to);
          return `(${colExpr} >= ${p1} AND ${colExpr} <= ${p2})`;
        }

        const num = toNum(value);
        if (num === null) return null;
        const p = makeParam(`adv_${field}`, 'Float64', num);
        switch (op) {
          case '=':
            return `${colExpr} = ${p}`;
          case '!=':
          case '<>':
            return `${colExpr} != ${p}`;
          case '>':
            return `${colExpr} > ${p}`;
          case '>=':
            return `${colExpr} >= ${p}`;
          case '<':
            return `${colExpr} < ${p}`;
          case '<=':
            return `${colExpr} <= ${p}`;
          default:
            return null;
        }
      }

      if (field === 'explanation') {
        const p = makeParam('adv_expl', 'String', String(value));
        if (op === 'contains' || op === 'like') {
          return `positionCaseInsensitive(explanation, ${p}) > 0`;
        }
        return null;
      }

      return null;
    }

    if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
      const childExprs = node.conditions.map(buildNode).filter(Boolean);
      if (childExprs.length === 0) return null;
      const joiner = node.logic === 'OR' ? ' OR ' : ' AND ';
      return `(${childExprs.join(joiner)})`;
    }

    return null;
  };

  return buildNode(root);
}

module.exports = {
  parseAdvancedFilterPayload,
  buildAdvancedFilterExpression
};
