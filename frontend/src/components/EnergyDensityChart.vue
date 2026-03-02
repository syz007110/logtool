<template>
  <div ref="wrapRef" class="energy-density-chart-wrap">
    <div v-if="hasHeatmapData" class="energy-density-y-table">
      <table class="energy-density-y-table-inner">
        <thead>
          <tr>
            <th class="energy-density-y-table-head-cell energy-density-y-table-head-cell--closure"></th>
            <th class="energy-density-y-table-head-cell energy-density-y-table-head-cell--type"></th>
          </tr>
        </thead>
        <tbody ref="tableBodyRef" class="energy-density-y-table-body">
          <template v-for="(grp, gi) in tableGroups" :key="gi">
            <template v-if="grp.spacer">
              <tr :class="['energy-density-y-table-row', 'energy-density-y-table-row--spacer']">
                <td colspan="2" class="energy-density-y-table-cell energy-density-y-table-cell--spacer"></td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="(typeName, ti) in grp.types"
                :key="`${gi}-${ti}`"
                :class="['energy-density-y-table-row', { 'energy-density-y-table-row--first-in-group': ti === 0 }]"
              >
                <td v-if="ti === 0" :rowspan="grp.types.length" class="energy-density-y-table-cell energy-density-y-table-cell--closure energy-density-y-table-cell--closure-merged">{{ grp.closure }}</td>
                <td class="energy-density-y-table-cell energy-density-y-table-cell--type">{{ typeName }}</td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
    <div class="energy-density-chart" ref="chartRef"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts'

const props = defineProps({
  /** 密度数据：热力图 { heatmap: true, rowLabels, matrix, numBuckets, bucketMs }；或旧版 { intensities, numBuckets, bucketMs } */
  densityData: {
    type: Object,
    default: () => ({ heatmap: false, rowLabels: [], matrix: [], numBuckets: 0, bucketMs: 10000 })
  }
})

const { t } = useI18n({ useScope: 'global' })
const chartRef = ref(null)
const wrapRef = ref(null)
const tableBodyRef = ref(null)
/** 方案2：以表格为真相，测量得到的每行 top/height（相对 wrap），图表按此像素绘制 */
const rowRects = ref([])
let chartInstance = null

function measureRowRects () {
  if (!wrapRef.value || !tableBodyRef.value) return
  const rows = tableBodyRef.value.querySelectorAll('.energy-density-y-table-row')
  if (rows.length === 0) return
  const wrapRect = wrapRef.value.getBoundingClientRect()
  const rects = []
  rows.forEach((row) => {
    const r = row.getBoundingClientRect()
    rects.push({ top: r.top - wrapRect.top, height: r.height })
  })
  rowRects.value = rects
}

const hasHeatmapData = computed(() => {
  const d = props.densityData
  return d && d.heatmap && d.rowLabels && d.rowLabels.length > 0 && d.matrix && d.numBuckets > 0
})

// 类表格行（保持 7 行顺序，供图表行高测量与 heatmap 对齐）
const tableRows = computed(() => {
  const labels = props.densityData?.rowLabels || []
  let prevClosure = null
  return labels.map((rl) => {
    if (typeof rl === 'object' && rl && rl.spacer) return { spacer: true }
    if (typeof rl === 'object' && rl && rl.closure != null && rl.type != null) {
      const showClosure = prevClosure !== rl.closure
      prevClosure = rl.closure
      return { spacer: false, closure: showClosure ? rl.closure : '', type: rl.type }
    }
    return { spacer: false, closure: '', type: String(rl || '') }
  })
})

// 按闭合/非闭合分组，用于左侧表「闭合」「非闭合」列合并多行显示
const tableGroups = computed(() => {
  const labels = props.densityData?.rowLabels || []
  const groups = []
  let current = null
  for (const rl of labels) {
    if (typeof rl === 'object' && rl && rl.spacer) {
      if (current) groups.push(current)
      current = null
      groups.push({ spacer: true })
      continue
    }
    if (typeof rl === 'object' && rl && rl.closure != null && rl.type != null) {
      if (!current || current.closure !== rl.closure) {
        if (current) groups.push(current)
        current = { closure: rl.closure, types: [rl.type] }
      } else {
        current.types.push(rl.type)
      }
      continue
    }
  }
  if (current) groups.push(current)
  return groups
})

