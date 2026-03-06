<template>
  <div class="timeline-page" :class="{ 'timeline-page--fullscreen': isFullscreenMode }">
    <van-nav-bar
      v-if="!isFullscreenMode"
      title="Case Timeline"
      left-arrow
      @click-left="$router.back()"
      fixed
      safe-area-inset-top
    />

    <div class="timeline-content" v-if="surgeryData">
      <div v-if="!isFullscreenMode" class="tip">建议横屏查看 · 支持拖动十字光标</div>

      <div v-if="isFullscreenMode" class="fullscreen-top-cards">
        <div v-for="card in armSnapshotCards" :key="card.armId" class="arm-snapshot-card">
          <img v-if="card.imageUrl" class="arm-snapshot-image" :src="card.imageUrl" alt="instrument" />
          <div v-else class="arm-snapshot-avatar"></div>
          <div class="arm-snapshot-main">
            <div class="arm-snapshot-title">Arm{{ card.armId }}</div>
            <div class="arm-snapshot-meta">UDI: {{ card.udi }}</div>
            <div class="arm-snapshot-meta">寿命: {{ card.toolLife }}</div>
            <div class="arm-snapshot-meta">安装: {{ card.install }}</div>
          </div>
        </div>
      </div>

      <div v-if="showRotateMask" class="rotate-mask">
        <div class="rotate-mask-card">
          <div class="rotate-title">请横屏查看时间轴</div>
          <div class="rotate-desc">iOS 浏览器可能无法自动横屏，请手动旋转设备</div>
        </div>
      </div>

      <div
        ref="viewportRef"
        class="timeline-viewport"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <template v-if="isFullscreenMode">
          <canvas ref="overviewCanvasRef" class="overview-canvas"></canvas>
          <div
            v-if="crosshair.show"
            class="crosshair-overlay"
            :style="{ left: `${crosshair.x}px` }"
          >
            <div class="crosshair-tip">{{ crosshair.label }}</div>
          </div>
          <div v-if="hoverInfo.show" class="hover-info-card">
            <div class="hover-info-title">{{ hoverInfo.title }}</div>
            <div>UDI码: {{ hoverInfo.udi }}</div>
            <div>器械寿命: {{ hoverInfo.toolLifeLabel }}</div>
            <div>使用时长: {{ hoverInfo.durationLabel }}</div>
            <div>安装时刻: {{ hoverInfo.startLabel }}</div>
            <div>拔下时刻: {{ hoverInfo.endLabel }}</div>
          </div>
        </template>

        <div v-else class="timeline-inner" :style="{ '--row-height': `${rowHeight}px`, '--total-hours': `${totalHours}` }">
          <div class="timeline-axis">
            <div class="arm-col"></div>
            <div class="hour-cols">
              <div v-for="(m, i) in hourMarks" :key="i" class="hour-col">{{ m }}</div>
            </div>
          </div>

          <div class="timeline-row timeline-row-events">
            <div class="arm-col arm-title">Events</div>
            <div ref="timelineCanvasRef" class="row-canvas">
              <div
                v-for="(ev, idx) in events"
                :key="`${ev.type}-${idx}`"
                :class="['event-dot', `event-dot--${ev.symbol || 'circle'}`]"
                :style="getEventStyle(ev)"
                :title="`${ev.name} ${fmt(ev.time)}`"
              ></div>
              <div
                v-for="(f, idx) in faults"
                :key="`f-${idx}`"
                class="fault-line"
                :style="getFaultStyle(f)"
              ></div>
            </div>
          </div>

          <div v-for="arm in arms" :key="arm.arm_id" class="timeline-row">
            <div class="arm-col arm-title">Arm {{ arm.arm_id }}</div>
            <div class="row-canvas row-canvas-arm">
              <div
                v-for="(seg, i) in arm.instrument_usage || []"
                :key="`${arm.arm_id}-${i}`"
                class="segment"
                :class="{ 'segment--compact': isCompactSegment(seg) }"
                :style="getSegmentStyle(seg, arm.arm_id)"
                @click.stop="openSegment(seg, arm.arm_id)"
              >
                <span class="seg-label">{{ getType(seg) }}</span>
              </div>
            </div>
          </div>

          <div
            v-if="crosshair.show"
            class="crosshair"
            :style="{ left: `${crosshair.x}px` }"
          >
            <div class="crosshair-tip">{{ crosshair.label }}</div>
          </div>
        </div>
      </div>
    </div>

    <van-popup v-model:show="drawerVisible" position="bottom" round :style="{ height: '52%' }">
      <div class="drawer">
        <div class="drawer-title">器械详情</div>
        <div class="drawer-row"><span>Arm</span><strong>{{ selected.armId || '-' }}</strong></div>
        <div class="drawer-row"><span>器械类型</span><strong>{{ selected.type || '-' }}</strong></div>
        <div class="drawer-row"><span>UDI</span><strong>{{ selected.udi || '-' }}</strong></div>
        <div class="drawer-row"><span>安装</span><strong>{{ fmt(selected.start) }}</strong></div>
        <div class="drawer-row"><span>卸载</span><strong>{{ fmt(selected.end) }}</strong></div>
      </div>
    </van-popup>
  </div>
