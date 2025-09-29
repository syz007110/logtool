// 共享的可视化配置文件
// 用于 SurgeryVisualization.vue 和 ExplanationTester.vue

// 甘特图可配置样式参数
export const GANTT_STYLE = {
  // 每个臂行上下的预留留白（像素）
  ROW_GAP_PX: 2,
  // 条的最大厚度（像素上限）
  BAR_MAX_PX: 40,
  // 条厚度占可用行高（去除留白后）的比例 0~1
  BAR_RATIO: 0.8
}

// 颜色配置：可按器械类型固定颜色，也可按臂分配基础色
export const GANTT_COLORS = {
  // 器械类型 → 颜色
  TOOL_TYPE_COLORS: {
    '无器械': '#EBBA66',       // 浅橙 - 空白状态
    '持针钳': '#D9EB66',       // 浅黄绿
    '电钩': '#96EB66',         // 青绿
    '双极鸭嘴电凝钳': '#66EB77', // 深绿
    '直剪': '#FFB366',         // 橙色
    '单极弧剪': '#FF9966',     // 橙红
    '双极弧形电凝钳': '#FF6666', // 红色
    '波茨剪': '#FF6666',       // 红色
    '无损伤镊': '#66CCFF',     // 浅蓝
    '-30度内窥镜': '#3399FF',   // 蓝色
    '0度内窥镜': '#0066FF',    // 深蓝
    '30度内窥镜': '#6699FF',   // 中蓝
    '大持针钳': '#99CC66',     // 黄绿色
    '鸭嘴抓钳': '#33CC99',     // 青色
    '鼠齿抓钳': '#00CC99'      // 青色
  },
  // 不同臂的基础颜色（作为 fallback）
  ARM_BASE_COLORS: ['#E28A6A', '#E2C66A', '#C2E26A', '#86E26A']
}

// 最小化数据转换：保留原始结构，只添加必要的计算字段
export function normalizeSurgeryData(raw) {
  if (!raw || typeof raw !== 'object') {
    return { 
      timeline: {}, 
      arms: [], 
      state_machine: [], 
      is_remote: false, 
      surgery_id: null, 
      start_time: null, 
      end_time: null, 
      network_latency_data: [],
      structured_data: null
    }
  }

  // 如果已经是期望结构，直接返回（保留所有原始字段）
  if (raw.timeline && Array.isArray(raw.arms)) {
    return {
      ...raw,  // 保留所有原始字段
      is_remote: !!raw.is_remote,
      surgery_id: raw.surgery_id || null,
      start_time: raw.start_time || null,
      end_time: raw.end_time || null,
      network_latency_data: Array.isArray(raw.network_latency_data) ? raw.network_latency_data : []
    }
  }

  // 最小化转换：保留所有原始数据，只添加必要的计算字段
  const hasStructured = !!raw.structured_data
  const source = hasStructured ? raw.structured_data : raw

  // 只计算时间轴映射（这是可视化必需的）
  const powerOn = source.power_cycles?.[0]?.on_time || raw.start_time || source.start_time
  const powerOffCandidate = source.power_cycles?.[source.power_cycles?.length - 1]?.off_time
  const surgeryStart = raw.start_time || source.start_time
  const surgeryEnd = raw.end_time || source.end_time
  const powerOff = powerOffCandidate ?? null
  const previousSurgeryEnd = raw.previous_end_time || raw.previous_surgery_end_time ||
    source.previous_end_time || source.prev_surgery_end_time || source.last_surgery_end_time

  // 只计算arms数据（这是可视化必需的）
  const arms = Array.isArray(source.arms)
    ? source.arms.map((a, idx) => {
        const name = a.name || `${a.arm_id ?? idx + 1}号臂`.trim()
        const segments = Array.isArray(a.instrument_usage)
          ? a.instrument_usage
              .filter(u => u && u.start_time && u.end_time)
              .map((u) => ({
                start: u.start_time,
                end: u.end_time,
                udi: u.udi,
                tool_type: u.tool_type
              }))
          : []
        return { name, segments }
      })
    : []

  const stateMachine = Array.isArray(source.state_machine_changes)
    ? source.state_machine_changes.map(ch => ({ time: ch.time, state: ch.stateName || String(ch.state) }))
    : Array.isArray(source.state_machine) ? source.state_machine : []
  const networkLatency = Array.isArray(source.network_latency_data) ? source.network_latency_data : []

  // 返回：保留所有原始数据 + 添加必要的计算字段
  return {
    ...raw,  // 保留所有原始字段
    timeline: { powerOn, surgeryStart, surgeryEnd, powerOff, previousSurgeryEnd },
    arms,
    state_machine: stateMachine,
    network_latency_data: networkLatency,
    // 确保关键字段存在
    is_remote: !!(raw.is_remote || source.is_remote_surgery || raw.is_remote_surgery),
    surgery_id: raw.surgery_id || source.surgery_id || null,
    start_time: raw.start_time || source.start_time || null,
    end_time: raw.end_time || source.end_time || null
  }
}

// 时间转换工具函数
export function toMs(v) {
  if (v === null || v === undefined || v === '') return NaN
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : NaN
}
