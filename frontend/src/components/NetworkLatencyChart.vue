<template>
  <div class="network-latency-chart" ref="containerRef">
    <div class="chart-wrapper" ref="chartWrapperRef">
      <div class="y-axis-title">{{ $t('mobile.surgeryVisualization.networkLatencyYAxis') }}</div>
      <canvas ref="canvasRef" class="chart-canvas" />
    </div>
    <div class="legend">
      <div
        v-for="item in legendItems"
        :key="item.key"
        class="legend-item"
      >
        <span
          class="legend-marker"
          :class="['legend-marker--' + item.shape]"
          :style="item.style"
        />
        <span class="legend-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="jsx">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { jsx, Canvas, Chart, Axis, Line, Point, Tooltip, registerShape } from '@antv/f2'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  height: {
    type: Number,
    default: 280
  },
  xField: {
    type: String,
    default: 'time'
  },
  yField: {
    type: String,
    default: 'value'
  },
  axisMax: {
    type: Number,
    default: 1200
  },
  normalThreshold: {
    type: Number,
    default: 110
  },
  warningThreshold: {
    type: Number,
    default: 1000
  },
  lineColor: {
    type: String,
    default: '#2563eb'
  },
  normalColor: {
    type: String,
    default: '#16a34a'
  },
  warningColor: {
    type: String,
    default: '#f97316'
  },
  offlineColor: {
    type: String,
    default: '#ef4444'
  },
  timeMask: {
    type: String,
    default: 'HH:mm'
  },
  timeTickCount: {
    type: Number,
    default: 5
  },
  valueTickCount: {
    type: Number,
    default: 5
  },
  padding: {
    type: [Array, Number, String],
    default: () => [12, 16, 36, 48]
  }
})

const containerRef = ref(null)
const chartWrapperRef = ref(null)
const canvasRef = ref(null)
const canvasInstanceRef = ref(null)
const resizeObserverRef = ref(null)
const { t } = useI18n({ useScope: 'global' })

const pixelRatio = window.devicePixelRatio || 2
const isNavigatorDefined = typeof navigator !== 'undefined'
const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || (isNavigatorDefined && (navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)))
const tooltipTriggerOn = isTouchDevice ? 'press' : 'mousemove'
const tooltipTriggerOff = isTouchDevice ? 'pressend' : 'mouseleave'

let latencyMarkerRegistered = false
if (typeof registerShape === 'function' && !latencyMarkerRegistered) {
  registerShape('point', 'latency-marker', {
    draw (cfg, container) {
      const { x, y, size = 8 } = cfg
      const status = cfg.data?.status
      const color = cfg.color || cfg.data?.color || '#2563eb'
      if (status === 'offline') {
        const half = size / 2
        const group = container.addGroup()
        group.addShape('rect', {
          attrs: {
            x: x - half,
            y: y - half,
            width: size,
            height: size,
            fill: color,
            radius: 1.5
          }
        })
        if (cfg.data?.statusTag) {
          group.addShape('text', {
            attrs: {
              x,
              y: y - half - 4,
              text: cfg.data.statusTag,
              fill: color,
              fontSize: 10,
              textAlign: 'center',
              textBaseline: 'bottom'
            }
          })
        }
        return group
      }
      const radius = size / 2
      return container.addShape('circle', {
        attrs: {
          x,
          y,
          r: radius,
          fill: color,
          stroke: '#ffffff',
          lineWidth: 1
        }
      })
    }
  })
  latencyMarkerRegistered = true
}

const statusConfig = computed(() => ({
  normal: {
    color: props.normalColor,
    size: 8,
    shape: 'circle',
    label: t('mobile.surgeryVisualization.networkStatusGood'),
    tag: ''
  },
  warning: {
    color: props.warningColor,
    size: 10,
    shape: 'circle',
    label: t('mobile.surgeryVisualization.networkStatusWarning'),
    tag: ''
  },
  offline: {
    color: props.offlineColor,
    size: 12,
    shape: 'square',
    label: t('mobile.surgeryVisualization.networkStatusOffline'),
    tag: t('mobile.surgeryVisualization.networkStatusOfflineTag')
  }
}))

