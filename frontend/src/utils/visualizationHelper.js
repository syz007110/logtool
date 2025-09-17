// 统一的手术数据可视化辅助函数
import router from '../router'

/**
 * 统一的手术数据可视化函数
 * 按照日志解析页面中手术数据列表的可视化功能实现
 *
 * @param {Object} surgeryData - 手术数据对象
 * @param {Object} options - 可选参数
 * @param {boolean} options.openInNewTab - 是否在新标签页打开，默认true
 * @param {string} options.queryId - 查询ID，用于日志解析页面的可视化
 */
export function visualizeSurgery (surgeryData, options = {}) {
  const { openInNewTab = true, queryId = null } = options

  try {
    // 确保有数据
    if (!surgeryData) {
      throw new Error('手术数据不能为空')
    }

    // 添加调试信息
    console.log('visualizeSurgery received data:', surgeryData)
    console.log('Has structured_data:', !!surgeryData.structured_data)
    console.log('Has postgresql_row_preview:', !!surgeryData.postgresql_row_preview)

    // 准备要存储的数据
    let dataToStore = surgeryData

    // 如果是PostgreSQL格式的数据，需要保留基本信息并合并structured_data
    if (surgeryData.structured_data) {
      // 保留外层的基本信息，并将structured_data合并进去
      dataToStore = {
        ...surgeryData.structured_data,
        // 保留关键的基本信息（优先使用外层值，即使为false也要保留）
        surgery_id: surgeryData.surgery_id !== undefined ? surgeryData.surgery_id : surgeryData.structured_data.surgery_id,
        start_time: surgeryData.start_time !== undefined ? surgeryData.start_time : surgeryData.structured_data.start_time,
        end_time: surgeryData.end_time !== undefined ? surgeryData.end_time : surgeryData.structured_data.end_time,
        is_remote: surgeryData.is_remote !== undefined ? surgeryData.is_remote : surgeryData.structured_data.is_remote,
        device_ids: surgeryData.device_ids !== undefined ? surgeryData.device_ids : surgeryData.structured_data.device_ids,
        source_log_ids: surgeryData.source_log_ids !== undefined ? surgeryData.source_log_ids : surgeryData.structured_data.source_log_ids
      }
    } else if (surgeryData.postgresql_row_preview?.structured_data) {
      // 如果有postgresql_row_preview，保留基本信息并合并structured_data
      const preview = surgeryData.postgresql_row_preview
      dataToStore = {
        ...preview.structured_data,
        // 保留关键的基本信息（优先使用外层值，即使为false也要保留）
        surgery_id: preview.surgery_id !== undefined ? preview.surgery_id : preview.structured_data?.surgery_id,
        start_time: preview.start_time !== undefined ? preview.start_time : preview.structured_data?.start_time,
        end_time: preview.end_time !== undefined ? preview.end_time : preview.structured_data?.end_time,
        is_remote: preview.is_remote !== undefined ? preview.is_remote : preview.structured_data?.is_remote,
        device_ids: preview.device_ids !== undefined ? preview.device_ids : preview.structured_data?.device_ids,
        source_log_ids: preview.source_log_ids !== undefined ? preview.source_log_ids : preview.structured_data?.source_log_ids
      }
    }

    // 添加调试信息
    console.log('Final data to store:', dataToStore)
    console.log('Final surgery_id:', dataToStore.surgery_id)
    console.log('Final start_time:', dataToStore.start_time)
    console.log('Final end_time:', dataToStore.end_time)

    // 将数据存储到sessionStorage
    sessionStorage.setItem('surgeryVizData', JSON.stringify(dataToStore))

    // 构建路由参数
    const routeOptions = { path: '/surgery-visualization' }
    if (queryId) {
      routeOptions.query = { id: queryId }
    }

    const routeData = router.resolve(routeOptions)

    // 打开可视化页面
    if (openInNewTab) {
      window.open(routeData.href, '_blank')
    } else {
      // 如果在当前页面打开，使用push方式
      router.push(routeOptions)
    }
  } catch (error) {
    console.error('可视化手术数据失败:', error)
    // 这里可以添加用户友好的错误提示
    if (window.ElMessage) {
      window.ElMessage.error('可视化手术数据失败: ' + error.message)
    }
  }
}

/**
 * 验证手术数据是否包含可视化所需的基本信息
 * @param {Object} surgeryData - 手术数据
 * @returns {boolean} 是否有效
 */
export function validateSurgeryData (surgeryData) {
  if (!surgeryData) return false

  // 检查是否有structured_data
  const hasStructuredData = surgeryData.structured_data ||
                           surgeryData.postgresql_row_preview?.structured_data

  // 检查structured_data中是否有必要字段
  if (hasStructuredData) {
    const structuredData = surgeryData.structured_data || surgeryData.postgresql_row_preview.structured_data
    return !!(structuredData.arms || structuredData.timeline || structuredData.power_cycles)
  }

  return false
}

/**
 * 从手术数据中提取可视化所需的数据
 * @param {Object} surgeryData - 手术数据
 * @returns {Object} 提取的数据
 */
export function extractVisualizationData (surgeryData) {
  if (!surgeryData) return null

  // 如果是PostgreSQL格式的数据，需要保留基本信息并合并structured_data
  if (surgeryData.structured_data) {
    // 保留外层的基本信息，并将structured_data合并进去
    return {
      ...surgeryData.structured_data,
      // 保留关键的基本信息（优先使用外层值，即使为false也要保留）
      surgery_id: surgeryData.surgery_id !== undefined ? surgeryData.surgery_id : surgeryData.structured_data.surgery_id,
      start_time: surgeryData.start_time !== undefined ? surgeryData.start_time : surgeryData.structured_data.start_time,
      end_time: surgeryData.end_time !== undefined ? surgeryData.end_time : surgeryData.structured_data.end_time,
      is_remote: surgeryData.is_remote !== undefined ? surgeryData.is_remote : surgeryData.structured_data.is_remote,
      device_ids: surgeryData.device_ids !== undefined ? surgeryData.device_ids : surgeryData.structured_data.device_ids,
      source_log_ids: surgeryData.source_log_ids !== undefined ? surgeryData.source_log_ids : surgeryData.structured_data.source_log_ids
    }
  }

  // 其次使用postgresql_row_preview中的structured_data
  if (surgeryData.postgresql_row_preview?.structured_data) {
    const preview = surgeryData.postgresql_row_preview
    return {
      ...preview.structured_data,
      // 保留关键的基本信息（优先使用外层值，即使为false也要保留）
      surgery_id: preview.surgery_id !== undefined ? preview.surgery_id : preview.structured_data?.surgery_id,
      start_time: preview.start_time !== undefined ? preview.start_time : preview.structured_data?.start_time,
      end_time: preview.end_time !== undefined ? preview.end_time : preview.structured_data?.end_time,
      is_remote: preview.is_remote !== undefined ? preview.is_remote : preview.structured_data?.is_remote,
      device_ids: preview.device_ids !== undefined ? preview.device_ids : preview.structured_data?.device_ids,
      source_log_ids: preview.source_log_ids !== undefined ? preview.source_log_ids : preview.structured_data?.source_log_ids
    }
  }

  // 最后返回原始数据
  return surgeryData
}
