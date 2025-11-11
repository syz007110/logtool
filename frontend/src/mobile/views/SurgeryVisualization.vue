<template>
  <div class="page">
    <van-nav-bar
      :title="$t('mobile.titles.surgeryVisualization')"
      left-arrow
      @click-left="$router.back()"
      fixed
      safe-area-inset-top
    />

    <div class="content">
      <div v-if="surgeryData" class="info-card">
        <div class="info-header">
          <div class="info-title one-line">{{ displaySurgeryId }}</div>
          <div class="info-subtitle one-line">{{ procedureName }}</div>
        </div>
        <div class="info-divider" />
        <div class="info-grid">
          <div class="info-grid-item">
            <div class="info-grid-label">{{ $t('mobile.surgeryVisualization.startLabel') }}</div>
            <div class="info-grid-value">{{ startTimeDisplay }}</div>
          </div>
          <div class="info-grid-item">
            <div class="info-grid-label">{{ $t('mobile.surgeryVisualization.endLabel') }}</div>
            <div class="info-grid-value">{{ endTimeDisplay }}</div>
          </div>
        </div>
      </div>

      <div class="tab-section">
        <div class="tab-row">
          <button
            v-for="tab in primaryTabs"
            :key="tab.key"
            type="button"
            :class="['tab-button', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="tab-row">
          <button
            v-for="tab in secondaryTabs"
            :key="tab.key"
            type="button"
            :class="['tab-button', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <template v-if="activeTab === 'overview'">
        <div class="gantt-card">
          <div class="gantt-header">
            <div class="gantt-title">{{ $t('mobile.surgeryVisualization.ganttTitle') }}</div>
            <div class="gantt-duration">
              {{ totalDuration }}
              {{ $t('mobile.surgeryVisualization.minute') }}
            </div>
          </div>

          <div class="gantt-body">
            <div class="timeline-head">
              <div class="timeline-label">{{ $t('mobile.surgeryVisualization.timeline') }}</div>
              <div class="timeline-axis">
                <div
                  v-for="mark in timelineMarks"
                  :key="`axis-${mark}`"
                  class="timeline-axis-mark"
                >
                  {{ mark }}
                </div>
              </div>
            </div>

          <div
            class="timeline-grid"
          >
            <div class="timeline-grid-label">{{ $t('mobile.surgeryVisualization.timeline') }}</div>
            <div
              class="timeline-grid-body"
              :style="{ gridTemplateColumns: `repeat(${timelineCells}, minmax(0, 1fr))` }"
            >
              <div
                v-for="cellIndex in timelineCells"
                :key="`grid-${cellIndex}`"
                class="timeline-grid-cell"
              >
                <div
                  v-if="getEventsForCell(cellIndex - 1).length"
                  class="timeline-event-container"
                >
                  <div
                    v-for="event in getEventsForCell(cellIndex - 1)"
                    :key="`${event.type}-${event.time}`"
                    class="timeline-event"
                  >
                    <span :class="['event-dot', getEventDotClass(event.type)]" />
                    <span class="event-label one-line">{{ event.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

            <div
              v-for="(arm, armIndex) in armsData"
              :key="arm.arm_id || armIndex"
              class="arm-track"
            >
              <div class="arm-track-label">{{ arm.name }}</div>
              <div class="arm-track-body">
                <div
                  v-for="(segment, segmentIndex) in arm.segments"
                  :key="`${segment.instrument_name || segment.tool_type || 'segment'}-${segmentIndex}`"
                  :class="['arm-segment', `arm-segment-${segment.colorToken}`]"
                  :style="getSegmentStyle(segment)"
                >
                  {{ segment.instrument_name || segment.tool_type || '-' }}
                </div>
              </div>
            </div>
          </div>

          <div class="legend">
            <div
              v-for="item in legendItems"
              :key="item.key"
              class="legend-item"
            >
              <span :class="['legend-dot', item.color]" />
              <span class="legend-label">{{ item.label }}</span>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'alerts'">
        <div v-if="hasAlerts" class="section-card alert-card">
          <div class="section-header">{{ $t('mobile.surgeryVisualization.alertsTitle') }}</div>
          <div class="table table-alerts">
            <div class="table-row table-header">
              <span>{{ $t('mobile.surgeryVisualization.alertTime') }}</span>
              <span>{{ $t('mobile.surgeryVisualization.alertCode') }}</span>
              <span>{{ $t('mobile.surgeryVisualization.alertMessage') }}</span>
              <span>{{ $t('mobile.surgeryVisualization.alertStatus') }}</span>
            </div>
            <div
              v-for="row in visibleFaultRows"
              :key="`${row.errorCode}-${row.timestamp}`"
              class="table-row"
            >
              <span class="cell time">{{ formatDisplayTime(row.timestamp) }}</span>
              <span class="cell code">{{ row.errorCode }}</span>
              <span class="cell message">{{ row.message }}</span>
              <span class="cell status">
                <span :class="['status-tag', row.statusKey === 'processed' ? 'status-processed' : 'status-unprocessed']">
                  {{ row.statusLabel }}
                </span>
              </span>
            </div>
          </div>
          <button
            v-if="faultRows.length > 5"
            type="button"
            class="toggle-button"
            @click="toggleFaultRows"
          >
            {{ showAllFaults ? $t('mobile.surgeryVisualization.collapse') : $t('mobile.surgeryVisualization.expand') }}
          </button>
          <div class="summary-text">
            {{ $t('mobile.surgeryVisualization.alertSummary', { total: faultSummary.total, processed: faultSummary.processed, unprocessed: faultSummary.unprocessed }) }}
          </div>
        </div>
        <div v-else class="placeholder-card">
          <van-empty :description="$t('mobile.surgeryVisualization.noAlertData')" />
        </div>
      </template>

      <template v-else-if="activeTab === 'network'">
        <div v-if="hasNetworkLatency" class="section-card network-card chart-card">
          <div class="section-header">{{ $t('mobile.surgeryVisualization.networkLatencyTitle') }}</div>
          <network-latency-chart
            :data="networkLatencySeries"
            :height="280"
            time-mask="HH:mm"
            :time-tick-count="5"
            :value-tick-count="5"
          />
        </div>
        <div v-else class="placeholder-card">
          <van-empty :description="$t('mobile.surgeryVisualization.noNetworkData')" />
        </div>
      </template>

      <template v-else-if="activeTab === 'stateMachine'">
        <div v-if="hasStateMachine" class="section-card state-machine-card chart-card">
          <div class="section-header">{{ $t('mobile.surgeryVisualization.stateMachineTitle') }}</div>
          <state-machine-chart
            :data="stateMachineSeries"
            :height="280"
            time-mask="HH:mm"
            :time-tick-count="5"
            :value-tick-count="6"
            :padding="[0, 0, 0, 0]"
          />
        </div>
        <div v-else class="placeholder-card">
          <van-empty :description="$t('mobile.surgeryVisualization.noStateMachineData')" />
        </div>
      </template>

      <template v-else-if="activeTab === 'instruments'">
        <div v-if="hasInstrumentUsage" class="section-card instrument-card">
          <div class="section-header">{{ $t('mobile.surgeryVisualization.instrumentUsageTitle') }}</div>
          <div class="table table-instruments">
            <div class="table-row table-header">
              <span>{{ $t('mobile.surgeryVisualization.instrumentArm') }}</span>
              <span>{{ $t('mobile.surgeryVisualization.instrumentType') }}</span>
              <span>{{ $t('mobile.surgeryVisualization.instrumentUdi') }}</span>
              <span>{{ $t('mobile.surgeryVisualization.instrumentInstall') }}</span>
              <span>{{ $t('mobile.surgeryVisualization.instrumentRemove') }}</span>
            </div>
            <div
              v-for="row in instrumentUsageRows"
              :key="row.id"
              class="table-row"
            >
              <span>{{ row.armLabel }}</span>
              <span>{{ row.toolType }}</span>
              <span class="one-line">{{ row.udi }}</span>
              <span class="cell time">{{ formatDisplayTime(row.installTime) }}</span>
              <span class="cell time">{{ formatDisplayTime(row.removeTime) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="placeholder-card">
          <van-empty :description="$t('mobile.surgeryVisualization.noInstrumentData')" />
        </div>
      </template>

      <template v-else-if="activeTab === 'operations'">
        <div v-if="hasOperationSummary" class="section-card operation-card">
          <div class="section-header">{{ $t('mobile.surgeryVisualization.operationSummary') }}</div>
          <div class="table table-operations">
            <div class="table-row table-header">
              <span>{{ $t('mobile.surgeryVisualization.operationType') }}</span>
              <span class="align-right">{{ $t('mobile.surgeryVisualization.operationCount') }}</span>
            </div>
            <div
              v-for="row in operationSummaryRows"
              :key="row.key"
              class="table-row"
            >
              <span>{{ row.label }}</span>
              <span class="align-right">{{ row.count }}</span>
            </div>
          </div>
        </div>
        <div v-else class="placeholder-card">
          <van-empty :description="$t('mobile.surgeryVisualization.noOperationData')" />
        </div>
      </template>

      <div v-else class="placeholder-card">
        <van-empty :description="$t('mobile.surgeryVisualization.comingSoon')" />
      </div>

      <van-loading v-if="loading" class="loading-state" />
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import {
  NavBar as VanNavBar,
  Empty as VanEmpty,
  Loading as VanLoading
} from 'vant'
import api from '@/api'
import NetworkLatencyChart from '@/components/NetworkLatencyChart.vue'
import StateMachineChart from '@/components/StateMachineChart.vue'
import { normalizeSurgeryData } from '@/utils/visualizationConfig'
import { adaptSurgeryData, validateAdaptedData, getDataSourceType } from '@/utils/surgeryDataAdapter'

const SEGMENT_COLOR_ORDER = ['incision', 'test', 'scope', 'general']

export default {
  name: 'MSurgeryVisualization',
  components: {
    'van-nav-bar': VanNavBar,
    'van-empty': VanEmpty,
    'van-loading': VanLoading,
    'network-latency-chart': NetworkLatencyChart,
    'state-machine-chart': StateMachineChart
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()

    const surgeryId = route.params?.surgeryId || route.query?.surgeryId || ''
    const surgeryData = ref(null)
    const armsData = ref([])
    const loading = ref(false)
    const activeTab = ref('overview')
    const timelineEvents = ref([])

    const primaryTabs = computed(() => ([
      { key: 'overview', label: t('mobile.surgeryVisualization.tabOverview') },
      { key: 'alerts', label: t('mobile.surgeryVisualization.tabAlerts') },
      { key: 'network', label: t('mobile.surgeryVisualization.tabNetwork') }
    ]))

    const secondaryTabs = computed(() => ([
      { key: 'stateMachine', label: t('mobile.surgeryVisualization.tabStateMachine') },
      { key: 'instruments', label: t('mobile.surgeryVisualization.tabInstrument') },
      { key: 'operations', label: t('mobile.surgeryVisualization.tabOperation') }
    ]))

    const formatTime = (time) => {
      if (!time) return '-'
      const date = new Date(time)
      if (Number.isNaN(date.getTime())) return '-'
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    const displaySurgeryId = computed(() => surgeryData.value?.surgery_id || surgeryId || '-')
    const procedureName = computed(() =>
      surgeryData.value?.procedure ||
      surgeryData.value?.operation ||
      surgeryData.value?.surgery_name ||
      '-'
    )
    const startTimeDisplay = computed(() => formatTime(surgeryData.value?.start_time))
    const endTimeDisplay = computed(() => formatTime(surgeryData.value?.end_time))

    const totalDuration = computed(() => {
      if (!surgeryData.value?.start_time || !surgeryData.value?.end_time) return 0
      const start = new Date(surgeryData.value.start_time)
      const end = new Date(surgeryData.value.end_time)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
      return Math.max(0, Math.floor((end - start) / (1000 * 60)))
    })

    const formatDisplayTime = (time) => {
      if (!time) return '-'
      const date = new Date(time)
      if (Number.isNaN(date.getTime())) return '-'
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    const resolveFaultStatus = (fault) => {
      let processed = false
      if (fault?.status === true || fault?.resolved === true || fault?.is_resolved === true) {
        processed = true
      } else if (typeof fault?.status === 'string') {
        const normalized = fault.status.toLowerCase()
        processed = ['processed', 'resolved', '已处理', '已恢复'].some(keyword => normalized.includes(keyword))
      }
      return {
        key: processed ? 'processed' : 'unprocessed',
        label: processed ? t('mobile.surgeryVisualization.statusProcessed') : t('mobile.surgeryVisualization.statusUnprocessed')
      }
    }

    const faultRows = computed(() => {
      const faults = surgeryData.value?.surgery_stats?.faults
      if (!Array.isArray(faults)) return []
      return faults
        .map(fault => {
          const timestamp = fault.timestamp || fault.time || fault.created_at
          const status = resolveFaultStatus(fault)
          return {
            timestamp,
            errorCode: fault.error_code || fault.code || '-',
            message: fault.explanation || fault.message || '-',
            statusKey: status.key,
            statusLabel: status.label
          }
        })
        .filter(item => item.errorCode && item.timestamp)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    })

    const showAllFaults = ref(false)
    const visibleFaultRows = computed(() => (showAllFaults.value ? faultRows.value : faultRows.value.slice(0, 5)))
    const hasAlerts = computed(() => faultRows.value.length > 0)
    const faultSummary = computed(() => {
      const total = faultRows.value.length
      const processed = faultRows.value.filter(row => row.statusKey === 'processed').length
      const unprocessed = total - processed
      return { total, processed, unprocessed }
    })

    const operationSummaryRows = computed(() => {
      const stats = surgeryData.value?.surgery_stats
      if (!stats) return []
      const descriptors = [
        { key: 'endoscope_pedal', label: t('mobile.surgeryVisualization.operationEndoscopePedal') },
        { key: 'foot_clutch', label: t('mobile.surgeryVisualization.operationFootClutch') },
        { key: 'left_hand_clutch', label: t('mobile.surgeryVisualization.operationLeftHandClutch') },
        { key: 'right_hand_clutch', label: t('mobile.surgeryVisualization.operationRightHandClutch') },
        { key: 'arm_switch_count', label: t('mobile.surgeryVisualization.operationArmSwitch') }
      ]
      return descriptors.map(desc => ({
        key: desc.key,
        label: desc.label,
        count: Number.isFinite(Number(stats[desc.key])) ? Number(stats[desc.key]) : 0
      }))
    })
    const hasOperationSummary = computed(() => operationSummaryRows.value.length > 0)

    const instrumentUsageRows = computed(() => {
      const arms = surgeryData.value?.arms
      if (!Array.isArray(arms)) return []
      const rows = []
      arms.forEach((arm, armIndex) => {
        const usageList = Array.isArray(arm.instrument_usage) ? arm.instrument_usage : []
        usageList.forEach((usage, usageIndex) => {
          const install = usage.install_time || usage.start_time
          const remove = usage.remove_time || usage.end_time
          rows.push({
            id: `${arm.arm_id || armIndex + 1}-${usageIndex}`,
            armLabel: arm.arm_id || arm.armId || armIndex + 1,
            toolType: usage.tool_type || usage.instrument_name || '-',
            udi: usage.udi || usage.udi_code || '-',
            installTime: install,
            removeTime: remove
          })
        })
      })
      return rows
    })
    const hasInstrumentUsage = computed(() => instrumentUsageRows.value.length > 0)

    const extractStateNumber = (value) => {
      if (value === null || value === undefined) return 0
      if (typeof value === 'number' && Number.isFinite(value)) return value
      const str = String(value)
      const bracketMatch = str.match(/\((\d+)\)/)
      if (bracketMatch) return parseInt(bracketMatch[1], 10)
      const numberMatch = str.match(/\d+/)
      if (numberMatch) return parseInt(numberMatch[0], 10)
      return 0
    }

    const stateMachineSeries = computed(() => {
      const list = surgeryData.value?.surgery_stats?.state_machine
      if (!Array.isArray(list)) return []
      return list
        .map(item => {
          const timestamp = item.time || item.timestamp
          const date = timestamp ? new Date(timestamp) : null
          if (!date || Number.isNaN(date.getTime())) return null
          return [date.getTime(), extractStateNumber(item.state)]
        })
        .filter(entry => Array.isArray(entry))
        .sort((a, b) => a[0] - b[0])
    })
    const hasStateMachine = computed(() => stateMachineSeries.value.length > 0)

    const networkLatencySeries = computed(() => {
      const list = surgeryData.value?.surgery_stats?.network_latency_ms
      if (!Array.isArray(list)) return []
      return list
        .map(item => {
          const timestamp = item.time || item.timestamp
          const latency = item.latency ?? item.value
          const date = timestamp ? new Date(timestamp) : null
          const latencyValue = Number(latency)
          if (!date || Number.isNaN(date.getTime()) || Number.isNaN(latencyValue)) return null
          return [date.getTime(), latencyValue]
        })
        .filter(entry => Array.isArray(entry))
        .sort((a, b) => a[0] - b[0])
    })
    const hasNetworkLatency = computed(() => networkLatencySeries.value.length > 0)

    const toggleFaultRows = () => {
      showAllFaults.value = !showAllFaults.value
    }

    const legendItems = computed(() => [
      { key: 'incision', label: t('mobile.surgeryVisualization.legendIncision'), color: 'legend-incision' },
      { key: 'node', label: t('mobile.surgeryVisualization.legendSurgeryNode'), color: 'legend-node' },
      { key: 'test', label: t('mobile.surgeryVisualization.legendTestInstrument'), color: 'legend-test' },
      { key: 'scope', label: t('mobile.surgeryVisualization.legendScope'), color: 'legend-scope' },
      { key: 'general', label: t('mobile.surgeryVisualization.legendGeneralInstrument'), color: 'legend-general' }
    ])

    const timelineStartDate = computed(() => {
      const timestamps = []
      timelineEvents.value.forEach(event => {
        const date = new Date(event.time)
        if (!Number.isNaN(date.getTime())) {
          timestamps.push(date.getTime())
        }
      })
      if (surgeryData.value?.start_time) {
        const startDate = new Date(surgeryData.value.start_time)
        if (!Number.isNaN(startDate.getTime())) {
          timestamps.push(startDate.getTime())
        }
      }
      if (!timestamps.length) return null
      const minTime = Math.min(...timestamps)
      const start = new Date(minTime)
      start.setMinutes(0, 0, 0)
      start.setHours(start.getHours() - 1)
      return start
    })

    const timelineEndDate = computed(() => {
      const timestamps = []
      timelineEvents.value.forEach(event => {
        const date = new Date(event.time)
        if (!Number.isNaN(date.getTime())) {
          timestamps.push(date.getTime())
        }
      })
      if (surgeryData.value?.end_time) {
        const endDate = new Date(surgeryData.value.end_time)
        if (!Number.isNaN(endDate.getTime())) {
          timestamps.push(endDate.getTime())
        }
      }
      if (!timestamps.length) return null
      const maxTime = Math.max(...timestamps)
      const end = new Date(maxTime)
      end.setMinutes(0, 0, 0)
      end.setHours(end.getHours() + 1)
      if (timelineStartDate.value && end <= timelineStartDate.value) {
        return new Date(timelineStartDate.value.getTime() + 60 * 60 * 1000)
      }
      return end
    })

    const formatHourMark = (date) => date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

    const timelineMarks = computed(() => {
      const start = timelineStartDate.value
      const end = timelineEndDate.value
      if (!start || !end) return []

      const marks = []
      const current = new Date(start)
      while (current <= end) {
        marks.push(formatHourMark(current))
        current.setHours(current.getHours() + 1)
      }
      if (!marks.length) {
        marks.push(formatHourMark(start))
        marks.push(formatHourMark(new Date(start.getTime() + 60 * 60 * 1000)))
      }
      return marks
    })

    const timelineCells = computed(() => Math.max(1, timelineMarks.value.length - 1))

    const resolveSegmentColor = (segment, armIndex) => {
      const rawName = (segment.instrument_name || segment.tool_type || '').toLowerCase()
      if (/测试|test/.test(rawName)) return 'test'
      if (/镜|scope|endoscope/.test(rawName)) return 'scope'
      if (/刀|剪|切|instrument/.test(rawName)) return 'general'
      if (/开刀|incision/.test(rawName)) return 'incision'
      return SEGMENT_COLOR_ORDER[armIndex % SEGMENT_COLOR_ORDER.length]
    }

    const enhanceSegments = (arms) => {
      if (!Array.isArray(arms)) return []
      return arms.map((arm, armIndex) => {
        const segments = Array.isArray(arm.segments)
          ? arm.segments.map(segment => ({
              ...segment,
              colorToken: resolveSegmentColor(segment, armIndex)
            }))
          : []
        const name = arm.name || t('mobile.surgeryVisualization.armFallback', { index: armIndex + 1 })
        return {
          ...arm,
          name,
          segments
        }
      })
    }

    const buildTimelineEvents = (data) => {
      const events = []
      const timelineInfo = data?.timeline || {}
      const powerCycles = Array.isArray(data?.power_cycles) ? data.power_cycles : []

      powerCycles.forEach((cycle, index) => {
        if (cycle.on_time) {
          events.push({
            time: cycle.on_time,
            name: t('surgeryVisualization.powerOn', { index: index + 1 }),
            type: 'power_on'
          })
        }
        if (cycle.off_time) {
          events.push({
            time: cycle.off_time,
            name: t('surgeryVisualization.powerOff', { index: index + 1 }),
            type: 'power_off'
          })
        }
      })

      const previousSurgeryEnd = timelineInfo.previousSurgeryEnd || data?.previous_surgery_end_time || data?.previous_end_time
      const surgeryStart = timelineInfo.surgeryStart || data?.start_time
      const surgeryEnd = timelineInfo.surgeryEnd || data?.end_time

      if (previousSurgeryEnd) {
        events.push({ time: previousSurgeryEnd, name: t('surgeryVisualization.previousSurgeryEnd'), type: 'previous_end' })
      }
      if (surgeryStart) {
        events.push({ time: surgeryStart, name: t('surgeryVisualization.surgeryStart'), type: 'surgery_start' })
      }
      if (surgeryEnd) {
        events.push({ time: surgeryEnd, name: t('surgeryVisualization.surgeryEnd'), type: 'surgery_end' })
      }

      const uniqueEvents = []
      const seenKeys = new Set()
      events.forEach(event => {
        const key = `${event.type}-${event.time}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          uniqueEvents.push(event)
        }
      })

      uniqueEvents.sort((a, b) => {
        const timeA = new Date(a.time).getTime()
        const timeB = new Date(b.time).getTime()
        return timeA - timeB
      })

      timelineEvents.value = uniqueEvents
    }

    const applyVisualizationData = (raw) => {
      if (!raw) return false
      try {
        const adapted = adaptSurgeryData(raw) || raw
        if (adapted && validateAdaptedData(adapted)) {
          adapted._dataSource = getDataSourceType(raw)
          adapted._originalData = raw
          sessionStorage.setItem('surgeryVizData', JSON.stringify(adapted))
          surgeryData.value = adapted
          const normalized = normalizeSurgeryData(adapted)
          armsData.value = enhanceSegments(normalized.arms || [])
          buildTimelineEvents(adapted)
          return true
        }
        surgeryData.value = raw
        const normalized = normalizeSurgeryData(raw)
        armsData.value = enhanceSegments(normalized.arms || [])
        buildTimelineEvents(raw)
        return true
      } catch (error) {
        console.error('Failed to apply visualization data:', error)
        timelineEvents.value = []
        return false
      }
    }

    const loadFromSession = () => {
      try {
        const cached = sessionStorage.getItem('surgeryVizData')
        if (!cached) return false
        const parsed = JSON.parse(cached)
        return applyVisualizationData(parsed)
      } catch (error) {
        console.warn('Failed to load visualization data from session:', error)
        return false
      }
    }

    const fetchSurgeryData = async () => {
      loading.value = true
      try {
        const resp = await api.surgeries.get(surgeryId)
        const raw = resp?.data?.data ?? resp?.data ?? null
        const applied = applyVisualizationData(raw)

        if (!applied || !armsData.value.length) {
          try {
            const vizResp = await api.surgeryStatistics.getList({ surgery_id: surgeryId, limit: 1 })
            const stats = vizResp?.data?.data?.[0]
            if (stats && stats.structured_data) {
              applyVisualizationData({ ...stats, structured_data: stats.structured_data })
            }
          } catch (error) {
            console.warn('Failed to fetch visualization data:', error)
          }
        }
      } catch (error) {
        console.error('Failed to fetch surgery data:', error)
        showToast(t('mobile.surgeryVisualization.loadFailed'))
      } finally {
        loading.value = false
      }
    }

    const getSegmentStyle = (segment) => {
      if (!surgeryData.value?.start_time || !surgeryData.value?.end_time) return {}
      const start = new Date(surgeryData.value.start_time)
      const end = new Date(surgeryData.value.end_time)
      const totalDuration = end - start
      if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        return { left: '0%', width: '100%' }
      }

      const segmentStartRaw = segment.start_time || segment.start || segment.install_time
      const segmentEndRaw = segment.end_time || segment.end || segment.remove_time || segmentStartRaw
      const segmentStart = new Date(segmentStartRaw || start)
      const segmentEnd = new Date(segmentEndRaw || segmentStartRaw || end)
      const safeStart = Number.isNaN(segmentStart.getTime()) ? start.getTime() : segmentStart.getTime()
      const safeEnd = Number.isNaN(segmentEnd.getTime()) ? safeStart + 5 * 60 * 1000 : segmentEnd.getTime()

      const leftPercent = ((safeStart - start.getTime()) / totalDuration) * 100
      const widthPercent = ((safeEnd - safeStart) / totalDuration) * 100
      const clampedLeft = Math.max(0, Math.min(100, leftPercent))
      const maxWidth = Math.max(6, Math.min(100 - clampedLeft, widthPercent))

      return {
        left: `${clampedLeft}%`,
        width: `${maxWidth}%`
      }
    }

    const getEventsForCell = (cellIndex) => {
      if (!timelineStartDate.value) return []
      const cellStart = new Date(timelineStartDate.value.getTime() + cellIndex * 60 * 60 * 1000)
      const cellEnd = new Date(cellStart.getTime() + 60 * 60 * 1000)
      return timelineEvents.value.filter(event => {
        const eventDate = new Date(event.time)
        if (Number.isNaN(eventDate.getTime())) return false
        if (cellIndex === timelineCells.value - 1) {
          return eventDate >= cellStart && eventDate <= cellEnd
        }
        return eventDate >= cellStart && eventDate < cellEnd
      })
    }

    const getEventDotClass = (type) => {
      if (type === 'power_on' || type === 'power_off') return 'event-dot-power'
      if (type === 'surgery_start' || type === 'surgery_end') return 'event-dot-surgery'
      if (type === 'previous_end') return 'event-dot-previous'
      return 'event-dot-default'
    }

    onMounted(async () => {
      if (!surgeryId) {
        showToast(t('mobile.surgeryVisualization.surgeryIdRequired'))
        router.back()
        return
      }
      const loadedFromSession = loadFromSession()
      if (!loadedFromSession) {
        await fetchSurgeryData()
      }
    })

    return {
      surgeryData,
      armsData,
      loading,
      activeTab,
      primaryTabs,
      secondaryTabs,
      displaySurgeryId,
      procedureName,
      startTimeDisplay,
      endTimeDisplay,
      totalDuration,
      legendItems,
      timelineMarks,
      timelineCells,
      faultRows,
      visibleFaultRows,
      hasAlerts,
      faultSummary,
      showAllFaults,
      toggleFaultRows,
      formatDisplayTime,
      operationSummaryRows,
      hasOperationSummary,
      instrumentUsageRows,
      hasInstrumentUsage,
      stateMachineSeries,
      hasStateMachine,
      networkLatencySeries,
      hasNetworkLatency,
      getSegmentStyle,
      getEventsForCell,
      getEventDotClass
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100%;
  background-color: #f7f8fa;
  padding-top: 46px;
  box-sizing: border-box;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 12px 24px;
}

.info-card {
  background-color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.info-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-title {
  font-size: 16px;
  font-weight: 600;
  color: #101828;
  line-height: 24px;
}

.info-subtitle {
  font-size: 12px;
  color: #4a5565;
  line-height: 16px;
}

.info-divider {
  width: 100%;
  height: 1px;
  background-color: rgba(0, 0, 0, 0.08);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

.info-grid-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-grid-label {
  font-size: 12px;
  color: #6a7282;
}

.info-grid-value {
  font-size: 12px;
  color: #101828;
  font-weight: 500;
}

.tab-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tab-row {
  display: flex;
  background-color: #ececf0;
  border-radius: 14px;
  padding: 4px;
  gap: 4px;
}

.tab-button {
  flex: 1;
  border: none;
  border-radius: 12px;
  background: transparent;
  font-size: 12px;
  color: #4a5565;
  line-height: 16px;
  padding: 8px 4px;
  font-weight: 500;
}

.tab-button.active {
  background-color: #fff;
  color: #101828;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
}

.gantt-card {
  background-color: #fff;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gantt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gantt-title {
  font-size: 14px;
  font-weight: 600;
  color: #101828;
}

.gantt-duration {
  font-size: 12px;
  color: #6a7282;
}

.gantt-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 12px;
}

.timeline-label {
  font-size: 12px;
  color: #4a5565;
  font-weight: 500;
}

.timeline-axis {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #4a5565;
}

.timeline-grid {
  display: flex;
  align-items: stretch;
  border-radius: 12px;
  overflow: hidden;
  background: #f4f5f7;
}

.timeline-grid-label {
  width: 64px;
  background: #f9fafb;
  border-right: 1px solid #d1d5dc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #364153;
  padding: 8px;
}

.timeline-grid-body {
  flex: 1;
  display: grid;
  min-height: 32px;
  border-left: 1px solid #d1d5dc;
}

.timeline-grid-cell {
  position: relative;
  border-right: 1px solid #d1d5dc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
}

.timeline-grid-cell:last-child {
  border-right: none;
}

.timeline-event-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.timeline-event {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #4a5565;
}

.event-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #9ca3af;
  flex-shrink: 0;
}

.event-dot-power {
  background-color: #2b7fff;
}

.event-dot-surgery {
  background-color: #fb2c36;
}

.event-dot-previous {
  background-color: #7c3aed;
}

.event-dot-default {
  background-color: #9ca3af;
}

.event-label {
  font-size: 10px;
  color: #4a5565;
}

.arm-track {
  display: flex;
  min-height: 44px;
  align-items: stretch;
}

.arm-track + .arm-track {
  border-top: 1px solid #f1f2f4;
}

.arm-track-label {
  width: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #364153;
  background: #f9fafb;
  border-right: 1px solid #f1f2f4;
  padding: 0 8px;
}

.arm-track-body {
  flex: 1;
  position: relative;
  min-height: 44px;
}

.arm-segment {
  position: absolute;
  top: 10px;
  height: 24px;
  border-radius: 12px;
  font-size: 10px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 12px 4px 4px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4a5565;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-flex;
}

.legend-incision {
  background-color: #2b7fff;
}

.legend-node {
  background-color: #fb2c36;
}

.legend-test {
  background-color: #00a63e;
}

.legend-scope {
  background-color: #ff6900;
}

.legend-general {
  background-color: #ff6467;
}

.placeholder-card {
  background-color: #fff;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  padding: 24px 12px;
}

.loading-state {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.one-line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arm-segment-incision {
  background-color: #2b7fff;
}

.arm-segment-test {
  background-color: #00a63e;
}

.arm-segment-scope {
  background-color: #ff6900;
}

.arm-segment-general {
  background-color: #ff6467;
}

.section-card {
  background-color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.chart-card {
  padding: 12px 12px 16px;
}

.state-machine-card {
  padding: 0;
}

.state-machine-card .section-header {
  padding: 16px 20px 0;
}

.section-header {
  font-size: 14px;
  font-weight: 600;
  color: #101828;
}

.table {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-row {
  display: grid;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #364153;
}

.table-header {
  font-weight: 600;
  color: #101828;
  background-color: #f4f5f7;
  border-radius: 10px;
  padding: 8px 12px;
}

.table-alerts .table-row {
  grid-template-columns: 1.4fr 0.8fr 2.2fr 1fr;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f9fafb;
}

.table-alerts .table-row:nth-child(even):not(.table-header) {
  background: #f3f4f6;
}

.table-operations .table-row {
  grid-template-columns: 2fr 0.8fr;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f9fafb;
}

.table-operations .table-row:nth-child(even):not(.table-header) {
  background: #f3f4f6;
}

.table-instruments .table-row {
  grid-template-columns: 0.8fr 1.2fr 1.4fr 1.5fr 1.5fr;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f9fafb;
}

.table-instruments .table-row:nth-child(even):not(.table-header) {
  background: #f3f4f6;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  font-weight: 500;
}

.status-processed {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.status-unprocessed {
  background: rgba(234, 88, 12, 0.16);
  color: #c2410c;
}

.toggle-button {
  align-self: center;
  background: none;
  border: none;
  color: #2563eb;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.toggle-button:active {
  opacity: 0.7;
}

.summary-text {
  font-size: 12px;
  color: #4a5565;
  text-align: center;
}

.align-right {
  text-align: right;
}

.table .cell.time {
  font-size: 11px;
  color: #6a7282;
}

.table .cell.code {
  font-weight: 600;
}

.table .cell.message {
  color: #364153;
}

.state-machine-card {
  gap: 16px;
}

.chart-card :deep(.mobile-chart) {
  width: 100%;
  margin: 0;
}

@media (max-width: 480px) {
  .table-instruments .table-row {
    grid-template-columns: 0.7fr 1fr 1.2fr 1.4fr 1.4fr;
    gap: 6px;
    padding: 8px;
  }
  .table-alerts .table-row {
    grid-template-columns: 1.2fr 0.8fr 1.8fr 1fr;
    padding: 8px;
  }
}

</style>

