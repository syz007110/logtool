<template>
  <div style="width: 100%;">
    <div :style="{ width: '100%', height: height + 'px' }" ref="chartEl"></div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

export default {
  name: 'TimeSeriesChart',
  props: {
    seriesData: { type: Array, required: true }, // [[timestampMs:number, value:number], ...]
    title: { type: String, default: '' },
    seriesName: { type: String, default: '数据' },
    height: { type: Number, default: 450 },
    showRangeLabels: { type: Boolean, default: true }
  },
  setup(props) {
    const chartEl = ref(null)
    let chart = null
    const gridLeft = 20
    const gridRight = 60
    const gridTop = 50
    const gridBottom = 80

    // x 轴期望分割数（约等于刻度数-1）
    const desiredSplitNumber = 6

    // Track current visible x-axis range for axis label formatting
    let currentXAxisMin = null
    let currentXAxisMax = null

    const disposeChart = () => {
      try {
        if (chart) { chart.dispose(); chart = null }
      } catch (_) {}
      const existing = chartEl.value && echarts.getInstanceByDom(chartEl.value)
      if (existing) {
        try { existing.dispose() } catch (_) {}
      }
    }

    const ensureChart = () => {
      if (!chartEl.value) return null
      if (chart && !chart.isDisposed()) return chart
      disposeChart()
      chart = echarts.init(chartEl.value)
      return chart
    }

    const formatTime = (value, minV = null, maxV = null) => {
      const d = new Date(value)
      const y = d.getFullYear()
      const M = String(d.getMonth() + 1).padStart(2, '0')
      const D = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      if (minV == null || maxV == null) return `${hh}:${mm}:${ss}`
      const dMin = new Date(minV)
      const dMax = new Date(maxV)
      const sameDay = dMin.getFullYear() === dMax.getFullYear() && dMin.getMonth() === dMax.getMonth() && dMin.getDate() === dMax.getDate()
      const sameMonth = dMin.getFullYear() === dMax.getFullYear() && dMin.getMonth() === dMax.getMonth()
      const sameYear = dMin.getFullYear() === dMax.getFullYear()
      if (sameDay) return `${hh}:${mm}:${ss}`
      if (sameMonth && sameYear) return `${M}/${D} ${hh}:${mm}:${ss}`
      if (sameYear) return `${M}/${D} ${hh}:${mm}:${ss}`
      return `${y}/${M}/${D} ${hh}:${mm}:${ss}`
    }

    const formatShortTime = (value) => {
      const d = new Date(value)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    }

    const formatFullDateTime = (value) => {
      const d = new Date(value)
      const y = d.getFullYear()
      const M = String(d.getMonth() + 1).padStart(2, '0')
      const D = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      return `${y}/${M}/${D} ${hh}:${mm}:${ss}`
    }

    const crossesDayMonthYear = (minV, maxV) => {
      if (minV == null || maxV == null) return false
      const dMin = new Date(minV)
      const dMax = new Date(maxV)
      if (dMin.getFullYear() !== dMax.getFullYear()) return true
      if (dMin.getMonth() !== dMax.getMonth()) return true
      if (dMin.getDate() !== dMax.getDate()) return true
      return false
    }

    const updateRangeFromOption = (c) => {
      try {
        const opt = c.getOption()
        const dzs = (opt && opt.dataZoom) || []
        const dz = dzs.find(d => d.type === 'slider') || dzs[0]
        const startV = dz && (dz.startValue != null ? dz.startValue : dz.start)
        const endV = dz && (dz.endValue != null ? dz.endValue : dz.end)
        if (startV != null && endV != null) {
          const xRange = c.getOption()?.xAxis?.[0]
          const minV = xRange?.min
          const maxV = xRange?.max
          // Compute actual numeric window for y-scale recompute
          const startTs = (typeof startV === 'number') ? startV : (minV + (maxV - minV) * (Number(startV) / 100))
          const endTs = (typeof endV === 'number') ? endV : (minV + (maxV - minV) * (Number(endV) / 100))

          // Update current visible x range for axis label formatting
          currentXAxisMin = startTs
          currentXAxisMax = endTs

          // Recompute y-axis min/max for the visible range
          const inWindow = Array.isArray(props.seriesData)
            ? props.seriesData.filter(d => Array.isArray(d) && d.length >= 2 && typeof d[0] === 'number' && typeof d[1] === 'number' && d[0] >= startTs && d[0] <= endTs)
            : []
          if (inWindow.length > 0) {
            let yMin = Math.min(...inWindow.map(d => d[1]))
            let yMax = Math.max(...inWindow.map(d => d[1]))
            if (!isFinite(yMin) || !isFinite(yMax)) return
            if (yMin === yMax) {
              const delta = Math.max(1, Math.abs(yMin) * 0.05)
              yMin = yMin - delta
              yMax = yMax + delta
            } else {
              const pad = (yMax - yMin) * 0.05
              yMin = yMin - pad
              yMax = yMax + pad
            }
            c.setOption({ yAxis: { min: yMin, max: yMax, scale: true } }, false)
          }
        }
      } catch (_) {}
    }

    const updateChart = () => {
      if (!Array.isArray(props.seriesData) || props.seriesData.length === 0) {
        disposeChart()
        return
      }
      const c = ensureChart()
      if (!c) return

      const xMin = Math.min(...props.seriesData.map(d => d[0]))
      const xMax = Math.max(...props.seriesData.map(d => d[0]))

      // Initialize current x range
      currentXAxisMin = xMin
      currentXAxisMax = xMax

      c.setOption({
        grid: { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom, containLabel: true },
        backgroundColor: 'transparent',
        // 主图表不显示标题，由父层统一显示在弹窗标题下方
        title: undefined,
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        toolbox: {
          right: 10,
          top: 10,
          feature: { dataZoom: { yAxisIndex: 'none' }, restore: {}, saveAsImage: {} }
        },
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseWheel: true, moveOnMouseMove: true, startValue: xMin, endValue: xMax },
          { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 44, bottom: 32, showDataShadow: true, brushSelect: true, showDetail: false, startValue: xMin, endValue: xMax, showLabel: false }
        ],
        xAxis: { 
          type: 'time', 
          min: xMin, 
          max: xMax, 
          boundaryGap: false,
          splitNumber: desiredSplitNumber,
          axisLabel: {
            showMinLabel: true,
            showMaxLabel: true,
            hideOverlap: true,
            formatter: (value) => {
              const cross = crossesDayMonthYear(currentXAxisMin, currentXAxisMax)
              if (!cross) return formatShortTime(value)
              const span = (currentXAxisMax != null && currentXAxisMin != null) ? (currentXAxisMax - currentXAxisMin) : 0
              const eps = span > 0 ? span / 50 : 0 // ~2% range threshold
              const nearStart = currentXAxisMin != null && Math.abs(value - currentXAxisMin) <= eps
              const nearEnd = currentXAxisMax != null && Math.abs(value - currentXAxisMax) <= eps
              if (nearStart || nearEnd) return formatFullDateTime(value)
              return formatShortTime(value)
            }
          }
        },
        yAxis: { type: 'value', boundaryGap: [0, '5%'], scale: true, min: 'dataMin', max: 'dataMax' },
        series: [{
          name: props.seriesName || '数据',
          type: 'line',
          showSymbol: false,
          sampling: false,
          lineStyle: { width: 2, color: '#409EFF' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(64,158,255,0.25)' },
              { offset: 1, color: 'rgba(64,158,255,0.05)' }
            ])
          },
          data: props.seriesData
        }]
      }, true)

      // 初始化y轴范围并绑定事件
      try { c.off && c.off('dataZoom') } catch (_) {}
      c.on && c.on('dataZoom', () => updateRangeFromOption(c))
      // Also set initial y-axis based on full range
      updateRangeFromOption(c)

      // 轻量 resize 监听
      requestAnimationFrame(() => { try { c.resize() } catch (_) {} })
    }

    onMounted(async () => {
      await nextTick()
      updateChart()
      window.addEventListener('resize', updateChart)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', updateChart)
      disposeChart()
    })

    watch(() => [props.seriesData, props.seriesName, props.title, props.height], () => {
      nextTick(() => updateChart())
    }, { deep: true })

    return { chartEl, gridLeft, gridRight }
  }
}
</script>

<style scoped>
</style>