// 0%～100% 颜色：浅蓝/白 → 蓝 → 绿 → 黄 → 橙 → 红（与图示一致）
const HEATMAP_COLORS = [
  '#e3f2fd', '#90caf9', '#42a5f5', '#2196f3', '#4caf50', '#8bc34a',
  '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#f44336'
]
// 块与左侧列表行高对齐：不再留上下边距，使密度块填满行高
const CELL_PAD_Y = 0
const CELL_PAD_X = 0
// spacer 行占半行：y 轴用 value，行中心与行高；与左侧列表行高一致（grid 绘图区 170px / 6.5 ≈ 每行 26px）
const Y_CENTERS = [0.5, 1.5, 2.5, 3.25, 4.5, 5.5, 6.5] // rowIdx 0..6，spacer 中心 3.25（半行）
const ROW_HEIGHTS = [1, 1, 1, 0.5, 1, 1, 1] // 能量密度块高度：ECharts 按 grid 高度换算，height = size[1] - CELL_PAD_Y
const Y_LABEL_POSITIONS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5] // 刻度 0.5 的倍数，spacer 用 3.5 显示
const Y_AXIS_MAX = 6.5
const Y_TABLE_WIDTH = 100
const VISUAL_MAP_ORIENT = 'horizontal'
const VISUAL_MAP_RIGHT = 8
const VISUAL_MAP_TOP = 12
const VISUAL_MAP_THICKNESS = 12
const VISUAL_MAP_LENGTH = 120

// 显示端列数：瘦长块（多列、窄宽），列数 ≈ 行数 × 倍数，上限 MAX_DISPLAY_BUCKETS
const MAX_DISPLAY_BUCKETS = 56

