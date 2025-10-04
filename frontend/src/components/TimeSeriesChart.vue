<template>
  <div ref="chartContainer" :style="{ width: width ? width + 'px' : '100%', height: height + 'px' }"></div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
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
    }
  },
  setup(props) {
    const chartContainer = ref(null)
    let chartInstance = null

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
        tooltip: {
          trigger: 'axis',
          position: (pt) => [pt[0], '10%']
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
          max: Math.max(...validData.map(d => d[0]))
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
            showDetail: true,
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
      chartContainer
    }
  }
}
</script>

<style scoped>
/* 图表容器样式 */
</style>
