<template>
  <div class="page">
    <!-- 顶部导航栏 -->
    <div class="mobile-header">
      <div class="header-container">
        <van-icon name="arrow-left" class="back-icon" @click="$router.back()" />
        <div class="header-content">
          <!-- 同一行：设备编号、医院名称、日志总数 -->
          <div class="header-row">
            <div class="header-title">{{ deviceId }}</div>
            <div v-if="deviceInfo" class="header-hospital">
              <span class="info-text">{{ $t('mobile.deviceLogs.hospitalName') || '医院名称' }}：{{ deviceInfo.hospital || '-' }}</span>
            </div>
            <div v-if="deviceInfo" class="header-logs">
              <span class="info-text">{{ $t('logs.logCount') || '日志总数' }}：<span class="info-value-primary">{{ totalLogs }}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 筛选区域（固定定位） -->
    <div class="filter-section">
      <!-- 时间范围选择器 -->
      <div class="time-range-section">
        <div class="time-range-label">
          <van-icon name="clock-o" class="time-icon" />
          <span>时间范围</span>
        </div>
        <div class="time-inputs">
          <input
            v-model="startTime"
            type="date"
            class="time-input"
            placeholder="开始时间"
          />
          <input
            v-model="endTime"
            type="date"
            class="time-input"
            placeholder="结束时间"
          />
        </div>
      </div>
      <!-- 状态筛选按钮 -->
      <button class="status-filter-button" @click="showStatusDropdown = !showStatusDropdown">
        <span>{{ getStatusFilterText() }}</span>
        <van-icon name="arrow-down" class="dropdown-icon" />
      </button>
      <!-- 状态下拉菜单 -->
      <div v-if="showStatusDropdown" class="status-dropdown">
        <div
          v-for="option in statusOptions"
          :key="option.value"
          :class="['status-option', { active: statusFilter === option.value }]"
          @click="handleStatusSelect(option.value)"
        >
          {{ option.text }}
        </div>
      </div>
    </div>

    <!-- 日志列表内容区域 -->
    <div class="content">
      <van-list :finished="finished" :loading="loading" :offset="100" @load="onLoad">
        <div class="log-list">
          <div
            v-for="log in filteredLogs"
            :key="log.id"
            class="log-card"
            @click="viewLog(log)"
          >
            <div class="card-content">
              <!-- 文件名 -->
              <div class="file-name">{{ log.original_name || '-' }}</div>
              
              <!-- 状态和操作 -->
              <div class="card-footer">
                <!-- 状态Badge -->
                <div class="status-badge-wrapper">
                  <div :class="['status-badge', getStatusBadgeClass(log.status)]">
                    <van-icon :name="getStatusIcon(log.status)" class="status-icon" />
                    <span>{{ getStatusText(log.status) }}</span>
                  </div>
                </div>
                
                <!-- 点击查看文字（仅当状态为完成时显示） -->
                <div v-if="log.status === 'parsed' || log.status === 'completed'" class="view-text">
                  点击查看
                </div>
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
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { 
  List as VanList, 
  Empty as VanEmpty,
  Icon as VanIcon
} from 'vant'
import api from '@/api'

