<template>
  <div class="surgery-statistics-container">
    <!-- 页面标题和操作栏 -->
    <div class="action-bar">
      <div class="title-section">
        <h2 class="page-title">手术统计</h2>
        <p class="page-subtitle">查看和分析各场手术的详细统计数据</p>
      </div>
    </div>
    
    <!-- 分析按钮 -->
    <div class="analysis-section" v-if="!surgeries.length && !analyzing">
      <el-card class="empty-card">
        <div class="empty-content">
          <el-icon class="empty-icon"><Calendar /></el-icon>
          <h3>手术数据分析</h3>
          <p v-if="logEntriesCount > 0">
            检测到 {{ logEntriesCount }} 条日志条目数据，点击按钮开始分析
          </p>
          <p v-else>
            暂无日志条目数据，请先在批量分析或日志分析页面加载日志数据
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
          <h3>正在分析手术数据...</h3>
          <p>请稍候，系统正在处理日志条目数据</p>
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
          >
            <!-- 导出按钮 -->
            <div class="export-section">
              <el-button type="primary" @click="exportReport(surgery.id)">
                <el-icon><Download /></el-icon>
                导出手术报告 PDF
              </el-button>
              <el-button type="info" @click="debugSurgeryTimeData(surgery)" style="margin-left: 10px;">
                <el-icon><InfoFilled /></el-icon>
                调试时间数据
              </el-button>
            </div>
            
                        <!-- 手术信息布局 -->
            <div class="surgery-info-layout">
              <!-- 手术时间线 - 30%宽度 -->
              <div class="timeline-section">
                <el-card class="info-card">
                  <div class="info-header">
                    <div class="time">手术时间线</div>
                    <div class="badges">
                      <el-tag v-if="surgery.alarm_count > 0" type="danger" size="small">故障手术</el-tag>
                    </div>
                  </div>

                  <!-- 按时间顺序排序的时间线 -->
                  <el-timeline>
                    <el-timeline-item
                      v-for="(event, index) in getSortedTimelineEvents(surgery)"
                      :key="`event-${index}`"
                      :timestamp="formatTime(event.time)"
                      :color="event.color"
                      size="large"
                    >
                      <div class="timeline-content" :class="`timeline-${event.type}`">
                        <el-icon class="timeline-icon"><component :is="event.icon" /></el-icon>
                        <span class="timeline-text">{{ event.label }}</span>
                      </div>
                    </el-timeline-item>
                  </el-timeline>
                </el-card>
              </div>

              <!-- 手术状态变化图 - 70%宽度 -->
              <div class="state-chart-section">
                <el-card class="state-chart-card">
                  <div class="chart-header">
                    <div class="chart-title">手术状态机变化图</div>
                    <div class="chart-legend">
                      <div class="legend-item">
                        <div class="legend-color state-normal"></div>
                        <span>正常状态</span>
                      </div>
                      <div class="legend-item">
                        <div class="legend-color state-error"></div>
                        <span>故障状态</span>
                      </div>
                      <div class="legend-item">
                        <div class="legend-color state-shutdown"></div>
                        <span>关机状态</span>
                      </div>
                    </div>
                  </div>
                  

                </el-card>
              </div>
            </div>
                        
            <!-- 手术时长统计 -->
            <el-card class="arm-usage-card">
              <template #header>
                <div class="card-header">
                  <span>手术统计</span>
                  <el-tag type="info">总手术时长: {{ surgery.total_duration }} 分钟</el-tag>
                </div>
              </template>
              
              <!-- 统一时间轴视图 - 结合手术时长和工具臂使用 -->
              <div class="unified-timeline-view">
                <!-- 
                  设计理念：
                  1. 顶部：主时间轴坐标轴 - 显示手术全程时间刻度
                  2. 底部：工具臂时间线 - 显示各工具臂的激活时间段
                  
                  优势：
                  - 统一的时间基准，便于对比分析
                  - 直观显示工具臂使用与手术进程的对应关系
                  - 多层信息叠加，节省空间
                -->
                
                <!-- 手术时长进度条 - 参照 operationTIme.vue 样式 -->
                <div class="surgery-progress-container">
                  <!-- 手术时长信息 - 移动到前侧 -->
                  <div class="surgery-duration-info">
                    <span class="duration-text">手术时长：{{ surgery.total_duration }} 分钟</span>
                    <span class="time-range">手术时间：{{ formatTime(surgery.surgery_start_time) }} - {{ formatTime(surgery.surgery_end_time) }}</span>
                  </div>
                  
                  <!-- 手术时间轴容器 -->
                  <div class="surgery-timeline-wrapper">
                    <!-- 手术标签 -->
                    <div class="surgery-label">
                      <div class="surgery-color"></div>
                      <span class="surgery-name">手术时间段</span>
                    </div>
                    
                    <!-- 手术进度条 -->
                    <div class="surgery-timeline-container">
                      <div class="surgery-timeline-bar">
                        <div 
                          class="surgery-timeline-segment"
                          :style="getSurgeryTimelineStyle(surgery)"
                        >
                          <span class="surgery-segment-text">手术时间段</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 时间刻度标签 -->
                  <div class="progress-labels">
                    <span class="time-label">{{ formatTimeShort(getTimelineRange(surgery).start) }}</span>
                    <span class="time-label">{{ formatTimeShort(getTimelineRange(surgery).end) }}</span>
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
                       
                      </div>
                    </div>
                    
                    <!-- 工具臂总激活时间 -->
                    <div class="arm-timeline-container">
                      <div class="arm-label">
                        <div class="arm-color" :class="`arm-${index + 1}`"></div>
                        <span class="arm-name">工具臂 {{ index + 1 }}</span>
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
                    
                    <!-- 工具臂详细器械使用时间 -->
                    <el-collapse-transition>
                      <div v-show="armDetailsVisible[surgery.id + '_' + index]" class="arm-details">
                        <!-- 按UID码分组的器械使用 -->
                        <div 
                          v-for="(groupedUsage, udiCode) in getGroupedUsagesByUdi(armUsage)" 
                          :key="udiCode"
                          class="usage-group"
                        >
                          <div class="usage-group-header">
                            <div class="usage-group-info">
                              <div class="usage-group-name">
                                {{ groupedUsage.instrumentName }}
                                <el-tag v-if="hasPreSurgeryUsage(groupedUsage)" type="warning" size="small" style="margin-left: 8px;">
                                  手术前安装
                                </el-tag>
                              </div>
                              <div class="usage-group-udi">UDI: {{ udiCode }}</div>
                              <div class="usage-group-duration">总使用时长: {{ getGroupedUsageDuration(groupedUsage) }}</div>
                            </div>
                          </div>
                          
                          <!-- 使用与arm-timeline-container相同的容器结构，确保基于容器左边偏移相同距离 -->
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
                                  :content="`器械：${usage.instrumentName}\n时间：${formatTime(usage.startTime)} - ${formatTime(usage.endTime)}\n时长：${Math.floor((new Date(usage.endTime) - new Date(usage.startTime)) / 1000 / 60)}分钟${usage.is_pre_surgery ? '\n(手术前安装)' : ''}`"
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
                        
                        <!-- 能量激发时间 -->
                        <div class="energy-time">
                          <el-icon class="energy-icon"><Lightning /></el-icon>
                          器械总使用时间: {{ getEnergyTime(armUsage) }}
                        </div>
                      </div>
                    </el-collapse-transition>
                  </div>
                </div>
              </div>
            </el-card>
            
            <!-- 安全报警信息 -->
            <el-card class="alarm-card">
              <template #header>
                <span>安全报警记录</span>
              </template>
              
              <el-table :data="getAlarmDetails(surgery).slice(0, showAllAlarms[surgery.id] ? undefined : 5)" style="width: 100%">
                <el-table-column prop="time" label="时间" width="180">
                  <template #default="{ row }">
                    {{ formatTime(row.time) }}
                  </template>
                </el-table-column>
                <el-table-column prop="code" label="故障码" width="120">
                  <template #default="{ row }">
                    {{ row.code || row.error_code || '无' }}
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="报警信息" />
                <el-table-column prop="status" label="处理状态" width="120">
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
                  {{ showAllAlarms[surgery.id] ? '收起' : `展开更多 (${getAlarmDetails(surgery).length - 5}条)` }}
                </el-button>
              </div>
              
              <div class="alarm-summary">
                <el-tag type="danger">报警总数: {{ surgery.alarm_count || 0 }}</el-tag>
              </div>
            </el-card>
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
  Globe,
  InfoFilled,
  Loading
} from '@element-plus/icons-vue'
import { debounce, safeNextTick } from '@/utils/resizeObserverFix'

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
    Globe,
    InfoFilled,
    Loading
  },
  setup() {
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
        
        // 直接调用后端API进行分析，不需要前端加载所有数据
        const response = await api.surgeryStatistics.analyzeByLogIds(logIds)
        
        if (response.data.success) {
          surgeries.value = response.data.data || []
          
          if (surgeries.value.length > 0) {
            activeTab.value = surgeries.value[0].id.toString()
            surgeries.value.forEach(surgery => {
              armDetailsVisible[surgery.id] = false
              showAllAlarms[surgery.id] = false
            })

          }
          
          ElMessage.success(response.data.message || `成功分析出 ${surgeries.value.length} 场手术`)
        } else {
          ElMessage.error(response.data.message || '分析失败')
        }
        
      } catch (error) {
        ElMessage.error('分析批量日志数据失败: ' + (error.response?.data?.message || error.message))
      } finally {
        analyzing.value = false
      }
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
        

        
        // 调用新的API端点，传递已排序的日志条目数据
        const response = await api.surgeryStatistics.analyzeSortedEntries(analysisData)
        
        if (response.data.success) {
          surgeries.value = response.data.data || []
          
          
          
          if (surgeries.value.length > 0) {
            activeTab.value = surgeries.value[0].id.toString()
            surgeries.value.forEach(surgery => {
              armDetailsVisible[surgery.id] = false
              showAllAlarms[surgery.id] = false
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

    // 切换报警记录显示
    const toggleAlarms = (surgeryId) => {
      showAllAlarms[surgeryId] = !showAllAlarms[surgeryId]
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

    // 格式化时间（24小时制）
    const formatTime = (time) => {
      if (!time) return '-'
      const date = new Date(time)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    // 格式化手术时间范围
    const formatSurgeryTime = (surgery) => {
      if (!surgery.surgery_start_time || !surgery.surgery_end_time) {
        return '手术时间未确定'
      }
      const start = new Date(surgery.surgery_start_time).toLocaleString()
      const end = new Date(surgery.surgery_end_time).toLocaleString()
      return `${start} ~ ${end}`
    }

    // 格式化短时间（24小时制）
    const formatTimeShort = (time) => {
      if (!time) return '-'
      const date = new Date(time)
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${hours}:${minutes}`
    }

    // 获取统一的时间轴范围（确保所有时间计算使用相同基准）
    const getTimelineRange = (surgery) => {
      if (!surgery) return { start: null, end: null }
      
      // 获取开机时间
      const powerOnTime = getPowerOnTime(surgery)
      
      // 获取手术结束时间
      const surgeryEndTime = surgery.surgery_end_time
      
      // 获取关机时间
      const powerOffTime = getPowerOffTime(surgery)
      
      // 确定时间轴起点：优先使用开机时间，如果没有则使用手术开始时间
      let start = powerOnTime
      if (!start && surgery.surgery_start_time) {
        start = surgery.surgery_start_time
      }
      
      // 确定时间轴终点：优先使用手术结束时间，如果没有则使用关机时间
      let end = surgeryEndTime
      if (!end && powerOffTime) {
        end = powerOffTime
      }
      
      // 如果仍然没有结束时间，使用最后一条日志的时间
      if (!end && surgery.last_log_time) {
        end = surgery.last_log_time
      }
      
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
          // 如果时间范围异常，使用手术开始和结束时间
          if (surgery.surgery_start_time && surgery.surgery_end_time) {
            start = surgery.surgery_start_time
            end = surgery.surgery_end_time
          }
        }
      }
      
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
      
      // 使用统一的时间轴范围
      const timelineRange = getTimelineRange(surgery)
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
      
      // 使用统一的时间轴范围
      const timelineRange = getTimelineRange(surgery)
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
      
      // 使用统一的时间轴范围
      const timelineRange = getTimelineRange(surgery)
      if (!timelineRange.start || !timelineRange.end) {
        return { left: '0%', width: '0%' }
      }
      
      const startPosition = getTimePosition(surgery.surgery_start_time, timelineRange.start, timelineRange.end)
      const endPosition = getTimePosition(surgery.surgery_end_time, timelineRange.start, timelineRange.end)
      const width = Math.max(0, endPosition - startPosition)
      
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
      
      // 使用统一的时间轴范围，确保与arm-timeline-bar完全对齐
      const timelineRange = getTimelineRange(surgery)
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
      
      // 计算所有完整使用时间段的总时长
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
      
      // 优先使用手术结束时间作为时间轴终点
      if (surgery.surgery_end_time) {
        return surgery.surgery_end_time
      }
      
      // 如果有关机时间数组，返回最后一个（最晚的关机时间）
      if (surgery.shutdown_times && surgery.shutdown_times.length > 0) {
        return surgery.shutdown_times[surgery.shutdown_times.length - 1]
      }
      
      // 兼容旧版本：如果有单个关机时间，直接使用
      if (surgery.power_off_time) {
        return surgery.power_off_time
      }
      
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
      powerOnTimes.forEach((time, index) => {
        events.push({
          time: new Date(time),
          type: 'powerOn',
          label: powerOnTimes.length > 1 ? `开机 ${index + 1}` : '开机',
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
      
      const timelineRange = getTimelineRange(surgery)
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

    // 检查分组中是否有手术前安装的器械
    const hasPreSurgeryUsage = (groupedUsage) => {
      if (!groupedUsage || !groupedUsage.usages) return false
      return groupedUsage.usages.some(usage => usage.is_pre_surgery === true)
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
      
      // 获取时间轴范围
      const timelineRange = getTimelineRange(surgery)
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



    // 生命周期
    onMounted(async () => {
      
      try {
        // 检查URL参数中是否有批量日志ID需要分析
        const logIdsParam = route.query.logIds
        if (logIdsParam) {
          try {
            const logIds = logIdsParam.split(',').map(id => parseInt(id))
            if (logIds && logIds.length > 0) {
              // 自动分析批量日志数据
              await loadBatchLogEntriesByIds()
              return // 如果进行了批量分析，就不需要继续检查其他数据
            }
          } catch (error) {
            console.error('解析URL参数中的日志ID失败:', error)
          }
        }
        
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
        
        // 检查是否需要自动分析
        const autoAnalyze = sessionStorage.getItem('autoAnalyze')
        const autoAnalyzeLogId = sessionStorage.getItem('autoAnalyzeLogId')
        if (autoAnalyze === 'true' && autoAnalyzeLogId) {
          sessionStorage.removeItem('autoAnalyze') // 清除标志
          sessionStorage.removeItem('autoAnalyzeLogId') // 清除日志ID
          // 延迟一下确保页面完全加载
          setTimeout(() => {
            // 使用日志ID进行分析，而不是传递大量日志条目数据
            loadBatchLogEntriesByIds()
          }, 1000)
        }
      } catch (error) {
        console.error('页面初始化错误:', error)
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
        exportReport,
        toggleArmDetails,
        toggleAlarms,
        getArmUsages,
        getArmTotalTime,
        getArmTimelineStyle,
              getArmTimelineSegments,
      getSurgeryTimelineStyle,
      getUsageTimelineStyle,
        getEnergyTime,
        getAlarmTypeTag,
        getAlarmDetails,
        formatTime,
        formatSurgeryTime,
        formatTimeShort,
        getTimePosition,
        getTimelineTicks,
        handleTabClick,
        getAnalysisButtonText,
        getTimeRange,
        loadBatchLogEntriesByIds,
        getPowerOnTime,
        getPowerOffTime,
        getAllPowerOnTimes,
        getAllPowerOffTimes,
        getSurgeryTimelineStyle,
        getGroupedUsagesByUdi,
        getGroupedUsageDuration,
        hasPreSurgeryUsage,
        getSegmentText,
        getTimelineRange,
        getSegmentInstrumentName,
        getSortedTimelineEvents,
        getStateChanges,
        getStateName,
        getStateBarHeight,
        getStateBarPosition,
        handleBeforeTabLeave,

        // 调试函数：检查手术时间数据
        debugSurgeryTimeData: (surgery) => {
          if (!surgery) return;
          
          console.log('=== 手术时间数据调试 ===');
          console.log('手术ID:', surgery.surgery_id);
          console.log('开机时间:', surgery.power_on_times);
          console.log('关机时间:', surgery.shutdown_times);
          console.log('手术开始时间:', surgery.surgery_start_time);
          console.log('手术结束时间:', surgery.surgery_end_time);
          console.log('最后日志时间:', surgery.last_log_time);
          
          // 检查开机时间数据
          const powerOnTimes = getAllPowerOnTimes(surgery);
          console.log('解析的开机时间:', powerOnTimes);
          console.log('开机时间数量:', powerOnTimes.length);
          
          // 检查关机时间数据
          const powerOffTimes = getAllPowerOffTimes(surgery);
          console.log('解析的关机时间:', powerOffTimes);
          console.log('关机时间数量:', powerOffTimes.length);
          
          // 检查时间线事件
          const timelineEvents = getSortedTimelineEvents(surgery);
          console.log('时间线事件:', timelineEvents);
          console.log('时间线事件数量:', timelineEvents.length);
          
          const timelineRange = getTimelineRange(surgery);
          console.log('计算的时间轴范围:', timelineRange);
          
          if (timelineRange.start && timelineRange.end) {
            const startTime = new Date(timelineRange.start);
            const endTime = new Date(timelineRange.end);
            const duration = endTime.getTime() - startTime.getTime();
            
            console.log('时间轴详细信息:', {
              start: startTime.toISOString(),
              end: endTime.toISOString(),
              duration: Math.floor(duration / 1000 / 60) + '分钟',
              isCrossDay: startTime.getDate() !== endTime.getDate() || 
                         startTime.getMonth() !== endTime.getMonth() || 
                         startTime.getFullYear() !== endTime.getFullYear()
            });
          }
          
          console.log('=== 调试结束 ===');
        }

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
  width: 30%;
  flex-shrink: 0;
}

.state-chart-section {
  width: 70%;
  flex-shrink: 0;
}

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

/* 时间线样式 */
.el-timeline {
  padding: 0;
  flex: 1;
  overflow-y: auto;
  /* 确保时间线圆点不被遮挡 */
  padding-left: 8px;
}

.el-timeline-item {
  padding-bottom: 15px;
  /* 确保时间线节点有足够空间 */
  padding-left: 5px;
}

.el-timeline-item:last-child {
  padding-bottom: 0;
}

/* 确保时间线圆点完全可见 */
:deep(.el-timeline-item__node) {
  z-index: 4;
  position: relative;
  /* 确保圆点不被遮挡 */
  margin-left: 7px;
}

:deep(.el-timeline-item__node--large) {
  width: 10px;
  height: 10px;
}

/* 确保时间线连接线不被遮挡 */
:deep(.el-timeline-item__tail) {
  z-index: 5;
  position: relative;
}

/* 确保时间线内容区域有足够空间 */
:deep(.el-timeline-item__wrapper) {
  padding-left: 8px;
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
  height: 120px;
  background-color: #FAFAFA;
  border-radius: 6px;
  border: 1px solid #E4E7ED;
  overflow: visible;
  flex: 1;
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
  gap: 20px;
  margin-top: 20px;
  position: relative;
  z-index: 2;
  /* 优化渲染性能 */
  contain: layout style paint;
}

.arm-item {
  border: 1px solid #E4E7ED;
  border-radius: 8px;
  padding: 16px;
  background-color: #FAFAFA;
  margin-bottom: 16px;
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

.arm-timeline-container {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  /* 确保对齐 */
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
  gap: 8px;
  min-width: 120px;
  flex-shrink: 0;
  padding: 0;
  margin: 0;
  /* 确保对齐 */
  position: relative;
}

.arm-timeline-bar {
  position: relative;
  height: 20px;
  background: #F5F7FA;
  border-radius: 4px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  border: 1px solid #DCDFE6;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  /* 确保对齐 */
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
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
  text-align: center;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  min-height: 20px;
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


</style> 