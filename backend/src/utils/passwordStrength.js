/**
 * 密码强度校验：≥8 位，含大小写+数字；禁止与用户名相同、连续相同字符 ≥4 个
 * @param {string} password
 * @param {string} [username] 可选，校验「禁止与用户名相同」
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password, username) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'passwordRequired' };
  }
  const p = password;
  if (p.length < 8) {
    return { valid: false, message: 'passwordMinLength' };
  }
  if (!/[A-Z]/.test(p)) {
    return { valid: false, message: 'passwordRequireUpper' };
  }
  if (!/[a-z]/.test(p)) {
    return { valid: false, message: 'passwordRequireLower' };
  }
  if (!/[0-9]/.test(p)) {
    return { valid: false, message: 'passwordRequireDigit' };
  }
  if (username && typeof username === 'string' && username.trim()) {
    if (p.toLowerCase() === username.trim().toLowerCase()) {
      return { valid: false, message: 'passwordSameAsUsername' };
    }
  }
  if (/(.)\1{3,}/.test(p)) {
    return { valid: false, message: 'passwordNoConsecutive4' };
  }
  return { valid: true };
}

module.exports = { validatePasswordStrength };
