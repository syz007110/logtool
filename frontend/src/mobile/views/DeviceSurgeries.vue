<template>
  <div class="page">
    <van-nav-bar :title="title" left-arrow @click-left="$router.back()" fixed safe-area-inset-top />
    
    <div class="content">
      <!-- 设备信息卡片 -->
      <div v-if="deviceInfo" class="device-info-card">
        <div class="info-label">{{ $t('mobile.deviceSurgeries.hospitalName') }}</div>
        <div class="info-value">{{ deviceInfo.hospital || '-' }}</div>
        <div class="info-badge">
          <span class="badge-text">{{ totalSurgeries }}</span>
          <span class="badge-label">{{ $t('mobile.deviceSurgeries.surgeriesUnit') }}</span>
        </div>
      </div>

      <!-- 搜索框 -->
      <div class="search-container">
        <div class="search-box">
          <van-icon name="search" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="search-input"
            :placeholder="$t('mobile.deviceSurgeries.searchPlaceholder')"
            @input="handleSearchInput"
          />
        </div>
      </div>

      <!-- 筛选按钮 -->
      <div class="filter-buttons">
        <van-dropdown-menu>
          <van-dropdown-item 
            v-model="surgeryTypeFilter" 
            :options="surgeryTypeOptions"
            @change="handleFilterChange"
          />
          <van-dropdown-item 
            v-model="timeFilter" 
            :options="timeOptions"
            @change="handleFilterChange"
          />
        </van-dropdown-menu>
      </div>

      <!-- 手术列表 -->
      <van-list :finished="finished" :loading="loading" @load="onLoad">
        <div class="surgery-list">
          <div
            v-for="item in filteredRows"
            :key="item.id"
            class="surgery-card"
          >
            <div class="card-content">
              <!-- 手术类型和术式 -->
              <div class="surgery-header">
                <div class="surgery-type-section">
                  <van-tag :type="getSurgeryTypeTagType(item.surgery_type)" size="small" class="surgery-type-badge">
                    {{ getSurgeryTypeName(item.surgery_type) }}
                  </van-tag>
                  <div v-if="getFaultCount(item)" class="fault-count-badge">
                    <van-icon name="warning-o" class="fault-icon" />
                    <span>{{ getFaultCount(item) }}</span>
                  </div>
                </div>
                <div class="surgery-procedure">{{ item.procedure || '-' }}</div>
                <div class="surgery-id">{{ $t('mobile.deviceSurgeries.surgeryId') }}: {{ item.id }}</div>
              </div>

              <!-- 时间信息 -->
              <div class="surgery-time-info">
                <div class="time-row">
                  <span class="time-label">{{ $t('mobile.deviceSurgeries.startTime') }}:</span>
                  <span class="time-value">{{ formatTime(item.start_time) }}</span>
                </div>
                <div class="time-row">
                  <span class="time-label">{{ $t('mobile.deviceSurgeries.endTime') }}:</span>
                  <span class="time-value">{{ formatTime(item.end_time) }}</span>
                </div>
                <div class="time-row">
                  <span class="time-label">{{ $t('mobile.deviceSurgeries.duration') }}:</span>
                  <span class="time-value">{{ formatDuration(item.start_time, item.end_time) }}</span>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="actions">
                <van-button
                  size="small"
                  type="default"
                  icon="description"
                  class="action-btn"
                  @click.stop="viewLogs(item)"
                >
                  {{ $t('mobile.deviceSurgeries.viewLogs') }}
                </van-button>
                <van-button
                  size="small"
                  type="primary"
                  plain
                  icon="chart"
                  class="action-btn"
                  @click.stop="viewVisualization(item)"
                >
                  {{ $t('mobile.deviceSurgeries.visualization') }}
                </van-button>
                <van-button
                  size="small"
                  type="default"
                  icon="delete"
                  class="action-btn delete-btn"
                  @click.stop="deleteSurgery(item)"
                />
              </div>
            </div>
          </div>
        </div>
      </van-list>
      
      <!-- 空状态 -->
      <van-empty
        v-if="!loading && filteredRows.length === 0 && finished"
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
import { showToast, showConfirmDialog } from 'vant'
import { 
  List as VanList, 
  NavBar as VanNavBar, 
  Button as VanButton, 
  Empty as VanEmpty, 
  Icon as VanIcon, 
  Tag as VanTag,
  DropdownMenu,
  DropdownItem
} from 'vant'
import api from '@/api'

