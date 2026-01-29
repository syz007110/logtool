<template>
  <div class="motion-chart-outer" :style="{ width: width ? width + 'px' : '100%', height: resolvedHeight }">
    <div ref="chartContainer" :style="{ width: '100%', height: '100%' }"></div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUpdated, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

export default {
  name: 'MotionTimeSeriesChart',
  emits: ['rangeChange', 'cursorChange'],
  props: {
    seriesData: {
      // 兼容两种形态：
      // 1) 单曲线：[[tsMs, value], ...]
      // 2) 多曲线：[{ name: string, data: [[tsMs, value], ...], color?: string }, ...]
      type: Array,
      default: () => []
    },
    seriesName: {
      type: String,
      default: '数据'
    },
    height: {
      // 支持 number(px) 或 string(如 '100%')，用于自适应父容器高度
      type: [Number, String],
      default: 240
    },
    width: {
      type: Number,
      default: null
    },
    yAxisFormat: {
      type: String,
      default: 'decimal'
    },
    // 是否显示底部 dataZoom 滑块
    enableSlider: {
      type: Boolean,
      default: true
    },
    // 线条颜色
    lineColor: {
      type: String,
      default: '#6366f1'
    },
    // 是否平滑折线
    smooth: {
      type: Boolean,
      default: true
    },
    // 当前播放时间游标（毫秒时间戳），用于视频/日志同步
    cursorMs: {
      type: Number,
      default: null
    },
    // y轴自适应模式：'auto'（根据可见窗口自动调整）| 'global'（使用全局数据范围）
    yAxisFitMode: {
      type: String,
      default: 'auto',
      validator: (value) => value === 'auto' || value === 'global'
    }
  },
  setup(props, { emit }) {
    const chartContainer = ref(null)
    let chartInstance = null
    let globalMinMs = 0
    let globalMaxMs = 0
    let globalMinY = null
    let globalMaxY = null
    const rangeStartMs = ref(0)
    const rangeEndMs = ref(0)

    const resolvedHeight = computed(() => {
      if (typeof props.height === 'number') return `${props.height}px`
      const s = String(props.height || '').trim()
      return s || '100%'
    })

    const normalizeSeriesInput = () => {
      const input = Array.isArray(props.seriesData) ? props.seriesData : []
      if (input.length === 0) return []

      const first = input[0]
      // 单曲线：[[x,y], ...]
      if (Array.isArray(first)) {
        return [{
          name: props.seriesName || '数据',
          data: input
        }]
      }
      // 多曲线：[{name, data}, ...]
      if (first && typeof first === 'object' && Array.isArray(first.data)) {
        return input
          .filter(s => s && typeof s === 'object' && Array.isArray(s.data))
          .map((s) => ({
            name: String(s.name || '数据'),
            data: Array.isArray(s.data) ? s.data : [],
            color: s.color || null
          }))
      }
      return []
    }

    const validateSeriesPoints = (points) => (Array.isArray(points) ? points : []).filter(item =>
      Array.isArray(item) &&
      item.length >= 2 &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number' &&
      !isNaN(item[0]) &&
      !isNaN(item[1]) &&
      isFinite(item[0]) &&
      isFinite(item[1])
    )

    // 获取当前可见窗口的数据范围（用于 y 轴自适应）
    const getVisibleDataRange = () => {
      try {
        if (!chartInstance) {
          return { minY: globalMinY, maxY: globalMaxY }
        }
        const model = chartInstance.getModel && chartInstance.getModel()
        if (!model || typeof model.getComponent !== 'function') {
          return { minY: globalMinY, maxY: globalMaxY }
        }

        // 方法1: 从 dataZoom 组件获取当前显示范围
        const dataZoomComponents = model.getComponent('dataZoom')
        let startPercent = 0
        let endPercent = 100

        if (dataZoomComponents && dataZoomComponents.length > 0) {
          for (const dz of dataZoomComponents) {
            const xAxisIndex = dz.option.xAxisIndex
            if ((xAxisIndex === 0 || xAxisIndex === undefined) && dz.option.start != null && dz.option.end != null) {
              startPercent = dz.option.start
              endPercent = dz.option.end
              break
            }
          }
        } else {
          // 方法2: 从 option 获取（备用）
          const option = chartInstance.getOption()
          if (option && option.dataZoom && Array.isArray(option.dataZoom)) {
            for (const dz of option.dataZoom) {
              if ((dz.xAxisIndex === 0 || dz.xAxisIndex === undefined) && dz.start != null && dz.end != null) {
                startPercent = dz.start
                endPercent = dz.end
                break
              }
            }
          }
        }

        const startMs = globalMinMs + (globalMaxMs - globalMinMs) * (startPercent / 100)
        const endMs = globalMinMs + (globalMaxMs - globalMinMs) * (endPercent / 100)

        // 在可见时间范围内查找 y 值范围
        const seriesList = normalizeSeriesInput()
        let minY = null
        let maxY = null

        for (const series of seriesList) {
          const validData = validateSeriesPoints(series.data)
          for (const point of validData) {
            const [x, y] = point
            if (x >= startMs && x <= endMs) {
              if (minY === null || y < minY) minY = y
              if (maxY === null || y > maxY) maxY = y
            }
          }
        }

        // 如果可见范围内没有数据，使用全局范围
        if (minY === null || maxY === null) {
          return { minY: globalMinY, maxY: globalMaxY }
        }

        // 如果minY和maxY相同，添加一些范围
        if (minY === maxY) {
          const padding = Math.abs(minY || 1) * 0.1 || 1
          return {
            minY: minY - padding,
            maxY: maxY + padding
          }
        }

        // 添加一些边距（10%）
        const padding = (maxY - minY) * 0.1 || Math.abs(maxY || minY || 1) * 0.1
        return {
          minY: minY - padding,
          maxY: maxY + padding
        }
      } catch (error) {
        console.error('获取可见数据范围失败:', error)
        return { minY: globalMinY, maxY: globalMaxY }
      }
    }

    const createChart = () => {
      const seriesList = normalizeSeriesInput()
      if (!chartContainer.value || seriesList.length === 0) {
        return
      }

      // 清理现有实例
      if (chartInstance) {
        chartInstance.dispose()
      }

      // 创建新实例
      chartInstance = echarts.init(chartContainer.value)

      const validSeries = seriesList
        .map((s) => ({ ...s, data: validateSeriesPoints(s.data) }))
        .filter((s) => s.data.length > 0)

      if (validSeries.length === 0) {
        chartInstance.dispose()
        chartInstance = null
        return
      }

      // 计算全局时间范围
      const allX = validSeries.flatMap((s) => s.data.map((d) => d[0]))
      const minX = Math.min(...allX)
      const maxX = Math.max(...allX)
      globalMinMs = minX
      globalMaxMs = maxX

      // 计算全局 y 值范围
      const allY = validSeries.flatMap((s) => s.data.map((d) => d[1]))
      globalMinY = Math.min(...allY)
      globalMaxY = Math.max(...allY)

      // 初始化时用全局范围（setOption 前 model 未就绪，getVisibleDataRange 会 fallback 到全局）
      const initialYRange = props.yAxisFitMode === 'auto' ? getVisibleDataRange() : { minY: globalMinY, maxY: globalMaxY }

      // 紧凑布局：无滑块时底部留白更小，图例靠近上边界
      const hasLegend = validSeries.length > 0
      const gridConfig = {
        left: 8,
        right: 8,
        top: hasLegend ? 28 : 8,
        bottom: props.enableSlider ? 32 : 8, // 无滑块时底部留白更小
        containLabel: true
      }

      const option = {
        backgroundColor: 'transparent',
        // 动画配置：平滑生长效果
        animation: true,
        animationDuration: 1000,
        animationDurationUpdate: 750,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicOut',
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
          axisPointer: {
            type: 'line',
            lineStyle: {
              color: '#6366f1',
              width: 1
            },
            snap: true  // 启用吸附，只显示最近的数据点
          },
          // 自定义 formatter：控制 tooltip 显示格式，只显示有效数据点
          formatter: (params) => {
            if (!params || !Array.isArray(params) || params.length === 0) {
              return ''
            }
            
            // 过滤掉没有值的项（value 为 null 或 undefined）
            const validParams = params.filter(item => 
              item && 
              item.value != null && 
              Array.isArray(item.value) && 
              item.value.length >= 2 &&
              item.value[1] != null &&
              !isNaN(item.value[1])
            )
            
            if (validParams.length === 0) {
              return ''
            }
            
            const param = validParams[0]
            const date = new Date(param.value[0])
            if (isNaN(date.getTime())) {
              return ''
            }
            
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            const seconds = String(date.getSeconds()).padStart(2, '0')
            const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
            
            let result = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}<br/>`
            
            // 只显示有效的数据点
            validParams.forEach((item) => {
              const value = item.value[1]
              let formattedValue
              if (props.yAxisFormat === 'integer') {
                formattedValue = Math.round(value).toString()
              } else if (props.yAxisFormat === 'decimal') {
                formattedValue = value.toFixed(4)  // 4位小数
              } else {
                formattedValue = value.toString()
              }
              const color = item.color || '#6366f1'
              result += `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${color};"></span>${item.seriesName}: ${formattedValue}<br/>`
            })
            
            return result
          }
        },
        legend: validSeries.length > 0
          ? {
              type: 'scroll',
              top: 0,  // 图例靠近上边界
              left: 55,
              right: 8,
              itemGap: 12,  // 增加图例项之间的间距
              textStyle: { 
                color: '#6a7282', 
                fontSize: 10 
              },
              itemWidth: 14,  // 稍微增加图例标记宽度
              itemHeight: 8,
              icon: 'rect',  // 使用矩形图标，更清晰
              // 图例项样式优化
              itemStyle: {
                borderWidth: 0
              }
            }
          : undefined,
        xAxis: {
          type: 'time',
          // X轴分辨率：时间轴，数据精度为毫秒（1ms），显示格式精确到秒
          boundaryGap: false,
          axisLine: {
            show: false
          },
          axisTick: {
            show: false
          },
          axisLabel: {
            color: '#6a7282',
            fontSize: 10,
            margin: 6,
            rotate: 0,
            // 自定义 formatter：只显示到秒，避免刻度太密集
            formatter: (value) => {
              const date = new Date(value)
              const hours = String(date.getHours()).padStart(2, '0')
              const minutes = String(date.getMinutes()).padStart(2, '0')
              const seconds = String(date.getSeconds()).padStart(2, '0')
              return `${hours}:${minutes}:${seconds}`
            },
            // 控制刻度间隔，避免太密集
            interval: 'auto'  // ECharts 会自动计算合适的间隔
          },
          splitLine: {
            show: false
          },
          min: minX,
          max: maxX
        },
        yAxis: {
          type: 'value',
          // Y轴分辨率：
          // - 'decimal'格式：显示4位小数，显示分辨率 = 0.0001（适用于双精度浮点型数据）
          // - 'integer'格式：显示整数，显示分辨率 = 1
          // - 实际数据精度取决于原始数据精度
          boundaryGap: [0, '5%'],  // 减小边界间隙
          scale: false,  // 不自动缩放，使用精确范围
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: '#6a7282',
            fontSize: 10,
            width: 50,  // 增加宽度以容纳4位小数
            overflow: 'truncate',
            formatter: (value) => {
              if (props.yAxisFormat === 'integer') {
                return Math.round(value).toString()
              } else if (props.yAxisFormat === 'decimal') {
                return value.toFixed(4)  // 显示分辨率：0.0001（双精度浮点型）
              }
              return value.toString()
            }
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: 'rgba(15, 23, 42, 0.08)',
              width: 1
            }
          },
          min: initialYRange.minY,
          max: initialYRange.maxY
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
              handleSize: 12,
              handleIcon: 'M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
              handleStyle: {
                color: 'transparent',
                borderColor: props.lineColor || '#6366f1',
                borderWidth: 2
              },
              height: 25,
              borderColor: 'rgba(99, 102, 241, 0.3)',
              fillerColor: 'rgba(99, 102, 241, 0.2)',
              backgroundColor: 'rgba(148, 163, 184, 0.15)',
              brushSelect: false,
              xAxisIndex: 0,
              bottom: 4,
              filterMode: 'filter',
              moveHandleSize: 14,
              moveHandleIcon: 'M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
              moveHandleStyle: {
                color: 'transparent',
                borderColor: props.lineColor || '#6366f1',
                borderWidth: 2
              },
              preventDefaultMouseMove: false,
              labelFormatter: (value) => {
                const date = new Date(value)
                const hours = String(date.getHours()).padStart(2, '0')
                const minutes = String(date.getMinutes()).padStart(2, '0')
                const seconds = String(date.getSeconds()).padStart(2, '0')
                return `${hours}:${minutes}:${seconds}`
              }
            }
          ] : [])
        ],
        series: validSeries.map((s, idx) => {
          const color = s.color || (validSeries.length === 1 ? props.lineColor : null)
          return {
            name: s.name,
            type: 'line',
            symbol: 'none',
            smooth: props.smooth,
            sampling: false,
            data: s.data,
            // 系列动画配置：从左侧生长
            animation: true,
            animationDelay: (idx) => idx * 100, // 多条曲线时错开动画
            animationDuration: 1000,
            animationEasing: 'cubicOut',
            ...(color ? {
              itemStyle: { color },
              lineStyle: { 
                width: 2,  // 稍微加粗线条，更清晰
                cap: 'round', 
                join: 'round', 
                color 
              }
            } : {
              lineStyle: { 
                width: 2, 
                cap: 'round', 
                join: 'round' 
              }
            }),
            areaStyle: validSeries.length === 1
              ? {
                  opacity: 0.2,  // 稍微增加透明度，更明显
                  color: color || props.lineColor
                }
              : undefined
          }
        }),
        // 时间游标（用于视频/日志同步）- 使用 custom 系列实现
        ...(props.cursorMs != null && props.cursorMs >= globalMinMs && props.cursorMs <= globalMaxMs
          ? [
              {
                type: 'custom',
                silent: true,
                z: 100,
                renderItem: (params, api) => {
                  const x = api.coord([props.cursorMs, 0])[0]
                  const yTop = params.coordSys.y
                  const height = params.coordSys.height
                  return {
                    type: 'line',
                    shape: {
                      x1: x,
                      y1: yTop,
                      x2: x,
                      y2: yTop + height
                    },
                    style: {
                      stroke: '#ef4444',
                      lineWidth: 2,
                      lineDash: [4, 4]
                    }
                  }
                },
                data: [[props.cursorMs, 0]]
              }
            ]
          : [])
      }

      chartInstance.setOption(option, true)

      // 点击数据点：对外抛出时间戳（x轴，ms）
      chartInstance.off('click')
      chartInstance.on('click', (params) => {
        const v = params?.value
        const ts = Array.isArray(v) ? v[0] : null
        if (typeof ts === 'number' && Number.isFinite(ts)) {
          emit('cursorChange', ts)
        }
      })

      // 初始化全局范围与当前显示范围
      rangeStartMs.value = globalMinMs
      rangeEndMs.value = globalMaxMs

      // 获取当前图表的实际显示范围
      const getCurrentDisplayRange = () => {
        try {
          const option = chartInstance.getOption()
          
          if (option && option.dataZoom && Array.isArray(option.dataZoom)) {
            let sliderDataZoom = null
            let insideDataZoom = null
            
            for (let i = 0; i < option.dataZoom.length; i++) {
              const dataZoom = option.dataZoom[i]
              const xAxisIndex = dataZoom.xAxisIndex
              if (xAxisIndex === 0 || xAxisIndex === undefined || (Array.isArray(xAxisIndex) && xAxisIndex.includes(0))) {
                if (dataZoom.type === 'slider') {
                  sliderDataZoom = dataZoom
                } else if (dataZoom.type === 'inside') {
                  insideDataZoom = dataZoom
                }
              }
            }
            
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
        if (range && range.startMs != null && range.endMs != null) {
          rangeStartMs.value = range.startMs
          rangeEndMs.value = range.endMs
          emit('rangeChange', { startMs: range.startMs, endMs: range.endMs })
        }
      }

      // 更新 y 轴范围（当启用自适应模式时）
      const updateYAxisRange = () => {
        if (props.yAxisFitMode === 'auto' && chartInstance) {
          const visibleRange = getVisibleDataRange()
          if (visibleRange.minY != null && visibleRange.maxY != null && 
              (visibleRange.minY !== visibleRange.maxY || visibleRange.minY !== 0)) {
            chartInstance.setOption({
              yAxis: {
                min: visibleRange.minY,
                max: visibleRange.maxY
              }
            }, false)
          }
        }
      }
      
      // 监听 dataZoom 事件
      chartInstance.off('dataZoom')
      chartInstance.on('dataZoom', (ev) => {
        let startMs = null
        let endMs = null
        
        if (ev.startValue != null && ev.endValue != null) {
          startMs = ev.startValue
          endMs = ev.endValue
        } else if (ev.start != null && ev.end != null) {
          startMs = globalMinMs + (globalMaxMs - globalMinMs) * (ev.start / 100)
          endMs = globalMinMs + (globalMaxMs - globalMinMs) * (ev.end / 100)
        }
        
        if (startMs != null && endMs != null) {
          rangeStartMs.value = Math.max(globalMinMs, Math.min(startMs, globalMaxMs))
          rangeEndMs.value = Math.max(globalMinMs, Math.min(endMs, globalMaxMs))
          
          // 更新 y 轴范围
          nextTick(() => {
            updateYAxisRange()
            emit('rangeChange', { startMs: rangeStartMs.value, endMs: rangeEndMs.value })
          })
        } else {
          setTimeout(() => {
            nextTick(() => {
              updateYAxisRange()
              emitRangeChange()
            })
          }, 200)
        }
      })
      
      // 监听 restore 事件
      chartInstance.off('restore')
      chartInstance.on('restore', () => {
        rangeStartMs.value = globalMinMs
        rangeEndMs.value = globalMaxMs
        
        if (props.yAxisFitMode === 'auto') {
          updateYAxisRange()
        }
        
        nextTick(() => {
          emit('rangeChange', { startMs: rangeStartMs.value, endMs: rangeEndMs.value })
        })
      })
      
      // 初始化时触发事件
      emit('rangeChange', { startMs: rangeStartMs.value, endMs: rangeEndMs.value })
      
      // 初始化后延迟更新y轴范围（确保dataZoom已初始化）
      if (props.yAxisFitMode === 'auto') {
        setTimeout(() => {
          nextTick(() => {
            updateYAxisRange()
          })
        }, 100)
      }
    }

    const resizeChart = () => {
      if (chartInstance) {
        chartInstance.resize()
      }
    }

    // 更新游标位置
    const updateCursor = () => {
      if (!chartInstance || props.cursorMs == null) return
      
      const cursorSeries = props.cursorMs >= globalMinMs && props.cursorMs <= globalMaxMs
        ? [
            {
              type: 'custom',
              silent: true,
              z: 100,
              renderItem: (params, api) => {
                const x = api.coord([props.cursorMs, 0])[0]
                const yTop = params.coordSys.y
                const height = params.coordSys.height
                return {
                  type: 'line',
                  shape: {
                    x1: x,
                    y1: yTop,
                    x2: x,
                    y2: yTop + height
                  },
                  style: {
                    stroke: '#ef4444',
                    lineWidth: 2,
                    lineDash: [4, 4]
                  }
                }
              },
              data: [[props.cursorMs, 0]]
            }
          ]
        : []

      // 查找并更新游标系列
      const option = chartInstance.getOption()
      const existingSeries = option.series || []
      
      // 移除旧的游标系列（通过检查是否有 custom 类型且 data 长度为 1）
      const filteredSeries = existingSeries.filter((s, idx) => {
        // 保留原有的数据系列
        if (s.type !== 'custom' || !s.renderItem) return true
        // 检查是否是游标系列（通过 data 判断）
        if (Array.isArray(s.data) && s.data.length === 1 && Array.isArray(s.data[0]) && s.data[0].length === 2) {
          return false // 移除旧的游标系列
        }
        return true
      })

      chartInstance.setOption({
        series: [...filteredSeries, ...cursorSeries]
      }, false)
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

    // 监听游标变化
    watch(() => props.cursorMs, () => {
      nextTick(() => {
        updateCursor()
      })
    })

    // 监听 y 轴自适应模式变化
    watch(() => props.yAxisFitMode, () => {
      if (chartInstance) {
        nextTick(() => {
          const visibleRange = props.yAxisFitMode === 'auto' ? getVisibleDataRange() : { minY: globalMinY, maxY: globalMaxY }
          chartInstance.setOption({
            yAxis: {
              min: visibleRange.minY,
              max: visibleRange.maxY
            }
          }, false)
        })
      }
    })

    let resizeObserver = null

    onMounted(() => {
      nextTick(() => {
        createChart()
      })
      window.addEventListener('resize', resizeChart)
      if (chartContainer.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          resizeChart()
        })
        resizeObserver.observe(chartContainer.value)
      }
    })

    // 展开/收起后 DOM 尺寸变化，下一帧再 resize 保证自适应
    onUpdated(() => {
      nextTick(() => {
        requestAnimationFrame(resizeChart)
      })
    })

    onBeforeUnmount(() => {
      if (resizeObserver && chartContainer.value) {
        resizeObserver.unobserve(chartContainer.value)
        resizeObserver = null
      }
      if (chartInstance) {
        chartInstance.dispose()
        chartInstance = null
      }
      window.removeEventListener('resize', resizeChart)
    })

    return {
      chartContainer,
      resolvedHeight
    }
  }
}
</script>

<style scoped>
.motion-chart-outer {
  display: flex;
  flex-direction: column;
  width: 100%;
}
</style>
