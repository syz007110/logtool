<template>
  <div class="viz-page">
    <el-card class="viz-card">
      <div class="header">
        <h2>手术可视化</h2>
        <div class="actions">
          <el-input v-model="surgeryIdInput" placeholder="输入手术ID" size="small" style="width: 180px; margin-right: 8px;" />
          <el-button size="small" type="primary" :loading="loading" @click="loadById">加载</el-button>
          <el-button size="small" @click="loadFromStorage">从会话恢复</el-button>
          <el-button v-if="$store.getters['auth/hasPermission']('surgery:export')" size="small" type="success" @click="exportStructured">导出结构化数据</el-button>
        </div>
      </div>

      <div class="overview">
        <div class="summary">
          <div>手术ID：<strong>{{ meta.surgery_id || '-' }}</strong></div>
          <div>远程：<el-tag size="small" :type="meta.is_remote ? 'success' : 'info'">{{ meta.is_remote ? '是' : '否' }}</el-tag></div>
        </div>
        <div class="cards">
          <div class="card-item">
            <div class="card-title">开机时间</div>
            <div class="card-value">{{ timelineDisplay.powerOn }}</div>
          </div>
          <div class="card-item">
            <div class="card-title">上一台结束</div>
            <div class="card-value">{{ timelineDisplay.previousSurgeryEnd }}</div>
          </div>
          <div class="card-item">
            <div class="card-title">手术开始</div>
            <div class="card-value">{{ timelineDisplay.surgeryStart }}</div>
          </div>
          <div class="card-item">
            <div class="card-title">手术结束</div>
            <div class="card-value">{{ timelineDisplay.surgeryEnd }}</div>
          </div>
          <div class="card-item">
            <div class="card-title">关机时间</div>
            <div class="card-value">{{ timelineDisplay.powerOff }}</div>
          </div>
        </div>
      </div>

      <div class="sections">
        <div class="section">
          <div class="section-header">手术概括</div>
          <div ref="ganttRef" class="chart" />
        </div>

        <div class="section">
          <div class="section-header">状态机变化</div>
          <div ref="stateRef" class="chart" />
        </div>

        <div v-if="meta.is_remote" class="section">
          <div class="section-header">网络延时</div>
          <div ref="latencyRef" class="chart" />
        </div>

        <div v-if="visibleAlertRows.length" class="section">
          <div class="section-header">安全报警记录</div>
          <el-table :data="visibleAlertRows" size="small" height="320" style="width: 100%;">
            <el-table-column prop="time" label="时间" width="180" />
            <el-table-column prop="code" label="故障码" width="120" />
            <el-table-column prop="message" label="报警信息" min-width="220" />
            <el-table-column prop="status" label="处理状态" width="120" />
          </el-table>
          <div class="alerts-toggle">
            <el-button text type="primary" @click="showAllAlerts = !showAllAlerts">
              {{ showAllAlerts ? '收起' : '展开更多' }}
            </el-button>
          </div>
        </div>

        <div class="section">
          <div class="section-header">器械使用详情</div>
          <el-table :data="instrumentRows" size="small" height="320" style="width: 100%;">
            <el-table-column prop="arm" label="手臂" width="80" />
            <el-table-column prop="tool_type" label="器械类型" min-width="140" />
            <el-table-column prop="udi" label="UDI码" min-width="200" />
            <el-table-column prop="start" label="安装时刻" width="180" />
            <el-table-column prop="end" label="拔下时刻" width="180" />
            <el-table-column prop="duration" label="使用时长" width="120" />
          </el-table>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import api from '../api'
import { GANTT_STYLE, GANTT_COLORS, normalizeSurgeryData as normalize, toMs } from '../utils/visualizationConfig'

