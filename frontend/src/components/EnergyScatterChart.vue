<template>
  <div class="energy-scatter-chart" ref="containerRef">
    <div class="chart-wrapper" ref="chartWrapperRef">
      <div class="y-axis-title">{{ $t('mobile.surgeryVisualization.gripsActiveDuration') }}</div>
      <canvas ref="canvasRef" class="chart-canvas" />
    </div>
    <div v-if="legendItems.length > 0" class="legend">
      <div
        v-for="item in legendItems"
        :key="item.type"
        class="legend-item"
      >
        <span
          class="legend-marker"
          :style="{ backgroundColor: item.baseColor }"
        />
        <span class="legend-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="jsx">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { jsx, Canvas, Chart, Axis, Point, Tooltip } from '@antv/f2'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  height: {
    type: Number,
    default: 220
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

const { t } = useI18n({ useScope: 'global' })

const TYPE_COLORS = {
  cut: '#ef4444',
  coag: '#f59e0b',
  bipolar: '#8b5cf6',
  ultrasonic: '#06b6d4',
  ultrasonicmax: '#0ea5e9'
}

const TYPE_LABELS = {
  cut: 'mobile.surgeryVisualization.energyCut',
  coag: 'mobile.surgeryVisualization.energyCoag',
  bipolar: 'mobile.surgeryVisualization.energyBipolar',
  ultrasonic: 'mobile.surgeryVisualization.energyUltrasonic',
let scatterShapeRegistered = false
if (typeof registerShape === 'function' && !scatterShapeRegistered) {
  registerShape('point', 'energy-scatter', {
    draw (cfg, container) {
      const { x, y, size = 6 } = cfg
      const color = cfg.color || cfg.data?.color || '#2563eb'
      const radius = size / 2
      return container.addShape('circle', {
        attrs: {
          x,
          y,
          r: radius,
          fill: color
        }
      })
    }
  })
  scatterShapeRegistered = true
}

  ultrasonicmax: 'mobile.surgeryVisualization.energyUltrasonicMax'
}

const containerRef = ref(null)
const chartWrapperRef = ref(null)
const canvasRef = ref(null)
const canvasInstanceRef = ref(null)
const resizeObserverRef = ref(null)

const pixelRatio = window.devicePixelRatio || 2
const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator?.maxTouchPoints > 0 || navigator?.msMaxTouchPoints > 0))
const tooltipTriggerOn = isTouchDevice ? 'press' : 'mousemove'
const tooltipTriggerOff = isTouchDevice ? 'pressend' : 'mouseleave'

