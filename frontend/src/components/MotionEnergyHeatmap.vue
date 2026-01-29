<template>
  <div class="meh-outer" :style="{ width: width ? width + 'px' : '100%' }">
    <div ref="chartContainer" :style="{ width: '100%', height: height + 'px' }"></div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as echarts from 'echarts'

export default {
  name: 'MotionEnergyHeatmap',
  emits: ['cellClick'],
  props: {
    // { themes: string[], times: string[], data: Array<[timeIdx, themeIdx, value0to1]> }
    heatmap: {
      type: Object,
      default: () => ({ themes: [], times: [], data: [] })
    },
    height: {
      type: Number,
      default: 96
    },
    width: {
      type: Number,
      default: 0
    }
  },
  setup(props, { emit }) {
    const chartContainer = ref(null)
    let chartInstance = null

    const render = () => {
      const themes = props.heatmap?.themes || []
      const times = props.heatmap?.times || []
      const data = props.heatmap?.data || []

      if (!chartContainer.value || themes.length === 0 || times.length === 0) return
      if (chartInstance) chartInstance.dispose()
      chartInstance = echarts.init(chartContainer.value)

      const option = {
        backgroundColor: 'transparent',
        grid: { left: 8, right: 8, top: 8, bottom: 28, containLabel: true },
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(17, 24, 39, 0.92)',
          borderWidth: 0,
          textStyle: { color: '#f9fafb', fontSize: 11 },
          formatter: (p) => {
            const v = Array.isArray(p?.value) ? p.value : []
            const timeIdx = v[0]
            const themeIdx = v[1]
            const val = v[2]
            const timeLabel = times[timeIdx] || ''
            const themeLabel = themes[themeIdx] || ''
            const pct = typeof val === 'number' ? Math.round(val * 100) : '-'
            return `${themeLabel}<br/>${timeLabel}<br/>强度: ${pct}%`
          }
        },
        xAxis: {
          type: 'category',
          data: times,
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: '#6a7282', fontSize: 10, interval: Math.max(0, Math.floor(times.length / 6)) }
        },
        yAxis: {
          type: 'category',
          data: themes,
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: '#6a7282', fontSize: 10 }
        },
        visualMap: {
          min: 0,
          max: 1,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          itemWidth: 12,
          itemHeight: 8,
          textStyle: { color: '#6a7282', fontSize: 10 },
          inRange: {
            color: ['rgba(148, 163, 184, 0.18)', 'rgba(99, 102, 241, 0.35)', 'rgba(99, 102, 241, 0.9)']
          }
        },
        series: [
          {
            type: 'heatmap',
            data,
            emphasis: { itemStyle: { borderColor: 'rgba(99, 102, 241, 1)', borderWidth: 1 } },
            progressive: 2000
          }
        ]
      }

      chartInstance.setOption(option, true)
      chartInstance.off('click')
      chartInstance.on('click', (p) => {
        if (p?.componentType !== 'series') return
        const v = Array.isArray(p?.value) ? p.value : []
        emit('cellClick', { timeIdx: v[0], themeIdx: v[1], value: v[2] })
      })
    }

    onMounted(() => render())
    watch(() => props.heatmap, () => render(), { deep: true })
    onBeforeUnmount(() => { if (chartInstance) chartInstance.dispose() })

    return { chartContainer }
  }
}
</script>

<style scoped>
.meh-outer {
  width: 100%;
}
</style>

