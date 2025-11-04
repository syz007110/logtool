<template>
  <div class="page">
    <van-nav-bar 
      fixed 
      safe-area-inset-top 
      left-arrow 
      @click-left="$router.back()"
    >
      <template #title>
        <div v-if="logInfo" class="nav-bar-title">
          <span class="nav-title-main">{{ logInfo.original_name || '-' }}</span>
          <span class="nav-title-size">{{ formatFileSize(logInfo.size) }}</span>
        </div>
        <span v-else>{{ $t('mobile.titles.logDetail') }}</span>
      </template>
    </van-nav-bar>
    
    <!-- 固定顶部栏 -->
    <div class="fixed-header">
      <!-- 搜索框 -->
      <div class="search-box">
        <van-icon name="search" class="search-icon" />
        <input
          v-model="searchKeyword"
          type="text"
          class="search-input"
          :placeholder="$t('mobile.logView.searchPlaceholder')"
          @input="handleSearchInput"
        />
      </div>

      <!-- 筛选按钮 -->
      <div class="filter-buttons">
        <van-dropdown-menu>
          <!-- 常用搜索标签下拉菜单 -->
          <van-dropdown-item 
            v-model="selectedTag" 
            :options="commonTagOptions"
            :title="$t('mobile.logView.commonTags')"
            @change="handleTagFilterChange"
          />
          <!-- 日志分析等级筛选 -->
          <van-dropdown-item 
            v-model="analysisLevelFilter" 
            :options="analysisLevelOptions"
            :title="$t('batchAnalysis.analysisLevel')"
            @change="handleAnalysisLevelChange"
          />
        </van-dropdown-menu>
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
          <div class="entry-time">{{ formatTimestamp(entry.timestamp) }}</div>
          <div class="entry-content">
            <span v-if="entry.error_code" class="error-code-badge">
              {{ entry.error_code }}
            </span>
            {{ entry.explanation || entry.message || '-' }}
          </div>
        </div>
      </div>

      <!-- 底部统计 -->
      <div class="footer-stats">
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
  </div>
</template>

<script>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { 
  NavBar as VanNavBar, 
  Empty as VanEmpty,
  Icon as VanIcon,
  Tag as VanTag,
  Button as VanButton,
  Loading as VanLoading,
  DropdownMenu,
  DropdownItem
} from 'vant'
import api from '@/api'

