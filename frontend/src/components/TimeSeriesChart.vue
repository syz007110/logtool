<template>
  <div class="chart-outer" :style="{ width: width ? width + 'px' : '100%', padding: (typeof outerPadding === 'number' ? (outerPadding + 'px') : (outerPadding || 0)) }">
    <div ref="chartContainer" :style="{ width: '100%', height: height + 'px' }"></div>
    <div v-if="showRangeLabels" class="slider-labels">
      <div class="label-item">{{ startLabel }}</div>
      <div class="label-item">{{ endLabel }}</div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

export default {
  name: 'TimeSeriesChart',
  props: {
    seriesData: {
      type: Array,
      default: () => []
    },
    seriesName: {
      type: String,
      default: '数据'
    },
    height: {
      type: Number,
      default: 300
    },
    width: {
      type: Number,
      default: 600
    },
    yAxisFormat: {
      type: String,
      default: 'decimal'
    },
    showRangeLabels: {
      type: Boolean,
      default: true
      },
      // 外层容器与 chart 的间距（px 或 CSS 字符串），作用于 chart-outer 的 padding
      outerPadding: {
        type: [Number, String],
        default: 0
      },
      // 可选：配置 ECharts grid，精确控制图表与坐标轴的内边距
      // 例：{ left: 50, right: 80, top: 20, bottom: 50, containLabel: true }
      gridPadding: {
        type: Object,
        default: null
      }
  },
  setup(props) {
    const chartContainer = ref(null)
    let chartInstance = null
    let globalMinMs = 0
    let globalMaxMs = 0
    const rangeStartMs = ref(0)
    const rangeEndMs = ref(0)

    const formatTs = (ms) => {
      try {
        const d = new Date(ms)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        const ss = String(d.getSeconds()).padStart(2, '0')
        return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
      } catch (_) {
        return ''
      }
    }

    const startLabel = computed(() => formatTs(rangeStartMs.value))
    const endLabel = computed(() => formatTs(rangeEndMs.value))

    const createChart = () => {
      if (!chartContainer.value || !props.seriesData || props.seriesData.length === 0) {
        return
      }

      // 清理现有实例
      if (chartInstance) {
        chartInstance.dispose()
      }

      // 创建新实例
      chartInstance = echarts.init(chartContainer.value)

      // 数据验证
      const validData = props.seriesData.filter(item => 
        Array.isArray(item) && 
        item.length >= 2 && 
        typeof item[0] === 'number' && 
        typeof item[1] === 'number' &&
        !isNaN(item[0]) && 
        !isNaN(item[1]) &&
        isFinite(item[0]) && 
        isFinite(item[1])
      )

      if (validData.length === 0) {
        chartInstance.dispose()
        chartInstance = null
        return
      }

      // 配置选项
      const option = {
        backgroundColor: 'transparent', // 移除整个图表背景色
        title: undefined,
        grid: props.gridPadding || undefined,
        tooltip: {
          trigger: 'axis',
          position: (pt) => [pt[0], '10%'],
          appendToBody: true, // 将tooltip添加到body，避免被容器裁剪
          confine: false, // 不限制tooltip在容器内
          extraCssText: 'z-index: 10000;' // 确保tooltip在最上层
        },
        legend: undefined,
        toolbox: {
          feature: {
            dataZoom: {
              yAxisIndex: 'none'
            },
            restore: {},
            saveAsImage: {}
          }
        },
        xAxis: {
          type: 'time',
          boundaryGap: false,
          backgroundColor: 'transparent', // 移除X轴背景色
          min: Math.min(...validData.map(d => d[0])),
          max: Math.max(...validData.map(d => d[0])),
          axisLabel: {
            overflow: 'none', // 不截断标签
            interval: 'auto', // 自动调整标签间隔
            rotate: 0, // 不旋转标签
            margin: 8 // 增加标签边距
          }
        },
        yAxis: {
          type: 'value',
          boundaryGap: [0, '10%'],
          backgroundColor: 'transparent', // 移除Y轴背景色
          axisLabel: {
            width: 40, // 固定Y轴标签宽度
            overflow: 'truncate', // 超出部分截断
            formatter: (value) => {
              if (props.yAxisFormat === 'integer') {
                return Math.round(value).toString()
              } else if (props.yAxisFormat === 'decimal') {
                return value.toFixed(1)
              }
              return value.toString()
            }
          }
        },
        dataZoom: [
          {
            type: 'inside',
            start: 0,
            end: 100,
            realtime: true,
            throttle: 100,
            zoomLock: false,
            xAxisIndex: 0,
            filterMode: 'filter',
            preventDefaultMouseMove: true
          },
          {
            type: 'slider',
            start: 0,
            end: 100,
            realtime: true,
            throttle: 100,
            zoomLock: false,
            showDetail: false, // 关闭内置标签，使用自定义下方标签
            showDataShadow: true,
            xAxisIndex: 0,
            bottom: 10,
            filterMode: 'filter',
            moveHandleSize: 8,
            preventDefaultMouseMove: true,
            labelFormatter: (value) => {
              const date = new Date(value)
              const year = date.getFullYear()
              const month = String(date.getMonth() + 1).padStart(2, '0')
              const day = String(date.getDate()).padStart(2, '0')
              const hours = String(date.getHours()).padStart(2, '0')
              const minutes = String(date.getMinutes()).padStart(2, '0')
              const seconds = String(date.getSeconds()).padStart(2, '0')
              
              return `${year}-${month}-${day}\n${hours}:${minutes}:${seconds}`
            }
          }
        ],
        series: [
          {
            name: props.seriesName,
            type: 'line',
            symbol: 'none',
            sampling: false,
            data: validData,
            lineStyle: {
              width: 1.5
            },
            areaStyle: null // 移除区域背景色
          }
        ]
      }

      chartInstance.setOption(option, true)

      // 初始化全局范围与当前显示范围
      globalMinMs = Math.min(...validData.map(d => d[0]))
      globalMaxMs = Math.max(...validData.map(d => d[0]))
      rangeStartMs.value = globalMinMs
      rangeEndMs.value = globalMaxMs

      // 同步自定义范围标签
      chartInstance.off('dataZoom')
      chartInstance.on('dataZoom', (ev) => {
        const hasValue = Object.prototype.hasOwnProperty.call(ev, 'startValue') && Object.prototype.hasOwnProperty.call(ev, 'endValue')
        const startMs = hasValue && ev.startValue != null ? ev.startValue : (globalMinMs + (globalMaxMs - globalMinMs) * ((ev.start ?? 0) / 100))
        const endMs = hasValue && ev.endValue != null ? ev.endValue : (globalMinMs + (globalMaxMs - globalMinMs) * ((ev.end ?? 100) / 100))
        rangeStartMs.value = Math.max(globalMinMs, Math.min(startMs, globalMaxMs))
        rangeEndMs.value = Math.max(globalMinMs, Math.min(endMs, globalMaxMs))
      })
    }

    const resizeChart = () => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }

    // 监听数据变化
    watch(() => props.seriesData, () => {
      nextTick(() => {
        createChart()
      })
    }, { deep: true })

    // 监听高度变化
    watch(() => props.height, () => {
      nextTick(() => {
        resizeChart()
      })
    })

    // 监听宽度变化
    watch(() => props.width, () => {
      nextTick(() => {
        resizeChart()
      })
    })

    onMounted(() => {
      nextTick(() => {
        createChart()
      })
      
      // 监听窗口大小变化
      window.addEventListener('resize', resizeChart)
    })

    onBeforeUnmount(() => {
      if (chartInstance) {
        chartInstance.dispose()
        chartInstance = null
      }
      window.removeEventListener('resize', resizeChart)
    })

    return {
      chartContainer,
      startLabel,
      endLabel
    }
  }
}
</script>

<style scoped>
/* 图表容器样式 */
.chart-outer {
  display: flex;
  flex-direction: column;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.label-item {
  overflow: visible;
}
</style>
