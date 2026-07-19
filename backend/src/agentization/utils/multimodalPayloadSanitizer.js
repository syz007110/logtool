function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function summarizeDataUrl(value) {
  const text = String(value || '');
  const match = text.match(/^data:([^;,]+)?;base64,(.*)$/s);
  if (!match) return text;
  const mimeType = String(match[1] || 'application/octet-stream').trim().toLowerCase();
  const base64Body = match[2] || '';
  return `[omitted ${mimeType} base64 length=${base64Body.length}]`;
}

function sanitizeMultimodalPayload(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeMultimodalPayload(item));

  if (typeof value === 'string') {
    return value.startsWith('data:') ? summarizeDataUrl(value) : value;
  }

  if (!isPlainObject(value)) return value;

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = sanitizeMultimodalPayload(item);
  }
  return out;
}

module.exports = {
  sanitizeMultimodalPayload,
  summarizeDataUrl
};
