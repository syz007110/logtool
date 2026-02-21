<template>
  <div class="surgery-statistics-container">
    <!-- 页面标题和操作栏 -->
    <div class="action-bar">
      <div class="title-section">
        <h2 class="page-title">{{ $t('surgeryStatistics.title') }}</h2>
        <p class="page-subtitle">{{ $t('surgeryStatistics.subtitle') }}</p>
      </div>
    </div>
    
    <!-- 分析按钮 -->
    <div class="analysis-section" v-if="!surgeries.length && !analyzing">
      <el-card class="empty-card">
        <div class="empty-content">
          <el-icon class="empty-icon"><Calendar /></el-icon>
          <h3>{{ $t('surgeryStatistics.dataStatsTitle') }}</h3>
          <p v-if="logEntriesCount > 0">
                          {{ $t('surgeryStatistics.detectLogs', { count: logEntriesCount }) }}
          </p>
          <p v-else>
                          {{ $t('surgeryStatistics.noLogsHint') }}
          </p>
          
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

    <!-- 分析中状态 -->
    <div class="analysis-section" v-if="!surgeries.length && analyzing">
      <el-card class="empty-card">
        <div class="empty-content">
          <el-icon class="empty-icon"><Loading /></el-icon>
          <h3>{{ $t('surgeryStatistics.analyzingTitle') }}</h3>
        </div>
      </el-card>
    </div>

    <!-- 手术统计内容 -->
    <div v-else>
      
      
      <!-- 标签页导航 -->
      <el-card class="tab-card">
        <el-tabs 
          v-model="activeTab" 
          type="card" 
          @tab-click="handleTabClick"
          :lazy="true"
          :before-leave="handleBeforeTabLeave"
          :stretch="false"
          :closable="false"
          :addable="false"
        >
          <el-tab-pane 
            v-for="surgery in surgeries" 
            :key="surgery.id"
            :label="surgery.surgery_id"
            :name="surgery.id.toString()"
            :data-surgery-id="surgery.id"
          >
            <!-- 导出按钮 -->
            <div class="export-section">
              <el-button class="btn-primary" @click="exportSurgeryData(surgery.id)">
                <el-icon><Download /></el-icon>
                {{ $t('surgeryStatistics.exportStructuredData') }}
              </el-button>
            </div>
            
                        <!-- 手术信息布局 -->
            <div class="surgery-info-layout">
              <!-- 手术时间线 - 30%宽度 -->
              <div class="timeline-section">
                <el-card class="info-card">
                  <div class="info-header">
                    <div class="time">{{ $t('surgeryStatistics.surgeryTimeline') }}</div>
                    <div class="badges">
                      <el-tag 
                        v-if="surgery.alarm_count > 0" 
                        type="danger" 
                        size="small"
                        class="alarm-tag"
                        @click="scrollToAlarmCard(surgery.id)"
                        style="cursor: pointer;"
                      >
                        {{ $t('surgeryStatistics.viewSurgeryFaults') }}
                      </el-tag>
                      <el-tag 
                        v-if="surgery.is_remote_surgery" 
                        type="info" 
                        size="small"
                        class="network-tag"
                        @click="scrollToNetworkCard(surgery.id)"
                        style="cursor: pointer; margin-left: 8px;"
                      >
                        {{ $t('surgeryStatistics.viewNetworkLatency') }}
                      </el-tag>
                    </div>
                  </div>

                  <!-- PostgreSQL结构化数据预览 -->
                  <div class="postgresql-preview-section">
                    <div class="preview-header">
                      <span class="preview-title">{{ $t('surgeryStatistics.postgresPreviewTitle') }}</span>
                      <el-button 
                        type="text" 
                        size="small" 
                        @click="togglePostgreSQLPreview(surgery.id)"
                        style="padding: 0; margin-left: 8px;"
                      >
                        {{ postgresqlPreviewVisible[surgery.id] ? $t('shared.collapse') : $t('shared.expand') }}
                      </el-button>
                    </div>
                    
                    <div v-if="postgresqlPreviewVisible[surgery.id]" class="preview-content">
                      <el-input
                        v-model="postgresqlDataText[surgery.id]"
                        type="textarea"
                        :rows="8"
                        readonly
                        :placeholder="$t('surgeryStatistics.generatingPostgres')"
                        class="postgresql-textarea"
                      />
                      <div class="preview-actions">
                        <el-button 
                          type="primary" 
                          size="small" 
                          @click="copyPostgreSQLData(surgery.id)"
                          :loading="copyingData[surgery.id]"
                        >
                          <el-icon><Document /></el-icon>
                          {{ $t('shared.copy') }}
                        </el-button>
                        <el-button 
                          type="success" 
                          size="small" 
                          @click="refreshPostgreSQLData(surgery.id)"
                          :loading="refreshingData[surgery.id]"
                        >
                          <el-icon><Refresh /></el-icon>
                          {{ $t('surgeryStatistics.refreshData') }}
                        </el-button>
                      </div>
                    </div>
                  </div>

                  <!-- 按时间顺序排序的时间线（AntD Steps progressDot 风格） -->
                  <a-steps
                    direction="vertical"
                    :current="getSortedTimelineEvents(surgery).length - 1"
                    :progress-dot="true"
                    class="surgery-steps"
                  >
                    <a-step
                      v-for="(event, index) in getSortedTimelineEvents(surgery)"
                      :key="`event-${index}`"
                      :title="event.label"
                      :description="formatTime(event.time)"
                    />
                  </a-steps>
                </el-card>
              </div>

              <!-- 手术状态变化图 - 70%宽度 -->
              <div class="state-chart-section">
                <el-card class="state-chart-card">
                  <div class="chart-header">
                    <div class="chart-title">{{ $t('surgeryStatistics.stateMachineTitle') }}</div>
                  </div>
                  
                  <!-- 状态机曲线图容器（ECharts） -->
                  <div 
                    class="state-chart-container"
                  >
                    <div :id="`stateMachineChart_${surgery.id}`" style="width: 100%; height: 100%"></div>
                  </div>
                </el-card>
              </div>
            </div>
                        
            <!-- 手术统计（恢复整行宽度），并在卡片内下方显示手术器械表 -->
            <el-card class="arm-usage-card">
              <template #header>
                <div class="card-header">
                  <span>{{ $t('surgeryStatistics.statsTitle') }}</span>
                  <el-tag type="info">{{ $t('surgeryStatistics.totalDuration') }}: {{ surgery.total_duration }} {{ $t('shared.minutes') }}</el-tag>
                </div>
              </template>

              <!-- 统一时间轴视图 - 结合手术时长和工具臂使用 -->
              <div class="unified-timeline-view">
                <!-- 手术时长进度条 -->
                <div class="surgery-progress-container">
                  <div class="surgery-duration-info">
                    <span class="duration-text">{{ $t('surgeryStatistics.durationLabel') }}：{{ surgery.total_duration }} {{ $t('shared.minutes') }}</span>
                    <span class="time-range">{{ $t('surgeryStatistics.timeRangeLabel') }}：{{ formatTime(surgery.surgery_start_time, false, false) }} - {{ formatTime(surgery.surgery_end_time, false, false) }}</span>
                  </div>
                  <div class="surgery-timeline-wrapper">
                    <div class="surgery-label">
                      <div class="surgery-color"></div>
                      <span class="surgery-name">{{ $t('surgeryStatistics.surgeryPeriod') }}</span>
                    </div>
                    <div class="surgery-timeline-container">
                      <div class="surgery-timeline-bar">
                        <div 
                          class="surgery-timeline-segment"
                          :style="getSurgeryTimelineStyle(surgery)"
                        >
                          <span class="surgery-segment-text">{{ $t('surgeryStatistics.surgeryPeriod') }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="progress-labels">
                    <span class="time-label">{{ formatTimeShort(getProgressTimelineRange(surgery).start) }}</span>
                    <span class="time-label">{{ formatTimeShort(getProgressTimelineRange(surgery).end) }}</span>
                  </div>
                </div>

                <!-- 工具臂时间线（更紧凑） -->
                <div class="arm-timeline">
                  <div 
                    v-for="(armUsage, index) in getArmUsages(surgery)" 
                    :key="index"
                    class="arm-item"
                  >
                    <div class="arm-header">
                      <div class="arm-actions">
                        <el-button 
                          size="small" 
                          type="primary" 
                          plain
                          @click="toggleArmDetails(surgery.id, index)"
                        >
                          <el-icon><ArrowDown /></el-icon>
                          {{ $t('shared.details') }}
                        </el-button>
                      </div>
                    </div>

                    <div class="arm-timeline-container">
                      <div class="arm-label">
                        <div class="arm-color" :class="`arm-${index + 1}`"></div>
                        <span class="arm-name">{{ $t('surgeryStatistics.arm') }} {{ index + 1 }}</span>
                      </div>
                      <div class="arm-timeline-bar">
                        <div 
                          v-for="(segment, segmentIndex) in getArmTimelineSegments(armUsage, surgery)" 
                          :key="segmentIndex"
                          class="timeline-segment" 
                          :class="`arm-${index + 1}`" 
                          :style="segment"
                        >
                          <el-tooltip 
                            :content="`${getSegmentInstrumentName(segment, armUsage, surgery)}`"
                            placement="top"
                            :show-arrow="true"
                            :popper-class="'usage-time-tooltip'"
                          >
                            <div class="segment-content">
                              <span class="segment-text"> </span>
                            </div>
                          </el-tooltip>
                        </div>
                      </div>
                    </div>

                    <el-collapse-transition>
                      <div v-show="armDetailsVisible[surgery.id + '_' + index]" class="arm-details">
                        <div 
                          v-for="(groupedUsage, udiCode) in getGroupedUsagesByUdi(armUsage)" 
                          :key="udiCode"
                          class="usage-group"
                        >
                          <div class="usage-group-header">
                            <div class="usage-group-info">
                              <div class="usage-group-name">
                                {{ groupedUsage.instrumentName }}
                              </div>
                              <div class="usage-group-udi">UDI: {{ udiCode }}</div>
                              <div class="usage-group-duration">{{ $t('surgeryStatistics.groupedUsageDuration') }}: {{ getGroupedUsageDuration(groupedUsage) }}</div>
                            </div>
                          </div>
                          <div class="arm-timeline-container">
                            <div class="arm-timeline-bar">
                              <div 
                                v-for="(usage, usageIndex) in groupedUsage.usages" 
                                :key="usageIndex"
                                class="timeline-segment" 
                                :class="`arm-${index + 1}`" 
                                :style="getUsageTimelineStyle(usage, surgery)"
                              >
                                <el-tooltip 
                                  :content="`${$t('surgeryStatistics.instrument')}: ${usage.instrumentName}\n${$t('shared.time')}: ${formatTime(usage.startTime)} - ${formatTime(usage.endTime)}\n${$t('surgeryStatistics.duration')}: ${Math.floor((new Date(usage.endTime) - new Date(usage.startTime)) / 1000 / 60)} ${$t('shared.minutes')}`"
                                  placement="top"
                                  :show-arrow="true"
                                  :popper-class="'usage-time-tooltip'"
                                >
                                  <div class="segment-content">
                                    <span class="segment-text">{{ getSegmentText(usage, surgery) }}</span>
                                  </div>
                                </el-tooltip>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="energy-time">
                          <el-icon class="energy-icon"><Lightning /></el-icon>
                          {{ $t('surgeryStatistics.totalInstrumentUsage') }}: {{ getEnergyTime(armUsage) }}
                        </div>
                      </div>
                    </el-collapse-transition>
                  </div>
                </div>
              </div>

              <!-- 手术器械（位于手术统计卡片内，工具臂激活时间下方） -->
              <div class="instruments-inside">
                <div class="card-header" style="margin-top: 12px; margin-bottom: 8px;">
                  <span>{{ $t('surgeryStatistics.instrumentsTitle') }}</span>
                </div>
                <el-table :data="getInstrumentRows(surgery)" size="small" style="width: 100%">
                  <el-table-column prop="instrumentName" :label="$t('surgeryStatistics.instrumentName')" min-width="180" />
                  <el-table-column prop="udi" :label="$t('surgeryStatistics.udi')" min-width="220" />
                </el-table>
              </div>
            </el-card>
            
            <!-- 安全报警信息 -->
            <el-card class="alarm-card">
              <template #header>
                <span>{{ $t('surgeryStatistics.alertsTitle') }}</span>
              </template>
              
              <el-table :data="getAlarmDetails(surgery).slice(0, showAllAlarms[surgery.id] ? undefined : 5)" style="width: 100%">
                <el-table-column prop="time" :label="$t('shared.time')" width="180">
                  <template #default="{ row }">
                    {{ formatTime(row.time) }}
                  </template>
                </el-table-column>
                <el-table-column prop="code" :label="$t('errorCodes.code')" width="120">
                  <template #default="{ row }">
                    {{ row.code || row.error_code || $t('shared.noData') }}
                  </template>
                </el-table-column>
                <el-table-column prop="message" :label="$t('surgeryStatistics.alertMessage')" />
                <el-table-column prop="status" :label="$t('surgeryStatistics.statusLabel')" width="120">
                  <template #default="{ row }">
                    <el-tag :type="row.status === '已恢复' ? 'success' : row.status === '未处理' ? 'danger' : 'warning'">
                      {{ row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
              
              <!-- 展开/折叠按钮 -->
              <div v-if="getAlarmDetails(surgery).length > 5" class="alarm-toggle">
                <el-button 
                  type="text" 
                  @click="toggleAlarms(surgery.id)"
                  size="small"
                >
                  <el-icon>
                    <ArrowDown v-if="!showAllAlarms[surgery.id]" />
                    <ArrowUp v-else />
                  </el-icon>
                  {{ showAllAlarms[surgery.id] ? $t('shared.collapse') : $t('surgeryStatistics.expandMore', { count: getAlarmDetails(surgery).length - 5 }) }}
                </el-button>
              </div>
              
              <div class="alarm-summary">
                <el-tag type="danger">{{ $t('surgeryStatistics.alarmTotal') }}: {{ surgery.alarm_count || 0 }}</el-tag>
                <el-tag type="info" style="margin-left: 8px;">{{ $t('surgeryStatistics.unhandled') }}: {{ getDeduplicatedAlarmStats(surgery).activeCount }}</el-tag>
                <div style="margin-top: 8px; font-size: 12px; color: #909399;">
                  <span>{{ $t('surgeryStatistics.noteDedup') }}</span>
                </div>
              </div>
            </el-card>
            
            <!-- 网络延时统计 -->
            <el-card v-if="surgery.is_remote_surgery" class="network-card">
              <template #header>
                <span>{{ $t('surgeryStatistics.networkLatencyTitle') }}</span>
              </template>
              
              <div v-if="surgery.network_stats" class="network-stats">
                <div class="network-summary">
                  <el-tag type="info">{{ $t('surgeryStatistics.dataPoints') }}: {{ surgery.network_stats.count }}</el-tag>
                  <el-tag type="success" style="margin-left: 8px;">{{ $t('surgeryStatistics.avgLatency') }}: {{ surgery.network_stats.avg }}ms</el-tag>
                  <el-tag type="warning" style="margin-left: 8px;">{{ $t('surgeryStatistics.range') }}: {{ surgery.network_stats.min }}-{{ surgery.network_stats.max }}ms</el-tag>
                </div>
                
                <!-- 网络延时曲线图 -->
                <div class="network-chart-container">
                  <div :id="`networkChart_${surgery.id}`" style="width: 100%; height: 300px"></div>
                </div>
              </div>
              
              <div v-else class="network-no-data">
                <el-empty :description="$t('surgeryStatistics.noNetworkLatencyData')" :image-size="60" />
              </div>
            </el-card>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, nextTick, computed, watch, h, resolveComponent } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { formatTime, formatTimeShort, formatSurgeryTime, loadServerTimezone } from '../utils/timeFormatter'
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
  ArrowRight,
  Calendar,
  Lightning,
  Loading,
  InfoFilled,
  Document,
  Refresh
} from '@element-plus/icons-vue'
import { debounce, safeNextTick } from '@/utils/resizeObserverFix'
import * as echarts from 'echarts'

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
    ArrowRight,
    Calendar,
    Lightning,
    Loading,
    Document,
    Refresh
  },
  setup() {
    // 不需要悬停效果：移除自定义 progressDot 渲染与状态区分
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    
    // ResizeObserver 错误处理已在全局初始化，这里不需要重复处理
    
    // 响应式数据
    const surgeries = ref([])
    const activeTab = ref('')
    const armDetailsVisible = reactive({})
    const showAllAlarms = reactive({})
    const analyzing = ref(false)
    
    // PostgreSQL数据预览相关
    const postgresqlPreviewVisible = reactive({})
    const postgresqlDataText = reactive({})
    const copyingData = reactive({})
    const refreshingData = reactive({})
    
    // 状态机图表相关
    const stateMachineCharts = new Map() // 为每个手术存储独立的图表实例
    const chartViewRange = ref(5) // 默认显示5分钟
    const chartCurrentTime = ref(null) // 当前图表中心时间
    
    // Y轴刻度配置 - 固定间隔
    const yAxisConfig = {
      // 固定间隔 - 显示指定的刻度值，使用映射位置增大间距
      fixedInterval: {
        afterBuildTicks: function(axis) {
          // 使用固定的刻度值
          const fixedStates = getFixedTicks()
          const positionMap = getStateToYPositionMap()
          
          // 创建刻度数组，确保显示正确的状态值
          axis.ticks = fixedStates.map(stateValue => {
            const yPosition = positionMap[stateValue]
            return {
              value: yPosition,        // Y轴位置使用映射值
              label: stateValue.toString() // 显示原始状态值
            }
          })
        }
      }
    }
    
    // 状态值到Y轴位置的映射 - 增大特定刻度之间的距离
    // 这个映射用于在Y轴上增大特定状态值之间的视觉距离，而不改变显示的刻度值
    const getStateToYPositionMap = () => {
      return {
        0: 0,   // 0位置
        1: 5,   // 1位置（与0距离增大）
        2: 10,  // 2位置
        10: 20, // 10位置
        12: 25, // 12位置（与10距离增大）
        13: 30, // 13位置（与12距离增大）
        14: 35, // 14位置（与13距离增大）
        20: 45, // 20位置（与14距离增大）
        21: 50, // 21位置（与20距离增大）
        30: 60, // 30位置（与21距离增大）
        31: 65  // 31位置（与30距离增大）
      }
    }
    
    // 固定显示指定的刻度值
    const getFixedTicks = () => {
      // 显示的刻度值：0, 1, 2, 10, 12, 13, 14, 20, 21, 30, 31
      return [0, 1, 2, 10, 12, 13, 14, 20, 21, 30, 31]
    }

    


    // 计算属性 - 获取日志条目数据
    const logEntries = computed(() => {
      // 优先从URL参数获取日志ID
      const logIdsParam = route.query.logIds
      if (logIdsParam) {
        // 如果有URL参数，直接返回空数组，让后端处理
        return []
      }
      
      // 如果没有URL参数，尝试从sessionStorage获取数据（兼容旧版本）
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
      
      return []
    })
    
    const logEntriesCount = computed(() => logEntries.value.length)
    
    // 通过URL参数中的日志ID直接分析手术数据
    const loadBatchLogEntriesByIds = async () => {
      try {
        // 从URL参数获取日志ID
        const logIdsParam = route.query.logIds
        if (!logIdsParam) return
        
        const logIds = logIdsParam.split(',').map(id => parseInt(id))
        if (!logIds || logIds.length === 0) return
        
        // 设置分析状态
        analyzing.value = true
        
        // 调用后端API创建分析任务
        const response = await api.surgeryStatistics.analyzeByLogIds(logIds)
        
        if (response.data.success && response.data.taskId) {
          // 异步任务已创建，开始轮询结果
          await pollTaskResult(response.data.taskId)
        } else if (response.data.success && response.data.data) {
          // 直接返回结果（兼容旧版本）
          surgeries.value = response.data.data || []
          
          if (surgeries.value.length > 0) {
            activeTab.value = surgeries.value[0].id.toString()
            surgeries.value.forEach(surgery => {
              armDetailsVisible[surgery.id] = false
              showAllAlarms[surgery.id] = false
              // 初始化PostgreSQL预览状态
              postgresqlPreviewVisible[surgery.id] = false
              postgresqlDataText[surgery.id] = ''
            })
          }
          
          ElMessage.success(response.data.message || `成功统计出 ${surgeries.value.length} 场手术`)
        } else {
          ElMessage.error(response.data.message || '统计失败')
        }
        
      } catch (error) {
        ElMessage.error('分析批量日志数据失败: ' + (error.response?.data?.message || error.message))
      } finally {
        analyzing.value = false
      }
    }

    // 通过URL参数中的设备+时间范围直接分析手术数据
    const loadBatchLogEntriesByDeviceRange = async () => {
      try {
        const deviceId = route.query.deviceId
        const startTime = route.query.startTime
        const endTime = route.query.endTime
        if (!deviceId || !startTime || !endTime) return

        analyzing.value = true
        const response = await api.surgeryStatistics.analyzeByDeviceRange(
          deviceId,
          startTime,
          endTime
        )

        if (response.data.success && response.data.taskId) {
          await pollTaskResult(response.data.taskId)
        } else if (response.data.success && response.data.data) {
          surgeries.value = response.data.data || []
          if (surgeries.value.length > 0) {
            activeTab.value = surgeries.value[0].id.toString()
            surgeries.value.forEach(surgery => {
              armDetailsVisible[surgery.id] = false
              showAllAlarms[surgery.id] = false
              postgresqlPreviewVisible[surgery.id] = false
              postgresqlDataText[surgery.id] = ''
            })
          }
          ElMessage.success(response.data.message || `成功统计出 ${surgeries.value.length} 场手术`)
        } else {
          ElMessage.error(response.data.message || '统计失败')
        }
      } catch (error) {
        ElMessage.error('按设备范围分析失败: ' + (error.response?.data?.message || error.message))
      } finally {
        analyzing.value = false
      }
    }
    
    // 轮询任务结果
    const pollTaskResult = async (taskId) => {
      const maxAttempts = 60 // 最多轮询60次（5分钟）
      let attempts = 0
      
      const poll = async () => {
        try {
          const response = await api.surgeryStatistics.getAnalysisTaskStatus(taskId)
          
          if (response.data.success) {
            const task = response.data.data
            
            if (task.status === 'completed') {
              // 任务完成，显示结果
              surgeries.value = task.result || []
              
              if (surgeries.value.length > 0) {
                activeTab.value = surgeries.value[0].id.toString()
                surgeries.value.forEach(surgery => {
                  armDetailsVisible[surgery.id] = false
                  showAllAlarms[surgery.id] = false
                  // 初始化PostgreSQL预览状态
                  postgresqlPreviewVisible[surgery.id] = false
                  postgresqlDataText[surgery.id] = ''
                })
              }
              
              ElMessage.success(`成功分析出 ${surgeries.value.length} 场手术`)
              return
            } else if (task.status === 'failed') {
              // 任务失败
              ElMessage.error(task.error || '分析任务失败')
              return
            } else if (task.status === 'processing') {
              // 任务进行中，继续轮询
              attempts++
              if (attempts < maxAttempts) {
                // 使用Promise包装setTimeout
                await new Promise(resolve => setTimeout(resolve, 5000))
                await poll()
              } else {
                ElMessage.error('分析任务超时，请稍后查看结果')
              }
            }
          } else {
            ElMessage.error('查询任务状态失败')
          }
        } catch (error) {
          ElMessage.error('查询任务状态失败: ' + error.message)
        }
      }
      
      // 开始轮询
      await poll()
    }
    
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
              return `统计日志条目 (${logEntriesCount.value})`
    }

          // 统计日志数据
    const analyzeLogs = async () => {
      if (logEntries.value.length === 0) {
        ElMessage.warning('暂无日志数据，请先在批量查看或日志查看页面加载日志数据')
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
          ElMessage.warning(`数据量较大(${(dataSize / 1024 / 1024).toFixed(1)}MB)，将进行数据采样以提高统计速度`)
          
          // 数据采样：保留关键数据点
          const sampleSize = Math.floor(maxSize / (dataSize / logEntries.value.length))
          const step = Math.floor(logEntries.value.length / sampleSize)
          analysisData = []
          
          for (let i = 0; i < logEntries.value.length; i += step) {
            analysisData.push(logEntries.value[i])
            if (analysisData.length >= sampleSize) break
          }
          
        }
        

        
        // 调用新的API端点，传递已排序的日志条目数据
        const response = await api.surgeryStatistics.analyzeSortedEntries({
          logEntries: analysisData,
          includePostgreSQLStructure: true
        })
        
        if (response.data.success) {
          surgeries.value = response.data.data || []
          
          
          
          if (surgeries.value.length > 0) {
            activeTab.value = surgeries.value[0].id.toString()
            surgeries.value.forEach(surgery => {
              armDetailsVisible[surgery.id] = false
              showAllAlarms[surgery.id] = false
              // 初始化PostgreSQL预览状态
              postgresqlPreviewVisible[surgery.id] = false
              postgresqlDataText[surgery.id] = ''
            })
          }
          
          ElMessage.success(`手术数据统计完成，共发现 ${surgeries.value.length} 场手术`)
        } else {
          ElMessage.error(response.data.message || '统计失败')
        }
      } catch (error) {
        ElMessage.error('统计日志数据失败: ' + (error.response?.data?.message || error.message))
      } finally {
        analyzing.value = false
      }
    }

    // 导出手术数据（结构化数据）
    const exportSurgeryData = async (surgeryId) => {
      try {
        const response = await api.surgeryStatistics.exportSingleSurgeryData(surgeryId)
        if (response.data.success) {
          ElMessage.success('手术结构化数据导出成功')
          // 可以在这里添加下载功能
          console.log('导出的结构化数据:', response.data.data)
        } else {
          ElMessage.error(response.data.message || '导出失败')
        }
      } catch (error) {
        ElMessage.error('导出手术数据失败: ' + (error.response?.data?.message || error.message))
      }
    }

    // 切换PostgreSQL数据预览显示
    const togglePostgreSQLPreview = (surgeryId) => {
      postgresqlPreviewVisible[surgeryId] = !postgresqlPreviewVisible[surgeryId]
      
      // 如果展开预览，则生成PostgreSQL数据
      if (postgresqlPreviewVisible[surgeryId] && !postgresqlDataText[surgeryId]) {
        generatePostgreSQLData(surgeryId)
      }
    }

    // 本地时间格式：YYYY-MM-DD HH:mm:ss（与批量查看一致）
    const serverOffsetMinutes = ref(null)
    const loadServerTimezone = async () => {
      try {
        const resp = await fetch('/api/timezone')
        const json = await resp.json()
        if (typeof json.offsetMinutes === 'number') serverOffsetMinutes.value = json.offsetMinutes
      } catch (_) {
        serverOffsetMinutes.value = null
      }
    }

    // 原始时间格式：YYYY-MM-DD HH:mm:ss（无时区转换）
    const formatUtcForDatabase = (value) => {
      if (!value) return null
      
      // 如果已经是原始时间格式字符串，直接返回
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(value)) {
        return value
      }
      
      // 如果是ISO格式（带Z），去掉Z按原始时间解析
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        const withoutZ = value.replace('Z', '').replace('T', ' ')
        // 提取年月日时分秒，按原始时间构造
        const [datePart, timePart] = withoutZ.split(' ')
        const [year, month, day] = datePart.split('-').map(Number)
        const [hour, minute, second] = timePart.split(':').map(Number)
        const d = new Date(year, month - 1, day, hour, minute, second || 0)
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      }
      
      // 解析为Date对象，然后按原始时间提取
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return null
      
      // 使用本地时间方法（不是UTC），按原始时间提取
      const pad = (n) => String(n).padStart(2, '0')
      const y = d.getFullYear()
      const m = pad(d.getMonth() + 1)
      const day = pad(d.getDate())
      const h = pad(d.getHours())
      const mi = pad(d.getMinutes())
      const s = pad(d.getSeconds())
      return `${y}-${m}-${day} ${h}:${mi}:${s}`
    }

    const formatLocalTimestamp = (value) => {
      if (!value) return null
      const d = new Date(value)
      if (!Number.isNaN(d.getTime()) && serverOffsetMinutes.value !== null) {
        const localOffset = -d.getTimezoneOffset()
        const delta = (serverOffsetMinutes.value - localOffset) * 60 * 1000
        d.setTime(d.getTime() + delta)
      }
      if (Number.isNaN(d.getTime())) return null
      const pad = (n) => String(n).padStart(2, '0')
      const y = d.getFullYear()
      const m = pad(d.getMonth() + 1)
      const day = pad(d.getDate())
      const h = pad(d.getHours())
      const mi = pad(d.getMinutes())
      const s = pad(d.getSeconds())
      return `${y}-${m}-${day} ${h}:${mi}:${s}`
    }

    // 生成PostgreSQL结构化数据
    const generatePostgreSQLData = (surgeryId) => {
      const surgery = surgeries.value.find(s => s.id === surgeryId)
      if (!surgery) {
        postgresqlDataText[surgeryId] = '未找到手术数据'
        return
      }

      try {
        // 设备编号统一使用字符串：优先后端返回的 device_id，再回退到 surgery_id 前缀
        const extractedPrefix = surgery.surgery_id ? surgery.surgery_id.split('-').slice(0, -1).join('-') : undefined
        const deviceIdStr = surgery.device_id
          || surgery.postgresql_row_preview?.device_id
          || extractedPrefix
        
        // 构建完整的surgeries表数据
        const structured = surgery.postgresql_structure || generateStructuredData(surgery)
        const surgeriesData = {
          surgery_id: surgery.surgery_id,
          source_log_ids: Array.isArray(surgery.source_log_ids) ? surgery.source_log_ids : (surgery.log_id ? [surgery.log_id] : []),
          device_id: deviceIdStr ? String(deviceIdStr) : null,
          log_entry_start_id: surgery.log_entry_start_id || null,
          log_entry_end_id: surgery.log_entry_end_id || null,
          start_time: formatUtcForDatabase(surgery.surgery_start_time),
          end_time: formatUtcForDatabase(surgery.surgery_end_time),
          has_fault: (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false),
          is_remote: surgery.is_remote_surgery || false,
          success: (structured?.surgery_stats?.success) ?? !(surgery.has_error || false),
          structured_data: structured,
          // 让数据库默认列负责 created_at/updated_at/last_analyzed_at
        }

        postgresqlDataText[surgeryId] = JSON.stringify(surgeriesData, null, 2)
      } catch (error) {
        console.error('生成PostgreSQL数据失败:', error)
        postgresqlDataText[surgeryId] = '生成PostgreSQL数据失败: ' + error.message
      }
    }

    // 生成结构化数据（如果后端没有提供）
    const generateStructuredData = (surgery) => {
      // 构建power_cycles - 使用正确的字段名
      const powerCycles = []
      
      // 使用正确的字段名：power_on_times 和 shutdown_times
      if (surgery.power_on_times && surgery.shutdown_times) {
        const onTimes = surgery.power_on_times
        const offTimes = surgery.shutdown_times
        
        for (let i = 0; i < Math.max(onTimes.length, offTimes.length); i++) {
          if (onTimes[i] || offTimes[i]) {
            powerCycles.push({
              on_time: onTimes[i] ? formatUtcForDatabase(onTimes[i]) : null,
              off_time: offTimes[i] ? formatUtcForDatabase(offTimes[i]) : null
            })
          }
        }
      }
      
      // 兼容旧版本字段名
      if (powerCycles.length === 0) {
        for (let i = 1; i <= 4; i++) {
          const powerOnTime = surgery[`power${i}_on_time`]
          const powerOffTime = surgery[`power${i}_off_time`]
          if (powerOnTime && powerOffTime) {
            powerCycles.push({
              on_time: formatUtcForDatabase(powerOnTime),
              off_time: formatUtcForDatabase(powerOffTime)
            })
          }
        }
      }

      // 构建arms数据 - 使用正确的字段名
      const arms = []
      for (let i = 1; i <= 4; i++) {
        const armUsage = surgery[`arm${i}_usage`] || []
        arms.push({
          arm_id: i,
          instrument_usage: armUsage.map(usage => ({
            tool_type: usage.instrumentName || usage.tool_type || '未知器械',
            udi: usage.udi || '',
            start_time: formatUtcForDatabase(usage.startTime || usage.start_time),
            end_time: formatUtcForDatabase(usage.endTime || usage.end_time),
            energy_activation: Array.isArray(usage.energy_activation)
              ? usage.energy_activation.map(t => (t ? formatUtcForDatabase(t) : t))
              : []
          }))
        })
      }

      // 构建surgery_stats
      const surgeryStats = {
        success: !surgery.has_error,
        network_latency_ms: surgery.network_stats ? surgery.network_stats.data.map(d => ({
          time: formatUtcForDatabase(d.timestamp),
          latency: d.latency
        })) : [],
        faults: surgery.alarm_details ? surgery.alarm_details.map(fault => ({
          timestamp: formatUtcForDatabase(fault.time),
          error_code: fault.code,
          param1: "",
          param2: "",
          param3: "",
          param4: "",
          explanation: fault.message,
          log_id: surgery.log_id || 1
        })) : [],
        arm_switch_count: 0,
        left_hand_clutch: surgery.hand_clutch_stats?.arm1 || 0,
        right_hand_clutch: surgery.hand_clutch_stats?.arm2 || 0,
        foot_clutch: surgery.foot_pedal_stats?.clutch || 0,
        endoscope_pedal: surgery.foot_pedal_stats?.camera || 0
      }

      return {
        power_cycles: powerCycles,
        arms: arms,
        surgery_stats: surgeryStats
      }
    }

    // 复制PostgreSQL数据到剪贴板
    const copyPostgreSQLData = async (surgeryId) => {
      copyingData[surgeryId] = true
      try {
        const text = postgresqlDataText[surgeryId]
        if (text) {
          await navigator.clipboard.writeText(text)
          ElMessage.success('PostgreSQL数据已复制到剪贴板')
        } else {
          ElMessage.warning('没有可复制的数据')
        }
      } catch (error) {
        console.error('复制失败:', error)
        ElMessage.error('复制失败: ' + error.message)
      } finally {
        copyingData[surgeryId] = false
      }
    }

    // 刷新PostgreSQL数据
    const refreshPostgreSQLData = async (surgeryId) => {
      refreshingData[surgeryId] = true
      try {
        generatePostgreSQLData(surgeryId)
        ElMessage.success('PostgreSQL数据已刷新')
      } catch (error) {
        console.error('刷新失败:', error)
        ElMessage.error('刷新失败: ' + error.message)
      } finally {
        refreshingData[surgeryId] = false
      }
    }

    // 切换工具臂详情显示
    const toggleArmDetails = (surgeryId, armIndex) => {
      const key = `${surgeryId}_${armIndex}`
      armDetailsVisible[key] = !armDetailsVisible[key]
    }

    // 切换报警记录显示
    const toggleAlarms = (surgeryId) => {
      showAllAlarms[surgeryId] = !showAllAlarms[surgeryId]
    }

    // 滚动到安全报警记录卡片
    const scrollToAlarmCard = (surgeryId) => {
      // 确保当前手术标签页是激活的
      if (activeTab.value !== surgeryId.toString()) {
        activeTab.value = surgeryId.toString()
      }
      
      // 等待DOM更新后滚动到报警卡片
      nextTick(() => {
        const alarmCard = document.querySelector(`[data-surgery-id="${surgeryId}"] .alarm-card`)
        if (alarmCard) {
          alarmCard.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          })
          
          // 添加高亮效果
          alarmCard.style.boxShadow = '0 0 0 2px #F56C6C, 0 4px 12px rgba(245, 108, 108, 0.3)'
          alarmCard.style.transition = 'box-shadow 0.3s ease'
          
          // 3秒后移除高亮效果
          setTimeout(() => {
            alarmCard.style.boxShadow = ''
          }, 3000)
        }
      })
    }

    // 滚动到网络延时统计卡片
    const scrollToNetworkCard = (surgeryId) => {
      // 确保当前手术标签页是激活的
      if (activeTab.value !== surgeryId.toString()) {
        activeTab.value = surgeryId.toString()
      }
      
      // 等待DOM更新后滚动到网络卡片
      nextTick(() => {
        const networkCard = document.querySelector(`[data-surgery-id="${surgeryId}"] .network-card`)
        if (networkCard) {
          networkCard.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          })
          
          // 添加高亮效果
          networkCard.style.boxShadow = '0 0 0 2px #409EFF, 0 4px 12px rgba(64, 158, 255, 0.3)'
          networkCard.style.transition = 'box-shadow 0.3s ease'
          
          // 3秒后移除高亮效果
          setTimeout(() => {
            networkCard.style.boxShadow = ''
          }, 3000)
        }
      })
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

      // 手术器械表数据
      const getInstrumentRows = (surgery) => {
        if (!surgery) return []
        const grouped = new Map()
        const allArms = getArmUsages(surgery)
        allArms.forEach(armUsage => {
          (armUsage || []).forEach(u => {
            if (!u) return
            if (!u.startTime || !u.endTime) return
            const udi = u.udi || '未知'
            const key = `${udi}__${u.instrumentName || '未知器械'}`
            if (!grouped.has(key)) {
              grouped.set(key, {
                instrumentName: u.instrumentName || '未知器械',
                udi: udi,
                segments: []
              })
            }
            grouped.get(key).segments.push({ startTime: u.startTime, endTime: u.endTime })
          })
        })
        // 合并相邻/重叠的段，并计算整体起止
        const rows = Array.from(grouped.values()).map(item => {
          // 排序
          item.segments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
          // 合并重叠或相邻
          const merged = []
          for (const seg of item.segments) {
            if (merged.length === 0) { merged.push({ ...seg }); continue }
            const last = merged[merged.length - 1]
            const lastEnd = new Date(last.endTime).getTime()
            const curStart = new Date(seg.startTime).getTime()
            const curEnd = new Date(seg.endTime).getTime()
            if (curStart <= lastEnd) {
              if (curEnd > lastEnd) last.endTime = seg.endTime
            } else {
              merged.push({ ...seg })
            }
          }
          const startTime = merged.length ? merged[0].startTime : null
          const endTime = merged.length ? merged[merged.length - 1].endTime : null
          return { ...item, segments: merged, startTime, endTime }
        })
        // 按起始时间排序
        rows.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
        return rows
      }

    // 获取工具臂总时间
    const getArmTotalTime = (armUsage) => {
      if (!armUsage || armUsage.length === 0) return '0分钟'
      
      // 计算所有完整使用时间段的总时长
      const totalMinutes = armUsage
        .filter(usage => usage.startTime && usage.endTime)
        .reduce((total, usage) => {
          const duration = Math.floor((new Date(usage.endTime) - new Date(usage.startTime)) / 1000 / 60)
          return total + duration
        }, 0)
      
      return `${totalMinutes}分钟`
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
      
      let details = []
      
      if (typeof surgery.alarm_details === 'string') {
        try {
          details = JSON.parse(surgery.alarm_details)
        } catch (error) {
          console.error('解析alarm_details字符串失败:', error)
          return []
        }
      } else {
        details = surgery.alarm_details || []
      }
      
      return details
    }

    // 获取去重后的故障统计信息
    const getDeduplicatedAlarmStats = (surgery) => {
      const details = getAlarmDetails(surgery)
      if (!details || details.length === 0) {
        return { uniqueCount: 0, totalCount: 0, activeCount: 0 }
      }
      
      // 统计唯一故障码数量
      const uniqueCodes = new Set(details.map(d => d.code))
      const uniqueCount = uniqueCodes.size
      
      // 统计总故障数量
      const totalCount = details.length
      
      // 统计未处理的故障数量
      const activeCount = details.filter(d => d.status === '未处理' && d.isActive === true).length
      
      return { uniqueCount, totalCount, activeCount }
    }


    // 获取统一的时间轴范围（重新设计：严格使用手术开始到手术结束时间）
    const getTimelineRange = (surgery) => {
      if (!surgery) return { start: null, end: null }
      
      // 重新设计：严格使用手术开始和结束时间，确保与状态机图表一致
      const start = surgery.surgery_start_time
      const end = surgery.surgery_end_time
      
      // 确保开始时间早于结束时间
      if (start && end) {
        const startTime = new Date(start).getTime()
        const endTime = new Date(end).getTime()
        
        if (startTime >= endTime) {
          console.warn('时间轴范围异常：开始时间晚于或等于结束时间', {
            surgery_id: surgery.surgery_id,
            start: start,
            end: end,
            startTime: startTime,
            endTime: endTime
          })
          return { start: null, end: null }
        }
      }
      
      console.log('时间轴范围 (重新设计):', surgery.surgery_id, {
        start: start,
        end: end,
        duration: start && end ? (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60) : 'N/A'
      })
      
      return { start, end }
    }

    // 获取"手术时间线"事件范围：起点为第一个事件时间，终点为最后一个事件时间
    const getEventTimelineRange = (surgery) => {
      try {
        const events = getSortedTimelineEvents(surgery)
        if (!events || events.length === 0) {
          // 回退到进度条时间轴范围（开机-关机）
          return getProgressTimelineRange(surgery)
        }
        const start = events[0].time
        const end = events[events.length - 1].time
        return { start, end }
      } catch (e) {
        return getProgressTimelineRange(surgery)
      }
    }

    // 获取进度条时间轴范围（使用开机时间和关机时间）
    const getProgressTimelineRange = (surgery) => {
      if (!surgery) return { start: null, end: null }
      
      // 获取开机时间
      const powerOnTime = getPowerOnTime(surgery)
      
      // 获取关机时间，如果没有则使用手术结束时间
      const powerOffTime = getPowerOffTime(surgery)
      const endTime = powerOffTime || surgery.surgery_end_time
      
      // 确定时间轴起点：优先使用开机时间，如果没有则使用手术开始时间
      let start = powerOnTime
      if (!start && surgery.surgery_start_time) {
        start = surgery.surgery_start_time
      }
      
      // 确定时间轴终点：优先使用关机时间，如果没有则使用手术结束时间
      let end = endTime
      if (!end && surgery.surgery_end_time) {
        end = surgery.surgery_end_time
      }
      
      // 确保开始时间早于结束时间
      if (start && end) {
        const startTime = new Date(start).getTime()
        const endTime = new Date(end).getTime()
        
        if (startTime >= endTime) {
          console.warn('进度条时间轴范围异常：开始时间晚于或等于结束时间', {
            surgery_id: surgery.surgery_id,
            start: start,
            end: end,
            startTime: startTime,
            endTime: endTime
          })
          return { start: null, end: null }
        }
      }
      
      console.log('进度条时间轴范围:', surgery.surgery_id, {
        start: start,
        end: end,
        powerOnTime: powerOnTime,
        powerOffTime: powerOffTime,
        surgeryEndTime: surgery.surgery_end_time,
        duration: start && end ? (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60) : 'N/A'
      })
      
      return { start, end }
    }

    // 计算时间在时间轴上的位置百分比（改进版本，支持跨天）
    const getTimePosition = (time, startTime, endTime) => {
      if (!time || !startTime || !endTime) return 0
      
      try {
        // 确保时间格式正确
        const start = new Date(startTime).getTime()
        const end = new Date(endTime).getTime()
        const current = new Date(time).getTime()
        
        // 检查时间有效性
        if (isNaN(start) || isNaN(end) || isNaN(current)) {
          console.warn('时间计算异常：无效的时间值', { time, startTime, endTime })
          return 0
        }
        
        // 检查时间顺序
        if (start >= end) {
          console.warn('时间轴范围异常：开始时间晚于或等于结束时间', { startTime, endTime })
          return 0
        }
        
        // 计算位置百分比
        const position = ((current - start) / (end - start)) * 100
        
        // 确保位置在有效范围内
        return Math.max(0, Math.min(100, position))
      } catch (error) {
        console.error('时间位置计算失败:', error, { time, startTime, endTime })
        return 0
      }
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
      let current = start.getTime() + interval // 从第一个间隔开始，避免与开始时间重叠
      while (current < end.getTime()) { // 使用 < 而不是 <=，避免与结束时间重叠
        const position = getTimePosition(current, startTime, endTime)
        ticks.push({
          time: new Date(current),
          position: position
        })
        current += interval
      }
      
      return ticks
    }

    // 合并重叠的时间段
    const mergeOverlappingTimeRanges = (usages) => {
      if (!usages || usages.length === 0) return []
      
      // 将使用记录转换为时间范围对象
      const timeRanges = usages.map(usage => ({
        startTime: new Date(usage.startTime).getTime(),
        endTime: new Date(usage.endTime).getTime()
      }))
      
      // 按开始时间排序
      timeRanges.sort((a, b) => a.startTime - b.startTime)
      
      const merged = []
      let current = timeRanges[0]
      
      for (let i = 1; i < timeRanges.length; i++) {
        const next = timeRanges[i]
        
        // 如果当前时间段与下一个时间段重叠或相邻，则合并
        if (current.endTime >= next.startTime) {
          current.endTime = Math.max(current.endTime, next.endTime)
        } else {
          // 不重叠，添加当前时间段到结果中
          merged.push(current)
          current = next
        }
      }
      
      // 添加最后一个时间段
      if (current) {
        merged.push(current)
      }
      
      return merged
    }

    // 获取工具臂时间线样式（时间对齐）
    const getArmTimelineStyle = (armUsage, surgery) => {
      if (!armUsage || armUsage.length === 0 || !surgery.surgery_start_time || !surgery.surgery_end_time) {
        return { left: '0%', width: '0%' }
      }
      
      // 找到所有完整的使用时间段（有开始和结束时间）
      const completeUsages = armUsage.filter(usage => usage.startTime && usage.endTime)
      
      if (completeUsages.length === 0) return { left: '0%', width: '0%' }
      
      // 如果有多个器械使用时间段，需要合并重叠的时间段
      const mergedTimeRanges = mergeOverlappingTimeRanges(completeUsages)
      
      if (mergedTimeRanges.length === 0) return { left: '0%', width: '0%' }
      
      // 计算所有合并后时间段的总长度
      let totalWidth = 0
      const segments = []
      
      // 使用"手术时间线"事件范围（第一个事件 ~ 最后一个事件）
      const timelineRange = getEventTimelineRange(surgery)
      if (!timelineRange.start || !timelineRange.end) return { left: '0%', width: '0%' }
      
      mergedTimeRanges.forEach(range => {
        const startPosition = getTimePosition(range.startTime, timelineRange.start, timelineRange.end)
        const endPosition = getTimePosition(range.endTime, timelineRange.start, timelineRange.end)
        const width = Math.max(0, endPosition - startPosition)
        
        segments.push({
          left: `${startPosition}%`,
          width: `${width}%`
        })
        
        totalWidth += width
      })
      
      // 如果有多个时间段，返回第一个（主要时间段）
      // 如果需要显示多个时间段，可以在这里扩展逻辑
      return segments.length > 0 ? segments[0] : { left: '0%', width: '0%' }
    }

    // 获取工具臂时间线所有段（用于显示多个时间段）
    const getArmTimelineSegments = (armUsage, surgery) => {
      if (!armUsage || armUsage.length === 0 || !surgery.surgery_start_time || !surgery.surgery_end_time) {
        return []
      }
      
      // 找到所有完整的使用时间段（有开始和结束时间）
      const completeUsages = armUsage.filter(usage => usage.startTime && usage.endTime)
      
      if (completeUsages.length === 0) return []
      
      // 合并重叠的时间段
      const mergedTimeRanges = mergeOverlappingTimeRanges(completeUsages)
      
      if (mergedTimeRanges.length === 0) return []
      
      // 计算所有合并后时间段的样式
      const segments = []
      
      // 使用"手术时间线"事件范围（第一个事件 ~ 最后一个事件）
      const timelineRange = getEventTimelineRange(surgery)
      if (!timelineRange.start || !timelineRange.end) return []
      
      mergedTimeRanges.forEach((range, index) => {
        const startPosition = getTimePosition(range.startTime, timelineRange.start, timelineRange.end)
        const endPosition = getTimePosition(range.endTime, timelineRange.start, timelineRange.end)
        const width = Math.max(0, endPosition - startPosition)
        
        if (width > 0) {
          segments.push({
            left: `${startPosition}%`,
            width: `${width}%`
          })
        }
      })
      
      return segments
    }

    // 获取手术时间段在总时间轴上的样式
    const getSurgeryTimelineStyle = (surgery) => {
      if (!surgery || !surgery.surgery_start_time || !surgery.surgery_end_time) {
        return { left: '0%', width: '0%' }
      }
      
      // 使用"手术时间线"事件范围（第一个事件 ~ 最后一个事件）
      const timelineRange = getEventTimelineRange(surgery)
      if (!timelineRange.start || !timelineRange.end) {
        return { left: '0%', width: '0%' }
      }
      
      // 手术进度条：显示手术开始到手术结束的时间段，但基于开机时间到关机时间的时间轴
      const startPosition = getTimePosition(surgery.surgery_start_time, timelineRange.start, timelineRange.end)
      const endPosition = getTimePosition(surgery.surgery_end_time, timelineRange.start, timelineRange.end)
      const width = Math.max(0, endPosition - startPosition)
      
      console.log('手术进度条计算:', surgery.surgery_id, {
        surgeryStartTime: surgery.surgery_start_time,
        surgeryEndTime: surgery.surgery_end_time,
        timelineStart: timelineRange.start,
        timelineEnd: timelineRange.end,
        startPosition: startPosition.toFixed(2) + '%',
        endPosition: endPosition.toFixed(2) + '%',
        width: width.toFixed(2) + '%'
      })
      
      return { 
        left: `${startPosition}%`, 
        width: `${width}%` 
      }
    }

    // 获取使用时间线样式（时间对齐）
    const getUsageTimelineStyle = (usage, surgery) => {
      if (!usage || !surgery.surgery_start_time || !surgery.surgery_end_time) {
        return { left: '0%', width: '0%' }
      }
      
      // 检查是否有完整的时间段信息
      if (!usage.startTime || !usage.endTime) {
        return { left: '0%', width: '0%' }
      }
      
      // 使用"手术时间线"事件范围（第一个事件 ~ 最后一个事件），确保与时间线完全对齐
      const timelineRange = getEventTimelineRange(surgery)
      if (!timelineRange.start || !timelineRange.end) {
        return { left: '0%', width: '0%' }
      }
      
      const startTime = new Date(usage.startTime).getTime()
      const endTime = new Date(usage.endTime).getTime()
      
      // 使用与arm-timeline-bar完全相同的时间计算逻辑
      const startPosition = getTimePosition(startTime, timelineRange.start, timelineRange.end)
      const endPosition = getTimePosition(endTime, timelineRange.start, timelineRange.end)
      
      // 确保进度条宽度不为负数，并且位置在有效范围内
      const width = Math.max(0, endPosition - startPosition)
      const left = Math.max(0, Math.min(100 - width, startPosition))
      
      return { 
        left: `${left}%`, 
        width: `${width}%` 
      }
    }

    // 获取能量时间
    const getEnergyTime = (armUsage) => {
      if (!armUsage || armUsage.length === 0) return '0分0秒'
      
      // 计算所有完整使用时间段的总时长（不再过滤术前安装的器械）
      const totalSeconds = armUsage
        .filter(usage => usage.startTime && usage.endTime)
        .reduce((total, usage) => {
          const duration = Math.floor((new Date(usage.endTime) - new Date(usage.startTime)) / 1000)
          return total + duration
        }, 0)
      
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${minutes}分${seconds}秒`
    }



    // 获取开机时间：支持多个开机时间
    const getPowerOnTime = (surgery) => {
      if (!surgery) return null
      
      // 如果有开机时间数组，返回第一个（最早的开机时间）
      if (surgery.power_on_times && surgery.power_on_times.length > 0) {
        return surgery.power_on_times[0]
      }
      
      // 兼容旧版本：如果有单个开机时间，直接使用
      if (surgery.power_on_time) {
        return surgery.power_on_time
      }
      
      // 如果没有开机时间，使用手术开始时间
      return surgery.surgery_start_time
    }

    // 获取关机时间：支持多个关机时间
    const getPowerOffTime = (surgery) => {
      if (!surgery) return null
      
      // 如果有关机时间数组，返回最后一个（最晚的关机时间）
      if (surgery.shutdown_times && surgery.shutdown_times.length > 0) {
        return surgery.shutdown_times[surgery.shutdown_times.length - 1]
      }
      
      // 兼容旧版本：如果有单个关机时间，直接使用
      if (surgery.power_off_time) {
        return surgery.power_off_time
      }
      
      // 如果没有关机时间，返回null（让调用方决定使用什么作为终点）
      return null
    }

    // 获取所有开机时间
    const getAllPowerOnTimes = (surgery) => {
      if (!surgery) return []
      
      // 如果有开机时间数组，返回所有
      if (surgery.power_on_times && surgery.power_on_times.length > 0) {
        return surgery.power_on_times
      }
      
      // 兼容旧版本：如果有单个开机时间，返回数组
      if (surgery.power_on_time) {
        return [surgery.power_on_time]
      }
      
      return []
    }

    // 获取所有关机时间
    const getAllPowerOffTimes = (surgery) => {
      if (!surgery) return []
      
      // 如果有关机时间数组，返回所有
      if (surgery.shutdown_times && surgery.shutdown_times.length > 0) {
        return surgery.shutdown_times
      }
      
      // 兼容旧版本：如果有单个关机时间，返回数组
      if (surgery.power_off_time) {
        return [surgery.power_off_time]
      }
      
      return []
    }

    // 获取按时间排序的所有事件
    const getSortedTimelineEvents = (surgery) => {
      if (!surgery) return []
      
      const events = []
      
      // 添加开机事件 - 支持多个开机时间
      const powerOnTimes = getAllPowerOnTimes(surgery)
      
      // 调试信息：检查连台手术数据
      if (surgery.is_consecutive_surgery) {
        console.log('连台手术调试信息:', {
          surgery_id: surgery.surgery_id,
          is_consecutive_surgery: surgery.is_consecutive_surgery,
          previous_surgery_end_time: surgery.previous_surgery_end_time,
          power_on_times: surgery.power_on_times,
          powerOnTimes: powerOnTimes
        })
      }
      
      powerOnTimes.forEach((time, index) => {
        // 检查是否为连台手术，如果是则显示"上一场手术结束时间"
        let label = '开机'
        let displayTime = time
        
        if (surgery.is_consecutive_surgery && index === 0 && surgery.previous_surgery_end_time) {
          // 连台手术：使用上一场手术结束时间而不是开机时间
          label = '上一场手术结束时间'
          displayTime = surgery.previous_surgery_end_time
        } else if (powerOnTimes.length > 1) {
          label = `开机 ${index + 1}`
        }
        
        events.push({
          time: new Date(displayTime),
          type: 'powerOn',
          label: label,
          color: 'green',
          icon: 'PowerOff'
        })
      })
      
      // 添加手术开始事件
      if (surgery.surgery_start_time) {
        events.push({
          time: new Date(surgery.surgery_start_time),
          type: 'surgeryStart',
          label: '手术开始',
          color: 'blue',
          icon: 'VideoPlay'
        })
      }
      
      // 添加手术结束事件
      if (surgery.surgery_end_time) {
        events.push({
          time: new Date(surgery.surgery_end_time),
          type: 'surgeryEnd',
          label: '手术结束',
          color: 'orange',
          icon: 'VideoPause'
        })
      }
      
      // 添加关机事件 - 支持多个关机时间
      const powerOffTimes = getAllPowerOffTimes(surgery)
      powerOffTimes.forEach((time, index) => {
        events.push({
          time: new Date(time),
          type: 'powerOff',
          label: powerOffTimes.length > 1 ? `关机 ${index + 1}` : '关机',
          color: 'red',
          icon: 'PowerOff'
        })
      })
      
      // 按时间排序
      return events.sort((a, b) => a.time.getTime() - b.time.getTime())
    }

    // 获取手术状态变化数据
    const getStateChanges = (surgery) => {
      if (!surgery) return []
      
      // 优先使用后端提供的状态机变化数据
      let stateMachineChanges = []
      
      if (surgery.state_machine_changes) {
        if (typeof surgery.state_machine_changes === 'string') {
          try {
            stateMachineChanges = JSON.parse(surgery.state_machine_changes)
          } catch (error) {
            console.error('解析state_machine_changes字符串失败:', error)
            stateMachineChanges = []
          }
        } else {
          stateMachineChanges = surgery.state_machine_changes || []
        }
      }
      
      // 调试信息
      console.log('手术状态机变化数据:', surgery.surgery_id, stateMachineChanges)
      
      // 如果没有状态机变化数据，返回空数组
      if (stateMachineChanges.length === 0) {
        console.log('没有状态机变化数据')
        return []
      }
      
      // 将状态机变化数据转换为柱状图数据
      const stateChanges = []
      
      for (let i = 0; i < stateMachineChanges.length; i++) {
        const currentChange = stateMachineChanges[i]
        const nextChange = stateMachineChanges[i + 1]
        
        const currentState = parseInt(currentChange.state)
        const startTime = new Date(currentChange.time)
        const endTime = nextChange ? new Date(nextChange.time) : (surgery.surgery_end_time ? new Date(surgery.surgery_end_time) : new Date())
        const duration = endTime.getTime() - startTime.getTime()
        
        // 调试信息
        console.log(`状态变化 ${i}: currentState=${currentState}, startTime=${startTime}, endTime=${endTime}, duration=${duration}ms`)
        
        // 根据currentState分类 - 新的阶段定义
        let stateCategory = 'none'
        
        // 关机到开机阶段 (currentState <= 0) 不显示柱状图
        if (currentState <= 0) {
          stateCategory = 'none'
        } 
        // currentState < 30 都用浅绿色柱状体表示
        else if (currentState > 0 && currentState < 30) {
          stateCategory = 'surgery' // 浅绿色 - 正常阶段
        } 
        // currentState = 30 且未变化至 currentState >= 10 时都用红色柱状体表示
        else if (currentState === 30) {
          // 检查下一个状态是否 >= 10，如果不是则标记为错误
          const nextState = nextChange ? parseInt(nextChange.state) : null
          if (nextState === null || nextState < 10) {
            stateCategory = 'error' // 红色 - 故障阶段
          } else {
            stateCategory = 'surgery' // 浅绿色 - 正常阶段
          }
        }
        // currentState > 30 的其他状态不显示柱状图
        else {
          stateCategory = 'none'
        }
        
        console.log(`状态分类: currentState=${currentState}, nextState=${nextChange ? nextChange.state : 'null'} -> stateCategory=${stateCategory}`)
        
        if (stateCategory !== 'none') {
          stateChanges.push({
            state: stateCategory,
            startTime: startTime,
            endTime: endTime,
            duration: duration,
            originalState: currentState,
            stateName: currentChange.stateName || `状态${currentState}`
          })
        }
      }
      
      console.log('生成的柱状图数据:', stateChanges)
      return stateChanges
    }

    // 获取状态名称
    const getStateName = (state) => {
      const stateMap = {
        'surgery': '正常阶段',
        'error': '故障阶段',
        'idle': '空闲',
        'active': '激活',
        'standby': '待机',
        'offline': '离线'
      }
      return stateMap[state] || state
    }

    // 计算状态柱状图高度
    const getStateBarHeight = (state) => {
      // 根据状态类型设置不同高度
      const heightMap = {
        'surgery': 60,     // 正常阶段 60% 高度 (浅绿色)
        'error': 100       // 故障阶段 100% 高度 (红色)
      }
      const height = heightMap[state] || 60;
      console.log(`柱状图高度: state=${state}, height=${height}px`);
      return height;
    }

    // 计算状态柱状图位置
    const getStateBarPosition = (startTime, surgery) => {
      if (!startTime || !surgery) return 0
      
      const timelineRange = getProgressTimelineRange(surgery)
      if (!timelineRange.start || !timelineRange.end) return 0
      
      const position = getTimePosition(startTime, timelineRange.start, timelineRange.end)
      console.log(`柱状图位置计算: startTime=${startTime}, timelineStart=${timelineRange.start}, timelineEnd=${timelineRange.end}, position=${position}%`)
      
      // 确保位置在有效范围内
      const clampedPosition = Math.max(0, Math.min(95, position)) // 留出5%的边距
      return clampedPosition
    }



    // 按UID码分组器械使用
    const getGroupedUsagesByUdi = (armUsage) => {
      const grouped = {}
      armUsage.forEach((usage, index) => {
        // 不过滤术前安装的器械，详情中需要完整显示
        
        // 使用UDI码作为分组键，如果没有UDI则使用器械名称和索引
        const udi = usage.udi || `${usage.instrumentName}_${index}`
        if (!grouped[udi]) {
          grouped[udi] = {
            instrumentName: usage.instrumentName,
            usages: []
          }
        }
        grouped[udi].usages.push(usage)
      })
      return grouped
    }



    // 获取分组器械的总使用时长
    const getGroupedUsageDuration = (groupedUsage) => {
      if (!groupedUsage || groupedUsage.usages.length === 0) return '0分钟'
      
      const totalDuration = groupedUsage.usages
        .filter(usage => usage.startTime && usage.endTime)
        .reduce((total, usage) => {
          const duration = Math.floor((new Date(usage.endTime) - new Date(usage.startTime)) / 1000 / 60)
          return total + duration
        }, 0)
      
      return `${totalDuration}分钟`
    }

         // 根据进度条宽度获取合适的显示文本
     const getSegmentText = (usage, surgery) => {
       try {
         // 计算进度条宽度百分比
         const style = getUsageTimelineStyle(usage, surgery);
         const width = style.width;
         const widthPercent = parseFloat(width);
         
         // 获取器械名称
         const instrumentName = usage.instrumentName || '器械';
         
         // 计算所需的最小宽度（每个字符约1.5%宽度，加上一些边距）
         const minWidthPerChar = 1.5;
         const padding = 2; // 左右边距
         const requiredWidth = Math.min(instrumentName.length * minWidthPerChar + padding, 20); // 最大20%
         
         // 只有当宽度足够显示器械名称时才显示文本
         if (widthPercent >= requiredWidth) {
           // 如果宽度足够显示完整名称，直接显示
           if (widthPercent >= instrumentName.length * minWidthPerChar + padding) {
             return instrumentName;
           } else {
             // 否则截断显示
             const maxChars = Math.floor((widthPercent - padding) / minWidthPerChar);
             return instrumentName.substring(0, maxChars) + '...';
           }
         } else {
           // 宽度不足，不显示任何文本
           return '';
         }
       } catch (error) {
         console.error('计算进度条文本失败:', error);
         return '';
       }
     };

    // 获取时间段对应的器械名称
    const getSegmentInstrumentName = (segment, armUsage, surgery) => {
      if (!segment || !armUsage || !surgery) return '未知器械'
      
      // 获取进度条时间轴范围
      const timelineRange = getProgressTimelineRange(surgery)
      if (!timelineRange.start || !timelineRange.end) return '未知器械'
      
      // 计算时间段的开始和结束时间
      const startPercent = parseFloat(segment.left)
      const endPercent = startPercent + parseFloat(segment.width)
      
      const startTime = new Date(timelineRange.start).getTime() + (startPercent / 100) * (new Date(timelineRange.end).getTime() - new Date(timelineRange.start).getTime())
      const endTime = new Date(timelineRange.start).getTime() + (endPercent / 100) * (new Date(timelineRange.end).getTime() - new Date(timelineRange.start).getTime())
      
      // 查找在这个时间段内使用的器械
      const instrumentsInSegment = armUsage.filter(usage => {
        if (!usage.startTime || !usage.endTime) return false
        
        const usageStart = new Date(usage.startTime).getTime()
        const usageEnd = new Date(usage.endTime).getTime()
        
        // 检查是否有重叠
        return usageStart < endTime && usageEnd > startTime
      })
      
      if (instrumentsInSegment.length === 0) return '无器械使用'
      
      // 返回第一个找到的器械名称
      return instrumentsInSegment[0].instrumentName || '未知器械'
    }

    


    // 标签页点击处理 - 使用防抖和安全的 nextTick
    const handleTabClick = debounce((tab) => {
      safeNextTick(() => {
        activeTab.value = tab.name
      })
    }, 50)

    // 标签页切换前的处理 - 使用安全的 nextTick
    const handleBeforeTabLeave = (newTabName, oldTabName) => {
      return safeNextTick().then(() => true)
    }

    // 状态机图表相关方法
    const resetChartView = () => {
      // 清理所有图表实例
      stateMachineCharts.forEach((chart, surgeryId) => {
        console.log('销毁图表实例:', surgeryId)
        try {
          chart.dispose && chart.dispose()
        } catch (e) {
          console.warn('图表实例释放失败', surgeryId, e)
        }
      })
      stateMachineCharts.clear()
      // 清理响应式对象的所有属性
      Object.keys(surgeryChartStates).forEach(key => {
        delete surgeryChartStates[key]
      })
      surgeryScrollbarStates.clear()
      chartCurrentTime.value = null
    }

    // 获取状态机图表数据（全时段，ECharts）
    const getStateMachineChartData = (surgery) => {
      if (!surgery) return null
      let changes = []
      if (surgery.state_machine_changes) {
        if (typeof surgery.state_machine_changes === 'string') {
          try {
            changes = JSON.parse(surgery.state_machine_changes)
          } catch (e) {
            console.error('解析state_machine_changes失败', e)
            return null
          }
        } else {
          changes = surgery.state_machine_changes || []
        }
      }

      // 时间范围：使用时间线事件的最早与最晚时间；若无事件，回退到状态机数据
      const events = getSortedTimelineEvents(surgery)
      let xMin = null
      let xMax = null
      if (events.length > 0) {
        xMin = new Date(events[0].time).getTime()
        xMax = new Date(events[events.length - 1].time).getTime()
      }

      if (changes.length === 0) {
        if (!xMin || !xMax) return null
        return { points: [], rawData: [], xMin, xMax }
      }

      // 排序并构建阶梯数据点
      changes.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      if (!xMin || !xMax) {
        xMin = new Date(changes[0].time).getTime()
        xMax = new Date(changes[changes.length - 1].time).getTime()
      }

      const positionMap = getStateToYPositionMap()

      // 仅使用与时间线相同范围内的状态机数据，并在边界补点
      const changesWithin = []
      let lastBefore = null
      for (const ch of changes) {
        const t = new Date(ch.time).getTime()
        if (t <= xMin) {
          lastBefore = ch
        }
        if (t > xMin && t <= xMax) {
          changesWithin.push(ch)
        }
      }

      const points = []
      // 起点：xMin 使用边界前最后状态（若无，则用第一个变化的状态）
      let startState = lastBefore ? lastBefore.state : (changes.length > 0 ? changes[0].state : '0')
      points.push([xMin, positionMap[parseInt(startState)] ?? parseInt(startState), startState])

      // 区间内变化
      for (const ch of changesWithin) {
        const t = new Date(ch.time).getTime()
        const y = positionMap[parseInt(ch.state)] ?? parseInt(ch.state)
        points.push([t, y, ch.state])
      }

      // 终点：xMax 使用区间内最后状态（或起点状态）
      const lastState = changesWithin.length > 0 ? changesWithin[changesWithin.length - 1].state : startState
      points.push([xMax, positionMap[parseInt(lastState)] ?? parseInt(lastState), lastState])

      return { points, rawData: changesWithin, xMin, xMax }
    }

    // 获取状态机图表配置
    const getStateMachineChartOptions = (surgery) => {
      const surgeryStartTime = surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : null
      if (!surgeryStartTime) return {}
      
      // 获取当前手术的图表状态
      let surgeryState = surgeryChartStates[surgery.id]
      if (!surgeryState) {
        surgeryState = {
          currentTime: surgeryStartTime,
          viewRange: chartViewRange.value
        }
        surgeryChartStates[surgery.id] = surgeryState
      }
      
      const startTime = new Date(surgeryState.currentTime.getTime() - (surgeryState.viewRange * 30 * 1000))
      const endTime = new Date(surgeryState.currentTime.getTime() + (surgeryState.viewRange * 30 * 1000))
      
      return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                const dataIndex = context[0].dataIndex
                const rawData = context[0].chart.data.rawData
                if (rawData && rawData[dataIndex]) {
                  const time = new Date(rawData[dataIndex].time)
                  // 检查是否跨天，如果是则显示日期
                  const isCrossDay = startTime.getDate() !== endTime.getDate() || 
                                   startTime.getMonth() !== endTime.getMonth() || 
                                   startTime.getFullYear() !== endTime.getFullYear()
                  
                  if (isCrossDay) {
                    return formatTime(time)
                  } else {
                    return formatTimeShort(time)
                  }
                }
                return context[0].label
              },
              label: function(context) {
                const dataIndex = context.dataIndex
                const rawData = context.chart.data.rawData
                if (rawData && rawData[dataIndex]) {
                  const originalState = parseInt(rawData[dataIndex].state)
                  const stateName = getStateMachineStateName(originalState.toString())
                  return `状态: ${originalState} (${stateName})`
                }
                return `状态: ${context.parsed.y}`
              }
            }
          }
        },
        scales: {
                     x: {
             title: {
               display: true,
               text: '时间'
             },
             ticks: {
               maxTicksLimit: 10,
               callback: function(value, index, ticks) {
                 const rawData = this.chart.data.rawData
                 if (rawData && rawData[index]) {
                   const time = new Date(rawData[index].time)
                   // 检查是否跨天
                   const isCrossDay = startTime.getDate() !== endTime.getDate() || 
                                    startTime.getMonth() !== endTime.getMonth() || 
                                    startTime.getFullYear() !== endTime.getFullYear()
                   
                   if (isCrossDay) {
                     return formatTime(time)
                   } else {
                     return formatTimeShort(time)
                   }
                 }
                 return value
               }
             },
             // 移除afterBuildTicks函数，使用更简单的回调方式
             // afterBuildTicks在Chart.js 4.x中可能有问题，改用callback方式
           },
          y: {
            beginAtZero: true,
            min: 0,
            max: 30, // 调整为映射后的最大值
            title: {
              display: true,
              text: '状态机状态'
            },
            // 简化Y轴配置，避免afterBuildTicks问题
            ticks: {
              stepSize: 1,
              maxTicksLimit: 15
            }
          }
        },
        animation: {
          duration: 300
        }
      }
    }

    // 更新状态机图表 - 确保所有组件同步
    const updateStateMachineChart = (surgery) => {
      if (!surgery) return
      const container = document.getElementById(`stateMachineChart_${surgery.id}`)
      if (!container) {
        setTimeout(() => updateStateMachineChart(surgery), 50)
        return
      }

      const data = getStateMachineChartData(surgery)
      // 清理旧实例
      const existing = stateMachineCharts.get(surgery.id)
      if (existing) {
        try { existing.dispose && existing.dispose() } catch (_) {}
        stateMachineCharts.delete(surgery.id)
      }

      if (!data) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#909399;">暂无状态机数据</div>'
        return
      }

      const chart = echarts.init(container)
      stateMachineCharts.set(surgery.id, chart)

      const positionMap = getStateToYPositionMap()
      const reverseMap = {}
      Object.keys(positionMap).forEach(k => { reverseMap[positionMap[k]] = k })

      const fiveMinutesMs = 5 * 60 * 1000
      const initialEnd = Math.min(data.xMin + fiveMinutesMs, data.xMax)

      chart.setOption({
        grid: { left: 60, right: 20, top: 70, bottom: 80, containLabel: true },
        toolbox: {
          right: 10,
          top: 10,
          feature: {
            dataZoom: { yAxisIndex: 'none' },
            restore: {},
            saveAsImage: {}
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          formatter: (params) => {
            if (!params || !params[0]) return ''
            const p = params[0]
            const t = new Date(p.value[0])
            const yMapped = p.value[1]
            const originalState = p.value[2] ?? reverseMap[yMapped] ?? yMapped
            const stateName = getStateMachineStateName(String(originalState))
            return `${formatTime(t)}<br/>状态: ${originalState}（${stateName}）`
          }
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'none',
            zoomOnMouseWheel: true,
            moveOnMouseWheel: true,
            moveOnMouseMove: true,
            startValue: data.xMin,
            endValue: initialEnd
          },
          {
            type: 'slider',
            xAxisIndex: 0,
            filterMode: 'none',
            height: 40,
            bottom: 20,
            showDataShadow: true,
            brushSelect: true,
            startValue: data.xMin,
            endValue: initialEnd
          }
        ],
        xAxis: {
          type: 'time',
          min: data.xMin,
          max: data.xMax,
          axisLabel: { formatter: (value) => formatTime(value) }
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 65,
          axisLabel: {
            formatter: (val) => {
              const original = reverseMap[val]
              return original ? String(original) : ''
            }
          },
          axisTick: { show: false },
          splitNumber: 8
        },
        series: [{
          type: 'line',
          step: 'end',
          showSymbol: false,
          lineStyle: { width: 2, color: '#409EFF' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(64,158,255,0.25)' },
              { offset: 1, color: 'rgba(64,158,255,0.05)' }
            ])
          },
          data: data.points
        }]
      })
    }

    // 获取状态机状态名称
    const getStateMachineStateName = (state) => {
      const stateMap = {
        "0": "初始化（S00）",
        "1": "使能（S01）",
        "2": "自检（S02）",
        "10": "待机（S10）",
        "12": "从手调整（S12）",
        "13": "主手跟随（S13）",
        "14": "断开主从/离合（S14）",
        "15": "初始化（S00）",
        "20": "主从控制（S20）",
        "21": "内窥镜控制（S21）",
        "30": "错误（S30）",
        "31": "关机（S31）"
      }
      return stateMap[state] || `状态${state}`
    }

    // 网络图表相关功能
    const networkCharts = new Map() // 为每个手术存储网络图表实例

    // 更新网络延时图表
    const updateNetworkChart = (surgery) => {
      if (!surgery || !surgery.is_remote_surgery || !surgery.network_stats) return
      
      const container = document.getElementById(`networkChart_${surgery.id}`)
      if (!container) {
        setTimeout(() => updateNetworkChart(surgery), 50)
        return
      }

      // 清理旧实例
      const existing = networkCharts.get(surgery.id)
      if (existing) {
        try { existing.dispose && existing.dispose() } catch (_) {}
        networkCharts.delete(surgery.id)
      }

      const chart = echarts.init(container)
      networkCharts.set(surgery.id, chart)

      // 获取手术开始和结束时间
      const surgeryStartTime = new Date(surgery.surgery_start_time).getTime()
      const surgeryEndTime = new Date(surgery.surgery_end_time).getTime()

      // 准备数据 - 只包含手术时间段内的数据
      const data = surgery.network_stats.data
        .filter(item => {
          const timestamp = new Date(item.timestamp).getTime()
          return timestamp >= surgeryStartTime && timestamp <= surgeryEndTime
        })
        .map(item => [
          new Date(item.timestamp).getTime(),
          item.latency
        ])

      // 按时间排序
      data.sort((a, b) => a[0] - b[0])

      chart.setOption({
        grid: { left: 60, right: 20, top: 70, bottom: 80, containLabel: true },
        toolbox: {
          right: 10,
          top: 10,
          feature: {
            dataZoom: { yAxisIndex: 'none' },
            restore: {},
            saveAsImage: {}
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
          formatter: (params) => {
            if (!params || !params[0]) return ''
            const p = params[0]
            const time = new Date(p.value[0])
            const latency = p.value[1]
            return `${formatTime(time)}<br/>网络延时: ${latency}ms`
          }
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'none',
            zoomOnMouseWheel: true,
            moveOnMouseWheel: true,
            moveOnMouseMove: true
          },
          {
            type: 'slider',
            xAxisIndex: 0,
            filterMode: 'none',
            height: 40,
            bottom: 20,
            showDataShadow: true,
            brushSelect: true
          }
        ],
        xAxis: {
          type: 'time',
          min: surgeryStartTime,
          max: surgeryEndTime,
          axisLabel: { 
            formatter: (value) => formatTime(value)
          }
        },
        yAxis: {
          type: 'value',
          name: '延时 (ms)',
          axisLabel: { formatter: '{value}ms' },
          scale: true
        },
        series: [{
          type: 'line',
          name: '网络延时',
          showSymbol: false,
          lineStyle: { width: 2, color: '#409EFF' },
          itemStyle: { color: '#409EFF' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(64,158,255,0.25)' },
              { offset: 1, color: 'rgba(64,158,255,0.05)' }
            ])
          },
          data: data
        }]
      })
    }

    // 图表滚动功能已移除，现在只使用滚动条控制
    
    // 使用智能间隔模式

    // 滚动条相关功能
    const surgeryScrollbarStates = new Map() // 为每个手术存储滚动条状态
    const surgeryChartStates = reactive({}) // 为每个手术存储图表状态（响应式）
    const scrollbarUpdateTrigger = ref(0) // 用于触发滚动条重新渲染

    // 获取滚动条滑块样式 - 重新设计：滚动条范围从手术开始到手术结束
    const getScrollbarThumbStyle = (surgery, updateTrigger) => {
      if (!surgery || !surgery.state_machine_changes) return {}
      
      // 重新设计：滚动条的总范围就是手术开始到手术结束
      const totalStartTime = new Date(surgery.surgery_start_time)
      const totalEndTime = new Date(surgery.surgery_end_time)
      const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
      
      if (totalDuration <= 0) return {}
      
      // 获取图表数据 - 使用与图表完全相同的时间计算逻辑
      const chartData = getStateMachineChartData(surgery)
      let viewStartTime, viewEndTime
      
      if (chartData && chartData.startTime && chartData.endTime) {
        // 使用图表实际的时间范围，确保完全同步
        viewStartTime = new Date(chartData.startTime)
        viewEndTime = new Date(chartData.endTime)
      } else {
        // 如果没有图表数据，使用与图表相同的计算逻辑
        let surgeryState = surgeryChartStates[surgery.id]
        if (!surgeryState) {
          surgeryState = {
            currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
            viewRange: chartViewRange.value
          }
          surgeryChartStates[surgery.id] = surgeryState
        }
        
        // 使用与图表完全相同的视图窗口计算
        const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
        let viewCenterTime = surgeryState.currentTime
        
        // 重新设计：确保视图中心时间在手术时间范围内
          const minCenterTime = new Date(totalStartTime.getTime() + viewWindowDuration / 2)
          const maxCenterTime = new Date(totalEndTime.getTime() - viewWindowDuration / 2)
          
        // 如果总时间范围小于视图窗口，允许在整个范围内移动
        if (totalDuration <= viewWindowDuration) {
          // 总时间范围太小，允许在整个范围内移动，但确保不超出边界
          const clampedTime = new Date(Math.max(totalStartTime.getTime(), Math.min(totalEndTime.getTime(), viewCenterTime.getTime())))
          viewCenterTime = clampedTime
        } else {
          // 正常的时间范围限制
          if (viewCenterTime.getTime() < minCenterTime.getTime()) {
            viewCenterTime = minCenterTime
          } else if (viewCenterTime.getTime() > maxCenterTime.getTime()) {
            viewCenterTime = maxCenterTime
          }
        }
        
        // 计算视图的开始和结束时间
        viewStartTime = new Date(viewCenterTime.getTime() - viewWindowDuration / 2)
        viewEndTime = new Date(viewCenterTime.getTime() + viewWindowDuration / 2)
        
        // 确保视图范围不超出手术总时间范围
        if (viewStartTime.getTime() < totalStartTime.getTime()) {
          viewStartTime = totalStartTime
          viewEndTime = new Date(totalStartTime.getTime() + viewWindowDuration)
        }
        
        if (viewEndTime.getTime() > totalEndTime.getTime()) {
          viewEndTime = totalEndTime
          viewStartTime = new Date(totalEndTime.getTime() - viewWindowDuration)
          
          // 确保调整后的开始时间不早于手术开始时间
          if (viewStartTime.getTime() < totalStartTime.getTime()) {
            viewStartTime = totalStartTime
            viewEndTime = new Date(totalStartTime.getTime() + viewWindowDuration)
          }
        }
      }
      
      const viewDuration = viewEndTime.getTime() - viewStartTime.getTime()
      
      // 计算滑块位置和宽度 - 基于手术开始到手术结束的总范围
      const thumbPosition = ((viewStartTime.getTime() - totalStartTime.getTime()) / totalDuration) * 100
      const thumbWidth = (viewDuration / totalDuration) * 100
      
      // 确保滑块位置和宽度在有效范围内
      const clampedPosition = Math.max(0, Math.min(100 - thumbWidth, thumbPosition))
      const clampedWidth = Math.max(5, Math.min(100, thumbWidth))
      
      console.log('滚动条计算 (重新设计):', {
        surgeryId: surgery.surgery_id,
        totalStartTime: totalStartTime.toISOString(),
        totalEndTime: totalEndTime.toISOString(),
        totalDuration: totalDuration / (1000 * 60),
        viewStartTime: viewStartTime.toISOString(),
        viewEndTime: viewEndTime.toISOString(),
        viewDuration: viewDuration / (1000 * 60),
        thumbPosition: thumbPosition.toFixed(2),
        thumbWidth: thumbWidth.toFixed(2),
        clampedPosition: clampedPosition.toFixed(2),
        clampedWidth: clampedWidth.toFixed(2),
        isAtEnd: viewEndTime.getTime() === totalEndTime.getTime(),
        isAtStart: viewStartTime.getTime() === totalStartTime.getTime()
      })
      
      return {
        left: `${clampedPosition}%`,
        width: `${clampedWidth}%`
      }
    }

         // 处理滚动条轨道点击 - 重新设计：基于手术开始到手术结束的范围
     const handleTrackClick = (event, surgery) => {
       if (!surgery) return
       
       const track = event.currentTarget
       const rect = track.getBoundingClientRect()
       const clickX = event.clientX - rect.left
       const trackWidth = rect.width
       
       // 计算点击位置占总宽度的百分比
       const clickPercentage = clickX / trackWidth
       
       // 重新设计：计算总时间范围从手术开始到手术结束
       const totalStartTime = new Date(surgery.surgery_start_time)
       const totalEndTime = new Date(surgery.surgery_end_time)
       const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
       
       // 计算目标时间（考虑5分钟窗口的中心）
       const targetTime = new Date(totalStartTime.getTime() + (clickPercentage * totalDuration))
       
       // 使用与图表完全相同的视图窗口计算
       const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
       const minTime = new Date(totalStartTime.getTime() + viewWindowDuration / 2)
       const maxTime = new Date(totalEndTime.getTime() - viewWindowDuration / 2)
       
       // 更新当前手术的图表状态
       let surgeryState = surgeryChartStates[surgery.id]
       if (!surgeryState) {
         surgeryState = {
           currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
           viewRange: chartViewRange.value
         }
         surgeryChartStates[surgery.id] = surgeryState
       }
       
       // 重新设计：如果总时间范围小于视图窗口，允许在整个范围内移动
       if (totalDuration <= viewWindowDuration) {
         // 总时间范围太小，允许在整个范围内移动，但确保不超出边界
         const clampedTime = new Date(Math.max(totalStartTime.getTime(), Math.min(totalEndTime.getTime(), targetTime.getTime())))
         surgeryState.currentTime = clampedTime
       } else {
         // 正常的时间范围限制
         if (targetTime.getTime() < minTime.getTime()) {
           surgeryState.currentTime = minTime
         } else if (targetTime.getTime() > maxTime.getTime()) {
           surgeryState.currentTime = maxTime
         } else {
           surgeryState.currentTime = targetTime
         }
       }
       
       console.log('滚动条点击 (重新设计):', {
         surgeryId: surgery.surgery_id,
         clickPercentage: clickPercentage.toFixed(2),
         targetTime: targetTime.toISOString(),
         newCurrentTime: surgeryState.currentTime.toISOString(),
         totalStartTime: totalStartTime.toISOString(),
         totalEndTime: totalEndTime.toISOString(),
         totalDuration: totalDuration / (1000 * 60)
       })
       
       // 触发滚动条重新渲染
       scrollbarUpdateTrigger.value++
       updateStateMachineChart(surgery)
     }

     // 开始滚动条拖拽
     const startScrollbarDrag = (event, surgery) => {
       if (!surgery) return
       
       event.preventDefault()
       event.stopPropagation() // 防止触发轨道点击事件
       
       // 获取或创建当前手术的滚动条状态
       let scrollbarState = surgeryScrollbarStates.get(surgery.id)
       if (!scrollbarState) {
         scrollbarState = {
           isDragging: false,
           dragStartX: 0,
           dragStartTime: null
         }
         surgeryScrollbarStates.set(surgery.id, scrollbarState)
       }
       
       scrollbarState.isDragging = true
       scrollbarState.dragStartX = event.clientX
       
       // 获取当前手术的图表状态
       let surgeryState = surgeryChartStates[surgery.id]
       if (!surgeryState) {
         surgeryState = {
           currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
           viewRange: chartViewRange.value
         }
         surgeryChartStates[surgery.id] = surgeryState
       }
       scrollbarState.dragStartTime = surgeryState.currentTime ? new Date(surgeryState.currentTime) : null
       
       // 添加全局事件监听
       document.addEventListener('mousemove', (e) => handleScrollbarDrag(e, surgery))
       document.addEventListener('mouseup', () => stopScrollbarDrag(surgery))
     }

     // 处理滚动条拖拽 - 重新设计：基于手术开始到手术结束的范围
     const handleScrollbarDrag = (event, surgery) => {
       // 获取当前手术的滚动条状态
       let scrollbarState = surgeryScrollbarStates.get(surgery.id)
       if (!scrollbarState || !scrollbarState.isDragging || !scrollbarState.dragStartTime) return
       
       const deltaX = event.clientX - scrollbarState.dragStartX
       
       // 查找当前手术的滚动条轨道
       // 通过手术ID查找对应的滚动条容器
       const scrollbarContainer = document.querySelector(`[data-surgery-id="${surgery.id}"] .chart-scrollbar-container`)
       const scrollbarTrack = scrollbarContainer?.querySelector('.scrollbar-track')
       if (!scrollbarTrack) {
         console.warn('找不到滚动条轨道:', surgery.id)
         return
       }
       
       const trackWidth = scrollbarTrack.offsetWidth
       // 重新设计：计算总时间范围从手术开始到手术结束
       const totalStartTime = new Date(surgery.surgery_start_time)
       const totalEndTime = new Date(surgery.surgery_end_time)
       const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
       
       // 计算拖拽对应的总时间变化
       const dragTimeChange = (deltaX / trackWidth) * totalDuration
       
       // 计算新的中心时间
       const newCenterTime = new Date(scrollbarState.dragStartTime.getTime() + dragTimeChange)
       
       // 使用与图表完全相同的视图窗口计算
       const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
       const minTime = new Date(totalStartTime.getTime() + viewWindowDuration / 2)
       const maxTime = new Date(totalEndTime.getTime() - viewWindowDuration / 2)
       
       // 更新当前手术的图表状态
       let surgeryState = surgeryChartStates[surgery.id]
       if (!surgeryState) {
         surgeryState = {
           currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
           viewRange: chartViewRange.value
         }
         surgeryChartStates[surgery.id] = surgeryState
       }
       
       // 重新设计：如果总时间范围小于视图窗口，允许在整个范围内移动
       if (totalDuration <= viewWindowDuration) {
         // 总时间范围太小，允许在整个范围内移动，但确保不超出边界
         const clampedTime = new Date(Math.max(totalStartTime.getTime(), Math.min(totalEndTime.getTime(), newCenterTime.getTime())))
         surgeryState.currentTime = clampedTime
       } else {
         // 正常的时间范围限制
         if (newCenterTime.getTime() < minTime.getTime()) {
           surgeryState.currentTime = minTime
         } else if (newCenterTime.getTime() > maxTime.getTime()) {
           surgeryState.currentTime = maxTime
         } else {
           surgeryState.currentTime = newCenterTime
         }
       }
       
       console.log('滚动条拖拽 (重新设计):', {
         surgeryId: surgery.surgery_id,
         deltaX: deltaX.toFixed(2),
         dragTimeChange: dragTimeChange / (1000 * 60),
         newCenterTime: newCenterTime.toISOString(),
         newCurrentTime: surgeryState.currentTime.toISOString(),
         totalStartTime: totalStartTime.toISOString(),
         totalEndTime: totalEndTime.toISOString(),
         totalDuration: totalDuration / (1000 * 60)
       })
       
       // 触发滚动条重新渲染
       scrollbarUpdateTrigger.value++
       updateStateMachineChart(surgery)
     }

    // 停止滚动条拖拽
    const stopScrollbarDrag = (surgery) => {
      if (!surgery) return
      
      // 获取当前手术的滚动条状态
      let scrollbarState = surgeryScrollbarStates.get(surgery.id)
      if (scrollbarState) {
        scrollbarState.isDragging = false
        scrollbarState.dragStartX = 0
        scrollbarState.dragStartTime = null
      }
      
      // 移除全局事件监听
      document.removeEventListener('mousemove', (e) => handleScrollbarDrag(e, surgery))
      document.removeEventListener('mouseup', () => stopScrollbarDrag(surgery))
    }

    // 向左滚动图表 - 重新设计：基于手术开始到手术结束的范围
    const scrollChartLeft = (surgery) => {
      if (!surgery) return
      
      let surgeryState = surgeryChartStates[surgery.id]
      if (!surgeryState) {
        surgeryState = {
          currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
          viewRange: chartViewRange.value
        }
        surgeryChartStates[surgery.id] = surgeryState
      }
      
      const scrollStep = 60 * 1000 // 1分钟
      const newCurrentTime = new Date(surgeryState.currentTime.getTime() - scrollStep)
      
      // 重新设计：使用与图表完全相同的边界检查逻辑
      const totalStartTime = new Date(surgery.surgery_start_time)
      const totalEndTime = new Date(surgery.surgery_end_time)
      const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
      const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
      
      // 重新设计：如果总时间范围小于等于视图窗口，允许在整个范围内移动
      if (totalDuration <= viewWindowDuration) {
        const clampedTime = new Date(Math.max(totalStartTime.getTime(), Math.min(totalEndTime.getTime(), newCurrentTime.getTime())))
        surgeryState.currentTime = clampedTime
      } else {
        // 正常的时间范围限制
        const minTime = new Date(totalStartTime.getTime() + viewWindowDuration / 2)
        
        // 确保不超出左边界
        if (newCurrentTime.getTime() >= minTime.getTime()) {
          surgeryState.currentTime = newCurrentTime
        } else {
          surgeryState.currentTime = minTime
        }
      }
      
      console.log('向左滚动 (重新设计):', {
        surgeryId: surgery.surgery_id,
        oldTime: surgeryState.currentTime.toISOString(),
        newTime: newCurrentTime.toISOString(),
        totalStartTime: totalStartTime.toISOString(),
        totalEndTime: totalEndTime.toISOString(),
        totalDuration: totalDuration / (1000 * 60)
      })
      
      // 触发滚动条重新渲染
      scrollbarUpdateTrigger.value++
      updateStateMachineChart(surgery)
    }

    // 向右滚动图表 - 重新设计：基于手术开始到手术结束的范围
    const scrollChartRight = (surgery) => {
      if (!surgery) return
      
      let surgeryState = surgeryChartStates[surgery.id]
      if (!surgeryState) {
        surgeryState = {
          currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
          viewRange: chartViewRange.value
        }
        surgeryChartStates[surgery.id] = surgeryState
      }
      
      const scrollStep = 60 * 1000 // 1分钟
      const newCurrentTime = new Date(surgeryState.currentTime.getTime() + scrollStep)
      
      // 重新设计：使用与图表完全相同的边界检查逻辑
      const totalStartTime = new Date(surgery.surgery_start_time)
      const totalEndTime = new Date(surgery.surgery_end_time)
      const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
      const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
      
      // 重新设计：如果总时间范围小于等于视图窗口，允许在整个范围内移动
      if (totalDuration <= viewWindowDuration) {
        const clampedTime = new Date(Math.max(totalStartTime.getTime(), Math.min(totalEndTime.getTime(), newCurrentTime.getTime())))
        surgeryState.currentTime = clampedTime
        
        console.log('向右滚动 (短手术 - 重新设计):', {
          surgeryId: surgery.surgery_id,
          oldTime: surgeryState.currentTime.toISOString(),
          newTime: newCurrentTime.toISOString(),
          clampedTime: clampedTime.toISOString(),
          totalStartTime: totalStartTime.toISOString(),
          totalEndTime: totalEndTime.toISOString(),
          totalDuration: totalDuration / (1000 * 60)
        })
      } else {
        // 正常的时间范围限制
        const maxTime = new Date(totalEndTime.getTime() - viewWindowDuration / 2)
        
        // 确保不超出右边界
        if (newCurrentTime.getTime() <= maxTime.getTime()) {
          surgeryState.currentTime = newCurrentTime
        } else {
          surgeryState.currentTime = maxTime
        }
        
        console.log('向右滚动 (长手术 - 重新设计):', {
          surgeryId: surgery.surgery_id,
          oldTime: surgeryState.currentTime.toISOString(),
          newTime: newCurrentTime.toISOString(),
          maxTime: maxTime.toISOString(),
          totalStartTime: totalStartTime.toISOString(),
          totalEndTime: totalEndTime.toISOString(),
          totalDuration: totalDuration / (1000 * 60)
        })
      }
      
      // 触发滚动条重新渲染
      scrollbarUpdateTrigger.value++
      updateStateMachineChart(surgery)
    }

    // 检查是否可以向左滚动 - 重新设计：基于手术开始到手术结束的范围
    const canScrollLeft = (surgery) => {
      if (!surgery) return false
      
      let surgeryState = surgeryChartStates[surgery.id]
      if (!surgeryState) {
        surgeryState = {
          currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
          viewRange: chartViewRange.value
        }
        surgeryChartStates[surgery.id] = surgeryState
      }
      
      // 重新设计：使用与图表完全相同的边界检查逻辑
      const totalStartTime = new Date(surgery.surgery_start_time)
      const totalEndTime = new Date(surgery.surgery_end_time)
      const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
      const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
      
      // 重新设计：如果总时间范围小于等于视图窗口，无法滚动
      if (totalDuration <= viewWindowDuration) {
        return false
      }
      
      const minTime = new Date(totalStartTime.getTime() + viewWindowDuration / 2)
      
      return surgeryState.currentTime.getTime() > minTime.getTime()
    }

    // 检查是否可以向右滚动 - 重新设计：基于手术开始到手术结束的范围
    const canScrollRight = (surgery) => {
      if (!surgery) return false
      
      let surgeryState = surgeryChartStates[surgery.id]
      if (!surgeryState) {
        surgeryState = {
          currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
          viewRange: chartViewRange.value
        }
        surgeryChartStates[surgery.id] = surgeryState
      }
      
      // 重新设计：使用与图表完全相同的边界检查逻辑
      const totalStartTime = new Date(surgery.surgery_start_time)
      const totalEndTime = new Date(surgery.surgery_end_time)
      const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
      const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
      
      // 重新设计：如果总时间范围小于等于视图窗口，无法滚动
      if (totalDuration <= viewWindowDuration) {
        return false // 无法滚动，因为已经显示全部
      }
      
      // 计算最大中心时间：当视图中心时间到达这个时间时，视图的结束时间正好是手术结束时间
      const maxCenterTime = new Date(totalEndTime.getTime() - viewWindowDuration / 2)
      
      console.log('向右滚动检查 (重新设计):', {
        surgeryId: surgery.surgery_id,
        currentTime: surgeryState.currentTime.toISOString(),
        maxCenterTime: maxCenterTime.toISOString(),
        totalStartTime: totalStartTime.toISOString(),
        totalEndTime: totalEndTime.toISOString(),
        totalDuration: totalDuration / (1000 * 60),
        viewWindowDuration: (viewWindowDuration / (1000 * 60)).toFixed(1) + '分钟',
        canScroll: surgeryState.currentTime.getTime() < maxCenterTime.getTime()
      })
      
      return surgeryState.currentTime.getTime() < maxCenterTime.getTime()
    }

    // 检查所有组件的同步状态
    const checkSynchronization = (surgery) => {
      if (!surgery) return
      
      const chartData = getStateMachineChartData(surgery)
      const scrollbarStyle = getScrollbarThumbStyle(surgery, scrollbarUpdateTrigger.value)
      const scrollbarInfo = getScrollbarInfo(surgery, scrollbarUpdateTrigger.value)
      
      // 重新设计：计算总时间范围和视图窗口
      const totalStartTime = new Date(surgery.surgery_start_time)
      const totalEndTime = new Date(surgery.surgery_end_time)
      const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
      const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
      
      // 计算边界时间用于调试
      const minCenterTime = new Date(totalStartTime.getTime() + viewWindowDuration / 2)
      const maxCenterTime = new Date(totalEndTime.getTime() - viewWindowDuration / 2)
      
      console.log('同步状态检查 (重新设计):', {
        surgeryId: surgery.surgery_id,
        totalStartTime: totalStartTime.toISOString(),
        totalEndTime: totalEndTime.toISOString(),
        totalDuration: (totalDuration / (1000 * 60)).toFixed(1) + '分钟',
        viewWindowDuration: (viewWindowDuration / (1000 * 60)).toFixed(1) + '分钟',
        isShortSurgery: totalDuration <= viewWindowDuration,
        minCenterTime: minCenterTime.toISOString(),
        maxCenterTime: maxCenterTime.toISOString(),
        chartDataExists: !!chartData,
        chartLabels: chartData?.labels?.length || 0,
        chartDataPoints: chartData?.data?.length || 0,
        chartStartTime: chartData?.startTime?.toISOString() || 'N/A',
        chartEndTime: chartData?.endTime?.toISOString() || 'N/A',
        scrollbarLeft: scrollbarStyle.left,
        scrollbarWidth: scrollbarStyle.width,
        scrollbarInfo: scrollbarInfo,
        canScrollLeft: canScrollLeft(surgery),
        canScrollRight: canScrollRight(surgery),
        // 添加调试信息
        surgeryStartTime: surgery.surgery_start_time,
        surgeryEndTime: surgery.surgery_end_time,
        timelineRange: getTimelineRange(surgery),
        powerOnTime: getPowerOnTime(surgery),
        powerOffTime: getPowerOffTime(surgery)
      })
    }

    // 获取滚动条信息 - 重新设计：基于手术开始到手术结束的范围
    const getScrollbarInfo = (surgery, updateTrigger) => {
      if (!surgery) return ''
      
      // 获取图表实际的时间范围
      const chartData = getStateMachineChartData(surgery)
      if (!chartData || !chartData.startTime || !chartData.endTime) {
        // 如果没有图表数据，使用与图表相同的计算逻辑
        let surgeryState = surgeryChartStates[surgery.id]
        if (!surgeryState) {
          surgeryState = {
            currentTime: surgery.surgery_start_time ? new Date(surgery.surgery_start_time) : new Date(),
            viewRange: chartViewRange.value
          }
          surgeryChartStates[surgery.id] = surgeryState
        }
        
        // 重新设计：使用与图表完全相同的视图窗口计算
        const totalStartTime = new Date(surgery.surgery_start_time)
        const totalEndTime = new Date(surgery.surgery_end_time)
        const totalDuration = totalEndTime.getTime() - totalStartTime.getTime()
        const viewWindowDuration = chartViewRange.value * 60 * 1000 // 5分钟
        let viewCenterTime = surgeryState.currentTime
        
        // 重新设计：确保视图中心时间在手术时间范围内
          const minCenterTime = new Date(totalStartTime.getTime() + viewWindowDuration / 2)
          const maxCenterTime = new Date(totalEndTime.getTime() - viewWindowDuration / 2)
          
        // 如果总时间范围小于视图窗口，允许在整个范围内移动
        if (totalDuration <= viewWindowDuration) {
          // 总时间范围太小，允许在整个范围内移动，但确保不超出边界
          const clampedTime = new Date(Math.max(totalStartTime.getTime(), Math.min(totalEndTime.getTime(), viewCenterTime.getTime())))
          viewCenterTime = clampedTime
        } else {
          // 正常的时间范围限制
          if (viewCenterTime.getTime() < minCenterTime.getTime()) {
            viewCenterTime = minCenterTime
          } else if (viewCenterTime.getTime() > maxCenterTime.getTime()) {
            viewCenterTime = maxCenterTime
          }
        }
        
        // 计算视图的开始和结束时间
        const viewStartTime = new Date(viewCenterTime.getTime() - viewWindowDuration / 2)
        const viewEndTime = new Date(viewCenterTime.getTime() + viewWindowDuration / 2)
        
        // 确保视图范围不超出手术总时间范围
        let finalViewStartTime = viewStartTime
        let finalViewEndTime = viewEndTime
        
        if (finalViewStartTime.getTime() < totalStartTime.getTime()) {
          finalViewStartTime = totalStartTime
          finalViewEndTime = new Date(totalStartTime.getTime() + viewWindowDuration)
        }
        
        if (finalViewEndTime.getTime() > totalEndTime.getTime()) {
          finalViewEndTime = totalEndTime
          finalViewStartTime = new Date(totalEndTime.getTime() - viewWindowDuration)
          
          // 确保调整后的开始时间不早于手术开始时间
          if (finalViewStartTime.getTime() < totalStartTime.getTime()) {
            finalViewStartTime = totalStartTime
            finalViewEndTime = new Date(totalStartTime.getTime() + viewWindowDuration)
          }
        }
        
        const startTimeStr = formatTimeShort(finalViewStartTime)
        const endTimeStr = formatTimeShort(finalViewEndTime)
        
        const durationMinutes = (finalViewEndTime.getTime() - finalViewStartTime.getTime()) / (1000 * 60)
        
        return `${startTimeStr} - ${endTimeStr} (${durationMinutes.toFixed(1)}分钟)`
      }
      
      // 使用图表实际的时间范围
      const actualStartTime = new Date(chartData.startTime)
      const actualEndTime = new Date(chartData.endTime)
      
      const startTimeStr = formatTimeShort(actualStartTime)
      const endTimeStr = formatTimeShort(actualEndTime)
      
      // 计算实际的时间范围（分钟）
      const actualDurationMinutes = (actualEndTime.getTime() - actualStartTime.getTime()) / (1000 * 60)
      
      console.log('滚动条时间范围 (重新设计):', surgery.surgery_id, {
        startTime: actualStartTime.toISOString(),
        endTime: actualEndTime.toISOString(),
        duration: actualDurationMinutes.toFixed(1) + '分钟',
        totalStartTime: new Date(surgery.surgery_start_time).toISOString(),
        totalEndTime: new Date(surgery.surgery_end_time).toISOString()
      })
      
      return `${startTimeStr} - ${endTimeStr} (${actualDurationMinutes.toFixed(1)}分钟)`
    }



    // 监听手术数据变化，自动更新图表
    watch(surgeries, (newSurgeries) => {
      if (newSurgeries.length > 0 && activeTab.value) {
        const currentSurgery = newSurgeries.find(s => s.id.toString() === activeTab.value)
        if (currentSurgery) {
          // 延迟更新图表，确保DOM已渲染
          nextTick(() => {
            // 检查canvas元素是否存在
            const canvasId = `stateMachineChart_${currentSurgery.id}`
            const canvas = document.getElementById(canvasId)
            if (canvas) {
            updateStateMachineChart(currentSurgery)
            } else {
              console.warn('Canvas元素不存在，等待DOM渲染:', canvasId)
              // 如果canvas不存在，再等待一下
              setTimeout(() => {
                updateStateMachineChart(currentSurgery)
              }, 100)
            }
            
            // 更新网络延时图表
            if (currentSurgery.is_remote_surgery && currentSurgery.network_stats) {
              updateNetworkChart(currentSurgery)
            }
          })
        }
      }
    }, { deep: true })

    // 监听活动标签页变化，更新图表
    watch(activeTab, (newTab) => {
      if (newTab && surgeries.value.length > 0) {
        const currentSurgery = surgeries.value.find(s => s.id.toString() === newTab)
        if (currentSurgery) {
          // 延迟更新图表，确保DOM已渲染
          nextTick(() => {
            // 再次检查canvas元素是否存在
            const canvasId = `stateMachineChart_${currentSurgery.id}`
            const canvas = document.getElementById(canvasId)
            if (canvas) {
              console.log('切换到手术标签页:', currentSurgery.surgery_id)
              
              // 添加调试信息，特别关注第四场手术
              if (currentSurgery.surgery_id === '4371-17') {
                console.log('=== 第四场手术调试信息 ===')
                console.log('手术开始时间:', currentSurgery.surgery_start_time)
                console.log('手术结束时间:', currentSurgery.surgery_end_time)
                console.log('时间轴范围:', getTimelineRange(currentSurgery))
                console.log('开机时间:', getPowerOnTime(currentSurgery))
                console.log('关机时间:', getPowerOffTime(currentSurgery))
                console.log('状态机变化数据:', currentSurgery.state_machine_changes)
                console.log('========================')
              }
              
              updateStateMachineChart(currentSurgery)
            } else {
              console.warn('Canvas元素不存在，等待DOM渲染:', canvasId)
              // 如果canvas不存在，再等待一下
              setTimeout(() => {
                updateStateMachineChart(currentSurgery)
              }, 100)
            }
            
            // 更新网络延时图表
            if (currentSurgery.is_remote_surgery && currentSurgery.network_stats) {
              updateNetworkChart(currentSurgery)
            }
          })
        }
      }
    })

    // 生命周期
    onMounted(async () => {
      // 加载服务器时区信息
      await loadServerTimezone()
      
      // 优先处理URL参数中的日志ID
      const logIdsParam = route.query.logIds
      if (logIdsParam) {
        await loadBatchLogEntriesByIds()
        return
      }

      // 其次处理 URL 参数中的设备+时间范围
      const deviceId = route.query.deviceId
      const startTime = route.query.startTime
      const endTime = route.query.endTime
      if (deviceId && startTime && endTime) {
        await loadBatchLogEntriesByDeviceRange()
        return
      }
      
      // 如果没有URL参数，检查是否有sessionStorage数据
      if (logEntries.value.length > 0) {
        // 检查是否有自动分析标志
        const autoAnalyze = sessionStorage.getItem('autoAnalyze')
        if (autoAnalyze === 'true') {
          sessionStorage.removeItem('autoAnalyze')
          await analyzeLogs()
        }
      }
    })

          return {
        surgeries,
        activeTab,
        armDetailsVisible,
        showAllAlarms,
        analyzing,
        logEntriesCount,
        analyzeLogs,
        exportSurgeryData,
        toggleArmDetails,
        toggleAlarms,
        scrollToAlarmCard,
        scrollToNetworkCard,
        getArmUsages,
        getInstrumentRows,
        getArmTotalTime,
        getArmTimelineStyle,
              getArmTimelineSegments,
      getSurgeryTimelineStyle,
      getUsageTimelineStyle,
        getEnergyTime,
        getAlarmTypeTag,
        getAlarmDetails,
        getDeduplicatedAlarmStats,
        formatTime,
        formatSurgeryTime,
        formatTimeShort,
        getTimePosition,
        getTimelineTicks,
        handleTabClick,
        getAnalysisButtonText,
        getTimeRange,
        loadBatchLogEntriesByIds,
        loadBatchLogEntriesByDeviceRange,
        pollTaskResult,
        getPowerOnTime,
        getPowerOffTime,
        getAllPowerOnTimes,
        getAllPowerOffTimes,
        getSurgeryTimelineStyle,
        getGroupedUsagesByUdi,
        getGroupedUsageDuration,
        getSegmentText,
        getTimelineRange,
        getProgressTimelineRange,
        getSegmentInstrumentName,
        getSortedTimelineEvents,
        getStateChanges,
        getStateName,
        getStateBarHeight,
        getStateBarPosition,
        handleBeforeTabLeave,
        
        // 状态机图表相关方法
        resetChartView,
        updateStateMachineChart,
        getStateMachineChartData,
        getStateMachineChartOptions,

        // 网络图表相关方法
        updateNetworkChart,

                 // 滚动条相关方法
         getScrollbarThumbStyle,
         handleTrackClick,
         startScrollbarDrag,
         scrollChartLeft,
         scrollChartRight,
         canScrollLeft,
         canScrollRight,
         getScrollbarInfo,
         checkSynchronization,

        // PostgreSQL数据预览相关
        postgresqlPreviewVisible,
        postgresqlDataText,
        copyingData,
        refreshingData,
        togglePostgreSQLPreview,
        copyPostgreSQLData,
        refreshPostgreSQLData,

      }
  }
}
</script>

<style scoped>
.surgery-statistics-container {
  padding: 20px;
  min-height: calc(100vh - 40px);
  box-sizing: border-box;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.analysis-section {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  min-height: 400px;
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

.empty-card {
  text-align: center;
  padding: 40px;
  margin-top: 100px;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-height: 300px;
  justify-content: center;
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
  min-height: 500px;
  /* 优化ResizeObserver性能 */
  contain: layout style paint;
}

/* 优化标签页性能 */
.el-tabs__content {
  contain: layout style paint;
}

.el-tab-pane {
  contain: layout style paint;
}

/* 减少标签页切换时的重绘 */
.el-tabs__item {
  will-change: auto;
}

.el-tabs__content {
  will-change: auto;
}

/* 禁用标签页切换动画，减少 ResizeObserver 错误 */
.el-tabs__item {
  transition: none !important;
}

.el-tabs__content {
  transition: none !important;
}

.el-tab-pane {
  transition: none !important;
}

/* 优化标签页内容渲染 */
.el-tabs__content > .el-tab-pane {
  contain: layout style paint;
  will-change: auto;
}

/* 减少标签页切换时的布局计算 */
.el-tabs__header {
  contain: layout style paint;
}

.el-tabs__nav-wrap {
  contain: layout style paint;
}

.el-tabs__nav {
  contain: layout style paint;
}

.export-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}

/* 手术信息布局 */
.surgery-info-layout {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  align-items: stretch;
}

.timeline-section {
  width: 25%;
  flex-shrink: 0;
}

.state-chart-section {
  width: 75%;
  flex-shrink: 0;
}

/* 第二行布局：器械卡片 + 手术统计卡片 */
/* 删除外部分栏后的残留样式（不再使用） */

/* 手术信息卡片样式 */
.info-card {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 确保时间线内容不被遮挡 */
  overflow: visible;
}

/* 状态图表卡片样式 */
.state-chart-card {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #E4E7ED;
  flex-shrink: 0;
}

.info-header .time {
  font-size: 16px;
  font-weight: 500;
  color: #1d2129;
}

.info-header .badges {
  display: flex;
  gap: 8px;
}

/* 故障手术标签样式 */
.alarm-tag {
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
}

.alarm-tag:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.3);
}

.alarm-tag:active {
  transform: scale(0.95);
}

/* AntD Steps 时间线样式 */
.surgery-steps {
  padding-left: 2px;
}

:deep(.ant-steps-vertical) {
  align-items: stretch;
}

:deep(.ant-steps-item) {
  padding-bottom: 10px;
}

:deep(.ant-steps-item:last-child) {
  padding-bottom: 0;
}

:deep(.ant-steps-item-container) {
  align-items: flex-start;
}

:deep(.ant-steps-item-title) {
  font-weight: 500;
  font-size: 14px;
}

:deep(.ant-steps-item-description) {
  color: #606266; /* 统一时间字体颜色，不按类型区分 */
}
:deep(.ant-steps-item-icon),
:deep(.ant-steps-item-tail) {
  color: #dcdfe6; /* 统一连接线/节点颜色 */
}

:deep(.ant-steps-item-finish) .ant-steps-item-icon,
:deep(.ant-steps-item-process) .ant-steps-item-icon,
:deep(.ant-steps-item-wait) .ant-steps-item-icon,
:deep(.ant-steps-item-error) .ant-steps-item-icon {
  color: #dcdfe6;
}

:deep(.ant-steps-item-finish) .ant-steps-item-title::after,
:deep(.ant-steps-item-process) .ant-steps-item-title::after,
:deep(.ant-steps-item-wait) .ant-steps-item-title::after,
:deep(.ant-steps-item-error) .ant-steps-item-title::after {
  background-color: #dcdfe6; /* 统一连接线颜色 */
}

.timeline-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-radius: 6px;
  border-left: 3px solid;
  /* 移除悬停动画效果 */
  transition: none;
}

/* 移除悬停时的动态效果 */
.timeline-content:hover {
  /* 移除 transform 和 box-shadow 效果 */
  transform: none;
  box-shadow: none;
}

.timeline-icon {
  font-size: 16px;
  color: #409EFF;
}

.timeline-text {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

/* 时间线项目颜色 - 根据事件类型设置 */
.timeline-content {
  border-left-color: #409EFF;
  background-color: #f8f9fa;
}

/* 开机事件样式 */
.timeline-content.timeline-powerOn {
  border-left-color: #67C23A;
  background-color: #f0f9ff;
}

/* 手术开始事件样式 */
.timeline-content.timeline-surgeryStart {
  border-left-color: #409EFF;
  background-color: #f0f9ff;
}

/* 手术结束事件样式 */
.timeline-content.timeline-surgeryEnd {
  border-left-color: #E6A23C;
  background-color: #fff7ed;
}

/* 关机事件样式 */
.timeline-content.timeline-powerOff {
  border-left-color: #F56C6C;
  background-color: #fef0f0;
}

/* 时间线时间戳样式 */
.el-timeline-item__timestamp {
  font-size: 12px !important;
  color: #909399 !important;
  font-weight: 500 !important;
}

/* 状态图表样式 */
.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #E4E7ED;
  flex-shrink: 0;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.chart-controls {
  display: flex;
  gap: 16px;
  align-items: center;
}

.chart-legend {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #606266;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.state-normal {
  background-color: #95D475; /* 浅绿色 - 正常状态 */
}

.legend-color.state-error {
  background-color: #F56C6C; /* 红色 - 故障状态 */
}

.legend-color.state-shutdown {
  background-color: #909399; /* 灰色 - 关机状态 */
}

.state-chart-container {
  position: relative;
  height: 380px;
  background-color: #FAFAFA;
  border-radius: 6px;
  border: 1px solid #E4E7ED;
  overflow: hidden;
  flex: 1;
  cursor: grab;
  padding-left: 4px; /* 为图形左边界留出空间，避免截断 */
  padding-right: 10px; /* 为Y轴标签留出空间 */
}

.state-chart-container:active {
  cursor: grabbing;
}

/* 滚动条样式 */
.chart-scrollbar-container {
  margin-top: 10px;
  padding: 0 10px;
}

.scrollbar-track {
  position: relative;
  height: 8px;
  background-color: #F5F7FA;
  border-radius: 4px;
  border: 1px solid #E4E7ED;
  cursor: pointer;
  margin-bottom: 8px;
}

.scrollbar-thumb {
  position: absolute;
  height: 100%;
  background-color: #409EFF;
  border-radius: 4px;
  cursor: grab;
  transition: background-color 0.2s ease;
  min-width: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.scrollbar-thumb:hover {
  background-color: #337ECC;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.scrollbar-thumb:active {
  cursor: grabbing;
  background-color: #2B5BA1;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
}

.scrollbar-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.scrollbar-info {
  font-size: 12px;
  color: #606266;
  min-width: 120px;
  text-align: center;
}



.chart-bars {
  position: relative;
  height: 100%;
  padding: 10px 40px;
}

.chart-bar {
  position: absolute;
  bottom: 0;
  width: 30px;
  border-radius: 2px 2px 0 0;
  cursor: pointer;
  transition: all 0.3s ease;
}

.chart-bar:hover {
  transform: scaleY(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.chart-bar.state-surgery {
  background-color: #95D475; /* 浅绿色 - 正常阶段 */
}

.chart-bar.state-error {
  background-color: #F56C6C; /* 红色 - 故障阶段 */
}

.bar-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  z-index: 1000;
}

.chart-bar:hover .bar-tooltip {
  opacity: 1;
}

.tooltip-state {
  font-weight: 600;
  margin-bottom: 4px;
}

.tooltip-original {
  color: #909399;
  font-size: 11px;
  margin-bottom: 2px;
}

.tooltip-time {
  color: #E4E7ED;
  margin-bottom: 2px;
}

.tooltip-duration {
  color: #67C23A;
  font-weight: 500;
}

.chart-timeline {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  border-top: 1px solid #E4E7ED;
  background-color: #FFFFFF;
}

.time-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
}

.tick-line {
  width: 1px;
  height: 8px;
  background-color: #DCDFE6;
  margin: 0 auto;
}

.tick-label {
  font-size: 10px;
  color: #909399;
  text-align: center;
  margin-top: 4px;
  white-space: nowrap;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .surgery-info-layout {
    flex-direction: column;
    gap: 16px;
  }
  
  .timeline-section,
  .state-chart-section {
    width: 100%;
  }
  
  .info-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .timeline-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .chart-legend {
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .state-chart-container {
    height: 100px;
  }
}

/* 器械使用分组样式 */
.usage-group {
  margin-bottom: 16px;
  padding: 16px;
  background-color: #FFFFFF;
  border-radius: 6px;
  border: 1px solid #E4E7ED;
}

.usage-group-header {
  margin-bottom: 12px;
}

.usage-group-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.usage-group-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.usage-group-udi {
  font-size: 12px;
  color: #909399;
}

.usage-group-duration {
  font-size: 12px;
  color: #67C23A;
  font-weight: 500;
}

.usage-group-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.usage-group-color.arm-1 { background-color: #409EFF; }
.usage-group-color.arm-2 { background-color: #67C23A; }
.usage-group-color.arm-3 { background-color: #E6A23C; }
.usage-group-color.arm-4 { background-color: #F56C6C; }

/* 工具提示样式 */
.el-tooltip__popper {
  z-index: 9999;
}

/* 自定义工具提示样式 */
:deep(.usage-time-tooltip) {
  background-color: rgba(0, 0, 0, 0.9) !important;
  color: white !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 10px 12px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
  line-height: 1.4 !important;
  max-width: 300px !important;
  white-space: pre-line !important;
}

:deep(.usage-time-tooltip .el-tooltip__arrow) {
  border-top-color: rgba(0, 0, 0, 0.9) !important;
}

/* 移除旧的样式 */
.time-info-cards {
  display: none;
}

.time-card {
  display: none;
}

.time-card-content {
  display: none;
}

.usage-item {
  display: none;
}

.usage-label {
  display: none;
}

.usage-name {
  display: none;
}

.usage-udi {
  display: none;
}

.usage-duration {
  display: none;
}

.usage-timeline-container {
  display: none;
}

.usage-timeline {
  display: none;
}

.timeline-segment-sub {
  display: none;
}

/* 移除旧的时间信息样式 */
.time-info-section {
  display: none;
}

.time-info-header {
  display: none;
}

.time-info-title {
  display: none;
}

.time-info-content {
  display: none;
}

.time-info-item {
  display: none;
}

.time-icon {
  display: none;
}

.time-info {
  display: none;
}

.time-label {
  display: none;
}

.arm-usage-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.unified-timeline-view {
  position: relative;
  min-height: 120px;
  margin-bottom: 30px;
  /* 优化渲染性能 */
  contain: layout style paint;
  will-change: transform;
}

.surgery-progress-container {
  margin-bottom: 30px;
  padding: 16px;
  background-color: #FAFAFA;
  border-radius: 8px;
  border: 1px solid #E4E7ED;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.surgery-timeline-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
}

.surgery-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  flex-shrink: 0;
}

.surgery-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: linear-gradient(90deg, #409EFF, #67C23A);
}

.surgery-name {
  font-weight: 600;
  color: #303133;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding-left: 132px; /* 120px标签宽度 + 12px间距 */
}

.time-label {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.surgery-progress {
  margin-bottom: 8px;
}

.surgery-timeline-container {
  position: relative;
  height: 20px;
  background-color: #F5F7FA;
  border-radius: 4px;
  border: 1px solid #DCDFE6;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
}

.surgery-timeline-bar {
  position: relative;
  width: 100%;
  height: 100%;
}

.surgery-timeline-segment {
  position: absolute;
  height: 100%;
  background: linear-gradient(90deg, #409EFF, #67C23A);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.surgery-segment-text {
  color: white;
  font-size: 12px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;
}

.surgery-duration-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #666;
  min-width: 120px;
  flex-shrink: 0;
  align-items: flex-start;
}

.surgery-duration-info .duration-text {
  font-weight: 500;
  color: #409EFF;
}

.surgery-duration-info .time-range {
  color: #909399;
  font-size: 11px;
}

.surgery-duration-info .timeline-range {
  color: #606266;
  font-size: 11px;
  font-style: italic;
}



/* 时间值样式（保留用于其他地方） */
.time-value {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}





.arm-timeline {
  display: flex;
  flex-direction: column;
  gap: 12px; /* 更紧凑 */
  margin-top: 12px; /* 更紧凑 */
  position: relative;
  z-index: 2;
  contain: layout style paint;
}

.arm-item {
  border: 1px solid #E4E7ED;
  border-radius: 6px; /* 更紧凑 */
  padding: 10px; /* 更紧凑 */
  background-color: #FAFAFA;
  margin-bottom: 8px; /* 更紧凑 */
}

.arm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px; /* 更紧凑 */
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

.arm-timeline-container {
  display: flex;
  align-items: center;
  gap: 8px; /* 更紧凑 */
  margin-bottom: 8px; /* 更紧凑 */
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  position: relative;
}

/* 当arm-timeline-container没有arm-label时的样式 */
.arm-timeline-container.no-label {
  gap: 0;
}

.arm-timeline-container.no-label .arm-timeline-bar {
  flex: 1;
  width: 100%;
}

.arm-label {
  display: flex;
  align-items: center;
  gap: 6px; /* 更紧凑 */
  min-width: 110px; /* 稍微收窄 */
  flex-shrink: 0;
  padding: 0;
  margin: 0;
  position: relative;
}

.arm-timeline-bar {
  position: relative;
  height: 16px; /* 更紧凑 */
  background: #F5F7FA;
  border-radius: 4px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  border: 1px solid #DCDFE6;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  left: 0;
  right: 0;
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
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.timeline-segment.arm-1 { background-color: #409EFF; }
.timeline-segment.arm-2 { background-color: #67C23A; }
.timeline-segment.arm-3 { background-color: #E6A23C; }
.timeline-segment.arm-4 { background-color: #F56C6C; }

/* 确保segment-content占满整个进度条区域 */
.segment-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.segment-text {
  font-size: 10px; /* 更紧凑 */
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
  text-align: center;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  min-height: 16px; /* 与bar高度匹配 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.arm-details {
  margin-top: 16px;
  padding-top: 0;
  border-top: 1px solid #E4E7ED;
}



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

.alarm-toggle {
  margin-top: 12px;
  text-align: center;
}

.alarm-toggle .el-button {
  color: #409EFF;
  font-size: 14px;
}

.alarm-toggle .el-button:hover {
  color: #66b1ff;
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

/* 多个时间显示样式 */
.time-item {
  margin-bottom: 4px;
  padding: 2px 0;
  font-size: 13px;
  color: #606266;
}

.time-item:last-child {
  margin-bottom: 0;
}

.time-item:not(:last-child) {
  border-bottom: 1px solid #EBEEF5;
  padding-bottom: 4px;
}

.time-value {
  min-height: 20px;
}

/* 确保时间轴对齐的全局样式 */
.arm-timeline-container {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  margin-bottom: 12px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 0 !important;
  position: relative !important;
}

/* 额外的 ResizeObserver 优化 */
.surgery-statistics-container {
  contain: layout style paint;
}

.tab-card {
  contain: layout style paint;
}

/* 减少标签页内容的重绘 */
.el-tabs__content > .el-tab-pane {
  contain: layout style paint;
  will-change: auto;
  transform: translateZ(0);
}

/* 优化复杂组件的渲染 */
.surgery-info-layout {
  contain: layout style paint;
  will-change: auto;
}

.unified-timeline-view {
  contain: layout style paint;
  will-change: auto;
}

/* 禁用不必要的动画和过渡 */
.el-collapse-transition {
  transition: none !important;
}

.el-fade-in-linear-enter-active,
.el-fade-in-linear-leave-active {
  transition: none !important;
}

/* 优化表格渲染 */
.el-table {
  contain: layout style paint;
}

.el-table__body-wrapper {
  contain: layout style paint;
}

.arm-label {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  min-width: 120px !important;
  flex-shrink: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  position: relative !important;
}

.arm-timeline-bar {
  position: relative !important;
  height: 20px !important;
  background: #F5F7FA !important;
  border-radius: 4px !important;
  overflow: hidden !important;
  flex: 1 !important;
  min-width: 0 !important;
  border: 1px solid #DCDFE6 !important;
  box-sizing: border-box !important;
  padding: 0 !important;
  margin: 0 !important;
  left: 0 !important;
  right: 0 !important;
}

/* 确保所有时间轴进度条完全对齐，基于容器左边偏移相同距离 */
.arm-item .arm-timeline-container .arm-timeline-bar,
.usage-group .arm-timeline-container .arm-timeline-bar {
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  width: 100% !important;
  max-width: none !important;
  position: relative !important;
}

/* 确保时间轴容器内的所有元素都基于相同的左边偏移 */
.arm-timeline-container .arm-label {
  position: relative !important;
  left: 0 !important;
}

.arm-timeline-container .arm-timeline-bar {
  position: relative !important;
  left: 0 !important;
}

/* 器械使用时间段的特殊样式 */
.arm-timeline-container .timeline-segment {
  opacity: 0.7; /* 降低透明度 */
  cursor: pointer;
  transition: all 0.3s ease;
}

.arm-timeline-container .timeline-segment:hover {
  opacity: 1; /* 悬停时高亮显示 */
  transform: scale(1.02);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

/* 网络延时统计卡片样式 */
.network-card {
  margin-top: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.network-summary {
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.network-chart-container {
  width: 100%;
  height: 300px;
  border-radius: 4px;
  overflow: hidden;
}

.network-no-data {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #909399;
}

/* 网络标签样式 */
.network-tag {
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
}

.network-tag:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

/* PostgreSQL数据预览样式 */
.postgresql-preview-section {
  margin-bottom: 20px;
  border: 1px solid #E4E7ED;
  border-radius: 6px;
  background-color: #FAFAFA;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: #F5F7FA;
  border-bottom: 1px solid #E4E7ED;
  border-radius: 6px 6px 0 0;
}

.preview-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.preview-content {
  padding: 16px;
}

.postgresql-textarea {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  background-color: #FFFFFF;
  border: 1px solid #DCDFE6;
  border-radius: 4px;
}

.postgresql-textarea :deep(.el-textarea__inner) {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  background-color: #FFFFFF;
  border: 1px solid #DCDFE6;
  border-radius: 4px;
  resize: vertical;
  min-height: 120px;
}

.preview-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

.preview-actions .el-button {
  font-size: 12px;
  padding: 6px 12px;
}

.preview-actions .el-button .el-icon {
  margin-right: 4px;
}

/* 数据预览区域的响应式设计 */
@media (max-width: 768px) {
  .preview-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .preview-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style> 
