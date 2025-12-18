/**
 * 敏感数据脱敏工具函数
 */

/**
 * 脱敏医院名称
 * 有设备管理权限的用户可以看到完整信息，无权限的用户只能看到前两个字 + "*"
 * 如果医院名称为空（未设置），则不需要敏感显示，直接返回原值
 * @param {string} hospitalName - 医院名称
 * @param {boolean} hasPermission - 是否有设备管理权限（device:read）
 * @returns {string} 处理后的医院名称
 */
export const maskHospitalName = (hospitalName, hasPermission) => {
  // 如果医院名称为空（未设置），不需要敏感显示，返回空字符串
  // 包括：null、undefined、空字符串、'-'、'未设置'等
  if (!hospitalName || 
      hospitalName === '-' || 
      hospitalName === '未设置' ||
      hospitalName.trim() === '' ||
      hospitalName.trim() === '未设置') {
    return ''
  }

  // 有权限，显示完整信息
  if (hasPermission) {
    return hospitalName
  }

  // 无权限，脱敏处理：前两个字 + "*"
  const trimmed = hospitalName.trim()
  if (trimmed.length <= 2) {
    // 如果长度小于等于2，只显示一个字符 + "*"
    return trimmed.length > 0 ? trimmed[0] + '*' : '*'
  }

  // 提取前两个字
  const firstTwo = trimmed.substring(0, 2)
  return firstTwo + '*'
}