export default {
  name: 'MDeviceLogs',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const deviceId = computed(() => route.params?.deviceId || '')
    const logs = ref([])
    const allLogs = ref([])
    const deviceInfo = ref(null)
    const totalLogs = ref(0)
    const loading = ref(false)
    const finished = ref(false)
    const statusFilter = ref('all')
    const startTime = ref('')
    const endTime = ref('')
    const showStatusDropdown = ref(false)
    const page = ref(1)
    const pageSize = 20

    const statusOptions = [
      { text: t('mobile.deviceLogs.statusAll'), value: 'all' },
      { text: t('mobile.deviceLogs.statusCompleted'), value: 'completed' },
      { text: t('mobile.deviceLogs.statusIncomplete'), value: 'incomplete' }
    ]

    // 定义完成状态和未完成状态
    const completedStatuses = ['parsed', 'completed']
    const incompleteStatuses = ['uploading', 'queued', 'decrypting', 'parsing', 'failed', 'decrypt_failed', 'parse_failed', 'file_error']

    // 状态筛选在前端进行（因为后端不支持状态筛选参数）
    // 时间筛选在后端进行（使用 time_range_start 和 time_range_end）
    const filteredLogs = computed(() => {
      // 如果状态筛选是"全部"，直接返回
      if (statusFilter.value === 'all') {
        return allLogs.value
      }
      // 完成状态：只显示已完成的状态
      if (statusFilter.value === 'completed') {
        return allLogs.value.filter(log => completedStatuses.includes(log.status))
      }
      // 未完成状态：显示所有未完成的状态
      if (statusFilter.value === 'incomplete') {
        return allLogs.value.filter(log => incompleteStatuses.includes(log.status))
      }
      // 默认返回全部
      return allLogs.value
    })

    const fetchDeviceInfo = async () => {
      // 如果 deviceInfo 已经设置（从日志中提取），就不需要再获取
      if (deviceInfo.value) {
        return
      }
      
      try {
        // 方法1：尝试从 getByDevice 获取（不使用 limit: 1，而是获取所有设备组）
        const resp = await api.logs.getByDevice({ device_id: deviceId.value, limit: 10000 })
        const groups = resp?.data?.device_groups || []
        const group = groups.find(g => g.device_id === deviceId.value)
        if (group) {
          deviceInfo.value = {
            hospital: group.hospital_name || '-'
          }
          // 如果 totalLogs 还没有设置，使用设备组的 log_count
          if (!totalLogs.value) {
            totalLogs.value = group.log_count || 0
          }
        } else {
          // 如果没找到设备组，从日志列表中提取设备信息（fetchPage 已经执行）
          extractDeviceInfoFromLogs()
        }
      } catch (error) {
        console.error('Failed to fetch device info:', error)
        // 如果出错，从日志列表中提取设备信息
        extractDeviceInfoFromLogs()
      }
    }
    
    const extractDeviceInfoFromLogs = () => {
      if (allLogs.value.length > 0) {
        const firstLog = allLogs.value[0]
        deviceInfo.value = {
          hospital: firstLog.hospital_name || '-'
        }
      } else {
        deviceInfo.value = {
          hospital: '-'
        }
      }
    }

    const fetchPage = async (currentPage) => {
      if (loading.value) return
      
      try {
        loading.value = true
        
        // 使用传入的页码，避免在 onLoad 中提前递增导致的问题
        const pageToFetch = currentPage !== undefined ? currentPage : page.value
        
        // 构建查询参数
        const params = {
          page: pageToFetch,
          limit: pageSize,
          device_id: deviceId.value
        }
        
        // 添加时间范围筛选（转换为文件名前缀格式 YYYYMMDDHH）
        if (startTime.value || endTime.value) {
          if (startTime.value) {
            const startDate = new Date(startTime.value)
            const year = startDate.getFullYear()
            const month = String(startDate.getMonth() + 1).padStart(2, '0')
            const day = String(startDate.getDate()).padStart(2, '0')
            const hour = String(startDate.getHours()).padStart(2, '0')
            params.time_range_start = `${year}${month}${day}${hour}`
          }
          if (endTime.value) {
            const endDate = new Date(endTime.value)
            endDate.setHours(23, 59, 59, 999)
            const year = endDate.getFullYear()
            const month = String(endDate.getMonth() + 1).padStart(2, '0')
            const day = String(endDate.getDate()).padStart(2, '0')
            const hour = String(endDate.getHours()).padStart(2, '0')
            params.time_range_end = `${year}${month}${day}${hour}`
          }
        }
        
        const resp = await api.logs.getList(params)
        const list = resp?.data?.logs || []
        const total = resp?.data?.total || 0
        
        // 调试信息：记录请求参数和响应
        console.log('fetchPage - Request params:', params)
        console.log('fetchPage - Response:', { listLength: list.length, total, pageToFetch })
        
        if (pageToFetch === 1) {
          // 第一页，替换所有数据
          allLogs.value = list
          totalLogs.value = total
          
          // 如果 deviceInfo 还没有设置，从日志中提取
          if (!deviceInfo.value && list.length > 0) {
            const firstLog = list[0]
            deviceInfo.value = {
              hospital: firstLog.hospital_name || '-'
            }
          }
        } else {
          // 后续页，追加数据（去重，避免重复数据）
          const existingIds = new Set(allLogs.value.map(log => log.id))
          const newLogs = list.filter(log => !existingIds.has(log.id))
          allLogs.value = [...allLogs.value, ...newLogs]
          console.log('Appended logs:', newLogs.length, 'Total now:', allLogs.value.length)
        }
        
        // 判断是否还有更多数据
        // 1. 如果返回的数据为空，说明没有更多数据
        // 2. 如果返回的数据少于 pageSize，说明已经是最后一页
        // 3. 如果已加载的数据量已经达到或超过总数
        if (list.length === 0 || allLogs.value.length >= total) {
          finished.value = true
          console.log('Marked as finished - list.length:', list.length, 'allLogs.length:', allLogs.value.length, 'total:', total)
        } else if (list.length < pageSize) {
          // 返回的数据少于 pageSize，说明是最后一页
          finished.value = true
          console.log('Marked as finished - last page, list.length:', list.length, '< pageSize:', pageSize)
        } else {
          finished.value = false
          console.log('More data available - allLogs.length:', allLogs.value.length, 'total:', total)
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error)
        finished.value = true
      } finally {
        loading.value = false
      }
    }

    const onLoad = async () => {
      console.log('onLoad called, page:', page.value, 'finished:', finished.value, 'loading:', loading.value, 'allLogs.length:', allLogs.value.length, 'totalLogs:', totalLogs.value)
      
      if (finished.value) {
        console.log('onLoad skipped: already finished')
        return
      }
      
      if (loading.value) {
        console.log('onLoad skipped: already loading')
        return
      }
      
      // 保存当前页码，避免在 fetchPage 执行过程中被修改
      const currentPage = page.value
      console.log('Starting to load page:', currentPage)
      
      // 如果是第一页，先获取设备信息
      if (currentPage === 1) {
        await fetchDeviceInfo()
      }
      
      // 加载当前页数据（传入当前页码，避免使用可能被修改的 page.value）
      await fetchPage(currentPage)
      
      // 加载完成后，如果还有更多数据，增加页码准备下次加载
      // 注意：只有在确实还有更多数据时才增加页码
      if (!finished.value && allLogs.value.length < totalLogs.value) {
        page.value = currentPage + 1
        console.log('Page incremented to:', page.value, 'Ready for next load. Current:', allLogs.value.length, 'Total:', totalLogs.value)
      } else {
        console.log('All data loaded, finished. Total loaded:', allLogs.value.length, 'Total:', totalLogs.value)
      }
    }
    
    // 筛选条件变化时，重置分页并重新加载
    const resetAndReload = () => {
      page.value = 1
      allLogs.value = []
      finished.value = false
      onLoad()
    }

    const handleStatusChange = () => {
      // 状态筛选已通过computed处理
    }

    const handleStatusSelect = (value) => {
      statusFilter.value = value
      showStatusDropdown.value = false
      // 筛选条件变化，重置并重新加载
      resetAndReload()
    }
    
    // 监听时间筛选变化
    let timeFilterTimer = null
    watch([startTime, endTime], () => {
      // 清除之前的定时器
      if (timeFilterTimer) {
        clearTimeout(timeFilterTimer)
      }
      // 延迟执行，避免频繁请求
      timeFilterTimer = setTimeout(() => {
        resetAndReload()
      }, 500)
    })

    const getStatusFilterText = () => {
      const option = statusOptions.find(opt => opt.value === statusFilter.value)
      return option ? option.text : '全部状态'
    }

    const getStatusBadgeClass = (status) => {
      if (status === 'parsed' || status === 'completed') {
        return 'status-badge-success'
      } else if (status === 'failed' || status === 'decrypt_failed' || status === 'parse_failed' || status === 'file_error') {
        return 'status-badge-error'
      } else if (status === 'decrypting' || status === 'parsing' || status === 'uploading') {
        return 'status-badge-processing'
      }
      return 'status-badge-default'
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

    const handleClickOutside = (event) => {
      if (showStatusDropdown.value && !event.target.closest('.filter-section')) {
        showStatusDropdown.value = false
      }
    }

    // 监听路由参数变化，切换设备时重置状态
    watch(() => route.params?.deviceId, (newDeviceId, oldDeviceId) => {
      if (newDeviceId && newDeviceId !== oldDeviceId) {
        // 重置状态
        page.value = 1
        allLogs.value = []
        deviceInfo.value = null
        totalLogs.value = 0
        finished.value = false
        loading.value = false
        statusFilter.value = 'all'
        startTime.value = ''
        endTime.value = ''
        showStatusDropdown.value = false
        // 重新加载数据
        onLoad()
      }
    })

    onMounted(() => {
      // 确保初始状态正确
      page.value = 1
      finished.value = false
      allLogs.value = []
      
      // 不在这里手动调用 onLoad，让 van-list 自动触发
      // van-list 会在组件挂载后自动调用 @load 事件
      document.addEventListener('click', handleClickOutside)
    })

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleClickOutside)
    })

    return {
      deviceId,
      deviceInfo,
      totalLogs,
      logs,
      filteredLogs,
      loading,
      finished,
      statusFilter,
      statusOptions,
      startTime,
      endTime,
      showStatusDropdown,
      onLoad,
      handleStatusChange,
      handleStatusSelect,
      getStatusFilterText,
      formatFileSize,
      formatTime,
      getUploaderName,
      getStatusText,
      getStatusIcon,
      getStatusBadgeClass,
      viewLog
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
  padding: 14px 6px;
  /* 顶部安全区域：防止被前置摄像头遮挡 */
  padding-top: max(14px, calc(env(safe-area-inset-top) + 14px));
}

