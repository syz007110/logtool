<template>
  <div class="energy-density-chart-wrap">
    <div v-if="hasHeatmapData" class="energy-density-y-table">
      <table class="energy-density-y-table-inner">
        <thead>
          <tr>
            <th>{{ t('surgeryVisualization.report.energyDensityClosureCol') }}</th>
            <th>{{ t('surgeryVisualization.report.energyDensityTypeCol') }}</th>
          </tr>
        </thead>
        <tbody class="energy-density-y-table-body">
          <template v-for="(rl, idx) in tableRows" :key="idx">
            <tr
              v-if="rl.spacer"
              class="energy-density-y-table-row energy-density-y-table-row--spacer"
              :style="rowHeightsPx[idx] != null ? { height: rowHeightsPx[idx] + 'px' } : {}"
            >
              <td colspan="2" class="energy-density-y-table-cell"></td>
            </tr>
            <tr
              v-else
              class="energy-density-y-table-row"
              :style="rowHeightsPx[idx] != null ? { height: rowHeightsPx[idx] + 'px' } : {}"
            >
              <td class="energy-density-y-table-cell energy-density-y-table-cell--closure">{{ rl.closure }}</td>
              <td class="energy-density-y-table-cell energy-density-y-table-cell--type">{{ rl.type }}</td>
            </tr>
          </template>
        </tbody>
        <tfoot class="energy-density-y-table-foot">
          <tr><td colspan="2"></td></tr>
        </tfoot>
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
/** 与热力图每行实际像素高度一致，由 ECharts convertToPixel 在渲染后计算 */
const rowHeightsPx = ref([])
let chartInstance = null

// Y 轴行边界（与 Y_CENTERS / ROW_HEIGHTS 对应）：7 行 → 8 个边界
const ROW_BOUNDARIES = [0, 1, 2, 3, 3.5, 4.5, 5.5, 6.5]

const hasHeatmapData = computed(() => {
  const d = props.densityData
  return d && d.heatmap && d.rowLabels && d.rowLabels.length > 0 && d.matrix && d.numBuckets > 0
})

// 类表格行：spacer 行只占半高；数据行中闭合/非闭合列仅在分组首行显示文字，其余留空
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

// 0%～100% 颜色：浅蓝/白 → 蓝 → 绿 → 黄 → 橙 → 红（与图示一致）
const HEATMAP_COLORS = [
  '#e3f2fd', '#90caf9', '#42a5f5', '#2196f3', '#4caf50', '#8bc34a',
  '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#f44336'
]
// 每个密度块上下边距（像素）；左右无边距
const CELL_PAD_Y = 3
const CELL_PAD_X = 0
// spacer 行占半行：y 轴用 value，行中心与行高；标签位置与 interval 0.5 对齐
const Y_CENTERS = [0.5, 1.5, 2.5, 3.25, 4.5, 5.5, 6.5] // rowIdx 0..6，spacer 中心 3.25（半行）
const ROW_HEIGHTS = [1, 1, 1, 0.5, 1, 1, 1]
const Y_LABEL_POSITIONS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5] // 刻度 0.5 的倍数，spacer 用 3.5 显示
const Y_AXIS_MAX = 6.5
const Y_TABLE_WIDTH = 100
function valueToColor (value) {
  if (value < 0 || value > 1) return 'transparent'
  const i = Math.min(HEATMAP_COLORS.length - 1, Math.max(0, Math.round(value * (HEATMAP_COLORS.length - 1))))
  return HEATMAP_COLORS[i]
}

// 显示端列数：瘦长块（多列、窄宽），列数 ≈ 行数 × 倍数，上限 MAX_DISPLAY_BUCKETS
const MAX_DISPLAY_BUCKETS = 56