function parseToDate (input) {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
  if (typeof input === 'number') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof input === 'string') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function rgbaWithOpacity (hex, opacity) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${opacity})`
}

const normalizedData = computed(() => {
  const list = Array.isArray(props.data) ? props.data : []
  if (list.length === 0) return []
  const durations = list.map(d => d.y).filter(Number.isFinite)
  const maxDur = Math.max(0.1, ...durations)
  return list
    .map((item) => {
      if (!item || item.x == null || item.y == null) return null
      const date = parseToDate(item.x)
      const time = date ? date.toISOString() : String(item.x)
      const yVal = Number(item.y)
      if (!Number.isFinite(yVal)) return null
      const typeKey = String(item.type || 'cut').toLowerCase()
      const baseColor = TYPE_COLORS[typeKey] || TYPE_COLORS.cut
      const opacity = Math.min(1, Math.max(0.35, 0.35 + (yVal / maxDur) * 0.65))
      const color = rgbaWithOpacity(baseColor, opacity)
      return {
        time: time,
        value: yVal,
        color,
        typeKey,
        typeLabel: t(TYPE_LABELS[typeKey] || 'mobile.surgeryVisualization.energyCut'),
        durationSec: yVal
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
})

const hasData = computed(() => normalizedData.value.length > 0)

const legendItems = computed(() => {
  const seen = new Set()
  const items = []
  normalizedData.value.forEach((d) => {
    if (!seen.has(d.typeKey)) {
      seen.add(d.typeKey)
      items.push({
        type: d.typeKey,
        label: d.typeLabel,
        baseColor: TYPE_COLORS[d.typeKey] || TYPE_COLORS.cut
      })
    }
  })
  return items
})

const valueRange = computed(() => {
  if (!hasData.value) return { min: 0, max: 10 }
  const vals = normalizedData.value.map(d => d.value)
  const min = Math.min(0, ...vals)
  const max = Math.max(10, ...vals) * 1.1
  return { min: Math.floor(min), max: Math.ceil(max) }
})

const ensureCanvasSize = () => {
  const canvasEl = canvasRef.value
  const wrapperEl = chartWrapperRef.value
  if (!canvasEl || !wrapperEl) return
  const wrapperWidth = wrapperEl.clientWidth || window.innerWidth
  const rawHeight = props.height
  const titleWidth = 10
  const gap = 2
  const width = Math.max(wrapperWidth - titleWidth - gap, 0)
  const height = Math.max(rawHeight - 10, 0)
  canvasEl.style.width = `${width}px`
  canvasEl.style.height = `${height}px`
  canvasEl.width = width * pixelRatio
  canvasEl.height = height * pixelRatio
  const ctx = canvasEl.getContext('2d')
  if (ctx?.scale) ctx.scale(pixelRatio, pixelRatio)
}

const destroyCanvas = () => {
  if (canvasInstanceRef.value) {
    canvasInstanceRef.value.destroy()
    canvasInstanceRef.value = null
  }
}

const createChartProps = (context) => {
  const { min, max } = valueRange.value
  const scales = {
    time: {
      type: 'timeCat',
      mask: props.timeMask,
      range: [0, 1],
      tickCount: props.timeTickCount
    },
    value: {
      nice: true,
      tickCount: props.valueTickCount,
      min,
      max,
      formatter: (v) => `${Number(v).toFixed(1)}s`
    }
  }
  return (
    <Canvas context={context} pixelRatio={pixelRatio} animate>
      <Chart data={normalizedData.value} padding={props.padding} scale={scales}>
        <Axis
          field="time"
          label={{ style: { fill: '#6b7280', fontSize: 10 } }}
          grid={null}
          line={{ style: { stroke: 'rgba(148,163,184,0.3)' } }}
          tickLine={null}
        />
        <Axis
          field="value"
          label={{
            formatter: (text) => `${text}s`,
            style: { fill: '#6b7280', fontSize: 10 }
          }}
          grid={{
            line: { style: { stroke: 'rgba(148,163,184,0.2)', lineDash: [4, 4] } }
          }}
          tickLine={null}
          line={null}
        />
        <Tooltip
          shared
          triggerOn={tooltipTriggerOn}
          triggerOff={tooltipTriggerOff}
          showCrosshairs
          crosshairs={{ type: 'x', style: { stroke: '#94a3b8', lineWidth: 1 } }}
          showTitle={false}
          onChange={(records) => {
            records.forEach((r) => {
              if (r.origin?.durationSec != null) {
                r.value = `${Number(r.origin.durationSec).toFixed(1)} s`
              }
              if (r.origin?.typeLabel) r.name = r.origin.typeLabel
            })
          }}
        />
        <Point
          shape="energy-scatter"
          x="time"
          y="value"
          color="color"
          size={6}
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
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return
  const { props: canvasProps } = createChartProps(ctx)
  if (!canvasInstanceRef.value) {
    const canvas = new Canvas(canvasProps)
    canvas.render()
    canvasInstanceRef.value = canvas
  } else {
    canvasInstanceRef.value.update(canvasProps)
  }
}

const scheduleRender = () => nextTick(renderCanvas)

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
    if (chartWrapperRef.value) observer.observe(chartWrapperRef.value)
    if (containerRef.value) observer.observe(containerRef.value)
  }
  resizeObserverRef.value = { observer, handleResize }
})

onBeforeUnmount(() => {
  if (resizeObserverRef.value) {
    window.removeEventListener('resize', resizeObserverRef.value.handleResize)
    resizeObserverRef.value.observer?.disconnect()
  }
  destroyCanvas()
})

watch(() => [props.data, props.height], scheduleRender, { deep: true })
</script>

<style scoped>
.energy-scatter-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart-wrapper {
  position: relative;
  width: 100%;
}

.y-axis-title {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  font-size: 10px;
  color: #6b7280;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.chart-canvas {
  display: block;
  width: 100%;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 4px 0;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #4b5563;
}

.legend-marker {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-label {
  white-space: nowrap;
}
</style>
