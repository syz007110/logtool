<template>
  <div class="page">
    <!-- 顶部导航栏 -->
    <div class="mobile-header">
      <div class="header-container">
        <van-icon name="arrow-left" class="back-icon" @click="$router.back()" />
        <div class="header-title">
          <span v-if="logInfo">
            {{ logInfo.original_name || '-' }} ({{ formatFileSize(logInfo.size) }})
          </span>
          <span v-else>{{ $t('mobile.titles.logDetail') }}</span>
        </div>
      </div>
    </div>

    <!-- 筛选按钮组（固定定位） -->
    <div class="filter-buttons-container">
      <div class="filter-buttons">
        <button
          v-for="option in analysisLevelOptions"
          :key="option.value"
          :class="['filter-button', { active: analysisLevelFilter === option.value }]"
          @click="handleAnalysisLevelChange(option.value)"
        >
          {{ option.text }}
        </button>
      </div>
      
      <!-- 搜索表达式展示 -->
      <div class="filter-summary" v-if="analysisLevelLabel !== '未选择分析等级' || searchExpression">
        <div class="filter-item" v-if="analysisLevelLabel !== '未选择分析等级'">
          <span class="label">分析等级：</span>
          <span class="tag">{{ analysisLevelLabel }}</span>
        </div>
        <div class="filter-item" v-if="searchExpression">
          <span class="label">搜索表达式：</span>
          <span class="expr">{{ searchExpression }}</span>
          <van-icon 
            v-if="hasActiveFilters"
            name="cross" 
            class="clear-filter-icon" 
            @click="clearFilters"
          />
        </div>
      </div>
    </div>

    <div class="content">
      <!-- 日志条目列表 -->
      <div class="entries-list">
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="entry-card"
        >
          <div class="entry-header">
            <div class="entry-time">{{ formatTimestamp(entry.timestamp) }}</div>
            <span 
              v-if="entry.error_code" 
              :class="['error-code-badge', getErrorCodeClass(entry.error_code)]"
            >
              {{ entry.error_code }}
            </span>
          </div>
          <div class="entry-content">
            {{ entry.explanation || entry.message || '-' }}
          </div>
        </div>
      </div>

      <!-- 底部统计 -->
      <div v-if="!hasActiveFilters" class="footer-stats">
        {{ $t('mobile.logView.displayStats', { current: filteredEntries.length, total: allEntries.length }) }}
      </div>

      <!-- 空状态 -->
      <van-empty
        v-if="!loading && filteredEntries.length === 0"
        :description="$t('shared.noData')"
        class="empty-state"
      />

      <!-- 加载状态 -->
      <van-loading v-if="loading" class="loading-state" />
    </div>
    
    <!-- 悬浮搜索按钮 -->
    <div class="search-fab-container">
      <van-popover
        :show="showSearchPopover"
        @update:show="showSearchPopover = $event"
        theme="dark"
        placement="top-end"
        :actions="[
          { text: '时间筛选', icon: 'clock-o' },
          { text: '关键字搜索', icon: 'search' },
          { text: '常用标签', icon: 'label-o' }
        ]"
        @select="(action, index) => {
          if (index === 0) openTimeDrawer()
          else if (index === 1) openSearchDrawer()
          else if (index === 2) openTagDrawer()
        }"
      >
        <template #reference>
          <div 
            class="search-fab"
            :class="{ 'has-filters': hasActiveFilters }"
          >
            <van-icon name="search" />
          </div>
        </template>
      </van-popover>
    </div>
    
    <!-- 关键字搜索抽屉 -->
    <van-popup
      :show="showSearchDrawer"
      @update:show="showSearchDrawer = $event"
      position="bottom"
      :style="{ height: '40%' }"
      round
    >
      <div class="drawer-content">
        <div class="drawer-header">
          <h3>关键字搜索</h3>
          <van-icon name="cross" @click="closeDrawer" />
        </div>
        <div class="drawer-body">
          <van-field
            v-model="searchQuery"
            placeholder="搜索关键词或故障码"
            clearable
            autofocus
          />
        </div>
        <div class="drawer-footer">
          <van-button type="primary" block @click="applySearch">确定</van-button>
        </div>
      </div>
    </van-popup>
    
    <!-- 时间筛选抽屉 -->
    <van-popup
      :show="showTimeDrawer"
      @update:show="showTimeDrawer = $event"
      position="bottom"
      :style="{ height: '50%' }"
      round
    >
      <div class="drawer-content">
        <div class="drawer-header">
          <h3>时间筛选</h3>
          <van-icon name="cross" @click="closeDrawer" />
        </div>
        <div class="drawer-body">
          <van-cell-group>
            <van-cell title="开始时间">
              <template #value>
                <input
                  v-model="startTimeFormatted"
                  type="datetime-local"
                  class="time-input"
                  @change="handleStartTimeChange"
                />
              </template>
            </van-cell>
            <van-cell title="结束时间">
              <template #value>
                <input
                  v-model="endTimeFormatted"
                  type="datetime-local"
                  class="time-input"
                  @change="handleEndTimeChange"
                />
              </template>
            </van-cell>
          </van-cell-group>
          <van-button
            type="default"
            size="small"
            style="margin-top: 12px;"
            @click="startTime = null; endTime = null"
          >
            清除时间
          </van-button>
        </div>
        <div class="drawer-footer">
          <van-button type="primary" block @click="applySearch">确定</van-button>
        </div>
      </div>
    </van-popup>
    
    <!-- 常用标签抽屉 -->
    <van-popup
      :show="showTagDrawer"
      @update:show="showTagDrawer = $event"
      position="bottom"
      :style="{ height: '50%' }"
      round
    >
      <div class="drawer-content">
        <div class="drawer-header">
          <h3>常用标签</h3>
          <van-icon name="cross" @click="closeDrawer" />
        </div>
        <div class="drawer-body">
          <div class="tag-options">
            <van-button
              v-for="template in templates"
              :key="template.name"
              :type="tagFilter === template.name ? 'primary' : 'default'"
              size="small"
              style="margin: 4px;"
              @click="applyTemplate(template)"
            >
              {{ template.name }}
            </van-button>
            <van-button
              v-if="templates.length === 0"
              type="default"
              size="small"
              style="margin: 4px;"
              disabled
            >
              暂无常用标签
            </van-button>
          </div>
        </div>
        <div class="drawer-footer">
          <van-button type="primary" block @click="applySearch">确定</van-button>
        </div>
      </div>
    </van-popup>
    
  </div>
