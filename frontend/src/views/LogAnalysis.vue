<template>
  <div class="log-analysis-container">
    <el-card class="analysis-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-button @click="goBack" icon="ArrowLeft" size="small">
              返回
            </el-button>
            <span class="title">日志分析</span>
            <el-tag v-if="logInfo.original_name" type="info" size="small">
              {{ logInfo.original_name }}
            </el-tag>
          </div>
          <div class="header-right">
            <el-button @click="exportToCSV" type="success" size="small">
              <el-icon><Download /></el-icon>
              导出CSV
            </el-button>
            <el-button @click="showSurgeryStatistics" type="primary" size="small" style="margin-left: 10px;">
              <el-icon><DataAnalysis /></el-icon>
              手术分析
            </el-button>
          </div>
        </div>
      </template>

      <!-- 日志基本信息 -->
      <div class="log-info" v-if="logInfo.id">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="文件名">{{ logInfo.original_name }}</el-descriptions-item>
          <el-descriptions-item label="设备编号">{{ logInfo.device_id }}</el-descriptions-item>
          <el-descriptions-item label="文件大小">{{ formatFileSize(logInfo.size) }}</el-descriptions-item>
          <el-descriptions-item label="上传时间">{{ formatDate(logInfo.upload_time) }}</el-descriptions-item>
          <el-descriptions-item label="解析时间">{{ formatDate(logInfo.parse_time) }}</el-descriptions-item>
          <el-descriptions-item label="上传用户ID">{{ logInfo.uploader_id }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 搜索和筛选 -->
      <div class="search-section">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索释义内容或故障码"
          style="width: 300px; margin-right: 15px;"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-date-picker
          v-model="timeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          :disabled-date="disabledDate"
          style="width: 350px; margin-right: 15px;"
          @change="handleTimeRangeChange"
        />
        <el-tag v-if="timeRangeLimit" type="info" size="small" style="margin-left: 10px;">
          时间范围: {{ formatTimestamp(timeRangeLimit[0]) }} 至 {{ formatTimestamp(timeRangeLimit[1]) }}
        </el-tag>
        
        <el-button @click="clearFilters" type="info" size="small">
          清除筛选
        </el-button>
      </div>

      <!-- 日志条目表格 -->
      <div class="entries-section">
        <div class="section-header">
          <h3>日志条目 ({{ filteredEntries.length }})</h3>
        </div>

        <el-table 
          :data="paginatedEntries" 
          style="width: 100%"
          v-loading="loading"
          max-height="600"
          stripe
        >
          <el-table-column prop="timestamp" label="时间戳" width="180" sortable>
            <template #default="{ row }">
              {{ formatTimestamp(row.timestamp) }}
            </template>
          </el-table-column>
          <el-table-column prop="error_code" label="故障码" width="120" sortable />
          <el-table-column prop="param1" label="参数1" width="100" />
          <el-table-column prop="param2" label="参数2" width="100" />
          <el-table-column prop="param3" label="参数3" width="100" />
          <el-table-column prop="param4" label="参数4" width="100" />
          <el-table-column prop="explanation" label="释义" min-width="300" show-overflow-tooltip />
        </el-table>

        <!-- 分页 -->
        <div class="pagination-wrapper">
          <el-pagination
            :current-page="currentPage"
            :page-size="pageSize"
            :page-sizes="[50, 100, 200, 500]"
            :total="filteredEntries.length"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </div>
    </el-card>

    <!-- 手术统计对话框 -->
    <el-dialog 
      title="手术统计分析" 
      v-model="surgeryStatisticsVisible"
      width="90%"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div class="surgery-statistics-content">
        <!-- 分析按钮 -->
        <div class="analysis-section" v-if="!surgeryData">
          <el-card>
            <div class="analysis-content">
              <el-icon><DataAnalysis /></el-icon>
              <h3>分析当前日志的手术数据</h3>
              <p>将对当前日志文件进行手术统计分析</p>
              <el-button type="primary" @click="analyzeSurgeryData" :loading="analyzing">
                开始分析
              </el-button>
            </div>
          </el-card>
        </div>

        <!-- 手术统计内容 -->
        <div v-else>
          <!-- 导出按钮 -->
          <div class="export-section">
            <el-button type="primary" @click="exportSurgeryReport">
              <el-icon><Download /></el-icon>
              导出手术报告 PDF
            </el-button>
          </div>

          <!-- 手术时间信息 -->
          <div class="time-info">
            <el-row :gutter="20">
              <el-col :span="6">
                <div class="time-card">
                  <div class="time-icon power-on">
                    <el-icon><SwitchButton /></el-icon>
                  </div>
                  <div class="time-content">
                    <div class="time-label">开机时间</div>
                    <div class="time-value">{{ formatTime(surgeryData.power_on_time) }}</div>
                  </div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="time-card">
                  <div class="time-icon power-off">
                    <el-icon><Close /></el-icon>
                  </div>
                  <div class="time-content">
                    <div class="time-label">关机时间</div>
                    <div class="time-value">{{ formatTime(surgeryData.power_off_time) }}</div>
                  </div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="time-card">
                  <div class="time-icon surgery-start">
                    <el-icon><VideoPlay /></el-icon>
                  </div>
                  <div class="time-content">
                    <div class="time-label">手术开始时间</div>
                    <div class="time-value">{{ formatTime(surgeryData.surgery_start_time) }}</div>
                  </div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="time-card">
                  <div class="time-icon surgery-end">
                    <el-icon><VideoPause /></el-icon>
                  </div>
                  <div class="time-content">
                    <div class="time-label">手术结束时间</div>
                    <div class="time-value">{{ formatTime(surgeryData.surgery_end_time) }}</div>
                  </div>
                </div>
              </el-col>
            </el-row>
          </div>

          <!-- 工具臂使用统计 -->
          <div class="bg-white rounded-lg p-6 mb-6 border border-neutral-200">
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-lg font-semibold text-neutral-700">工具臂使用统计</h3>
              <div class="text-sm text-neutral-500">
                总手术时长: <span class="font-medium text-neutral-700">{{ surgeryData.total_duration }} 分钟</span>
              </div>
            </div>
            
            <!-- 主时间轴坐标轴 - 手术全程时间线 -->
            <div class="timeline-axis mb-8">
              <!-- 时间刻度 -->
              <div v-for="tick in getTimelineTicks(surgeryData.surgery_start_time, surgeryData.surgery_end_time)" :key="tick.time.getTime()">
                <div class="timeline-tick" :style="{ left: tick.position + '%' }"></div>
                <div class="timeline-label" :style="{ left: tick.position + '%' }">{{ formatTimeShort(tick.time) }}</div>
              </div>
              
              <!-- 全程时间线 -->
              <div class="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-neutral-200 to-neutral-300 rounded-full"></div>
              
              <!-- 手术阶段标记 -->
              <div class="absolute bottom-6 left-0 text-xs font-medium text-neutral-600 bg-white px-2 py-1 rounded-md shadow-sm border border-neutral-200">
                <i class="fa fa-play-circle mr-1 text-success"></i>手术开始
              </div>
              <div class="absolute bottom-6 right-0 text-xs font-medium text-neutral-600 bg-white px-2 py-1 rounded-md shadow-sm border border-neutral-200">
                <i class="fa fa-stop-circle mr-1 text-danger"></i>手术结束
              </div>
            </div>
            
            <!-- 工具臂时间线 -->
            <div class="relative pl-14">
              <div 
                v-for="(armUsage, index) in getArmUsages(surgeryData)" 
                :key="index"
                class="mb-10 relative"
              >
                <div class="timeline-line"></div>
                <div class="timeline-dot" :class="`tool-arm-${index + 1}`"></div>
                <div class="font-medium mb-4 flex items-center">
                  <span class="w-3 h-3 rounded-sm inline-block mr-2" :class="`tool-arm-${index + 1}`"></span>
                  工具臂 {{ index + 1 }}
                  <button class="toggle-details ml-3 px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-all duration-200 flex items-center border border-primary/20" @click="toggleArmDetails(index)">
                    <span>详情</span>
                    <i class="fa fa-chevron-down ml-1 transition-transform duration-300" :class="{ 'rotate-180': armDetailsVisible[index] }"></i>
                  </button>
                  <span class="ml-auto text-sm text-neutral-500">总激活时间: {{ getArmTotalTime(armUsage) }}</span>
                </div>
                
                <!-- 工具臂总激活时间 -->
                <div class="relative h-8 mb-1">
                  <div class="timeline-segment" :class="`tool-arm-${index + 1}`" :style="getArmTimelineStyle(armUsage, surgeryData)">
                    <div class="h-full flex items-center justify-center text-white text-xs font-medium">
                      激活中
                    </div>
                  </div>
                </div>
                
                <!-- 工具臂详细器械使用时间 -->
                <div v-show="armDetailsVisible[index]" class="tool-details ml-6 mt-4 space-y-6">
                  <div 
                    v-for="(usage, usageIndex) in armUsage" 
                    :key="usageIndex"
                    class="relative pl-4 border-l-2" :class="`border-${getArmColorClass(index)}/30`"
                  >
                    <div class="absolute left-[-6px] top-3 w-3 h-3 rounded-full" :class="`bg-${getArmColorClass(index)}`"></div>
                    <div class="mb-2">
                      <div class="text-sm font-medium">{{ usage.instrumentName }}</div>
                      <div class="text-xs text-neutral-500">UDI: {{ usage.udi }}</div>
                    </div>
                    <div class="relative h-6">
                      <div class="timeline-segment-sub" :class="`tool-arm-${index + 1}`" :style="getUsageTimelineStyle(usage, surgeryData)"></div>
                    </div>
                  </div>
                  
                  <!-- 能量激发时间 -->
                  <div class="text-sm text-neutral-500 mt-2 pl-1">
                    <i class="fa fa-bolt text-warning mr-1"></i> 能量激发总时间: {{ getEnergyTime(armUsage) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 安全报警信息 -->
          <el-card class="alarm-card">
            <template #header>
              <span>安全报警记录</span>
              <span class="alarm-count">
                报警总数: {{ surgeryData.alarm_count }}
              </span>
            </template>
          
            <el-table :data="getAlarmDetails(surgeryData)" stripe>
              <el-table-column prop="time" label="时间" width="150">
                <template #default="scope">
                  {{ formatTime(scope.row.time) }}
                </template>
              </el-table-column>
              <el-table-column prop="type" label="报警类型" width="100">
                <template #default="scope">
                  <el-tag :type="scope.row.type === '错误' ? 'danger' : 'warning'">
                    {{ scope.row.type }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="message" label="报警信息" />
              <el-table-column prop="status" label="处理状态" width="100">
                <template #default="scope">
                  <el-tag type="success">{{ scope.row.status }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <!-- 状态机变化曲线和脚踏/手离合统计 -->
          <el-row :gutter="20">
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>状态机变化曲线</span>
                </template>
                <div class="chart-container">
                  <canvas id="stateMachineChart"></canvas>
                </div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card class="chart-card">
                <template #header>
                  <span>脚踏和手离合信号统计</span>
                </template>
                <div class="chart-container">
                  <canvas id="footPedalChart"></canvas>
                </div>
                        
                <el-row :gutter="20" class="stats-grid">
                  <el-col :span="12">
                    <div class="stats-card">
                      <h4>脚踏信号</h4>
                      <ul>
                                                 <li>
                           <span>能量脚踏</span>
                           <span class="count">{{ surgeryData.foot_pedal_stats?.energy || 0 }}</span>
                         </li>
                         <li>
                           <span>离合脚踏</span>
                           <span class="count">{{ surgeryData.foot_pedal_stats?.clutch || 0 }}</span>
                         </li>
                         <li>
                           <span>镜头控制</span>
                           <span class="count">{{ surgeryData.foot_pedal_stats?.camera || 0 }}</span>
                         </li>
                      </ul>
                    </div>
                  </el-col>
                  <el-col :span="12">
                    <div class="stats-card">
                      <h4>手离合信号</h4>
                      <ul>
                                                   <li v-for="i in 4" :key="i">
                             <span>工具臂 {{ i }}</span>
                             <span class="count">{{ surgeryData.hand_clutch_stats?.[`arm${i}`] || 0 }}</span>
                           </li>
                      </ul>
                    </div>
                  </el-col>
                </el-row>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted, nextTick, reactive } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Download, ArrowLeft, DataAnalysis, SwitchButton, Close, VideoPlay, VideoPause, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
import api from '@/api'

export default {
  name: 'LogAnalysis',
  components: {
    Search,
    Download,
    ArrowLeft,
    DataAnalysis,
    SwitchButton,
    Close,
    VideoPlay,
    VideoPause,
    ArrowUp,
    ArrowDown
  },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    
    const logId = route.params.id
    const loading = ref(false)
    const logInfo = ref({})
    const logEntries = ref([])
    const searchKeyword = ref('')
    const timeRange = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(100)
    
    // 手术统计相关
    const surgeryStatisticsVisible = ref(false)
    const surgeryData = ref(null)
    const analyzing = ref(false)
    const armDetailsVisible = reactive({})
    
    // 图表实例
    let stateMachineChart = null
    let footPedalChart = null

    // 获取时间范围限制
    const timeRangeLimit = computed(() => {
      if (logEntries.value.length === 0) return null
      
      const timestamps = logEntries.value.map(entry => new Date(entry.timestamp))
      const minTime = new Date(Math.min(...timestamps))
      const maxTime = new Date(Math.max(...timestamps))
      
      return [minTime, maxTime]
    })

    // 过滤后的条目
    const filteredEntries = computed(() => {
      let entries = logEntries.value
      
      // 搜索过滤
      if (searchKeyword.value) {
        entries = entries.filter(entry => 
          entry.explanation.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
          entry.error_code.toLowerCase().includes(searchKeyword.value.toLowerCase())
        )
      }
      
      // 时间范围过滤
      if (timeRange.value && timeRange.value.length === 2) {
        const [startTime, endTime] = timeRange.value
        entries = entries.filter(entry => {
          const entryTime = new Date(entry.timestamp)
          const start = new Date(startTime)
          const end = new Date(endTime)
          return entryTime >= start && entryTime <= end
        })
      }
      
      return entries
    })

    // 分页后的条目
    const paginatedEntries = computed(() => {
      const start = (currentPage.value - 1) * pageSize.value
      const end = start + pageSize.value
      return filteredEntries.value.slice(start, end)
    })

    // 加载日志信息
    const loadLogInfo = async () => {
      try {
        loading.value = true
        const response = await store.dispatch('logs/fetchLogs', { page: 1, limit: 1000 })
        const log = response.data.logs.find(l => l.id == logId)
        if (log) {
          logInfo.value = log
        } else {
          ElMessage.error('日志不存在')
          goBack()
        }
      } catch (error) {
        ElMessage.error('加载日志信息失败')
      } finally {
        loading.value = false
      }
    }

    // 加载日志条目
    const loadLogEntries = async () => {
      try {
        loading.value = true
        const response = await store.dispatch('logs/fetchLogEntries', logId)
        logEntries.value = response.data?.entries || response.entries || []
        
        // 保存日志条目数据到sessionStorage
        try {
          const dataToSave = logEntries.value.map(entry => ({
            timestamp: entry.timestamp,
            error_code: entry.error_code,
            param1: entry.param1,
            param2: entry.param2,
            param3: entry.param3,
            param4: entry.param4,
            explanation: entry.explanation
          }))
          
          sessionStorage.setItem('logEntries', JSON.stringify(dataToSave))
        } catch (error) {
          ElMessage.warning('保存数据失败，可能影响手术分析功能')
        }
      } catch (error) {
        ElMessage.error('加载日志条目失败')
      } finally {
        loading.value = false
      }
    }

    // 搜索处理
    const handleSearch = () => {
      currentPage.value = 1
    }

    // 时间范围变化处理
    const handleTimeRangeChange = () => {
      currentPage.value = 1
    }

    // 禁用日期函数
    const disabledDate = (time) => {
      if (!timeRangeLimit.value) return false
      const [minTime, maxTime] = timeRangeLimit.value
      return time < minTime || time > maxTime
    }

    // 清除筛选
    const clearFilters = () => {
      searchKeyword.value = ''
      timeRange.value = null
      currentPage.value = 1
    }

    // 导出CSV
    const exportToCSV = () => {
      const headers = ['时间戳', '故障码', '参数1', '参数2', '参数3', '参数4', '释义']
      const csvContent = [
        headers.join(','),
        ...filteredEntries.value.map(entry => [
          formatTimestamp(entry.timestamp),
          entry.error_code,
          entry.param1,
          entry.param2,
          entry.param3,
          entry.param4,
          `"${entry.explanation.replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n')

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${logInfo.value.original_name}_analysis.csv`
      link.click()
      URL.revokeObjectURL(link.href)
      
      ElMessage.success('CSV文件导出成功')
    }

    // 分页处理
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
    }

    // 返回上一页
    const goBack = () => {
      router.go(-1)
    }

    // 跳转到手术统计页面
    const showSurgeryStatistics = () => {
      // 确保有已排序的日志条目数据
      if (logEntries.value.length === 0) {
        ElMessage.warning('请先加载日志条目数据')
        return
      }
      
      // 保存日志条目数据到sessionStorage
      try {
        const dataToSave = logEntries.value.map(entry => ({
          timestamp: entry.timestamp,
          error_code: entry.error_code,
          param1: entry.param1,
          param2: entry.param2,
          param3: entry.param3,
          param4: entry.param4,
          explanation: entry.explanation
        }))
        
        sessionStorage.setItem('logEntries', JSON.stringify(dataToSave))
        
        // 设置自动分析标志
        sessionStorage.setItem('autoAnalyze', 'true')
        
        // 在新窗口中打开手术统计页面
        const routeData = router.resolve({
          path: '/surgery-statistics',
          query: { logId: logId.value }
        })
        window.open(routeData.href, '_blank')
      } catch (error) {
        ElMessage.error('保存数据失败')
      }
    }

    // 分析手术数据
    const analyzeSurgeryData = async () => {
      analyzing.value = true
      try {
        const response = await api.surgeryStatistics.analyze(logId)
        // 如果返回的是数组，取第一个手术数据
        if (Array.isArray(response.data.data)) {
          surgeryData.value = response.data.data[0] || null
        } else {
          surgeryData.value = response.data.data
        }
        ElMessage.success('手术数据分析完成')
        nextTick(() => {
          initCharts()
        })
      } catch (error) {
        ElMessage.error('分析手术数据失败')
      } finally {
        analyzing.value = false
      }
    }

    // 导出手术报告
    const exportSurgeryReport = async () => {
      try {
        const response = await api.surgeryStatistics.exportReport(surgeryData.value.id)
        ElMessage.success('报告导出功能开发中')
      } catch (error) {
        ElMessage.error('导出报告失败')
      }
    }

    // 切换工具臂详情显示
    const toggleArmDetails = (armIndex) => {
      armDetailsVisible[armIndex] = !armDetailsVisible[armIndex]
    }

    // 获取工具臂使用情况
    const getArmUsages = (surgery) => {
      return [
        surgery.arm1_usage || [],
        surgery.arm2_usage || [],
        surgery.arm3_usage || [],
        surgery.arm4_usage || []
      ].map(usage => {
        if (typeof usage === 'string') {
          try {
            return JSON.parse(usage)
          } catch {
            return []
          }
        }
        return usage || []
      })
    }

    // 获取工具臂使用百分比
    const getArmUsagePercentage = (armUsage) => {
      if (!armUsage || armUsage.length === 0) return 0
      return Math.min(90, armUsage.length * 20)
    }

    // 获取工具臂颜色
    const getArmColor = (index) => {
      const colors = ['#165DFF', '#36BFFA', '#0FC6C2', '#FF7D00']
      return colors[index] || '#165DFF'
    }

    // 获取工具臂总时间
    const getArmTotalTime = (armUsage) => {
      if (!armUsage || armUsage.length === 0) return '0分钟'
      return `${armUsage.length * 15}分钟`
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

    // 获取工具臂颜色类
    const getArmColorClass = (index) => {
      const colors = ['primary', 'secondary', 'accent', 'warning']
      return colors[index] || 'primary'
    }

    // 格式化短时间
    const formatTimeShort = (time) => {
      if (!time) return '-'
      return new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    // 获取中间时间
    const getMidTime = (startTime, endTime, ratio) => {
      if (!startTime || !endTime) return '-'
      const start = new Date(startTime)
      const end = new Date(endTime)
      const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) * ratio)
      return mid.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
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

    // 初始化图表
    const initCharts = () => {
      if (!surgeryData.value) return

      // 状态机变化图表
      const stateMachineCtx = document.querySelector('#stateMachineChart')
      if (stateMachineCtx && surgeryData.value.state_machine_changes) {
        if (stateMachineChart) {
          stateMachineChart.destroy()
        }
        
        const stateData = surgeryData.value.state_machine_changes
        if (Array.isArray(stateData) && stateData.length > 0) {
          const labels = stateData.map(item => new Date(item.time).toLocaleTimeString())
          const data = stateData.map(item => item.state)
          
          stateMachineChart = new Chart(stateMachineCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                label: '系统状态',
                data,
                borderColor: '#165DFF',
                backgroundColor: 'rgba(22, 93, 255, 0.1)',
                fill: true,
                tension: 0.4,
                stepped: true
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: false,
                  min: 0,
                  max: 35,
                  ticks: {
                    stepSize: 5
                  }
                }
              }
            }
          })
        }
      }

      // 脚踏和手离合信号图表
      const footPedalCtx = document.querySelector('#footPedalChart')
      if (footPedalCtx) {
        if (footPedalChart) {
          footPedalChart.destroy()
        }
        
        const footPedalData = surgeryData.value.foot_pedal_stats || {}
        const handClutchData = surgeryData.value.hand_clutch_stats || {}
        
        footPedalChart = new Chart(footPedalCtx, {
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
                '#165DFF', '#36BFFA', '#0FC6C2', 
                '#165DFF80', '#36BFFA80', '#0FC6C280', '#FF7D0080'
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
      }
    }

    // 格式化函数
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const formatDate = (dateString) => {
      if (!dateString) return '-'
      return new Date(dateString).toLocaleString('zh-CN')
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

    onMounted(() => {
      loadLogInfo()
      loadLogEntries()
    })

    return {
      loading,
      logInfo,
      logEntries,
      searchKeyword,
      timeRange,
      currentPage,
      pageSize,
      filteredEntries,
      paginatedEntries,
      loadLogInfo,
      loadLogEntries,
      handleSearch,
      handleTimeRangeChange,
      clearFilters,
      exportToCSV,
      handleSizeChange,
      handleCurrentChange,
      goBack,
      showSurgeryStatistics,
      analyzeSurgeryData,
      exportSurgeryReport,
      toggleArmDetails,
      getArmUsages,
      getArmUsagePercentage,
      getArmColor,
      getArmTotalTime,
      getArmTimelineStyle,
      getUsageTimelineStyle,
      getEnergyTime,
      getArmColorClass,
      formatTimeShort,
      getMidTime,
      getTimePosition,
      getTimelineTicks,
      getAlarmDetails,
      formatTime,
      formatFileSize,
      formatDate,
      formatTimestamp,
      disabledDate,
      timeRangeLimit,
      surgeryStatisticsVisible,
      surgeryData,
      analyzing,
      armDetailsVisible
    }
  }
}
</script>

<style scoped>
.log-analysis-container {
  padding: 20px;
  height: 100vh;
  overflow: hidden;
}

.analysis-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  min-height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 18px;
  font-weight: bold;
}

.log-info {
  margin-bottom: 20px;
}

.search-section {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 6px;
}

.entries-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  max-height: calc(100vh - 300px);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-header h3 {
  margin: 0;
  color: #303133;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding: 10px 0;
}

/* 手术统计对话框样式 */
.surgery-statistics-content {
  max-height: 70vh;
  overflow-y: auto;
}

.analysis-section {
  margin: 40px 0;
}

.analysis-content {
  text-align: center;
  padding: 40px;
}

.analysis-content .el-icon {
  font-size: 48px;
  color: #165dff;
  margin-bottom: 16px;
}

.analysis-content h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: #1d2129;
}

.analysis-content p {
  margin: 0 0 24px 0;
  color: #86909c;
}

.export-section {
  text-align: right;
  margin-bottom: 20px;
}

.time-info {
  margin-bottom: 20px;
}

.time-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background: #f7f8fa;
  border-radius: 8px;
  border: 1px solid #e5e6eb;
}

.time-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: white;
}

.time-icon.power-on {
  background: #165dff;
}

.time-icon.power-off {
  background: #f53f3f;
}

.time-icon.surgery-start {
  background: #00b42a;
}

.time-icon.surgery-end {
  background: #ff7d00;
}

.time-content {
  flex: 1;
}

.time-label {
  font-size: 12px;
  color: #86909c;
  margin-bottom: 4px;
}

.time-value {
  font-size: 14px;
  font-weight: 500;
  color: #1d2129;
}

.arm-usage-card {
  margin-bottom: 20px;
}

.arm-usage-card .el-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total-duration {
  font-size: 14px;
  color: #86909c;
}

.arm-usage-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.arm-item {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
}

.arm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.arm-name {
  font-weight: 500;
  color: #1d2129;
}

.toggle-btn {
  color: #165dff;
}

.arm-progress {
  margin-bottom: 12px;
}

.progress-text {
  font-size: 12px;
  color: white;
}

.arm-details {
  border-top: 1px solid #e5e6eb;
  padding-top: 12px;
}

.usage-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f2f3f5;
}

