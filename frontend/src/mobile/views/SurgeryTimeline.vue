<template>
  <div class="timeline-page">
    <van-nav-bar
      title="Case Timeline"
      left-arrow
      @click-left="$router.back()"
      fixed
      safe-area-inset-top
    />

    <div class="timeline-content" v-if="surgeryData">
      <div class="tip">建议横屏查看 · 支持拖动十字光标</div>

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
        <div class="timeline-inner" :style="{ '--row-height': `${rowHeight}px`, '--total-hours': `${totalHours}` }">
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
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { NavBar as VanNavBar, Popup as VanPopup, showToast } from 'vant'
import api from '@/api'
import { adaptSurgeryData, validateAdaptedData } from '@/utils/surgeryDataAdapter'
import { resolveInstrumentTypeLabel } from '@/utils/analysisMappings'

export default {
  name: 'MSurgeryTimeline',
  components: { 'van-nav-bar': VanNavBar, 'van-popup': VanPopup },
  setup() {
    const route = useRoute()
    const surgeryId = route.params?.surgeryId
    const surgeryData = ref(null)
    const viewportRef = ref(null)
    const timelineCanvasRef = ref(null)
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
      nextTick(updateViewportMetrics)
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
    const dragging = ref(false)

    const updateCrosshair = (clientX) => {
      const canvas = timelineCanvasRef.value
      if (!canvas || !timelineStart.value || !timelineEnd.value) return
      const rect = canvas.getBoundingClientRect()
      const timelineX = clientX - rect.left
      if (timelineX < 0 || timelineX > rect.width) return
      const ratio = timelineX / Math.max(1, rect.width)
      const ms = timelineStart.value + ratio * (timelineEnd.value - timelineStart.value)
      crosshair.value = { show: true, x: armColWidth + timelineX, label: fmt(ms) }
    }

    const onPointerDown = (e) => {
      const vp = viewportRef.value
      if (!vp) return
      dragging.value = true
      updateCrosshair(e.clientX)
    }

    const onPointerMove = (e) => {
      if (!dragging.value) return
      updateCrosshair(e.clientX)
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

    onMounted(async () => {
      updateOrientationState()
      window.addEventListener('resize', updateOrientationState)
      window.addEventListener('orientationchange', updateOrientationState)
      await tryLockLandscape()
      setTimeout(updateOrientationState, 200)
      await load()
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
      onPointerDown,
      onPointerMove,
      onPointerUp,
      crosshair,
      drawerVisible,
      selected,
      openSegment,
      fmt,
      showRotateMask
    }
  }
}
</script>

<style scoped>
.timeline-page { min-height: 100%; background: #f5f7fb; padding-top: calc(46px + env(safe-area-inset-top)); }

:deep(.van-nav-bar) { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
:deep(.van-nav-bar__content) { height: 42px; }
:deep(.van-nav-bar__title) { font-size: 15px; max-width: 62vw; }
.timeline-content { padding: 10px; position: relative; }
.tip { font-size: 12px; color: #64748b; margin-bottom: 8px; }
.timeline-viewport { overflow: hidden; border: 1px solid #dbe3ef; border-radius: 10px; background: #fff; }

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