const legendItems = computed(() => {
  // 只显示良好和断网两个状态
  return ['normal', 'offline'].map((status) => {
    const config = statusConfig.value[status]
    return {
      key: status,
      label: config?.label ?? status,
      shape: config?.shape === 'square' ? 'square' : 'circle',
      style: {
        backgroundColor: config?.color || '#2563eb',
        borderColor: config?.shape === 'square' ? config?.color : '#ffffff'
      }
    }
  })
})

const normalizedData = computed(() => {
  const list = Array.isArray(props.data) ? props.data : []
  return list
    .map((item) => {
      if (!item) return null
      const [timeInput, rawLatencyInput] = Array.isArray(item)
        ? item
        : [item[props.xField], item[props.yField]]
      const date = parseToDate(timeInput)
      const rawLatency = Number(rawLatencyInput)
      if (!date || Number.isNaN(rawLatency)) return null
      const isoTime = date.toISOString()
      const status = classifyLatency(rawLatency)
      const config = statusConfig.value[status] || statusConfig.value.normal
      return {
        [props.xField]: isoTime,
        [props.yField]: Math.min(rawLatency, props.axisMax),
        rawLatency,
        status,
        statusLabel: config.label,
        statusTag: config.tag,
        color: config.color,
        markerSize: config.size,
        markerShape: config.shape
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = parseToDate(a[props.xField])?.getTime() ?? 0
      const timeB = parseToDate(b[props.xField])?.getTime() ?? 0
      return timeA - timeB
    })
})

const hasData = computed(() => normalizedData.value.length > 0)

function classifyLatency (value) {
  if (!Number.isFinite(value)) return 'normal'
  // 良好: <110ms, 断网: >=1000ms
  if (value < props.normalThreshold) return 'normal'
  if (value >= props.warningThreshold) return 'offline'
  // 介于110ms和1000ms之间的数据，归类为warning（不在legend中显示，但图表中用warning颜色显示）
  return 'warning'
}

function parseToDate (input) {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input
  }
  if (typeof input === 'number') {
    const date = new Date(input)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof input === 'string') {
    const date = new Date(input)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

const ensureCanvasSize = () => {
  const canvasEl = canvasRef.value
  const wrapperEl = chartWrapperRef.value
  if (!canvasEl || !wrapperEl) return

  // 获取wrapper的实际宽度
  const wrapperWidth = wrapperEl.clientWidth || window.innerWidth
  const rawHeight = props.height
  
  // 标题固定宽度10px + gap 2px = 12px，canvas占据剩余空间
  const titleWidth = 10
  const gap = 2
  const titleSpace = titleWidth + gap
  const width = Math.max(wrapperWidth - titleSpace, 0)
  const height = Math.max(rawHeight - 10, 0)

  // 设置canvas的显示尺寸和实际像素尺寸
  canvasEl.style.width = `${width}px`
  canvasEl.style.height = `${height}px`
  canvasEl.style.margin = '0'
  canvasEl.width = width * pixelRatio
  canvasEl.height = height * pixelRatio
  const context = canvasEl.getContext('2d')
  if (context && context.scale) {
    context.scale(pixelRatio, pixelRatio)
  }
}

const destroyCanvas = () => {
  if (canvasInstanceRef.value) {
    canvasInstanceRef.value.destroy()
    canvasInstanceRef.value = null
  }
}

const createCanvasProps = (context) => {
  const timeField = props.xField
  const valueField = props.yField

  const scales = {
    [timeField]: {
      type: 'timeCat',
      mask: props.timeMask,
      range: [0, 1],
      tickCount: props.timeTickCount
    },
    [valueField]: {
      nice: false,
      tickCount: props.valueTickCount,
      min: 0,
      max: props.axisMax,
      formatter: (value) => `${Math.round(value)}`
    }
  }

  return (
    <Canvas context={context} pixelRatio={pixelRatio} animate>
      <Chart
        data={normalizedData.value}
        padding={props.padding}
        scale={scales}
      >
        <Axis
          field={timeField}
          label={{
            style: {
              fill: '#6b7280',
              fontSize: 10
            }
          }}
          grid={null}
          line={{
            style: {
              stroke: 'rgba(148, 163, 184, 0.3)'
            }
          }}
          tickLine={null}
        />
        <Axis
          field={valueField}
          label={{
            formatter: (text) => `${text}ms`,
            style: {
              fill: '#6b7280',
              fontSize: 10
            }
          }}
          grid={{
            line: {
              style: {
                stroke: 'rgba(148, 163, 184, 0.2)',
                lineDash: [4, 4]
              }
            }
          }}
          tickLine={null}
          line={null}
        />
        <Tooltip
          shared
          triggerOn={tooltipTriggerOn}
          triggerOff={tooltipTriggerOff}
          showCrosshairs
          crosshairs={{
            type: 'x',
            style: {
              stroke: props.lineColor,
              lineWidth: 1
            }
          }}
          showTitle={false}
          onChange={(records) => {
            records.forEach((record) => {
              const actual = record.origin?.rawLatency
              if (Number.isFinite(actual)) {
                record.value = `${Math.round(actual)}ms`
              }
              if (record.origin?.statusLabel) {
                record.name = record.origin.statusLabel
              }
            })
          }}
        />
        <Line
          x={timeField}
          y={valueField}
          color={props.lineColor}
          shape="smooth"
          size={2}
        />
        <Point
          x={timeField}
          y={valueField}
          color="color"
          shape="latency-marker"
          size={(data) => data.markerSize}
        />
      </Chart>
    </Canvas>
  )
}

const renderCanvas = () => {
  if (!canvasRef.value || !hasData.value) {
    destroyCanvas()
    return
  }
  ensureCanvasSize()
  const context = canvasRef.value.getContext('2d')
  if (!context) {
    destroyCanvas()
    return
  }
  const { props: canvasProps } = createCanvasProps(context)
  if (!canvasInstanceRef.value) {
    const canvas = new Canvas(canvasProps)
    canvas.render()
    canvasInstanceRef.value = canvas
  } else {
    canvasInstanceRef.value.update(canvasProps)
  }
}

const scheduleRender = () => {
  nextTick(() => {
    renderCanvas()
  })
}

onMounted(() => {
  ensureCanvasSize()
  scheduleRender()

  const handleResize = () => {
    ensureCanvasSize()
    scheduleRender()
  }

  window.addEventListener('resize', handleResize)

  let observer = null
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      ensureCanvasSize()
      scheduleRender()
    })
    if (chartWrapperRef.value) {
      observer.observe(chartWrapperRef.value)
    }
    if (containerRef.value) {
      observer.observe(containerRef.value)
    }
  }

  resizeObserverRef.value = { observer, handleResize }
})

