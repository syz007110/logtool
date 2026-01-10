import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

/**
 * 删除确认 Composable Pattern
 * 统一处理删除操作的二次确认弹窗
 *
 * 符合 UIPROMPT.md 规范：
 * - Pattern 优先：重复使用的删除确认逻辑抽象为 composable（重复使用 ≥ 3 次）
 * - 语义优先：确认按钮使用危险按钮样式（通过 confirmButtonClass）
 * - Token 定规则：按钮样式使用 Design Token（在 design-tokens.css 中定义）
 *
 * 使用示例：
 * ```javascript
 * const { confirmDelete } = useDeleteConfirm({
 *   message: '确定要删除吗？',
 *   title: '删除确认'
 * })
 *
 * const handleDelete = async (row) => {
 *   const confirmed = await confirmDelete(row, {
 *     message: `确定要删除 ${row.name} 吗？`
 *   })
 *   if (confirmed) {
 *     await api.delete(row.id)
 *     ElMessage.success('删除成功')
 *   }
 * }
 * ```
 *
 * @param {Object} options - 默认配置选项
 * @param {string} options.message - 默认确认消息文本
 * @param {string} options.title - 默认弹窗标题
 * @returns {Function} confirmDelete 函数
 */
export function useDeleteConfirm (options = {}) {
  const { t } = useI18n()

  const {
    message: defaultMessage,
    title: defaultTitle
  } = options

  /**
   * 执行删除确认
   * @param {any} row - 要删除的数据行（可选，用于自定义消息）
   * @param {Object} customOptions - 自定义选项（可选）
   * @param {string} customOptions.message - 自定义确认消息
   * @param {string} customOptions.title - 自定义弹窗标题
   * @returns {Promise<boolean>} 返回 true 表示用户确认，false 表示取消
   */
  const confirmDelete = async (row = null, customOptions = {}) => {
    try {
      // 合并默认选项和自定义选项
      const finalMessage = customOptions.message || defaultMessage || t('shared.messages.deleteConfirm')
      const finalTitle = customOptions.title || defaultTitle || t('shared.messages.deleteConfirmTitle')

      await ElMessageBox.confirm(
        finalMessage,
        finalTitle,
        {
          confirmButtonText: t('shared.confirm'),
          cancelButtonText: t('shared.cancel'),
          type: 'warning',
          // 允许自定义选项覆盖
          ...customOptions,
          // 确认按钮使用危险按钮样式（使用 Design Token）- 优先级最高，确保不被覆盖
          confirmButtonClass: customOptions.confirmButtonClass || 'btn-primary-danger',
          cancelButtonClass: customOptions.cancelButtonClass || 'btn-secondary'
        }
      )

      return true
    } catch (error) {
      // 用户取消操作，返回 false
      if (error === 'cancel') {
        return false
      }
      // 其他错误重新抛出
      throw error
    }
  }

  return {
    confirmDelete
  }
}