export default {
  name: 'MLogView',
  components: {
    'van-nav-bar': VanNavBar,
    'van-empty': VanEmpty,
    'van-icon': VanIcon,
    'van-tag': VanTag,
    'van-button': VanButton,
    'van-loading': VanLoading,
    'van-dropdown-menu': DropdownMenu,
    'van-dropdown-item': DropdownItem
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    // 参考桌面端处理方式，直接使用路由参数，保持字符串类型
    const logId = route.params?.logId || route.query?.logId || ''
    const logInfo = ref(null)
    const allEntries = ref([])
    const loading = ref(false)
    const searchKeyword = ref('')
    const analysisLevelFilter = ref('KEY')
    const commonTags = ref([])
    const selectedTag = ref('')
    const analysisCategories = ref([])
    const selectedAnalysisCategoryIds = ref([])
    const analysisPresets = ref({ ALL: [], FINE: [], KEY: [] })
    
    const commonTagOptions = computed(() => {
      const options = [{ text: t('mobile.logView.allTags'), value: '' }]
      return options.concat(commonTags.value.map(tag => ({ text: tag, value: tag })))
    })

    const analysisLevelOptions = [
      { text: t('batchAnalysis.fullLogs'), value: 'ALL' },
      { text: t('batchAnalysis.detailedLogs'), value: 'FINE' },
      { text: t('batchAnalysis.keyLogs'), value: 'KEY' }
    ]

    const filteredEntries = computed(() => {
      let filtered = [...allEntries.value]

      // 关键词搜索
      if (searchKeyword.value.trim()) {
        const kw = searchKeyword.value.toLowerCase().trim()
        filtered = filtered.filter(entry => {
          const hasKeyword = 
            (entry.explanation || '').toLowerCase().includes(kw) ||
            (entry.message || '').toLowerCase().includes(kw) ||
            (entry.error_code || '').toLowerCase().includes(kw)
          return hasKeyword
        })
      }

      // 分析等级筛选（根据分析分类）
      if (selectedAnalysisCategoryIds.value && selectedAnalysisCategoryIds.value.length > 0) {
        // 这里需要根据分析分类筛选，但单日志查看页面可能不需要这个功能
        // 暂时不实现，因为分析分类筛选主要用于批量分析场景
      }

      return filtered
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
        // 确保 logId 是数字类型传给 API
        const response = await api.logs.getEntries(Number(logId) || logId)
        // 处理不同的响应格式，参考桌面端处理方式
        const entries = response?.data?.entries || response?.entries || response?.data || []
        if (!Array.isArray(entries)) {
          console.warn('Log entries response is not an array:', entries)
          allEntries.value = []
          return
        }
        // 如果是压缩格式，需要解压
        if (entries.length > 0 && entries[0].e) {
          // 压缩格式：{ e: error_code, exp: explanation, ts: timestamp, ... }
          allEntries.value = entries.map(entry => ({
            id: entry.id || entry.ts,
            timestamp: entry.ts || entry.timestamp,
            error_code: entry.e,
            explanation: entry.exp,
            message: entry.msg || entry.message,
            param1: entry.p1,
            param2: entry.p2,
            param3: entry.p3,
            param4: entry.p4
          }))
        } else {
          // 标准格式
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
        }
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

    const handleSearchInput = () => {
      // 实时筛选已通过computed处理
      // 如果手动输入的内容与选中的标签不一致，清空标签选择
      if (selectedTag.value && searchKeyword.value !== selectedTag.value) {
        selectedTag.value = ''
      }
    }

    const handleAnalysisLevelChange = (value) => {
      if (analysisPresets.value[value] && Array.isArray(analysisPresets.value[value])) {
        selectedAnalysisCategoryIds.value = [...analysisPresets.value[value]]
      }
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
        // 根据当前选中的分析等级设置分类ID（默认KEY）
        const presetKey = analysisLevelFilter.value || 'KEY'
        if (analysisPresets.value[presetKey] && Array.isArray(analysisPresets.value[presetKey])) {
          selectedAnalysisCategoryIds.value = [...analysisPresets.value[presetKey]]
        }
      } catch (error) {
        console.error('Failed to load analysis presets:', error)
        // 如果加载失败，使用空数组
        selectedAnalysisCategoryIds.value = []
      }
    }

    const handleTagFilterChange = (value) => {
      selectedTag.value = value
      if (value) {
        searchKeyword.value = value
      } else {
        searchKeyword.value = ''
      }
    }

    const loadCommonTags = async () => {
      try {
        const res = await api.logs.getSearchTemplates()
        const templates = res?.data?.templates || []
        // 提取模板名称作为常用标签
        commonTags.value = templates.map(tpl => tpl.name).filter(Boolean)
      } catch (error) {
        console.error('Failed to load common tags:', error)
        // 如果加载失败，使用默认标签
        commonTags.value = []
      }
    }


    onMounted(async () => {
      if (!logId) {
        showToast(t('mobile.logView.logIdRequired'))
        router.back()
        return
      }
      await Promise.all([fetchLogInfo(), fetchLogEntries(), loadCommonTags(), loadAnalysisPresets()])
    })

    return {
      logInfo,
      allEntries,
      filteredEntries,
      loading,
      searchKeyword,
      analysisLevelFilter,
      commonTags,
      selectedTag,
      commonTagOptions,
      analysisLevelOptions,
      formatFileSize,
      formatTime,
      formatTimestamp,
      handleSearchInput,
      handleAnalysisLevelChange,
      handleTagFilterChange
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-top: 46px;
  padding-bottom: 20px;
}

.nav-bar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 100px);
}

.nav-title-main {
  font-size: 16px;
  font-weight: 500;
  color: #323233;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  line-height: 1.2;
}

.nav-title-size {
  font-size: 12px;
  color: #969799;
  flex-shrink: 0;
  line-height: 1.2;
}

.fixed-header {
  position: fixed;
  top: 46px;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: #f7f8fa;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  max-height: calc(100vh - 46px);
  overflow-y: auto;
}

.content {
  padding: 12px;
  margin-top: 120px; /* 为固定头部栏留出空间：搜索框(48) + 筛选按钮(48) + 间距(24) */
}

.tags-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tags-title {
  font-size: 14px;
  color: #323233;
  margin-bottom: 12px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  cursor: pointer;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: #fff;
  border-radius: 8px;
  padding: 0 12px;
  height: 36px;
  margin-bottom: 8px;
}

.search-icon {
  font-size: 16px;
  color: #969799;
  margin-right: 8px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #323233;
  outline: none;
}

.search-input::placeholder {
  color: #969799;
}

.filter-buttons {
  margin-bottom: 0;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.entry-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.entry-time {
  font-size: 12px;
  color: #646566;
  margin-bottom: 8px;
}

.entry-content {
  font-size: 14px;
  color: #323233;
  line-height: 1.5;
  word-break: break-word;
}

.error-code-badge {
  display: inline-block;
  background-color: #ecf5ff;
  color: #1989fa;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 8px;
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

:deep(.van-dropdown-menu) {
  background-color: #fff;
  border-radius: 8px;
  margin-bottom: 12px;
}

:deep(.van-dropdown-menu__item) {
  padding: 0 12px;
}
</style>

