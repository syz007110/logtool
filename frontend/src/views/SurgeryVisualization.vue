
<template>
  <div class="viz-page">
    <!-- 顶部标题卡片 -->
    <el-card class="title-card">
          <div class="surgery-info">
        <span class="surgery-id">{{ meta.surgery_id || '-' }}</span>
        <el-tag v-if="meta.is_remote" color="green" size="small" class="surgery-tag remote-tag">{{$t('surgeryVisualization.remoteSurgery')}}</el-tag>
        <el-tag v-if="meta.is_fault" color="red" size="small" class="surgery-tag fault-tag">{{$t('surgeryVisualization.faultSurgery')}}</el-tag>
          </div>
    </el-card>

    <!-- 手术概况卡片 -->
    <el-card class="overview-card">
      <div class="section-header">
        {{$t('surgeryVisualization.overview')}}
        <div class="zoom-controls min-w-0">
          <button @click="resetZoom" class="zoom-reset-btn compact-btn">{{$t('surgeryVisualization.resetZoom')}}</button>
          <span class="zoom-level one-line-ellipsis" :title="Math.round(zoomLevel * 100) + '%'">{{ Math.round(zoomLevel * 100) }}%</span>
        </div>
      </div>
        <div 
          class="timeline-container"
          :class="{ 'dragging': isDragging }"
          :data-zoom-level="zoomLevel"
          @wheel.prevent="handleWheel"
          @mousedown="handleDragStart"
          @mousemove="handleDragMove"
          @mouseup="handleDragEnd"
          @mouseleave="handleMouseLeave"
          @mouseenter="handleMouseEnter"
        >
        <!-- 表格头部 -->
        <div class="timeline-header">
          <div class="arm-column"><span class="one-line-ellipsis" :title="$t('surgeryVisualization.activity')">{{$t('surgeryVisualization.activity')}}</span></div>
            <div class="time-columns" :style="getTimeColumnsStyle()">
            <div 
              v-for="(_, index) in Array(getTotalHours()).fill(0)" 
              :key="index" 
              class="time-column"
              :style="getTimeColumnStyle()"
            >
              <span class="one-line-ellipsis" :title="getTimeColumnText(index)">{{ getTimeColumnText(index) }}</span>
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
                :stroke="getStrokeColor(arm.arm_id)"
              stroke-width="2"
              rx="3"
              ry="3"
              class="instrument-segment-svg"
              @click="handleSegmentClick(segment, $event)"
              @mouseenter="handleSegmentHover(segment, $event)"
              @mousemove="handleMouseMove($event)"
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
                @mousemove="handleMouseMove($event)"
                @mouseleave="handleSegmentLeave(segment, $event)"
              >
                {{ getInstrumentDisplayName(segment) }}
              </text>
            </g>
          </g>
          
        </svg>
        
        <!-- 表格主体 -->
        <div class="timeline-body">
          <div 
            v-for="arm in armsData" 
            :key="arm.arm_id" 
            class="timeline-row"
          >
            <div class="arm-cell"><span class="one-line-ellipsis" :title="arm.name">{{ arm.name }}</span></div>
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
                    :style="getSingleEventStyle(event, index)"
                    :data-merged="event.isMerged"
                    @mouseenter="handleEventHover(event, $event)"
                    @mousemove="handleMouseMove($event)"
                    @mouseleave="handleEventLeave"
                  >
                    <!-- 事件符号 -->
                    <div class="event-symbol" :class="getSymbolClass(event.symbol, event.isMerged, event.allEvents)">
                      <!-- 合并事件：根据包含的事件类型显示组合符号 -->
                      <div v-if="event.isMerged && event.allEvents" class="merged-symbols">
                        <!-- 纯电源事件：显示两个重叠的正方形 -->
                        <template v-if="hasPowerEvents(event.allEvents) && !hasSurgeryEvents(event.allEvents)">
                          <div class="square-shape" style="position: absolute; top: 0; left: 0; z-index: 1; transform: translate(-2px, 0);"></div>
                          <div class="square-shape" style="position: absolute; top: 0; left: 0; z-index: 2; transform: translate(2px, 0);"></div>
                        </template>
                        <!-- 混合事件：显示一个正方形和一个圆形 -->
                        <template v-else-if="hasPowerEvents(event.allEvents) && hasSurgeryEvents(event.allEvents)">
                          <div class="square-shape" style="position: absolute; top: 0; left: 0; z-index: 1; transform: translate(-2px, 0);"></div>
                          <div class="circle-shape" style="position: absolute; top: 0; left: 0; z-index: 2; transform: translate(2px, 0);"></div>
                        </template>
                        <!-- 纯手术事件：显示圆形 -->
                        <template v-else-if="hasSurgeryEvents(event.allEvents)">
                          <div class="circle-shape"></div>
                        </template>
                      </div>
                      <!-- 单个事件：根据事件类型显示对应符号 -->
                      <div v-else>
                        <div v-if="event.symbol === 'circle'" class="circle-shape"></div>
                        <div v-else class="square-shape"></div>
                      </div>
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

    <!-- 图表区域：手术状态机变化、网络延迟情况和操作数据汇总 -->
    <div class="charts-row" v-if="showCharts && (hasStateMachineData || hasNetworkLatencyData || hasOperationData)">
      <!-- 手术状态机变化卡片 -->
      <el-card class="state-machine-card" v-if="hasStateMachineData">
        <div class="section-header">
          {{$t('surgeryVisualization.stateMachineChanges')}}
        </div>
        <div class="chart-container">
          <TimeSeriesChart
            :series-data="stateMachineChartData"
            :series-name="$t('surgeryVisualization.stateMachine')"
            :height="300"
            :width="600"
            :y-axis-format="'integer'"
            :show-range-labels="true"
            :outer-padding="12"
            :grid-padding="{ left: 20, right: 20, top: 30,  containLabel: true }"
            line-color="#fbbf24"
            area-color="#fef3c7"
            area-color-end="#fde68a"
          />
        </div>
      </el-card>

      <!-- 远程手术：网络延迟情况和操作数据汇总切换 -->
      <div v-if="meta.is_remote" class="remote-surgery-section">
        <el-card class="remote-surgery-card">
          <a-tabs :activeKey="remoteDataView" @change="(key) => remoteDataView = key" class="remote-data-tabs">
            <a-tab-pane key="network" :disabled="!hasNetworkLatencyData">
              <template #tab>
                <span class="tab-title">{{$t('surgeryVisualization.networkLatency')}}</span>
              </template>
              <div v-if="hasNetworkLatencyData" class="chart-container">
                <TimeSeriesChart
                  :series-data="networkLatencyChartData"
                  :series-name="$t('surgeryVisualization.networkLatencyMs')"
                  :height="300"
                  :width="600"
                  :y-axis-format="'decimal'"
                  :show-range-labels="true"
                  :outer-padding="12"
                  :grid-padding="{ left: 20, right: 20, top: 30,  containLabel: true }"
                />
              </div>
            </a-tab-pane>
            
            <a-tab-pane key="operations" :disabled="!hasOperationData">
              <template #tab>
                <span class="tab-title">{{$t('surgeryVisualization.operationSummary')}}</span>
              </template>
              <div class="operations-summary">
                <OperationSummaryTable :operation-data="operationSummaryData" />
              </div>
            </a-tab-pane>
          </a-tabs>
        </el-card>
      </div>

      <!-- 非远程手术：操作数据汇总表 -->
      <el-card v-if="!meta.is_remote && hasOperationData" class="operations-card">
        <div class="section-header">
          {{$t('surgeryVisualization.operationSummary')}}
        </div>
        <div class="operations-summary">
          <OperationSummaryTable :operation-data="operationSummaryData" />
        </div>
      </el-card>
    </div>

    <!-- 安全报警记录卡片 -->
    <el-card class="faults-card" v-if="showCharts && meta.is_fault && faultRecords.length > 0">
      <div class="section-header">
        {{$t('surgeryVisualization.safetyAlerts')}}
      </div>
      <div class="faults-container">
        <el-table 
          :data="visibleFaultRows" 
          stripe 
          border 
          size="small"
          :max-height="400"
          class="faults-table"
        >
          <el-table-column prop="timestamp" :label="$t('surgeryVisualization.faultTime')" width="220" align="center">
            <template #default="{ row }">
              <span class="fault-time">{{ formatFaultTime(row.timestamp) }}</span>
            </template>
          </el-table-column>
          
          <el-table-column prop="error_code" :label="$t('surgeryVisualization.faultCode')" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="getFaultType(row.error_code)" size="small">
                {{ row.error_code }}
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column prop="explanation" :label="$t('surgeryVisualization.faultExplanation')" min-width="200">
            <template #default="{ row }">
              <span class="fault-explanation">{{ row.explanation || $t('surgeryVisualization.noExplanation') }}</span>
            </template>
          </el-table-column>
          
          <el-table-column prop="status" :label="$t('surgeryVisualization.status')" width="120" align="center">
            <template #default="{ row }">
              <el-tag 
                :type="row.status_key === 'processed' ? 'success' : 'danger'" 
                size="small"
                effect="dark"
              >
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="faultRecords.length > 5" style="text-align:center;margin:12px 0;">
          <el-button class="btn-secondary btn-sm" @click="showAllFaults = !showAllFaults">
            {{ showAllFaults ? $t('shared.collapse') : $t('shared.expand') }}
          </el-button>
        </div>
        
        <div class="faults-summary" v-if="faultRecords.length > 0">
          <el-alert
            :title="$t('surgeryVisualization.faultsSummary', { total: faultRecords.length, processed: getProcessedCount(), unprocessed: getUnprocessedCount() })"
            type="info"
            :closable="false"
            show-icon
          />
        </div>
      </div>
    </el-card>

    <!-- 全局Tooltip，放在页面根级别避免被容器裁剪 -->
    <div 
      v-if="hoveredSegment"
      class="custom-tooltip"
      :style="getTooltipStyle()"
    >
      <div class="tooltip-title">{{ getSegmentTooltipTitle(hoveredSegment) }}</div>
      <div class="tooltip-content">
        <div>{{$t('surgeryVisualization.tooltipUdi')}}: {{ hoveredSegment.udi || $t('surgeryVisualization.tooltipNoUdi') }}</div>
        <div>{{$t('surgeryVisualization.tooltipDuration')}}: {{ getSegmentDuration(hoveredSegment) }}{{$t('shared.minutes')}}</div>
        <div>{{$t('surgeryVisualization.tooltipInstall')}}: {{ formatSegmentTime(hoveredSegment.install_time || hoveredSegment.start_time) }}</div>
        <div>{{$t('surgeryVisualization.tooltipRemove')}}: {{ formatSegmentTime(hoveredSegment.remove_time || hoveredSegment.end_time) }}</div>
      </div>
    </div>
    
    <!-- 手术事件Tooltip，与器械一致样式 -->
    <div 
      v-if="hoveredEvent" 
      class="custom-tooltip" 
      :style="getTooltipStyle()"
    >
      <div class="tooltip-title">{{ hoveredEvent.isMerged ? `${$t('surgeryVisualization.mergedEvents')} (${hoveredEvent.allEvents.length})` : hoveredEvent.name }}</div>
      <div class="tooltip-content">
        <div v-if="hoveredEvent.isMerged && hoveredEvent.allEvents">
          <div v-for="event in hoveredEvent.allEvents" :key="event.time" class="event-item">
            <div class="event-name">{{ event.name }}</div>
            <div class="event-time">{{ formatEventTime(event) }}</div>
          </div>
        </div>
        <div v-else>
          <div>{{$t('surgeryVisualization.time')}}: {{ formatEventTime(hoveredEvent) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api'
import { normalizeSurgeryData as normalize } from '../utils/visualizationConfig'
import { formatTime, loadServerTimezone } from '../utils/timeFormatter'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import OperationSummaryTable from '../components/OperationSummaryTable.vue'
import { Tabs, TabPane } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'

export default {
  name: 'SurgeryVisualization',
  components: {
    TimeSeriesChart,
    OperationSummaryTable,
    Tabs,
    TabPane
  },
  setup() {
    // 移除不需要的图表引用

    const loading = ref(false)
    const { t, locale } = useI18n()
    const surgeryIdInput = ref('')
    const route = useRoute()

    const meta = reactive({ surgery_id: null, start_time: null, end_time: null, is_remote: false, is_fault: false })
    const alertRows = ref([])
    const showAllAlerts = ref(false)
    const currentData = ref(null)
    const armsData = ref([
      { name: t('surgeryVisualization.armTimeline'), arm_id: 0, segments: [] },
      { name: t('surgeryVisualization.armN', { n: 1 }), arm_id: 1, segments: [] },
      { name: t('surgeryVisualization.armN', { n: 2 }), arm_id: 2, segments: [] },
      { name: t('surgeryVisualization.armN', { n: 3 }), arm_id: 3, segments: [] },
      { name: t('surgeryVisualization.armN', { n: 4 }), arm_id: 4, segments: [] }
    ])
    
    // 时间线事件数据
    const timelineEvents = ref([])
    
    // 时间基准：第一次开机时间往前推1小时
    const timelineBaseTime = ref(null)
    
    // 当前悬停的器械段
    const hoveredSegment = ref(null)
    const hoveredEvent = ref(null)
    const tooltipPosition = ref({ x: 0, y: 0 })
    
    // 缩放控制
    const zoomLevel = ref(1) // 缩放级别，1为正常大小（撑满容器）
    const minZoom = 1 // 最小缩放（默认视图，撑满容器）
    const maxZoom = 5 // 最大缩放
    
    // 拖拽控制
    const isDragging = ref(false)
    const dragStartX = ref(0)
    const dragStartScrollLeft = ref(0)
    const dragVelocity = ref(0)
    const lastDragTime = ref(0)
    const inertiaAnimationId = ref(null)
    
    // 图表相关
    const showCharts = ref(false)
    const hasStateMachineData = ref(false)
    const hasNetworkLatencyData = ref(false)
    const hasOperationData = ref(false)
    const stateMachineChartData = ref([])
    const networkLatencyChartData = ref([])
    const operationSummaryData = ref({})
    
    // 远程手术数据视图切换
    const remoteDataView = ref('network')
    
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
      const toolType = segment.tool_type || segment.instrument_type || t('surgeryVisualization.unknownInstrument')
      const udi = segment.udi || t('surgeryVisualization.tooltipNoUdi')
      
      // 转换UTC时间为本地时间显示
      const installTime = segment.install_time || segment.start_time
      const removeTime = segment.remove_time || segment.end_time
      
      const formatTime = (timeStr) => {
        if (!timeStr) return t('surgeryVisualization.unknown')
        const localTime = getLocalTime(timeStr)
        if (!localTime) return t('surgeryVisualization.unknown')
        return localTime.toLocaleString(locale?.value || document?.documentElement?.lang || 'zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      }
      
      return `${toolType}\n\n${t('surgeryVisualization.tooltipUdi')}: ${udi}\n${t('surgeryVisualization.tooltipDuration')}: ${duration}${t('shared.minutes')}\n${t('surgeryVisualization.tooltipInstall')}: ${formatTime(installTime)}\n${t('surgeryVisualization.tooltipRemove')}: ${formatTime(removeTime)}`
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
      const rowHeight = 50 // 每行高度
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
        return Math.max(1, 2) // 最小宽度
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
      return 25// 固定高度
    }
    
    
    // 处理器械段点击
    const handleSegmentClick = (segment, event) => {
      event.stopPropagation()
      // TODO: 显示抽屉
    }
    
    // 处理器械段悬停
    const handleSegmentHover = (segment, event) => {
      hoveredSegment.value = segment
      tooltipPosition.value = { x: event.clientX + 5, y: event.clientY - 5 }
    }
    
    // 处理器械段离开
    const handleSegmentLeave = (segment, event) => {
      hoveredSegment.value = null
    }

    // 统一的鼠标移动处理，确保tooltip跟随鼠标
    const handleMouseMove = (event) => {
      tooltipPosition.value = { x: event.clientX + 5, y: event.clientY - 5 }
    }

    // 事件悬停进入/离开
    const handleEventHover = (eventObj, event) => {
      hoveredEvent.value = eventObj
      tooltipPosition.value = { x: event.clientX + 5, y: event.clientY - 5 }
    }
    const handleEventLeave = () => { hoveredEvent.value = null }
    
    // 获取tooltip样式
    const getTooltipStyle = () => {
      return {
        position: 'fixed',
        left: `${tooltipPosition.value.x}px`,
        top: `${tooltipPosition.value.y}px`,
        zIndex: 9999
      }
    }
    // 事件时间与星期格式化（与器械tooltip一致）
    const formatEventTime = (ev) => {
      const localTime = getLocalTime(ev?.time)
      if (!localTime) return t('surgeryVisualization.unknown')
      return localTime.toLocaleString(locale?.value || document?.documentElement?.lang || 'zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      })
    }
    const getEventWeekday = (ev) => {
      const localTime = getLocalTime(ev?.time)
      if (!localTime) return ''
      return localTime.toLocaleDateString(locale?.value || document?.documentElement?.lang || 'zh-CN', { weekday: 'long' })
    }
    
    // 获取器械段tooltip标题
    const getSegmentTooltipTitle = (segment) => {
      return segment.tool_type || segment.instrument_type || t('surgeryVisualization.unknownInstrument')
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
      if (!timeStr) return t('surgeryVisualization.unknown')
      const localTime = getLocalTime(timeStr)
      if (!localTime) return t('surgeryVisualization.unknown')
      return localTime.toLocaleString(locale?.value || document?.documentElement?.lang || 'zh-CN', {
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
      
      if (events.length === 0) return []
      
      // 按时间排序
      events.sort((a, b) => {
        const timeA = getLocalTime(a.time)?.getTime() || 0
        const timeB = getLocalTime(b.time)?.getTime() || 0
        return timeA - timeB
      })
      
      // 基于视觉重合检测合并事件（响应缩放变化）
      return mergeEventsByVisualOverlap(events, hour)
    }
    
    // 基于视觉重合检测合并事件
    const mergeEventsByVisualOverlap = (events, hourIndex) => {
      if (events.length <= 1) return events
      
      // 获取当前容器宽度（考虑缩放）
      const armColumnWidth = 120
      const baseContainerWidth = window.innerWidth - armColumnWidth
      const scaledContainerWidth = baseContainerWidth * zoomLevel.value
      
      // 计算每个事件的视觉位置
      const eventPositions = events.map(event => {
        const eventTime = getLocalTime(event.time)
        if (!eventTime) return { event, left: 50, right: 50 }
        
        const eventMinute = eventTime.getMinutes()
        const positionInHour = (eventMinute / 60) * 100
        const leftPosition = Math.max(0, Math.min(100, positionInHour))
        
        // 估算标签宽度（基于显示名称长度）
        const displayName = event.isMerged ? `+${event.allEvents.length}` : event.name
        const baseWidth = Math.max(40, displayName.length * 8 + 16) // 每个字符约8px + 边距
        const scaledWidth = baseWidth * zoomLevel.value
        
        // 计算在缩放后容器中的位置
        const left = leftPosition
        const right = leftPosition + (scaledWidth / scaledContainerWidth * 100)
        
        return { event, left, right, displayName }
      })
      
      // 检测重合并合并（30px间距检测）
      const mergedGroups = []
      let currentGroup = [eventPositions[0]]
      
      for (let i = 1; i < eventPositions.length; i++) {
        const current = eventPositions[i]
        const lastInGroup = currentGroup[currentGroup.length - 1]
        
        // 计算时间差（分钟）
        const currentTime = getLocalTime(current.event.time)
        const lastTime = getLocalTime(lastInGroup.event.time)
        const timeDiffMinutes = (currentTime.getTime() - lastTime.getTime()) / (1000 * 60)
        
        // 将时间差转换为像素间距
        const totalHours = getTotalHours()
        const hourCellWidth = scaledContainerWidth / totalHours
        const minuteWidth = hourCellWidth / 60 // 每分钟的像素宽度
        const pixelSpacing = timeDiffMinutes * minuteWidth
        
        // 打印调试信息
        console.log(`🔍 事件间距检测:`, {
          event1: lastInGroup.event.name,
          event2: current.event.name,
          timeDiffMinutes: timeDiffMinutes.toFixed(2) + '分钟',
          pixelSpacing: pixelSpacing.toFixed(2) + 'px',
          zoomLevel: zoomLevel.value.toFixed(2),
          scaledContainerWidth: scaledContainerWidth.toFixed(2) + 'px',
          hourCellWidth: hourCellWidth.toFixed(2) + 'px',
          minuteWidth: minuteWidth.toFixed(2) + 'px/分钟',
          shouldMerge: pixelSpacing < 30 ? '是' : '否'
        })
        
        // 如果间距小于30px，则合并
        if (pixelSpacing < 20) {
          currentGroup.push(current)
        } else {
          // 不重合，处理当前组并开始新组
          mergedGroups.push(processEventGroup(currentGroup))
          currentGroup = [current]
        }
      }
      
      // 处理最后一组
      if (currentGroup.length > 0) {
        mergedGroups.push(processEventGroup(currentGroup))
      }
      
      const result = mergedGroups.flat()
      
      // 打印最终合并结果
      console.log(`📊 事件合并结果 (缩放级别: ${zoomLevel.value.toFixed(2)}):`, {
        originalEvents: events.length,
        finalEvents: result.length,
        mergedEvents: result.filter(e => e.isMerged).length,
        mergedDetails: result.filter(e => e.isMerged).map(e => ({
          name: e.name,
          count: e.allEvents.length,
          events: e.allEvents.map(ev => ev.name)
        }))
      })
      
      return result
    }
    
    // 处理事件组，决定是否合并显示
    const processEventGroup = (eventGroup) => {
      if (eventGroup.length === 1) {
        return [eventGroup[0].event]
      }
      
      // 多个事件重合，合并显示为"+X"格式
      const firstEvent = eventGroup[0].event
      return [{
        ...firstEvent,
        name: `+${eventGroup.length}`,
        isMerged: true,
        allEvents: eventGroup.map(item => item.event)
      }]
    }
    
    // 获取事件工具提示
    const getEventTooltip = (event) => {
      // 调试：确保事件对象存在
      if (!event) return t('shared.error')
      
      if (event.isMerged && event.allEvents) {
        // 合并事件的工具提示
        const eventDetails = event.allEvents.map(e => {
          const localTime = getLocalTime(e.time)
          if (!localTime) return e.name
          
          const timeStr = localTime.toLocaleString(locale?.value || document?.documentElement?.lang || 'zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
          
          return `${e.name}\n${t('surgeryVisualization.time')}: ${timeStr}`
        }).join('\n\n')
        
        return `${t('surgeryVisualization.mergedEvents')} (${event.allEvents.length}):\n\n${eventDetails}`
      }
      
      // 单个事件的工具提示
      const localTime = getLocalTime(event.time)
      if (!localTime) return `${event.name}\n${t('surgeryVisualization.time')}: ${t('shared.error')}`
      
      const timeStr = localTime.toLocaleString(locale?.value || document?.documentElement?.lang || 'zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      
      const weekDay = localTime.toLocaleDateString(locale?.value || document?.documentElement?.lang || 'zh-CN', { weekday: 'long' })
      
      return `${event.name}\n${t('surgeryVisualization.time')}: ${timeStr}\n${t('surgeryVisualization.weekday')}: ${weekDay}`
    }
    
    // 检查事件列表中是否包含电源事件
    const hasPowerEvents = (events) => {
      return events.some(event => event.type === 'power_on' || event.type === 'power_off')
    }
    
    // 检查事件列表中是否包含手术事件
    const hasSurgeryEvents = (events) => {
      return events.some(event => event.type === 'surgery_start' || event.type === 'surgery_end')
    }
    
    
    // 获取符号样式类
    const getSymbolClass = (symbol, isMerged, allEvents) => {
      if (isMerged && allEvents) {
        // 合并事件：根据包含的事件类型决定样式
        const hasPower = hasPowerEvents(allEvents)
        const hasSurgery = hasSurgeryEvents(allEvents)
        
        if (hasPower && hasSurgery) {
          return 'symbol-merged-mixed' // 混合类型
        } else if (hasPower) {
          return 'symbol-merged-power' // 纯电源类型
        } else if (hasSurgery) {
          return 'symbol-merged-surgery' // 纯手术类型
        }
      }
      
      // 单个事件
      return symbol === 'circle' ? 'symbol-circle' : 'symbol-square'
    }
    
    // 获取事件容器样式（为整个小时容器设置基础样式）
    const getEventStyle = (hour) => {
      return {
        position: 'relative',
        height: '100%',
        width: '100%'
      }
    }
    
    // 获取单个事件的样式（精确定位，考虑时区）
    const getSingleEventStyle = (event, hourIndex) => {
      const startHour = getTableStartHour()
      const actualHour = startHour + hourIndex
      const eventHour = getHourFromTime(event.time)
      
      if (eventHour !== actualHour) {
        return { display: 'none' }
      }
      
      const eventTime = getLocalTime(event.time)
      
      if (!eventTime) {
        return { left: '50%', transform: 'translate(-50%, -50%)' }
      }
      
      // 直接使用事件时间的小时和分钟计算位置
      const eventHourTime = eventTime.getHours()
      const eventMinute = eventTime.getMinutes()
      
      // 计算在小时内的位置百分比
      const positionInHour = (eventMinute / 60) * 100
      const leftPosition = Math.max(0, Math.min(100, positionInHour))
      
      
      return {
        position: 'absolute',
        left: `${leftPosition}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10
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
    
    // 从时间字符串获取分钟数（本地时间，支持跨天，精确到秒）
    const getMinutesFromTime = (timeStr) => {
      if (!timeStr) return 0
      const localTime = getLocalTime(timeStr)
      if (!localTime) return 0
      
      // 计算精确到秒的分钟数（分钟 + 秒/60）
      const minutes = localTime.getMinutes()
      const seconds = localTime.getSeconds()
      const preciseMinutes = minutes + (seconds / 60)
      
      // 检查是否跨天
      if (timelineBaseTime.value) {
        const baseTime = getLocalTime(timelineBaseTime.value)
        if (baseTime) {
          const baseDate = baseTime.getDate()
          const currentDate = localTime.getDate()
          
          // 如果日期不同，需要调整分钟数
          if (currentDate > baseDate) {
            return preciseMinutes + (24 * 60) // 跨天时+24小时=1440分钟
          }
        }
      }
      
      return preciseMinutes
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
        case 1: return '#2752F1E5'  // 1号臂 - 蓝色
        case 2: return '#30B33B'  // 2号臂 - 绿色
        case 3: return '#FEBB0F99'  // 3号臂 - 金色
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
    
    // 获取线框颜色（比背景色更深的颜色）
    const getStrokeColor = (armId) => {
      switch (armId) {
        case 1: return '#0000001A'  // 1号臂 - 深蓝色线框
        case 2: return '#0000001A'  // 2号臂 - 深绿色线框
        case 3: return '#0000001A'  // 3号臂 - 深金色线框
        case 4: return '#0000001A'  // 4号臂 - 深橙红色线框
        default: return '#4A148C' // 默认深紫色线框
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
      if (!toolType) return t('surgeryVisualization.unknownInstrument')
      
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
        const armName = arm.name || t('surgeryVisualization.armN', { n: armId })
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
            name: t('surgeryVisualization.armN', { n: i }),
            arm_id: i,
            segments: []
          })
        }
      }
      
      // 更新armsData，手术时间线在最前面
      armsData.value = [
        { name: t('surgeryVisualization.armTimeline'), arm_id: 0, segments: [] },
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
            name: t('surgeryVisualization.powerOn', { index: index + 1 }), 
            type: 'power_on', 
            symbol: 'square' 
          })
        }
        if (cycle.off_time) {
          events.push({ 
            time: cycle.off_time, 
            name: t('surgeryVisualization.powerOff', { index: index + 1 }), 
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
        events.push({ time: previousSurgeryEnd, name: t('surgeryVisualization.previousSurgeryEnd'), type: 'previous_end', symbol: 'circle' })
      }
      if (surgeryStart) {
        events.push({ time: surgeryStart, name: t('surgeryVisualization.surgeryStart'), type: 'surgery_start', symbol: 'circle' })
      }
      if (surgeryEnd) {
        events.push({ time: surgeryEnd, name: t('surgeryVisualization.surgeryEnd'), type: 'surgery_end', symbol: 'circle' })
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
      hasStateMachineData.value = !!(surgeryStatsForCharts.state_machine)
      hasNetworkLatencyData.value = !!(surgeryStatsForCharts.network_latency_ms && meta.is_remote)
      
      // 检查是否有操作数据
      const operationMetricKeys = [
        'endoscope_pedal',
        'foot_clutch',
        'left_hand_clutch',
        'right_hand_clutch',
        'arm_switch_count'
      ]
      const hasAnyOperationMetric = operationMetricKeys.some(key => surgeryStatsForCharts[key] !== undefined && surgeryStatsForCharts[key] !== null)
      hasOperationData.value = hasAnyOperationMetric
      
      // 设置操作数据（即使值为0也视为有效）
      if (hasAnyOperationMetric) {
        operationSummaryData.value = operationMetricKeys.reduce((acc, key) => {
          const val = surgeryStatsForCharts[key]
          acc[key] = Number.isFinite(Number(val)) ? Number(val) : 0
          return acc
        }, {})
      } else {
        operationSummaryData.value = {}
      }
      
      showCharts.value = hasStateMachineData.value || hasNetworkLatencyData.value || hasOperationData.value
      
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
        
        console.log('🔧 获取到的手术数据:', data)
        
        // 数据已经通过适配器处理，直接使用
        renderAll(data)
      } catch (error) {
        // 解析失败，静默处理
      }
    }

    const loadById = async () => {
      if (!surgeryIdInput.value) return
      loading.value = true
      try {
        const resp = await api.surgeries.get(surgeryIdInput.value)
        const item = resp.data?.data || resp.data
        
        console.log('🔧 获取到的手术数据:', item)
        
        // 数据库数据也需要通过适配器处理
        const { adaptSurgeryData, validateAdaptedData } = await import('../utils/surgeryDataAdapter')
        const adaptedData = adaptSurgeryData(item)
        
        if (!adaptedData || !validateAdaptedData(adaptedData)) {
          throw new Error('数据适配或验证失败')
        }
        
        adaptedData._dataSource = 'database_record'
        adaptedData._originalData = item
        
        renderAll(adaptedData)
      } catch (e) {
        // API获取失败，静默处理
      } finally {
        loading.value = false
      }
    }

    const handleResize = () => {
      // 图表大小调整现在由TimeSeriesChart组件内部处理
    }
    
    // 初始化图表
    const initCharts = (data) => {
      const surgeryStats = data.surgery_stats || {}
      
      // 处理状态机数据
      if (surgeryStats.state_machine && Array.isArray(surgeryStats.state_machine)) {
        stateMachineChartData.value = processStateMachineData(surgeryStats.state_machine)
      }
      
      // 处理网络延迟数据（仅远程手术）
      if (surgeryStats.network_latency_ms && Array.isArray(surgeryStats.network_latency_ms) && meta.is_remote) {
        networkLatencyChartData.value = processNetworkLatencyData(surgeryStats.network_latency_ms)
      }
      
      // 处理故障数据
      if (surgeryStats.faults && Array.isArray(surgeryStats.faults)) {
        faultRecords.value = processFaultData(surgeryStats.faults)
      }
    }
    
    
    
    // 处理状态机数据
    const processStateMachineData = (stateMachineData) => {
      if (!Array.isArray(stateMachineData)) {
        return []
      }
      
      try {
        const processedData = stateMachineData.map(item => {
          // 处理UTC时间转换 - 使用与手术时间线相同的时区转换逻辑
          const timeValue = item.time || item.timestamp
          if (!timeValue) {
            return [Date.now(), 0]
          }
          
          // 使用 getLocalTime 函数进行时区转换
          const localTime = getLocalTime(timeValue)
          if (!localTime) {
            return [Date.now(), 0]
          }
          
          // 提取状态值（括号内的数字部分）
          const stateValue = item.state || ''
          const stateNumber = extractStateNumber(stateValue)
          
          return [localTime.getTime(), stateNumber]
        })
        
        return processedData
      } catch (error) {
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
        return []
      }
      
      try {
        return latencyData.map(item => {
          // 处理UTC时间转换 - 使用与手术时间线相同的时区转换逻辑
          const timeValue = item.time || item.timestamp
          if (!timeValue) {
            return [Date.now(), 0]
          }
          
          // 使用 getLocalTime 函数进行时区转换
          const localTime = getLocalTime(timeValue)
          if (!localTime) {
            return [Date.now(), 0]
          }
          
          // 使用新的latency字段
          const latencyValue = item.latency || item.value || 0
          return [localTime.getTime(), latencyValue]
        })
      } catch (error) {
        return []
      }
    }
    
    // 处理故障数据
    const processFaultData = (faultsData) => {
      if (!Array.isArray(faultsData)) {
        return []
      }
      
      try {
        // 对故障码进行去重处理（基于故障码）
        const faultMap = new Map()
        
        faultsData.forEach(fault => {
          const errorCode = fault.error_code
          if (!errorCode) return
          
          // 规范化处理状态为布尔/键值
          const isProcessed = (() => {
            if (fault.status === true) return true
            if (fault.resolved === true || fault.is_resolved === true) return true
            if (typeof fault.status === 'string') {
              const s = fault.status.toLowerCase()
              return s === 'processed' || s === 'resolved' || s === '已处理'
            }
            return false
          })()
          const statusText = isProcessed ? t('surgeryVisualization.statusProcessed') : t('surgeryVisualization.statusUnprocessed')

          // 如果故障码已存在，保留最新的记录
          if (!faultMap.has(errorCode) || new Date(fault.timestamp) > new Date(faultMap.get(errorCode).timestamp)) {
            faultMap.set(errorCode, {
              timestamp: fault.timestamp,
              error_code: fault.error_code,
              explanation: fault.explanation || t('surgeryVisualization.noExplanation'),
              status: statusText,
              status_key: isProcessed ? 'processed' : 'unprocessed'
            })
          }
        })
        
        // 转换为数组并按时间排序
        return Array.from(faultMap.values()).sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
        )
      } catch (error) {
        return []
      }
    }
    
    // 格式化故障时间
    const formatFaultTime = (timestamp) => {
      if (!timestamp) return t('surgeryVisualization.unknownTime')
      try {
        const date = new Date(timestamp)
        return date.toLocaleString(locale?.value || document?.documentElement?.lang || 'zh-CN', {
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
      return faultRecords.value.filter(fault => fault.status_key === 'processed').length
    }
    
    // 获取未处理故障数量
    const getUnprocessedCount = () => {
      return faultRecords.value.filter(fault => fault.status_key !== 'processed').length
    }

    // 故障表手动折叠/展开（默认最多显示5条）
    const showAllFaults = ref(false)
    const visibleFaultRows = computed(() => showAllFaults.value ? faultRecords.value : faultRecords.value.slice(0, 5))
    
    // 处理鼠标滚轮缩放
    const handleWheel = (event) => {
      // 检查是否在时间线容器内
      const container = event.currentTarget
      if (!container || !container.classList.contains('timeline-container')) {
        return
      }
      
      // 如果正在拖拽，不处理滚轮事件
      if (isDragging.value) {
        return
      }
      
      // 阻止默认滚动行为，但只在必要时
      if (event.cancelable !== false) {
        event.preventDefault()
        event.stopPropagation()
      }
      
      const armColumnWidth = 120
      const rect = container.getBoundingClientRect()
      const mouseXInContainer = event.clientX - rect.left
      // 鼠标在时间区域内的相对位置（去除左侧活动名称列）
      const mouseXInTime = Math.max(0, mouseXInContainer - armColumnWidth)
      const viewportTimeWidth = Math.max(1, container.clientWidth - armColumnWidth)
      
      // 基础内容宽度（未缩放的时间区域宽度）
      const baseWidth = viewportTimeWidth
      const oldContentWidth = baseWidth * zoomLevel.value
      
      // 计算鼠标锚点在内容中的比例位置（0~1）
      const anchorRatio = (container.scrollLeft + mouseXInTime) / Math.max(1, oldContentWidth)
      
      // 计算新的缩放级别
      const delta = event.deltaY
      const zoomFactor = delta > 0 ? 0.9 : 1.1 // 向下滚动缩小，向上滚动放大
      const newZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel.value * zoomFactor))
      
      if (newZoom === zoomLevel.value) {
        return
      }
      
      zoomLevel.value = newZoom
      const newContentWidth = baseWidth * newZoom
      
      // 期望保持鼠标所在的时间点不动，计算新的scrollLeft
      let newScrollLeft = anchorRatio * newContentWidth - mouseXInTime
      const maxScrollLeft = Math.max(0, newContentWidth - viewportTimeWidth)
      newScrollLeft = Math.max(0, Math.min(maxScrollLeft, newScrollLeft))
      
      // 在下一帧应用滚动与强制刷新
      nextTick(() => {
        container.scrollLeft = newScrollLeft
        
        // 强制更新SVG内容，避免滞后
        const svg = document.querySelector('.timeline-overlay')
        if (svg) {
          svg.style.display = 'none'
          svg.offsetHeight // 触发重排
          svg.style.display = ''
        }
        
        // 强制重新计算事件合并状态
        timelineEvents.value = [...timelineEvents.value]
      })
    }
    
    // 重置缩放
    const resetZoom = () => {
      zoomLevel.value = 1
    }
    
    // 拖拽开始
    const handleDragStart = (event) => {
      // 只在缩放状态下启用拖拽
      if (zoomLevel.value <= 1) return
      
      // 检查是否点击在可拖拽区域（避免与器械段点击冲突）
      if (event.target.closest('.instrument-segment-svg') || 
          event.target.closest('.timeline-event') ||
          event.target.closest('.arm-column') ||
          event.target.closest('.arm-cell')) {
        return
      }
      
      // 停止之前的惯性滚动
      stopInertiaScroll()
      
      // 阻止默认行为
      event.preventDefault()
      
      isDragging.value = true
      dragStartX.value = event.clientX
      dragStartScrollLeft.value = event.currentTarget.scrollLeft
      dragVelocity.value = 0
      lastDragTime.value = Date.now()
      
      // 添加拖拽样式
      event.currentTarget.style.cursor = 'grabbing'
      event.currentTarget.style.userSelect = 'none'
    }
    
    // 拖拽进行中
    const handleDragMove = (event) => {
      if (!isDragging.value) return
      
      event.preventDefault()
      
      const container = event.currentTarget
      const deltaX = event.clientX - dragStartX.value
      const newScrollLeft = dragStartScrollLeft.value - deltaX
      
      // 计算拖拽速度（用于惯性滚动）
      const currentTime = Date.now()
      const timeDelta = currentTime - lastDragTime.value
      if (timeDelta > 0) {
        dragVelocity.value = deltaX / timeDelta
        lastDragTime.value = currentTime
      }
      
      // 应用滚动
      container.scrollLeft = Math.max(0, newScrollLeft)
    }
    
    // 拖拽结束
    const handleDragEnd = (event) => {
      if (!isDragging.value) return
      
      isDragging.value = false
      
      // 恢复样式
      event.currentTarget.style.cursor = 'grab'
      event.currentTarget.style.userSelect = ''
      
      // 惯性滚动 - 优化参数，提供更精确的控制
      if (Math.abs(dragVelocity.value) > 8.0) {  // 大幅提高触发阈值
        applyInertiaScroll(event.currentTarget, dragVelocity.value * 0.3)  // 大幅减少惯性强度
      }
    }
    
    // 惯性滚动
    const applyInertiaScroll = (container, velocity) => {
      // 取消之前的惯性动画
      if (inertiaAnimationId.value) {
        cancelAnimationFrame(inertiaAnimationId.value)
      }
      
      const friction = 0.75  // 更强的摩擦力，更快停止
      const minVelocity = 0.5  // 更高的停止阈值
      const maxVelocity = 8  // 更严格的速度限制
      
      // 限制速度范围
      velocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity))
      
      const animate = () => {
        if (Math.abs(velocity) < minVelocity) {
          inertiaAnimationId.value = null
          return
        }
        
        container.scrollLeft -= velocity
        velocity *= friction
        
        inertiaAnimationId.value = requestAnimationFrame(animate)
      }
      
      inertiaAnimationId.value = requestAnimationFrame(animate)
    }
    
    // 停止惯性滚动
    const stopInertiaScroll = () => {
      if (inertiaAnimationId.value) {
        cancelAnimationFrame(inertiaAnimationId.value)
        inertiaAnimationId.value = null
      }
    }
    
    // 鼠标进入容器
    const handleMouseEnter = (event) => {
      if (zoomLevel.value > 1) {
        event.currentTarget.style.cursor = 'grab'
      }
    }
    
    // 鼠标离开容器
    const handleMouseLeave = (event) => {
      // 如果正在拖拽，结束拖拽
      if (isDragging.value) {
        handleDragEnd(event)
      }
      
      // 恢复默认光标
      event.currentTarget.style.cursor = 'default'
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
    
    // 获取时间单元格容器样式 - 与头部保持一致
    const getTimeCellsStyle = () => {
      // 直接使用与头部相同的样式，确保完全一致
      return getTimeColumnsStyle()
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
          console.log('🔧 获取到的手术数据:', parsed)
        } catch (e) {
          // 解析失败，静默处理
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
      // 图表实例现在由TimeSeriesChart组件内部管理
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
      // 故障表折叠/展开
      showAllFaults,
      visibleFaultRows,
      timelineDisplay, 
      armsData, 
      timelineEvents,
      hoveredSegment,
      hoveredEvent,
      hasInstrumentInHour,
      getSegmentsInHour,
      getSegmentStyle,
      getSegmentTooltip,
      hasEventInHour,
      getEventText,
      getEventClass,
      getEventType,
      getEventStyle,
      getSingleEventStyle,
      getEventsInHour,
      getEventTooltip,
      getSymbolClass,
      hasPowerEvents,
      hasSurgeryEvents,
      getTimeColumnText,
      getTotalHours,
      getTableStartHour,
      getHourRange,
      zoomLevel,
      handleWheel,
      resetZoom,
      handleDragStart,
      handleDragMove,
      handleDragEnd,
      handleMouseEnter,
      handleMouseLeave,
      stopInertiaScroll,
      isDragging,
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
      handleMouseMove,
      handleEventHover,
      handleEventLeave,
      handleOverlayClick,
      getTooltipStyle,
      getSegmentTooltipTitle,
      formatEventTime,
      getEventWeekday,
      processEventGroup,
      getSegmentDuration,
      formatSegmentTime,
      getArmColor,
      getTextColor,
      getStrokeColor,
      shouldShowInstrumentText,
      getSegmentTextX,
      getSegmentTextY,
      getInstrumentDisplayName,
      // 图表相关
      showCharts,
      hasStateMachineData,
      hasNetworkLatencyData,
      hasOperationData,
      stateMachineChartData,
      networkLatencyChartData,
      operationSummaryData,
      remoteDataView,
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

/* 远程手术标签样式 */
.surgery-tag[color="green"] {
  background-color: #bfbfbf !important;
  color: white !important;
  border: none !important;
}

/* 更具体的选择器来覆盖Element Plus默认样式 */
.title-card .surgery-tag[color="green"] {
  background-color: #bfbfbf !important;
  color: white !important;
  border: none !important;
}

/* 使用类名选择器 */
.surgery-tag.remote-tag {
  background-color: #bfbfbf !important;
  color: white !important;
  border: none !important;
}

/* 强制覆盖Element Plus的默认样式 */
.title-card .el-tag.remote-tag {
  background-color: #bfbfbf !important;
  color: white !important;
  border: none !important;
}

.title-card .el-tag.remote-tag .el-tag__content {
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
  margin-bottom: 28px; 
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
  /* 确保缩放时位置稳定 */
  display: flex;
  flex-direction: column;
  /* 拖拽相关样式 */
  cursor: default;
  user-select: none;
  transition: cursor 0.2s ease;
}

/* 拖拽状态样式 */
.timeline-container.dragging {
  cursor: grabbing !important;
  user-select: none !important;
}

/* 缩放状态下的拖拽样式 */
.timeline-container[data-zoom-level]:not([data-zoom-level="1"]) {
  cursor: grab;
}

.timeline-container[data-zoom-level]:not([data-zoom-level="1"]):hover {
  cursor: grab;
}

.timeline-header {
  display: flex;
  background: #fafafa;
  border-bottom: 2px solid #d9d9d9;
  min-width: max-content; /* 确保容器宽度不小于内容宽度 */
  /* 确保与body部分宽度一致 */
  flex-shrink: 0;
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
  position: sticky; /* 冻结活动名称列 */
  left: 0;
  z-index: 30;
  box-shadow: 1px 0 0 0 #d9d9d9; /* 分隔线阴影，保证缩放时可见 */
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
  /* 确保与header部分宽度一致 */
  flex-shrink: 0;
  min-width: max-content; /* 确保容器宽度不小于内容宽度 */
}

.timeline-row {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
  min-height: 50px;
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
  position: sticky; /* 冻结活动名称列 */
  left: 0;
  z-index: 28;
  box-shadow: 1px 0 0 0 #f0f0f0; /* 分隔线阴影，保证缩放时可见 */
}

.time-cells {
  position: relative;
  min-height: 50px;
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


/* 时间线事件容器 */
.timeline-event-container {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 25;  /* 提高z-index，确保在SVG覆盖层之上 */
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
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.timeline-event:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

/* 事件符号容器 */
.event-symbol {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.event-symbol:hover {
  transform: scale(1.2);
}

/* 圆形符号（手术相关事件） */
.circle-shape {
  width: 12px;
  height: 12px;
  border: 2px solid #ff4d4f;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px #ffffff;
}

/* 方形符号（开机/关机事件） */
.square-shape {
  width: 12px;
  height: 12px;
  border: 2px solid #1890ff;
  background: #ffffff;
  border-radius: 2px;
  box-shadow: 0 0 0 1px #ffffff;
}

/* 合并符号容器 */
.merged-symbols {
  position: relative;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 合并符号中的方形（电源事件） */
.merged-symbols .square-shape {
  position: absolute;
  top: 0;
  left: 0;
  width: 12px;
  height: 12px;
  border: 2px solid #1890ff;
  background: #ffffff;
  border-radius: 2px;
  box-shadow: 0 0 0 1px #ffffff;
}

/* 合并符号中的圆形（手术事件） */
.merged-symbols .circle-shape {
  position: absolute;
  top: 0;
  left: 0;
  width: 12px;
  height: 12px;
  border: 2px solid #ff4d4f;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px #ffffff;
}

/* 混合类型合并符号：重叠显示 */
.symbol-merged-mixed .merged-symbols {
  position: relative;
}

.symbol-merged-mixed .merged-symbols .square-shape {
  position: absolute;
  top: 0;
  left: 0;
  width: 12px;
  height: 12px;
  border: 2px solid #1890ff;
  background: #ffffff;
  border-radius: 2px;
  box-shadow: 0 0 0 1px #ffffff;
  z-index: 1;
  transform: translate(-2px, 0); /* 被覆盖的往x轴负方向偏移 */
}

.symbol-merged-mixed .merged-symbols .circle-shape {
  position: absolute;
  top: 0;
  left: 0;
  width: 12px;
  height: 12px;
  border: 2px solid #ff4d4f;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px #ffffff;
  z-index: 2;
  transform: translate(2px, 0); /* 覆盖的往x轴正方向偏移 */
}

/* 纯电源类型合并符号：两个线框正方形在X方向有小偏差 */
.symbol-merged-power .merged-symbols {
  position: relative;
}

.symbol-merged-power .merged-symbols .square-shape {
  position: absolute;
  top: 0;
  left: 0;
  width: 12px;
  height: 12px;
  border: 2px solid #1890ff;
  background: #ffffff;
  border-radius: 2px;
  box-shadow: 0 0 0 1px #ffffff;
  z-index: 1;
}

.symbol-merged-power .merged-symbols .square-shape:last-child {
  transform: translate(3px, 0); /* X方向偏移3px */
  z-index: 2;
}

/* 纯手术类型合并符号 */
.symbol-merged-surgery .merged-symbols .circle-shape {
  border-color: #ff4d4f;
}

/* 事件标签 */
.event-label {
  font-size: 10px;
  font-weight: 500;
  color: #333;
  background: transparent;  /* 改为透明背景 */
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  text-align: center;
  border: none;  /* 去掉边框 */
}

/* 合并事件标签样式 */
.timeline-event[data-merged="true"] .event-label {
  background: transparent;  /* 改为透明背景 */
  color: #856404;
  font-weight: 600;
  border: none;  /* 去掉边框 */
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
  pointer-events: none;  /* 默认不响应事件，让事件穿透到下层 */
  z-index: 20;
}

/* SVG器械段样式 */
.instrument-segment-svg {
  cursor: pointer;
  transition: all 0.3s ease;
  stroke-dasharray: none;
  pointer-events: auto;  /* 确保器械段可以响应事件 */
  opacity: 0.9;
}

.instrument-segment-svg:hover {
  opacity: 1;
  filter: brightness(0.75) saturate(1.2);
  stroke-width: 3;
  transform: translateY(-1px);
}

/* 器械文本样式 */
.instrument-text {
  font-size: 11px;
  font-weight: normal;
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
  position: fixed;
  z-index: 9999;
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

/* 合并事件样式 */
.event-item {
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f0f0f0;
}

.event-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.event-name {
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}

.event-time {
  font-size: 11px;
  color: #666;
  font-family: 'Courier New', monospace;
}

/* 图表行容器样式 */
.charts-row {
  display: flex;
  gap: 16px;
  margin-top: 0;
  overflow: visible; /* 允许内容溢出，避免裁剪tooltip */
  position: relative; /* 为tooltip提供定位基准 */
}

/* 远程手术数据tab样式 */
.remote-data-tabs {
  margin-top: 0;
}

.remote-data-tabs .ant-tabs-nav {
  margin: 0 !important;
  padding: 0 !important;
}

.remote-data-tabs .ant-tabs-nav::before {
  border-bottom: none;
}

.remote-data-tabs .ant-tabs-content-holder {
  padding: 0;
  margin-top: -1px; /* 微调内容区域位置 */
}

.remote-data-tabs .ant-tabs-tab {
  font-weight: 600;
  font-size: 16px;
  color: #303133;
  margin: 0 16px 0 0;
  padding: 0;
  height: auto;
}

.remote-data-tabs .ant-tabs-tab-btn {
  display: inline-block;
  line-height: 16px;
  padding: 0;
}

.remote-data-tabs .ant-tabs-tab-active .tab-title {
  color: #1890ff;
}

.remote-data-tabs .ant-tabs-tab-disabled .tab-title {
  color: #bfbfbf;
}

.tab-title {
  font-weight: 600;
  font-size: 16px;
}

/* 手术状态机变化卡片样式 */
.state-machine-card {
  flex: 0 0 50%; /* 固定占用50%宽度，不伸缩 */
  min-width: 0;
  overflow: visible; /* 允许内容溢出，避免裁剪tooltip */
  position: relative; /* 为tooltip提供定位基准 */
  --el-card-padding: 20px 20px 20px 20px; /* 上边距10px，其他边距保持 */
}

/* 网络延迟情况卡片样式 */
.network-latency-card {
  flex: 1;
  min-width: 0;
}

/* 远程手术数据卡片样式 */
.remote-surgery-card {
  flex: 1;
  min-width: 0;
  overflow: visible; /* 允许内容溢出，避免裁剪tooltip */
  position: relative; /* 为tooltip提供定位基准 */
  --el-card-padding: 0px 20px 20px 20px; /* 上边距为0，其他边距保持 */
}

.remote-surgery-section {
  flex: 1;
  min-width: 0;
}

.view-switcher {
  margin-left: auto;
}

.operations-summary {
  padding: 16px 0;
  min-height: 300px; /* 与图表卡片高度保持一致 */
  height: 300px; /* 固定高度，确保一致性 */
  display: flex;
  align-items: center;
  justify-content: center; /* 水平居中 */
}

.operations-card {
  flex: 1;
  min-width: 0;
}

/* 图表容器样式 */
.chart-container {
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  height: 300px; /* 固定高度，确保一致性 */
  overflow: visible; /* 允许内容溢出，避免裁剪 */
  position: relative; /* 为tooltip提供定位基准 */
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
  .charts-row {
    flex-direction: column;
  }
  
  .state-machine-card,
  .network-latency-card {
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