.header-container {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.back-icon {
  font-size: 20px;
  color: #323233;
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 2px;
}

.header-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 24px;
  flex-wrap: wrap;
}

.header-title {
  font-size: 14px;
  font-weight: 400;
  color: #101828;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.header-hospital {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: #6a7282;
  line-height: 16px;
}

.header-logs {
  flex-shrink: 0;
  font-size: 11px;
  color: #6a7282;
  line-height: 16px;
}

.header-row .info-text {
  font-size: 11px;
  color: #6a7282;
  line-height: 16px;
}

.info-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-value-primary {
  color: #155dfc;
  font-weight: 500;
}

/* 筛选区域（固定定位） */
.filter-section {
  position: fixed;
  /* header高度：padding-top(max(14px, safe-area + 14px)) + 内容高度(24px) + padding-bottom(14px) */
  top: calc(max(14px, calc(env(safe-area-inset-top) + 14px)) + 24px + 14px);
  left: 0;
  right: 0;
  z-index: 99;
  background-color: #f7f8fa;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.content {
  padding-left: 12px;
  padding-right: 12px;
  /* 增加底部 padding，确保滚动能正确触发加载（移除底部导航栏后需要更多空间） */
  padding-bottom: max(20px, env(safe-area-inset-bottom) + 20px);
  /* 给固定区域留出空间：header高度 + 筛选区域高度（筛选区域padding 16px + 时间选择器约86px + 状态筛选按钮32px = 约134px） */
  padding-top: calc(max(14px, calc(env(safe-area-inset-top) + 14px)) + 24px + 14px + 134px);
}