</template>

<script>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { 
  Empty as VanEmpty,
  Icon as VanIcon,
  Loading as VanLoading,
  Popover as VanPopover,
  Popup as VanPopup,
  Field as VanField,
  Button as VanButton,
  Cell as VanCell,
  CellGroup as VanCellGroup
} from 'vant'
import api from '@/api'

export default {
  name: 'MLogView',
  components: {
    'van-empty': VanEmpty,
    'van-icon': VanIcon,
    'van-loading': VanLoading,
    'van-popover': VanPopover,
    'van-popup': VanPopup,
    'van-field': VanField,
    'van-button': VanButton,
    'van-cell': VanCell,
    'van-cell-group': VanCellGroup
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const store = useStore()
    const { t } = useI18n()
    // 参考桌面端处理方式，直接使用路由参数，保持字符串类型
    const logId = route.params?.logId || route.query?.logId || ''
    const logInfo = ref(null)
    const allEntries = ref([])
    const loading = ref(false)
    const analysisLevelFilter = ref('KEY') // 默认选中关键日志，与桌面端保持一致
    const analysisCategories = ref([])
    const selectedAnalysisCategoryIds = ref([])
    const analysisPresets = ref({ ALL: [], FINE: [], KEY: [] })
    
    // 搜索相关状态
    const searchQuery = ref('')
    const startTime = ref(null)
    const endTime = ref(null)
    const tagFilter = ref(null) // 改为存储选中的模板名称
    const templates = ref([]) // 从后端加载的搜索模板
    const showSearchPopover = ref(false)
    const showSearchDrawer = ref(false)
    const showTimeDrawer = ref(false)
    const showTagDrawer = ref(false)
    const activeDrawer = ref(null) // 'search' | 'time' | 'tag' | null

    const analysisLevelOptions = [
      { text: '全量日志', value: 'ALL' },
      { text: '精细日志', value: 'FINE' },
      { text: '关键日志', value: 'KEY' }
    ]

    const filteredEntries = computed(() => {
      // 移动端筛选主要在后端完成，前端只做简单处理
      return [...allEntries.value]
    })

    const fetchLogInfo = async () => {
      if (!logId) {
        showToast(t('mobile.logView.logIdRequired'))
        router.back()
        return
      }
      try {
        const response = await api.logs.getList({ page: 1, limit: 1000 })
        const logs = response?.data?.logs || []
        // 使用宽松相等比较，参考桌面端处理方式
        const log = logs.find(l => l.id == logId)
        if (log) {
          logInfo.value = log
        } else {
          showToast(t('mobile.logView.logNotFound'))
          router.back()
        }
      } catch (error) {
        console.error('Failed to fetch log info:', error)
        showToast(t('mobile.logView.loadFailed'))
        router.back()
      }
    }

    const fetchLogEntries = async () => {
      if (!logId) {
        return
      }
      loading.value = true
      try {
        // 使用批量查询接口，与桌面端保持一致，支持分析分类筛选
        const params = {
          log_ids: String(logId),
          page: 1,
          limit: 10000 // 移动端一次性加载所有条目，可根据需要调整
        }
        
        // 添加分析分类筛选参数
        if (selectedAnalysisCategoryIds.value?.length > 0) {
          params.analysis_category_ids = selectedAnalysisCategoryIds.value.join(',')
        }
        
        // 添加搜索关键词
        if (searchQuery.value) {
          params.search = searchQuery.value
        }
        
        // 添加时间范围筛选
        if (startTime.value) {
          params.start_time = formatTimestamp(startTime.value)
        }
        if (endTime.value) {
          params.end_time = formatTimestamp(endTime.value)
        }
        
        // 如果选择了模板，尝试应用模板的筛选条件
        if (tagFilter.value) {
          const template = templates.value.find(t => t.name === tagFilter.value)
          if (template && template.filters) {
            // 将模板的筛选条件转换为 filters 参数（与桌面端保持一致）
            const filtersPayload = {
              logic: template.filters.logic || 'AND',
              conditions: Array.isArray(template.filters.conditions) ? template.filters.conditions : []
            }
            if (filtersPayload.conditions.length > 0) {
              params.filters = JSON.stringify(filtersPayload)
            }
          }
        }
        
        const response = await api.logs.getBatchEntries(params)
        // 处理响应格式，参考桌面端处理方式
        const entries = response?.data?.entries || response?.entries || response?.data || []
        if (!Array.isArray(entries)) {
          console.warn('Log entries response is not an array:', entries)
          allEntries.value = []
          return
        }
        
        // 处理标准格式的条目数据
          allEntries.value = entries.map(entry => ({
            id: entry.id || entry.timestamp,
            timestamp: entry.timestamp || entry.ts,
            error_code: entry.error_code || entry.e,
            explanation: entry.explanation || entry.exp,
            message: entry.message || entry.msg,
            param1: entry.param1 || entry.p1,
            param2: entry.param2 || entry.p2,
            param3: entry.param3 || entry.p3,
            param4: entry.param4 || entry.p4
          }))
      } catch (error) {
        console.error('Failed to fetch log entries:', error)
        showToast(t('mobile.logView.loadFailed'))
        allEntries.value = []
      } finally {
        loading.value = false
      }
    }

    const formatFileSize = (bytes) => {
      if (!bytes) return '-'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const formatTime = (time) => {
      if (!time) return '-'
      return new Date(time).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    const formatTimestamp = (timestamp) => {
      if (!timestamp) return '-'
      const date = new Date(timestamp)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    const handleAnalysisLevelChange = async (value) => {
      analysisLevelFilter.value = value
      if (analysisPresets.value[value] && Array.isArray(analysisPresets.value[value])) {
        selectedAnalysisCategoryIds.value = [...analysisPresets.value[value]]
      } else {
        selectedAnalysisCategoryIds.value = []
      }
      // 分析等级改变时重新加载数据
      await fetchLogEntries()
    }

    const loadAnalysisPresets = async () => {
      try {
        const [cats, presetsRes] = await Promise.all([
          api.analysisCategories.getList({ is_active: true }),
          api.analysisCategories.getPresets()
        ])
        analysisCategories.value = cats?.data?.categories || []
        const presets = presetsRes?.data?.presets || { ALL: [], FINE: [], KEY: [] }
        analysisPresets.value = presets
        
        // 根据后端提供的 rolePreset 进行默认选择（与桌面端保持一致）
        const rolePresetMap = presetsRes?.data?.rolePreset || {}
        const roleId = String(store.state.auth?.user?.role_id || '')
        const presetKey = rolePresetMap[roleId] || rolePresetMap.default || 'KEY'
        if (presets[presetKey]) {
          selectedAnalysisCategoryIds.value = [...presets[presetKey]]
          analysisLevelFilter.value = presetKey
        } else {
          // 如果没有找到预设，默认使用 KEY
          selectedAnalysisCategoryIds.value = presets.KEY ? [...presets.KEY] : []
          analysisLevelFilter.value = 'KEY'
        }
      } catch (error) {
        console.error('Failed to load analysis presets:', error)
        // 如果加载失败，默认使用 KEY
        selectedAnalysisCategoryIds.value = []
        analysisLevelFilter.value = 'KEY'
      }
    }

    onMounted(async () => {
      if (!logId) {
        showToast(t('mobile.logView.logIdRequired'))
        router.back()
        return
      }
      // 先加载分析预设和搜索模板，再加载日志条目（因为加载条目需要用到分析分类ID）
      await Promise.all([fetchLogInfo(), loadAnalysisPresets(), loadTemplates()])
      // 分析预设加载完成后再加载日志条目
      await fetchLogEntries()
    })
    
    // 搜索相关方法
    const openSearchDrawer = () => {
      showSearchPopover.value = false
      activeDrawer.value = 'search'
      showSearchDrawer.value = true
    }
    
    const openTimeDrawer = () => {
      showSearchPopover.value = false
      activeDrawer.value = 'time'
      showTimeDrawer.value = true
    }
    
    const openTagDrawer = () => {
      showSearchPopover.value = false
      activeDrawer.value = 'tag'
      showTagDrawer.value = true
    }
    
    const closeDrawer = () => {
      showSearchDrawer.value = false
      showTimeDrawer.value = false
      showTagDrawer.value = false
      activeDrawer.value = null
    }
    
    const applySearch = async () => {
      closeDrawer()
      await fetchLogEntries()
    }
    
    const clearFilters = async () => {
      searchQuery.value = ''
      startTime.value = null
      endTime.value = null
      tagFilter.value = null
      await fetchLogEntries()
    }
    
    const hasActiveFilters = computed(() => {
      return !!(searchQuery.value || startTime.value || endTime.value || tagFilter.value)
    })
    
    // 分析等级标签（参考桌面端）
    const sameSet = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b)) return false
      if (a.length !== b.length) return false
      const sa = new Set(a)
      for (const x of b) if (!sa.has(x)) return false
      return true
    }
    
    const analysisLevelLabel = computed(() => {
      const ids = selectedAnalysisCategoryIds.value
      if (!ids || ids.length === 0) return '未选择分析等级'
      const allEq = sameSet(ids, analysisPresets.value.ALL)
      const fineEq = sameSet(ids, analysisPresets.value.FINE)
      const keyEq = sameSet(ids, analysisPresets.value.KEY)
      if (allEq) return '全量日志'
      if (fineEq) return '精细日志'
      if (keyEq) return '关键日志'
      return '自定义'
    })
    
    // 加载搜索模板（参考桌面端）
    const loadTemplates = async () => {
      try {
        const res = await api.logs.getSearchTemplates()
        templates.value = res.data.templates || []
      } catch (error) {
        console.error('Failed to load search templates:', error)
        templates.value = []
      }
    }
    
    // 应用模板（参考桌面端）
    const applyTemplate = (template) => {
      if (!template) return
      
      // 如果模板有筛选条件，尝试提取可用的信息
      if (template.filters && template.filters.conditions) {
        // 提取时间范围
        const timeCondition = template.filters.conditions.find(
          c => c.field === 'timestamp' && c.operator === 'between' && Array.isArray(c.value)
        )
        if (timeCondition && timeCondition.value.length === 2) {
          startTime.value = new Date(timeCondition.value[0])
          endTime.value = new Date(timeCondition.value[1])
        }
        
        // 提取关键词（从 explanation 字段的 contains 条件）
        const keywordCondition = template.filters.conditions.find(
          c => c.field === 'explanation' && (c.operator === 'contains' || c.operator === 'like')
        )
        if (keywordCondition && keywordCondition.value) {
          searchQuery.value = String(keywordCondition.value)
        }
        
        // 提取故障码（从 error_code 字段的条件）
        const errorCodeCondition = template.filters.conditions.find(
          c => c.field === 'error_code'
        )
        if (errorCodeCondition) {
          if (errorCodeCondition.operator === '=' && errorCodeCondition.value) {
            // 如果是等于，添加到搜索关键词
            if (searchQuery.value) {
              searchQuery.value += ` ${errorCodeCondition.value}`
            } else {
              searchQuery.value = String(errorCodeCondition.value)
            }
          } else if (errorCodeCondition.operator === 'contains' && errorCodeCondition.value) {
            // 如果包含，添加到搜索关键词
            if (searchQuery.value) {
              searchQuery.value += ` ${errorCodeCondition.value}`
            } else {
              searchQuery.value = String(errorCodeCondition.value)
            }
          }
        }
      }
      
      // 标记选中的模板
      tagFilter.value = template.name
    }
    
    // 搜索表达式（参考桌面端）
    const searchExpression = computed(() => {
      const segments = []
      if (startTime.value && endTime.value) {
        segments.push(`时间: ${formatTimestamp(startTime.value)} ~ ${formatTimestamp(endTime.value)}`)
      } else if (startTime.value) {
        segments.push(`时间: 自 ${formatTimestamp(startTime.value)}`)
      } else if (endTime.value) {
        segments.push(`时间: 至 ${formatTimestamp(endTime.value)}`)
      }
      if (searchQuery.value) {
        segments.push(`关键词: ${searchQuery.value}`)
      }
      if (tagFilter.value) {
        const template = templates.value.find(t => t.name === tagFilter.value)
        if (template) {
          segments.push(`标签: ${template.name}`)
        }
      }
      return segments.join('，')
    })
    
    // 根据故障码结尾字母返回对应的CSS类名
    const getErrorCodeClass = (errorCode) => {
      if (!errorCode) return 'error-code-default'
      const code = String(errorCode).toLowerCase().trim()
      const lastChar = code.charAt(code.length - 1)
      if (lastChar === 'a') return 'error-code-a'
      if (lastChar === 'b') return 'error-code-b'
      if (lastChar === 'c') return 'error-code-c'
      return 'error-code-default'
    }
    
    // 时间格式化：将 Date 对象转换为 datetime-local 输入框需要的格式 (YYYY-MM-DDTHH:mm)
    const formatDateTimeLocal = (date) => {
      if (!date) return ''
      const d = new Date(date)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    }
    
    // 时间格式化：将 datetime-local 格式转换为 Date 对象
    const parseDateTimeLocal = (value) => {
      if (!value) return null
      return new Date(value)
    }
    
    // 计算属性：开始时间格式化
    const startTimeFormatted = computed({
      get: () => formatDateTimeLocal(startTime.value),
      set: (val) => {
        startTime.value = parseDateTimeLocal(val)
      }
    })
    
    // 计算属性：结束时间格式化
    const endTimeFormatted = computed({
      get: () => formatDateTimeLocal(endTime.value),
      set: (val) => {
        endTime.value = parseDateTimeLocal(val)
      }
    })
    
    // 处理开始时间变化
    const handleStartTimeChange = (event) => {
      const value = event.target.value
      startTime.value = parseDateTimeLocal(value)
    }
    
    // 处理结束时间变化
    const handleEndTimeChange = (event) => {
      const value = event.target.value
      endTime.value = parseDateTimeLocal(value)
    }

    return {
      logInfo,
      allEntries,
      filteredEntries,
      loading,
      analysisLevelFilter,
      analysisLevelOptions,
      formatFileSize,
      formatTime,
      formatTimestamp,
      handleAnalysisLevelChange,
      // 搜索相关
      searchQuery,
      startTime,
      endTime,
      tagFilter,
      showSearchPopover,
      showSearchDrawer,
      showTimeDrawer,
      showTagDrawer,
      activeDrawer,
      openSearchDrawer,
      openTimeDrawer,
      openTagDrawer,
      closeDrawer,
      applySearch,
      clearFilters,
      hasActiveFilters,
      templates,
      startTimeFormatted,
      endTimeFormatted,
      handleStartTimeChange,
      handleEndTimeChange,
      analysisLevelLabel,
      searchExpression,
      getErrorCodeClass,
      applyTemplate
    }
  }
}
</script>