function buildHeatmapOption (data) {
  if (!data || !data.heatmap || !data.matrix || !data.rowLabels || data.numBuckets === 0) return null
  const { rowLabels, matrix, numBuckets, bucketMs } = data
  const numRows = rowLabels.length
  if (numRows === 0) return null

  const spanMs = numBuckets * bucketMs
  // 下采样：列数偏多使密度块瘦长（列数 ≈ 行数 × 5），块间无左右间距，最多 MAX_DISPLAY_BUCKETS
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
  const xLabels = []
  for (let i = 0; i < displayBuckets; i++) {
    xLabels.push(((i * displayBucketMs) / 1000).toFixed(0) + 's')
  }

  const heatmapData = []
  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    const yCenter = Y_CENTERS[rowIdx] ?? rowIdx + 0.5
    const rowHeight = ROW_HEIGHTS[rowIdx] ?? 1
    for (let colIdx = 0; colIdx < displayBuckets; colIdx++) {
      const raw = (displayMatrix[rowIdx] && displayMatrix[rowIdx][colIdx] != null) ? displayMatrix[rowIdx][colIdx] : 0
      const value = raw >= 0 ? Math.min(1, Math.max(0, raw)) : -1
      heatmapData.push([colIdx, rowIdx, yCenter, value, rowHeight])
    }
  }

  return {
    tooltip: {
      trigger: 'item',
      position: 'top',
      formatter: (params) => {
        if (!params || params.data == null) return ''
        const colIdx = params.data[0]
        const rowIdx = params.data[1]
        const value = params.data[3]
        if (value < 0) return ''
        const rl = rowLabels[rowIdx]
        const row = typeof rl === 'object' && rl && rl.type != null ? (rl.closure + ' · ' + rl.type) : String(rl || '')
        const start = (colIdx * displayBucketMs) / 1000
        const end = ((colIdx + 1) * displayBucketMs) / 1000
        const duty = (value * 100).toFixed(1)
        return t('surgeryVisualization.report.energyDensityHeatmapTooltip', {
          row,
          start: start.toFixed(1),
          end: end.toFixed(1),
          duty
        })
      }
    },
    grid: {
      left: 0,
      right: 56,
      top: 48,
      bottom: 62,
      containLabel: true,
      borderWidth: 0,
      show: true
    },
    xAxis: {
      type: 'category',
      position: 'bottom',
      name: t('surgeryVisualization.report.energyDensityX'),
      nameLocation: 'middle',
      nameGap: 36,
      nameTextStyle: { fontSize: 11 },
      data: xLabels,
      show: true,
      splitArea: { show: false },
      splitLine: { show: false },
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        interval: displayBuckets > 20 ? 'auto' : 0,
        fontSize: 10,
        rotate: displayBuckets > 30 ? 45 : 0,
        margin: 12
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
      min: 0,
      max: 1,
      orient: 'horizontal',
      right: 12,
      top: 12,
      itemWidth: 14,
      itemHeight: 120,
      text: ['100%', '0%'],
      textStyle: { fontSize: 10 },
      textGap: 6,
      inRange: { color: HEATMAP_COLORS },
      show: true
    },
    series: [
      {
        type: 'custom',
        name: t('surgeryVisualization.report.energyDensityY'),
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: heatmapData,
        renderItem: (params, api) => {
          const colIdx = api.value(0)
          const yCenter = api.value(2)
          const value = api.value(3)
          const rowHeight = api.value(4)
          if (value < 0) return null
          const point = api.coord([colIdx, yCenter])
          const size = api.size([1, rowHeight])
          if (!size || size[0] <= 0 || size[1] <= 0) return null
          const padX = CELL_PAD_X
          const padY = CELL_PAD_Y
          const x = point[0] - size[0] / 2 + padX / 2
          const y = point[1] - size[1] / 2 + padY / 2
          const width = Math.max(1, size[0] - padX)
          const height = Math.max(1, size[1] - padY)
          return {
            type: 'rect',
            shape: { x, y, width, height },
            style: {
              fill: valueToColor(value),
              stroke: 'transparent',
              lineWidth: 0
            },
            emphasisStyle: {
              stroke: 'rgba(0,0,0,0.25)',
              lineWidth: 1
            }
          }
        }
      }
    ]
  }
}

function buildOption (data) {
  if (data && data.heatmap) return buildHeatmapOption(data)
  return null
}

/** 用 ECharts 坐标转换得到每行实际像素高度，使表格行与热力图块一致 */
function syncTableRowHeights () {
  if (!chartInstance || !props.densityData?.rowLabels?.length) return
  try {
    const yPixels = ROW_BOUNDARIES.map((v) => {
      const p = chartInstance.convertToPixel({ gridIndex: 0 }, [0, v])
      return Array.isArray(p) ? p[1] : p?.y ?? 0
    })
    const heights = []
    for (let i = 0; i < yPixels.length - 1; i++) {
      heights.push(Math.round(Math.abs(yPixels[i + 1] - yPixels[i])))
    }
    if (heights.length === props.densityData.rowLabels.length) {
      rowHeightsPx.value = heights
    }
  } catch (_) {
    rowHeightsPx.value = []
  }
}