/* 时间范围选择器 */
.time-range-section {
  background-color: #fff;
  border-radius: 14px;
  border: 1.439px solid rgba(0, 0, 0, 0.1);
  padding: 10px;
  margin-bottom: 0;
}

.time-range-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #101828;
  margin-bottom: 8px;
}

.time-icon {
  font-size: 14px;
  color: #6a7282;
}

.time-inputs {
  display: flex;
  gap: 6px;
}

.time-input {
  flex: 1;
  height: 32px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  color: #101828;
  background-color: #fff;
}

.time-input:focus {
  outline: none;
  border-color: #155dfc;
}

/* 状态筛选按钮 */
.status-filter-button {
  width: 100%;
  height: 32px;
  background-color: #fff;
  border: 1.439px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #101828;
  cursor: pointer;
  outline: none;
}

.dropdown-icon {
  font-size: 14px;
  color: #6a7282;
}

/* 状态下拉菜单 */
.status-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 12px;
  right: 12px;
  background-color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 101;
  overflow: hidden;
}

.status-option {
  padding: 8px 10px;
  font-size: 13px;
  color: #101828;
  cursor: pointer;
  transition: background-color 0.2s;
}

.status-option:hover {
  background-color: #f7f8fa;
}

.status-option.active {
  background-color: #ecf5ff;
  color: #155dfc;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-card {
  background-color: #fff;
  border-radius: 14px;
  border: 1.439px solid rgba(0, 0, 0, 0.1);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.log-card:active {
  background-color: #f5f5f5;
}

.card-content {
  padding: 13.43px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-name {
  font-size: 14px;
  font-weight: 400;
  color: #101828;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22.85px;
}

.status-badge-wrapper {
  flex-shrink: 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22.85px;
  border-radius: 8px;
  padding: 0 9.42px;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
}

.status-icon {
  font-size: 12px;
  width: 12px;
  height: 12px;
}

.status-badge-success {
  background-color: #f3f4f6;
  color: #364153;
}

.status-badge-error {
  background-color: #f3f4f6;
  color: #364153;
}

.status-badge-processing {
  background-color: #f3f4f6;
  color: #364153;
}

.status-badge-default {
  background-color: #f3f4f6;
  color: #364153;
}

.view-text {
  font-size: 12px;
  font-weight: 400;
  color: #99a1af;
  line-height: 16px;
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

</style>
