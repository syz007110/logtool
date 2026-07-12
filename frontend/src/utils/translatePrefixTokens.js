/**
 * Translate semantic prefix tokens (e.g. "toolArm3 joint:3") via shared.prefixLabels.
 * Does not accept or map legacy Chinese prefix strings.
 */
export function translatePrefixTokens (prefixTokens, t) {
  if (!prefixTokens) return ''

  const translateKey = (key) => {
    const translated = t(`shared.prefixLabels.${key}`)
    if (translated && translated !== `shared.prefixLabels.${key}`) return translated
    return null
  }

  const translatePart = (part) => {
    const tokenValueMatch = String(part).match(/^([A-Za-z][A-Za-z0-9]*):(.+)$/)
    if (tokenValueMatch) {
      const token = tokenValueMatch[1]
      const value = tokenValueMatch[2]
      const label = translateKey(token) || token
      if (token === 'joint') {
        const isZh = /[\u4e00-\u9fa5]/.test(String(label))
        return isZh ? `${value}${label}` : `${label} ${value}`.trim()
      }
      return `${label} ${value}`.trim()
    }

    return translateKey(part) || part
  }

  const parts = String(prefixTokens).trim().split(/\s+/).filter(Boolean)
  const rendered = parts.map(translatePart)
  const joined = rendered.join('')
  if (/[\u4e00-\u9fa5]/.test(joined)) return joined
  return rendered.join(' ')
}
