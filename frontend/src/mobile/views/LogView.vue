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
    <div class="filter-buttons-container" ref="filterContainerRef">
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

      <div v-if="searchExpression" class="filter-summary">
        <van-icon name="notes-o" class="filter-summary-icon" />
        <span class="filter-summary-text">{{ searchExpression }}</span>
        <van-icon
          v-if="hasActiveFilters"
          name="cross"
          class="filter-summary-clear"
          @click="clearFilters"
        />
      </div>
    </div>

    <div class="content" :style="{ paddingTop: contentPaddingTop }">
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
      <div 
        class="search-fab"
        :class="{ 'has-filters': hasActiveFilters }"
        @click="showSearchActionSheet = true"
      >
        <van-icon name="search" />
      </div>
    </div>
    
    <!-- 搜索操作菜单（底部弹出，标签页形式） -->
    <van-popup
      :show="showSearchActionSheet"
      @update:show="showSearchActionSheet = $event"
      position="bottom"
      :style="{ height: 'auto', maxHeight: '70%' }"
      round
      @click-overlay="showSearchActionSheet = false"
    >
      <div class="search-menu-content">
        <!-- 拖拽指示条 -->
        <div class="search-menu-handle"></div>
        
        <!-- 标题区域 -->
        <div class="search-menu-header">
          <div class="search-menu-title">
            <van-icon name="filter-o" class="search-menu-title-icon" />
            <h2>日志筛选</h2>
          </div>
          <p class="search-menu-description">通过多种方式筛选和查找日志</p>
        </div>
        
        <!-- 标签页导航 -->
        <div class="search-menu-tabs">
          <div class="search-tabs-container">
            <div
              v-for="(action, index) in searchActions"
              :key="action.name"
              :class="['search-tab-item', { active: selectedSearchTab === index }]"
              @click="selectedSearchTab = index"
            >
              <van-icon :name="action.icon" class="search-tab-icon" />
              <span class="search-tab-text">{{ action.name }}</span>
            </div>
          </div>
        </div>
        
        <!-- 标签页内容 -->
        <div class="search-menu-body">
          <!-- 关键字搜索 -->
          <div v-if="selectedSearchTab === 0" class="search-tab-panel">
            <van-field
              v-model="tempSearchQuery"
              placeholder="搜索关键词或故障码"
              clearable
              class="search-input-field"
            />
            <van-button type="primary" block class="search-confirm-btn" @click="handleKeywordConfirm">
              确定
            </van-button>
          </div>
          
          <!-- 常用标签 -->
          <div v-if="selectedSearchTab === 1" class="search-tab-panel">
            <div class="tag-options">
              <van-button
                v-for="template in templates"
                :key="template.name"
                :type="tempTagFilter === template.name ? 'primary' : 'default'"
                size="small"
                class="tag-option-btn"
                @click="handleTagSelect(template)"
              >
                {{ template.name }}
              </van-button>
              <van-button
                v-if="templates.length === 0"
                type="default"
                size="small"
                class="tag-option-btn"
                disabled
              >
                暂无常用标签
              </van-button>
            </div>
            <van-button type="primary" block class="search-confirm-btn" @click="handleTagConfirm">
              确定
            </van-button>
          </div>
          
          <!-- 时间筛选 -->
          <div v-if="selectedSearchTab === 2" class="search-tab-panel">
            <van-cell-group>
              <van-cell title="开始时间">
                <template #value>
                  <input
                    v-model="tempStartTimeFormatted"
                    type="datetime-local"
                    class="time-input"
                    @change="handleTempStartTimeChange"
                  />
                </template>
              </van-cell>
              <van-cell title="结束时间">
                <template #value>
                  <input
                    v-model="tempEndTimeFormatted"
                    type="datetime-local"
                    class="time-input"
                    @change="handleTempEndTimeChange"
                  />
                </template>
              </van-cell>
            </van-cell-group>
            <van-button
              type="default"
              size="small"
              class="clear-time-btn"
              @click="clearTempTime"
            >
              清除时间
            </van-button>
            <van-button type="primary" block class="search-confirm-btn" @click="handleTimeConfirm">
              确定
            </van-button>
          </div>
        </div>
      </div>
    </van-popup>
    
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
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { 
  Empty as VanEmpty,
  Icon as VanIcon,
  Loading as VanLoading,
  ActionSheet as VanActionSheet,
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
    'van-action-sheet': VanActionSheet,
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
    const logMinTimestamp = ref(null) // 日志的最小时间戳
    const logMaxTimestamp = ref(null) // 日志的最大时间戳
    const showSearchActionSheet = ref(false)
    const showSearchDrawer = ref(false)
    const showTimeDrawer = ref(false)
    const showTagDrawer = ref(false)
    const activeDrawer = ref(null) // 'search' | 'time' | 'tag' | null
    const selectedSearchTab = ref(0) // 当前选中的标签页索引：0-关键字，1-标签，2-时间
    
    // 内容区域动态 padding-top（根据筛选按钮组高度）
    const filterContainerRef = ref(null)
    const contentPaddingTop = ref('120px')
    
    // 临时状态（用于菜单内的编辑，点击确定后才应用到实际搜索）
    const tempSearchQuery = ref('')
    const tempStartTime = ref(null)
    const tempEndTime = ref(null)
    const tempTagFilter = ref(null)
    
    // 搜索操作菜单选项（注意顺序：关键字、常用搜索项、时间）
    const searchActions = [
      { name: '关键字', icon: 'search' },
      { name: '常用搜索项', icon: 'label-o' },
      { name: '时间', icon: 'clock-o' }
    ]

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
        // 直接通过 log_ids 参数查询指定的日志，避免 1000 条限制问题
        const response = await api.logs.getList({ 
          log_ids: String(logId),
          page: 1,
          limit: 1
        })
        const logs = response?.data?.logs || []
        const log = logs.length > 0 ? logs[0] : null
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
        
        // 保存日志的时间范围（用于时间筛选器的初始值）
        // 仅在首次加载（没有设置时间筛选）时保存，避免后续查询覆盖
        // 注意：使用实际日志条目的时间范围，而不是后端可能扩展后的时间范围
        if (!startTime.value && !endTime.value) {
          if (entries.length > 0 && !logMinTimestamp.value) {
            // 从实际日志条目中计算时间范围，确保是真实的日志时间范围
            const timestamps = entries
              .map(e => e.timestamp || e.ts)
              .filter(ts => ts)
              .map(ts => new Date(ts).getTime())
              .filter(ts => !isNaN(ts))
            if (timestamps.length > 0) {
              logMinTimestamp.value = new Date(Math.min(...timestamps))
              logMaxTimestamp.value = new Date(Math.max(...timestamps))
            }
          }
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

    // 更新内容区域的 padding-top
    const updateContentPaddingTop = () => {
      nextTick(() => {
        if (filterContainerRef.value) {
          const headerHeight = 52 // header 固定高度（包含安全区域）
          const filterHeight = filterContainerRef.value.offsetHeight || 0
          contentPaddingTop.value = `${headerHeight + filterHeight + 12}px`
        }
      })
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
      // 更新内容区域 padding-top
      updateContentPaddingTop()
      // 监听窗口大小变化
      window.addEventListener('resize', updateContentPaddingTop)
    })
    
    // 打开搜索菜单时，初始化临时状态
    const initTempState = () => {
      tempSearchQuery.value = searchQuery.value
      // 如果用户已经设置过时间，使用用户设置的值；否则使用日志的时间范围作为初始值
      tempStartTime.value = startTime.value || logMinTimestamp.value
      tempEndTime.value = endTime.value || logMaxTimestamp.value
      tempTagFilter.value = tagFilter.value
      selectedSearchTab.value = 0 // 默认选中关键字标签页
    }
    
    // 关键字确认
    const handleKeywordConfirm = async () => {
      searchQuery.value = tempSearchQuery.value
      showSearchActionSheet.value = false
      await fetchLogEntries()
    }
    
    // 标签选择
    const handleTagSelect = (template) => {
      if (tempTagFilter.value === template.name) {
        tempTagFilter.value = null
      } else {
        tempTagFilter.value = template.name
      }
    }
    
    // 标签确认
    const handleTagConfirm = async () => {
      tagFilter.value = tempTagFilter.value
      showSearchActionSheet.value = false
      await fetchLogEntries()
    }
    
    // 时间确认
    const handleTimeConfirm = async () => {
      startTime.value = tempStartTime.value
      endTime.value = tempEndTime.value
      showSearchActionSheet.value = false
      await fetchLogEntries()
    }
    
    // 清除临时时间
    const clearTempTime = () => {
      tempStartTime.value = null
      tempEndTime.value = null
    }
    
    // 临时时间格式化（计算属性）
    const tempStartTimeFormatted = computed({
      get: () => {
        if (!tempStartTime.value) return ''
        const d = new Date(tempStartTime.value)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const hours = String(d.getHours()).padStart(2, '0')
        const minutes = String(d.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      },
      set: (val) => {
        tempStartTime.value = val ? new Date(val) : null
      }
    })
    
    const tempEndTimeFormatted = computed({
      get: () => {
        if (!tempEndTime.value) return ''
        const d = new Date(tempEndTime.value)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const hours = String(d.getHours()).padStart(2, '0')
        const minutes = String(d.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      },
      set: (val) => {
        tempEndTime.value = val ? new Date(val) : null
      }
    })
    
    const handleTempStartTimeChange = (event) => {
      const value = event.target.value
      tempStartTime.value = value ? new Date(value) : null
    }
    
    const handleTempEndTimeChange = (event) => {
      const value = event.target.value
      tempEndTime.value = value ? new Date(value) : null
    }
    
    // 监听搜索菜单显示，初始化临时状态
    watch(showSearchActionSheet, (show) => {
      if (show) {
        initTempState()
      }
    })
    
    const openSearchDrawer = () => {
      activeDrawer.value = 'search'
      showSearchDrawer.value = true
    }
    
    const openTimeDrawer = () => {
      activeDrawer.value = 'time'
      showTimeDrawer.value = true
    }
    
    const openTagDrawer = () => {
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
    
    // 应用模板（与桌面端保持一致）
    // 桌面端逻辑：直接将模板的 filters 赋值给 filtersRoot，通过 filters 参数传递给后端
    // 移动端逻辑：只设置 tagFilter，模板的 filters 在 fetchLogEntries 中通过 filters 参数传递
    const applyTemplate = (template) => {
      if (!template) return
      
      // 如果点击的是已选中的标签，则取消选择
      if (tagFilter.value === template.name) {
        tagFilter.value = null
        return
      }
      
      // 只标记选中的模板，不提取任何条件
      // 模板的筛选条件会通过 filters 参数传递给后端（在 fetchLogEntries 中处理）
      // 与桌面端保持一致：桌面端也是直接将模板的 filters 传递给后端，不提取到简单参数中
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
    
    // 监听搜索表达式和分析等级标签变化，更新内容区域 padding-top
    // 注意：必须在 searchExpression 和 analysisLevelLabel 定义之后
    watch([searchExpression, analysisLevelLabel], () => {
      updateContentPaddingTop()
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
      showSearchActionSheet,
      selectedSearchTab,
      searchActions,
      filterContainerRef,
      contentPaddingTop,
      tempSearchQuery,
      tempTagFilter,
      tempStartTimeFormatted,
      tempEndTimeFormatted,
      handleKeywordConfirm,
      handleTagSelect,
      handleTagConfirm,
      handleTimeConfirm,
      clearTempTime,
      handleTempStartTimeChange,
      handleTempEndTimeChange,
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
  background-color: var(--m-color-bg);
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
  background-color: var(--m-color-surface);
  border-bottom: 1.439px solid var(--m-color-border);
  padding: 14px var(--m-space-4);
  /* 顶部安全区域：防止被前置摄像头遮挡 */
  padding-top: max(14px, calc(env(safe-area-inset-top) + 14px));
}

.header-container {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
}

.back-icon {
  font-size: 20px;
  color: var(--m-color-text);
  cursor: pointer;
  flex-shrink: 0;
}

.header-title {
  flex: 1;
  font-size: var(--m-font-size-lg);
  font-weight: 400;
  color: var(--m-color-text);
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
  background-color: var(--m-color-surface);
  border-bottom: 1.439px solid var(--m-color-border);
  padding: var(--m-space-2);
}

.filter-buttons {
  display: flex;
  gap: var(--m-space-1);
  align-items: center;
}

.filter-button {
  flex: 1;
  height: 32px;
  border-radius: var(--m-radius-md);
  border: 1.439px solid var(--m-color-border);
  background-color: var(--m-color-surface);
  color: var(--m-color-text);
  font-size: var(--m-font-size-sm);
  font-weight: 400;
  line-height: 16px;
  cursor: pointer;
  padding: 0;
  outline: none;
  transition: all 0.2s;
}

.filter-button.active {
  background-color: var(--m-color-brand);
  color: var(--m-color-surface);
  border-color: var(--m-color-brand);
}

.filter-summary {
  margin-top: var(--m-space-2);
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: var(--gray-100);
  border: 1px solid rgba(21, 93, 252, 0.15);
  border-radius: var(--m-radius-md);
  font-size: var(--m-font-size-sm);
  color: var(--gray-700);
}

.filter-summary-icon {
  font-size: var(--m-font-size-md);
  color: var(--m-color-brand);
  flex-shrink: 0;
}

.filter-summary-text {
  flex: 1;
  line-height: 1.5;
  word-break: break-all;
}

.filter-summary-clear {
  font-size: var(--m-font-size-md);
  color: var(--gray-400);
  cursor: pointer;
  padding: var(--m-space-1);
  flex-shrink: 0;
}

.filter-summary-clear:active {
  color: var(--m-color-text);
  opacity: 0.7;
}

/* 搜索表达式展示样式（参考桌面端） */
.filter-button:active {
  opacity: 0.8;
}

.content {
  padding: 12px;
  /* 增加底部 padding，确保滚动能正确触发（移除底部导航栏后需要更多空间） */
  padding-bottom: max(20px, env(safe-area-inset-bottom) + 20px);
  /* padding-top 通过动态计算设置，避免被固定区域遮挡 */
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.entry-card {
  background-color: var(--m-color-surface);
  border: 1.439px solid var(--m-color-border);
  border-radius: var(--m-radius-lg);
  padding: 9.42px;
  box-sizing: border-box;
}

.entry-header {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-1);
  min-height: 22.85px;
}

.entry-time {
  font-size: var(--m-font-size-sm);
  font-weight: 400;
  color: var(--m-color-text-secondary);
  line-height: 16px;
  flex-shrink: 0;
}

.error-code-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--m-color-surface);
  padding: 3.44px 9.44px;
  border-radius: var(--m-radius-md);
  font-size: var(--m-font-size-sm);
  font-weight: 400;
  line-height: 16px;
  height: 22.85px;
  flex-shrink: 0;
}

/* 故障码背景颜色：根据结尾字母 */
.error-code-badge.error-code-a {
  background-color: var(--red-600); /* 红色 */
}

.error-code-badge.error-code-b {
  background-color: var(--orange-500); /* 橙色 */
}

.error-code-badge.error-code-c {
  background-color: var(--emerald-600); /* 蓝绿色 */
}

.error-code-badge.error-code-default {
  background-color: var(--gray-400); /* 浅灰色 */
}

.entry-content {
  font-size: var(--m-font-size-sm);
  font-weight: 400;
  color: var(--gray-700);
  line-height: 19.5px;
  word-break: break-word;
}

.footer-stats {
  text-align: center;
  font-size: var(--m-font-size-sm);
  color: var(--gray-400);
  padding: var(--m-space-3) 0;
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
  background-color: var(--m-color-surface);
  color: var(--m-color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--m-shadow-card);
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid var(--m-color-border);
}

.search-fab.has-filters {
  background-color: var(--m-color-brand);
  color: var(--m-color-surface);
  border-color: var(--m-color-brand);
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
  padding-bottom: var(--m-space-4);
  border-bottom: 1px solid var(--m-color-border);
  margin-bottom: var(--m-space-4);
}

.drawer-header h3 {
  margin: 0;
  font-size: var(--m-font-size-lg);
  font-weight: 600;
  color: var(--m-color-text);
}

.drawer-header .van-icon {
  font-size: 20px;
  color: var(--gray-400);
  cursor: pointer;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
}

.drawer-footer {
  padding-top: var(--m-space-4);
  border-top: 1px solid var(--m-color-border);
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2);
}

.time-input {
  width: 100%;
  padding: var(--m-space-2) var(--m-space-3);
  border: 1px solid var(--m-color-border);
  border-radius: var(--m-radius-xs);
  font-size: var(--m-font-size-md);
  color: var(--m-color-text);
  background-color: var(--m-color-surface);
  box-sizing: border-box;
}

.time-input:focus {
  outline: none;
  border-color: var(--m-color-brand);
}

/* 搜索操作菜单样式 */
.search-menu-content {
  background-color: var(--m-color-surface);
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  padding: 0;
}

.search-menu-handle {
  width: 100px;
  height: 8px;
  background-color: var(--gray-200);
  border-radius: 48293200px;
  margin: 17px auto;
}

.search-menu-header {
  padding: var(--m-space-4);
  padding-bottom: 0;
}

.search-menu-title {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin-bottom: 6px;
}

.search-menu-title-icon {
  font-size: 20px;
  color: var(--m-color-text);
}

.search-menu-title h2 {
  margin: 0;
  font-size: var(--m-font-size-lg);
  font-weight: 600;
  color: var(--m-color-text);
  line-height: 24px;
}

.search-menu-description {
  margin: 0;
  font-size: var(--m-font-size-md);
  color: var(--gray-500);
  line-height: 20px;
}

.search-menu-tabs {
  padding: 0 16px;
  margin-top: 24px;
}

.search-tabs-container {
  background-color: var(--gray-200);
  border-radius: var(--m-radius-lg);
  padding: 3px;
  display: flex;
  position: relative;
  height: 36px;
}

.search-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--m-space-2);
  height: 29px;
  border-radius: var(--m-radius-lg);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border: 1.439px solid transparent;
  background-color: transparent;
}

.search-tab-item.active {
  background-color: var(--m-color-surface);
  border-color: rgba(0, 0, 0, 0);
}

.search-tab-icon {
  font-size: var(--m-font-size-lg);
  color: var(--m-color-text);
}

.search-tab-text {
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text);
  font-weight: 400;
  line-height: 16px;
}

.search-menu-body {
  padding: 24px 16px;
  padding-bottom: 24px;
}

.search-tab-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input-field {
  background-color: var(--gray-100);
  border-radius: var(--m-radius-md);
  border: 1.439px solid transparent;
}

.search-input-field :deep(.van-field__control) {
  background-color: transparent;
  padding: var(--m-space-1) var(--m-space-3);
  font-size: var(--m-font-size-md);
  color: var(--gray-500);
}

.search-confirm-btn {
  height: 40px;
  border-radius: var(--m-radius-md);
  background-color: var(--m-color-brand);
  font-size: var(--m-font-size-md);
  font-weight: 400;
}

.tag-option-btn {
  margin: 4px;
}

.clear-time-btn {
  margin-top: 12px;
}

</style>