<style scoped>
.page {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  background-color: #f7f8fa;
  /* 底部留白由 App.vue 全局样式统一设置 */
  box-sizing: border-box;
}

/* 顶部导航栏 */
.mobile-header {
  position: fixed;
  /* 从 viewport 顶部开始 */
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: #fff;
  border-bottom: 1.439px solid rgba(0, 0, 0, 0.1);
  padding: 14px 16px;
  /* 顶部安全区域：防止被前置摄像头遮挡 */
  padding-top: max(14px, calc(env(safe-area-inset-top) + 14px));
}

.header-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-icon {
  font-size: 20px;
  color: #323233;
  cursor: pointer;
  flex-shrink: 0;
}

.header-title {
  flex: 1;
  font-size: 16px;
  font-weight: 400;
  color: #000;
  line-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 筛选按钮组（固定定位） */
.filter-buttons-container {
  position: fixed;
  /* header高度：padding-top(max(14px, safe-area + 14px)) + 内容高度(24px) + padding-bottom(14px) */
  top: calc(max(14px, calc(env(safe-area-inset-top) + 14px)) + 24px + 14px);
  left: 0;
  right: 0;
  z-index: 99;
  background-color: #fff;
  border-bottom: 1.439px solid rgba(0, 0, 0, 0.1);
  padding: 8px;
}

.filter-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
}

