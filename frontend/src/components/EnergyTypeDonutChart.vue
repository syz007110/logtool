<template>
  <div class="energy-type-donut-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts'

const props = defineProps({
  /** 激活类型占比 [{ name, value, percent }] */
  typeShare: {
    type: Array,
    default: () => []
  }
})

const { t } = useI18n({ useScope: 'global' })
const chartRef = ref(null)
let chartInstance = null

const LABEL_MAP = {
  'bipolar-coag': 'surgeryVisualization.report.energyBipolarCoag',
  'monopolar-cut': 'surgeryVisualization.report.energyMonopolarCut',
  ultrasonic: 'surgeryVisualization.report.energyUltrasonic',
  other: 'surgeryVisualization.report.energyOther'
}

const COLORS = ['#5c6bc0', '#ff9800', '#26a69a', '#9e9e9e']

function buildOption (data) {
  if (!data || data.length === 0) return null
  const seriesData = data.map((item, i) => ({
    name: LABEL_MAP[item.name] ? t(LABEL_MAP[item.name]) + ' ' + item.percent + '%' : (item.name || '') + ' ' + item.percent + '%',
    value: item.value,
    itemStyle: { color: COLORS[i % COLORS.length] }
  }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {d}%'
    },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: true, formatter: '{b}', fontSize: 11 },
        data: seriesData
      }
    ]
  }
}

function update (retryCount = 0) {
  const el = chartRef.value
  const data = props.typeShare
  if (!el) return
  if (!data || data.length === 0) {
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
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
      if (chartInstance && chartRef.value?.clientWidth > 0 && chartRef.value?.clientHeight > 0) chartInstance.resize()
    })
  }
}

onMounted(() => {
  nextTick(() => update())
  const t1 = setTimeout(() => update(), 200)
  onBeforeUnmount(() => clearTimeout(t1))
})

watch(() => props.typeShare, () => nextTick(() => update()), { deep: true })

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.energy-type-donut-chart {
  width: 100%;
  height: 180px;
  min-height: 180px;
}
</style>
