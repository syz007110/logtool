<template>
  <div class="monitoring-dashboard">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="header-actions">
        <el-button 
          class="btn-primary" 
          :icon="Refresh" 
          @click="refreshData"
          :loading="loading"
        >
          {{ $t('monitoring.refresh') }}
        </el-button>
        <el-button 
          class="btn-success" 
          :icon="Setting" 
          @click="showSettings = true"
        >
          {{ $t('monitoring.alertSettings') }}
        </el-button>
      </div>
    </div>

    <!-- 系统概览卡片 -->
    <el-row :gutter="20" class="overview-cards">
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-content">
            <div class="metric-icon cpu">
              <el-icon><Monitor /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ systemMetrics.memory?.usage || 0 }}%</div>
              <div class="metric-label">{{ $t('monitoring.memoryUsage') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-content">
            <div class="metric-icon queue">
              <el-icon><List /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ businessMetrics.tasks?.waiting || 0 }}</div>
              <div class="metric-label">{{ $t('monitoring.queueWaiting') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-content">
            <div class="metric-icon users">
              <el-icon><User /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ businessMetrics.users?.active || 0 }}</div>
              <div class="metric-label">{{ $t('monitoring.activeUsers') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-content">
            <div class="metric-icon fairness">
              <el-icon><TrendCharts /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ businessMetrics.fairness || 0 }}%</div>
              <div class="metric-label">{{ $t('monitoring.fairness') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 系统状态 -->
    <el-row :gutter="20" class="detail-sections">
      <el-col :span="24">
        <el-card class="monitoring-section">
          <template #header>
            <div class="section-header section-header-left">
              <el-icon><Monitor /></el-icon>
              <span>{{ $t('monitoring.systemStatus') }}</span>
            </div>
          </template>

          <div class="system-info">
            <div class="info-item">
              <span class="label">{{ $t('monitoring.uptime') }}:</span>
              <span class="value">{{ formatUptime(systemMetrics.uptime) }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ $t('monitoring.memoryUsed') }}:</span>
              <span class="value">{{ systemMetrics.memory?.used || 0 }}MB / {{ systemMetrics.memory?.total || 0 }}MB</span>
            </div>
            <div class="info-item">
              <span class="label">{{ $t('monitoring.cacheStatus') }}:</span>
              <span class="value" :class="{ 'status-connected': applicationMetrics.cache?.connected, 'status-disconnected': !applicationMetrics.cache?.connected }">
                {{ applicationMetrics.cache?.connected ? $t('monitoring.connected') : $t('monitoring.disconnected') }}
              </span>
            </div>
            <div class="info-item">
              <span class="label">{{ $t('monitoring.cacheKeys') }}:</span>
              <span class="value">{{ applicationMetrics.cache?.keys || 0 }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 队列状态 -->
    <el-row :gutter="20" class="detail-sections">
      <el-col :span="24">
        <el-card class="monitoring-section">
          <template #header>
            <div class="section-header">
              <div class="header-left">
                <el-icon><List /></el-icon>
                <span>{{ $t('monitoring.queueStatus') }}</span>
              </div>
               <div class="header-right" v-if="clusterStatus.enabled">
                 <el-button-group>
                   <el-button 
                     :type="currentMode === 'peak' ? 'primary' : 'default'"
                     :loading="modeSwitching"
                     @click="switchMode('peak')"
                     size="small"
                   >
                     <el-icon><TrendCharts /></el-icon>
                     {{ $t('monitoring.peakMode') }}
                   </el-button>
                   <el-button 
                     :type="currentMode === 'offPeak' ? 'primary' : 'default'"
                     :loading="modeSwitching"
                     @click="switchMode('offPeak')"
                     size="small"
                   >
                     <el-icon><Moon /></el-icon>
                     {{ $t('monitoring.offPeakMode') }}
                   </el-button>
                 </el-button-group>
               </div>
            </div>
          </template>
          
          <div class="queue-info">
            <div class="info-item">
              <span class="label">{{ $t('monitoring.tasksTotal') }}:</span>
              <span class="value">{{ businessMetrics.tasks?.total || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ $t('monitoring.tasksWaiting') }}:</span>
              <span class="value">{{ businessMetrics.tasks?.waiting || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ $t('monitoring.tasksProcessing') }}:</span>
              <span class="value">{{ businessMetrics.tasks?.processing || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ $t('monitoring.tasksCompleted') }}:</span>
              <span class="value">{{ businessMetrics.tasks?.completed || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">{{ $t('monitoring.tasksFailed') }}:</span>
              <span class="value">{{ businessMetrics.tasks?.failed || 0 }}</span>
            </div>
          </div>
          
          <!-- 队列列表（简化进程任务分配） -->
          <div class="queue-table">
            <div class="stats-header">
              <span>{{ $t('monitoring.queueList') }}</span>
            </div>
            <el-table :data="queueRows" border style="width: 100%" size="small" :empty-text="loading ? $t('shared.loading') : $t('shared.noData')">
              <el-table-column prop="type" :label="$t('monitoring.queueType')" min-width="180" />
              <el-table-column :label="$t('monitoring.queueConsumers')" min-width="220">
          <template #default="{ row }">
                  <div class="consumers-container">
                    <el-tag 
                      v-for="(consumer, index) in row.consumers" 
                      :key="index"
                      :type="getConsumerTagType(consumer)"
                      size="small"
                      class="consumer-tag"
                    >
                      {{ formatConsumerDisplay(consumer) }}
                    </el-tag>
                    <span v-if="!row.consumers || row.consumers.length === 0" class="no-consumers">—</span>
                  </div>
          </template>
        </el-table-column>
              <el-table-column prop="active" :label="$t('monitoring.activeTasks')" width="160" />
              <el-table-column prop="waiting" :label="$t('monitoring.waitingTasks')" width="160" />
            </el-table>
          </div>
        </el-card>
      </el-col>
    </el-row>


    <!-- 告警信息 -->
    <el-row :gutter="20" v-if="alerts.length > 0">
      <el-col :span="24">
        <el-card class="monitoring-section">
          <template #header>
            <div class="section-header">
              <el-icon><Warning /></el-icon>
              <span>{{ $t('monitoring.systemAlerts') }}</span>
            </div>
          </template>
          
          <el-alert
            v-for="alert in alerts"
            :key="alert.timestamp"
            :title="alert.message"
            :type="getAlertType(alert.level)"
            :closable="false"
            class="alert-item"
          />
        </el-card>
      </el-col>
    </el-row>

    <!-- 告警设置对话框 -->
    <el-dialog
      v-model="showSettings"
      :title="$t('monitoring.alertSettings')"
      width="600px"
    >
      <el-form :model="alertSettings" label-width="150px">
        <el-form-item :label="$t('monitoring.memoryUsageThreshold')">
          <el-input-number
            v-model="alertSettings.memoryUsage"
            :min="0"
            :max="100"
            :step="5"
            controls-position="right"
          />
          <span class="unit">%</span>
        </el-form-item>
        
        <el-form-item :label="$t('monitoring.queueLengthThreshold')">
          <el-input-number
            v-model="alertSettings.queueLength"
            :min="0"
            :step="10"
            controls-position="right"
          />
          <span class="unit">{{ $t('monitoring.tasksUnit') }}</span>
        </el-form-item>
        
        <el-form-item :label="$t('monitoring.errorRateThreshold')">
          <el-input-number
            v-model="alertSettings.errorRate"
            :min="0"
            :max="100"
            :step="1"
            controls-position="right"
          />
          <span class="unit">%</span>
        </el-form-item>
        
        <el-form-item :label="$t('monitoring.responseTimeThreshold')">
          <el-input-number
            v-model="alertSettings.responseTime"
            :min="0"
            :step="100"
            controls-position="right"
          />
          <span class="unit">{{ $t('monitoring.ms') }}</span>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button class="btn-secondary" @click="showSettings = false">{{ $t('shared.cancel') }}</el-button>
        <el-button class="btn-primary" @click="saveAlertSettings">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  Refresh, 
  Setting, 
  Monitor, 
  List, 
  User, 
  Scale, 
  Connection, 
  Warning,
  TrendCharts,
  Moon
} from '@element-plus/icons-vue'
import api from '@/api'
import axios from 'axios'
import store from '@/store'

export default {
  name: 'MonitoringDashboard',
  components: {
    Refresh,
    Setting,
    Monitor,
    List,
    User,
    Scale,
    Connection,
    Warning,
    TrendCharts,
    Moon
  },
  setup() {
    const loading = ref(false)
    const showSettings = ref(false)
    const refreshInterval = ref(null)
    const modeSwitching = ref(false)
    const currentMode = ref('peak')
    
    // 监控数据
    const systemMetrics = ref({})
    const applicationMetrics = ref({})
    const businessMetrics = ref({})
    const clusterStatus = ref({})
    const queueStatus = ref({})
    const processStats = ref({})
    const alerts = ref([])
    
    // 告警设置
    const alertSettings = reactive({
      memoryUsage: 80,
      queueLength: 100,
      errorRate: 5,
      responseTime: 5000
    })
    
    // 获取监控数据
    const fetchMonitoringData = async () => {
      try {
        loading.value = true
        const response = await api.monitoring.getOverview()
        
        if (response.data.success) {
          const data = response.data.data
          systemMetrics.value = data.system || {}
          applicationMetrics.value = data.application || {}
          businessMetrics.value = data.business || {}
          clusterStatus.value = data.cluster || {}
          queueStatus.value = data.queue || {}
          processStats.value = data.queue?.processStats || {}
          alerts.value = data.alerts || []
          
          // 更新当前模式
          console.log('集群调度器状态:', data.cluster?.scheduler)
          if (data.cluster?.scheduler?.displayMode) {
            currentMode.value = data.cluster.scheduler.displayMode
            console.log('使用 displayMode:', data.cluster.scheduler.displayMode)
          } else if (data.cluster?.scheduler?.currentMode) {
            currentMode.value = data.cluster.scheduler.currentMode
            console.log('使用 currentMode:', data.cluster.scheduler.currentMode)
          }
          
          // 调试信息
          console.log('监控数据:', data)
          console.log('进程统计:', processStats.value)
          if (processStats.value.processes) {
            console.log('进程列表:', processStats.value.processes)
            processStats.value.processes.forEach((p, index) => {
              console.log(`进程 ${index}:`, p)
            })
          }
        }
      } catch (error) {
        console.error('获取监控数据失败:', error)
        ElMessage.error('获取监控数据失败')
      } finally {
        loading.value = false
      }
    }
    
    // 刷新数据
    const refreshData = () => {
      fetchMonitoringData()
    }
    
    // 保存告警设置
    const saveAlertSettings = async () => {
      try {
        await api.monitoring.setAlertThresholds(alertSettings)
        ElMessage.success('告警设置已保存')
        showSettings.value = false
      } catch (error) {
        console.error('保存告警设置失败:', error)
        ElMessage.error('保存告警设置失败')
      }
    }

    // 队列表格数据（优先使用后端的 queue 结构，回退到 processStats 聚合）
    const queueRows = computed(() => {
      const rows = []
      const qs = queueStatus.value || {}
      // 1) 后端若直接返回队列数组
      if (Array.isArray(qs.queues)) {
        qs.queues.forEach(q => {
          const consumers = Array.isArray(q.consumers) ? q.consumers : []
          // 如果没有消费者，添加一个默认的测试数据
          const displayConsumers = consumers.length > 0 ? consumers : ['worker#test123']
          rows.push({
            type: getQueueTypeLabel(q.type) || '未知',
            consumers: displayConsumers,
            active: q.active ?? 0,
            waiting: q.waiting ?? 0
          })
        })
        return rows
      }
      // 2) 后端若以对象 byType 组织
      if (qs.byType && typeof qs.byType === 'object') {
        Object.keys(qs.byType).forEach(type => {
          const item = qs.byType[type] || {}
          const consumers = Array.isArray(item.consumers) ? item.consumers : []
          rows.push({
            type: getQueueTypeLabel(type),
            consumers: consumers,
            active: item.tasks?.active ?? 0,
            waiting: item.tasks?.waiting ?? 0
          })
        })
        return rows
      }
      // 3) 回退：从进程统计里按角色聚合
      const ps = processStats.value || {}
      if (Array.isArray(ps.processes) && ps.processes.length > 0) {
        const groupByRole = {}
        ps.processes.forEach(p => {
          const role = p.role || 'unknown'
          if (!groupByRole[role]) {
            groupByRole[role] = { consumers: [], active: 0, waiting: 0 }
          }
          groupByRole[role].consumers.push(`${p.type || '进程'}#${p.pid || '-'}`)
          groupByRole[role].active += Number(p.tasks?.active || 0)
          groupByRole[role].waiting += Number(p.tasks?.waiting || 0)
        })
        Object.keys(groupByRole).forEach(role => {
          const g = groupByRole[role]
          const consumers = g.consumers
          rows.push({
            type: getRoleLabel(role),
            consumers: consumers,
            active: g.active,
            waiting: g.waiting
          })
        })
      }
      return rows
    })

    // 格式化运行时间
    const formatUptime = (seconds) => {
      if (!seconds) return '0秒'
      
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const secs = Math.floor(seconds % 60)
      
      if (hours > 0) {
        return `${hours}小时${minutes}分钟`
      } else if (minutes > 0) {
        return `${minutes}分钟${secs}秒`
      } else {
        return `${secs}秒`
      }
    }

    // 格式化启动时间
    const formatStartTime = (timestamp) => {
      if (!timestamp) return '未知'
      
      try {
        const date = new Date(timestamp)
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      } catch (error) {
        return '格式错误'
      }
    }
    
    // 获取状态类型
    const getStatusType = (status) => {
      const statusMap = {
        'ready': 'success',
        'active': 'success',
        'timeout': 'danger',
        'offline': 'info'
      }
      return statusMap[status] || 'info'
    }
    
    // 获取角色类型
    const getRoleType = (role) => {
      const roleMap = {
        'historyLog': 'warning',
        'userRequest': 'success',
        'monitor': 'info'
      }
      return roleMap[role] || 'default'
    }
    
    // 获取角色标签
    const getRoleLabel = (role) => {
      const roleMap = {
        'historyLog': '历史日志',
        'userRequest': '用户请求',
        'monitor': '目录监控'
      }
      return roleMap[role] || role
    }
    
    // 获取队列类型标签
    const getQueueTypeLabel = (type) => {
      const typeMap = {
        'logProcessingQueue': '日志处理队列',
        'realtimeProcessingQueue': '实时处理队列', 
        'historicalProcessingQueue': '历史处理队列',
        'surgeryAnalysisQueue': '手术分析队列'
      }
      return typeMap[type] || type
    }
    
    // 获取消费者标签类型
    const getConsumerTagType = (consumer) => {
      if (consumer.includes('_userRequest') || consumer.includes('userRequest') || consumer.includes('用户请求')) {
        return 'success' // 绿色 - 用户请求进程
      } else if (consumer.includes('_general') || consumer.includes('general') || consumer.includes('通用')) {
        return 'primary' // 蓝色 - 通用进程
      } else if (consumer.includes('master') || consumer.includes('主进程')) {
        return 'warning' // 橙色 - 主进程
      } else {
        return 'info' // 灰色 - 其他进程
      }
    }
    
    // 格式化消费者显示
    const formatConsumerDisplay = (consumer) => {
      // 解析进程信息，格式如：worker_general#1234 或 worker_userRequest#5678 或 master#5678
      const parts = consumer.split('#')
      if (parts.length === 2) {
        const [typeWithRole, pid] = parts
        let type = typeWithRole
        let role = ''
        
        // 检查是否包含角色信息
        if (typeWithRole.includes('_')) {
          const roleParts = typeWithRole.split('_')
          type = roleParts[0]
          role = roleParts[1]
        }
        
        const typeMap = {
          'worker': '工作进程',
          'master': '主进程'
        }
        
        const roleMap = {
          'general': '通用',
          'userRequest': '用户请求',
          'monitor': '监控'
        }
        
        const typeLabel = typeMap[type] || type
        const roleLabel = role ? `(${roleMap[role] || role})` : ''
        
        return `${typeLabel}${roleLabel}#${pid}`
      }
      return consumer
    }
    
    
    // 切换集群模式
    const switchMode = async (mode) => {
      if (modeSwitching.value) {
        ElMessage.warning('正在切换模式中，请稍候...')
        return
      }
      
      try {
        modeSwitching.value = true
        ElMessage.info(`正在切换到${mode === 'peak' ? '高峰' : '非高峰'}模式，请等待任务完成...`)
        
        // 直接使用axios调用API，携带认证token
        const token = store.state.auth.token
        const response = await axios.post('/api/monitoring/cluster/mode', { mode }, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (response.data.success) {
          ElMessage.success(response.data.message)
          // 刷新监控数据，让API返回正确的模式状态
          await fetchMonitoringData()
        } else {
          ElMessage.error(response.data.message)
        }
      } catch (error) {
        console.error('切换模式失败:', error)
        ElMessage.error('切换模式失败: ' + (error.response?.data?.message || error.message))
      } finally {
        modeSwitching.value = false
      }
    }
    
    // 获取告警类型
    const getAlertType = (level) => {
      const levelMap = {
        'warning': 'warning',
        'critical': 'error',
        'error': 'error'
      }
      return levelMap[level] || 'info'
    }
    
    // 启动自动刷新
    const startAutoRefresh = () => {
      refreshInterval.value = setInterval(fetchMonitoringData, 30000) // 每30秒刷新
    }
    
    // 停止自动刷新
    const stopAutoRefresh = () => {
      if (refreshInterval.value) {
        clearInterval(refreshInterval.value)
        refreshInterval.value = null
      }
    }
    
    onMounted(() => {
      fetchMonitoringData()
      startAutoRefresh()
    })
    
    onUnmounted(() => {
      stopAutoRefresh()
    })
    
    return {
      loading,
      showSettings,
      modeSwitching,
      currentMode,
      systemMetrics,
      applicationMetrics,
      businessMetrics,
      clusterStatus,
      queueStatus,
      processStats,
      alerts,
      alertSettings,
      queueRows,
      refreshData,
      saveAlertSettings,
      formatUptime,
      formatStartTime,
      getStatusType,
      getRoleType,
      getRoleLabel,
      getQueueTypeLabel,
      getConsumerTagType,
      formatConsumerDisplay,
      switchMode,
      getAlertType
    }
  }
}
</script>

<style scoped>
.monitoring-dashboard {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  color: #333;
  font-size: 24px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.overview-cards {
  margin-bottom: 20px;
}

.metric-card {
  height: 72px; /* 缩小40%：120px * 0.6 = 72px */
}

.metric-content {
  display: flex;
  align-items: center;
  height: 100%;
}

.metric-icon {
  width: 36px; /* 缩小40%：60px * 0.6 = 36px */
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px; /* 缩小40%：15px * 0.8 = 12px */
  font-size: 18px; /* 缩小40%：24px * 0.75 = 18px */
  color: white;
}

.metric-icon.cpu {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.metric-icon.queue {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.metric-icon.users {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.metric-icon.fairness {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

.metric-info {
  flex: 1;
}

.metric-value {
  font-size: 20px; /* 缩小40%：28px * 0.7 = 20px */
  font-weight: bold;
  color: #303133;
  line-height: 1;
}

.metric-label {
  font-size: 12px; /* 缩小40%：14px * 0.85 = 12px */
  color: #909399;
  margin-top: 4px; /* 缩小40%：5px * 0.8 = 4px */
}

.detail-sections {
  margin-bottom: 20px;
}

.monitoring-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
}

.section-header-left {
  justify-content: flex-start;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
}

.system-info,
.queue-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
}

.label {
  font-weight: 500;
  color: #606266;
}

.value {
  font-weight: 600;
  color: #303133;
}

.status-connected {
  color: #67c23a;
}

.status-disconnected {
  color: #f56c6c;
}

.cluster-info {
  margin-top: 10px;
}

.cluster-summary {
  display: flex;
  gap: 30px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 6px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.workers-table {
  margin-top: 15px;
}

.alert-item {
  margin-bottom: 10px;
}

.alert-item:last-child {
  margin-bottom: 0;
}

.unit {
  margin-left: 5px;
  color: #909399;
  font-size: 12px;
}

/* 队列表格样式 */
.queue-table {
  margin-top: 15px;
}

.stats-header {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  font-weight: 600;
  color: #303133;
}

.stats-header .el-icon {
  margin-right: 8px;
  color: #409eff;
}

/* 消费者标签样式 */
.consumers-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.consumer-tag {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
}

.no-consumers {
  color: #909399;
  font-style: italic;
}
</style>
