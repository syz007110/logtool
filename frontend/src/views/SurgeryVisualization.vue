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
      <div class="section-header">手术概况</div>
      <div class="timeline-container">
        <!-- 表格头部 -->
        <div class="timeline-header">
          <div class="arm-column">活动名称</div>
          <div class="time-columns">
            <div 
              v-for="hour in 24" 
              :key="hour" 
              class="time-column"
            >
              {{ String(hour - 1).padStart(2, '0') }}:00
            </div>
          </div>
        </div>
        
        <!-- 表格主体 -->
        <div class="timeline-body">
          <div 
            v-for="(arm, index) in armsData" 
            :key="arm.arm_id" 
            class="timeline-row"
          >
            <div class="arm-cell">{{ arm.name }}</div>
            <div class="time-cells">
              <div 
                v-for="hour in 24" 
                :key="hour" 
                class="time-grid"
                :class="{ 'has-instrument': hasInstrumentInHour(arm, hour - 1) }"
              >
                <!-- 器械使用区块 -->
                <div 
                  v-for="segment in getSegmentsInHour(arm, hour - 1)"
                  :key="`${segment.udi}-${segment.start}`"
                  class="instrument-segment"
                  :style="getSegmentStyle(segment, hour - 1)"
                  :title="getSegmentTooltip(segment)"
                >
                  {{ segment.tool_type }}
                </div>
                
                <!-- 时间线事件标记 -->
                <div 
                  v-if="index === 0 && hasEventInHour(hour - 1)"
                  class="timeline-event"
                  :class="getEventClass(hour - 1)"
                >
                  {{ getEventText(hour - 1) }}
                </div>
              </div>
            </div>
          </div>
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
    
    // 当前日期（用于计算24小时范围）
    const currentDate = ref(new Date())

    // 检查某个小时是否有器械使用
    const hasInstrumentInHour = (arm, hour) => {
      if (arm.arm_id === 0) return false // 手术时间线不显示器械
      
      return arm.segments.some(segment => {
        const startHour = getHourFromTime(segment.start || segment.install_time || segment.start_time)
        const endHour = getHourFromTime(segment.end || segment.remove_time || segment.end_time)
        return hour >= startHour && hour <= endHour
      })
    }
    
    // 获取某个小时内的器械使用段
    const getSegmentsInHour = (arm, hour) => {
      if (arm.arm_id === 0) return []
      
      return arm.segments.filter(segment => {
        const startHour = getHourFromTime(segment.start || segment.install_time || segment.start_time)
        const endHour = getHourFromTime(segment.end || segment.remove_time || segment.end_time)
        return hour >= startHour && hour <= endHour
      })
    }
    
    // 获取器械区块样式
    const getSegmentStyle = (segment, hour) => {
      const startHour = getHourFromTime(segment.start || segment.install_time || segment.start_time)
      const endHour = getHourFromTime(segment.end || segment.remove_time || segment.end_time)
      
      // 计算在小时内的位置和宽度
      const hourStart = hour * 60 // 分钟
      const hourEnd = (hour + 1) * 60
      const segmentStart = getMinutesFromTime(segment.start || segment.install_time || segment.start_time)
      const segmentEnd = getMinutesFromTime(segment.end || segment.remove_time || segment.end_time)
      
      const left = Math.max(0, (segmentStart - hourStart) / 60 * 100)
      const right = Math.max(0, (hourEnd - segmentEnd) / 60 * 100)
      
      return {
        left: `${left}%`,
        right: `${right}%`,
        backgroundColor: getInstrumentColor(segment.tool_type || segment.instrument_type || '')
      }
    }
    
    // 获取器械区块提示信息
    const getSegmentTooltip = (segment) => {
      const duration = calculateDuration(segment.start || segment.install_time || segment.start_time, 
                                       segment.end || segment.remove_time || segment.end_time)
      return `器械类型: ${segment.tool_type || segment.instrument_type || ''}\nUDI: ${segment.udi || ''}\n使用时长: ${duration}分钟\n安装时间: ${segment.install_time || segment.start_time}\n拔下时间: ${segment.remove_time || segment.end_time}`
    }
    
    // 检查某个小时是否有时间线事件
    const hasEventInHour = (hour) => {
      return timelineEvents.value.some(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === hour
      })
    }
    
    // 获取事件文本
    const getEventText = (hour) => {
      const events = timelineEvents.value.filter(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === hour
      })
      
      if (events.length === 1) {
        return events[0].name
      } else if (events.length > 1) {
        return `${events[0].name}+${events.length - 1}`
      }
      return ''
    }
    
    // 获取事件样式类
    const getEventClass = (hour) => {
      const events = timelineEvents.value.filter(event => {
        const eventHour = getHourFromTime(event.time)
        return eventHour === hour
      })
      
      if (events.length > 0) {
        const event = events[0]
        if (event.type === 'power') return 'timeline-event-power'
        if (event.type === 'start') return 'timeline-event-start'
        if (event.type === 'end') return 'timeline-event-end'
      }
      return ''
    }
    
    // 从时间字符串获取小时数
    const getHourFromTime = (timeStr) => {
      if (!timeStr) return 0
      const time = toMs(timeStr)
      if (!Number.isFinite(time)) return 0
      const date = new Date(time)
      return date.getHours()
    }
    
    // 从时间字符串获取分钟数（从当天0点开始）
    const getMinutesFromTime = (timeStr) => {
      if (!timeStr) return 0
      const time = toMs(timeStr)
      if (!Number.isFinite(time)) return 0
      const date = new Date(time)
      return date.getHours() * 60 + date.getMinutes()
    }
    
    // 计算持续时间（分钟）
    const calculateDuration = (startTime, endTime) => {
      const start = toMs(startTime)
      const end = toMs(endTime)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
      return Math.round((end - start) / 1000 / 60)
    }
    
    // 获取器械颜色
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

    const renderTimeline = (data) => {
      console.log('renderTimeline called with data:', data)
      
      // 从structured_data中读取arms数据
      const structuredData = data?.structured_data || {}
      const arms = Array.isArray(structuredData?.arms) ? structuredData.arms : []
      
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
      
      console.log('Updated armsData:', armsData.value)
      
      // 处理时间线事件
      const events = []
      const powerCycles = structuredData?.power_cycles || []
      const powerOnTime = powerCycles.length > 0 ? powerCycles[0]?.power_on : null
      const powerOffTime = powerCycles.length > 0 ? powerCycles[0]?.power_off : null
      const surgeryStart = data?.surgeryStart || data?.start_time
      const surgeryEnd = data?.surgeryEnd || data?.end_time
      
      if (powerOnTime) {
        events.push({ time: powerOnTime, name: '开机', type: 'power' })
      }
      if (surgeryStart) {
        events.push({ time: surgeryStart, name: '手术开始', type: 'start' })
      }
      if (surgeryEnd) {
        events.push({ time: surgeryEnd, name: '手术结束', type: 'end' })
      }
      if (powerOffTime) {
        events.push({ time: powerOffTime, name: '关机', type: 'power' })
      }
      
      timelineEvents.value = events
      
      console.log('Timeline events:', timelineEvents.value)
    }

    // 移除旧的 ECharts 相关代码，现在使用纯 CSS 表格布局

    // 移除不需要的renderState和renderLatency函数

    // 移除不需要的renderTable函数

    const renderAll = (norm) => {
      // 打印手术完整数据（不包含structured_data）
      const dataToLog = { ...norm }
      if (dataToLog.structured_data) {
        dataToLog.structured_data = '[已省略 - 包含大量数据]'
      }
      console.log('加载的手术完整数据:', dataToLog)
      
      meta.surgery_id = norm.surgery_id || null
      meta.start_time = norm.start_time || norm.surgeryStart || null
      meta.end_time = norm.end_time || norm.surgeryEnd || null
      meta.is_remote = !!norm.is_remote
      // 直接使用数据库的has_fault字段
      meta.is_fault = !!norm.has_fault
      currentData.value = norm
      renderTimeline(norm)
      renderAlerts(norm)
    }

    const loadFromStorage = () => {
      try {
        const text = sessionStorage.getItem('surgeryVizData')
        if (!text) return
        const data = JSON.parse(text)
        const norm = normalize(data)
        renderAll(norm)
      } catch (_) {}
    }

    const loadById = async () => {
      if (!surgeryIdInput.value) return
      loading.value = true
      try {
        const resp = await api.surgeries.get(surgeryIdInput.value)
        const item = resp.data?.data || resp.data
        const norm = normalize(item)
        renderAll(norm)
      } catch (e) {
        // ignore
      } finally {
        loading.value = false
      }
    }

    const handleResize = () => {
      // 目前不需要处理图表大小调整
    }

    onMounted(() => {
      window.addEventListener('resize', handleResize)
      console.log('Component mounted, armsData:', armsData.value)
      
      // 初始化ECharts图表
      nextTick(() => {
        initTimelineChart()
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
      dispose()
    })

    const fmtTime = (v) => (v ? new Date(v).toLocaleString() : '-')
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
      hasInstrumentInHour,
      getSegmentsInHour,
      getSegmentStyle,
      getSegmentTooltip,
      hasEventInHour,
      getEventText,
      getEventClass
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
  font-weight: 600; 
  margin-bottom: 16px; 
  font-size: 16px;
  color: #333;
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
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.timeline-header {
  display: flex;
  background: #fafafa;
  border-bottom: 2px solid #d9d9d9;
  font-weight: 600;
}

.arm-column {
  width: 120px;
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
  flex: 1;
  min-width: 0;
}

.time-column {
  flex: 1;
  padding: 16px 4px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  border-right: 1px solid #f0f0f0;
  background: #fafafa;
  color: #595959;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
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
  flex: 1;
  position: relative;
  min-height: 80px;
  background: #fff;
  display: flex;
}

/* 小时栅格背景 */
.time-grid {
  position: relative;
  flex: 1;
  height: 100%;
  border-right: 1px solid #f0f0f0;
  background: #fff;
  transition: background-color 0.2s ease;
}

.time-grid:hover {
  background-color: #f5f5f5;
}

.time-grid.has-instrument {
  background-color: #f0f9ff;
}

/* 时间线事件样式 */
.timeline-event {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 10;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  border: 2px solid #fff;
  color: white;
  text-align: center;
  min-width: 60px;
}

.timeline-event-power {
  background: linear-gradient(135deg, #52c41a, #73d13d);
}

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
</style>