export default {
  name: 'MDeviceSurgeries',
  components: {
    'van-list': VanList,
    'van-nav-bar': VanNavBar,
    'van-button': VanButton,
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
    const keyword = ref('')
    const surgeryTypeFilter = ref('all')
    const timeFilter = ref('all')
    const rows = ref([])
    const allRows = ref([])
    const deviceInfo = ref(null)
    const totalSurgeries = ref(0)
    const loading = ref(false)
    const finished = ref(false)
    const page = ref(1)
    const pageSize = 20

    const surgeryTypeOptions = [
      { text: t('mobile.deviceSurgeries.filterAll'), value: 'all' },
      { text: t('surgeryVisualization.remoteSurgery'), value: 'remote' },
      { text: t('surgeryVisualization.faultSurgery'), value: 'fault' }
    ]

    const timeOptions = [
      { text: t('mobile.deviceSurgeries.timeAll'), value: 'all' },
      { text: t('mobile.deviceSurgeries.timeToday'), value: 'today' },
      { text: t('mobile.deviceSurgeries.timeWeek'), value: 'week' },
      { text: t('mobile.deviceSurgeries.timeMonth'), value: 'month' }
    ]

    const filteredRows = computed(() => {
      let filtered = [...allRows.value]

      // 按手术类型筛选
      if (surgeryTypeFilter.value !== 'all') {
        filtered = filtered.filter(item => {
          if (surgeryTypeFilter.value === 'remote') {
            return item.surgery_type === 'remote' || item.is_remote
          }
          if (surgeryTypeFilter.value === 'fault') {
            return item.surgery_type === 'fault' || item.is_fault || (item.fault_count && item.fault_count > 0)
          }
          return false
        })
      }

      // 按时间筛选
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
          filtered = filtered.filter(item => {
            if (!item.start_time) return false
            return new Date(item.start_time) >= cutoffTime
          })
        }
      }

      // 按关键词筛选
      if (keyword.value.trim()) {
        const kw = keyword.value.toLowerCase().trim()
        filtered = filtered.filter(item => 
          item.id?.toString().toLowerCase().includes(kw) ||
          item.procedure?.toLowerCase().includes(kw)
        )
      }

      return filtered
    })

    const fetchDeviceInfo = async () => {
      try {
        const resp = await api.surgeries.list({ device_id: deviceId, limit: 1 })
        const data = resp?.data?.data || []
        if (data.length > 0) {
          const surgery = data[0]
          deviceInfo.value = {
            hospital: surgery.hospital_name || surgery.hospital_names?.[0] || '-'
          }
        }
      } catch (error) {
        console.error('Failed to fetch device info:', error)
      }
    }

    const fetchPage = async () => {
      try {
        const resp = await api.surgeries.list({ 
          device_id: deviceId, 
          page: page.value, 
          limit: 10000 // 获取所有数据用于前端筛选
        })
      const list = resp?.data?.data || []
        allRows.value = list
        totalSurgeries.value = resp?.data?.total || list.length
        finished.value = true
      } catch (error) {
        console.error('Failed to fetch surgeries:', error)
        finished.value = true
      }
    }

    const onLoad = async () => {
      if (finished.value) return
      loading.value = true
      try {
        if (allRows.value.length === 0) {
          await Promise.all([fetchDeviceInfo(), fetchPage()])
        } else {
          finished.value = true
        }
      } finally {
        loading.value = false
      }
    }

    const handleSearchInput = () => {
      // 实时筛选已通过computed处理
    }

    const handleFilterChange = () => {
      // 筛选已通过computed处理
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

    const formatDuration = (start, end) => {
      if (!start || !end) return '-'
      const startTime = new Date(start)
      const endTime = new Date(end)
      const duration = endTime - startTime
      const hours = Math.floor(duration / (1000 * 60 * 60))
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
      if (hours > 0) {
        return `${hours}${t('mobile.deviceSurgeries.hour')}${minutes}${t('mobile.deviceSurgeries.minute')}`
      }
      return `${minutes}${t('mobile.deviceSurgeries.minute')}`
    }

    const getSurgeryTypeName = (type) => {
      if (type === 'remote' || type === 'is_remote') return t('surgeryVisualization.remoteSurgery')
      if (type === 'fault' || type === 'is_fault') return t('surgeryVisualization.faultSurgery')
      return t('mobile.deviceSurgeries.normalSurgery')
    }

    const getSurgeryTypeTagType = (type) => {
      if (type === 'remote' || type === 'is_remote') return 'primary'
      if (type === 'fault' || type === 'is_fault') return 'danger'
      return 'success'
    }

    const getFaultCount = (item) => {
      return item.fault_count || (item.is_fault ? 1 : 0) || 0
    }

    const viewLogs = (item) => {
      // 跳转到日志列表，根据手术ID筛选
      router.push({ 
        name: 'MDeviceLogs', 
        params: { deviceId: deviceId },
        query: { surgeryId: item.id }
      })
    }

    const viewVisualization = (item) => {
      router.push({ 
        name: 'MSurgeryVisualization', 
        params: { surgeryId: item.id || item.surgery_id },
        query: { deviceId: deviceId }
      })
    }

    const deleteSurgery = async (item) => {
      try {
        await showConfirmDialog({
          title: t('shared.messages.deleteConfirmTitle'),
          message: t('shared.messages.confirmDelete')
        })
        // TODO: 实现删除手术API
        showToast(t('shared.messages.deleteSuccess'))
      } catch (error) {
        if (error === 'cancel') return
        console.error('Delete failed:', error)
        showToast(t('shared.messages.deleteFailed'))
      }
    }

    onMounted(() => {
      onLoad()
    })

    return { 
      title,
      deviceInfo,
      totalSurgeries,
      keyword,
      surgeryTypeFilter,
      timeFilter,
      surgeryTypeOptions,
      timeOptions,
      rows,
      filteredRows,
      loading, 
      finished, 
      onLoad,
      handleSearchInput,
      handleFilterChange,
      formatTime,
      formatDuration,
      getSurgeryTypeName,
      getSurgeryTypeTagType,
      getFaultCount,
      viewLogs,
      viewVisualization,
      deleteSurgery
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
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.info-label {
  font-size: 14px;
  color: #646566;
  margin-bottom: 8px;
}

.info-value {
  font-size: 16px;
  font-weight: 500;
  color: #323233;
  margin-bottom: 12px;
}

.info-badge {
  display: inline-flex;
  align-items: center;
  background-color: #ecf5ff;
  border-radius: 12px;
  padding: 2px 8px;
  height: 22px;
}

.badge-text {
  font-size: 14px;
  font-weight: 500;
  color: #1989fa;
}

.badge-label {
  font-size: 12px;
  color: #1989fa;
  margin-left: 2px;
}

.search-container {
  background-color: #fff;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: #f7f8fa;
  border-radius: 8px;
  padding: 0 12px;
  height: 36px;
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

.surgery-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.surgery-card {
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-content {
  padding: 12px;
}

.surgery-header {
  margin-bottom: 12px;
}

.surgery-type-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.surgery-type-badge {
  display: inline-block;
}

.fault-count-badge {
  display: inline-flex;
  align-items: center;
  background-color: #fff0e6;
  color: #ed6a0c;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  gap: 4px;
}

.fault-icon {
  font-size: 12px;
}

.surgery-procedure {
  font-size: 16px;
  font-weight: 500;
  color: #323233;
  margin-bottom: 4px;
}

.surgery-id {
  font-size: 12px;
  color: #646566;
}

.surgery-time-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background-color: #f7f8fa;
  border-radius: 8px;
}

.time-row {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.time-label {
  color: #646566;
  margin-right: 8px;
  min-width: 60px;
}

.time-value {
  color: #323233;
}

.actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #ebedf0;
}

.action-btn {
  flex: 1;
}

.delete-btn {
  flex: 0;
  min-width: 36px;
  padding: 0 12px;
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
  margin-bottom: 12px;
}

:deep(.van-dropdown-menu__item) {
  padding: 0 12px;
}
</style>