function buildHeatmapOption (data, rowRectsMeasured) {
  if (!data || !data.heatmap || !data.matrix || !data.rowLabels || data.numBuckets === 0) return null
  const { rowLabels, matrix, numBuckets, bucketMs } = data
  const numRows = rowLabels.length
  if (numRows === 0) return null

  const spanMs = numBuckets * bucketMs
  const targetCols = Math.round(numRows * 5)
  const displayBuckets = Math.min(numBuckets, Math.max(12, Math.min(Math.max(targetCols, 12), MAX_DISPLAY_BUCKETS)))
  const step = numBuckets / displayBuckets
  const displayMatrix = numRows ? matrix.map((row) => {
    const out = []
    for (let j = 0; j < displayBuckets; j++) {
      const start = Math.floor(j * step)
      const end = Math.min(numBuckets, Math.ceil((j + 1) * step))
      let maxVal = -1
      for (let k = start; k < end; k++) {
        const v = row[k]
        if (v != null && v >= 0) maxVal = maxVal < 0 ? v : Math.max(maxVal, v)
      }
      out.push(maxVal < 0 ? -1 : Math.min(1, maxVal))
    }
    return out
  }) : []

  const displayBucketMs = Math.round(spanMs / displayBuckets)
  const startMs = data.startMs != null ? Number(data.startMs) : null
  const endMs = startMs != null ? startMs + spanMs : null
  const useShortTime = displayBuckets > 14
  const xLabels = []
  for (let i = 0; i < displayBuckets; i++) {
    const isLast = i === displayBuckets - 1
    const tickMs = startMs != null
      ? (isLast && endMs != null ? endMs : startMs + i * displayBucketMs)
      : (isLast ? spanMs : i * displayBucketMs)
    if (startMs != null && Number.isFinite(tickMs)) {
      const d = new Date(tickMs)
      const h = d.getHours()
      const m = d.getMinutes()
      const s = d.getSeconds()
      if (spanMs >= 3600000) {
        xLabels.push(useShortTime
          ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
          : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
      } else {
        xLabels.push(useShortTime
          ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
      }
    } else {
      xLabels.push((tickMs / 1000).toFixed(0) + 's')
    }
  }

  const useRowRects = Array.isArray(rowRectsMeasured) && rowRectsMeasured.length === numRows
  const heatmapData = []
  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    const yCenter = Y_CENTERS[rowIdx] ?? rowIdx + 0.5
    const rowHeightVal = ROW_HEIGHTS[rowIdx] ?? 1
    const rowTop = useRowRects ? rowRectsMeasured[rowIdx].top : 0
    const rowHeightPx = useRowRects ? rowRectsMeasured[rowIdx].height : 0
    for (let colIdx = 0; colIdx < displayBuckets; colIdx++) {
      const raw = (displayMatrix[rowIdx] && displayMatrix[rowIdx][colIdx] != null) ? displayMatrix[rowIdx][colIdx] : 0
      const value = raw >= 0 ? Math.min(1, Math.max(0, raw)) : -1
      // 固定 value 在维度 2，便于 visualMap/tooltip 使用同一维度。
      heatmapData.push([colIdx, rowIdx, value, yCenter, rowHeightVal, rowTop, rowHeightPx])
    }
  }

  const tooltipFormatter = (params) => {
    if (!params) return ''
    const formatDutyPercent = (raw) => {
      const v = Number(raw)
      if (!Number.isFinite(v)) return null
      return (Math.max(0, Math.min(1, v)) * 100).toFixed(1)
    }
    const getVisualMapHoverValue = (raw) => {
      const pointer = params?.event?.event || params?.event
      const px = pointer?.offsetX ?? pointer?.zrX
      const py = pointer?.offsetY ?? pointer?.zrY
      // continuous 图例事件默认返回区间；优先用鼠标在色条上的像素位置换算单点值。
      if (Number.isFinite(px) && Number.isFinite(py) && chartInstance) {
        const chartWidth = chartInstance.getWidth()
        const barWidth = VISUAL_MAP_ORIENT === 'horizontal' ? VISUAL_MAP_LENGTH : VISUAL_MAP_THICKNESS
        const barHeight = VISUAL_MAP_ORIENT === 'horizontal' ? VISUAL_MAP_THICKNESS : VISUAL_MAP_LENGTH
        const barLeft = chartWidth - VISUAL_MAP_RIGHT - barWidth
        const barTop = VISUAL_MAP_TOP
        if (px >= barLeft && px <= barLeft + barWidth && py >= barTop && py <= barTop + barHeight) {
          const ratio = VISUAL_MAP_ORIENT === 'horizontal'
            ? (px - barLeft) / Math.max(1, barWidth)
            : 1 - ((py - barTop) / Math.max(1, barHeight))
          return Math.max(0, Math.min(1, ratio))
        }
      }
      if (Array.isArray(raw)) {
        const nums = raw.map(v => Number(v)).filter(v => Number.isFinite(v))
        if (nums.length === 0) return null
        const min = Math.min(...nums)
        const max = Math.max(...nums)
        // visualMap 悬浮有时给的是区间 [min,max]，取中值避免只显示 0 或 1。
        return (min + max) / 2
      }
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }
    // 图例（visualMap）悬浮：显示当前颜色位置对应的占空比
    if (params.componentType === 'visualMap') {
      const visualVal = getVisualMapHoverValue(params.value)
      const duty = formatDutyPercent(visualVal)
      if (duty == null) return ''
      return `${t('surgeryVisualization.report.energyDensityY')}：${duty}%`
    }
    if (params.data == null) return ''
    const value = params.data[2]
    if (value < 0) return ''
    const duty = formatDutyPercent(value)
    if (duty == null) return ''
    return `${t('surgeryVisualization.report.energyDensityY')}：${duty}%`
  }

  const renderItem = useRowRects
    ? (params, api) => {
        const colIdx = api.value(0)
        const rowIdx = api.value(1)
        const value = api.value(2)
        const rowTop = api.value(5)
        const rowHeightPx = api.value(6)
        if (value < 0) return null
        const point = api.coord([colIdx, 0])
        const size = api.size([1, 0])
        if (!point || !size || size[0] <= 0) return null
        const x = point[0] - size[0] / 2 + CELL_PAD_X / 2
        const width = Math.max(1, size[0] - CELL_PAD_X)
        return {
          type: 'rect',
          shape: { x, y: rowTop, width, height: Math.max(1, rowHeightPx) },
          style: {
            fill: api.visual('color'),
            stroke: 'transparent',
            lineWidth: 0
          },
          emphasisStyle: {
            stroke: 'rgba(0,0,0,0.25)',
            lineWidth: 1
          }
        }
      }
    : (params, api) => {
        const colIdx = api.value(0)
        const value = api.value(2)
        const yCenter = api.value(3)
        const rowHeight = api.value(4)
        if (value < 0) return null
        const point = api.coord([colIdx, yCenter])
        const size = api.size([1, rowHeight])
        if (!size || size[0] <= 0 || size[1] <= 0) return null
        const x = point[0] - size[0] / 2 + CELL_PAD_X / 2
        const y = point[1] - size[1] / 2 + CELL_PAD_Y / 2
        const width = Math.max(1, size[0] - CELL_PAD_X)
        const height = Math.max(1, size[1] - CELL_PAD_Y)
        return {
          type: 'rect',
          shape: { x, y, width, height },
          style: {
            fill: api.visual('color'),
            stroke: 'transparent',
            lineWidth: 0
          },
          emphasisStyle: {
            stroke: 'rgba(0,0,0,0.25)',
            lineWidth: 1
          }
        }
      }

  return {
    tooltip: {
      trigger: 'item',
      position: 'top',
      formatter: tooltipFormatter,
      confine: true,
      appendToBody: false
    },
    grid: {
      left: 0,
      right: 44,
      top: 48,
      bottom: 72,
      containLabel: false,
      borderWidth: 0,
      show: true
    },
    xAxis: {
      type: 'category',
      position: 'bottom',
      zlevel: 1,
      z: 10,
      name: t('surgeryVisualization.report.energyDensityX'),
      nameLocation: 'middle',
      nameGap: 44,
      nameTextStyle: { fontSize: 11 },
      data: xLabels,
      show: true,
      splitArea: { show: false },
      splitLine: { show: false },
      axisLine: { show: true, onZero: false },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        interval: (idx, value) => {
          if (displayBuckets <= 12) return true
          const step = Math.max(1, Math.floor(displayBuckets / 8))
          if (idx === 0) return true
          return (displayBuckets - 1 - idx) % step === 0
        },
        align: 'center',
        fontSize: 10,
        rotate: 0,
        margin: 14
      }
    },
    yAxis: {
      type: 'value',
      position: 'left',
      name: '',
      min: 0,
      max: Y_AXIS_MAX,
      interval: 0.5,
      splitArea: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      inverse: true
    },
    visualMap: {
      type: 'continuous',
      dimension: 2,
      min: 0,
      max: 1,
      precision: 3,
      formatter: (value) => `${(Math.max(0, Math.min(1, Number(value))) * 100).toFixed(1)}%`,
      orient: VISUAL_MAP_ORIENT,
      right: VISUAL_MAP_RIGHT,
      top: VISUAL_MAP_TOP,
      itemWidth: VISUAL_MAP_THICKNESS,
      itemHeight: VISUAL_MAP_LENGTH,
      text: ['100%', '0%'],
      textStyle: { fontSize: 9 },
      textGap: 4,
      inRange: { color: HEATMAP_COLORS },
      show: true
    },
    series: [
      {
        type: 'custom',
        z: 0,
        name: t('surgeryVisualization.report.energyDensityY'),
        xAxisIndex: 0,
        yAxisIndex: 0,
        encode: { x: 0, y: 1, tooltip: [2] },
        data: heatmapData,
        renderItem
      }
    ]
  }
}

