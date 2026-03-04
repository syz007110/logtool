const VALID_TARGETS = new Set(['all', 'web', 'mobile'])

export const getAppTarget = () => {
  const raw = String(process.env.VUE_APP_TARGET || 'all').toLowerCase()
  return VALID_TARGETS.has(raw) ? raw : 'all'
}

export const isWebEnabled = (target = getAppTarget()) => target === 'all' || target === 'web'
export const isMobileEnabled = (target = getAppTarget()) => target === 'all' || target === 'mobile'