function update (retryCount = 0) {
  const el = chartRef.value
  const data = props.densityData
  if (!el) return
  const isHeatmap = data && data.heatmap && data.matrix && data.rowLabels && data.numBuckets > 0
  if (!data || !isHeatmap) {
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
    rowHeightsPx.value = []
    return
  }
  if (el.clientWidth <= 0 || el.clientHeight <= 0) {
    if (retryCount < 30) setTimeout(() => update(retryCount + 1), 100)
    return
  }
  if (!chartInstance) chartInstance = echarts.init(el)
  const option = buildOption(data)
  if (option) {
    chartInstance.setOption(option, true)
    nextTick(() => {
      if (chartInstance && chartRef.value?.clientWidth > 0 && chartRef.value?.clientHeight > 0) {
        chartInstance.resize()
        syncTableRowHeights()
      }
    })
  }
}

let resizeObserver = null
onMounted(() => {
  nextTick(() => update())
  const t1 = setTimeout(() => update(), 150)
  const t2 = setTimeout(() => update(), 400)
  nextTick(() => {
    const el = chartRef.value
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (chartInstance) {
          chartInstance.resize()
          syncTableRowHeights()
        }
      })
      resizeObserver.observe(el)
    }
  })
  onBeforeUnmount(() => {
    clearTimeout(t1)
    clearTimeout(t2)
  })
})

watch(() => props.densityData, () => nextTick(() => update()), { deep: true })

onBeforeUnmount(() => {
  if (resizeObserver && chartRef.value) {
    resizeObserver.unobserve(chartRef.value)
    resizeObserver = null
  }
  if (chartInstance) {
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
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  box-sizing: border-box;
}
.energy-density-y-table {
  flex-shrink: 0;
  width: 100px;
  min-width: 100px;
  background: var(--el-fill-color-lighter, #fafafa);
  overflow: hidden;
  box-sizing: border-box;
}
.energy-density-y-table-inner {
  width: 100%;
  height: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 10px;
  box-sizing: border-box;
}
/* 与 ECharts grid top 48px 严格一致，表体与热力图绘图区 170px 对齐 */
.energy-density-y-table thead {
  height: 48px;
}
.energy-density-y-table thead th {
  padding: 6px 4px;
  height: 48px;
  box-sizing: border-box;
  text-align: center;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  background: var(--el-fill-color, #f5f7fa);
  border-bottom: 1px solid var(--el-border-color, #dcdfe6);
}
.energy-density-y-table thead th:first-child {
  border-right: 1px solid var(--el-border-color-lighter, #e4e7ed);
}
/* 表体行高由 rowHeightsPx 动态设置，与热力图块一致；无数据时用比例回退 */
.energy-density-y-table-body {
  display: block;
  height: 170px;
  box-sizing: border-box;
}
.energy-density-y-table-body tr {
  display: flex;
  min-height: 0;
  box-sizing: border-box;
}
.energy-density-y-table-body tr:not(.energy-density-y-table-row--spacer) {
  height: calc(170px / 6.5 * 1);
}
.energy-density-y-table-body tr.energy-density-y-table-row--spacer {
  height: calc(170px / 6.5 * 0.5);
}
.energy-density-y-table-foot {
  display: block;
  height: 62px;
  box-sizing: border-box;
}
.energy-density-y-table-foot td {
  border: none;
  padding: 0;
  height: 62px;
  box-sizing: border-box;
}
.energy-density-y-table-body td {
  box-sizing: border-box;
}
.energy-density-y-table-cell {
  padding: 2px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter, #e4e7ed);
  color: var(--el-text-color-regular, #606266);
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
}
.energy-density-y-table-cell--closure {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  border-right: 1px solid var(--el-border-color-lighter, #e4e7ed);
  text-align: center;
  justify-content: center;
}
.energy-density-y-table-cell--type {
  flex: 1;
  min-width: 0;
  text-align: left;
  justify-content: flex-start;
}
.energy-density-chart {
  flex: 1;
  min-width: 0;
  height: 280px;
  min-height: 280px;
  overflow: visible;
  box-sizing: border-box;
}
</style>
