/**
 * 手术数据适配器
 * 统一处理不同来源的手术数据，确保可视化组件能正确解析
 */

/**
 * 保持原始时间格式（不进行时区转换）
 * 将所有时间统一为 YYYY-MM-DD HH:mm:ss 格式的原始时间字符串
 * @param {string|Date} timeValue - 时间字符串或Date对象
 * @returns {string} 原始时间格式字符串 (YYYY-MM-DD HH:mm:ss)
 */
function normalizeTimeToRaw (timeValue) {
  if (!timeValue) return null

  try {
    // 如果已经是原始时间格式字符串，直接返回
    if (typeof timeValue === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
      return timeValue
    }

    // 如果是ISO格式（带Z），去掉Z并按原始时间解析
    if (typeof timeValue === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timeValue)) {
      const withoutZ = timeValue.replace('Z', '').replace('T', ' ')
      // 提取年月日时分秒，按原始时间构造
      const [datePart, timePart] = withoutZ.split(' ')
      if (datePart && timePart) {
        const [year, month, day] = datePart.split('-').map(Number)
        const [hour, minute, second] = timePart.split(':').map(Number)
        const d = new Date(year, month - 1, day, hour, minute, second || 0)
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      }
    }

    // 如果是Date对象，提取原始时间
    const date = timeValue instanceof Date ? timeValue : new Date(timeValue)
    if (isNaN(date.getTime())) {
      console.warn('⚠️ 无效的时间格式:', timeValue)
      return timeValue
    }

    // 使用本地时间方法（不是UTC），按原始时间提取
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  } catch (error) {
    console.warn('⚠️ 时间转换失败:', timeValue, error)
    return timeValue
  }
}

/**
 * 统一的手术数据适配器
 * @param {Object} rawData - 原始手术数据（可能来自统计页面或数据库）
 * @returns {Object} 标准化的手术数据
 */
export function adaptSurgeryData (rawData) {
  if (!rawData) {
    console.warn('⚠️ 手术数据为空')
    return null
  }

  console.log('🔧 开始适配手术数据:', rawData)

  // 提取结构化数据
  let structuredData = null
  let metadata = {}

  // 情况1：手术统计页面的数据格式
  if (rawData.postgresql_row_preview?.structured_data) {
    structuredData = rawData.postgresql_row_preview.structured_data
    metadata = {
      surgery_id: rawData.surgery_id || rawData.postgresql_row_preview.surgery_id,
      // 统一标准化为原始时间格式（YYYY-MM-DD HH:mm:ss）
      start_time: normalizeTimeToRaw(rawData.surgery_start_time || rawData.postgresql_row_preview.start_time),
      end_time: normalizeTimeToRaw(rawData.surgery_end_time || rawData.postgresql_row_preview.end_time),
      is_remote: rawData.is_remote_surgery || rawData.postgresql_row_preview.is_remote,
      has_fault: rawData.has_error || rawData.postgresql_row_preview.has_fault,
      device_ids: rawData.postgresql_row_preview.device_ids || [],
      source_log_ids: rawData.postgresql_row_preview.source_log_ids || []
    }
  } else if (rawData.structured_data) {
    // 情况2：数据库手术记录的数据格式
    structuredData = rawData.structured_data
    metadata = {
      surgery_id: rawData.surgery_id,
      start_time: normalizeTimeToRaw(rawData.start_time),
      end_time: normalizeTimeToRaw(rawData.end_time),
      is_remote: rawData.is_remote,
      has_fault: rawData.has_fault,
      device_ids: rawData.device_ids || [],
      source_log_ids: rawData.source_log_ids || []
    }
  } else if (rawData.arms || rawData.surgery_stats || rawData.power_cycles) {
    // 情况3：直接传入的结构化数据
    structuredData = rawData
    metadata = {
      surgery_id: rawData.surgery_id,
      start_time: normalizeTimeToRaw(rawData.start_time || rawData.surgery_start_time),
      end_time: normalizeTimeToRaw(rawData.end_time || rawData.surgery_end_time),
      is_remote: rawData.is_remote,
      has_fault: rawData.has_fault,
      device_ids: rawData.device_ids || [],
      source_log_ids: rawData.source_log_ids || []
    }
  } else if (rawData.arm1_usage || rawData.state_machine_changes || rawData.alarm_details) {
    // 情况4：手术统计页面的原始分析数据
    structuredData = convertAnalysisDataToStructured(rawData)
    metadata = {
      surgery_id: rawData.surgery_id,
      start_time: normalizeTimeToRaw(rawData.surgery_start_time),
      end_time: normalizeTimeToRaw(rawData.surgery_end_time),
      is_remote: rawData.is_remote_surgery,
      has_fault: rawData.has_error,
      device_ids: [],
      source_log_ids: rawData.log_id ? [rawData.log_id] : []
    }
  }

  if (!structuredData) {
    console.warn('⚠️ 无法识别的数据格式:', rawData)
    return null
  }

  // 标准化结构化数据
  const standardizedData = standardizeStructuredData(structuredData)

  // 合并元数据
  const result = {
    ...standardizedData,
    ...metadata
  }

  console.log('✅ 手术数据适配完成:', result)
  return result
}

