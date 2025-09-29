
<template>
  <div class="viz-page">
    <!-- 顶部标题卡片 -->
    <el-card class="title-card">
          <div class="surgery-info">
        <span class="surgery-id">{{ meta.surgery_id || '-' }}</span>
        <el-tag v-if="meta.is_remote" color="green" size="small" class="surgery-tag">远程手术</el-tag>
        <el-tag v-if="meta.is_fault" color="red" size="small" class="surgery-tag fault-tag">故障手术</el-tag>
          </div>
    </el-card>

    <!-- 手术概况卡片 -->
    <el-card class="overview-card">
      <div class="section-header">
        手术概况
        <div class="zoom-controls">
          <button @click="resetZoom" class="zoom-reset-btn">重置缩放</button>
          <span class="zoom-level">{{ Math.round(zoomLevel * 100) }}%</span>
        </div>
      </div>
      <div 
        class="timeline-container"
        @wheel="handleWheel"
      >
        <!-- 表格头部 -->
        <div class="timeline-header">
          <div class="arm-column">活动名称</div>
          <div class="time-columns" :style="getTimeColumnsStyle()">
            <div 
              v-for="(_, index) in Array(getTotalHours()).fill(0)" 
              :key="index" 
              class="time-column"
              :style="getTimeColumnStyle()"
            >
              {{ getTimeColumnText(index) }}
            </div>
          </div>
        </div>
        
        <!-- SVG覆盖层 -->
        <svg 
          class="timeline-overlay" 
          :style="getOverlayStyle()"
          @click="handleOverlayClick"
        >
          
          <!-- 器械使用颜色条 -->
          <g v-for="arm in armsData" :key="`arm-${arm.arm_id}`">
            <g v-for="segment in getAllSegmentsForArm(arm)" :key="`segment-${segment.udi}-${segment.start}`">
              <!-- 器械段矩形 -->
            <rect 
              :x="getSegmentX(segment)"
              :y="getSegmentY(arm, segment)"
              :width="getSegmentWidth(segment)"
              :height="getSegmentHeight()"
                :fill="getArmColor(arm.arm_id)"
                :stroke="getArmColor(arm.arm_id)"
              stroke-width="1"
              rx="3"
              ry="3"
              class="instrument-segment-svg"
              @click="handleSegmentClick(segment, $event)"
              @mouseenter="handleSegmentHover(segment, $event)"
              @mouseleave="handleSegmentLeave(segment, $event)"
            />
              <!-- 器械类型文本 -->
              <text 
                v-if="shouldShowInstrumentText(segment)"
                :x="getSegmentTextX(segment)"
                :y="getSegmentTextY(arm, segment)"
                text-anchor="middle"
                class="instrument-text"
                :fill="getTextColor(arm.arm_id)"
                @click="handleSegmentClick(segment, $event)"
                @mouseenter="handleSegmentHover(segment, $event)"
                @mouseleave="handleSegmentLeave(segment, $event)"
              >
                {{ getInstrumentDisplayName(segment) }}
              </text>
            </g>
          </g>
          
        </svg>

        <!-- 自定义Tooltip -->
        <div 
          v-if="hoveredSegment"
          class="custom-tooltip"
          :style="getTooltipStyle()"
        >
          <div class="tooltip-title">{{ getSegmentTooltipTitle(hoveredSegment) }}</div>
          <div class="tooltip-content">
            <div>UDI码: {{ hoveredSegment.udi || '无UDI' }}</div>
            <div>使用时长: {{ getSegmentDuration(hoveredSegment) }}分钟</div>
            <div>安装时刻: {{ formatSegmentTime(hoveredSegment.install_time || hoveredSegment.start_time) }}</div>
            <div>拔下时刻: {{ formatSegmentTime(hoveredSegment.remove_time || hoveredSegment.end_time) }}</div>
          </div>
        </div>
        
        <!-- 表格主体 -->
        <div class="timeline-body">
          <div 
            v-for="arm in armsData" 
            :key="arm.arm_id" 
            class="timeline-row"
          >
            <div class="arm-cell">{{ arm.name }}</div>
            <div class="time-cells" :style="getTimeCellsStyle()">
              <div 
                v-for="(_, index) in Array(getTotalHours()).fill(0)" 
                :key="index" 
                class="time-grid"
                :class="{ 'has-instrument': hasInstrumentInHour(arm, index) }"
                :style="getTimeGridStyle()"
              >
                <!-- 时间线事件标记 -->
                <div 
                  v-if="arm.arm_id === 0 && hasEventInHour(index)"
                  class="timeline-event-container"
                  :style="getEventStyle(index)"
                >
                  <!-- 事件符号和标签 -->
                  <div 
                    v-for="(event, eventIndex) in getEventsInHour(index)"
                    :key="`${event.type}-${eventIndex}`"
                  class="timeline-event"
                    :class="getEventClass(event.type)"
                    :title="getEventTooltip(event)"
                    :data-merged="event.isMerged"
                  >
                    <!-- 事件符号 -->
                    <div class="event-symbol" :class="getSymbolClass(event.symbol)">
                      <div v-if="event.symbol === 'circle'" class="circle-shape"></div>
                      <div v-else class="square-shape"></div>
                    </div>
                    <!-- 事件名称标签 -->
                    <div class="event-label">{{ event.name }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 图表分析卡片 -->
    <el-card class="charts-card" v-if="showCharts">
      <div class="section-header">
        手术分析图表
      </div>
      <div class="charts-container">
        <!-- 左图：手术状态机变化 -->
        <div class="chart-item">
          <div class="chart-title">手术状态机变化</div>
          <div ref="stateMachineChart" class="chart"></div>
        </div>
        
        <!-- 右图：网络延迟情况 -->
        <div class="chart-item" v-if="meta.is_remote">
          <div class="chart-title">网络延迟情况</div>
          <div ref="networkLatencyChart" class="chart"></div>
        </div>
      </div>
    </el-card>

    <!-- 安全报警记录卡片 -->
    <el-card class="faults-card" v-if="showCharts && meta.is_fault && faultRecords.length > 0">
      <div class="section-header">
        安全报警记录
      </div>
      <div class="faults-container">
        <el-table 
          :data="faultRecords" 
          stripe 
          border 
          size="small"
          :max-height="400"
          class="faults-table"
        >
          <el-table-column prop="timestamp" label="故障发生时间" width="180" align="center">
            <template #default="{ row }">
              <span class="fault-time">{{ formatFaultTime(row.timestamp) }}</span>
            </template>
          </el-table-column>
          
          <el-table-column prop="error_code" label="故障码" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="getFaultType(row.error_code)" size="small">
                {{ row.error_code }}
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column prop="explanation" label="故障释义" min-width="200">
            <template #default="{ row }">
              <span class="fault-explanation">{{ row.explanation || '无详细说明' }}</span>
            </template>
          </el-table-column>
          
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag 
                :type="row.status === '已处理' ? 'success' : 'danger'" 
                size="small"
                effect="dark"
              >
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        
        <div class="faults-summary" v-if="faultRecords.length > 0">
          <el-alert
            :title="`共发现 ${faultRecords.length} 个故障，其中 ${getProcessedCount()} 个已处理，${getUnprocessedCount()} 个未处理`"
            type="info"
            :closable="false"
            show-icon
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api'
import { normalizeSurgeryData as normalize } from '../utils/visualizationConfig'
import { formatTime, loadServerTimezone } from '../utils/timeFormatter'
import * as echarts from 'echarts'

export default {
  name: 'SurgeryVisualization',
  setup() {
    // 移除不需要的图表引用

    const loading = ref(false)
    const surgeryIdInput = ref('')
    const route = useRoute()

    const meta = reactive({ surgery_id: null, start_time: null, end_time: null, is_remote: false, is_fault: false })
    const alertRows = ref([])
    const showAllAlerts = ref(false)
    const currentData = ref(null)
    const armsData = ref([
      { name: '手术时间线', arm_id: 0, segments: [] },
      { name: '1号臂', arm_id: 1, segments: [] },
      { name: '2号臂', arm_id: 2, segments: [] },
      { name: '3号臂', arm_id: 3, segments: [] },
      { name: '4号臂', arm_id: 4, segments: [] }
    ])
    
    // 时间线事件数据
    const timelineEvents = ref([])
    
    // 时间基准：第一次开机时间往前推1小时
    const timelineBaseTime = ref(null)
    
    // 当前悬停的器械段
    const hoveredSegment = ref(null)
    const tooltipPosition = ref({ x: 0, y: 0 })
    
    // 缩放控制
    const zoomLevel = ref(1) // 缩放级别，1为正常大小（撑满容器）
    const minZoom = 1 // 最小缩放（默认视图，撑满容器）
    const maxZoom = 5 // 最大缩放
    
    // 图表相关
    const showCharts = ref(false)
    const stateMachineChart = ref(null)
    const networkLatencyChart = ref(null)
    const stateMachineChartInstance = ref(null)
    const networkLatencyChartInstance = ref(null)
    
    // 故障记录相关
    const faultRecords = ref([])
    
    // 计算需要显示的小时数（基于所有事件的实际小时数范围）
    const getTotalHours = () => {
      if (timelineEvents.value.length === 0) return 24 // 默认24小时
      
      let minHour = Infinity
      let maxHour = -Infinity
      
      // 遍历所有事件，找到最小和最大小时数
      timelineEvents.value.forEach(event => {
        const eventHour = getHourFromTime(event.time)
        if (eventHour !== null && eventHour !== undefined) {
          minHour = Math.min(minHour, eventHour)
          maxHour = Math.max(maxHour, eventHour)
        }
      })
      
      // 如果没有有效事件，返回默认值
      if (minHour === Infinity || maxHour === -Infinity) return 24
      
      // 前后各扩展1小时：(最早事件-1h) 到 (最晚事件+1h)
      const startHour = minHour - 1
      const endHour = maxHour + 1
      const totalHours = endHour - startHour + 1
      
      // 最多显示48小时，不设置最小限制
      return Math.min(48, totalHours)
    }
    
    // 获取表头起始小时（最早事件-1）
    const getTableStartHour = () => {
      if (timelineEvents.value.length === 0) return 0
      
      let minHour = Infinity
      timelineEvents.value.forEach(event => {
        const eventHour = getHourFromTime(event.time)
        if (eventHour !== null && eventHour !== undefined) {
          minHour = Math.min(minHour, eventHour)
        }
      })
      
      return minHour === Infinity ? 0 : minHour - 1
    }
    
    // 获取实际的小时数范围（用于调试）
    const getHourRange = () => {
      if (timelineEvents.value.length === 0) return { start: 0, end: 23 }
      
      let minHour = Infinity
      let maxHour = -Infinity
      
      timelineEvents.value.forEach(event => {
        const eventHour = getHourFromTime(event.time)
        if (eventHour !== null && eventHour !== undefined) {
          minHour = Math.min(minHour, eventHour)
          maxHour = Math.max(maxHour, eventHour)
        }
      })
      
      if (minHour === Infinity || maxHour === -Infinity) return { start: 0, end: 23 }
      
      return {
        start: minHour - 1,
        end: maxHour + 1
      }
    }
    
    // 获取小时数偏移量（用于表头显示）
    const getHourOffset = () => {
      if (timelineEvents.value.length === 0) return 0
      
      let minHour = Infinity
      timelineEvents.value.forEach(event => {
        const eventHour = getHourFromTime(event.time)
        if (eventHour !== null && eventHour !== undefined) {
          minHour = Math.min(minHour, eventHour)
        }
      })
      
      // 返回最早事件前1小时
      return minHour === Infinity ? 0 : minHour - 1
    }

    // 检查某个小时是否有器械使用
    const hasInstrumentInHour = (arm, hour) => {
      if (arm.arm_id === 0) return false // 手术时间线不显示器械
      
      // 获取表头起始小时
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      
      const hasInstrument = arm.segments.some(segment => {
        const startHour = getHourFromTime(segment.start_time || segment.start || segment.install_time)
        const endHour = getHourFromTime(segment.end_time || segment.end || segment.remove_time)
        return actualHour >= startHour && actualHour <= endHour
      })
      
      
      return hasInstrument
    }
    
    // 获取某个小时内的器械使用段
    const getSegmentsInHour = (arm, hour) => {
      if (arm.arm_id === 0) return []
      
      // 获取表头起始小时
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      
      const segments = arm.segments.filter(segment => {
        const startHour = getHourFromTime(segment.start_time || segment.start || segment.install_time)
        const endHour = getHourFromTime(segment.end_time || segment.end || segment.remove_time)
        
        
        return actualHour >= startHour && actualHour <= endHour
      })
      
      
      return segments
    }
    
    // 获取器械区块样式
    const getSegmentStyle = (segment, hour) => {
      // 获取表头起始小时
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      
      // 计算在小时内的位置和宽度
      const hourStart = actualHour * 60 // 分钟
      const hourEnd = (actualHour + 1) * 60
      const segmentStart = getMinutesFromTime(segment.start_time || segment.start || segment.install_time)
      const segmentEnd = getMinutesFromTime(segment.end_time || segment.end || segment.remove_time)
      
      const left = Math.max(0, (segmentStart - hourStart) / 60 * 100)
      const right = Math.max(0, (hourEnd - segmentEnd) / 60 * 100)
      
      
      return {
        left: `${left}%`,
        right: `${right}%`,
        backgroundColor: getInstrumentColor(segment.tool_type || segment.instrument_type || ''),
        zIndex: 10 // 确保器械使用区块在时间线事件之上
      }
    }
    
    // 获取器械区块提示信息
    const getSegmentTooltip = (segment) => {
      const duration = calculateDuration(segment.start || segment.install_time || segment.start_time, 
                                       segment.end || segment.remove_time || segment.end_time)
      const toolType = segment.tool_type || segment.instrument_type || '未知器械'
      const udi = segment.udi || '无UDI'
      
      // 转换UTC时间为本地时间显示
      const installTime = segment.install_time || segment.start_time
      const removeTime = segment.remove_time || segment.end_time
      
      const formatTime = (timeStr) => {
        if (!timeStr) return '未知'
        const localTime = getLocalTime(timeStr)
        if (!localTime) return '未知'
        return localTime.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      }
      
      return `${toolType}\n\nUDI码: ${udi}\n使用时长: ${duration}分钟\n安装时刻: ${formatTime(installTime)}\n拔下时刻: ${formatTime(removeTime)}`
    }
    
    // ========== SVG覆盖层相关函数 ==========
    
    // 获取SVG覆盖层样式
    const getOverlayStyle = () => {
      if (zoomLevel.value === 1) {
        // 默认视图：撑满容器宽度
      return {
        position: 'absolute',
        top: '0',
        left: '120px', // 偏移arm-column的宽度
        width: 'calc(100% - 120px)', // 减去arm-column宽度
        height: '100%',
        pointerEvents: 'auto',
          zIndex: '20'
        }
      } else {
        // 缩放视图：与HTML表格缩放保持一致
        const totalHours = getTotalHours()
        const containerWidth = window.innerWidth - 120
        const baseColumnWidth = containerWidth / totalHours
        const scaledColumnWidth = baseColumnWidth * zoomLevel.value
        const scaledWidth = scaledColumnWidth * totalHours
        
        return {
          position: 'absolute',
          top: '0',
          left: '120px',
          width: `${scaledWidth}px`,
          height: '100%',
          pointerEvents: 'auto',
          zIndex: '20'
        }
      }
    }
    
    // 获取所有器械使用段（用于SVG显示）
    const getAllSegmentsForArm = (arm) => {
      if (arm.arm_id === 0) return [] // 手术时间线不显示器械
      
      
      return arm.segments || []
    }
    
    // 获取器械段的X坐标（使用百分比定位，支持跨天）
    const getSegmentX = (segment) => {
      const startTime = segment.start_time || segment.start || segment.install_time
      const localTime = getLocalTime(startTime)
      if (!localTime) return 0
      
      
      // 使用本地时间计算位置
      const localHour = getHourFromTime(startTime)
      const localMinute = getMinutesFromTime(startTime)
      
      // 获取表格起始小时
      const tableStartHour = getTableStartHour()
      
      // 计算器械在时间轴中的位置（相对于单元格）
      const hourIndex = localHour - tableStartHour
      const minuteOffset = localMinute / 60 // 分钟偏移量（0-1之间）
      
      // 计算总的小时数
      const totalHours = getTotalHours()
      
      // 计算器械位置：基于SVG实际宽度
      // 器械时间16:32 -> 在16点单元格内，距离16:00有32分钟
      // 位置 = 单元格索引 + 单元格内偏移
      const timelineContainer = document.querySelector('.timeline-container')
      let containerWidth
      
      if (zoomLevel.value === 1) {
        // 默认视图：使用容器实际宽度
        containerWidth = timelineContainer ? timelineContainer.offsetWidth - 120 : window.innerWidth - 120
      } else {
        // 缩放视图：使用缩放后的宽度
        const baseContainerWidth = window.innerWidth - 120
        const baseColumnWidth = baseContainerWidth / totalHours
        const scaledColumnWidth = baseColumnWidth * zoomLevel.value
        containerWidth = scaledColumnWidth * totalHours
      }
      
      // 计算在时间轴中的百分比位置
      const totalPosition = (hourIndex + minuteOffset) / totalHours
      const percentagePosition = totalPosition * 100
      
      // 将百分比转换为像素位置
      const x = (percentagePosition / 100) * containerWidth
      
      return Math.max(0, x)
    }
    
    // 获取器械段的Y坐标
    const getSegmentY = (arm, segment) => {
      // 计算臂的行索引
      const armIndex = armsData.value.findIndex(a => a.arm_id === arm.arm_id)
      const rowHeight = 80 // 每行高度
      const headerHeight = 50 // 表头高度
      
      return headerHeight + (armIndex * rowHeight) + (rowHeight - 32) / 2 // 垂直居中
    }
    
    // 获取器械段的宽度
    const getSegmentWidth = (segment) => {
      const startTime = segment.start_time || segment.start || segment.install_time
      const endTime = segment.end_time || segment.end || segment.remove_time
      
      const startLocalTime = getLocalTime(startTime)
      const endLocalTime = getLocalTime(endTime)
      
      if (!startLocalTime || !endLocalTime) return 10
      
      // 计算时间跨度（分钟）
      const durationMs = endLocalTime.getTime() - startLocalTime.getTime()
      const durationMinutes = durationMs / (1000 * 60)
      
      // 对于极短的器械使用时间（小于1分钟），设置最小可见宽度
      if (durationMinutes < 1) {
        return Math.max(3, 10) // 最小宽度
      }
      
      // 基于时间跨度计算宽度
      // 获取容器宽度和总小时数来计算每分钟的像素宽度
      const totalHours = getTotalHours()
      let containerWidth
      
      if (zoomLevel.value === 1) {
        // 默认视图：使用容器实际宽度
        const timelineContainer = document.querySelector('.timeline-container')
        containerWidth = timelineContainer ? timelineContainer.offsetWidth - 120 : window.innerWidth - 120
      } else {
        // 缩放视图：使用缩放后的宽度
        const baseContainerWidth = window.innerWidth - 120
        const baseColumnWidth = baseContainerWidth / totalHours
        const scaledColumnWidth = baseColumnWidth * zoomLevel.value
        containerWidth = scaledColumnWidth * totalHours
      }
      
      const hourWidth = containerWidth / totalHours
      const minuteWidth = hourWidth / 60 // 每分钟的像素宽度
      
      // 宽度 = 时间跨度（分钟） * 每分钟像素宽度
      const width = durationMinutes * minuteWidth
      
      return Math.max(3, width)
    }
    
    // 获取器械段的结束X坐标（使用百分比定位，支持跨天）
    const getSegmentEndX = (segment) => {
      const endTime = segment.end_time || segment.end || segment.remove_time
      const localTime = getLocalTime(endTime)
      if (!localTime) return 0
      
      // 使用本地时间计算位置
      const localHour = getHourFromTime(endTime)
      const localMinute = getMinutesFromTime(endTime)
      
      // 获取表格起始小时
      const tableStartHour = getTableStartHour()
      
      // 计算器械结束在时间轴中的位置（相对于单元格）
      const hourIndex = localHour - tableStartHour
      const minuteOffset = localMinute / 60 // 分钟偏移量（0-1之间）
      
      // 计算总的小时数
      const totalHours = getTotalHours()
      
      // 计算器械结束位置：基于SVG实际宽度
      // 器械结束时间18:17 -> 在18点单元格内，距离18:00有17分钟
      // 位置 = 单元格索引 + 单元格内偏移
      const timelineContainer = document.querySelector('.timeline-container')
      let containerWidth
      
      if (zoomLevel.value === 1) {
        // 默认视图：使用容器实际宽度
        containerWidth = timelineContainer ? timelineContainer.offsetWidth - 120 : window.innerWidth - 120
      } else {
        // 缩放视图：使用缩放后的宽度
        const baseContainerWidth = window.innerWidth - 120
        const baseColumnWidth = baseContainerWidth / totalHours
        const scaledColumnWidth = baseColumnWidth * zoomLevel.value
        containerWidth = scaledColumnWidth * totalHours
      }
      
      // 计算在时间轴中的百分比位置
      const totalPosition = (hourIndex + minuteOffset) / totalHours
      const percentagePosition = totalPosition * 100
      
      // 将百分比转换为像素位置
      const x = (percentagePosition / 100) * containerWidth
      
      return Math.max(0, x)
    }
    
    // 获取器械段的高度
    const getSegmentHeight = () => {
      return 32 // 固定高度
    }
    
    
    // 处理器械段点击
    const handleSegmentClick = (segment, event) => {
      event.stopPropagation()
      console.log('器械段点击:', segment)
      // TODO: 显示抽屉
    }
    
    // 处理器械段悬停
    const handleSegmentHover = (segment, event) => {
      hoveredSegment.value = segment
      tooltipPosition.value = {
        x: event.clientX + 10,
        y: event.clientY - 10
      }
    }
    
    // 处理器械段离开
    const handleSegmentLeave = (segment, event) => {
      hoveredSegment.value = null
    }
    
    // 获取tooltip样式
    const getTooltipStyle = () => {
      return {
        position: 'fixed',
        left: `${tooltipPosition.value.x}px`,
        top: `${tooltipPosition.value.y}px`,
        zIndex: 1000
      }
    }
    
    // 获取器械段tooltip标题
    const getSegmentTooltipTitle = (segment) => {
      return segment.tool_type || segment.instrument_type || '未知器械'
    }
    
    // 获取器械段使用时长
    const getSegmentDuration = (segment) => {
      return calculateDuration(
        segment.start || segment.install_time || segment.start_time, 
        segment.end || segment.remove_time || segment.end_time
      )
    }
    
    // 格式化器械段时间
    const formatSegmentTime = (timeStr) => {
      if (!timeStr) return '未知'
      const localTime = getLocalTime(timeStr)
      if (!localTime) return '未知'
      return localTime.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }
    
    
    // 处理覆盖层点击
    const handleOverlayClick = (event) => {
      // 如果点击的是空白区域，可以执行其他操作
      console.log('覆盖层点击')
    }
    
    // 检查某个小时是否有时间线事件
    const hasEventInHour = (hour) => {
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      return timelineEvents.value.some(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === actualHour
      })
    }
    
    // 获取事件文本
    const getEventText = (hour) => {
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      const events = timelineEvents.value.filter(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === actualHour
      })
      
      if (events.length === 1) {
        return events[0].name
      } else if (events.length > 1) {
        return `${events[0].name}+${events.length - 1}`
      }
      return ''
    }
    
    // 获取事件样式类
    const getEventClass = (eventType) => {
      if (eventType === 'power_on' || eventType === 'power_off') return 'timeline-event-power'
      if (eventType === 'surgery_start' || eventType === 'surgery_end' || eventType === 'previous_end') return 'timeline-event-surgery'
      return ''
    }
    
    // 获取事件类型
    const getEventType = (hour) => {
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      const events = timelineEvents.value.filter(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === actualHour
      })
      
      if (events.length > 0) {
        return events[0].type
      }
      return ''
    }
    
    // 获取某个小时内的所有事件
    const getEventsInHour = (hour) => {
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      const events = timelineEvents.value.filter(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === actualHour
      })
      
      // 如果事件数量超过3个，合并显示
      if (events.length > 3) {
        const firstEvent = events[0]
        return [{
          ...firstEvent,
          name: `${firstEvent.name}+${events.length - 1}`,
          isMerged: true,
          allEvents: events
        }]
      }
      
      return events
    }
    
    // 获取事件工具提示
    const getEventTooltip = (event) => {
      if (event.isMerged && event.allEvents) {
        // 合并事件的工具提示
        const eventDetails = event.allEvents.map(e => {
          const localTime = getLocalTime(e.time)
          if (!localTime) return e.name
          
          const timeStr = localTime.toLocaleString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
          
          return `${e.name} (${timeStr})`
        }).join('\n')
        
        return `合并事件 (${event.allEvents.length}个):\n${eventDetails}`
      }
      
      // 单个事件的工具提示
      const localTime = getLocalTime(event.time)
      if (!localTime) return event.name
      
      const timeStr = localTime.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      
      return `${event.name}\n时间: ${timeStr}`
    }
    
    // 获取符号样式类
    const getSymbolClass = (symbol) => {
      return symbol === 'circle' ? 'symbol-circle' : 'symbol-square'
    }
    
    // 获取事件样式（精确定位，考虑时区）
    const getEventStyle = (hour) => {
      const startHour = getTableStartHour()
      const actualHour = startHour + hour
      const events = timelineEvents.value.filter(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === actualHour
      })
      
      if (events.length === 0) return {}
      
      const event = events[0]
      const eventTime = getLocalTime(event.time)
      const baseTime = getLocalTime(timelineBaseTime.value)
      
      if (!eventTime || !baseTime) {
        return { left: '50%', transform: 'translate(-50%, -50%)' }
      }
      
      // 直接使用事件时间的小时和分钟计算位置
      const eventHour = eventTime.getHours()
      const eventMinute = eventTime.getMinutes()
      
      // 计算在小时内的位置百分比
      const positionInHour = (eventMinute / 60) * 100
      const leftPosition = Math.max(0, Math.min(100, positionInHour))
      
      
      return {
        left: `${leftPosition}%`,
        transform: 'translate(-50%, -50%)'
      }
    }
    
    // 从时间字符串获取小时数（本地时间，支持跨天）
    const getHourFromTime = (timeStr) => {
      if (!timeStr) return 0
      const localTime = getLocalTime(timeStr)
      if (!localTime) return 0
      
      // 检查是否跨天
      if (timelineBaseTime.value) {
        const baseTime = getLocalTime(timelineBaseTime.value)
        if (baseTime) {
          const baseDate = baseTime.getDate()
          const currentDate = localTime.getDate()
          
          // 如果日期不同，需要调整小时数
          if (currentDate > baseDate) {
            return localTime.getHours() + 24 // 跨天时+24小时
          }
        }
      }
      
      return localTime.getHours()
    }
    
    // 从时间字符串获取分钟数（本地时间，支持跨天）
    const getMinutesFromTime = (timeStr) => {
      if (!timeStr) return 0
      const localTime = getLocalTime(timeStr)
      if (!localTime) return 0
      
      // 检查是否跨天
      if (timelineBaseTime.value) {
        const baseTime = getLocalTime(timelineBaseTime.value)
        if (baseTime) {
          const baseDate = baseTime.getDate()
          const currentDate = localTime.getDate()
          
          // 如果日期不同，需要调整分钟数
          if (currentDate > baseDate) {
            return localTime.getMinutes() + (24 * 60) // 跨天时+24小时=1440分钟
          }
        }
      }
      
      return localTime.getMinutes()
    }
    
    // 计算持续时间（分钟）
    const calculateDuration = (startTime, endTime) => {
      const start = toMs(startTime)
      const end = toMs(endTime)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
      return Math.round((end - start) / 1000 / 60)
    }
    
    // 获取工具臂颜色
    const getArmColor = (armId) => {
      switch (armId) {
        case 1: return '#1E90FF'  // 1号臂 - 蓝色
        case 2: return '#66CD00'  // 2号臂 - 绿色
        case 3: return '#FFD700'  // 3号臂 - 金色
        case 4: return '#FF6347'  // 4号臂 - 橙红色
        default: return '#722ed1' // 默认颜色
      }
    }
    
    // 获取文本颜色（与背景色形成对比）
    const getTextColor = (armId) => {
      switch (armId) {
        case 1: return '#FFFFFF'  // 1号臂 - 白色文字
        case 2: return '#FFFFFF'  // 2号臂 - 白色文字
        case 3: return '#000000'  // 3号臂 - 黑色文字（金色背景）
        case 4: return '#FFFFFF'  // 4号臂 - 白色文字
        default: return '#FFFFFF' // 默认白色
      }
    }
    
    // 判断是否应该显示器械文本
    const shouldShowInstrumentText = (segment) => {
      const width = getSegmentWidth(segment)
      // 只有当宽度大于60像素时才显示文本
      return width > 60
    }
    
    // 获取器械段文本的X坐标
    const getSegmentTextX = (segment) => {
      const startX = getSegmentX(segment)
      const width = getSegmentWidth(segment)
      return startX + width / 2 // 文本居中
    }
    
    // 获取器械段文本的Y坐标
    const getSegmentTextY = (arm, segment) => {
      const segmentY = getSegmentY(arm, segment)
      const height = getSegmentHeight()
      return segmentY + height / 2 + 4 // 文本垂直居中，稍微向下偏移
    }
    
    // 获取器械显示名称
    const getInstrumentDisplayName = (segment) => {
      const toolType = segment.tool_type || segment.instrument_type || ''
      if (!toolType) return '未知器械'
      
      // 显示完整的器械名称，不进行简写
      return toolType
    }
    
    // 获取器械颜色（保留原函数，用于其他用途）
    const getInstrumentColor = (toolType) => {
      if (!toolType) return '#722ed1'
      if (toolType.includes('刀具') || toolType.includes('剪刀')) return '#ff4d4f'
      if (toolType.includes('摄像头') || toolType.includes('内窥镜')) return '#1890ff'
      if (toolType.includes('镊子') || toolType.includes('钳子')) return '#52c41a'
      if (toolType.includes('缝合器')) return '#fa8c16'
      if (toolType.includes('持针')) return '#13c2c2'
      if (toolType.includes('抓钳')) return '#eb2f96'
      return '#722ed1'
    }
    
    // 获取时间列显示文本（显示实际小时数，支持跨天显示）
    const getTimeColumnText = (hour) => {
      if (!timelineBaseTime.value) return '00:00'
      
      // 计算相对于时间基准的小时数
      const baseTime = getLocalTime(timelineBaseTime.value)
      if (!baseTime) return '00:00'
      
      // 计算当前小时的实际时间
      const currentTime = new Date(baseTime.getTime() + hour * 60 * 60 * 1000)
      const actualHour = currentTime.getHours()
      
      // 检查是否跨天
      const baseDate = baseTime.getDate()
      const currentDate = currentTime.getDate()
      
      if (currentDate > baseDate) {
        // 跨天了，显示 (xx:00+1) 格式
        return `(${String(actualHour).padStart(2, '0')}:00+1)`
      } else {
        // 同一天，显示正常格式
      return `${String(actualHour).padStart(2, '0')}:00`
      }
    }

    // 移除旧的 ECharts 初始化代码，现在使用纯 CSS 表格布局

    const toMs = (v) => {
      if (v === null || v === undefined || v === '') return NaN
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string') {
        let s = v.trim()
        // 处理UTC时间格式，确保正确解析
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
          // 如果字符串没有时区信息，假设为UTC时间
          if (!s.includes('Z') && !s.includes('+') && !s.includes('-', 10)) {
            s = s.replace(' ', 'T') + 'Z' // 添加UTC标识
          } else {
          s = s.replace(' ', 'T')
          }
        }
        const tParsed = Date.parse(s)
        return Number.isFinite(tParsed) ? tParsed : NaN
      }
      const t = new Date(v).getTime()
      return Number.isFinite(t) ? t : NaN
    }
    
    // 获取本地时间（考虑时区转换）
    const getLocalTime = (utcTimeStr) => {
      if (!utcTimeStr) return null
      const utcTime = toMs(utcTimeStr)
      if (!Number.isFinite(utcTime)) return null
      
      // 创建本地时间对象（自动处理时区转换）
      const localDate = new Date(utcTime)
      return localDate
    }

    const renderTimeline = (data) => {
      
      // 直接从data中读取arms数据
      const arms = Array.isArray(data?.arms) ? data.arms : []
      
      
      // 处理arms数据，确保每个arm有正确的segments
      const processedArms = arms.map((arm, index) => {
        const armId = arm.arm_id || (index + 1)
        const armName = arm.name || `${armId}号臂`
        const segments = Array.isArray(arm.instrument_usage) ? arm.instrument_usage : []
        
        
        return {
          name: armName,
          arm_id: armId,
          segments: segments
        }
      })
      
      // 确保至少有4个工具臂，即使没有数据
      const allArms = []
      for (let i = 1; i <= 4; i++) {
        const existingArm = processedArms.find(arm => arm.arm_id === i)
        if (existingArm) {
          allArms.push(existingArm)
      } else {
          allArms.push({
            name: `${i}号臂`,
            arm_id: i,
            segments: []
          })
        }
      }
      
      // 更新armsData，手术时间线在最前面
      armsData.value = [
        { name: '手术时间线', arm_id: 0, segments: [] },
        ...allArms
      ]
      
      
      
      // 处理时间线事件
      const events = []
      const powerCycles = data?.power_cycles || []
      
      // 处理所有开机和关机事件
      powerCycles.forEach((cycle, index) => {
        if (cycle.on_time) {
          events.push({ 
            time: cycle.on_time, 
            name: `开机${index + 1}`, 
            type: 'power_on', 
            symbol: 'square' 
          })
        }
        if (cycle.off_time) {
          events.push({ 
            time: cycle.off_time, 
            name: `关机${index + 1}`, 
            type: 'power_off', 
            symbol: 'square' 
          })
        }
      })
      
      // 获取第一次开机时间（用于设置时间基准）
      const powerOnTime = powerCycles.length > 0 ? powerCycles[0]?.on_time : null
      
      const surgeryStart = data?.surgeryStart || data?.start_time
      const surgeryEnd = data?.surgeryEnd || data?.end_time
      const previousSurgeryEnd = data?.previousSurgeryEnd || data?.timeline?.previousSurgeryEnd
      
      // 设置时间基准：第一次开机时间往前推1小时（使用解析后的本地时间）
      if (powerOnTime) {
        const powerOnDate = getLocalTime(powerOnTime)
        if (powerOnDate) {
          const baseTime = new Date(powerOnDate.getTime() - 60 * 60 * 1000) // 往前推1小时
          timelineBaseTime.value = baseTime.toISOString()
        }
      } else {
        // 如果没有开机时间，使用手术开始时间作为基准
        const fallbackTime = surgeryStart || new Date()
        const baseTime = getLocalTime(fallbackTime) || new Date(fallbackTime)
        timelineBaseTime.value = baseTime.toISOString()
      }
      
      // 添加其他重要事件
      if (previousSurgeryEnd) {
        events.push({ time: previousSurgeryEnd, name: '上一台手术结束', type: 'previous_end', symbol: 'circle' })
      }
      if (surgeryStart) {
        events.push({ time: surgeryStart, name: '手术开始', type: 'surgery_start', symbol: 'circle' })
      }
      if (surgeryEnd) {
        events.push({ time: surgeryEnd, name: '手术结束', type: 'surgery_end', symbol: 'circle' })
      }
      
      timelineEvents.value = events
      
      
    }

    // 移除旧的 ECharts 相关代码，现在使用纯 CSS 表格布局

    // 移除不需要的renderState和renderLatency函数

    // 移除不需要的renderTable函数

    const renderAll = (data) => {
      // 直接使用数据库原始字段
      meta.surgery_id = data.surgery_id || null
      meta.start_time = data.start_time || null
      meta.end_time = data.end_time || null
      
      // 使用根级别的标签状态字段，如果不存在则使用默认值
      meta.is_remote = data.is_remote === true
      meta.is_fault = data.has_fault === true || false // 如果has_fault不存在，默认为false
      
      currentData.value = data
      renderTimeline(data)
      renderAlerts(data)
      
      // 检查是否有图表数据
      const surgeryStatsForCharts = data.surgery_stats || {}
      showCharts.value = !!(surgeryStatsForCharts.state_machine || (surgeryStatsForCharts.network_latency && meta.is_remote))
      
      // 初始化图表
      if (showCharts.value) {
        nextTick(() => {
          initCharts(data)
        })
      }
    }

    const loadFromStorage = () => {
      try {
        const text = sessionStorage.getItem('surgeryVizData')
        if (!text) {
          return
        }
        
        const data = JSON.parse(text)
        
        console.log('获取到的手术数据:', data)
        renderAll(data)
      } catch (error) {
        console.error('❌ 解析SessionStorage数据失败:', error)
      }
    }

    const loadById = async () => {
      if (!surgeryIdInput.value) return
      loading.value = true
      try {
        const resp = await api.surgeries.get(surgeryIdInput.value)
        const item = resp.data?.data || resp.data
        
        console.log('获取到的手术数据:', item)
        console.log('has_fault字段:', item.has_fault, '类型:', typeof item.has_fault)
        console.log('is_remote字段:', item.is_remote, '类型:', typeof item.is_remote)
        console.log('所有字段列表:', Object.keys(item))
        renderAll(item)
      } catch (e) {
        console.error('❌ API获取手术数据失败:', e)
      } finally {
        loading.value = false
      }
    }

    const handleResize = () => {
      // 处理图表大小调整
      if (stateMachineChartInstance.value) {
        stateMachineChartInstance.value.resize()
      }
      if (networkLatencyChartInstance.value) {
        networkLatencyChartInstance.value.resize()
      }
    }
    
    // 初始化图表
    const initCharts = (data) => {
      const surgeryStats = data.surgery_stats || {}
      
      // 初始化状态机图表
      if (surgeryStats.state_machine && stateMachineChart.value) {
        initStateMachineChart(surgeryStats.state_machine)
      }
      
      // 初始化网络延迟图表（仅远程手术）
      if (surgeryStats.network_latency_ms && meta.is_remote && networkLatencyChart.value) {
        initNetworkLatencyChart(surgeryStats.network_latency_ms)
      }
      
      // 处理故障数据
      if (surgeryStats.faults && Array.isArray(surgeryStats.faults)) {
        faultRecords.value = processFaultData(surgeryStats.faults)
        console.log(`📊 处理故障数据: ${faultRecords.value.length} 个故障记录`)
      }
    }
    
    // 初始化状态机图表
    const initStateMachineChart = (stateMachineData) => {
      if (!stateMachineChart.value) return
      
      try {
        stateMachineChartInstance.value = echarts.init(stateMachineChart.value)
      } catch (error) {
        console.error('❌ 状态机图表初始化失败:', error)
        return
      }
      
      // 处理状态机数据
      const chartData = processStateMachineData(stateMachineData)
      
      const option = {
        title: {
          text: '手术状态机变化',
          left: 'center',
          textStyle: {
            fontSize: 14
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
            label: {
              backgroundColor: '#6a7985'
            }
          },
          formatter: function(params) {
            const data = params[0]
            const time = new Date(data.axisValue).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
            return `时间: ${time}<br/>状态值: ${data.value}`
          }
        },
        legend: {
          data: ['状态机'],
          top: 30
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'time',
          boundaryGap: false,
          axisLine: {
            lineStyle: {
              color: '#999'
            }
          },
          axisLabel: {
            formatter: function(value) {
              return new Date(value).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          }
        },
        yAxis: {
          type: 'value',
          axisLine: {
            lineStyle: {
              color: '#999'
            }
          },
          splitLine: {
            lineStyle: {
              color: '#eee'
            }
          }
        },
        series: [{
          name: '状态机',
          type: 'line',
          data: chartData,
          smooth: true,
          showSymbol: false,
          lineStyle: {
            color: '#5470c6',
            width: 2
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(84, 112, 198, 0.3)'
              }, {
                offset: 1, color: 'rgba(84, 112, 198, 0.1)'
              }]
            }
          },
          emphasis: {
            focus: 'series'
          }
        }],
        dataZoom: [{
          type: 'inside',
          xAxisIndex: 0,
          start: 0,
          end: 100
        }, {
          type: 'slider',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          height: 30,
          bottom: 10,
          handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
          handleSize: '80%',
          showDetail: false
        }]
      }
      
      try {
        stateMachineChartInstance.value.setOption(option)
      } catch (error) {
        console.error('❌ 状态机图表配置失败:', error)
      }
    }
    
    // 初始化网络延迟图表
    const initNetworkLatencyChart = (latencyData) => {
      if (!networkLatencyChart.value) return
      
      try {
        networkLatencyChartInstance.value = echarts.init(networkLatencyChart.value)
      } catch (error) {
        console.error('❌ 网络延迟图表初始化失败:', error)
        return
      }
      
      // 处理网络延迟数据
      const chartData = processNetworkLatencyData(latencyData)
      
      const option = {
        title: {
          text: '网络延迟情况',
          left: 'center',
          textStyle: {
            fontSize: 14
          }
        },
        tooltip: {
          trigger: 'axis',
          formatter: function(params) {
            const data = params[0]
            const latency = data.value
            const status = latency > 1000 ? '异常' : '正常'
            const statusColor = latency > 1000 ? '#ff4d4f' : '#52c41a'
            return `<div style="color: ${statusColor}">
              <strong>时间:</strong> ${data.axisValue}<br/>
              <strong>延迟:</strong> ${latency}ms<br/>
              <strong>状态:</strong> ${status}
            </div>`
          }
        },
        xAxis: {
          type: 'time',
          boundaryGap: false,
          name: '时间',
          nameLocation: 'middle',
          nameGap: 30,
          axisLabel: {
            formatter: function(value) {
              return new Date(value).toLocaleTimeString()
            }
          }
        },
        yAxis: {
          type: 'value',
          name: '延迟(ms)',
          nameLocation: 'middle',
          nameGap: 50,
          axisLabel: {
            formatter: '{value}ms'
          }
        },
        dataZoom: [
          {
            type: 'inside',
            start: 0,
            end: 100,
            realtime: true,
            throttle: 100,
            zoomLock: false,
            xAxisIndex: 0,
            filterMode: 'filter'
          },
          {
            type: 'slider',
            start: 0,
            end: 100,
            realtime: true,
            throttle: 100,
            zoomLock: false,
            showDetail: true,
            showDataShadow: true,
            xAxisIndex: 0,
            bottom: 10,
            filterMode: 'filter',
            moveHandleSize: 8
          }
        ],
        series: [{
          name: '网络延迟',
          type: 'line',
          data: chartData,
          smooth: true,
          symbol: 'none',
          sampling: 'lttb',
          lineStyle: {
            color: '#409EFF',
            width: 2
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(64, 158, 255, 0.3)'
              }, {
                offset: 1, color: 'rgba(64, 158, 255, 0.05)'
              }]
            }
          },
          markLine: {
            data: [{
              yAxis: 1000,
              lineStyle: {
                color: '#ff4d4f',
                type: 'dashed',
                width: 2
              },
              label: {
                formatter: '异常阈值 (1000ms)',
                position: 'end',
                color: '#ff4d4f'
              }
            }]
          },
          markPoint: {
            data: chartData.filter(item => item[1] > 1000).map(item => ({
              coord: item,
              itemStyle: {
                color: '#ff4d4f'
              },
              label: {
                formatter: '异常',
                color: '#fff',
                fontSize: 10
              }
            }))
          }
        }],
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '15%',
          containLabel: true
        }
      }
      
      try {
        networkLatencyChartInstance.value.setOption(option)
      } catch (error) {
        console.error('❌ 网络延迟图表配置失败:', error)
      }
    }
    
    // 处理状态机数据
    const processStateMachineData = (stateMachineData) => {
      if (!Array.isArray(stateMachineData)) {
        console.warn('⚠️ 状态机数据不是数组:', stateMachineData)
        return []
      }
      
      try {
        const processedData = stateMachineData.map(item => {
          // 处理UTC时间转换
          const timeValue = item.time || item.timestamp
          if (!timeValue) {
            console.warn('⚠️ 状态机数据缺少时间字段:', item)
            return [Date.now(), 0]
          }
          
          const utcTime = new Date(timeValue)
          if (isNaN(utcTime.getTime())) {
            console.warn('⚠️ 状态机数据时间格式无效:', timeValue)
            return [Date.now(), 0]
          }
          
          // 提取状态值（括号内的数字部分）
          const stateValue = item.state || ''
          const stateNumber = extractStateNumber(stateValue)
          
          return [utcTime.getTime(), stateNumber]
        })
        
        return processedData
      } catch (error) {
        console.error('❌ 状态机数据处理失败:', error)
        return []
      }
    }
    
    // 提取状态值中的数字部分
    const extractStateNumber = (stateString) => {
      if (!stateString) return 0
      
      // 匹配括号内的数字，如 "状态1(5)" -> 5
      const match = stateString.match(/\((\d+)\)/)
      if (match) {
        return parseInt(match[1], 10)
      }
      
      // 如果没有括号，尝试提取纯数字
      const numberMatch = stateString.match(/\d+/)
      if (numberMatch) {
        return parseInt(numberMatch[0], 10)
      }
      
      return 0
    }
    
    // 处理网络延迟数据
    const processNetworkLatencyData = (latencyData) => {
      if (!Array.isArray(latencyData)) {
        console.warn('⚠️ 网络延迟数据不是数组:', latencyData)
        return []
      }
      
      try {
        return latencyData.map(item => {
          // 支持新的数据格式：{time: "2025-09-11 05:20:00", latency: 120}
          const timeValue = item.time || item.timestamp
          if (!timeValue) {
            console.warn('⚠️ 网络延迟数据缺少时间字段:', item)
            return [Date.now(), 0]
          }
          
          const utcTime = new Date(timeValue)
          if (isNaN(utcTime.getTime())) {
            console.warn('⚠️ 网络延迟数据时间格式无效:', timeValue)
            return [Date.now(), 0]
          }
          
          // 使用新的latency字段
          const latencyValue = item.latency || item.value || 0
          return [utcTime.getTime(), latencyValue]
        })
      } catch (error) {
        console.error('❌ 网络延迟数据处理失败:', error)
        return []
      }
    }
    
    // 处理故障数据
    const processFaultData = (faultsData) => {
      if (!Array.isArray(faultsData)) {
        console.warn('⚠️ 故障数据不是数组:', faultsData)
        return []
      }
      
      try {
        // 对故障码进行去重处理（基于故障码）
        const faultMap = new Map()
        
        faultsData.forEach(fault => {
          const errorCode = fault.error_code
          if (!errorCode) return
          
          // 如果故障码已存在，保留最新的记录
          if (!faultMap.has(errorCode) || new Date(fault.timestamp) > new Date(faultMap.get(errorCode).timestamp)) {
            faultMap.set(errorCode, {
              timestamp: fault.timestamp,
              error_code: fault.error_code,
              explanation: fault.explanation || '无详细说明',
              status: fault.status || '未处理'
            })
          }
        })
        
        // 转换为数组并按时间排序
        return Array.from(faultMap.values()).sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
        )
      } catch (error) {
        console.error('❌ 故障数据处理失败:', error)
        return []
      }
    }
    
    // 格式化故障时间
    const formatFaultTime = (timestamp) => {
      if (!timestamp) return '未知时间'
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
        return timestamp
      }
    }
    
    // 获取故障类型（根据故障码后缀判断）
    const getFaultType = (errorCode) => {
      if (!errorCode) return 'info'
      const suffix = errorCode.slice(-1).toUpperCase()
      switch (suffix) {
        case 'A': return 'danger'  // A类故障
        case 'B': return 'warning' // B类故障
        case 'C': return 'info'    // C类故障
        case 'D': return 'success' // D类提示
        case 'E': return ''        // E类日志
        default: return 'info'
      }
    }
    
    // 获取已处理故障数量
    const getProcessedCount = () => {
      return faultRecords.value.filter(fault => fault.status === '已处理').length
    }
    
    // 获取未处理故障数量
    const getUnprocessedCount = () => {
      return faultRecords.value.filter(fault => fault.status === '未处理').length
    }
    
    // 处理鼠标滚轮缩放
    const handleWheel = (event) => {
      event.preventDefault()
      
      const delta = event.deltaY
      const zoomFactor = delta > 0 ? 0.9 : 1.1 // 向下滚动缩小，向上滚动放大
      
      const newZoom = zoomLevel.value * zoomFactor
      zoomLevel.value = Math.max(minZoom, Math.min(maxZoom, newZoom))
      
      // 强制更新SVG内容，避免滞后
      nextTick(() => {
        // 触发响应式更新
        const svg = document.querySelector('.timeline-overlay')
        if (svg) {
          // 强制重新计算SVG内容
          svg.style.display = 'none'
          svg.offsetHeight // 触发重排
          svg.style.display = ''
        }
      })
    }
    
    // 重置缩放
    const resetZoom = () => {
      zoomLevel.value = 1
    }
    
    // 获取时间列容器样式
    const getTimeColumnsStyle = () => {
      if (zoomLevel.value === 1) {
        // 默认视图：撑满容器宽度
        return { flex: 1 }
      } else {
        // 缩放视图：基于默认视图的实际宽度进行缩放
        const baseWidth = 100 - (120 / window.innerWidth * 100) // 减去arm-column占用的百分比
        const scaledWidth = baseWidth * zoomLevel.value
        return { width: `${scaledWidth}%` }
      }
    }
    
    // 获取时间单元格容器样式
    const getTimeCellsStyle = () => {
      if (zoomLevel.value === 1) {
        // 默认视图：撑满容器宽度
        return { flex: 1 }
      } else {
        // 缩放视图：基于默认视图的实际宽度进行缩放
        const baseWidth = 100 - (120 / window.innerWidth * 100)
        const scaledWidth = baseWidth * zoomLevel.value
        return { width: `${scaledWidth}%` }
      }
    }
    
    // 获取时间列样式
    const getTimeColumnStyle = () => {
      if (zoomLevel.value === 1) {
        // 默认视图：均布撑满容器
        return { flex: 1, flexShrink: 0 }
      } else {
        // 缩放视图：基于默认视图的实际宽度进行缩放
        const totalHours = getTotalHours()
        const containerWidth = window.innerWidth
        const armColumnWidth = 120
        const availableWidth = containerWidth - armColumnWidth
        const baseColumnWidth = availableWidth / totalHours
        const scaledColumnWidth = baseColumnWidth * zoomLevel.value
        return { width: `${scaledColumnWidth}px`, flexShrink: 0 }
      }
    }
    
    // 获取时间网格样式
    const getTimeGridStyle = () => {
      if (zoomLevel.value === 1) {
        // 默认视图：均布撑满容器
        return { flex: 1, flexShrink: 0 }
      } else {
        // 缩放视图：基于默认视图的实际宽度进行缩放
        const totalHours = getTotalHours()
        const containerWidth = window.innerWidth
        const armColumnWidth = 120
        const availableWidth = containerWidth - armColumnWidth
        const baseColumnWidth = availableWidth / totalHours
        const scaledColumnWidth = baseColumnWidth * zoomLevel.value
        return { width: `${scaledColumnWidth}px`, flexShrink: 0 }
      }
    }

    // 调试函数：查看SessionStorage中的所有手术相关数据
    const debugSessionStorage = () => {
      const surgeryData = sessionStorage.getItem('surgeryVizData')
      if (surgeryData) {
        try {
          const parsed = JSON.parse(surgeryData)
          console.log('获取到的手术数据:', parsed)
        } catch (e) {
          console.error('❌ 解析surgeryVizData失败:', e)
        }
      }
    }

    onMounted(async () => {
      // 加载服务器时区信息
      await loadServerTimezone()
      
      window.addEventListener('resize', handleResize)
      
      // 调试SessionStorage - 移除重复调用
      // debugSessionStorage()
      
      // 将调试函数暴露到全局，方便在控制台调用
      window.debugSurgeryData = () => {
        debugSessionStorage()
      }
      
      // 初始化时间线（现在使用纯CSS布局，不需要ECharts）
      nextTick(() => {
        // Timeline initialized with CSS layout
      })
      
      const qid = route?.query?.id || route?.params?.id
      if (qid) {
        surgeryIdInput.value = String(qid)
        loadById()
      } else {
      loadFromStorage()
      }
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize)
      
      // 销毁图表实例
      if (stateMachineChartInstance.value) {
        stateMachineChartInstance.value.dispose()
        stateMachineChartInstance.value = null
      }
      if (networkLatencyChartInstance.value) {
        networkLatencyChartInstance.value.dispose()
        networkLatencyChartInstance.value = null
      }
    })

    // 使用统一的时间格式化函数
    const fmtTime = (v) => formatTime(v)
    const timelineDisplay = reactive({ powerOn: '-', previousSurgeryEnd: '-', surgeryStart: '-', surgeryEnd: '-', powerOff: '-' })

    const renderAlerts = (data) => {
      const list = Array.isArray(data?.security_alerts) ? data.security_alerts : (Array.isArray(data?.error_codes) ? data.error_codes : [])
      const rows = list.map(it => ({
        time: fmtTime(it.time || it.timestamp),
        code: it.code || it.errCode || '-',
        message: it.message || it.explanation || '-',
        status: (it.status !== undefined && it.status !== null)
          ? String(it.status)
          : ((it.resolved === true || it.is_resolved === true) ? '已处理' : '未处理')
      }))
      alertRows.value = rows
      // 更新时间卡片
      const t = data?.timeline || {}
      timelineDisplay.powerOn = fmtTime(t.powerOn)
      timelineDisplay.previousSurgeryEnd = fmtTime(t.previousSurgeryEnd)
      timelineDisplay.surgeryStart = fmtTime(t.surgeryStart || meta.start_time)
      timelineDisplay.surgeryEnd = fmtTime(t.surgeryEnd || meta.end_time)
      timelineDisplay.powerOff = fmtTime(t.powerOff)
    }

    const visibleAlertRows = computed(() => {
      const arr = alertRows.value || []
      if (showAllAlerts.value) return arr
      return arr.slice(0, 5)
    })

    const exportStructured = () => {
      try {
        const data = currentData.value || {}
        const text = JSON.stringify(data, null, 2)
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const id = meta.surgery_id || 'unknown'
        a.download = `surgery_${id}_structured.json`
        a.click()
        URL.revokeObjectURL(url)
      } catch (_) {}
    }

    return { 
      loadFromStorage, 
      loadById, 
      loading, 
      surgeryIdInput, 
      meta, 
      exportStructured, 
      visibleAlertRows, 
      showAllAlerts, 
      timelineDisplay, 
      armsData, 
      timelineEvents,
      hoveredSegment,
      hasInstrumentInHour,
      getSegmentsInHour,
      getSegmentStyle,
      getSegmentTooltip,
      hasEventInHour,
      getEventText,
      getEventClass,
      getEventType,
      getEventStyle,
      getEventsInHour,
      getEventTooltip,
      getSymbolClass,
      getTimeColumnText,
      getTotalHours,
      getTableStartHour,
      getHourRange,
      zoomLevel,
      handleWheel,
      resetZoom,
      getTimeColumnsStyle,
      getTimeCellsStyle,
      getTimeColumnStyle,
      getTimeGridStyle,
      // SVG覆盖层相关函数
      getOverlayStyle,
      getAllSegmentsForArm,
      getSegmentX,
      getSegmentY,
      getSegmentWidth,
      getSegmentHeight,
      getSegmentEndX,
      getInstrumentColor,
      handleSegmentClick,
      handleSegmentHover,
      handleSegmentLeave,
      handleOverlayClick,
      getTooltipStyle,
      getSegmentTooltipTitle,
      getSegmentDuration,
      formatSegmentTime,
      getArmColor,
      getTextColor,
      shouldShowInstrumentText,
      getSegmentTextX,
      getSegmentTextY,
      getInstrumentDisplayName,
      // 图表相关
      showCharts,
      stateMachineChart,
      networkLatencyChart,
      // 故障记录相关
      faultRecords,
      formatFaultTime,
      getFaultType,
      getProcessedCount,
      getUnprocessedCount
    }
  }
}
</script>

