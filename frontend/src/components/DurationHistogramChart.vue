<template>
  <div class="duration-histogram-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts'

const BIN_MS = 100

const props = defineProps({
  /** 直方图数据：{ binCenters, counts, median, p90, p95, n }，n>0 时绘制 */
  histogramData: {
    type: Object,
    default: () => ({ binCenters: [], counts: [], median: null, p90: null, p95: null, n: 0 })
  }
})

const { t } = useI18n({ useScope: 'global' })
const chartRef = ref(null)
let chartInstance = null

function buildOption (data) {
  if (!data || data.n === 0) return null
  const { binCenters, counts, median, p90, p95 } = data
  const nBins = binCenters.length
  if (nBins === 0) return null
  const maxX = nBins * BIN_MS
  const barData = counts.map((count, idx) => [idx * BIN_MS, count, (idx + 1) * BIN_MS])
  const maxCount = counts.length ? Math.max(...counts) : 0
  const clampX = (v) => Math.max(0, Math.min(maxX, Number(v)))
  const valueForMedian = median != null && Number.isFinite(median) ? clampX(median) : null
  const valueForP90 = p90 != null && Number.isFinite(p90) ? clampX(p90) : null
  const valueForP95 = p95 != null && Number.isFinite(p95) ? clampX(p95) : null
  const tickStepBins = Math.max(1, Math.ceil(nBins / 10))
  const tickStepMs = tickStepBins * BIN_MS
  const colorP50 = '#2e7d32'
  const colorP90 = '#ed6c02'
  const colorP95 = '#c62828'
  const formatStatValue = (v) => (v != null && Number.isFinite(v) ? String(v) : '-')
  const markLineValueData = []
  if (valueForMedian != null) {
    markLineValueData.push({
      xAxis: valueForMedian,
      lineStyle: { type: 'dashed', color: colorP50 },
      label: { formatter: () => t('surgeryVisualization.report.durationHistogramP50', { value: formatStatValue(median) }), color: colorP50 }
    })
  }
  if (valueForP90 != null && valueForP90 !== valueForMedian) {
    markLineValueData.push({
      xAxis: valueForP90,
      lineStyle: { type: 'dashed', color: colorP90 },
      label: { formatter: () => t('surgeryVisualization.report.durationHistogramP90', { value: formatStatValue(p90) }), color: colorP90, offset: [0, 8] }
    })
  }
  if (valueForP95 != null) {
    markLineValueData.push({
      xAxis: valueForP95,
      lineStyle: { type: 'dashed', color: colorP95 },
      label: { formatter: () => t('surgeryVisualization.report.durationHistogramP95', { value: formatStatValue(p95) }), color: colorP95, offset: [0, -8] }
    })
  }
  const markAreaP95ToMax = (valueForP95 != null && nBins > 0)
    ? [
        { xAxis: valueForP95, yAxis: 0 },
        { xAxis: maxX, yAxis: maxCount }
      ]
    : null

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        if (!params || !Array.isArray(params.data)) return ''
        const start = params.data[0]
        const count = params.data[1]
        const end = params.data[2]
        return `${start}-${end} ms: ${count}`
      }
    },
    grid: { left: 66, right: 40, top: 28, bottom: 56, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: maxX,
      interval: tickStepMs,
      name: t('surgeryVisualization.report.durationHistogramX'),
      nameLocation: 'middle',
      nameGap: 42,
      nameTextStyle: { fontSize: 12 },
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: {
        show: true,
        rotate: 0,
        align: 'center',
        margin: 8
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: t('surgeryVisualization.report.durationHistogramY'),
      nameLocation: 'middle',
      nameRotate: 90,
      nameTextStyle: { fontSize: 12 },
      nameGap: 46,
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: { show: true },
      minInterval: 1,
      splitLine: { show: false }
    },
    series: [
      {
        type: 'custom',
        name: t('surgeryVisualization.report.durationHistogramY'),
        data: barData,
        renderItem: (params, api) => {
          const start = api.value(0)
          const count = api.value(1)
          const end = api.value(2)
          const p0 = api.coord([start, 0])
          const p1 = api.coord([end, count])
          const shape = echarts.graphic.clipRectByRect(
            {
              x: p0[0],
              y: p1[1],
              width: Math.max(1, p1[0] - p0[0] - 1),
              height: Math.max(1, p0[1] - p1[1])
            },
            {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height
            }
          )
          return shape
            ? {
                type: 'rect',
                shape,
                style: api.style()
              }
            : null
        },
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#7986cb' },
              { offset: 0.4, color: '#9fa8da' },
              { offset: 0.7, color: '#c5cae9' },
              { offset: 1, color: '#e8eaf6' }
            ]
          }
        },
        ...(markLineValueData.length ? { markLine: { symbol: 'none', data: markLineValueData } } : {}),
        ...(markAreaP95ToMax ? { markArea: { silent: true, data: [[markAreaP95ToMax[0], markAreaP95ToMax[1]]], itemStyle: { color: 'rgba(244, 67, 54, 0.12)' } } } : {})
      }
    ]
  }
}

function update (retryCount = 0) {
  const el = chartRef.value
  const data = props.histogramData
  if (!el) return
  if (!data || data.n === 0) {
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
    return
  }
  // 抽屉刚打开时容器可能尚未布局，延迟重试
  if (el.clientWidth <= 0 || el.clientHeight <= 0) {
    if (retryCount < 30) {
      setTimeout(() => update(retryCount + 1), 100)
    }
    return
  }
  if (!chartInstance) {
    chartInstance = echarts.init(el)
  }
  const option = buildOption(data)
  if (option) {
    chartInstance.setOption(option, true)
    nextTick(() => {
      if (chartInstance && chartRef.value && chartRef.value.clientWidth > 0 && chartRef.value.clientHeight > 0) {
        chartInstance.resize()
      }
    })
  }
}

onMounted(() => {
  nextTick(() => update())
  // 抽屉内挂载时布局可能稍晚完成，延迟再试
  const t1 = setTimeout(() => update(), 150)
  const t2 = setTimeout(() => update(), 400)
  onBeforeUnmount(() => {
    clearTimeout(t1)
    clearTimeout(t2)
  })
})

watch(
  () => props.histogramData,
  () => {
    nextTick(() => update())
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.duration-histogram-chart {
  width: 100%;
  height: 240px;
  min-height: 240px;
}
</style>