/**
 * 将分析器原始数据转换为结构化数据格式
 * @param {Object} analysisData - 分析器原始数据
 * @returns {Object} 结构化数据
 */
function convertAnalysisDataToStructured (analysisData) {
  const structured = {
    power_cycles: [],
    arms: [],
    surgery_stats: {
      success: !analysisData.has_error,
      network_latency_ms: [],
      faults: [],
      state_machine: [],
      arm_switch_count: 0,
      left_hand_clutch: 0,
      right_hand_clutch: 0,
      foot_clutch: 0,
      endoscope_pedal: 0
    }
  }

  // 转换器械使用数据
  for (let i = 1; i <= 4; i++) {
    const armUsage = analysisData[`arm${i}_usage`] || []
    const instrumentUsage = armUsage.map(usage => ({
      tool_type: usage.instrumentName || usage.tool_type || '未知器械',
      udi: usage.udi || '无UDI',
      start_time: normalizeTimeToRaw(usage.startTime || usage.start_time),
      end_time: normalizeTimeToRaw(usage.endTime || usage.end_time),
      energy_activation: []
    }))

    structured.arms.push({
      arm_id: i,
      instrument_usage: instrumentUsage
    })
  }

  // 转换状态机数据
  if (analysisData.state_machine_changes && Array.isArray(analysisData.state_machine_changes)) {
    structured.surgery_stats.state_machine = analysisData.state_machine_changes.map(change => ({
      time: normalizeTimeToRaw(change.time),
      state: change.stateName || String(change.state)
    }))
  }

  // 转换网络延迟数据
  if (analysisData.network_latency_data && Array.isArray(analysisData.network_latency_data)) {
    structured.surgery_stats.network_latency_ms = analysisData.network_latency_data.map(data => ({
      time: normalizeTimeToRaw(data.timestamp),
      latency: data.latency
    }))
  }

  // 转换故障数据
  if (analysisData.alarm_details && Array.isArray(analysisData.alarm_details)) {
    structured.surgery_stats.faults = analysisData.alarm_details.map(fault => ({
      timestamp: normalizeTimeToRaw(fault.time),
      error_code: fault.code,
      param1: '',
      param2: '',
      param3: '',
      param4: '',
      explanation: fault.message,
      log_id: analysisData.log_id
    }))
  }

  // 转换电源循环数据
  if (analysisData.power_on_times && analysisData.shutdown_times) {
    const onTimes = analysisData.power_on_times
    const offTimes = analysisData.shutdown_times

    // 智能配对开机和关机时间
    let onIndex = 0
    let offIndex = 0

    while (onIndex < onTimes.length || offIndex < offTimes.length) {
      const onTime = onIndex < onTimes.length ? onTimes[onIndex] : null
      const offTime = offIndex < offTimes.length ? offTimes[offIndex] : null

      structured.power_cycles.push({
        on_time: normalizeTimeToRaw(onTime),
        off_time: normalizeTimeToRaw(offTime)
      })

      if (onTime && offTime) {
        onIndex++
        offIndex++
      } else if (onTime) {
        onIndex++
      } else {
        offIndex++
      }
    }
  }

  return structured
}

/**
 * 标准化结构化数据
 * @param {Object} structuredData - 结构化数据
 * @returns {Object} 标准化后的数据
 */
