<template>
  <div class="page">
    <van-nav-bar 
      :title="$t('mobile.titles.logDetail')" 
      left-arrow 
      @click-left="$router.back()" 
      fixed 
      safe-area-inset-top 
    />
    
    <div class="content">
      <!-- 文件信息卡片 -->
      <div v-if="logInfo" class="file-info-card">
        <div class="file-header">
          <div class="file-details">
            <div class="file-name">{{ logInfo.original_name || '-' }}</div>
            <div class="file-meta">
              {{ formatFileSize(logInfo.size) }} • {{ formatTime(logInfo.created_at) }}
            </div>
          </div>
          <van-button 
            size="small" 
            type="default" 
            icon="down"
            class="download-btn"
            @click="downloadLog"
          >
            {{ $t('mobile.logView.download') }}
          </van-button>
        </div>
      </div>

      <!-- 常用标签卡片 -->
      <div class="tags-card">
        <div class="tags-title">{{ $t('mobile.logView.commonTags') }}</div>
        <div class="tags-list">
          <van-tag 
            v-for="tag in commonTags" 
            :key="tag"
            class="tag-item"
            @click="applyTagFilter(tag)"
          >
            {{ tag }}
          </van-tag>
        </div>
      </div>

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
          <van-dropdown-item 
            v-model="logTypeFilter" 
            :options="logTypeOptions"
            @change="handleFilterChange"
          />
          <van-dropdown-item 
            v-model="timeFilter" 
            :options="timeOptions"
            @change="handleFilterChange"
          />
        </van-dropdown-menu>
      </div>

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
        {{ t('mobile.logView.displayStats', { current: filteredEntries.length, total: allEntries.length }) }}
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
    const logId = route.params?.logId || route.query?.logId || ''
    const logInfo = ref(null)
    const allEntries = ref([])
    const loading = ref(false)
    const searchKeyword = ref('')
    const logTypeFilter = ref('all')
    const timeFilter = ref('all')
    const commonTags = ref(['故障码', '传感器', '机械臂', '视觉系统', '温度', '手术'])

    const logTypeOptions = [
      { text: t('mobile.logView.logTypeAll'), value: 'all' },
      { text: t('mobile.logView.logTypeError'), value: 'error' },
      { text: t('mobile.logView.logTypeInfo'), value: 'info' },
      { text: t('mobile.logView.logTypeWarning'), value: 'warning' }
    ]

    const timeOptions = [
      { text: t('mobile.logView.timeAll'), value: 'all' },
      { text: t('mobile.logView.timeToday'), value: 'today' },
      { text: t('mobile.logView.timeWeek'), value: 'week' },
      { text: t('mobile.logView.timeMonth'), value: 'month' }
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

      // 日志类型筛选（这里简化处理，实际应该根据日志级别）
      // 暂时不实现，因为后端可能没有提供日志级别信息

      // 时间筛选
      if (timeFilter.value !== 'all') {
        const now = new Date()
        const cutoffTime = (() => {
          switch (timeFilter.value) {
            case 'today':
              return new Date(now.getFullYear(), now.getMonth(), now.getDate())
            case 'week':
              const weekAgo = new Date(now)
              weekAgo.setDate(weekAgo.getDate() - 7)
              return weekAgo
            case 'month':
              const monthAgo = new Date(now)
              monthAgo.setMonth(monthAgo.getMonth() - 1)
              return monthAgo
            default:
              return null
          }
        })()
        if (cutoffTime) {
          filtered = filtered.filter(entry => {
            if (!entry.timestamp) return false
            return new Date(entry.timestamp) >= cutoffTime
          })
        }
      }

      return filtered
    })

    const fetchLogInfo = async () => {
      try {
        const resp = await api.logs.getList({ limit: 10000 })
        const logs = resp?.data?.logs || []
        logInfo.value = logs.find(l => l.id == logId)
        if (!logInfo.value) {
          showToast(t('mobile.logView.logNotFound'))
          router.back()
        }
      } catch (error) {
        console.error('Failed to fetch log info:', error)
        showToast(t('mobile.logView.loadFailed'))
      }
    }

    const fetchLogEntries = async () => {
      loading.value = true
      try {
        const resp = await api.logs.getEntries(logId)
        // 处理不同的响应格式
        const entries = resp?.data?.entries || resp?.entries || resp?.data || []
        // 如果是压缩格式，需要解压
        if (Array.isArray(entries) && entries.length > 0 && entries[0].e) {
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
      const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
    }

    const handleSearchInput = () => {
      // 实时筛选已通过computed处理
    }

    const handleFilterChange = () => {
      // 筛选已通过computed处理
    }

    const applyTagFilter = (tag) => {
      searchKeyword.value = tag
    }

    const downloadLog = async () => {
      if (!logInfo.value) return
      try {
        const response = await api.logs.download(logId)
        const blob = new Blob([response.data])
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = logInfo.value.original_name || 'log.txt'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        showToast(t('mobile.logView.downloadSuccess'))
      } catch (error) {
        console.error('Download failed:', error)
        showToast(t('mobile.logView.downloadFailed'))
      }
    }

    onMounted(async () => {
      if (!logId) {
        showToast(t('mobile.logView.logIdRequired'))
        router.back()
        return
      }
      await Promise.all([fetchLogInfo(), fetchLogEntries()])
    })

    return {
      logInfo,
      allEntries,
      filteredEntries,
      loading,
      searchKeyword,
      logTypeFilter,
      timeFilter,
      commonTags,
      logTypeOptions,
      timeOptions,
      formatFileSize,
      formatTime,
      formatTimestamp,
      handleSearchInput,
      handleFilterChange,
      applyTagFilter,
      downloadLog
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

.content {
  padding: 12px;
}

.file-info-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.file-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  color: #323233;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 12px;
  color: #646566;
}

.download-btn {
  flex-shrink: 0;
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
  margin-bottom: 12px;
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
  margin-bottom: 12px;
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