onBeforeUnmount(() => {
  if (resizeObserverRef.value) {
    window.removeEventListener('resize', resizeObserverRef.value.handleResize)
    if (resizeObserverRef.value.observer) {
      resizeObserverRef.value.observer.disconnect()
    }
  }
  destroyCanvas()
})

watch(
  () => props.data,
  () => {
    scheduleRender()
  },
  { deep: true }
)

watch(
  () => [
    props.height,
    props.timeMask,
    props.timeTickCount,
    props.valueTickCount,
    props.axisMax,
    props.normalThreshold,
    props.warningThreshold,
    props.lineColor,
    props.normalColor,
    props.warningColor,
    props.offlineColor,
    props.padding
  ],
  () => {
    destroyCanvas()
    scheduleRender()
  }
)
</script>

<style scoped>
.network-latency-chart {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.chart-wrapper {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;
  gap: 2px;
  margin-left: -8px;
}

.y-axis-title {
  flex-shrink: 0;
  width: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  writing-mode: vertical-lr;
  text-orientation: mixed;
  line-height: 1;
  pointer-events: none;
}

.chart-canvas {
  display: block;
  height: auto;
  /* 宽度由JavaScript动态计算，不在这里设置 */
}

.legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4b5563;
}

.legend-marker {
  display: inline-flex;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid #ffffff;
}

.legend-marker--square {
  border-radius: 2px;
  border-color: transparent;
}

.legend-label {
  white-space: nowrap;
}
</style>