export default {
  name: 'SurgeryVisualization',
  setup() {
    const ganttRef = ref(null)
    const stateRef = ref(null)
    const latencyRef = ref(null)
    let ganttChart = null
    let stateChart = null
    let latencyChart = null

    const loading = ref(false)
    const surgeryIdInput = ref('')
    const route = useRoute()

    const meta = reactive({ surgery_id: null, start_time: null, end_time: null, is_remote: false })
    const instrumentRows = ref([])
    const alertRows = ref([])
    const showAllAlerts = ref(false)
    const currentData = ref(null)

    const dispose = () => {
      if (ganttChart) { ganttChart.dispose(); ganttChart = null }
      if (stateChart) { stateChart.dispose(); stateChart = null }
      if (latencyChart) { latencyChart.dispose(); latencyChart = null }
    }

    const toMs = (v) => {
      if (v === null || v === undefined || v === '') return NaN
      if (typeof v === 'number' && Number.isFinite(v)) return v
      const t = new Date(v).getTime()
      return Number.isFinite(t) ? t : NaN
    }

    const renderGantt = (data) => {
      if (!ganttRef.value) return
      if (!ganttChart) ganttChart = echarts.init(ganttRef.value)
      
      // 添加调试信息
      console.log('renderGantt called with data:', data)

      const toMs = (v) => {
        if (v === null || v === undefined || v === '') return NaN
        if (typeof v === 'number' && Number.isFinite(v)) return v
        const t = new Date(v).getTime()
        return Number.isFinite(t) ? t : NaN
      }

      const t0 = toMs(data?.timeline?.powerOn)
      const tPrev = toMs(data?.timeline?.previousSurgeryEnd)
      const t1 = toMs(data?.timeline?.surgeryStart)
      const t2 = toMs(data?.timeline?.surgeryEnd)
      const t3 = toMs(data?.timeline?.powerOff)

      const arms = Array.isArray(data?.arms) ? data.arms : []
      const categories = arms.map(a => a.name || '未命名')
      const seriesData = []
      
      // 添加调试信息
      console.log('arms:', arms)
      console.log('categories:', categories)
      // 为不同工具臂分配基础颜色，同一臂内不同器械使用不同色调
      const armBaseColors = GANTT_COLORS.ARM_BASE_COLORS
      const toolColorByArm = {}
      
      arms.forEach((arm, idx) => {
        const segs = Array.isArray(arm.segments) ? arm.segments : []
        const baseColor = armBaseColors[idx % armBaseColors.length]
        
        segs.forEach(seg => {
          const s = toMs(seg.start)
          const e = toMs(seg.end)
          if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
            const key = seg.tool_type || seg.udi || 'unknown'
            if (!toolColorByArm[idx]) toolColorByArm[idx] = {}
            if (!toolColorByArm[idx][key]) {
              // 优先器械类型固定色
              const typeColor = GANTT_COLORS.TOOL_TYPE_COLORS[seg.tool_type || '']
              if (typeColor) {
                toolColorByArm[idx][key] = typeColor
              } else {
                // 否则基于臂基础色生成色调
                const assignedCount = Object.keys(toolColorByArm[idx]).length
                const hueShift = assignedCount * 30
                const saturation = Math.max(0.6, 1 - assignedCount * 0.1)
                const lightness = Math.max(0.4, 0.8 - assignedCount * 0.1)
                toolColorByArm[idx][key] = `hsl(${(idx * 60 + hueShift) % 360}, ${saturation * 100}%, ${lightness * 100}%)`
              }
            }
            const color = toolColorByArm[idx][key]
            seriesData.push({
              name: seg.udi || '',
              value: [idx, s, e, (e - s), seg.udi || '', seg.tool_type || '', seg.start, seg.end],
              itemStyle: { color, opacity: 0.9 },
              tool_type: seg.tool_type || ''
            })
          }
        })
      })

      // 添加调试信息
      console.log('seriesData:', seriesData)

      // 关键时间点标签（横向 x 轴顶部，非时间线）
      const timelineEvents = []
      if (Number.isFinite(t0)) timelineEvents.push({ time: t0, name: '开机', color: '#52c41a' })
      if (Number.isFinite(tPrev)) timelineEvents.push({ time: tPrev, name: '上一场手术结束', color: '#8c8c8c' })
      if (Number.isFinite(t1)) timelineEvents.push({ time: t1, name: '手术开始', color: '#1890ff' })
      if (Number.isFinite(t2)) timelineEvents.push({ time: t2, name: '手术结束', color: '#fa8c16' })
      if (Number.isFinite(t3)) timelineEvents.push({ time: t3, name: '关机', color: '#f5222d' })
      timelineEvents.sort((a, b) => a.time - b.time)

      // 计算统一时间范围，防止事件点堆叠与条形裁切
      const allTimes = []
      seriesData.forEach(d => { if (Array.isArray(d.value)) { allTimes.push(d.value[1], d.value[2]) } })
      timelineEvents.forEach(e => { if (Number.isFinite(e.time)) allTimes.push(e.time) })
      const minX = allTimes.length ? Math.min.apply(null, allTimes) : undefined
      const maxX = allTimes.length ? Math.max.apply(null, allTimes) : undefined

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: (p) => {
            if (Array.isArray(p)) p = p[0]
            if (!p || !p.data) return ''
            // 甘特条目：data.value 为数组
            if (Array.isArray(p.data.value)) {
              const v = p.data.value
              const catIdx = v[0]
              const s = v[1]
              const e = v[2]
              const udiVal = v[4]
              const toolVal = v[5]
              const startTime = v[6]
              const endTime = v[7]
              const dur = Math.round((e - s) / 1000)
              const armName = categories[catIdx]
              const udi = udiVal || p.data.name || ''
              const tool = (toolVal || p.data.tool_type) ? toolVal || p.data.tool_type : ''
              const installTime = startTime ? new Date(startTime).toLocaleString() : ''
              const removeTime = endTime ? new Date(endTime).toLocaleString() : ''
              return `
                <div style="padding: 8px;">
                  <div style="font-weight: bold; margin-bottom: 4px;">${armName}</div>
                  <div>器械类型: ${tool}</div>
                  <div>UDI码: ${udi}</div>
                  <div>使用时长: ${dur}秒</div>
                  <div>安装时刻: ${installTime}</div>
                  <div>拔下时刻: ${removeTime}</div>
                </div>
              `
            }
            // 时间线事件：data 为事件对象 { time, name, color }
            if (p.data && p.data.time && p.data.name) {
              return `${p.data.name}<br/>时间: ${new Date(p.data.time).toLocaleString()}`
            }
            return ''
          }
        },
        grid: { left: 120, right: 40, top: 100, bottom: 110 },
        axisPointer: { link: [{ xAxisIndex: 'all' }], snap: true },
        xAxis: {
          type: 'time',
          position: 'top',
          axisLine: { show: true },
          axisTick: { show: true },
          axisLabel: { color: '#000', formatter: (val) => new Date(val).toLocaleTimeString() },
          min: Number.isFinite(minX) ? minX : undefined,
          max: Number.isFinite(maxX) ? maxX : undefined
        },
        yAxis: {
          type: 'category',
          data: categories,
          axisLine: { show: true },
          axisTick: { show: true },
          axisLabel: { show: true, color: '#000' }
        },
        dataZoom: [
          { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 20, bottom: 18 },
          { type: 'inside', xAxisIndex: 0, filterMode: 'none' }
        ],
        series: [
          // 手术区间背景色（手术开始~结束）
          ...(Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1 ? [{
            type: 'custom',
            silent: true,
            z: 0,
            renderItem: (params, api) => {
              const yTop = params.coordSys.y
              const totalHeight = params.coordSys.height
              const x1 = api.coord([t1, 0])[0]
              const x2 = api.coord([t2, 0])[0]
              const rect = echarts.graphic.clipRectByRect(
                { x: Math.min(x1, x2), y: yTop, width: Math.abs(x2 - x1), height: totalHeight },
                { x: params.coordSys.x, y: yTop, width: params.coordSys.width, height: totalHeight }
              )
              if (!rect || rect.width <= 0 || rect.height <= 0) return
              return {
                type: 'rect',
                shape: rect,
                style: { fill: '#E6E6FA' }
              }
            },
            data: [0]
          }] : []),
          // 顶部标签（仅显示标签，不画时间线）
          ...(timelineEvents.length > 0 ? [{
            type: 'custom',
            z: 15,
            renderItem: (params, api) => {
              const idx = params.dataIndex
              const event = timelineEvents[idx]
              const x = api.coord([event.time, 0])[0]
              // 放在图表下方（dataZoom 上方）
              const axisBottom = params.coordSys.y + params.coordSys.height + 24
              const label = {
                type: 'text',
                style: {
                  text: event.name,
                  x,
                  y: axisBottom,
                  textAlign: 'center',
                  textVerticalAlign: 'bottom',
                  fontSize: 12,
                  fill: '#000'
                }
              }
              return label
            },
            data: timelineEvents
          }] : []),
          // 甘特图数据
          {
            type: 'custom',
            animation: false,
            renderItem: (params, api) => {
              const categoryIndex = api.value(0)
              const start = api.coord([api.value(1), categoryIndex])
              const end = api.coord([api.value(2), categoryIndex])
              // 使用可配置样式参数计算条厚度与行间距
              const bandSize = api.size([0, 1])[1]
              const usable = Math.max(1, bandSize - GANTT_STYLE.ROW_GAP_PX)
              const barHeight = Math.min(GANTT_STYLE.BAR_MAX_PX, usable * GANTT_STYLE.BAR_RATIO)
              const x = start[0]
              const width = end[0] - start[0]
              const y = start[1] - barHeight / 2

              const rect = echarts.graphic.clipRectByRect(
                { x, y, width, height: barHeight },
                { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
              )
              if (!rect || rect.width <= 0 || rect.height <= 0) return

              // 条内文字：显示器械名称（tool_type），不显示 UDI
              const label = String(api.value(5) || '')

              return {
                type: 'group',
                children: [
                  {
                type: 'rect',
                    shape: rect,
                    // 使用 data.itemStyle.color，由 api.style 读取
                    style: api.style({ opacity: 0.9 })
                  },
                  {
                    type: 'text',
                    silent: true,
                    style: {
                      text: label,
                      x: rect.x + 6,
                      y: rect.y + rect.height / 2,
                      fill: '#fff',
                      textAlign: 'left',
                      textVerticalAlign: 'middle',
                      fontSize: 12,
                      fontWeight: 500,
                      overflow: 'truncate',
                      width: Math.max(0, rect.width - 12)
                    }
                  }
                ]
              }
            },
            encode: { x: [1, 2], y: 0 },
            data: seriesData,
            emphasis: { itemStyle: { opacity: 1 } }
          }
        ]
      }

      // 添加调试信息
      console.log('ECharts option:', option)
      console.log('series length:', option.series.length)
      option.series.forEach((s, idx) => {
        console.log(`series[${idx}]:`, s.type, s.data ? s.data.length : 'no data')
      })

      ganttChart.setOption(option, true)
      ganttChart.resize()
    }

    const renderState = (data) => {
      if (!stateRef.value) return
      if (!stateChart) stateChart = echarts.init(stateRef.value)
      const changes = Array.isArray(data?.state_machine) ? data.state_machine : []
      const states = Array.from(new Set(changes.map(c => c.state)))
      const yData = states
      const points = changes.map(c => [toMs(c.time), c.state])
      stateChart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 80, right: 20, top: 20, bottom: 30 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'time' },
        yAxis: { type: 'category', data: yData },
        series: [
          { type: 'line', step: 'end', data: points, showSymbol: true, symbolSize: 6 }
        ]
      })
      stateChart.resize()
    }

    const renderLatency = (data) => {
      if (!latencyRef.value) return
      if (!latencyChart) latencyChart = echarts.init(latencyRef.value)
      const arr = Array.isArray(data?.network_latency_data) ? data.network_latency_data : []
      const tStart = toMs(data?.timeline?.surgeryStart || data?.start_time)
      const tEnd = toMs(data?.timeline?.surgeryEnd || data?.end_time)
      const raw = arr.map(d => [toMs(d.timestamp || d.time), d.latency])
      const series = (Number.isFinite(tStart) && Number.isFinite(tEnd))
        ? raw.filter(p => Number.isFinite(p[0]) && p[0] >= tStart && p[0] <= tEnd)
        : raw
      const xAxis = { type: 'time' }
      if (Number.isFinite(tStart)) xAxis.min = tStart
      if (Number.isFinite(tEnd)) xAxis.max = tEnd
      latencyChart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 80, right: 20, top: 20, bottom: 30 },
        tooltip: { trigger: 'axis' },
        xAxis,
        yAxis: { type: 'value', name: 'ms' },
        series: [{ type: 'line', data: series, smooth: true }]
      })
      latencyChart.resize()
    }

    const renderTable = (data) => {
      const rows = []
      const arms = Array.isArray(data?.arms) ? data.arms : []
      const fmt = (v) => (v ? new Date(v).toLocaleString() : '-')
      arms.forEach((arm) => {
        const segs = Array.isArray(arm.segments) ? arm.segments : []
        segs.forEach(seg => {
          const durationSec = Math.max(0, Math.floor((toMs(seg.end) - toMs(seg.start)) / 1000))
          const hh = String(Math.floor(durationSec / 3600)).padStart(2, '0')
          const mm = String(Math.floor((durationSec % 3600) / 60)).padStart(2, '0')
          const ss = String(durationSec % 60).padStart(2, '0')
          rows.push({
            arm: arm.name,
            tool_type: seg.tool_type || '-',
            udi: seg.udi || '-',
            start: fmt(seg.start),
            end: fmt(seg.end),
            duration: `${hh}:${mm}:${ss}`
          })
        })
      })
      instrumentRows.value = rows
    }

    const renderAll = (norm) => {
      meta.surgery_id = norm.surgery_id || null
      meta.start_time = norm.start_time || norm.timeline?.surgeryStart || null
      meta.end_time = norm.end_time || norm.timeline?.surgeryEnd || null
      meta.is_remote = !!norm.is_remote
      currentData.value = norm
      renderGantt(norm)
      renderState(norm)
      if (meta.is_remote) renderLatency(norm)
      renderTable(norm)
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
      ganttChart && ganttChart.resize()
      stateChart && stateChart.resize()
      latencyChart && latencyChart.resize()
    }

    onMounted(() => {
      window.addEventListener('resize', handleResize)
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

    return { ganttRef, stateRef, latencyRef, loadFromStorage, loadById, loading, surgeryIdInput, meta, instrumentRows, exportStructured, visibleAlertRows, showAllAlerts, timelineDisplay }
  }
}
</script>

<style scoped>
.viz-page { padding: 16px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.overview { margin-bottom: 8px; }
.summary { display: flex; gap: 16px; align-items: center; color: #555; margin-bottom: 8px; }
.cards { display: grid; grid-template-columns: repeat(5, minmax(160px, 1fr)); gap: 12px; }
.card-item { background: #fff; border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; }
.card-title { font-size: 12px; color: #888; margin-bottom: 4px; }
.card-value { font-size: 14px; color: #333; font-weight: 600; }
.sections { display: flex; flex-direction: column; gap: 16px; }
.section { background: #fff; }
.section-header { font-weight: 600; margin-bottom: 8px; }
.chart { width: 100%; height: 360px; }
.alerts-toggle { text-align: center; padding-top: 6px; }
</style>




