<template>
  <div class="monitoring-dashboard">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1>系统监控面板</h1>
      <div class="header-actions">
        <el-button 
          type="primary" 
          :icon="Refresh" 
          @click="refreshData"
          :loading="loading"
        >
          刷新数据
        </el-button>
        <el-button 
          type="success" 
          :icon="Setting" 
          @click="showSettings = true"
        >
          告警设置
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
              <div class="metric-label">内存使用率</div>
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
              <div class="metric-label">队列等待任务</div>
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
              <div class="metric-label">活跃用户</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="metric-card">
          <div class="metric-content">
            <div class="metric-icon fairness">
              <el-icon><Scale /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ businessMetrics.fairness || 0 }}%</div>
              <div class="metric-label">用户公平性</div>
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
            <div class="section-header">
              <el-icon><Monitor /></el-icon>
              <span>系统状态</span>
            </div>
          </template>
          
          <div class="system-info">
            <div class="info-item">
              <span class="label">运行时间:</span>
              <span class="value">{{ formatUptime(systemMetrics.uptime) }}</span>
            </div>
            <div class="info-item">
              <span class="label">内存使用:</span>
              <span class="value">{{ systemMetrics.memory?.used || 0 }}MB / {{ systemMetrics.memory?.total || 0 }}MB</span>
            </div>
            <div class="info-item">
              <span class="label">缓存状态:</span>
              <span class="value" :class="{ 'status-connected': applicationMetrics.cache?.connected, 'status-disconnected': !applicationMetrics.cache?.connected }">
                {{ applicationMetrics.cache?.connected ? '已连接' : '未连接' }}
              </span>
            </div>
            <div class="info-item">
              <span class="label">缓存键数:</span>
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
                <span>队列状态</span>
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
                     高峰模式
                   </el-button>
                   <el-button 
                     :type="currentMode === 'offPeak' ? 'primary' : 'default'"
                     :loading="modeSwitching"
                     @click="switchMode('offPeak')"
                     size="small"
                   >
                     <el-icon><Moon /></el-icon>
                     非高峰模式
                   </el-button>
                 </el-button-group>
               </div>
            </div>
          </template>
          
          <div class="queue-info">
            <div class="info-item">
              <span class="label">总任务数:</span>
              <span class="value">{{ businessMetrics.tasks?.total || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">等待中:</span>
              <span class="value">{{ businessMetrics.tasks?.waiting || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">处理中:</span>
              <span class="value">{{ businessMetrics.tasks?.processing || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">已完成:</span>
              <span class="value">{{ businessMetrics.tasks?.completed || 0 }}</span>
            </div>
            <div class="info-item">
              <span class="label">失败:</span>
              <span class="value">{{ businessMetrics.tasks?.failed || 0 }}</span>
            </div>
          </div>
          
          <!-- 进程任务统计 -->
          <div class="process-stats" v-if="processStats.totalProcesses > 0">
            <div class="stats-header">
              <el-icon><Monitor /></el-icon>
              <span>进程任务分配</span>
            </div>
            <div class="process-list">
              <div 
                v-for="process in processStats.processes" 
                :key="process.pid"
                class="process-item"
                :class="{ 'master-process': process.type === 'master' }"
              >
                <div class="process-info">
                   <div class="process-header">
                     <div class="process-identity">
                       <span class="process-type" :class="`type-${process.type}`">
                         {{ process.type === 'master' ? '主进程' : '工作进程' }}
                       </span>
                       <span class="process-pid">PID: {{ process.pid }}</span>
                       <!-- 普通进程显示角色标签 -->
                       <el-tag 
                         v-if="process.role && process.role !== 'monitor'"
                         :type="getRoleType(process.role)"
                         size="small"
                         class="role-tag"
                       >
                         {{ getRoleLabel(process.role) }}
                       </el-tag>
                       <!-- 监控进程显示能力标签 -->
                       <template v-if="process.role === 'monitor'">
                         <el-tag type="info" size="small" class="role-tag">
                           目录监控
                         </el-tag>
                         <el-tag type="warning" size="small" class="role-tag">
                           历史日志
                         </el-tag>
                         <el-tag type="success" size="small" class="role-tag">
                           用户请求
                         </el-tag>
                       </template>
                     </div>
                     <div class="process-status">
                       <el-tag 
                         :type="process.status === 'active' ? 'success' : 'warning'"
                         size="small"
                       >
                         {{ process.status }}
                       </el-tag>
                     </div>
                   </div>
                  
                  <div class="process-tasks">
                    <div class="task-stat">
                      <span class="task-label">总任务:</span>
                      <span class="task-value total">{{ process.tasks?.total || 0 }}</span>
                    </div>
                    <div class="task-stat">
                      <span class="task-label">执行中:</span>
                      <span class="task-value active">{{ process.tasks?.active || 0 }}</span>
                    </div>
                    <div class="task-stat">
                      <span class="task-label">等待中:</span>
                      <span class="task-value waiting">{{ process.tasks?.waiting || 0 }}</span>
                    </div>
                    <div class="task-stat">
                      <span class="task-label">已完成:</span>
                      <span class="task-value completed">{{ process.tasks?.completed || 0 }}</span>
                    </div>
                    <div class="task-stat">
                      <span class="task-label">失败:</span>
                      <span class="task-value failed">{{ process.tasks?.failed || 0 }}</span>
                    </div>
                  </div>
                  
                  <!-- 调试信息 -->
                  <div class="debug-info" style="font-size: 12px; color: #999; margin-top: 10px;">
                    调试: role={{ process.role }}, tasks={{ JSON.stringify(process.tasks) }}
                  </div>
                  <div class="process-meta" v-if="process.type === 'worker'">
                    <span class="start-time">启动时间: {{ formatStartTime(process.startTime) }}</span>
                    <span class="uptime">运行时间: {{ formatUptime(process.uptime) }}</span>
                    <span class="restarts" v-if="process.restartCount > 0">
                      重启次数: {{ process.restartCount }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
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
              <span>系统告警</span>
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
      title="告警设置"
      width="600px"
    >
      <el-form :model="alertSettings" label-width="150px">
        <el-form-item label="内存使用率阈值">
          <el-input-number
            v-model="alertSettings.memoryUsage"
            :min="0"
            :max="100"
            :step="5"
            controls-position="right"
          />
          <span class="unit">%</span>
        </el-form-item>
        
        <el-form-item label="队列长度阈值">
          <el-input-number
            v-model="alertSettings.queueLength"
            :min="0"
            :step="10"
            controls-position="right"
          />
          <span class="unit">个任务</span>
        </el-form-item>
        
        <el-form-item label="错误率阈值">
          <el-input-number
            v-model="alertSettings.errorRate"
            :min="0"
            :max="100"
            :step="1"
            controls-position="right"
          />
          <span class="unit">%</span>
        </el-form-item>
        
        <el-form-item label="响应时间阈值">
          <el-input-number
            v-model="alertSettings.responseTime"
            :min="0"
            :step="100"
            controls-position="right"
          />
          <span class="unit">毫秒</span>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showSettings = false">取消</el-button>
        <el-button type="primary" @click="saveAlertSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
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
      refreshData,
      saveAlertSettings,
      formatUptime,
      formatStartTime,
      getStatusType,
      getRoleType,
      getRoleLabel,
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

.header-actions {
  display: flex;
  gap: 10px;
}

.overview-cards {
  margin-bottom: 20px;
}

.metric-card {
  height: 120px;
}

.metric-content {
  display: flex;
  align-items: center;
  height: 100%;
}

.metric-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
  font-size: 24px;
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
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  line-height: 1;
}

.metric-label {
  font-size: 14px;
  color: #909399;
  margin-top: 5px;
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

/* 进程统计样式 */
.process-stats {
  margin-top: 20px;
  border-top: 1px solid #ebeef5;
  padding-top: 15px;
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

.process-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.process-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 15px;
  background: #fafafa;
  transition: all 0.3s;
}

.process-item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.process-item.master-process {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-color: #409eff;
}

.process-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.process-type {
  font-weight: 600;
  color: #303133;
}

.process-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-master {
  background: #e1f3d8;
  color: #529b2e;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.type-worker {
  background: #ecf5ff;
  color: #409eff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.role-tag {
  font-size: 11px;
}

.process-status {
  display: flex;
  align-items: center;
}

.process-pid {
  color: #606266;
  font-size: 14px;
}

.process-tasks {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 10px;
}

.task-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: white;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.task-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.task-value {
  font-size: 18px;
  font-weight: 600;
}

.task-value.active {
  color: #67c23a;
}

.task-value.waiting {
  color: #e6a23c;
}

.task-value.completed {
  color: #409eff;
}

.task-value.failed {
  color: #f56c6c;
}

.task-value.total {
  color: #909399;
  font-weight: 700;
}

.process-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

.start-time, .uptime, .restarts {
  background: #f5f7fa;
  padding: 4px 8px;
  border-radius: 4px;
  margin-right: 8px;
}



</style>
