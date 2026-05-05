const crypto = require('crypto');

const CROCKFORD32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeBase32(value, length) {
  let num = BigInt(value);
  let out = '';
  while (out.length < length) {
    const idx = Number(num % 32n);
    out = CROCKFORD32[idx] + out;
    num /= 32n;
  }
  return out;
}

function generateUlid(timestampMs = Date.now()) {
  const ts = BigInt(Number(timestampMs) || Date.now());
  const timePart = encodeBase32(ts, 10);
  const randomBytes = crypto.randomBytes(10); // 80 bits
  let randomValue = 0n;
  for (const b of randomBytes) {
    randomValue = (randomValue << 8n) | BigInt(b);
  }
  const randomPart = encodeBase32(randomValue, 16);
  return `${timePart}${randomPart}`;
}

function generateUuidV4() {
  return crypto.randomUUID();
}

module.exports = {
  generateUlid,
  generateUuidV4
};