.filter-button {
  flex: 1;
  height: 32px;
  border-radius: 8px;
  border: 1.439px solid rgba(0, 0, 0, 0.1);
  background-color: #fff;
  color: #000;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  cursor: pointer;
  padding: 0;
  outline: none;
  transition: all 0.2s;
}

.filter-button.active {
  background-color: #155dfc;
  color: #fff;
  border-color: #155dfc;
}

/* 搜索表达式展示样式（参考桌面端） */
.filter-summary {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-item {
  font-size: 11px;
  color: #606266;
  padding: 4px 8px;
  background: #f9fafb;
  border: 1px dashed #e4e7ed;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.4;
}

.filter-item .label {
  font-weight: 500;
  color: #303133;
  flex-shrink: 0;
}

.filter-item .tag {
  color: #409eff;
  font-weight: 500;
}

.filter-item .expr {
  color: #606266;
  word-break: break-all;
  flex: 1;
}

.clear-filter-icon {
  font-size: 14px;
  color: #969799;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: 6px;
  padding: 2px;
  transition: color 0.2s;
}

.clear-filter-icon:active {
  color: #323233;
  opacity: 0.6;
}

.filter-button:active {
  opacity: 0.8;
}

.content {
  padding: 12px;
  /* 增加底部 padding，确保滚动能正确触发（移除底部导航栏后需要更多空间） */
  padding-bottom: max(20px, env(safe-area-inset-bottom) + 20px);
  /* 给固定区域留出空间：header高度 + 筛选按钮组高度（筛选按钮组padding 16px + 按钮高度32px + 搜索表达式区域约40px = 约88px） */
  padding-top: calc(max(14px, calc(env(safe-area-inset-top) + 14px)) + 24px + 14px + 88px);
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.entry-card {
  background-color: #fff;
  border: 1.439px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  padding: 9.42px;
  box-sizing: border-box;
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  min-height: 22.85px;
}

.entry-time {
  font-size: 12px;
  font-weight: 400;
  color: #6a7282;
  line-height: 16px;
  flex-shrink: 0;
}

.error-code-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  padding: 3.44px 9.44px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  height: 22.85px;
  flex-shrink: 0;
}

/* 故障码背景颜色：根据结尾字母 */
.error-code-badge.error-code-a {
  background-color: #d4183d; /* 红色 */
}

.error-code-badge.error-code-b {
  background-color: #ff9800; /* 橙色 */
}

.error-code-badge.error-code-c {
  background-color: #26a69a; /* 蓝绿色 */
}

.error-code-badge.error-code-default {
  background-color: #9e9e9e; /* 浅灰色 */
}

.entry-content {
  font-size: 12px;
  font-weight: 400;
  color: #364153;
  line-height: 19.5px;
  word-break: break-word;
}

.footer-stats {
  text-align: center;
  font-size: 12px;
  color: #969799;
  padding: 12px 0;
}

.empty-state {
  margin-top: 60px;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

/* 悬浮搜索按钮 */
.search-fab-container {
  position: fixed;
  right: 16px;
  bottom: 80px;
  z-index: 200;
}

.search-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #fff;
  color: #323233;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid #ebedf0;
}

.search-fab.has-filters {
  background-color: #155dfc;
  color: #fff;
  border-color: #155dfc;
}

.search-fab:active {
  opacity: 0.8;
  transform: scale(0.95);
}

.search-fab .van-icon {
  font-size: 24px;
}

/* 抽屉样式 */
.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebedf0;
  margin-bottom: 16px;
}

.drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #323233;
}

.drawer-header .van-icon {
  font-size: 20px;
  color: #969799;
  cursor: pointer;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
}

.drawer-footer {
  padding-top: 16px;
  border-top: 1px solid #ebedf0;
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.time-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ebedf0;
  border-radius: 4px;
  font-size: 14px;
  color: #323233;
  background-color: #fff;
  box-sizing: border-box;
}

.time-input:focus {
  outline: none;
  border-color: #155dfc;
}

</style>