function buildOption (data, rowRectsMeasured) {
  if (data && data.heatmap) return buildHeatmapOption(data, rowRectsMeasured)
  return null
}

function update (retryCount = 0) {
  const el = chartRef.value
  const data = props.densityData
  if (!el || !el.isConnected) return
  const isHeatmap = data && data.heatmap && data.matrix && data.rowLabels && data.numBuckets > 0
  if (!data || !isHeatmap) {
    if (chartInstance) {
      try { chartInstance.dispatchAction({ type: 'hideTip' }) } catch (_) {}
      chartInstance.dispose()
      chartInstance = null
    }
    return
  }
  if (el.clientWidth <= 0 || el.clientHeight <= 0) {
    if (retryCount < 30) setTimeout(() => update(retryCount + 1), 100)
    return
  }
  measureRowRects()
  if (!chartInstance) chartInstance = echarts.init(el)
  const option = buildOption(data, rowRects.value)
  if (option) {
    chartInstance.setOption(option, true)
    nextTick(() => {
      if (chartInstance && chartRef.value?.isConnected && chartRef.value?.clientWidth > 0 && chartRef.value?.clientHeight > 0) chartInstance.resize()
    })
  }
}

let resizeObserver = null
let mountT1 = null
let mountT2 = null

onMounted(() => {
  nextTick(() => update())
  mountT1 = setTimeout(() => update(), 150)
  mountT2 = setTimeout(() => update(), 400)
  resizeObserver = new ResizeObserver(() => {
    if (!chartRef.value?.isConnected) return
    measureRowRects()
    nextTick(() => {
      if (chartInstance && chartRef.value?.isConnected) {
        chartInstance.resize()
        const option = buildOption(props.densityData, rowRects.value)
        if (option) chartInstance.setOption(option, true)
      }
    })
  })
  if (wrapRef.value) resizeObserver.observe(wrapRef.value)
})

