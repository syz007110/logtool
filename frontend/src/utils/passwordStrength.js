/**
 * 密码强度校验（与后端规则一致）：≥8 位，大小写+数字；禁止与用户名相同、连续相同字符 ≥4 个
 * @param {string} password
 * @param {string} [username]
 * @returns {{ valid: boolean, messageKey?: string }}
 */
export function validatePasswordStrength (password, username) {
  if (!password || typeof password !== 'string') {
    return { valid: false, messageKey: 'required' }
  }
  const p = password
  if (p.length < 8) return { valid: false, messageKey: 'minLength' }
  if (!/[A-Z]/.test(p)) return { valid: false, messageKey: 'requireUpper' }
  if (!/[a-z]/.test(p)) return { valid: false, messageKey: 'requireLower' }
  if (!/[0-9]/.test(p)) return { valid: false, messageKey: 'requireDigit' }
  if (username && typeof username === 'string' && username.trim()) {
    if (p.toLowerCase() === username.trim().toLowerCase()) {
      return { valid: false, messageKey: 'sameAsUsername' }
    }
  }
  if (/(.)\1{3,}/.test(p)) return { valid: false, messageKey: 'noConsecutive4' }
  return { valid: true }
}
