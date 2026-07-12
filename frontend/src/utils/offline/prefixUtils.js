import prefixIndex from './prefix/index.json'
import prefixProfileSr from './prefix/sr.json'
import prefixProfileSa from './prefix/sa.json'

const TYPE_SUFFIX_PATTERN = /^[0-9A-F]{3}[A-E]$/

const PROFILE_BY_KEY = {
  sr: prefixProfileSr,
  sa: prefixProfileSa
}

const prefixMappings = {
  seriesBindings: prefixIndex.seriesBindings || { SR: 'sr', SA: 'sa' },
  profiles: PROFILE_BY_KEY
}

function normalizeTypeCode (input) {
  if (!input) return ''
  const raw = String(input).trim().toUpperCase()
  if (TYPE_SUFFIX_PATTERN.test(raw)) {
    return raw.startsWith('0X') ? raw : `0X${raw}`
  }
  if (raw.length >= 4) {
    const tail = raw.slice(-4)
    if (TYPE_SUFFIX_PATTERN.test(tail)) {
      return `0X${tail}`
    }
  }
  return raw
}

function deriveFromFullLogCode (input) {
  if (!input) {
    return { subsystem: null, arm: null, joint: null, normalizedCode: '' }
  }
  const raw = String(input).trim().toUpperCase()
  if (raw.length >= 5) {
    const tail4 = raw.slice(-4)
    if (TYPE_SUFFIX_PATTERN.test(tail4)) {
      const subsystem = raw.charAt(0)
      if (/^[1-9A]$/.test(subsystem)) {
        const arm = raw.length >= 2 ? raw.charAt(1) : null
        const joint = raw.length >= 3 ? raw.charAt(2) : null
        return {
          subsystem,
          arm,
          joint,
          normalizedCode: `0X${tail4}`
        }
      }
    }
  }
  return {
    subsystem: null,
    arm: null,
    joint: null,
    normalizedCode: normalizeTypeCode(raw)
  }
}

function resolvePrefixProfile (seriesCode) {
  const root = prefixMappings || {}
  const bindings = root.seriesBindings || {}
  const profiles = root.profiles || {}
  const code = String(seriesCode || '').trim().toUpperCase()
  let profileKey = null
  if (code && Object.prototype.hasOwnProperty.call(bindings, code)) {
    profileKey = bindings[code]
  } else if (!code) {
    profileKey = bindings.SR || bindings.SA || Object.values(bindings)[0] || 'sr'
  } else {
    profileKey = bindings.SR || 'sr'
  }
  if (profileKey && profiles[profileKey]) return profiles[profileKey]
  return profiles.sr || Object.values(profiles)[0] || null
}

function buildPrefixTokens (subsystem, arm, joint, seriesCode = null) {
  if (!subsystem) return []
  const s = String(subsystem).toUpperCase()
  let armCode = arm ? String(arm).toUpperCase() : null
  let jointCode = joint ? String(joint).toUpperCase() : null
  if (armCode === '0') armCode = null
  if (jointCode === '0') jointCode = null

  const cfg = resolvePrefixProfile(seriesCode)
  if (!cfg) return []
  const enabledSubsystems = cfg.enabledSubsystems || []
  if (!enabledSubsystems.includes(s)) return []

  const subCfg = (cfg.subsystems && cfg.subsystems[s]) || {}
  const parts = []
  if (subCfg.prefixLabel) parts.push(String(subCfg.prefixLabel))
  if (armCode && subCfg.armMap && subCfg.armMap[armCode]) {
    parts.push(String(subCfg.armMap[armCode]))
  }
  if (jointCode) {
    if (subCfg.jointMap && subCfg.jointMap[jointCode]) {
      parts.push(String(subCfg.jointMap[jointCode]))
    } else if (subCfg.jointPattern) {
      parts.push(String(subCfg.jointPattern).replace('{value}', jointCode))
    }
  }
  return parts.filter(Boolean)
}

function buildPrefixCore (subsystem, arm, joint, seriesCode = null) {
  const tokens = buildPrefixTokens(subsystem, arm, joint, seriesCode)
  if (!tokens.length) return ''
  const cfg = resolvePrefixProfile(seriesCode)
  const subCfg = (cfg?.subsystems && subsystem)
    ? (cfg.subsystems[String(subsystem).toUpperCase()] || {})
    : {}
  const sep = subCfg.joinSeparator !== undefined ? String(subCfg.joinSeparator) : ' '
  return tokens.join(sep)
}

export function derivePrefixLabel (rawCode, subsystemOverride = null, seriesCode = null) {
  const base = deriveFromFullLogCode(rawCode)
  const normalized = base.normalizedCode || normalizeTypeCode(rawCode)
  const subsystem = (subsystemOverride || base.subsystem || '').toString().toUpperCase()
  let arm = base.arm
  let joint = base.joint

  if ((!arm || !joint) && subsystem && normalized) {
    const suffix = normalized.replace(/^0X/, '')
    const candidate = `${subsystem}${suffix}`
    const fallback = deriveFromFullLogCode(candidate)
    if (!arm && fallback.arm) arm = fallback.arm
    if (!joint && fallback.joint) joint = fallback.joint
  }

  return buildPrefixCore(subsystem, arm, joint, seriesCode)
}

export function derivePrefixFromRecord (record, options = {}) {
  if (!record) return ''
  const { subsystem: overrideSubsystem, rawCode, seriesCode } = options
  const subsystem = overrideSubsystem || record.subsystem || null
  const resolvedSeries = seriesCode ||
    record.series_code ||
    record.seriesCode ||
    null
  const codeCandidates = [
    rawCode,
    record.full_code,
    record.fullCode,
    record.code,
    normalizeTypeCode(record.code && subsystem ? `${subsystem}${record.code}` : '')
  ].filter(Boolean)

  for (const candidate of codeCandidates) {
    const prefix = derivePrefixLabel(candidate, subsystem, resolvedSeries)
    if (prefix) return prefix
  }
  return ''
}

export { normalizeTypeCode, resolvePrefixProfile }