watch(() => props.densityData, () => nextTick(() => update()), { deep: true })

onBeforeUnmount(() => {
  if (mountT1) clearTimeout(mountT1)
  if (mountT2) clearTimeout(mountT2)
  if (resizeObserver && wrapRef.value) {
    try { resizeObserver.unobserve(wrapRef.value) } catch (_) {}
  }
  if (chartInstance) {
    try { chartInstance.dispatchAction({ type: 'hideTip' }) } catch (_) {}
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.energy-density-chart-wrap {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 280px;
  min-height: 280px;
  overflow: hidden;
  background: var(--el-bg-color, #fff);
}
.energy-density-y-table {
  flex-shrink: 0;
  align-self: flex-start;
  width: 180px;
  min-width: 180px;
  height: 208px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.energy-density-y-table-inner {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  border-spacing: 0;
}
.energy-density-y-table-inner thead th {
  height: 48px;
  padding: 6px 4px;
  box-sizing: border-box;
  font-size: 10px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  text-align: center;
  vertical-align: middle;
}
.energy-density-y-table-head-cell--closure {
  width: 68px;
}
.energy-density-y-table-head-cell--type {
  text-align: center;
}
/* 表体高度与 chart grid 绘图区一致 160px */
.energy-density-y-table-body {
  height: 160px;
}
.energy-density-y-table-body tr.energy-density-y-table-row {
  height: calc(160px / 6.5);
}
.energy-density-y-table-body tr.energy-density-y-table-row--spacer {
  height: calc(160px / 6.5 * 0.5);
}
.energy-density-y-table-body td {
  padding: 2px 4px;
  color: var(--el-text-color-regular, #606266);
  font-size: 12px;
  vertical-align: middle;
  box-sizing: border-box;
}
.energy-density-y-table-cell--closure {
  width: 68px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  text-align: center;
}
.energy-density-y-table-cell--closure-merged {
  vertical-align: middle;
  text-align: center;
}
.energy-density-y-table-cell--type {
  width: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
}
.energy-density-y-table-cell--spacer {
  border: none;
}
.energy-density-chart {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 280px;
  min-height: 280px;
  overflow: visible;
}
</style>