<style scoped>
.viz-page { 
  padding: 16px; 
  display: flex; 
  flex-direction: column; 
  gap: 16px; 
}

/* 标题卡片样式 */
.title-card {
  margin-bottom: 0;
  width: fit-content;
  min-width: auto;
  height: auto;
  min-height: auto;
}

/* 通过CSS变量控制Element Plus卡片内边距 */
.title-card {
  --el-card-padding: 8px 12px;
}

/* 移除对el-card__body的直接控制，让Element Plus自己管理 */

.surgery-info { 
  display: flex; 
  align-items: center; 
  gap: 8px; /* 减少元素间距 */
  flex-wrap: wrap;
  margin: 0; /* 移除容器边距 */
  padding: 0; /* 移除容器内边距 */
}

.surgery-id {
  font-size: 12px;
  font-weight: 600;
  color: #000;
  margin: 0; /* 移除所有外边距 */
  padding: 2px 4px; /* 减少内边距 */
}

.surgery-tag { 
  margin: 0 4px; /* 上下边距为0，左右边距为4px */
}

/* 故障手术标签样式 */
.surgery-tag[color="red"] {
  background-color: #f48d8f !important;
  color: white !important;
  border: none !important;
}

/* 更具体的选择器来覆盖Element Plus默认样式 */
.title-card .surgery-tag[color="red"] {
  background-color: #f48d8f !important;
  color: white !important;
  border: none !important;
}