function standardizeStructuredData (structuredData) {
  const standardized = {
    arms: structuredData.arms || [],
    power_cycles: structuredData.power_cycles || [],
    surgery_stats: {
      success: structuredData.surgery_stats?.success ?? true,
      network_latency_ms: structuredData.surgery_stats?.network_latency_ms || [],
      faults: structuredData.surgery_stats?.faults || [],
      state_machine: structuredData.surgery_stats?.state_machine || [],
      arm_switch_count: structuredData.surgery_stats?.arm_switch_count || 0,
      left_hand_clutch: structuredData.surgery_stats?.left_hand_clutch || 0,
      right_hand_clutch: structuredData.surgery_stats?.right_hand_clutch || 0,
      foot_clutch: structuredData.surgery_stats?.foot_clutch || 0,
      endoscope_pedal: structuredData.surgery_stats?.endoscope_pedal || 0
    }
  }

  // 确保 arms 数组格式正确
  if (!Array.isArray(standardized.arms)) {
    standardized.arms = []
  }

  // 确保每个 arm 都有正确的结构，并转换时间
  for (let i = 0; i < standardized.arms.length; i++) {
    if (!standardized.arms[i].arm_id) {
      standardized.arms[i].arm_id = i + 1
    }
    if (!standardized.arms[i].instrument_usage) {
      standardized.arms[i].instrument_usage = []
    } else {
      // 转换器械使用时间
      standardized.arms[i].instrument_usage = standardized.arms[i].instrument_usage.map(usage => ({
        ...usage,
        start_time: normalizeTimeToRaw(usage.start_time),
        end_time: normalizeTimeToRaw(usage.end_time)
      }))
    }
  }

  // 转换状态机数据时间
  if (standardized.surgery_stats.state_machine) {
    standardized.surgery_stats.state_machine = standardized.surgery_stats.state_machine.map(item => ({
      ...item,
      time: normalizeTimeToRaw(item.time)
    }))
  }

  // 转换网络延迟数据时间
  if (standardized.surgery_stats.network_latency_ms) {
    standardized.surgery_stats.network_latency_ms = standardized.surgery_stats.network_latency_ms.map(item => ({
      ...item,
      time: normalizeTimeToRaw(item.time)
    }))
  }

  // 转换故障数据时间
  if (standardized.surgery_stats.faults) {
    standardized.surgery_stats.faults = standardized.surgery_stats.faults.map(fault => ({
      ...fault,
      timestamp: normalizeTimeToRaw(fault.timestamp)
    }))
  }

  // 转换电源循环数据时间
  if (standardized.power_cycles) {
    standardized.power_cycles = standardized.power_cycles.map(cycle => ({
      on_time: normalizeTimeToRaw(cycle.on_time),
      off_time: normalizeTimeToRaw(cycle.off_time)
    }))
  }

  return standardized
}

/**
 * 验证适配后的数据是否完整
 * @param {Object} adaptedData - 适配后的数据
 * @returns {boolean} 是否有效
 */
export function validateAdaptedData (adaptedData) {
  if (!adaptedData) return false

  const hasRequiredFields = !!(
    adaptedData.surgery_id &&
    adaptedData.start_time &&
    adaptedData.arms &&
    adaptedData.surgery_stats
  )

  const hasValidArms = Array.isArray(adaptedData.arms) && adaptedData.arms.length > 0

  console.log('🔍 数据验证结果:', {
    hasRequiredFields,
    hasValidArms,
    armsCount: adaptedData.arms?.length || 0,
    stateMachineCount: adaptedData.surgery_stats?.state_machine?.length || 0,
    networkLatencyCount: adaptedData.surgery_stats?.network_latency_ms?.length || 0
  })

  return hasRequiredFields && hasValidArms
}

/**
 * 获取数据来源类型
 * @param {Object} rawData - 原始数据
 * @returns {string} 数据来源类型
 */
export function getDataSourceType (rawData) {
  if (!rawData) return 'unknown'

  if (rawData.postgresql_row_preview?.structured_data) {
    return 'surgery_statistics'
  } else if (rawData.structured_data) {
    return 'database_record'
  } else if (rawData.arms || rawData.surgery_stats || rawData.power_cycles) {
    return 'structured_data'
  } else if (rawData.arm1_usage || rawData.state_machine_changes || rawData.alarm_details) {
    return 'analysis_data'
  }

  return 'unknown'
}
