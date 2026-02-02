<template>
  <div class="chart-outer" :style="{ width: (width != null && width > 0) ? width + 'px' : '100%', padding: (typeof outerPadding === 'number' ? (outerPadding + 'px') : (outerPadding || 0)) }">
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
  emits: ['rangeChange'],
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
      default: null
    },
    yAxisFormat: {
      type: String,
      default: 'decimal'
    },
    showRangeLabels: {
      type: Boolean,
      default: true
      },
      // 可选：按指定时区偏移(分钟)格式化 X 轴/tooltip/范围标签
      // 说明：seriesData 的时间值必须是 epoch 毫秒（或可被 ECharts 当作时间戳的值）
      // - 传 null/undefined：沿用浏览器本地时区显示（默认行为）
      // - 传数字：按 UTC + offsetMinutes 显示（例如 480 表示 UTC+8）
      timezoneOffsetMinutes: {
        type: [Number, String],
        default: null
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
      },
      // 是否显示底部 dataZoom 滑块
      enableSlider: {
        type: Boolean,
        default: true
      },
      // 是否显示工具箱（保存图片、数据缩放按钮等）
      showToolbox: {
        type: Boolean,
        default: true
      },
      // 线条颜色
      lineColor: {
        type: String,
        default: '#6366f1'
      },
      // 区域填充颜色（渐变起始色）
      areaColor: {
        type: String,
        default: null
      },
      // 区域填充结束颜色（渐变结束色）
      areaColorEnd: {
        type: String,
        default: null
      },
      // 是否平滑折线
      smooth: {
        type: Boolean,
        default: true
      },
      // 阶梯图模式：'start' | 'middle' | 'end' | false
      // 'start': 阶梯从数据点开始
      // 'middle': 阶梯在数据点中间
      // 'end': 阶梯在数据点结束
      // false: 普通折线图
      step: {
        type: [String, Boolean],
        default: false,
        validator: (value) => value === false || value === 'start' || value === 'middle' || value === 'end'
      },
      // 时间拖拽轴样式配置
      sliderStyle: {
        type: Object,
        default: () => ({
          handleColor: '#409EFF',
          borderColor: 'rgba(99, 102, 241, 0.3)',
          fillerColor: 'rgba(99, 102, 241, 0.2)',
          backgroundColor: 'rgba(148, 163, 184, 0.15)',
          height: 30
        })
      }
  },
  setup(props, { emit }) {
    const chartContainer = ref(null)
    let chartInstance = null
    let globalMinMs = 0
    let globalMaxMs = 0
    const rangeStartMs = ref(0)
    const rangeEndMs = ref(0)

    const getTimezoneOffsetMinutes = () => {
      if (props.timezoneOffsetMinutes == null || props.timezoneOffsetMinutes === '') return null
      const n = typeof props.timezoneOffsetMinutes === 'string'
        ? parseInt(props.timezoneOffsetMinutes, 10)
        : props.timezoneOffsetMinutes
      return Number.isFinite(n) ? n : null
    }

    const formatTs = (ms) => {
      try {
        const offsetMinutes = getTimezoneOffsetMinutes()
        // 未指定时区：沿用浏览器本地时区
        if (offsetMinutes == null) {
          const d = new Date(ms)
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const day = String(d.getDate()).padStart(2, '0')
          const hh = String(d.getHours()).padStart(2, '0')
          const mm = String(d.getMinutes()).padStart(2, '0')
          const ss = String(d.getSeconds()).padStart(2, '0')
          return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
        }
        // 指定时区：用 UTC getter + (ms + offset) 避免本地时区影响
        const d = new Date(ms + offsetMinutes * 60 * 1000)
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        const hh = String(d.getUTCHours()).padStart(2, '0')
        const mm = String(d.getUTCMinutes()).padStart(2, '0')
        const ss = String(d.getUTCSeconds()).padStart(2, '0')
        return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
      } catch (_) {
        return ''
      }
    }

    // X 轴刻度标签：按时间跨度用短格式，与原来 ECharts time 轴风格一致（短跨度不显示年月）
    const formatTsAxisLabel = (ms, timeSpanMs) => {
      try {
        const offsetMinutes = getTimezoneOffsetMinutes()
        const displayMs = offsetMinutes != null ? ms + offsetMinutes * 60 * 1000 : ms
        const d = offsetMinutes != null ? new Date(displayMs) : new Date(ms)
        const getY = () => (offsetMinutes != null ? d.getUTCFullYear() : d.getFullYear())
        const getM = () => String((offsetMinutes != null ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0')
        const getD = () => String(offsetMinutes != null ? d.getUTCDate() : d.getDate()).padStart(2, '0')
        const getH = () => String(offsetMinutes != null ? d.getUTCHours() : d.getHours()).padStart(2, '0')
        const getMi = () => String(offsetMinutes != null ? d.getUTCMinutes() : d.getMinutes()).padStart(2, '0')
        const getS = () => String(offsetMinutes != null ? d.getUTCSeconds() : d.getSeconds()).padStart(2, '0')
        const dayMs = 24 * 60 * 60 * 1000
        const weekMs = 7 * dayMs
        if (timeSpanMs < dayMs) return `${getH()}:${getMi()}:${getS()}`
        if (timeSpanMs < weekMs) return `${getM()}-${getD()} ${getH()}:${getMi()}`
        return `${getY()}-${getM()}-${getD()} ${getH()}:${getMi()}`
      } catch (_) {
        return ''
      }
    }

    const formatYAxisValue = (value) => {
      if (props.yAxisFormat === 'integer') return Math.round(value).toString()
      if (props.yAxisFormat === 'decimal') return Number(value).toFixed(1)
      return String(value)
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
      // 处理 grid 配置：如果传入了 gridPadding，确保 bottom 值正确设置
      const gridConfig = props.gridPadding 
        ? { 
            ...props.gridPadding, 
            bottom: props.gridPadding.bottom !== undefined 
              ? props.gridPadding.bottom 
              : (props.enableSlider ? 60 : 16)
          }
        : { left: 16, right: 16, top: 16, bottom: props.enableSlider ? 60 : 16, containLabel: true }

      const minX = Math.min(...validData.map(d => d[0]))
      const maxX = Math.max(...validData.map(d => d[0]))
      const timeSpanMs = maxX - minX
      
      const option = {
        backgroundColor: 'transparent', // 移除整个图表背景色
        title: undefined,
        grid: gridConfig,
        tooltip: {
          trigger: 'axis',
          position: (pt) => [pt[0], '8%'],
          appendToBody: true,
          confine: false,
          borderWidth: 0,
          backgroundColor: 'rgba(17, 24, 39, 0.92)',
          textStyle: {
            color: '#f9fafb',
            fontSize: 11
          },
          formatter: (params) => {
            if (!params || !Array.isArray(params) || params.length === 0) return ''
            const axisMs = params[0]?.axisValue
            const timeStr = formatTs(axisMs)
            const lines = params.map((p) => {
              const val = Array.isArray(p.value) ? p.value[1] : p.value
              return `${p.marker || ''} ${p.seriesName || ''}: ${formatYAxisValue(val)}`
            })
            return `${timeStr}<br/>${lines.join('<br/>')}`
          },
          axisPointer: {
            type: 'line',
            lineStyle: {
              color: '#6366f1',
              width: 1
            }
          }
        },
        legend: undefined,
        toolbox: props.showToolbox ? {
          feature: {
            dataZoom: {
              yAxisIndex: 'none'
            },
            restore: {},
            saveAsImage: {}
          }
        } : undefined,
        xAxis: {
          type: 'time',
          boundaryGap: false,
          axisLine: {
            show: false
          },
          axisTick: {
            show: false
          },
          axisLabel: {
            color: '#6a7282',
            fontSize: 11,
            margin: 10,
            formatter: (value) => formatTsAxisLabel(value, timeSpanMs)
          },
          splitLine: {
            show: false
          },
          min: minX,
          max: maxX
        },
        yAxis: {
          type: 'value',
          boundaryGap: [0, '10%'],
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: '#6a7282',
            fontSize: 11,
            width: 40,
            overflow: 'truncate',
            formatter: (value) => formatYAxisValue(value)
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: 'rgba(15, 23, 42, 0.08)'
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
          ...(props.enableSlider ? [
            {
              type: 'slider',
              start: 0,
              end: 100,
              realtime: true,
              throttle: 100,
              zoomLock: false,
              showDetail: false,
              showDataShadow: false,
              handleSize: 14,
              handleIcon: 'M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
              handleStyle: {
                color: 'transparent',
                borderColor: props.sliderStyle.handleColor || '#409EFF',
                borderWidth: 2
              },
              height: props.sliderStyle.height || 30,
              borderColor: props.sliderStyle.borderColor || 'rgba(99, 102, 241, 0.3)',
              fillerColor: props.sliderStyle.fillerColor || 'rgba(99, 102, 241, 0.2)',
              backgroundColor: props.sliderStyle.backgroundColor || 'rgba(148, 163, 184, 0.15)',
              brushSelect: false,
              xAxisIndex: 0,
              bottom: 4,
              filterMode: 'filter',
              moveHandleSize: 16,
              moveHandleIcon: 'M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
              moveHandleStyle: {
                color: 'transparent',
                borderColor: props.sliderStyle.handleColor || '#409EFF',
                borderWidth: 2
              },
              preventDefaultMouseMove: false,
              labelFormatter: (value) => {
                const offsetMinutes = getTimezoneOffsetMinutes()
                // 未指定：本地时区
                if (offsetMinutes == null) {
                  const date = new Date(value)
                  const year = date.getFullYear()
                  const month = String(date.getMonth() + 1).padStart(2, '0')
                  const day = String(date.getDate()).padStart(2, '0')
                  const hours = String(date.getHours()).padStart(2, '0')
                  const minutes = String(date.getMinutes()).padStart(2, '0')
                  const seconds = String(date.getSeconds()).padStart(2, '0')
                  return `${year}-${month}-${day}\n${hours}:${minutes}:${seconds}`
                }
                // 指定：UTC getter + (ms + offset)
                const date = new Date(value + offsetMinutes * 60 * 1000)
                const year = date.getUTCFullYear()
                const month = String(date.getUTCMonth() + 1).padStart(2, '0')
                const day = String(date.getUTCDate()).padStart(2, '0')
                const hours = String(date.getUTCHours()).padStart(2, '0')
                const minutes = String(date.getUTCMinutes()).padStart(2, '0')
                const seconds = String(date.getUTCSeconds()).padStart(2, '0')
                return `${year}-${month}-${day}\n${hours}:${minutes}:${seconds}`
              }
            }
          ] : [])
        ],
        series: [
          {
            name: props.seriesName,
            type: 'line',
            symbol: 'circle',
            symbolSize: 2,
            smooth: props.smooth,
            step: props.step || false,
            sampling: false,
            data: validData,
            itemStyle: {
              color: props.lineColor
            },
            lineStyle: {
              width: 2,
              cap: 'round',
              join: 'round',
              color: props.lineColor
            },
            areaStyle: props.areaColor || props.areaColorEnd
              ? {
                  opacity: 0.2,
                  color: props.areaColorEnd
                    ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: props.areaColor || props.lineColor },
                        { offset: 1, color: props.areaColorEnd || props.lineColor }
                      ])
                    : props.areaColor || props.lineColor
                }
              : {
                  opacity: 0.12
                }
          }
        ]
      }

      chartInstance.setOption(option, true)

      // 初始化全局范围与当前显示范围
      globalMinMs = Math.min(...validData.map(d => d[0]))
      globalMaxMs = Math.max(...validData.map(d => d[0]))
      rangeStartMs.value = globalMinMs
      rangeEndMs.value = globalMaxMs

      // 获取当前图表的实际显示范围
      const getCurrentDisplayRange = () => {
        try {
          const option = chartInstance.getOption()
          
          // 方法1: 从 option 中的 dataZoom 配置获取（最准确，包括工具箱按钮选择的范围）
          if (option && option.dataZoom && Array.isArray(option.dataZoom)) {
            // 优先查找 slider 类型的 dataZoom（拖拽轴）
            let sliderDataZoom = null
            let insideDataZoom = null
            
            for (let i = 0; i < option.dataZoom.length; i++) {
              const dataZoom = option.dataZoom[i]
              const xAxisIndex = dataZoom.xAxisIndex
              // 检查是否影响第一个 x 轴
              if (xAxisIndex === 0 || xAxisIndex === undefined || (Array.isArray(xAxisIndex) && xAxisIndex.includes(0))) {
                if (dataZoom.type === 'slider') {
                  sliderDataZoom = dataZoom
                } else if (dataZoom.type === 'inside') {
                  insideDataZoom = dataZoom
                }
              }
            }
            
            // 优先使用 slider 的范围，如果没有则使用 inside 的范围
            const targetDataZoom = sliderDataZoom || insideDataZoom
            if (targetDataZoom && targetDataZoom.start != null && targetDataZoom.end != null) {
              const start = targetDataZoom.start
              const end = targetDataZoom.end
              const startMs = globalMinMs + (globalMaxMs - globalMinMs) * (start / 100)
              const endMs = globalMinMs + (globalMaxMs - globalMinMs) * (end / 100)
              return {
                startMs: Math.max(globalMinMs, Math.min(startMs, globalMaxMs)),
                endMs: Math.max(globalMinMs, Math.min(endMs, globalMaxMs))
              }
            }
          }
          
          // 方法2: 从组件模型获取（备用方法）
          const dataZoomComponents = chartInstance.getModel().getComponent('dataZoom')
          if (dataZoomComponents && dataZoomComponents.length > 0) {
            let sliderDataZoom = null
            let insideDataZoom = null
            
            for (let i = 0; i < dataZoomComponents.length; i++) {
              const dataZoom = dataZoomComponents[i]
              const xAxisIndex = dataZoom.option.xAxisIndex
              if (xAxisIndex === 0 || xAxisIndex === undefined || (Array.isArray(xAxisIndex) && xAxisIndex.includes(0))) {
                if (dataZoom.option.type === 'slider') {
                  sliderDataZoom = dataZoom
                } else if (dataZoom.option.type === 'inside') {
                  insideDataZoom = dataZoom
                }
              }
            }
            
            const targetDataZoom = sliderDataZoom || insideDataZoom
            if (targetDataZoom && targetDataZoom.option.start != null && targetDataZoom.option.end != null) {
              const start = targetDataZoom.option.start
              const end = targetDataZoom.option.end
              const startMs = globalMinMs + (globalMaxMs - globalMinMs) * (start / 100)
              const endMs = globalMinMs + (globalMaxMs - globalMinMs) * (end / 100)
              return {
                startMs: Math.max(globalMinMs, Math.min(startMs, globalMaxMs)),
                endMs: Math.max(globalMinMs, Math.min(endMs, globalMaxMs))
              }
            }
          }
          
          // 方法3: 从 xAxis 的 min/max 获取（如果设置了）
          if (option && option.xAxis && option.xAxis[0]) {
            const xAxis = option.xAxis[0]
            if (xAxis.min !== undefined && xAxis.max !== undefined) {
              return {
                startMs: Math.max(globalMinMs, Math.min(xAxis.min, globalMaxMs)),
                endMs: Math.max(globalMinMs, Math.min(xAxis.max, globalMaxMs))
              }
            }
          }
          
          // 默认返回全局范围
          return {
            startMs: globalMinMs,
            endMs: globalMaxMs
          }
        } catch (error) {
          console.error('获取图表显示范围失败:', error)
          return {
            startMs: globalMinMs,
            endMs: globalMaxMs
          }
        }
      }
      
      // 触发范围更新事件
      const emitRangeChange = () => {
        const range = getCurrentDisplayRange()
        // 确保范围有效
        if (range && range.startMs != null && range.endMs != null) {
          rangeStartMs.value = range.startMs
          rangeEndMs.value = range.endMs
          emit('rangeChange', { startMs: range.startMs, endMs: range.endMs })
        } else {
          // 如果获取失败，使用当前保存的范围
          emit('rangeChange', { startMs: rangeStartMs.value, endMs: rangeEndMs.value })
        }
      }
      
      // 监听 dataZoom 事件（包括拖拽轴、区域缩放和工具箱按钮）
      chartInstance.off('dataZoom')
      chartInstance.on('dataZoom', (ev) => {
        // 优先从事件对象中获取范围（更准确）
        let startMs = null
        let endMs = null
        
        if (ev.startValue != null && ev.endValue != null) {
          // 事件对象中有精确的时间值（拖拽轴通常会提供）
          startMs = ev.startValue
          endMs = ev.endValue
        } else if (ev.start != null && ev.end != null) {
          // 事件对象中有百分比值，转换为时间戳
          startMs = globalMinMs + (globalMaxMs - globalMinMs) * (ev.start / 100)
          endMs = globalMinMs + (globalMaxMs - globalMinMs) * (ev.end / 100)
        }
        
        // 如果从事件对象中获取到了范围，直接使用
        if (startMs != null && endMs != null) {
          rangeStartMs.value = Math.max(globalMinMs, Math.min(startMs, globalMaxMs))
          rangeEndMs.value = Math.max(globalMinMs, Math.min(endMs, globalMaxMs))
          // 使用 nextTick 确保图表已经更新后再触发事件
          nextTick(() => {
            emit('rangeChange', { startMs: rangeStartMs.value, endMs: rangeEndMs.value })
          })
        } else {
          // 如果事件对象中没有范围信息（可能是工具箱按钮选择区域）
          // 需要延迟获取，确保图表已经更新了 dataZoom 组件的值
          // 使用更长的延迟，确保区域缩放操作完全完成
          setTimeout(() => {
            nextTick(() => {
              // 再次尝试从事件对象获取（可能延迟后有了）
              const currentRange = getCurrentDisplayRange()
              if (currentRange && currentRange.startMs != null && currentRange.endMs != null) {
                rangeStartMs.value = currentRange.startMs
                rangeEndMs.value = currentRange.endMs
                emit('rangeChange', { startMs: currentRange.startMs, endMs: currentRange.endMs })
              } else {
                // 如果还是获取不到，使用 emitRangeChange
                emitRangeChange()
              }
            })
          }, 200) // 延迟200ms，确保区域缩放操作完全完成并更新到图表
        }
      })
      
      // 监听 restore 事件（还原按钮）
      chartInstance.off('restore')
      chartInstance.on('restore', () => {
        // 还原时重置到全局范围
        rangeStartMs.value = globalMinMs
        rangeEndMs.value = globalMaxMs
        
        // 使用 nextTick 确保图表已经还原后再触发事件
        nextTick(() => {
          emit('rangeChange', { startMs: rangeStartMs.value, endMs: rangeEndMs.value })
        })
      })
      
      // 注意：不再使用 mouseup 事件监听器
      // 因为 dataZoom 事件已经能够处理所有情况（拖拽轴、区域缩放、工具箱按钮）
      // mouseup 事件会在拖拽结束后触发，可能会覆盖 dataZoom 事件的正确范围
      
      // 初始化时也触发一次事件
      emit('rangeChange', { startMs: rangeStartMs.value, endMs: rangeEndMs.value })
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

    // 监听时区偏移变化：需要重建 formatter 才能生效
    watch(() => props.timezoneOffsetMinutes, () => {
      nextTick(() => {
        createChart()
      })
    })

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
