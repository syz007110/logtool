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
  const categories = binCenters.map(c => String(Math.round(c - BIN_MS / 2)))
  const binIndexForMedian = median != null && Number.isFinite(median) ? Math.min(Math.floor(median / BIN_MS), nBins - 1) : -1
  const binIndexForP90 = p90 != null && Number.isFinite(p90) ? Math.min(Math.floor(p90 / BIN_MS), nBins - 1) : -1
  const binIndexForP95 = p95 != null && Number.isFinite(p95) ? Math.min(Math.floor(p95 / BIN_MS), nBins - 1) : -1
  const colorP50 = '#2e7d32'
  const colorP90 = '#ed6c02'
  const colorP95 = '#c62828'
  const markLineCategoryData = []
  if (binIndexForMedian >= 0) {
    markLineCategoryData.push({
      xAxis: binIndexForMedian,
      lineStyle: { type: 'dashed', color: colorP50 },
      label: { formatter: () => t('surgeryVisualization.report.durationHistogramP50', { value: Math.round(median) }), color: colorP50 }
    })
  }
  if (binIndexForP90 >= 0 && binIndexForP90 !== binIndexForMedian) {
    markLineCategoryData.push({
      xAxis: binIndexForP90,
      lineStyle: { type: 'dashed', color: colorP90 },
      label: { formatter: () => t('surgeryVisualization.report.durationHistogramP90', { value: Math.round(p90) }), color: colorP90, offset: [0, 8] }
    })
  }
  if (binIndexForP95 >= 0) {
    markLineCategoryData.push({
      xAxis: binIndexForP95,
      lineStyle: { type: 'dashed', color: colorP95 },
      label: { formatter: () => t('surgeryVisualization.report.durationHistogramP95', { value: Math.round(p95) }), color: colorP95, offset: [0, -8] }
    })
  }
  const markAreaP95ToMax = (binIndexForP95 >= 0 && nBins > 0)
    ? [
        { xAxis: binIndexForP95, yAxis: 'min' },
        { xAxis: nBins - 1, yAxis: 'max' }
      ]
    : null

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const p = params && params[0]
        if (!p || p.data == null) return ''
        const idx = p.dataIndex
        const start = idx * BIN_MS
        const end = (idx + 1) * BIN_MS
        return `${start}-${end} ms: ${p.data}`
      }
    },
    grid: { left: 52, right: 40, top: 28, bottom: 56, containLabel: true },
    xAxis: {
      type: 'category',
      name: t('surgeryVisualization.report.durationHistogramX'),
      nameLocation: 'middle',
      nameGap: 42,
      nameTextStyle: { fontSize: 12 },
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: { show: true, interval: 2, rotate: nBins > 14 ? 45 : 0 },
      data: categories
    },
    yAxis: {
      type: 'value',
      name: t('surgeryVisualization.report.durationHistogramY'),
      nameTextStyle: { fontSize: 12 },
      nameGap: 36,
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: { show: true },
      minInterval: 1,
      splitLine: { show: false }
    },
    series: [
      {
        type: 'bar',
        data: counts,
        barCategoryGap: '0%',
        barWidth: '95%',
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
        ...(markLineCategoryData.length ? { markLine: { symbol: 'none', data: markLineCategoryData } } : {}),
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
