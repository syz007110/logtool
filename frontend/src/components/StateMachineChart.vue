<template>
  <div class="state-machine-chart" ref="containerRef">
    <canvas ref="canvasRef" class="chart-canvas" />
  </div>
</template>

<script setup lang="jsx">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { jsx, Canvas, Chart, Axis, Line, Area, Point, Tooltip } from '@antv/f2'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  height: {
    type: Number,
    default: 260
  },
  xField: {
    type: String,
    default: 'time'
  },
  yField: {
    type: String,
    default: 'value'
  },
  gradient: {
    type: String,
    default: 'l(90) 0:#ffe58f 1:#f6bd16'
  },
  lineColor: {
    type: String,
    default: '#f6bd16'
  },
  pointColor: {
    type: String,
    default: '#f6bd16'
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
    default: 5
  },
  padding: {
    type: [Array, Number, String],
    default: () => [0, 0, 0, 0]
  }
})

const containerRef = ref(null)
const canvasRef = ref(null)
const canvasInstanceRef = ref(null)
const resizeObserverRef = ref(null)

const pixelRatio = window.devicePixelRatio || 2
const isNavigatorDefined = typeof navigator !== 'undefined'
const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || (isNavigatorDefined && (navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)))
// F2 internally normalizes touch gestures to 'press' / 'pressend'.
// Using native touch events like 'touchmove' prevents the tooltip from firing on mobile.
// Fall back to the default gesture events on touch devices while keeping mouse move support for desktop.
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

const valueStats = computed(() => {
  if (!hasData.value) {
    return { min: 0, max: 32 }
  }
  return { min: 0, max: 32 }
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
      max: valueStats.value.max ?? undefined,
      formatter: (value) => {
        if (typeof value === 'number') {
          return Math.round(value).toString()
        }
        const num = Number(value)
        return Number.isNaN(num) ? value : Math.round(num).toString()
      }
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
              fill: '#9CA3AF',
              fontSize: 11
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
            style: {
              fill: '#9CA3AF',
              fontSize: 11
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
          showItemMarker
          showTitle={false}
          crosshairs={{
            type: 'xy',
            style: {
              stroke: props.lineColor,
              lineWidth: 1,
              lineDash: [2, 2]
            }
          }}
          onShow={(ev) => {
            const { chart } = ev
            if (chart) {
              chart.render()
            }
          }}
        />
        <Area
          x={timeField}
          y={valueField}
          shape="smooth"
          color={props.gradient}
        />
        <Line
          x={timeField}
          y={valueField}
          color={props.lineColor}
          shape="smooth"
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
  () => [props.height, props.timeMask, props.timeTickCount, props.valueTickCount, props.gradient, props.lineColor, props.pointColor, props.padding],
  () => {
    destroyCanvas()
    scheduleRender()
  }
)
</script>

<style scoped>
.state-machine-chart {
  width: 100%;
}

.chart-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>

