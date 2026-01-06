import prefixMappings from './prefixMappings.json'

const TYPE_SUFFIX_PATTERN = /^[0-9A-F]{3}[A-E]$/

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

function buildPrefixCore (subsystem, arm, joint) {
  if (!subsystem) return ''
  const s = String(subsystem).toUpperCase()
  let armCode = arm ? String(arm).toUpperCase() : null
  let jointCode = joint ? String(joint).toUpperCase() : null
  if (armCode === '0') armCode = null
  if (jointCode === '0') jointCode = null

  const cfg = prefixMappings || {}
  const enabledSubsystems = cfg.enabledSubsystems || []
  if (!enabledSubsystems.includes(s)) return ''

  const subCfg = (cfg.subsystems && cfg.subsystems[s]) || {}
  const parts = []
  const joinSeparator = subCfg.joinSeparator !== undefined ? String(subCfg.joinSeparator) : ''

  if (subCfg.prefixLabel) {
    parts.push(String(subCfg.prefixLabel))
  }

  if (armCode && subCfg.armMap && subCfg.armMap[armCode]) {
    parts.push(subCfg.armMap[armCode])
  }

  if (jointCode) {
    if (subCfg.jointMap && subCfg.jointMap[jointCode]) {
      parts.push(subCfg.jointMap[jointCode])
    } else if (subCfg.jointPattern) {
      parts.push(String(subCfg.jointPattern).replace('{value}', jointCode))
    }
  }

  const prefix = parts.join(joinSeparator)
  return prefix || ''
}

export function derivePrefixLabel (rawCode, subsystemOverride = null) {
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

  return buildPrefixCore(subsystem, arm, joint)
}

export function derivePrefixFromRecord (record, options = {}) {
  if (!record) return ''
  const { subsystem: overrideSubsystem, rawCode } = options
  const subsystem = overrideSubsystem || record.subsystem || null
  const codeCandidates = [
    rawCode,
    record.full_code,
    record.fullCode,
    record.code,
    normalizeTypeCode(record.code && subsystem ? `${subsystem}${record.code}` : '')
  ].filter(Boolean)

  for (const candidate of codeCandidates) {
    const prefix = derivePrefixLabel(candidate, subsystem)
    if (prefix) return prefix
  }
  return ''
}

export { normalizeTypeCode }