.usage-item:last-child {
  border-bottom: none;
}

.usage-info {
  display: flex;
  flex-direction: column;
}

.instrument-name {
  font-weight: 500;
  color: #1d2129;
}

.udi-code {
  font-size: 12px;
  color: #86909c;
}

.usage-time {
  font-size: 12px;
  color: #86909c;
}

.alarm-card {
  margin-bottom: 20px;
}

.alarm-card .el-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.alarm-count {
  font-size: 14px;
  color: #86909c;
}

.chart-card {
  margin-bottom: 20px;
}

.chart-container {
  height: 300px;
  position: relative;
}

.stats-grid {
  margin-top: 20px;
}

.stats-card {
  background: #f7f8fa;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e5e6eb;
}

.stats-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #1d2129;
}

.stats-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.stats-card li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
}

.stats-card .count {
  font-weight: 500;
  color: #165dff;
}

/* 时间轴样式 */
.timeline-line {
  position: absolute;
  left: 3.5rem;
  top: 0;
  bottom: 0;
  width: 0.125rem;
  background-color: #E5E6EB;
}

.timeline-dot {
  position: absolute;
  left: 3.5rem;
  top: 0.75rem;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
  margin-left: -0.375rem;
  border: 2px solid #FFFFFF;
}

.timeline-axis {
  position: relative;
  height: 3rem;
  display: flex;
  align-items: flex-end;
  margin-bottom: 2rem;
  background: linear-gradient(to bottom, transparent 0%, transparent 80%, #E5E7EB 80%, #E5E7EB 100%);
  border-bottom: 2px solid #E5E7EB;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.timeline-tick {
  position: absolute;
  width: 0.25rem;
  height: 1rem;
  background-color: #9CA3AF;
  bottom: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.timeline-label {
  position: absolute;
  bottom: -2rem;
  font-size: 0.75rem;
  color: #4B5563;
  transform: translateX(-50%);
  font-weight: 500;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}

.timeline-segment {
  position: absolute;
  height: 1.5rem;
  border-radius: 9999px;
  transition: all 0.2s;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.timeline-segment:hover {
  opacity: 0.9;
}

.timeline-segment-sub {
  position: absolute;
  height: 1rem;
  border-radius: 9999px;
  transition: all 0.2s;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.timeline-segment-sub:hover {
  opacity: 0.9;
}

/* 工具臂颜色 */
.tool-arm-1 { background-color: #165DFF; }
.tool-arm-2 { background-color: #36BFFA; }
.tool-arm-3 { background-color: #0FC6C2; }
.tool-arm-4 { background-color: #FF7D00; }

/* 颜色定义 */
.text-primary { color: #165DFF; }
.text-secondary { color: #36BFFA; }
.text-accent { color: #0FC6C2; }
.text-warning { color: #FF7D00; }
.text-danger { color: #F53F3F; }
.text-success { color: #00B42A; }
.text-neutral { color: #4E5969; }

.bg-primary { background-color: #165DFF; }
.bg-secondary { background-color: #36BFFA; }
.bg-accent { background-color: #0FC6C2; }
.bg-warning { background-color: #FF7D00; }
.bg-danger { background-color: #F53F3F; }
.bg-success { background-color: #00B42A; }
.bg-neutral { background-color: #4E5969; }

.bg-primary\/10 { background-color: rgba(22, 93, 255, 0.1); }
.bg-secondary\/10 { background-color: rgba(54, 191, 250, 0.1); }
.bg-accent\/10 { background-color: rgba(15, 198, 194, 0.1); }
.bg-warning\/10 { background-color: rgba(255, 125, 0, 0.1); }
.bg-danger\/10 { background-color: rgba(245, 63, 63, 0.1); }
.bg-success\/10 { background-color: rgba(0, 180, 42, 0.1); }
.bg-neutral\/10 { background-color: rgba(78, 89, 105, 0.1); }

.border-primary { border-color: #165DFF; }
.border-secondary { border-color: #36BFFA; }
.border-accent { border-color: #0FC6C2; }
.border-warning { border-color: #FF7D00; }
.border-danger { border-color: #F53F3F; }
.border-success { border-color: #00B42A; }
.border-neutral { border-color: #4E5969; }

.border-primary\/30 { border-color: rgba(22, 93, 255, 0.3); }
.border-secondary\/30 { border-color: rgba(54, 191, 250, 0.3); }
.border-accent\/30 { border-color: rgba(15, 198, 194, 0.3); }
.border-warning\/30 { border-color: rgba(255, 125, 0, 0.3); }

/* 工具类 */
.flex { display: flex; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.space-x-2 > * + * { margin-left: 0.5rem; }
.space-y-6 > * + * { margin-top: 1.5rem; }

.mb-1 { margin-bottom: 0.25rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-6 { margin-bottom: 1.5rem; }
.mb-8 { margin-bottom: 2rem; }
.mb-10 { margin-bottom: 2.5rem; }

.mt-2 { margin-top: 0.5rem; }
.mt-4 { margin-top: 1rem; }

.ml-1 { margin-left: 0.25rem; }
.ml-2 { margin-left: 0.5rem; }
.ml-6 { margin-left: 1.5rem; }

.mr-1 { margin-right: 0.25rem; }
.mr-2 { margin-right: 0.5rem; }

.p-4 { padding: 1rem; }
.p-6 { padding: 1.5rem; }

.gap-4 { gap: 1rem; }

.w-3 { width: 0.75rem; }
.h-3 { height: 0.75rem; }
.h-6 { height: 1.5rem; }
.h-8 { height: 2rem; }

.text-xs { font-size: 0.75rem; }
.text-sm { font-size: 0.875rem; }
.text-lg { font-size: 1.125rem; }

.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }

.rounded { border-radius: 0.25rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-full { border-radius: 9999px; }
.rounded-sm { border-radius: 0.125rem; }

.border { border-width: 1px; }
.border-l-2 { border-left-width: 2px; }

.border-neutral-200 { border-color: #E5E6EB; }
.border-neutral-300 { border-color: #C9CDD4; }

.bg-white { background-color: #FFFFFF; }
.bg-neutral-50 { background-color: #F2F3F5; }

.text-white { color: #FFFFFF; }
.text-neutral-500 { color: #86909C; }
.text-neutral-600 { color: #4E5969; }
.text-neutral-700 { color: #1D2129; }

.relative { position: relative; }
.absolute { position: absolute; }

.left-0 { left: 0; }
.right-0 { right: 0; }
.bottom-0 { bottom: 0; }
.top-3 { top: 0.75rem; }

.transform { transform: translateZ(0); }
.-translate-x-1\/2 { transform: translateX(-50%); }
.-ml-1\.5 { margin-left: -0.375rem; }

.inline-block { display: inline-block; }

.hidden { display: none; }

.transition-transform { transition: transform 0.3s ease; }
.transition-all { transition: all 0.3s ease; }

.rotate-180 { transform: rotate(180deg); }

.hover\:underline:hover { text-decoration: underline; }

/* 详情按钮样式 */
.toggle-details {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.1) 0%, rgba(22, 93, 255, 0.05) 100%);
  border: 1px solid rgba(22, 93, 255, 0.2);
  box-shadow: 0 1px 3px rgba(22, 93, 255, 0.1);
  backdrop-filter: blur(4px);
}

.toggle-details:hover {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.15) 0%, rgba(22, 93, 255, 0.08) 100%);
  border-color: rgba(22, 93, 255, 0.3);
  box-shadow: 0 2px 6px rgba(22, 93, 255, 0.15);
  transform: translateY(-1px);
}
</style> 