<template>
  <div class="page">
    <van-nav-bar :title="title" left-arrow @click-left="$router.back()" fixed safe-area-inset-top />
    
    <div class="content">
      <!-- 设备信息卡片 -->
      <div v-if="deviceInfo" class="device-info-card">
        <div class="info-row">
          <div class="info-item">
            <div class="info-label">{{ $t('logs.deviceId') }}</div>
            <div class="info-value">{{ deviceId }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">{{ $t('mobile.deviceLogs.hospitalName') }}</div>
            <div class="info-value">{{ deviceInfo.hospital || '-' }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">{{ $t('logs.logCount') }}</div>
            <div class="info-value info-value-primary">{{ totalLogs }}</div>
          </div>
        </div>
      </div>

      <!-- 搜索和筛选 -->
      <div class="filter-section">
        <div class="search-box">
          <van-icon name="search" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="search-input"
            :placeholder="$t('mobile.deviceLogs.searchPlaceholder')"
            @input="handleSearchInput"
          />
        </div>
        <van-dropdown-menu>
          <van-dropdown-item 
            v-model="statusFilter" 
            :options="statusOptions"
            @change="handleStatusChange"
          />
        </van-dropdown-menu>
      </div>

      <!-- 日志列表 -->
      <van-list :finished="finished" :loading="loading" @load="onLoad">
        <div class="log-list">
          <div
            v-for="log in filteredLogs"
            :key="log.id"
            class="log-card"
          >
            <div class="card-content" @click="viewLog(log)">
              <van-icon name="description" class="file-icon" />
              
              <div class="log-info-wrapper">
                <!-- 文件名 -->
                <div class="file-name">{{ log.original_name || '-' }}</div>
                
                <!-- 上传者/时间信息 -->
                <div class="upload-info-compact">
                  <span class="uploader">{{ getUploaderName(log) }}</span>
                  <span class="separator">•</span>
                  <span class="upload-time">{{ formatTime(log.upload_time) }}</span>
                </div>
              </div>
              
              <!-- 状态标签 -->
              <div class="log-actions">
                <van-tag :type="getStatusTagType(log.status)" size="small" class="status-badge">
                  <van-icon :name="getStatusIcon(log.status)" class="status-icon" />
                  {{ getStatusText(log.status) }}
                </van-tag>
              </div>
            </div>
          </div>
        </div>
      </van-list>
      
      <!-- 空状态 -->
      <van-empty
        v-if="!loading && filteredLogs.length === 0 && finished"
        :description="$t('shared.noData')"
        class="empty-state"
      />
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { 
  List as VanList, 
  NavBar as VanNavBar, 
  Empty as VanEmpty,
  Icon as VanIcon,
  Tag as VanTag,
  DropdownMenu,
  DropdownItem
} from 'vant'
import api from '@/api'

export default {
  name: 'MDeviceLogs',
  components: {
    'van-list': VanList,
    'van-nav-bar': VanNavBar,
    'van-empty': VanEmpty,
    'van-icon': VanIcon,
    'van-tag': VanTag,
    'van-dropdown-menu': DropdownMenu,
    'van-dropdown-item': DropdownItem
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const deviceId = route.params?.deviceId || ''
    const title = computed(() => `${deviceId}`)
    const logs = ref([])
    const allLogs = ref([])
    const deviceInfo = ref(null)
    const totalLogs = ref(0)
    const loading = ref(false)
    const finished = ref(false)
    const keyword = ref('')
    const statusFilter = ref('all')
    const page = ref(1)
    const pageSize = 20

    const statusOptions = [
      { text: t('mobile.deviceLogs.statusAll'), value: 'all' },
      { text: t('logs.statusText.parsed'), value: 'parsed' },
      { text: t('logs.statusText.failed'), value: 'failed' },
      { text: t('logs.statusText.decrypt_failed'), value: 'decrypt_failed' },
      { text: t('logs.statusText.parsing'), value: 'parsing' }
    ]

    const filteredLogs = computed(() => {
      let filtered = [...allLogs.value]

      // 状态筛选
      if (statusFilter.value !== 'all') {
        filtered = filtered.filter(log => log.status === statusFilter.value)
      }

      // 关键词筛选
      if (keyword.value.trim()) {
        const kw = keyword.value.toLowerCase().trim()
        filtered = filtered.filter(log =>
          (log.original_name || '').toLowerCase().includes(kw)
        )
      }

      return filtered
    })

    const fetchDeviceInfo = async () => {
      try {
        const resp = await api.logs.getByDevice({ device_id: deviceId, limit: 1 })
        const groups = resp?.data?.device_groups || []
        const group = groups.find(g => g.device_id === deviceId)
        if (group) {
          deviceInfo.value = {
            hospital: group.hospital_name || '-'
          }
          totalLogs.value = group.log_count || 0
        }
      } catch (error) {
        console.error('Failed to fetch device info:', error)
      }
    }

    const fetchPage = async () => {
      try {
        const resp = await api.logs.getList({ 
          page: page.value, 
          limit: 10000, // 获取所有日志
          device_id: deviceId 
        })
        const list = resp?.data?.logs || []
        allLogs.value = list
        totalLogs.value = resp?.data?.total || 0
        finished.value = true
      } catch (error) {
        console.error('Failed to fetch logs:', error)
        finished.value = true
      }
    }

    const onLoad = async () => {
      if (finished.value) return
      loading.value = true
      try {
        if (allLogs.value.length === 0) {
          await Promise.all([fetchDeviceInfo(), fetchPage()])
        } else {
          finished.value = true
        }
      } finally {
        loading.value = false
      }
    }

    const handleSearchInput = () => {
      // 实时筛选，无需额外操作
    }

    const handleStatusChange = () => {
      // 状态筛选已通过computed处理
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

    const getUploaderName = (log) => {
      return log.uploader_name || log.uploader_id || t('mobile.deviceLogs.unknownUser')
    }

    const getStatusText = (status) => {
      const statusMap = {
        'uploading': t('logs.statusText.uploading'),
        'queued': t('logs.statusText.queued'),
        'decrypting': t('logs.statusText.decrypting'),
        'parsing': t('logs.statusText.parsing'),
        'parsed': t('logs.statusText.parsed'),
        'completed': t('logs.statusText.parsed'), // 兼容别名
        'failed': t('logs.statusText.failed'),
        'decrypt_failed': t('logs.statusText.decrypt_failed'),
        'parse_failed': t('logs.statusText.parse_failed'),
        'file_error': t('logs.statusText.file_error')
      }
      return statusMap[status] || status || '-'
    }

    const getStatusIcon = (status) => {
      const iconMap = {
        'uploading': 'clock-o',
        'queued': 'clock-o',
        'decrypting': 'lock-o',
        'parsing': 'setting-o',
        'parsed': 'checked',
        'completed': 'checked', // 兼容别名
        'failed': 'close',
        'decrypt_failed': 'warning-o',
        'parse_failed': 'close',
        'file_error': 'warning-o'
      }
      return iconMap[status] || 'info-o'
    }

    const getStatusTagType = (status) => {
      const typeMap = {
        'uploading': 'warning',
        'queued': 'primary',
        'decrypting': 'warning',
        'parsing': 'primary',
        'parsed': 'success',
        'completed': 'success', // 兼容别名
        'failed': 'danger',
        'decrypt_failed': 'danger',
        'parse_failed': 'danger',
        'file_error': 'danger'
      }
      return typeMap[status] || 'default'
    }

    const viewLog = (log) => {
      router.push({ name: 'MLogView', params: { logId: log.id } })
    }

    onMounted(() => {
      onLoad()
    })

    return {
      title,
      deviceInfo,
      totalLogs,
      logs,
      filteredLogs,
      loading,
      finished,
      keyword,
      statusFilter,
      statusOptions,
      onLoad,
      handleSearchInput,
      handleStatusChange,
      formatFileSize,
      formatTime,
      getUploaderName,
      getStatusText,
      getStatusIcon,
      getStatusTagType,
      viewLog
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

.device-info-card {
  background-color: #fff;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 12px;
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  gap: 0;
  height: 34px;
}

.info-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
}

.info-label {
  font-size: 12px;
  color: #6a7282;
  line-height: 16px;
  height: 16px;
}

.info-value {
  font-size: 12px;
  font-weight: normal;
  color: #101828;
  line-height: 16px;
  height: 16px;
}

.info-value-primary {
  color: #155dfc;
}

.filter-section {
  margin-bottom: 8px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: #f3f3f5;
  border-radius: 8px;
  padding: 0 12px;
  height: 36px;
  margin-bottom: 8px;
}

.search-icon {
  font-size: 16px;
  color: #717182;
  position: absolute;
  right: 12px;
  pointer-events: none;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #323233;
  outline: none;
  padding-right: 28px;
}

.search-input::placeholder {
  color: #717182;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-card {
  background-color: #fff;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.log-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.log-card:active {
  background-color: #f5f5f5;
}

.card-content {
  padding: 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  position: relative;
}

.file-icon {
  font-size: 16px;
  color: #1989fa;
  margin-top: 9px;
  flex-shrink: 0;
}

.log-info-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 12px;
  color: #101828;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 16px;
}

.upload-info-compact {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #6a7282;
  line-height: 16px;
  gap: 4px;
}

.uploader {
  /* no additional styles */
}

.separator {
  /* no additional styles */
}

.upload-time {
  /* no additional styles */
}

.log-actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  border-radius: 8px;
  padding: 2px 8px;
  margin-right: 4px;
}

.status-icon {
  font-size: 12px;
  margin-right: 4px;
}

.action-buttons {
  display: flex;
  gap: 4px;
}

.action-btn {
  padding: 0;
  width: 36px;
  height: 28px;
  border-radius: 8px;
}

.empty-state {
  margin-top: 60px;
}

:deep(.van-list__loading) {
  padding: 20px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}

:deep(.van-list__finished) {
  padding: 20px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}

:deep(.van-dropdown-menu) {
  background-color: #fff;
  border-radius: 8px;
}

:deep(.van-dropdown-menu__item) {
  padding: 0 12px;
}
</style>
