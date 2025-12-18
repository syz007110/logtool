// 提供状态机与器械类型的本地映射，保持与后端 FaultMappings.json 一致

export const STATE_MACHINE_STATE_MAP = {
  '0': '初始化（S00）',
  '1': '使能（S01）',
  '2': '自检（S02）',
  '10': '待机（S10）',
  '12': '从手调整（S12）',
  '13': '主手跟随（S13）',
  '14': '断开主从/离合（S14）',
  '15': '初始化（S00）',
  '20': '主从控制（S20）',
  '21': '内窥镜控制（S21）',
  '30': '错误（S30）',
  '31': '关机（S31）'
}

export const INSTRUMENT_TYPE_MAP = {
  '0': '无器械',
  '1': '持针钳',
  '2': '电钩',
  '3': '双极鸭嘴电凝钳',
  '4': '直剪',
  '5': '单极弧剪',
  '6': '双极弧形电凝钳',
  '7': '波茨剪',
  '8': '无损伤镊',
  '9': '-30度内窥镜',
  '10': '0度内窥镜',
  '11': '30度内窥镜',
  '12': '大持针钳',
  '13': '鸭嘴抓钳',
  '14': '鼠齿抓钳',
  '15': '极电铲',
  '16': '强力鸭嘴抓钳',
  '17': '超声刀',
  '18': '持钩钳',
  '19': '中号施夹钳',
  '20': '大号施夹钳',
  '21': '小剪刀持针钳',
  '22': '大剪刀持针钳',
  '23': '30度胸科镜',
  '24': '-30度胸科镜',
  '25': '单极小电钩',
  '26': '弧剪',
  '27': '小持钳',
  '28': '大宏剪',
  '29': '无损肠抓钳',
  '30': '共注双极鸭嘴',
  '31': '共注双极弧形',
  '32': 'UNDEFINED',
  '33': '新持针'
}

const toCleanKey = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value.trim()
  return String(value)
}

export function getStateMachineStateName(value) {
  const key = toCleanKey(value)
  if (!key) return ''
  return STATE_MACHINE_STATE_MAP[key] || `状态${key}`
}

export function getInstrumentTypeName(value) {
  const key = toCleanKey(value)
  if (!key) return ''
  return INSTRUMENT_TYPE_MAP[key] || ''
}

export function resolveInstrumentTypeLabel(value) {
  const mapped = getInstrumentTypeName(value)
  if (mapped) return mapped
  const key = toCleanKey(value)
  return key || ''
}

export function resolveStateMachineLabel(value) {
  const label = getStateMachineStateName(value)
  if (label) return label
  const key = toCleanKey(value)
  return key || ''
}