/* 使用类名选择器 */
.surgery-tag.fault-tag {
  background-color: #f48d8f !important;
  color: white !important;
  border: none !important;
}

/* 强制覆盖Element Plus的默认样式 */
.title-card .el-tag.fault-tag {
  background-color: #f48d8f !important;
  color: white !important;
  border: none !important;
}

.title-card .el-tag.fault-tag .el-tag__content {
  color: white !important;
}

/* 手术概况卡片样式 */
.overview-card {
  margin-bottom: 0;
}

.section-header { 
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600; 
  margin-bottom: 16px; 
  font-size: 16px;
  color: #333;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.zoom-reset-btn {
  padding: 4px 12px;
  background: #f0f0f0;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.zoom-reset-btn:hover {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}

.zoom-level {
  font-size: 12px;
  color: #666;
  min-width: 40px;
  text-align: center;
}

.timeline-chart {
  width: 100%;
  height: 400px;
}
.chart { width: 100%; height: 360px; }
.alerts-toggle { text-align: center; padding-top: 6px; }

/* 时间轴容器样式 */
.timeline-container {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  overflow-x: auto; /* 横向滚动条 */
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  position: relative; /* 为SVG覆盖层提供定位基准 */
}

.timeline-header {
  display: flex;
  background: #fafafa;
  border-bottom: 2px solid #d9d9d9;
  min-width: max-content; /* 确保容器宽度不小于内容宽度 */
}

.arm-column {
  width: 120px;
  flex-shrink: 0; /* 防止收缩，保持固定宽度 */
  padding: 16px 12px;
  font-weight: 600;
  border-right: 1px solid #d9d9d9;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #262626;
}

.time-columns {
  display: flex;
  /* 移除 flex: 1，使用固定宽度 */
  /* 移除 overflow-x: auto，使用外层容器的滚动条 */
  min-width: 0; /* 允许收缩 */
}

.time-column {
  flex-shrink: 0; /* 防止收缩，使用动态宽度 */
  padding: 16px 4px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  border-right: 1px solid #f0f0f0;
  background: #fafafa;
  color: #595959;
  min-width: 30px; /* 最小宽度 */
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.timeline-body {
  display: flex;
  flex-direction: column;
}

.timeline-row {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  min-height: 80px;
  transition: background-color 0.2s ease;
}

.timeline-row:hover {
  background-color: #fafafa;
}

.timeline-row:last-child {
  border-bottom: none;
}

.arm-cell {
  width: 120px;
  flex-shrink: 0; /* 防止收缩，保持固定宽度 */
  padding: 16px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #f0f0f0;
  background: #fff;
  font-weight: 500;
  font-size: 14px;
  color: #262626;
}

.time-cells {
  position: relative;
  min-height: 80px;
  background: #fff;
  display: flex;
  /* 移除 flex: 1，使用固定宽度 */
  min-width: 0; /* 允许收缩 */
  /* 移除 overflow-x: auto，使用外层容器的滚动条 */
}

/* 小时栅格背景 */
.time-grid {
  position: relative;
  flex-shrink: 0; /* 防止收缩，使用动态宽度 */
  height: 100%;
  border-right: 1px solid #f0f0f0;
  background: #fff;
  transition: background-color 0.2s ease;
  min-width: 30px; /* 最小宽度 */
}

.time-grid:hover {
  background-color: #f5f5f5;
}

.time-grid.has-instrument {
  background-color: #f0f9ff;
}

/* 时间线事件容器 */
.timeline-event-container {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* 单个事件样式 */
.timeline-event {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
}

/* 事件符号容器 */
.event-symbol {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 圆形符号（手术相关事件） */
.circle-shape {
  width: 10px;
  height: 10px;
  border: 2px solid #ff4d4f;
  border-radius: 50%;
  background: transparent;
}

/* 方形符号（开机/关机事件） */
.square-shape {
  width: 10px;
  height: 10px;
  border: 2px solid #1890ff;
  background: transparent;
  border-radius: 2px;
}

/* 事件标签 */
.event-label {
  font-size: 10px;
  font-weight: 500;
  color: #333;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

/* 合并事件标签样式 */
.timeline-event[data-merged="true"] .event-label {
  background: rgba(255, 193, 7, 0.9);
  color: #856404;
  font-weight: 600;
  border: 1px solid #ffc107;
}

/* 事件类型样式 */
.timeline-event-power .circle-shape,
.timeline-event-power .square-shape {
  border-color: #1890ff;
}

.timeline-event-surgery .circle-shape,
.timeline-event-surgery .square-shape {
  border-color: #ff4d4f;
}

/* 事件文本样式 */
.event-text {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  text-align: center;
}

/* timeline-event-power 现在没有背景色，与手术事件样式保持一致 */

.timeline-event-start {
  background: linear-gradient(135deg, #1890ff, #40a9ff);
}

.timeline-event-end {
  background: linear-gradient(135deg, #fa8c16, #ffa940);
}

.timeline-event-previous {
  background: linear-gradient(135deg, #8c8c8c, #a6a6a6);
}

/* 器械使用区块样式 */
.instrument-segment {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 32px;
  border-radius: 6px;
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 4px rgba(0,0,0,0.12);
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid rgba(255,255,255,0.3);
  min-width: 40px;
}

.instrument-segment:hover {
  transform: translateY(-50%) scale(1.05);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  z-index: 15;
  border-color: rgba(255,255,255,0.6);
}

/* 器械类型颜色 */
.instrument-segment[style*="ff4d4f"] {
  background: linear-gradient(135deg, #ff4d4f, #ff7875);
}

.instrument-segment[style*="1890ff"] {
  background: linear-gradient(135deg, #1890ff, #40a9ff);
}

.instrument-segment[style*="52c41a"] {
  background: linear-gradient(135deg, #52c41a, #73d13d);
}

.instrument-segment[style*="fa8c16"] {
  background: linear-gradient(135deg, #fa8c16, #ffa940);
}

.instrument-segment[style*="13c2c2"] {
  background: linear-gradient(135deg, #13c2c2, #36cfc9);
}

.instrument-segment[style*="eb2f96"] {
  background: linear-gradient(135deg, #eb2f96, #f759ab);
}

.instrument-segment[style*="722ed1"] {
  background: linear-gradient(135deg, #722ed1, #9254de);
}

/* SVG覆盖层样式 */
.timeline-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 20;
}

/* SVG器械段样式 */
.instrument-segment-svg {
  cursor: pointer;
  transition: all 0.3s ease;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.12));
}

.instrument-segment-svg:hover {
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
}

/* 器械文本样式 */
.instrument-text {
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
  user-select: none;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  cursor: pointer;
}

/* 自定义Tooltip样式 */
.custom-tooltip {
  background: white;
  color: #333;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #e0e0e0;
  pointer-events: none;
  max-width: 300px;
  white-space: nowrap;
}

.tooltip-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  color: #333;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 4px;
}

.tooltip-content div {
  margin-bottom: 4px;
  color: #666;
}

.tooltip-content div:last-child {
  margin-bottom: 0;
}

/* 图表卡片样式 */
.charts-card {
  margin-top: 16px;
}

.charts-container {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.chart-item {
  flex: 1;
  min-width: 400px;
  min-height: 300px;
}

/* 状态机图表占左半边 */
.chart-item:first-child {
  flex: 0 0 calc(50% - 8px);
}

/* 网络延迟图表占右半边 */
.chart-item:last-child {
  flex: 0 0 calc(50% - 8px);
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  text-align: center;
}

.chart {
  width: 100%;
  height: 300px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fff;
}

/* 故障记录样式 */
.faults-card {
  margin-top: 16px;
}

.faults-container {
  padding: 16px 0;
}

.faults-table {
  margin-bottom: 16px;
}

.faults-table .el-table__header {
  background-color: #f5f7fa;
}

.faults-table .el-table__header th {
  background-color: #f5f7fa !important;
  color: #606266;
  font-weight: 600;
}

.fault-time {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #606266;
}

.fault-explanation {
  font-size: 13px;
  line-height: 1.4;
  color: #303133;
}

.faults-summary {
  margin-top: 16px;
}

.faults-summary .el-alert {
  border-radius: 6px;
}

/* 故障码标签样式 */
.faults-table .el-tag {
  font-weight: 600;
  font-size: 11px;
  padding: 2px 8px;
}

/* 状态标签样式 */
.faults-table .el-tag[type="success"] {
  background-color: #f0f9ff;
  border-color: #67c23a;
  color: #67c23a;
}

.faults-table .el-tag[type="danger"] {
  background-color: #fef0f0;
  border-color: #f56c6c;
  color: #f56c6c;
}

/* 响应式布局 */
@media (max-width: 1200px) {
  .charts-container {
    flex-direction: column;
  }
  
  .chart-item {
    min-width: 100%;
  }
  
  .faults-table {
    font-size: 12px;
  }
  
  .faults-table .el-table__cell {
    padding: 8px 4px;
  }
}

</style>




