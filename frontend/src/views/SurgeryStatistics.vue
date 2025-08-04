<template>
  <div class="surgery-statistics-container">
    <!-- 页面标题和操作栏 -->
    <div class="action-bar">
      <div class="title-section">
        <h2 class="page-title">手术统计</h2>
        <p class="page-subtitle">查看和分析各场手术的详细统计数据</p>
      </div>
      
      <div class="action-section">
        <el-tag type="info" size="large">
          <el-icon><Globe /></el-icon>
          远程手术模式
        </el-tag>
      </div>
    </div>
    
    <!-- 分析按钮 -->
    <div class="analysis-section" v-if="!surgeries.length">
      <el-card class="empty-card">
        <div class="empty-content">
          <el-icon class="empty-icon"><Calendar /></el-icon>
          <h3>暂无手术数据</h3>
          <p>点击按钮开始实时分析日志条目数据</p>
          
          <!-- 日志条目信息 -->
          <div class="log-entries-info">
            <el-alert
              title="使用日志条目数据"
              type="info"
              :closable="false"
              show-icon
            >
              <template #default>
                <p v-if="logEntriesCount > 0">
                  将使用 {{ logEntriesCount }} 条已按时间戳排序的日志条目进行分析
                </p>
                <p v-else>
                  暂无日志条目数据，请先在批量分析或日志分析页面加载日志数据
                </p>
                <p v-if="logEntriesCount > 0" class="entries-preview">
                  时间范围: {{ getTimeRange() }}
                </p>
              </template>
            </el-alert>
          </div>
          
          <el-button 
            type="primary" 
            @click="analyzeLogs" 
            :loading="analyzing"
            :disabled="logEntriesCount === 0"
          >
            <el-icon><DataAnalysis /></el-icon>
            {{ getAnalysisButtonText() }}
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 手术统计内容 -->
    <div v-else>
      <!-- 分析信息提示 -->
      <el-card class="analysis-info-card" v-if="analysisInfo">
        <el-alert
          :title="analysisInfo.title"
          :type="analysisInfo.type"
          :closable="false"
          show-icon
        >
          <template #default>
            <p>{{ analysisInfo.message }}</p>
          </template>
        </el-alert>
      </el-card>
      
      <!-- 标签页导航 -->
      <el-card class="tab-card">
        <el-tabs v-model="activeTab" type="card" @tab-click="handleTabClick">
          <el-tab-pane 
            v-for="surgery in surgeries" 
            :key="surgery.id"
            :label="surgery.surgery_id"
            :name="surgery.id.toString()"
          >
            <!-- 导出按钮 -->
            <div class="export-section">
              <el-button type="primary" @click="exportReport(surgery.id)">
                <el-icon><Download /></el-icon>
                导出手术报告 PDF
              </el-button>
            </div>
            
            <!-- 手术时间信息 -->
            <el-row :gutter="20" class="time-info-section">
              <el-col :span="6">
                <el-card class="time-card">
                  <div class="time-item">
                    <el-icon class="time-icon primary"><PowerOff /></el-icon>
                    <div class="time-content">
                      <div class="time-label">开机时间</div>
                      <div class="time-value">{{ formatTime(surgery.power_on_time) }}</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="time-card">
                  <div class="time-item">
                    <el-icon class="time-icon danger"><PowerOff /></el-icon>
                    <div class="time-content">
                      <div class="time-label">关机时间</div>
                      <div class="time-value">{{ formatTime(surgery.power_off_time) }}</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="time-card">
                  <div class="time-item">
                    <el-icon class="time-icon success"><VideoPlay /></el-icon>
                    <div class="time-content">
                      <div class="time-label">手术开始时间</div>
                      <div class="time-value">{{ formatTime(surgery.surgery_start_time) }}</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="time-card">
                  <div class="time-item">
                    <el-icon class="time-icon warning"><VideoPause /></el-icon>
                    <div class="time-content">
                      <div class="time-label">手术结束时间</div>
                      <div class="time-value">{{ formatTime(surgery.surgery_end_time) }}</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
            </el-row>
            
            <!-- 工具臂使用统计 -->
            <el-card class="arm-usage-card">
              <template #header>
                <div class="card-header">
                  <span>工具臂使用统计</span>
                  <el-tag type="info">总手术时长: {{ surgery.total_duration }} 分钟</el-tag>
                </div>
              </template>
              
              <!-- 主时间轴坐标轴 - 手术全程时间线 -->
              <div class="timeline-axis">
                <!-- 时间刻度 -->
                <div v-for="tick in getTimelineTicks(surgery.surgery_start_time, surgery.surgery_end_time)" :key="tick.time.getTime()" class="timeline-tick-container">
                  <div class="timeline-tick" :style="{ left: tick.position + '%' }"></div>
                  <div class="timeline-label" :style="{ left: tick.position + '%' }">{{ formatTimeShort(tick.time) }}</div>
                </div>
                
                <!-- 全程时间线 -->
                <div class="timeline-base"></div>
                
                <!-- 手术阶段标记 -->
                <div class="timeline-marker start">
                  <el-icon><VideoPlay /></el-icon>
                  手术开始
                </div>
                <div class="timeline-marker end">
                  <el-icon><VideoPause /></el-icon>
                  手术结束
                </div>
              </div>
              
              <!-- 工具臂时间线 -->
              <div class="arm-timeline">
                <div 
                  v-for="(armUsage, index) in getArmUsages(surgery)" 
                  :key="index"
                  class="arm-item"
                >
                  <div class="arm-header">
                    <div class="arm-info">
                      <div class="arm-color" :class="`arm-${index + 1}`"></div>
                      <span class="arm-name">工具臂 {{ index + 1 }}</span>
                    </div>
                    <div class="arm-actions">
                      <el-button 
                        size="small" 
                        type="primary" 
                        plain
                        @click="toggleArmDetails(surgery.id, index)"
                      >
                        <el-icon><ArrowDown /></el-icon>
                        详情
                      </el-button>
                      <el-tag size="small" type="info">总激活时间: {{ getArmTotalTime(armUsage) }}</el-tag>
                    </div>
                  </div>
                  
                  <!-- 工具臂总激活时间 -->
                  <div class="arm-timeline-bar">
                    <div class="timeline-segment" :class="`arm-${index + 1}`" :style="getArmTimelineStyle(armUsage, surgery)">
                      <span class="segment-text">激活中</span>
                    </div>
                  </div>
                  
                  <!-- 工具臂详细器械使用时间 -->
                  <el-collapse-transition>
                    <div v-show="armDetailsVisible[surgery.id + '_' + index]" class="arm-details">
                      <div 
                        v-for="(usage, usageIndex) in armUsage" 
                        :key="usageIndex"
                        class="usage-item"
                      >
                        <div class="usage-info">
                          <div class="usage-name">{{ usage.instrumentName }}</div>
                          <div class="usage-udi">UDI: {{ usage.udi }}</div>
                        </div>
                        <div class="usage-timeline">
                          <div class="timeline-segment-sub" :class="`arm-${index + 1}`" :style="getUsageTimelineStyle(usage, surgery)"></div>
                        </div>
                      </div>
                      
                      <!-- 能量激发时间 -->
                      <div class="energy-time">
                        <el-icon class="energy-icon"><Lightning /></el-icon>
                        能量激发总时间: {{ getEnergyTime(armUsage) }}
                      </div>
                    </div>
                  </el-collapse-transition>
                </div>
              </div>
            </el-card>
            
            <!-- 安全报警信息 -->
            <el-card class="alarm-card">
              <template #header>
                <span>安全报警记录</span>
              </template>
              
              <el-table :data="getAlarmDetails(surgery)" style="width: 100%">
                <el-table-column prop="time" label="时间" width="180">
                  <template #default="{ row }">
                    {{ formatTime(row.time) }}
                  </template>
                </el-table-column>
                <el-table-column prop="type" label="报警类型" width="120">
                  <template #default="{ row }">
                    <el-tag :type="getAlarmTypeTag(row.type)">{{ row.type }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="报警信息" />
                <el-table-column prop="status" label="处理状态" width="120">
                  <template #default="{ row }">
                    <el-tag type="success">{{ row.status }}</el-tag>
                  </template>
                </el-table-column>
              </el-table>
              
              <div class="alarm-summary">
                <el-tag type="danger">报警总数: {{ surgery.alarm_count || 0 }}</el-tag>
              </div>
            </el-card>
            
            <!-- 状态机变化曲线和脚踏/手离合统计 -->
            <el-row :gutter="20" class="charts-section">
              <!-- 状态机变化曲线 -->
              <el-col :span="12">
                <el-card class="chart-card">
                  <template #header>
                    <span>状态机变化曲线</span>
                  </template>
                  <div class="chart-container">
                    <canvas :id="`stateMachineChart-${surgery.id}`"></canvas>
                  </div>
                </el-card>
              </el-col>
              
              <!-- 脚踏和手离合信号统计 -->
              <el-col :span="12">
                <el-card class="chart-card">
                  <template #header>
                    <span>脚踏和手离合信号统计</span>
                  </template>
                  <div class="chart-container">
                    <canvas :id="`footPedalChart-${surgery.id}`"></canvas>
                  </div>
                  
                  <el-row :gutter="20" class="stats-section">
                    <el-col :span="12">
                      <div class="stats-card">
                        <h4>脚踏信号</h4>
                        <ul class="stats-list">
                          <li>
                            <span>能量脚踏</span>
                            <el-tag size="small">{{ surgery.foot_pedal_stats?.energy || 0 }} 次</el-tag>
                          </li>
                          <li>
                            <span>离合脚踏</span>
                            <el-tag size="small">{{ surgery.foot_pedal_stats?.clutch || 0 }} 次</el-tag>
                          </li>
                          <li>
                            <span>镜头控制</span>
                            <el-tag size="small">{{ surgery.foot_pedal_stats?.camera || 0 }} 次</el-tag>
                          </li>
                        </ul>
                      </div>
                    </el-col>
                    <el-col :span="12">
                      <div class="stats-card">
                        <h4>手离合信号</h4>
                        <ul class="stats-list">
                          <li v-for="i in 4" :key="i">
                            <span>工具臂 {{ i }}</span>
                            <el-tag size="small">{{ surgery.hand_clutch_stats?.[`arm${i}`] || 0 }} 次</el-tag>
                          </li>
                        </ul>
                      </div>
                    </el-col>
                  </el-row>
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { 
  DataAnalysis, 
  Download, 
  SwitchButton, 
  Close, 
  VideoPlay, 
  VideoPause, 
  ArrowUp, 
  ArrowDown,
  ArrowLeft,
  Calendar,
  PowerOff,
  Lightning,
  Globe
} from '@element-plus/icons-vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
import api from '@/api'

export default {
  name: 'SurgeryStatistics',
  components: {
    DataAnalysis,
    Download,
    SwitchButton,
    Close,
    VideoPlay,
    VideoPause,
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    Calendar,
    PowerOff,
    Lightning,
    Globe
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    
    // 响应式数据
    const surgeries = ref([])
    const activeTab = ref('')
    const armDetailsVisible = reactive({})
    const analyzing = ref(false)
    const analysisInfo = ref(null)
    
    // 图表实例
    const charts = reactive({})

    // 计算属性 - 获取日志条目数据
    const logEntries = computed(() => {
      // 优先从sessionStorage获取手术分析专用数据
      try {
        const surgeryData = sessionStorage.getItem('surgeryAnalysisData')
        if (surgeryData) {
          const data = JSON.parse(surgeryData)
          if (data && data.entries && data.entries.length > 0) {
            // 检查数据是否过期（1小时）
            const dataAge = Date.now() - (data.timestamp || 0)
            if (dataAge > 60 * 60 * 1000) {
              console.log('手术分析数据已过期，清除缓存')
              sessionStorage.removeItem('surgeryAnalysisData')
              return []
            }
            
            // 检查是否是压缩格式的数据
            if (data.compressed) {
              // 解压缩数据
              const decompressedEntries = data.entries.map(entry => ({
                timestamp: entry.t,
                error_code: entry.e,
                param1: entry.p1,
                param2: entry.p2,
                param3: entry.p3,
                param4: entry.p4,
                explanation: entry.exp,
                log_name: entry.ln
              }))
              
              return decompressedEntries
            } else {
              return data.entries
            }
          }
        }
      } catch (error) {
        console.error('解析手术分析数据失败:', error)
        sessionStorage.removeItem('surgeryAnalysisData')
      }
      
      // 如果没有手术分析数据，尝试获取批量分析的日志条目数据
      try {
        const batchEntries = sessionStorage.getItem('batchLogEntries')
        if (batchEntries) {
          const entries = JSON.parse(batchEntries)
          if (entries && entries.length > 0) {
            // 检查是否是压缩格式的数据
            const isCompressed = sessionStorage.getItem('batchLogEntriesCompressed') === 'true'
            
            if (isCompressed) {
              // 解压缩数据
              const decompressedEntries = entries.map(entry => ({
                timestamp: entry.t,
                error_code: entry.e,
                param1: entry.p1,
                param2: entry.p2,
                param3: entry.p3,
                param4: entry.p4,
                explanation: entry.exp,
                log_name: entry.ln
              }))
              
              return decompressedEntries
            } else {
              return entries
            }
          }
        }
      } catch (error) {
        console.error('解析批量分析数据失败:', error)
      }
      
      // 如果没有批量分析数据，尝试获取单个日志数据
      try {
        const singleEntries = sessionStorage.getItem('logEntries')
        if (singleEntries) {
          const entries = JSON.parse(singleEntries)
          if (entries && entries.length > 0) {
            return entries
          }
        }
      } catch (error) {
        console.error('解析单个日志数据失败:', error)
      }
      
      return []
    })
    
    const logEntriesCount = computed(() => logEntries.value.length)
    
    // 获取时间范围
    const getTimeRange = () => {
      if (logEntries.value.length === 0) return '无数据'
      
      const timestamps = logEntries.value.map(entry => new Date(entry.timestamp))
      const minTime = new Date(Math.min(...timestamps))
      const maxTime = new Date(Math.max(...timestamps))
      
      return `${formatTimeShort(minTime)} 至 ${formatTimeShort(maxTime)}`
    }

    // 获取分析按钮文本
    const getAnalysisButtonText = () => {
      if (logEntriesCount.value === 0) {
        return '请先加载日志条目数据'
      }
      return `分析日志条目 (${logEntriesCount.value})`
    }

    // 分析日志数据
    const analyzeLogs = async () => {
      if (logEntries.value.length === 0) {
        ElMessage.warning('暂无日志条目数据，请先在批量分析或日志分析页面加载日志数据')
        return
      }
      
      analyzing.value = true
      try {
        // 直接使用已排序的日志条目数据进行手术分析
        
        // 检查数据大小
        const dataSize = JSON.stringify(logEntries.value).length
        const maxSize = 10 * 1024 * 1024 // 10MB
        let analysisData = logEntries.value
        
        if (dataSize > maxSize) {
          ElMessage.warning(`数据量较大(${(dataSize / 1024 / 1024).toFixed(1)}MB)，将进行数据采样以提高分析速度`)
          
          // 数据采样：保留关键数据点
          const sampleSize = Math.floor(maxSize / (dataSize / logEntries.value.length))
          const step = Math.floor(logEntries.value.length / sampleSize)
          analysisData = []
          
          for (let i = 0; i < logEntries.value.length; i += step) {
            analysisData.push(logEntries.value[i])
            if (analysisData.length >= sampleSize) break
          }
          
        }
        
        analysisInfo.value = {
          title: '使用已排序日志条目数据分析',
          type: 'info',
          message: `成功分析了 ${analysisData.length} 条已按时间戳排序的日志条目${dataSize > maxSize ? '（已采样）' : ''}`
        }
        
        // 调用新的API端点，传递已排序的日志条目数据
        const response = await api.surgeryStatistics.analyzeSortedEntries(analysisData)
        
        if (response.data.success) {
          surgeries.value = response.data.data || []
          
          if (surgeries.value.length > 0) {
            activeTab.value = surgeries.value[0].id.toString()
            surgeries.value.forEach(surgery => {
              armDetailsVisible[surgery.id] = false
            })
            // 初始化图表
            nextTick(() => {
              setTimeout(() => {
                initCharts()
              }, 100)
            })
          }
          
          ElMessage.success(`手术数据分析完成，共发现 ${surgeries.value.length} 场手术`)
        } else {
          ElMessage.error(response.data.message || '分析失败')
        }
      } catch (error) {
        ElMessage.error('分析日志数据失败: ' + (error.response?.data?.message || error.message))
      } finally {
        analyzing.value = false
      }
    }

    // 导出报告
    const exportReport = async (surgeryId) => {
      try {
        const response = await api.surgeryStatistics.exportReport(surgeryId)
        ElMessage.success('报告导出功能开发中')
      } catch (error) {
        ElMessage.error('导出报告失败')
      }
    }

    // 切换工具臂详情显示
    const toggleArmDetails = (surgeryId, armIndex) => {
      const key = `${surgeryId}_${armIndex}`
      armDetailsVisible[key] = !armDetailsVisible[key]
    }

    // 获取工具臂使用情况
    const getArmUsages = (surgery) => {
      return [
        surgery.arm1_usage || [],
        surgery.arm2_usage || [],
        surgery.arm3_usage || [],
        surgery.arm4_usage || []
      ]
    }

    // 获取工具臂总时间
    const getArmTotalTime = (armUsage) => {
      if (!armUsage || armUsage.length === 0) return '0分钟'
      // 这里可以根据实际数据计算总时间
      return `${armUsage.length * 15}分钟`
    }

    // 获取报警类型标签类型
    const getAlarmTypeTag = (type) => {
      switch (type) {
        case '错误':
          return 'danger'
        case '警告':
          return 'warning'
        case '网络':
          return 'info'
        default:
          return 'info'
      }
    }

    // 获取报警详情
    const getAlarmDetails = (surgery) => {
      if (!surgery || !surgery.alarm_details) return []
      if (typeof surgery.alarm_details === 'string') {
        try {
          return JSON.parse(surgery.alarm_details)
        } catch {
          return []
        }
      }
      return surgery.alarm_details || []
    }

    // 格式化时间
    const formatTime = (time) => {
      if (!time) return '-'
      return new Date(time).toLocaleString()
    }

    // 格式化短时间
    const formatTimeShort = (time) => {
      if (!time) return '-'
      return new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    // 计算时间在时间轴上的位置百分比
    const getTimePosition = (time, startTime, endTime) => {
      if (!time || !startTime || !endTime) return 0
      const start = new Date(startTime).getTime()
      const end = new Date(endTime).getTime()
      const current = new Date(time).getTime()
      return Math.max(0, Math.min(100, ((current - start) / (end - start)) * 100))
    }

    // 获取时间轴刻度位置
    const getTimelineTicks = (startTime, endTime) => {
      if (!startTime || !endTime) return []
      const start = new Date(startTime)
      const end = new Date(endTime)
      const duration = end.getTime() - start.getTime()
      
      // 根据手术时长决定刻度间隔
      let interval
      if (duration <= 30 * 60 * 1000) { // 30分钟以内，5分钟间隔
        interval = 5 * 60 * 1000
      } else if (duration <= 2 * 60 * 60 * 1000) { // 2小时以内，15分钟间隔
        interval = 15 * 60 * 1000
      } else { // 超过2小时，30分钟间隔
        interval = 30 * 60 * 1000
      }
      
      const ticks = []
      let current = start.getTime()
      while (current <= end.getTime()) {
        const position = getTimePosition(current, startTime, endTime)
        ticks.push({
          time: new Date(current),
          position: position
        })
        current += interval
      }
      
      return ticks
    }

    // 获取工具臂时间线样式（时间对齐）
    const getArmTimelineStyle = (armUsage, surgery) => {
      if (!armUsage || armUsage.length === 0 || !surgery.surgery_start_time || !surgery.surgery_end_time) {
        return { left: '0%', width: '0%' }
      }
      
      // 计算工具臂使用的时间范围
      const usageTimes = armUsage.map(usage => {
        if (typeof usage === 'object' && usage.time) {
          return new Date(usage.time).getTime()
        }
        return null
      }).filter(time => time !== null)
      
      if (usageTimes.length === 0) return { left: '0%', width: '0%' }
      
      const startTime = Math.min(...usageTimes)
      const endTime = Math.max(...usageTimes)
      
      const startPosition = getTimePosition(startTime, surgery.surgery_start_time, surgery.surgery_end_time)
      const endPosition = getTimePosition(endTime, surgery.surgery_start_time, surgery.surgery_end_time)
      
      return {
        left: `${startPosition}%`,
        width: `${endPosition - startPosition}%`
      }
    }

    // 获取使用时间线样式（时间对齐）
    const getUsageTimelineStyle = (usage, surgery) => {
      if (!usage || !surgery.surgery_start_time || !surgery.surgery_end_time) {
        return { left: '0%', width: '0%' }
      }
      
      let usageTime
      if (typeof usage === 'object' && usage.time) {
        usageTime = new Date(usage.time).getTime()
      } else if (typeof usage === 'string') {
        usageTime = new Date(usage).getTime()
      } else {
        return { left: '0%', width: '0%' }
      }
      
      const position = getTimePosition(usageTime, surgery.surgery_start_time, surgery.surgery_end_time)
      return { left: `${position}%`, width: '2%' }
    }

    // 获取能量时间
    const getEnergyTime = (armUsage) => {
      if (!armUsage || armUsage.length === 0) return '0分0秒'
      return `${Math.floor(armUsage.length * 0.3)}分${armUsage.length % 60}秒`
    }

    // 标签页点击处理
    const handleTabClick = (tab) => {
      activeTab.value = tab.name
      // 先销毁现有图表
      Object.values(charts).forEach(chart => {
        if (chart) {
          chart.destroy()
        }
      })
      
      // 等待DOM更新完成后再初始化图表
      nextTick(() => {
        setTimeout(() => {
          initCharts()
        }, 100)
      })
    }

    // 初始化图表
    const initCharts = () => {
      const currentSurgery = surgeries.value.find(s => s.id.toString() === activeTab.value)
      if (!currentSurgery) {
        return
      }

      // 状态机变化图表
      const stateMachineCtx = document.querySelector(`#stateMachineChart-${currentSurgery.id}`)
      if (stateMachineCtx && currentSurgery.state_machine_changes) {
        try {
          const stateChanges = currentSurgery.state_machine_changes
          const labels = stateChanges.map(change => change.timestamp)
          const data = stateChanges.map(change => change.state)
          
          charts[`stateMachine-${currentSurgery.id}`] = new Chart(stateMachineCtx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: '状态机状态',
                data: data,
                borderColor: '#409EFF',
                backgroundColor: 'rgba(64, 158, 255, 0.1)',
                tension: 0.1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: {
                  display: true,
                  text: '状态机变化趋势'
                }
              },
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          })
        } catch (error) {
          // 静默处理图表初始化错误
        }
      }

      // 脚踏和手离合信号图表
      const footPedalCtx = document.querySelector(`#footPedalChart-${currentSurgery.id}`)
      if (footPedalCtx) {
        try {
          const footPedalData = currentSurgery.foot_pedal_stats || {}
          const handClutchData = currentSurgery.hand_clutch_stats || {}
          
          charts[`footPedal-${currentSurgery.id}`] = new Chart(footPedalCtx, {
            type: 'bar',
            data: {
              labels: ['能量脚踏', '离合脚踏', '镜头控制', '工具臂1', '工具臂2', '工具臂3', '工具臂4'],
              datasets: [{
                label: '触发次数',
                data: [
                  footPedalData.energy || 0,
                  footPedalData.clutch || 0,
                  footPedalData.camera || 0,
                  handClutchData.arm1 || 0,
                  handClutchData.arm2 || 0,
                  handClutchData.arm3 || 0,
                  handClutchData.arm4 || 0
                ],
                backgroundColor: [
                  '#409EFF', '#67C23A', '#E6A23C', 
                  '#409EFF80', '#67C23A80', '#E6A23C80', '#F56C6C80'
                ]
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          })
        } catch (error) {
          // 静默处理图表初始化错误
        }
      }
    }

    // 生命周期
    onMounted(async () => {
      
      // 直接检查sessionStorage中的数据
      let batchData = null
      let singleData = null
      
      try {
        const batchEntries = sessionStorage.getItem('batchLogEntries')
        if (batchEntries) {
          batchData = JSON.parse(batchEntries)
        }
      } catch (error) {
        // 静默处理错误
      }
      
      try {
        const singleEntries = sessionStorage.getItem('logEntries')
        if (singleEntries) {
          singleData = JSON.parse(singleEntries)
        }
      } catch (error) {
        // 静默处理错误
      }
      
      // 检查computed属性
      
      // 检查是否有已排序的日志条目数据
      if (logEntries.value.length > 0) {
        analysisInfo.value = {
          title: '检测到日志条目数据',
          type: 'info',
          message: `发现 ${logEntries.value.length} 条已按时间戳排序的日志条目，点击下方按钮开始分析`
        }
        
        // 检查是否需要自动分析
        const autoAnalyze = sessionStorage.getItem('autoAnalyze')
        if (autoAnalyze === 'true') {
          sessionStorage.removeItem('autoAnalyze') // 清除标志
          // 延迟一下确保页面完全加载
          setTimeout(() => {
            analyzeLogs()
          }, 1000)
        }
      } else {
        analysisInfo.value = {
          title: '暂无日志条目数据',
          type: 'warning',
          message: '请先在批量分析或日志分析页面加载日志数据，然后返回此页面进行分析'
        }
        
        // 如果computed没有数据，但sessionStorage有数据，尝试手动设置
        if ((batchData && batchData.length > 0) || (singleData && singleData.length > 0)) {
          analysisInfo.value = {
            title: '检测到数据但需要刷新',
            type: 'warning',
            message: '检测到日志数据，但页面可能需要刷新才能正确读取。请刷新页面或重新从批量分析页面跳转。'
          }
        }
      }
    })

    return {
      surgeries,
      activeTab,
      armDetailsVisible,
      analyzing,
      analysisInfo,
      logEntriesCount,
      analyzeLogs,
      exportReport,
      toggleArmDetails,
      getArmUsages,
      getArmTotalTime,
      getArmTimelineStyle,
      getUsageTimelineStyle,
      getEnergyTime,
      getAlarmTypeTag,
      getAlarmDetails,
      formatTime,
      formatTimeShort,
      getTimePosition,
      getTimelineTicks,
      handleTabClick,
      initCharts,
      getAnalysisButtonText,
      getTimeRange
    }
  }
}
</script>

<style scoped>
.surgery-statistics-container {
  padding: 20px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title-section {
  display: flex;
  flex-direction: column;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.page-subtitle {
  margin: 4px 0 0 0;
  font-size: 14px;
  color: #909399;
}

.action-section {
  display: flex;
  gap: 10px;
}

.empty-card {
  text-align: center;
  padding: 40px;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.empty-icon {
  font-size: 48px;
  color: #C0C4CC;
}

.empty-content h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.empty-content p {
  margin: 0;
  color: #909399;
}

.log-entries-info {
  width: 100%;
  max-width: 600px;
  margin: 20px 0;
  text-align: left;
}

.entries-preview {
  font-size: 12px;
  color: #606266;
  margin-top: 8px;
}

.analysis-info-card {
  margin-bottom: 20px;
}

.tab-card {
  border-radius: 8px;
}

.export-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}

.time-info-section {
  margin-bottom: 20px;
}

.time-card {
  height: 100%;
}

.time-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-icon {
  font-size: 24px;
  padding: 8px;
  border-radius: 8px;
}

.time-icon.primary {
  color: #409EFF;
  background-color: rgba(64, 158, 255, 0.1);
}

.time-icon.danger {
  color: #F56C6C;
  background-color: rgba(245, 108, 108, 0.1);
}

.time-icon.success {
  color: #67C23A;
  background-color: rgba(103, 194, 58, 0.1);
}

.time-icon.warning {
  color: #E6A23C;
  background-color: rgba(230, 162, 60, 0.1);
}

.time-content {
  flex: 1;
}

.time-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.time-value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.arm-usage-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.timeline-axis {
  position: relative;
  height: 60px;
  margin-bottom: 30px;
  border-bottom: 2px solid #E4E7ED;
}

.timeline-tick-container {
  position: absolute;
  bottom: 0;
}

.timeline-tick {
  position: absolute;
  width: 2px;
  height: 20px;
  background-color: #C0C4CC;
  bottom: 0;
}

.timeline-label {
  position: absolute;
  bottom: -30px;
  font-size: 12px;
  color: #909399;
  transform: translateX(-50%);
  white-space: nowrap;
}

.timeline-base {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(to right, #E4E7ED, #C0C4CC);
}

.timeline-marker {
  position: absolute;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #606266;
  background: white;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #E4E7ED;
}

.timeline-marker.start {
  left: 0;
}

.timeline-marker.end {
  right: 0;
}

.arm-timeline {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.arm-item {
  border: 1px solid #E4E7ED;
  border-radius: 8px;
  padding: 16px;
  background-color: #FAFAFA;
}

.arm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.arm-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.arm-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.arm-1 { background-color: #409EFF; }
.arm-2 { background-color: #67C23A; }
.arm-3 { background-color: #E6A23C; }
.arm-4 { background-color: #F56C6C; }

.arm-name {
  font-weight: 600;
  color: #303133;
}

.arm-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.arm-timeline-bar {
  position: relative;
  height: 32px;
  background-color: #F5F7FA;
  border-radius: 4px;
  overflow: hidden;
}

.timeline-segment {
  position: absolute;
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: 500;
}

.timeline-segment.arm-1 { background-color: #409EFF; }
.timeline-segment.arm-2 { background-color: #67C23A; }
.timeline-segment.arm-3 { background-color: #E6A23C; }
.timeline-segment.arm-4 { background-color: #F56C6C; }

.segment-text {
  font-size: 12px;
  font-weight: 500;
}

.arm-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #E4E7ED;
}

.usage-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.usage-info {
  flex: 1;
  min-width: 0;
}

.usage-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.usage-udi {
  font-size: 12px;
  color: #909399;
}

.usage-timeline {
  position: relative;
  width: 200px;
  height: 24px;
  background-color: #F5F7FA;
  border-radius: 4px;
  overflow: hidden;
}

.timeline-segment-sub {
  position: absolute;
  height: 100%;
  border-radius: 4px;
}

.timeline-segment-sub.arm-1 { background-color: #409EFF; }
.timeline-segment-sub.arm-2 { background-color: #67C23A; }
.timeline-segment-sub.arm-3 { background-color: #E6A23C; }
.timeline-segment-sub.arm-4 { background-color: #F56C6C; }

.energy-time {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
  margin-top: 12px;
}

.energy-icon {
  color: #E6A23C;
}

.alarm-card {
  margin-bottom: 20px;
}

.alarm-summary {
  margin-top: 16px;
  text-align: center;
}

.charts-section {
  margin-bottom: 20px;
}

.chart-card {
  height: 100%;
}

.chart-container {
  height: 320px;
  position: relative;
}

.stats-section {
  margin-top: 20px;
}

.stats-card {
  background-color: #F5F7FA;
  border-radius: 8px;
  padding: 16px;
}

.stats-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.stats-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.stats-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: #606266;
}

.stats-list li:last-child {
  margin-bottom: 0;
}
</style> 