</template>

<script>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NavBar as VanNavBar, Popup as VanPopup, showToast } from 'vant'
import api from '@/api'
import { adaptSurgeryData, validateAdaptedData } from '@/utils/surgeryDataAdapter'
import { resolveInstrumentTypeLabel } from '@/utils/analysisMappings'

export default {
  name: 'MSurgeryTimeline',
  components: { 'van-nav-bar': VanNavBar, 'van-popup': VanPopup },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const surgeryId = route.params?.surgeryId
    const isFullscreenMode = computed(() => route.query?.fullscreen === '1')
    const surgeryData = ref(null)
    const viewportRef = ref(null)
    const timelineCanvasRef = ref(null)
    const overviewCanvasRef = ref(null)
    const armColWidth = 72
    const viewportWidth = ref(0)
    const viewportHeight = ref(0)

    const updateViewportMetrics = () => {
      const vp = viewportRef.value
      viewportWidth.value = vp?.clientWidth || window.innerWidth
      viewportHeight.value = vp?.clientHeight || window.innerHeight
    }


    const isPortrait = ref(false)
    const updateOrientationState = () => {
      isPortrait.value = window.innerHeight > window.innerWidth
      if (isFullscreenMode.value && isPortrait.value) {
        router.back()
        return
      }
      nextTick(() => {
        updateViewportMetrics()
        drawOverviewCanvas()
      })
    }
    const showRotateMask = computed(() => isPortrait.value)

    const toMs = (v) => {
      if (!v) return NaN
      const t = new Date(v).getTime()
      return Number.isFinite(t) ? t : NaN
    }

    const timelineBaseStart = computed(() => {
      const s = surgeryData.value
      if (!s) return null

      const firstPowerOn = (s.power_cycles || [])
        .map(c => toMs(c?.on_time))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)[0]

      const seed = Number.isFinite(firstPowerOn) ? firstPowerOn : toMs(s.start_time)
      if (!Number.isFinite(seed)) return null

      const d = new Date(seed)
      d.setMinutes(0, 0, 0)
      if (Number.isFinite(firstPowerOn)) d.setHours(d.getHours() - 1)
      return d.getTime()
    })

    const timelineStart = computed(() => timelineBaseStart.value)

    const timelineEnd = computed(() => {
      if (!timelineStart.value) return null
      const arr = []
      const s = surgeryData.value
      ;[s.start_time, s.end_time].forEach(t => { const ms = toMs(t); if (Number.isFinite(ms)) arr.push(ms) })
      ;(s.power_cycles || []).forEach(c => {
        ;[c.on_time, c.off_time].forEach(t => { const ms = toMs(t); if (Number.isFinite(ms)) arr.push(ms) })
      })
      ;(s.arms || []).forEach(a => (a.instrument_usage || []).forEach(seg => {
        ;[seg.start_time || seg.install_time, seg.end_time || seg.remove_time].forEach(t => { const ms = toMs(t); if (Number.isFinite(ms)) arr.push(ms) })
      }))
      ;((s.surgery_stats && s.surgery_stats.faults) || []).forEach(f => {
        const ms = toMs(f.timestamp || f.time)
        if (Number.isFinite(ms)) arr.push(ms)
      })
      if (!arr.length) return timelineStart.value + 3600000
      const d = new Date(Math.max(...arr))
      d.setMinutes(0, 0, 0)
      d.setHours(d.getHours() + 1)
      const end = d.getTime()
      return end > timelineStart.value ? end : timelineStart.value + 3600000
    })

    const totalHours = computed(() => {
      if (!timelineStart.value || !timelineEnd.value) return 1
      return Math.max(1, Math.ceil((timelineEnd.value - timelineStart.value) / 3600000))
    })

    const hourMarks = computed(() => {
      const marks = []
      if (!timelineStart.value) return marks
      for (let i = 0; i < totalHours.value; i++) {
        const d = new Date(timelineStart.value + i * 3600000)
        marks.push(`${String(d.getHours()).padStart(2, '0')}:00`)
      }
      return marks
    })

    const mapRatio = (time) => {
      const ms = toMs(time)
      if (!Number.isFinite(ms) || !timelineStart.value || !timelineEnd.value) return 0
      const denom = timelineEnd.value - timelineStart.value
      if (denom <= 0) return 0
      const ratio = (ms - timelineStart.value) / denom
      return Math.max(0, Math.min(1, ratio))
    }

    const arms = computed(() => (surgeryData.value?.arms || []).filter(a => Number(a.arm_id) >= 1 && Number(a.arm_id) <= 4))

    const rowHeight = computed(() => {
      const rows = Math.max(1, arms.value.length + 1) // events + arms
      const available = Math.max(180, (viewportHeight.value || window.innerHeight) - 170)
      const ideal = Math.floor(available / rows)
      return Math.max(34, Math.min(52, ideal))
    })

    const getArmColor = (armId) => {
      switch (Number(armId)) {
        case 1: return '#2752F1E5'
        case 2: return '#30B33B'
        case 3: return '#FEBB0F99'
        case 4: return '#FF6347'
        default: return '#722ed1'
      }
    }

    const getArmTextColor = (armId) => (Number(armId) === 3 ? '#111827' : '#ffffff')

    const events = computed(() => {
      const s = surgeryData.value
      if (!s) return []
      const out = []
      ;(s.power_cycles || []).forEach((c, i) => {
        if (c.on_time) out.push({ type: 'power_on', time: c.on_time, name: `开机${i + 1}`, symbol: 'square' })
        if (c.off_time) out.push({ type: 'power_off', time: c.off_time, name: `关机${i + 1}`, symbol: 'square' })
      })
      if (s.start_time) out.push({ type: 'surgery_start', time: s.start_time, name: '手术开始', symbol: 'circle' })
      if (s.end_time) out.push({ type: 'surgery_end', time: s.end_time, name: '手术结束', symbol: 'circle' })
      return out
    })

    const faults = computed(() => ((surgeryData.value?.surgery_stats?.faults || []).map(f => f.timestamp || f.time).filter(Boolean)))

    const getEventStyle = (ev) => ({ left: `${(mapRatio(ev.time) * 100).toFixed(4)}%` })
    const getFaultStyle = (time) => ({ left: `${(mapRatio(time) * 100).toFixed(4)}%` })

    const getType = (seg) => {
      const v = seg.tool_type ?? seg.instrument_type ?? seg.instrument_name
      return resolveInstrumentTypeLabel(v) || String(v || 'Instrument')
    }

    const getSegmentMetrics = (seg) => {
      const start = seg.start_time || seg.install_time || seg.start
      const end = seg.end_time || seg.remove_time || seg.end || start
      const s = mapRatio(start)
      const e = mapRatio(end)
      const left = Math.max(0, Math.min(1, Math.min(s, e)))
      const right = Math.max(left, Math.max(0, Math.min(1, Math.max(s, e))))
      const width = Math.max(0.002, right - left)
      return { leftPct: left * 100, widthPct: width * 100 }
    }

    const isCompactSegment = (seg) => getSegmentMetrics(seg).widthPct < 6

    const getSegmentStyle = (seg, armId) => {
      const { leftPct, widthPct } = getSegmentMetrics(seg)
      const bg = getArmColor(armId)
      return {
        left: `${leftPct.toFixed(4)}%`,
        width: `${widthPct.toFixed(4)}%`,
        background: bg,
        color: getArmTextColor(armId),
        border: '1px solid rgba(60, 60, 60, 0.26)'
      }
    }

    const drawerVisible = ref(false)
    const selected = ref({})
    const openSegment = (seg, armId) => {
      selected.value = {
        armId,
        type: getType(seg),
        udi: seg.udi || '-',
        start: seg.start_time || seg.install_time || seg.start,
        end: seg.end_time || seg.remove_time || seg.end
      }
      drawerVisible.value = true
    }

    const fmt = (t) => {
      const d = new Date(t)
      if (Number.isNaN(d.getTime())) return '-'
      return d.toLocaleString('zh-CN', { hour12: false })
    }

    const crosshair = ref({ show: false, x: 0, label: '' })
    const currentCrosshairMs = ref(null)
    const hoverInfo = ref({
      show: false,
      title: '-',
      udi: '-',
      toolLifeLabel: '-',
      startLabel: '-',
      endLabel: '-',
      durationLabel: '-'
    })
    const dragging = ref(false)

    const formatClock = (t) => {
      const d = new Date(t)
      if (Number.isNaN(d.getTime())) return '-'
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    }

    const getInstrumentImageUrl = (instrumentType) => {
      if (instrumentType === undefined || instrumentType === null || instrumentType === '') return ''
      const key = typeof instrumentType === 'number' ? instrumentType : String(instrumentType).trim()
      if (!key || key === '0') return ''
      return `/instruments/${encodeURIComponent(key)}.png`
    }

    const armSnapshotCards = computed(() => {
      const ms = Number.isFinite(currentCrosshairMs.value) ? currentCrosshairMs.value : timelineStart.value
      return arms.value.map((arm) => {
        const seg = (arm.instrument_usage || []).find((item) => {
          const s = toMs(item.start_time || item.install_time || item.start)
          const e = toMs(item.end_time || item.remove_time || item.end || item.start_time)
          return Number.isFinite(s) && Number.isFinite(e) && Number.isFinite(ms) && s <= ms && ms <= e
        })
        const rawType = seg?.tool_type ?? seg?.instrument_type ?? seg?.instrument_name
        return {
          armId: arm.arm_id,
          udi: seg?.udi || '-',
          toolLife: (seg && (seg.tool_life === 0 || seg.tool_life)) ? String(seg.tool_life) : '-',
          install: seg ? formatClock(seg.start_time || seg.install_time || seg.start) : '-',
          imageUrl: seg ? getInstrumentImageUrl(rawType) : ''
        }
      })
    })

    const drawOverviewCanvas = () => {
      if (!isFullscreenMode.value) return
      const canvas = overviewCanvasRef.value
      const vp = viewportRef.value
      if (!canvas || !vp) return
      const dpr = window.devicePixelRatio || 1
      const width = vp.clientWidth
      const height = vp.clientHeight
      if (width <= 0 || height <= 0) return
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const axisH = 22
      const leftW = 64
      const rows = ['events', ...arms.value.map(a => a.arm_id)]
      const rowCount = Math.max(2, rows.length)
      const laneH = Math.max(30, (height - axisH) / rowCount)
      const plotW = Math.max(1, width - leftW)

      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = '#e5eaf2'
      ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

      ctx.fillStyle = '#fafcff'
      ctx.fillRect(leftW, 0, plotW, axisH)
      ctx.strokeStyle = '#e5eaf2'
      ctx.beginPath(); ctx.moveTo(leftW, axisH + 0.5); ctx.lineTo(width, axisH + 0.5); ctx.stroke()

      ctx.fillStyle = '#fcfdff'
      ctx.fillRect(0, axisH, leftW, height - axisH)
      ctx.beginPath(); ctx.moveTo(leftW + 0.5, axisH); ctx.lineTo(leftW + 0.5, height); ctx.stroke()

      const colW = plotW / Math.max(1, totalHours.value)
      for (let i = 0; i <= totalHours.value; i++) {
        const x = leftW + i * colW
        ctx.strokeStyle = '#edf1f6'
        ctx.beginPath(); ctx.moveTo(x + 0.5, axisH); ctx.lineTo(x + 0.5, height); ctx.stroke()
      }
      rows.forEach((_, i) => {
        const y = axisH + i * laneH
        ctx.strokeStyle = '#eef2f7'
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); ctx.stroke()
      })

      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      hourMarks.value.forEach((m, i) => {
        const x = leftW + (i + 0.5) * colW
        ctx.fillText(m, x, axisH / 2)
      })

      ctx.fillStyle = '#475569'
      ctx.textAlign = 'center'
      ctx.fillText('Events', leftW / 2, axisH + laneH / 2)
      arms.value.forEach((arm, idx) => {
        ctx.fillText(`Arm ${arm.arm_id}`, leftW / 2, axisH + (idx + 1.5) * laneH)
      })

      // faults
      faults.value.forEach((t) => {
        const x = leftW + mapRatio(t) * plotW
        ctx.strokeStyle = 'rgba(239,68,68,.7)'
        ctx.beginPath(); ctx.moveTo(x + 0.5, axisH); ctx.lineTo(x + 0.5, height); ctx.stroke()
      })
      // events
      events.value.forEach((ev) => {
        const x = leftW + mapRatio(ev.time) * plotW
        const y = axisH + laneH / 2
        ctx.fillStyle = ev.symbol === 'square' ? '#38bdf8' : '#22c55e'
        if (ev.symbol === 'square') ctx.fillRect(x - 4, y - 4, 8, 8)
        else { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill() }
      })

      const segH = Math.max(8, Math.min(14, laneH * 0.34))
      arms.value.forEach((arm, idx) => {
        ;(arm.instrument_usage || []).forEach((seg) => {
          const { leftPct, widthPct } = getSegmentMetrics(seg)
          const x = leftW + (leftPct / 100) * plotW
          const w = Math.max(6, (widthPct / 100) * plotW)
          const y = axisH + (idx + 1) * laneH + (laneH - segH) / 2
          ctx.fillStyle = getArmColor(arm.arm_id)
          const r = Math.min(6, segH / 2)
          ctx.beginPath()
          ctx.moveTo(x + r, y)
          ctx.lineTo(x + w - r, y)
          ctx.quadraticCurveTo(x + w, y, x + w, y + r)
          ctx.lineTo(x + w, y + segH - r)
          ctx.quadraticCurveTo(x + w, y + segH, x + w - r, y + segH)
          ctx.lineTo(x + r, y + segH)
          ctx.quadraticCurveTo(x, y + segH, x, y + segH - r)
          ctx.lineTo(x, y + r)
          ctx.quadraticCurveTo(x, y, x + r, y)
          ctx.fill()
        })
      })
    }

    const formatDurationMMSS = (ms) => {
      const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${String(minutes).padStart(2, '0')}分钟${String(seconds).padStart(2, '0')}秒`
    }

    const updateCrosshair = (clientX, clientY, options = {}) => {
      const { updateTooltip = false } = options
      if (!timelineStart.value || !timelineEnd.value) return
      const target = isFullscreenMode.value ? overviewCanvasRef.value : timelineCanvasRef.value
      if (!target) return
      const rect = target.getBoundingClientRect()
      const timelineX = clientX - rect.left
      if (timelineX < 0 || timelineX > rect.width) return
      let ratio = timelineX / Math.max(1, rect.width)
      if (isFullscreenMode.value) {
        const leftW = 64
        const plotW = Math.max(1, rect.width - leftW)
        ratio = (timelineX - leftW) / plotW
      }
      ratio = Math.max(0, Math.min(1, ratio))
      const ms = timelineStart.value + ratio * (timelineEnd.value - timelineStart.value)
      currentCrosshairMs.value = ms
      crosshair.value = { show: true, x: (isFullscreenMode.value ? timelineX : (armColWidth + timelineX)), label: fmt(ms) }

      if (!isFullscreenMode.value || !updateTooltip) return

      const axisH = 22
      const leftW = 64
      const rowCount = Math.max(2, 1 + arms.value.length)
      const laneH = Math.max(30, (rect.height - axisH) / rowCount)
      const segH = Math.max(8, Math.min(14, laneH * 0.34))
      const y = clientY - rect.top
      const laneIndex = Math.floor((y - axisH) / laneH) - 1
      const arm = arms.value[laneIndex]
      if (!arm || timelineX < leftW) {
        hoverInfo.value.show = false
        return
      }

      const plotW = Math.max(1, rect.width - leftW)
      const xInPlot = timelineX - leftW
      const hitY = axisH + (laneIndex + 1) * laneH + (laneH - segH) / 2
      const hitBottom = hitY + segH
      if (y < hitY || y > hitBottom) {
        hoverInfo.value.show = false
        return
      }

      let hitSeg = null
      ;(arm.instrument_usage || []).forEach(seg => {
        if (hitSeg) return
        const metrics = getSegmentMetrics(seg)
        const segX = (metrics.leftPct / 100) * plotW
        const segW = Math.max(6, (metrics.widthPct / 100) * plotW)
        if (xInPlot >= segX && xInPlot <= segX + segW) {
          hitSeg = seg
        }
      })

      if (!hitSeg) {
        hoverInfo.value.show = false
        return
      }

      const startRaw = hitSeg.start_time || hitSeg.install_time || hitSeg.start
      const endRaw = hitSeg.end_time || hitSeg.remove_time || hitSeg.end || startRaw
      const s = toMs(startRaw)
      const e = toMs(endRaw)
      const durationMs = Number.isFinite(s) && Number.isFinite(e) ? Math.max(0, Math.round(e - s)) : 0

      hoverInfo.value = {
        show: true,
        title: getType(hitSeg),
        udi: hitSeg.udi || '-',
        toolLifeLabel: (hitSeg.tool_life === 0 || hitSeg.tool_life) ? String(hitSeg.tool_life) : '--',
        startLabel: fmt(startRaw),
        endLabel: fmt(endRaw),
        durationLabel: formatDurationMMSS(durationMs)
      }
    }

    const onPointerDown = (e) => {
      const vp = viewportRef.value
      if (!vp) return
      dragging.value = true
      updateCrosshair(e.clientX, e.clientY, { updateTooltip: true })
    }

    const onPointerMove = (e) => {
      if (!dragging.value) return
      updateCrosshair(e.clientX, e.clientY, { updateTooltip: false })
    }

    const onPointerUp = () => {
      dragging.value = false
    }

    const tryLockLandscape = async () => {
      try {
        if (window?.screen?.orientation?.lock) {
          await window.screen.orientation.lock('landscape')
        }
      } catch (_) {
        // 某些浏览器/非PWA环境不允许程序化锁定方向，忽略即可
      }
    }

    const tryUnlockOrientation = async () => {
      try {
        if (window?.screen?.orientation?.unlock) {
          window.screen.orientation.unlock()
        }
      } catch (_) {}
    }

    const load = async () => {
      try {
        const cached = sessionStorage.getItem('surgeryVizData')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (String(parsed?.surgery_id) === String(surgeryId)) {
            surgeryData.value = parsed
            return
          }
        }
        const resp = await api.surgeries.get(surgeryId)
        const raw = resp?.data?.data ?? resp?.data
        const adapted = adaptSurgeryData(raw)
        surgeryData.value = validateAdaptedData(adapted) ? adapted : raw
      } catch (e) {
        showToast('加载时间轴失败')
      }
    }

    watch([isFullscreenMode, arms, events, faults, hourMarks], () => {
      if (!Number.isFinite(currentCrosshairMs.value) && Number.isFinite(timelineStart.value)) {
        currentCrosshairMs.value = timelineStart.value
      }
      nextTick(() => drawOverviewCanvas())
    }, { deep: true })

    onMounted(async () => {
      updateOrientationState()
      window.addEventListener('resize', updateOrientationState)
      window.addEventListener('orientationchange', updateOrientationState)
      await tryLockLandscape()
      setTimeout(updateOrientationState, 200)
      await load()
      nextTick(() => drawOverviewCanvas())
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', updateOrientationState)
      window.removeEventListener('orientationchange', updateOrientationState)
      tryUnlockOrientation()
    })

    return {
      surgeryData,
      hourMarks,
      totalHours,
      rowHeight,
      arms,
      events,
      faults,
      getEventStyle,
      getFaultStyle,
      getSegmentStyle,
      isCompactSegment,
      getType,
      viewportRef,
      timelineCanvasRef,
      overviewCanvasRef,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      crosshair,
      hoverInfo,
      armSnapshotCards,
      drawerVisible,
      selected,
      openSegment,
      fmt,
      showRotateMask,
      isFullscreenMode
    }
  }
}
</script>

<style scoped>
.timeline-page { min-height: 100%; background: #f5f7fb; padding-top: calc(46px + env(safe-area-inset-top)); }
.timeline-page--fullscreen { padding-top: 0; }

:deep(.van-nav-bar) { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
:deep(.van-nav-bar__content) { height: 42px; }
:deep(.van-nav-bar__title) { font-size: 15px; max-width: 62vw; }
.timeline-content { padding: 10px; position: relative; }
.timeline-page--fullscreen .timeline-content { padding: 6px; height: 100dvh; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; }
.timeline-page--fullscreen .timeline-viewport { flex: 1; min-height: 0; }
.tip { font-size: 12px; color: #64748b; margin-bottom: 8px; }
.timeline-viewport { overflow: hidden; border: 1px solid #dbe3ef; border-radius: 10px; background: #fff; position: relative; }

.fullscreen-top-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.arm-snapshot-card {
  border: 1px solid #dbe4f2;
  border-radius: 8px;
  background: #fbfdff;
  padding: 0;
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 6px;
  align-items: center;
  min-height: 44px;
  overflow: hidden;
}

.arm-snapshot-avatar {
  width: 44px;
  height: 44px;
  border-radius: 0;
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
}

.arm-snapshot-image {
  width: 44px;
  height: 44px;
  border-radius: 0;
  object-fit: cover;
  border: none;
  background: #fff;
}

.arm-snapshot-main { min-width: 0; padding-right: 6px; }
.arm-snapshot-title { font-size: 10px; font-weight: 700; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.arm-snapshot-meta { font-size: 9px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.overview-canvas { width: 100%; height: 100%; display: block; }
.crosshair-overlay { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(17,24,39,.7); pointer-events: none; z-index: 8; }
.hover-info-card { position: absolute; right: 8px; top: 8px; background: rgba(255,255,255,.95); border: 1px solid #dbe4f2; border-radius: 8px; padding: 7px; font-size: 10px; color: #334155; z-index: 9; max-width: 180px; }
.hover-info-title { font-weight: 700; color: #1e3a8a; margin-bottom: 3px; }

.rotate-mask {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 30px;
  bottom: 10px;
  z-index: 20;
  background: rgba(148, 163, 184, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  backdrop-filter: blur(10px) saturate(130%);
  -webkit-backdrop-filter: blur(10px) saturate(130%);
}

.rotate-mask-card {
  width: 100%;
  max-width: 320px;
  border-radius: 14px;
  padding: 18px 16px;
  text-align: center;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
}

.rotate-title { font-size: 16px; font-weight: 700; color: var(--m-color-text, #111827); }
.rotate-desc { font-size: 12px; color: var(--m-color-text-secondary, #6b7280); margin-top: 6px; line-height: 1.5; }
.timeline-inner { position: relative; min-height: 100%; width: 100%; }
.timeline-axis { display: flex; position: sticky; top: 0; z-index: 5; background: #fff; border-bottom: 1px solid #eef2f7; }
.arm-col { width: 72px; flex: 0 0 72px; border-right: 1px solid #eef2f7; }
.hour-cols { display: flex; flex: 1; min-width: 0; }
.hour-col { flex: 1 1 0; min-width: 0; font-size: 12px; color: #64748b; text-align: center; padding: 8px 0; border-right: 1px dashed #eef2f7; }
.timeline-row { display: flex; height: var(--row-height, 52px); min-height: var(--row-height, 52px); border-bottom: 1px solid #f1f5f9; }
.arm-title { display: flex; align-items: center; justify-content: center; font-size: 12px; color: #334155; }
.row-canvas { position: relative; flex: 1; overflow: visible; }
.row-canvas-arm { background-image: linear-gradient(to right, #f8fafc 1px, transparent 1px); background-size: calc(100% / max(1, var(--total-hours, 1))) 100%; }
.segment { position: absolute; top: calc((var(--row-height, 52px) - 24px) / 2); height: 24px; background: #3b82f6; border-radius: 8px; padding: 0 6px; display: flex; align-items: center; color: #fff; font-size: 10px; box-sizing: border-box; }
.segment--compact { padding: 0; justify-content: center; }
.segment--compact .seg-label { display: none; }
.seg-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.event-dot { position: absolute; top: calc((var(--row-height, 52px) - 10px) / 2); width: 10px; height: 10px; transform: translateX(-5px); border: 1.5px solid #0f172a; background: #fff; }
.event-dot--circle { border-radius: 999px; background: #22c55e; }
.event-dot--square { border-radius: 2px; background: #38bdf8; }
.fault-line { position: absolute; top: 0; bottom: 0; width: 2px; background: #ef4444; opacity: .7; }
.crosshair { position: absolute; top: 0; bottom: 0; width: 1px; background: #111827; pointer-events: none; z-index: 6; }
.crosshair-tip { position: sticky; top: 44px; transform: translateX(-50%); background: #111827; color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 6px; width: max-content; margin-left: 0; }
.drawer { padding: 16px; }
.drawer-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.drawer-row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #eef2f7; font-size: 13px; }
</style>
