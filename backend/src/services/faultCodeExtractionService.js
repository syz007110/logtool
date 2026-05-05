function normalizeTypeCode(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (/^(?:0X)?[0-9A-F]{3}[A-E]$/.test(raw)) {
    return raw.startsWith('0X') ? raw : `0X${raw}`;
  }
  return '';
}

function extractFaultCodesFromText(query) {
  const s = String(query || '').trim().toUpperCase();
  const fullRe = /[1-9A][0-9A-F]{5}[A-E]/g;
  const typeRe = /(?:0X)?[0-9A-F]{3}[A-E]/g;

  const fullCodes = [];
  const fullSeen = new Set();
  for (const m of s.matchAll(fullRe)) {
    const v = String(m[0] || '').trim().toUpperCase();
    if (!v) continue;
    if (fullSeen.has(v)) continue;
    fullSeen.add(v);
    fullCodes.push(v);
    if (fullCodes.length >= 3) break;
  }

  const typeCodes = [];
  const typeSeen = new Set();

  for (const fc of fullCodes) {
    const tail4 = fc.slice(-4);
    const norm = normalizeTypeCode(tail4);
    if (norm && !typeSeen.has(norm)) {
      typeSeen.add(norm);
      typeCodes.push(norm);
    }
  }

  for (const m of s.matchAll(typeRe)) {
    const norm = normalizeTypeCode(m[0]);
    if (!norm) continue;
    if (typeSeen.has(norm)) continue;
    typeSeen.add(norm);
    typeCodes.push(norm);
    if (typeCodes.length >= 6) break;
  }

  return { fullCodes, typeCodes };
}

module.exports = {
  normalizeTypeCode,
  extractFaultCodesFromText
};

