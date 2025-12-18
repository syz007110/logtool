<template>
  <div class="mobile-chart" ref="containerRef">
    <canvas ref="canvasRef" class="chart-canvas" />
  </div>
</template>

<script setup lang="jsx">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { jsx, Canvas, Chart, Axis, Line, Area, Tooltip } from '@antv/f2'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  height: {
    type: Number,
    default: 200
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  area: {
    type: Boolean,
    default: true
  },
  smooth: {
    type: Boolean,
    default: true
  },
  timeMask: {
    type: String,
    default: 'HH:mm'
  },
  timeTickCount: {
    type: Number,
    default: 4
  },
  valueTickCount: {
    type: Number,
    default: 4
  },
  padding: {
    type: [Array, Number, String],
    default: () => [6, 12, 12, 36]
  },
  xField: {
    type: String,
    default: 'time'
  },
  yField: {
    type: String,
    default: 'value'
  }
})

const containerRef = ref(null)
const canvasRef = ref(null)
const canvasInstanceRef = ref(null)
const resizeObserverRef = ref(null)

const pixelRatio = window.devicePixelRatio || 2
const isNavigatorDefined = typeof navigator !== 'undefined'
const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || (isNavigatorDefined && (navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)))
const tooltipTriggerOn = isTouchDevice ? 'press' : 'mousemove'
const tooltipTriggerOff = isTouchDevice ? 'pressend' : 'mouseleave'

const normalizedData = computed(() => {
  return (props.data || [])
    .map((item) => {
      if (!item) return null
      if (Array.isArray(item)) {
        const [time, value] = item
        return toDatum(time, value)
      }
      const time = item[props.xField]
      const value = item[props.yField]
      return toDatum(time, value)
    })
    .filter(Boolean)
})

const hasData = computed(() => normalizedData.value.length > 0)

const finalPadding = computed(() => {
  if (props.padding === undefined || props.padding === null) return [6, 12, 12, 36]
  return props.padding
})

const valueStats = computed(() => {
  if (!hasData.value) {
    return {
      min: null,
      max: null
    }
  }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  normalizedData.value.forEach((item) => {
    const value = item[props.yField]
    if (Number.isFinite(value)) {
      if (value < min) min = value
      if (value > max) max = value
    }
  })
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return {
      min: null,
      max: null
    }
  }
  const diff = max - min
  if (diff === 0) {
    const offset = Math.max(Math.abs(max) * 0.01, 0.5)
    min -= offset
    max += offset
  } else {
    const padding = Math.max(diff * 0.05, 0.5)
    min -= padding
    max += padding
  }
  return { min, max }
})

function toDatum (timeInput, valueInput) {
  if (timeInput === undefined || timeInput === null) return null
  const valueNumber = Number(valueInput)
  if (!Number.isFinite(valueNumber)) return null
  const date = parseToDate(timeInput)
  const time = date ? date.toISOString() : String(timeInput)
  return {
    [props.xField]: time,
    [props.yField]: valueNumber
  }
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
  const containerEl = containerRef.value
  if (!canvasEl || !containerEl) return

  const rawWidth = containerEl.clientWidth || window.innerWidth
  const rawHeight = props.height
  const width = Math.max(rawWidth - 10, 0)
  const height = Math.max(rawHeight - 10, 0)

  canvasEl.style.width = `${width}px`
  canvasEl.style.height = `${height}px`
  canvasEl.style.margin = '5px auto'
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
  const shapeName = props.smooth ? 'smooth' : 'line'
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
      min: valueStats.value.min ?? undefined,
      max: valueStats.value.max ?? undefined
    }
  }

  return (
    <Canvas context={context} pixelRatio={pixelRatio} animate>
      <Chart
        data={normalizedData.value}
        padding={finalPadding.value}
        scale={scales}
      >
        <Axis
          field={timeField}
          label={{
            style: {
              fill: '#6a7282',
              fontSize: 10
            }
          }}
          line={null}
          grid={null}
          tickLine={null}
        />
        <Axis
          field={valueField}
          label={{
            style: {
              fill: '#6a7282',
              fontSize: 10
            }
          }}
          grid={{
            line: {
              style: {
                stroke: 'rgba(15, 23, 42, 0.08)',
                lineWidth: 1
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
              stroke: props.color,
              lineWidth: 1
            }
          }}
        />
        {props.area ? (
          <Area
            x={timeField}
            y={valueField}
            color={props.color}
            shape={shapeName}
            style={{
              fillOpacity: 0.2
            }}
          />
        ) : null}
        <Line
          x={timeField}
          y={valueField}
          color={props.color}
          shape={shapeName}
          size={2}
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
  () => [props.color, props.area, props.smooth, props.timeMask, props.timeTickCount, props.valueTickCount, props.height, props.padding],
  () => {
    destroyCanvas()
    scheduleRender()
  }
)
</script>

<style scoped>
.mobile-chart {
  width: 100%;
  position: relative;
}

.chart-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
