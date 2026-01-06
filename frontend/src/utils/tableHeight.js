/**
 * 表格高度计算工具
 * 统一管理不同页面的表格高度计算，避免魔法数
 */

// 常量定义
const HEIGHTS = {
  // 固定高度
  HEADER_HEIGHT: 64, // 顶部导航栏高度
  PAGINATION_HEIGHT: 20, // 翻页器高度
  ACTION_BAR_HEIGHT: 80, // 操作栏高度
  SEARCH_BAR_HEIGHT: 120, // 搜索栏高度（包含多行搜索条件）
  TABS_HEIGHT: 40, // Tabs 标签页高度
  CONTAINER_PADDING: 28, // 容器内边距（上下）
  CONTENT_MARGIN: 20 // 内容边距
}

// 计算基础表格高度（窗口高度 - 固定元素）
function calculateBaseTableHeight (hasTabs = false, hasSearchBar = false, hasActionBar = true) {
  let height = window.innerHeight - HEIGHTS.HEADER_HEIGHT - HEIGHTS.CONTAINER_PADDING - HEIGHTS.CONTENT_MARGIN

  if (hasTabs) {
    height -= HEIGHTS.TABS_HEIGHT
  }

  if (hasSearchBar) {
    height -= HEIGHTS.SEARCH_BAR_HEIGHT
  } else if (hasActionBar) {
    height -= HEIGHTS.ACTION_BAR_HEIGHT
  }

  height -= HEIGHTS.PAGINATION_HEIGHT

  return Math.max(height, 200) // 最小高度200px
}

// 页面类型配置
const PAGE_CONFIGS = {
  // 基础页面（只有操作栏）
  basic: {
    hasTabs: false,
    hasSearchBar: false,
    hasActionBar: true
  },
  // 带搜索栏的页面
  withSearch: {
    hasTabs: false,
    hasSearchBar: true,
    hasActionBar: false
  },
  // 配置管理子页面（有tabs和操作栏）
  configSubPage: {
    hasTabs: true,
    hasSearchBar: false,
    hasActionBar: true
  }
}

/**
 * 获取表格高度计算函数
 * @param {string} pageType - 页面类型 ('basic' | 'withSearch' | 'configSubPage')
 * @returns {function} 计算表格高度的函数
 */
export function getTableHeightCalculator (pageType = 'basic') {
  const config = PAGE_CONFIGS[pageType]

  if (!config) {
    console.warn(`Unknown page type: ${pageType}, using 'basic' as default`)
    return () => calculateBaseTableHeight()
  }

  return () => calculateBaseTableHeight(config.hasTabs, config.hasSearchBar, config.hasActionBar)
}

/**
 * 直接获取表格高度值
 * @param {string} pageType - 页面类型
 * @returns {number} 表格高度
 */
export function getTableHeight (pageType = 'basic') {
  return getTableHeightCalculator(pageType)()
}

/**
 * 创建响应式的表格高度计算器
 * @param {string} pageType - 页面类型
 * @returns {ComputedRef<number>} Vue 3 响应式计算属性
 */
export function useTableHeight (pageType = 'basic') {
  // 在 Vue 组件中使用时需要导入 computed
  // 这里返回计算函数，由调用方包装为 computed
  return getTableHeightCalculator(pageType)
}

// 导出常量，方便调试和自定义计算
export { HEIGHTS }
