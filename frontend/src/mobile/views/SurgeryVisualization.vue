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
      <div class="metrics-strip">
        <div class="strip-header">
          <div class="strip-id">{{ displaySurgeryId }}</div>
          <button v-if="canOpenTimeline" type="button" class="overview-icon-btn" @click="openTimelineView" aria-label="查看Overview">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <line x1="9" y1="4" x2="9" y2="8" />
              <line x1="14" y1="10" x2="14" y2="14" />
              <line x1="7" y1="16" x2="7" y2="20" />
            </svg>
            <span>Overview</span>
          </button>
        </div>
        <div class="strip-metrics">
          <span class="strip-item">开始时间：{{ startTimeMetric }}</span>
          <span class="strip-item">结束时间：{{ endTimeMetric }}</span>
          <span class="strip-item">器械使用数：{{ totalInstrumentCount }}</span>
          <span class="strip-item">安全报警数量：{{ faultSummary.total }}</span>
          <span class="strip-item">平均网络延时：{{ hasNetworkLatency ? formatNetworkLatency(averageNetworkLatency) : '-' }}</span>
          <span class="strip-item">手术时长：{{ formatDuration(totalDuration) }}</span>
        </div>
      </div>

      <div class="tabbed-panel">
        <div class="tab-bar">
          <button
            v-for="tab in contentTabs"
            :key="tab.key"
            type="button"
            :class="['tab-button', { active: activeContentTab === tab.key }]"
            @click="switchContentTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <van-swipe
          ref="contentSwipeRef"
          class="tab-swipe"
          :loop="false"
          :show-indicators="false"
          @change="onContentSwipeChange"
        >
          <van-swipe-item>
            <div class="tab-panel-body">
              <div class="section-card stage-section-card">
                <div class="section-header">手术阶段</div>
                <template v-if="hasStageShare">
                  <div class="stage-panel-content">
                    <div class="stage-rose-shell">
                      <div ref="stageChartRef" class="stage-rose-chart" aria-label="手术阶段占比图"></div>
                    </div>
                    <div class="stage-fixed-info" v-if="selectedStageRow">
                      {{ selectedStageRow.label }}：{{ selectedStageRow.startLabel }} - {{ selectedStageRow.endLabel }}
                    </div>
                    <div class="stage-share-list">
                      <button
                        v-for="row in stageShareRows"
                        :key="`${row.key}-meta`"
                        type="button"
                        class="stage-share-item"
                        :class="{ active: selectedStageRow && selectedStageRow.key === row.key }"
                        @click="selectedStageKey = row.key"
                      >
                        <span class="stage-dot" :style="{ backgroundColor: row.color }"></span>
                        <span class="stage-name">{{ row.label }}</span>
                        <span class="stage-value">{{ row.percent }}%</span>
                      </button>
                    </div>
                  </div>
                </template>
                <div v-else class="placeholder-card">
                  <van-empty :description="$t('mobile.surgeryVisualization.noSurgeryPhaseData')" />
                </div>
              </div>
            </div>
          </van-swipe-item>

          <van-swipe-item>
            <div class="tab-panel-body">
              <div v-if="hasInstrumentUsage" class="section-card instrument-card">
                <div class="section-header">器械详情</div>
                <div class="instrument-cards">
                  <div v-for="armGroup in instrumentUsageRows" :key="armGroup.id" class="instrument-card-item">
                    <div class="instrument-card-header" @click="toggleCard(armGroup.id)">
                      <div class="instrument-card-title">
                        <span class="instrument-arm-badge">{{ armGroup.armLabel }}</span>
                        <span class="instrument-count">{{ armGroup.instrumentTypes.join('、') }}</span>
                      </div>
                      <span :class="['instrument-expand-icon', { expanded: isCardExpanded(armGroup.id) }]">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </span>
                    </div>
                    <div v-show="isCardExpanded(armGroup.id)" class="instrument-card-body">
                      <div class="instrument-grid">
                        <div v-for="instrument in armGroup.instruments" :key="instrument.id" class="instrument-item">
                        <div class="instrument-item-header">
                          <span class="instrument-type">{{ instrument.toolType }}</span>
                        </div>
                        <div class="instrument-item-details">
                          <div class="instrument-info-row">
                            <span class="instrument-info-label">{{ $t('mobile.surgeryVisualization.instrumentUdi') }}</span>
                            <span class="instrument-info-value">{{ instrument.udi }}</span>
                          </div>
                          <div class="instrument-info-row">
                            <span class="instrument-info-label">{{ $t('mobile.surgeryVisualization.instrumentInstall') }}</span>
                            <span class="instrument-info-value time">{{ formatDisplayTime(instrument.installTime) }}</span>
                          </div>
                          <div class="instrument-info-row">
                            <span class="instrument-info-label">{{ $t('mobile.surgeryVisualization.instrumentRemove') }}</span>
                            <span class="instrument-info-value time">{{ formatDisplayTime(instrument.removeTime) }}</span>
                          </div>
                          <div class="instrument-info-row">
                            <span class="instrument-info-label">激发次数</span>
                            <span class="instrument-info-value">{{ instrument.energySummary.activationCount }}次</span>
                          </div>
                          <div class="instrument-info-row">
                            <span class="instrument-info-label">总激发时长</span>
                            <span class="instrument-info-value">{{ instrument.energySummary.totalActivationDurationLabel }}</span>
                          </div>
                          <button
                            v-if="instrument.energySummary.activationCount > 0"
                            type="button"
                            class="energy-analysis-cta"
                            @click="openEnergyAnalysis(instrument)"
                          >
                            查看能量详情
                          </button>
                        </div>
                      </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="placeholder-card">
                <van-empty :description="$t('mobile.surgeryVisualization.noInstrumentData')" />
              </div>
            </div>
          </van-swipe-item>

          <van-swipe-item>
            <div class="tab-panel-body">
              <div v-if="hasOperationSummary" class="section-card">
                <div class="section-header">{{ $t('mobile.surgeryVisualization.operationSummary') }}</div>
                <div class="table table-operations">
                  <div class="table-row table-header">
                    <span>{{ $t('mobile.surgeryVisualization.operationType') }}</span>
                    <span class="align-right">{{ $t('mobile.surgeryVisualization.operationCount') }}</span>
                  </div>
                  <div v-for="row in operationSummaryRows" :key="row.key" class="table-row">
                    <span>{{ row.label }}</span>
                    <span class="align-right">{{ row.count }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="placeholder-card">
                <van-empty :description="$t('mobile.surgeryVisualization.noOperationData')" />
              </div>
            </div>
          </van-swipe-item>

          <van-swipe-item>
            <div class="tab-panel-body">
              <div v-if="hasAlerts" class="section-card">
                <div class="section-header">{{ $t('mobile.surgeryVisualization.alertsTitle') }}</div>
                <div class="alert-list">
                  <div
                    v-for="row in visibleFaultRows"
                    :key="`${row.errorCode}-${row.timestamp}`"
                    :class="['alert-card-item', row.statusKey === 'unprocessed' ? 'alert-card-unprocessed' : 'alert-card-processed']"
                  >
                    <div class="alert-card-header">
                      <span class="alert-card-time">{{ formatDisplayTime(row.timestamp) }}</span>
                      <span :class="['alert-card-status', row.statusKey === 'processed' ? 'status-processed' : 'status-unprocessed']">
                        {{ row.statusLabel }}
                      </span>
                    </div>
                    <div class="alert-card-code">{{ row.errorCode }}</div>
                    <div class="alert-card-message">
                      <div v-if="faultExplanationLoading.has(row.rowKey)" class="explanation-loading">
                        <van-loading type="spinner" size="14px" vertical />
                        <span>{{ $t('shared.loading') }}</span>
                      </div>
                      <div v-else-if="faultExplanations.has(row.rowKey)">
                        {{ faultExplanations.get(row.rowKey) }}
                      </div>
                      <div v-else>{{ row.message }}</div>
                    </div>
                  </div>
                </div>
                <button v-if="faultRows.length > 5" type="button" class="toggle-button" @click="toggleFaultRows">
                  {{ showAllFaults ? $t('mobile.surgeryVisualization.collapse') : $t('mobile.surgeryVisualization.expand') }}
                </button>
                <div class="summary-text">
                  {{ $t('mobile.surgeryVisualization.alertSummary', { total: faultSummary.total, processed: faultSummary.processed, unprocessed: faultSummary.unprocessed }) }}
                </div>
              </div>
              <div v-else class="placeholder-card">
                <van-empty :description="$t('mobile.surgeryVisualization.noAlertData')" />
              </div>
            </div>
          </van-swipe-item>

          <van-swipe-item>
            <div class="tab-panel-body">
              <div v-if="hasNetworkLatency" class="section-card chart-card">
                <div class="section-header">{{ $t('mobile.surgeryVisualization.networkLatencyChartTitle') }}</div>
                <network-latency-chart
                  :data="networkLatencySeries"
                  :height="280"
                  time-mask="HH:mm"
                  :time-tick-count="5"
                  :value-tick-count="5"
                  :normal-threshold="110"
                  :warning-threshold="1000"
                />
              </div>
              <div v-else class="placeholder-card">
                <van-empty :description="$t('mobile.surgeryVisualization.noNetworkData')" />
              </div>
            </div>
          </van-swipe-item>
        </van-swipe>
      </div>

      <van-popup
        v-model:show="energyAnalysisPopupVisible"
        position="bottom"
        round
        class="energy-analysis-popup"
        :style="{ height: '76vh' }"
      >
        <div class="energy-analysis-sheet">
          <div class="energy-analysis-sheet-header">
            <div class="energy-analysis-sheet-title">{{ selectedInstrumentForEnergy?.toolType || '-' }}</div>
            <div class="energy-analysis-sheet-subtitle">UDI: {{ selectedInstrumentForEnergy?.udi || '-' }}</div>
          </div>
          <div class="energy-analysis-segmented">
            <button
              v-for="tab in energyAnalysisTabs"
              :key="tab.key"
              type="button"
              :class="['energy-analysis-segment', { active: activeEnergyAnalysisTab === tab.key }]"
              @click="activeEnergyAnalysisTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          <div class="energy-analysis-sheet-body">
            <div v-if="activeEnergyAnalysisTab === 'density'" class="energy-analysis-view">
              <energy-density-chart
                v-if="selectedInstrumentEnergyDensity.numBuckets > 0"
                :density-data="selectedInstrumentEnergyDensity"
              />
              <van-empty v-else description="暂无能量激发数据" />
            </div>
            <div v-else-if="activeEnergyAnalysisTab === 'duration'" class="energy-analysis-view">
              <duration-histogram-chart
                v-if="selectedInstrumentDurationHistogram.n > 0"
                :histogram-data="selectedInstrumentDurationHistogram"
              />
              <van-empty v-else description="暂无持续时间数据" />
            </div>
            <div v-else class="energy-analysis-view">
              <div v-if="selectedInstrumentEnergyDetails.length > 0" class="energy-detail-table">
                <div class="energy-detail-row energy-detail-header">
                  <span>开始</span>
                  <span>结束</span>
                  <span>类型</span>
                  <span>Active</span>
                  <span>GripsActive</span>
                  <span>Duration</span>
                </div>
                <div
                  v-for="row in selectedInstrumentEnergyDetails"
                  :key="row.key"
                  class="energy-detail-row"
                >
                  <span>{{ row.startLabel }}</span>
                  <span>{{ row.endLabel }}</span>
                  <span>{{ row.typeLabel }}</span>
                  <span>{{ row.activeLabel }}</span>
                  <span>{{ row.gripsActiveLabel }}</span>
                  <span>{{ row.durationLabel }}</span>
                </div>
              </div>
              <van-empty v-else description="暂无能量激发明细" />
            </div>
          </div>
        </div>
      </van-popup>

      <van-loading v-if="loading" class="loading-state" />
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import * as echarts from 'echarts'
import {
  NavBar as VanNavBar,
  Empty as VanEmpty,
  Loading as VanLoading,
  Popup as VanPopup,
  Swipe as VanSwipe,
  SwipeItem as VanSwipeItem
} from 'vant'
import api from '@/api'
import NetworkLatencyChart from '@/components/NetworkLatencyChart.vue'
import EnergyDensityChart from '@/components/EnergyDensityChart.vue'
import DurationHistogramChart from '@/components/DurationHistogramChart.vue'
import { normalizeSurgeryData } from '@/utils/visualizationConfig'
import { adaptSurgeryData, validateAdaptedData, getDataSourceType } from '@/utils/surgeryDataAdapter'
import { resolveInstrumentTypeLabel } from '@/utils/analysisMappings'

const SEGMENT_COLOR_ORDER = ['incision', 'test', 'scope', 'general']
const DRAWER_DENSITY_BUCKET_MS = 10000
const HISTOGRAM_BIN_MS = 100
const ENERGY_DENSITY_HEATMAP_ROW_ORDER = [
  { closure: 'clamped', typeKey: 'bipolar-coag' },
  { closure: 'clamped', typeKey: 'monopolar-cut' },
  { closure: 'clamped', typeKey: 'ultrasonic' },
  { closure: 'unclamped', typeKey: 'bipolar-coag' },
  { closure: 'unclamped', typeKey: 'monopolar-cut' },
  { closure: 'unclamped', typeKey: 'ultrasonic' }
]

export default {
  name: 'MSurgeryVisualization',
  components: {
    'van-nav-bar': VanNavBar,
    'van-empty': VanEmpty,
    'van-loading': VanLoading,
    'van-popup': VanPopup,
    'van-swipe': VanSwipe,
    'van-swipe-item': VanSwipeItem,
    'network-latency-chart': NetworkLatencyChart,
    'energy-density-chart': EnergyDensityChart,
    'duration-histogram-chart': DurationHistogramChart,
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t, locale } = useI18n()
    
    const getInstrumentLabel = (value) => {
      const label = resolveInstrumentTypeLabel(value)
      if (label) return label
      if (value === null || value === undefined || value === '') return '-'
      return typeof value === 'string' ? value : String(value)
    }

    const rawToSeconds = (raw) => {
      const value = Number(raw)
      return Number.isFinite(value) ? value / 10 : 0
    }

    const formatEnergyDurationMs = (sec) => {
      const value = Number(sec)
      if (!Number.isFinite(value) || value < 0) return '0 ms'
      return `${Math.round(value * 1000)} ms`
    }

    const formatDateTimeWithMs = (timestampMs) => {
      if (!Number.isFinite(timestampMs)) return '-'
      const date = new Date(timestampMs)
      if (Number.isNaN(date.getTime())) return '-'
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      const minute = String(date.getMinutes()).padStart(2, '0')
      const second = String(date.getSeconds()).padStart(2, '0')
      const ms = String(date.getMilliseconds()).padStart(3, '0')
      return `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`
    }

    const formatEnergyType = (typeRaw) => {
      const normalized = String(typeRaw || '').toLowerCase().trim()
      const map = {
        cut: '切割',
        coag: '凝血',
        bipolar: '双极',
        ultrasonic: '超声',
        ultrasonicmax: '超声(最大)'
      }
      if (!normalized) return '其他'
      return map[normalized] || (typeRaw ? String(typeRaw) : '其他')
    }

    const getEnergyEventTypeKey = (type) => {
      const normalized = String(type || '').toLowerCase().trim()
      if (normalized === 'cut') return 'monopolar-cut'
      if (normalized === 'coag' || normalized === 'bipolar') return 'bipolar-coag'
      if (normalized === 'ultrasonic' || normalized === 'ultrasonicmax') return 'ultrasonic'
      return 'other'
    }

    const getEnergyEventDurationSec = (evt) => {
      if (!evt || typeof evt !== 'object') return 0
      const candidatesInSeconds = [evt.duration_sec, evt.duration]
      for (const candidate of candidatesInSeconds) {
        const value = Number(candidate)
        if (Number.isFinite(value) && value >= 0) return value
      }

      const durationMs = Number(evt.duration_ms)
      if (Number.isFinite(durationMs) && durationMs >= 0) return durationMs / 1000

      const activeSec = rawToSeconds(evt.active ?? evt.Active ?? evt.GripsActive ?? evt.gripsActive)
      if (activeSec > 0) return activeSec

      const startMs = parseTimestamp(evt.start ?? evt.start_time)
      const endMs = parseTimestamp(evt.end ?? evt.end_time)
      if (startMs !== null && endMs !== null && endMs >= startMs) {
        return (endMs - startMs) / 1000
      }
      return 0
    }

    const getTotalActiveSecForDensity = (evt, startMs, endMs) => {
      if (evt.duration_sec != null && evt.duration_sec !== '') {
        const sec = Number(evt.duration_sec)
        if (Number.isFinite(sec) && sec > 0) return sec
      }
      if (evt.duration != null && evt.duration !== '') {
        const sec = Number(evt.duration)
        if (Number.isFinite(sec) && sec > 0) return sec
      }
      if (evt.duration_ms != null && evt.duration_ms !== '') {
        const ms = Number(evt.duration_ms)
        if (Number.isFinite(ms) && ms > 0) return ms / 1000
      }
      const activeSec = rawToSeconds(evt.active ?? evt.Active ?? 0)
      if (activeSec > 0) return activeSec
      return Math.max(0.001, (endMs - startMs) / 1000)
    }

    const buildInstrumentEnergySummary = (energyActivation, installTime, removeTime) => {
      const sourceEvents = Array.isArray(energyActivation) ? energyActivation : []
      const events = sourceEvents
        .filter(evt => evt && typeof evt === 'object')
        .map((evt, index) => {
          const startMs = parseTimestamp(evt.start ?? evt.start_time)
          if (!Number.isFinite(startMs)) return null
          let endMs = parseTimestamp(evt.end ?? evt.end_time)
          if (!Number.isFinite(endMs)) {
            endMs = startMs + (getEnergyEventDurationSec(evt) * 1000)
          }
          if (!Number.isFinite(endMs) || endMs <= startMs) endMs = startMs + 1
          const activeSec = getTotalActiveSecForDensity(evt, startMs, endMs)
          const gripsActiveSec = rawToSeconds(evt.GripsActive ?? evt.gripsActive ?? 0)
          const durationSec = getEnergyEventDurationSec(evt)
          return {
            key: `evt-${index}-${startMs}`,
            startMs,
            endMs,
            typeLabel: formatEnergyType(evt.type),
            typeKey: getEnergyEventTypeKey(evt.type),
            activeSec,
            gripsActiveSec,
            durationSec,
            startLabel: formatDateTimeWithMs(startMs),
            endLabel: formatDateTimeWithMs(endMs),
            activeLabel: formatEnergyDurationMs(activeSec),
            gripsActiveLabel: formatEnergyDurationMs(gripsActiveSec),
            durationLabel: formatEnergyDurationMs(durationSec)
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.startMs - b.startMs)

      const activationCount = events.length
      const totalActivationDurationSec = events.reduce((sum, evt) => sum + Math.max(0, evt.activeSec || 0), 0)

      let rangeStart = parseTimestamp(installTime)
      let rangeEnd = parseTimestamp(removeTime)
      if (!Number.isFinite(rangeStart)) rangeStart = events.length > 0 ? events[0].startMs : NaN
      if (!Number.isFinite(rangeEnd)) rangeEnd = events.length > 0 ? events[events.length - 1].endMs : NaN
      if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
        rangeStart = events.length > 0 ? Math.min(...events.map(evt => evt.startMs)) : NaN
        rangeEnd = events.length > 0 ? Math.max(...events.map(evt => evt.endMs)) : NaN
      }

      let density = { heatmap: true, rowLabels: [], matrix: [], numBuckets: 0, bucketMs: DRAWER_DENSITY_BUCKET_MS }
      if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeEnd > rangeStart) {
        const spanMs = rangeEnd - rangeStart
        const numBuckets = Math.ceil(spanMs / DRAWER_DENSITY_BUCKET_MS)
        const matrix = Array.from({ length: ENERGY_DENSITY_HEATMAP_ROW_ORDER.length }, () => new Array(numBuckets).fill(0))
        events.forEach(({ startMs, endMs, typeKey, activeSec, gripsActiveSec }) => {
          const totalSec = activeSec > 0 ? activeSec : 0.001
          const clampRatio = Math.max(0, Math.min(1, Math.max(0, gripsActiveSec) / totalSec))
          const unclampRatio = 1 - clampRatio
          const b0 = Math.floor((startMs - rangeStart) / DRAWER_DENSITY_BUCKET_MS)
          const b1 = Math.ceil((endMs - rangeStart) / DRAWER_DENSITY_BUCKET_MS)
          for (let i = Math.max(0, b0); i < Math.min(numBuckets, b1); i++) {
            const bucketStart = rangeStart + i * DRAWER_DENSITY_BUCKET_MS
            const bucketEnd = bucketStart + DRAWER_DENSITY_BUCKET_MS
            const overlapMs = Math.max(0, Math.min(endMs, bucketEnd) - Math.max(startMs, bucketStart))
            const rowIdxClamped = ENERGY_DENSITY_HEATMAP_ROW_ORDER.findIndex(row => row.closure === 'clamped' && row.typeKey === typeKey)
            const rowIdxUnclamped = ENERGY_DENSITY_HEATMAP_ROW_ORDER.findIndex(row => row.closure === 'unclamped' && row.typeKey === typeKey)
            if (rowIdxClamped >= 0) matrix[rowIdxClamped][i] += (overlapMs / 1000) * clampRatio
            if (rowIdxUnclamped >= 0) matrix[rowIdxUnclamped][i] += (overlapMs / 1000) * unclampRatio
          }
        })
        const bucketSec = DRAWER_DENSITY_BUCKET_MS / 1000
        const intensitiesMatrix = matrix.map(row => row.map(sum => Math.min(1, sum / bucketSec)))
        const rowLabels = []
        const matrixWithSpacer = []
        const spacerRow = new Array(numBuckets).fill(-1)
        ENERGY_DENSITY_HEATMAP_ROW_ORDER.forEach((row, idx) => {
          if (idx === 3) {
            rowLabels.push({ spacer: true })
            matrixWithSpacer.push([...spacerRow])
          }
          rowLabels.push({
            closure: row.closure === 'clamped' ? '闭合' : '非闭合',
            type: row.typeKey === 'bipolar-coag' ? '双极凝血' : (row.typeKey === 'monopolar-cut' ? '单极切割' : '超声')
          })
          matrixWithSpacer.push(intensitiesMatrix[idx])
        })
        density = {
          heatmap: true,
          rowLabels,
          matrix: matrixWithSpacer,
          numBuckets,
          bucketMs: DRAWER_DENSITY_BUCKET_MS,
          startMs: rangeStart,
          endMs: rangeEnd
        }
      }

      const durationsMs = events.map(evt => {
        if (evt.gripsActiveSec > 0) return Math.round(evt.gripsActiveSec * 1000)
        if (evt.activeSec > 0) return Math.round(evt.activeSec * 1000)
        return Math.round(Math.max(0, evt.durationSec || 0) * 1000)
      })
      let histogram = { binCenters: [], counts: [], median: null, p90: null, p95: null, n: 0 }
      if (durationsMs.length > 0) {
        const maxMs = Math.max(...durationsMs)
        const numBins = Math.max(1, Math.ceil((maxMs + 1) / HISTOGRAM_BIN_MS))
        const binCenters = Array.from({ length: numBins }, (_, i) => (i + 0.5) * HISTOGRAM_BIN_MS)
        const counts = Array(numBins).fill(0)
        durationsMs.forEach(ms => {
          const binIndex = Math.min(Math.floor(ms / HISTOGRAM_BIN_MS), numBins - 1)
          counts[binIndex]++
        })
        const sorted = [...durationsMs].sort((a, b) => a - b)
        const n = sorted.length
        const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        const p90 = sorted[Math.min(Math.max(0, Math.ceil(n * 0.9) - 1), n - 1)]
        const p95 = sorted[Math.min(Math.max(0, Math.ceil(n * 0.95) - 1), n - 1)]
        histogram = { binCenters, counts, median, p90, p95, n, binWidth: HISTOGRAM_BIN_MS, xMax: numBins * HISTOGRAM_BIN_MS }
      }

      return {
        activationCount,
        totalActivationDurationSec,
        totalActivationDurationLabel: formatEnergyDurationMs(totalActivationDurationSec),
        density,
        histogram,
        details: events
      }
    }

    const surgeryId = route.params?.surgeryId || route.query?.surgeryId || ''
    const surgeryData = ref(null)
    const armsData = ref([])
    const loading = ref(false)
    const timelineEvents = ref([])
    const contentSwipeRef = ref(null)
    const contentTabs = [
      { key: 'stages', label: '手术阶段' },
      { key: 'instruments', label: '器械详情' },
      { key: 'operations', label: '操作汇总' },
      { key: 'alerts', label: '安全报警' },
      { key: 'network', label: '网络延时' }
    ]
    const stageChartRef = ref(null)
    const selectedStageKey = ref('')
    let stageChartInstance = null
    let stageChartResizeObserver = null
    const activeContentTab = ref(contentTabs[0].key)
    const energyAnalysisPopupVisible = ref(false)
    const selectedInstrumentForEnergy = ref(null)
    const energyAnalysisTabs = [
      { key: 'density', label: '能量激发密度图' },
      { key: 'duration', label: '持续时间分布图' },
      { key: 'details', label: '能量激发明细表' }
    ]
    const activeEnergyAnalysisTab = ref(energyAnalysisTabs[0].key)

    const switchContentTab = (tabKey) => {
      const targetIndex = contentTabs.findIndex(tab => tab.key === tabKey)
      if (targetIndex < 0) return
      activeContentTab.value = tabKey
      contentSwipeRef.value?.swipeTo?.(targetIndex, { immediate: true })
    }

    const onContentSwipeChange = (index) => {
      const tab = contentTabs[index]
      if (tab) {
        activeContentTab.value = tab.key
      }
    }

    const canOpenTimeline = computed(() => {
      const hasId = !!(surgeryId || surgeryData.value?.surgery_id)
      const hasData = !!surgeryData.value
      const hasTimeline = timelineEvents.value.length > 0
      const hasArms = Array.isArray(surgeryData.value?.arms) && surgeryData.value.arms.some(a => Array.isArray(a.instrument_usage) && a.instrument_usage.length > 0)
      return hasId && hasData && (hasTimeline || hasArms)
    })

    const openTimelineView = () => {
      const id = surgeryData.value?.surgery_id || surgeryId
      if (!id) return
      router.push({ name: 'MSurgeryTimeline', params: { surgeryId: id } })
    }

    const displaySurgeryId = computed(() => surgeryData.value?.surgery_id || surgeryId || '-')

    const formatMetricTime = (time) => {
      if (!time) return '-'
      const date = new Date(time)
      if (Number.isNaN(date.getTime())) return '-'
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}`
    }

    const startTimeMetric = computed(() => formatMetricTime(surgeryData.value?.start_time))
    const endTimeMetric = computed(() => formatMetricTime(surgeryData.value?.end_time))

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

    // 从完整故障码中解析子系统和代码（参考日志上传逻辑）
    const parseErrorCode = (errorCodeStr) => {
      if (!errorCodeStr || typeof errorCodeStr !== 'string') {
        return { subsystem: null, code: null }
      }
      
      // 如果故障码长度至少为5位，提取首位作为子系统，后4位作为代码
      if (errorCodeStr.length >= 5) {
        const subsystem = errorCodeStr.charAt(0).toUpperCase()
        // 验证子系统字符是否有效（1-9, A-F）
        if (/^[1-9A-F]$/.test(subsystem)) {
          const code = '0X' + errorCodeStr.slice(-4).toUpperCase()
          return { subsystem, code }
        }
      }
      
      return { subsystem: null, code: null }
    }
    
    // 故障码释义缓存
    const faultExplanations = ref(new Map())
    const faultExplanationLoading = ref(new Set())
    
    // 根据故障码获取释义（参考日志上传的解析逻辑）
    const getFaultExplanation = async (errorCode, param1, param2, param3, param4, subsystem) => {
      if (!errorCode || errorCode === '-') return null
      
      try {
        // 如果提供了子系统，直接使用；否则从故障码中解析
        let targetSubsystem = subsystem
        
        if (!targetSubsystem) {
          const parsed = parseErrorCode(errorCode)
          targetSubsystem = parsed.subsystem
        }
        
        // 构建预览请求载荷（lang 用于从 i18n_error_codes 获取对应语言的 explanation）
        const previewPayload = {
          code: errorCode,
          subsystem: targetSubsystem || undefined,
          param1: param1 || undefined,
          param2: param2 || undefined,
          param3: param3 || undefined,
          param4: param4 || undefined,
          lang: locale?.value || undefined
        }
        
        // 调用释义预览接口（返回 explanation、prefix 已翻译、prefix_raw 原文）
        const resp = await api.explanations.preview(previewPayload)
        const explanation = resp?.data?.explanation
        const prefix = resp?.data?.prefix
        const prefixRaw = resp?.data?.prefix_raw
        
        if (explanation) {
          // 若有翻译后的 prefix，用其替换 explanation 中的原文前缀后组合显示
          if (prefix && prefixRaw && String(explanation).startsWith(prefixRaw)) {
            const body = String(explanation).slice(prefixRaw.length).replace(/^\s+/, '')
            return body ? `${prefix} ${body}` : prefix
          }
          return explanation
        }
        
        return null
      } catch (error) {
        console.warn(`⚠️ 获取故障码 ${errorCode} 的释义失败:`, error)
        return null
      }
    }
    
    // 为故障行加载释义
    const loadFaultExplanations = async () => {
      const rows = faultRows.value
      
      for (const row of rows) {
        const rowKey = row.rowKey
        
        // 如果正在加载或已有释义，跳过
        if (faultExplanationLoading.value.has(rowKey) || faultExplanations.value.has(rowKey)) {
          continue
        }
        
        // 如果已经有message且不是默认值，跳过
        if (row.message && row.message !== '-' && row.message !== t('mobile.surgeryVisualization.noExplanation')) {
          continue
        }
        
        faultExplanationLoading.value.add(rowKey)
        try {
          const explanation = await getFaultExplanation(
            row.errorCode,
            row.param1,
            row.param2,
            row.param3,
            row.param4,
            row.subsystem
          )
          
          if (explanation) {
            faultExplanations.value.set(rowKey, explanation)
          }
        } catch (error) {
          console.warn(`⚠️ 加载故障码 ${row.errorCode} 释义失败:`, error)
        } finally {
          faultExplanationLoading.value.delete(rowKey)
        }
      }
    }

    const faultRows = computed(() => {
      const faults = surgeryData.value?.surgery_stats?.faults
      if (!Array.isArray(faults)) return []
      return faults
        .map(fault => {
          const timestamp = fault.timestamp || fault.time || fault.created_at
          const status = resolveFaultStatus(fault)
          const errorCode = fault.error_code || fault.code || '-'
          
          // 解析故障码获取子系统信息
          const parsed = parseErrorCode(errorCode)
          
          // 生成唯一标识用于存储释义
          const rowKey = `${errorCode}_${timestamp}_${parsed.subsystem || ''}`
          
          return {
            timestamp,
            errorCode,
            message: fault.explanation || fault.message || '-',
            statusKey: status.key,
            statusLabel: status.label,
            // 添加释义相关字段
            rowKey,
            subsystem: parsed.subsystem || fault.subsystem || null,
            param1: fault.param1 || null,
            param2: fault.param2 || null,
            param3: fault.param3 || null,
            param4: fault.param4 || null
          }
        })
        .filter(item => item.errorCode && item.timestamp)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    })
    
    // 监听faultRows变化，自动加载释义
    watch(faultRows, (newRows) => {
      if (newRows.length > 0) {
        loadFaultExplanations()
      }
    }, { immediate: true })

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
      const groupedArms = []
      arms.forEach((arm, armIndex) => {
        const usageList = Array.isArray(arm.instrument_usage) ? arm.instrument_usage : []
        if (usageList.length === 0) return
        
        const armId = arm.arm_id || arm.armId || armIndex + 1
        const armIndexForDisplay = typeof armId === 'number' ? armId : (armIndex + 1)
        const armLabelFormatted = t('mobile.surgeryVisualization.armFallback', { index: armIndexForDisplay })
        
        const instruments = usageList.map((usage, usageIndex) => {
          // 兼容多种字段命名：install_time/start_time, remove_time/end_time
          const install = usage.install_time || usage.start_time || usage.installTime || usage.startTime
          const remove = usage.remove_time || usage.end_time || usage.removeTime || usage.endTime
          const instrumentTypeRaw = (
            usage.tool_type ??
            usage.instrument_type ??
            usage.instrument_name ??
            usage.toolType ??
            usage.instrumentType ??
            usage.instrumentName
          )
          const instrumentType = instrumentTypeRaw === undefined || instrumentTypeRaw === null
            ? ''
            : (typeof instrumentTypeRaw === 'number' ? instrumentTypeRaw : String(instrumentTypeRaw).trim())
          // 兼容多种字段命名：tool_type/instrument_type/instrument_name（下划线）或 toolType/instrumentType/instrumentName（驼峰）
          const toolType = getInstrumentLabel(
            instrumentType
          )
          // 兼容多种UDI字段命名
          const udi = usage.udi || usage.udi_code || usage.udiCode || '-'
          const energyActivation = Array.isArray(usage.energy_activation) ? usage.energy_activation : []
          const energySummary = buildInstrumentEnergySummary(energyActivation, install, remove)
          return {
            id: `${armId}-${usageIndex}`,
            instrumentType,
            toolType: toolType || '-',
            udi: udi,
            installTime: install,
            removeTime: remove,
            energySummary
          }
        })
        
        // 获取所有器械类型（去重）
        const instrumentTypes = [...new Set(instruments.map(inst => inst.toolType).filter(type => type && type !== '-'))]
        
        groupedArms.push({
          id: `arm-${armId}`,
          armLabel: armLabelFormatted,
          armIndex: armIndexForDisplay,
          instruments,
          instrumentTypes: instrumentTypes.length > 0 ? instrumentTypes : ['-']
        })
      })
      return groupedArms
    })
    const hasInstrumentUsage = computed(() => instrumentUsageRows.value.length > 0)

    const openEnergyAnalysis = (instrument) => {
      selectedInstrumentForEnergy.value = instrument || null
      activeEnergyAnalysisTab.value = energyAnalysisTabs[0].key
      energyAnalysisPopupVisible.value = true
    }

    const selectedInstrumentEnergyDensity = computed(() => {
      return selectedInstrumentForEnergy.value?.energySummary?.density || { heatmap: true, rowLabels: [], matrix: [], numBuckets: 0, bucketMs: DRAWER_DENSITY_BUCKET_MS }
    })

    const selectedInstrumentDurationHistogram = computed(() => {
      return selectedInstrumentForEnergy.value?.energySummary?.histogram || { binCenters: [], counts: [], median: null, p90: null, p95: null, n: 0 }
    })

    const selectedInstrumentEnergyDetails = computed(() => {
      return selectedInstrumentForEnergy.value?.energySummary?.details || []
    })

    const parseTimestamp = (value) => {
      if (!value) return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      return date.getTime()
    }

    // 折叠/展开状态管理
    const expandedCards = ref(new Set())
    const toggleCard = (cardId) => {
      if (expandedCards.value.has(cardId)) {
        expandedCards.value.delete(cardId)
      } else {
        expandedCards.value.add(cardId)
      }
    }
    const isCardExpanded = (cardId) => expandedCards.value.has(cardId)

    const stageMeta = [
      { key: 'power_on_stage', label: '开机阶段', color: '#1890ff' },
      { key: 'positioning_stage', label: '定位阶段', color: '#52c41a' },
      { key: 'instrument_installation_stage', label: '器械安装', color: '#faad14' },
      { key: 'surgery_operation_stage', label: '手术操作', color: '#f5222d' },
      { key: 'withdrawal_stage', label: '撤离阶段', color: '#722ed1' },
      { key: 'power_off_stage', label: '关机阶段', color: '#595959' }
    ]

    const stageShareRows = computed(() => {
      const surgicalStage = surgeryData.value?.surgery_stats?.surgical_stage
      if (!surgicalStage || typeof surgicalStage !== 'object') return []
      const entries = stageMeta
        .map((meta) => {
          const stage = surgicalStage[meta.key]
          if (!stage || typeof stage !== 'object') return null
          const start = parseTimestamp(stage.start_time)
          const end = parseTimestamp(stage.end_time)
          let duration = 0
          if (start !== null && end !== null && end > start) {
            duration = end - start
          } else {
            const raw = Number(stage.total_duration)
            if (Number.isFinite(raw) && raw > 0) {
              duration = raw
            }
          }
          if (!(duration > 0)) return null
          return {
            key: meta.key,
            label: meta.label,
            color: meta.color,
            duration,
            startLabel: formatMetricTime(stage.start_time),
            endLabel: formatMetricTime(stage.end_time)
          }
        })
        .filter(Boolean)
      const total = entries.reduce((sum, item) => sum + item.duration, 0)
      if (total <= 0) return []
      return entries
        .map(item => ({ ...item, percent: Math.max(1, Math.round((item.duration / total) * 100)) }))
        .sort((a, b) => b.percent - a.percent)
    })
    const hasStageShare = computed(() => stageShareRows.value.length > 0)
    const selectedStageRow = computed(() => {
      const rows = stageShareRows.value
      if (!rows.length) return null
      return rows.find(row => row.key === selectedStageKey.value) || rows[0]
    })

    const updateStageChart = (retryCount = 0) => {
      const el = stageChartRef.value
      const rows = stageShareRows.value
      if (!el) return
      if (!rows.length) {
        if (stageChartInstance) {
          stageChartInstance.dispose()
          stageChartInstance = null
        }
        return
      }
      if (el.clientWidth <= 0 || el.clientHeight <= 0) {
        if (retryCount < 20) {
          window.setTimeout(() => updateStageChart(retryCount + 1), 60)
        }
        return
      }
      if (!stageChartInstance) {
        stageChartInstance = echarts.init(el)
      }
      const option = {
        tooltip: {
          show: false,
          trigger: 'item'
        },
        series: [{
          type: 'pie',
          radius: ['18%', '92%'],
          center: ['50%', '52%'],
          roseType: 'area',
          label: { show: false },
          labelLine: { show: false },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1
          },
          data: rows.map(row => ({
            name: row.label,
            value: row.duration,
            stageKey: row.key,
            itemStyle: { color: row.color }
          }))
        }]
      }
      stageChartInstance.setOption(option, true)
      stageChartInstance.off('click')
      stageChartInstance.on('click', (params) => {
        const key = params?.data?.stageKey
        if (key) selectedStageKey.value = key
      })
      stageChartInstance.resize()
    }

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

    // 计算关键指标
    const totalInstrumentCount = computed(() => {
      if (!hasInstrumentUsage.value) return 0
      // 收集所有器械的UDI，使用Set去重（相同UDI的器械算一把）
      const uniqueUdis = new Set()
      // 对于没有UDI的器械，按器械类型去重（相同类型算一把）
      const uniqueTypesWithoutUdi = new Set()
      instrumentUsageRows.value.forEach(arm => {
        arm.instruments.forEach(instrument => {
          const udi = instrument.udi
          // 统计有效的UDI（非空且不是'-'）
          if (udi && udi !== '-') {
            uniqueUdis.add(udi)
          } else {
            // 对于没有UDI或UDI为'-'的器械，按器械类型统计
            const toolType = instrument.toolType
            if (toolType && toolType !== '-') {
              uniqueTypesWithoutUdi.add(toolType)
            }
          }
        })
      })
      // 返回唯一UDI数量 + 没有UDI但类型不同的器械数量
      return uniqueUdis.size + uniqueTypesWithoutUdi.size
    })

    const averageNetworkLatency = computed(() => {
      if (!hasNetworkLatency.value || networkLatencySeries.value.length === 0) return 0
      const sum = networkLatencySeries.value.reduce((acc, point) => acc + (point[1] || 0), 0)
      return Math.round(sum / networkLatencySeries.value.length)
    })

    const formatDuration = (minutes) => {
      if (!minutes || minutes === 0) return `0${t('mobile.surgeryVisualization.minute')}`
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      const hourLabel = t('mobile.surgeryVisualization.hour')
      const minuteLabel = t('mobile.surgeryVisualization.minute')
      if (hours > 0 && mins > 0) {
        return `${hours}${hourLabel}${mins}${minuteLabel}`
      } else if (hours > 0) {
        return `${hours}${hourLabel}`
      } else {
        return `${mins}${minuteLabel}`
      }
    }

    const formatNetworkLatency = (latency) => {
      if (!latency || latency === 0) return '-'
      if (latency < 1000) {
        return `${latency}ms`
      } else {
        return `${(latency / 1000).toFixed(1)}s`
      }
    }

    const toggleFaultRows = () => {
      showAllFaults.value = !showAllFaults.value
    }


    const resolveSegmentColor = (segment, armIndex) => {
      if (!segment) return SEGMENT_COLOR_ORDER[armIndex % SEGMENT_COLOR_ORDER.length]
      
      // 兼容多种字段命名：instrument_name/tool_type（下划线）或 instrumentName/toolType（驼峰）
      // 确保值为字符串类型（可能是数字编码），然后再转换为小写
      const rawValue = segment.instrument_name || 
        segment.tool_type || 
        segment.instrumentName || 
        segment.toolType || 
        null
      
      // 安全转换为字符串，处理 null、undefined、数字等情况
      let rawName = ''
      if (rawValue !== null && rawValue !== undefined) {
        try {
          rawName = String(rawValue).toLowerCase()
        } catch (error) {
          console.warn('⚠️ 转换器械名称失败:', rawValue, error)
          rawName = ''
        }
      }
      
      // 如果已经是映射后的中文名称，直接匹配
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
      
      // 1. 开机事件和关机事件：使用 power_cycles 字段内的 on_time 和 off_time
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

      // 2. 手术开始和手术结束：使用 surgeries 表内的 start_time 和 end_time 字段
      const surgeryStart = data?.start_time
      const surgeryEnd = data?.end_time
      
      // 3. 上次手术结束时间（可选字段，用于时间线显示）
      const previousSurgeryEnd = timelineInfo.previousSurgeryEnd || data?.previous_surgery_end_time || data?.previous_end_time

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
      if (!raw) {
        console.warn('⚠️ applyVisualizationData: raw is null/undefined')
        return false
      }
      
      try {
        // 如果传入的数据已经是适配后的，直接使用；否则再次适配
        const adapted = raw._dataSource ? raw : (adaptSurgeryData(raw) || raw)
        
        if (adapted && validateAdaptedData(adapted)) {
          if (!adapted._dataSource) {
            adapted._dataSource = getDataSourceType(raw)
          }
          if (!adapted._originalData) {
            adapted._originalData = raw
          }
          
          sessionStorage.setItem('surgeryVizData', JSON.stringify(adapted))
          surgeryData.value = adapted
          
          try {
            const normalized = normalizeSurgeryData(adapted)
            armsData.value = enhanceSegments(normalized.arms || [])
            buildTimelineEvents(adapted)
          } catch (normalizeError) {
            console.error('❌ 数据规范化或增强失败:', normalizeError)
            console.error('  - Error stack:', normalizeError.stack)
            // 即使规范化失败，也尝试设置基本数据
            surgeryData.value = adapted
            armsData.value = []
            timelineEvents.value = []
          }
          
          return true
        }
        
        // 如果适配失败，尝试直接使用原始数据（降级处理）
        console.warn('⚠️ 适配数据验证失败，尝试使用原始数据')
        surgeryData.value = raw
        
        try {
          const normalized = normalizeSurgeryData(raw)
          armsData.value = enhanceSegments(normalized.arms || [])
          buildTimelineEvents(raw)
        } catch (normalizeError) {
          console.error('❌ 原始数据规范化失败:', normalizeError)
          console.error('  - Error stack:', normalizeError.stack)
          armsData.value = []
          timelineEvents.value = []
        }
        
        return true
      } catch (error) {
        console.error('❌ Failed to apply visualization data:', error)
        console.error('  - Error stack:', error.stack)
        console.error('  - Raw data:', raw)
        timelineEvents.value = []
        armsData.value = []
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
        // 优先从手术数据接口获取
        const resp = await api.surgeries.get(surgeryId)
        const raw = resp?.data?.data ?? resp?.data ?? null
        
        console.log('🔧 移动端获取到的手术数据:', raw)
        
        if (raw) {
          // 使用适配器处理数据
          const adaptedData = adaptSurgeryData(raw)
          
          console.log('🔧 适配后的数据:', adaptedData)
          console.log('🔧 数据验证结果:', validateAdaptedData(adaptedData))
          
          if (adaptedData && validateAdaptedData(adaptedData)) {
            adaptedData._dataSource = getDataSourceType(raw)
            adaptedData._originalData = raw
            
            // 应用适配后的数据
            try {
              const applied = applyVisualizationData(adaptedData)
              
              if (applied) {
                // 数据加载成功，保存到sessionStorage
                sessionStorage.setItem('surgeryVizData', JSON.stringify(adaptedData))
                console.log('✅ 数据加载成功')
                return
              } else {
                console.warn('⚠️ applyVisualizationData 返回 false')
              }
            } catch (error) {
              console.error('❌ applyVisualizationData 抛出错误:', error)
              throw error // 重新抛出以便外层捕获
            }
          } else {
            console.warn('⚠️ 数据适配或验证失败')
            console.warn('  - adaptedData:', adaptedData)
            console.warn('  - validateAdaptedData:', adaptedData ? validateAdaptedData(adaptedData) : 'adaptedData is null/undefined')
            console.warn('⚠️ 尝试从统计接口获取')
          }
        } else {
          console.warn('⚠️ api.surgeries.get 返回的数据为空')
        }
        
        // 如果直接获取失败或适配失败，尝试从统计接口获取
        try {
          const vizResp = await api.surgeryStatistics.getList({ surgery_id: surgeryId, limit: 1 })
          const stats = vizResp?.data?.data?.[0]
          
          console.log('🔧 从统计接口获取的数据:', stats)
          
          if (stats) {
            // 处理 postgresql_row_preview.structured_data 格式
            if (stats.postgresql_row_preview?.structured_data) {
              const adaptedData = adaptSurgeryData({
                ...stats,
                postgresql_row_preview: stats.postgresql_row_preview
              })
              
              if (adaptedData && validateAdaptedData(adaptedData)) {
                adaptedData._dataSource = getDataSourceType(stats)
                adaptedData._originalData = stats
                applyVisualizationData(adaptedData)
                sessionStorage.setItem('surgeryVizData', JSON.stringify(adaptedData))
                return
              }
            }
            
            // 处理直接包含 structured_data 的格式
            if (stats.structured_data) {
              const adaptedData = adaptSurgeryData({
                ...stats,
                structured_data: stats.structured_data
              })
              
              if (adaptedData && validateAdaptedData(adaptedData)) {
                adaptedData._dataSource = getDataSourceType(stats)
                adaptedData._originalData = stats
                applyVisualizationData(adaptedData)
                sessionStorage.setItem('surgeryVizData', JSON.stringify(adaptedData))
                return
              }
            }
            
            // 如果没有 structured_data，尝试直接适配整个 stats 对象
            const adaptedData = adaptSurgeryData(stats)
            if (adaptedData && validateAdaptedData(adaptedData)) {
              adaptedData._dataSource = getDataSourceType(stats)
              adaptedData._originalData = stats
              applyVisualizationData(adaptedData)
              sessionStorage.setItem('surgeryVizData', JSON.stringify(adaptedData))
              return
            }
          }
        } catch (error) {
          console.warn('⚠️ 从统计接口获取数据失败:', error)
        }
        
        // 所有尝试都失败
        console.error('❌ 无法获取有效的手术数据')
        showToast(t('mobile.surgeryVisualization.loadFailed'))
      } catch (error) {
        console.error('❌ 获取手术数据失败:', error)
        showToast(t('mobile.surgeryVisualization.loadFailed'))
      } finally {
        loading.value = false
      }
    }

    watch(instrumentUsageRows, () => {
      // 保持响应链路，当前无需额外副作用
    }, { immediate: true })

    watch(stageShareRows, (rows) => {
      if (!rows.length) {
        selectedStageKey.value = ''
      } else if (!rows.some(row => row.key === selectedStageKey.value)) {
        selectedStageKey.value = rows[0].key
      }
      nextTick(() => updateStageChart())
    }, { deep: true, immediate: true })

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
      nextTick(() => {
        updateStageChart()
        if (typeof ResizeObserver !== 'undefined' && stageChartRef.value) {
          stageChartResizeObserver = new ResizeObserver(() => {
            stageChartInstance?.resize()
          })
          stageChartResizeObserver.observe(stageChartRef.value)
        }
      })
    })

    onBeforeUnmount(() => {
      if (stageChartResizeObserver && stageChartRef.value) {
        try {
          stageChartResizeObserver.unobserve(stageChartRef.value)
        } catch (_) {
          // ignore observer cleanup errors
        }
      }
      stageChartResizeObserver = null
      if (stageChartInstance) {
        stageChartInstance.dispose()
        stageChartInstance = null
      }
    })

    return {
      surgeryData,
      armsData,
      loading,
      contentSwipeRef,
      contentTabs,
      activeContentTab,
      switchContentTab,
      onContentSwipeChange,
      displaySurgeryId,
      startTimeMetric,
      endTimeMetric,
      totalDuration,
      faultRows,
      visibleFaultRows,
      hasAlerts,
      faultSummary,
      showAllFaults,
      toggleFaultRows,
      formatDisplayTime,
      formatDuration,
      formatNetworkLatency,
      operationSummaryRows,
      hasOperationSummary,
      instrumentUsageRows,
      hasInstrumentUsage,
      openEnergyAnalysis,
      energyAnalysisPopupVisible,
      selectedInstrumentForEnergy,
      energyAnalysisTabs,
      activeEnergyAnalysisTab,
      selectedInstrumentEnergyDensity,
      selectedInstrumentDurationHistogram,
      selectedInstrumentEnergyDetails,
      totalInstrumentCount,
      averageNetworkLatency,
      toggleCard,
      isCardExpanded,
      stageShareRows,
      hasStageShare,
      selectedStageKey,
      selectedStageRow,
      stageChartRef,
      networkLatencySeries,
      hasNetworkLatency,
      faultExplanations,
      faultExplanationLoading,
      canOpenTimeline,
      openTimelineView
    }
  }
}
</script>

<style scoped>
.page {
  --surface-bg: #ffffff;
  --soft-bg: #f7f8fa;
  --line-color: #e4e7ec;
  --radius-lg: 12px;
  --radius-md: 10px;
  min-height: 100vh;
  min-height: 100dvh;
  height: 100dvh;
  background-color: var(--soft-bg);
  padding-top: calc(46px + env(safe-area-inset-top));
  box-sizing: border-box;
}

:deep(.van-nav-bar) {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

:deep(.van-nav-bar__content) {
  height: 42px;
}

:deep(.van-nav-bar__title) {
  font-size: 15px;
  max-width: 62vw;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: calc(100vh - 46px - env(safe-area-inset-top));
  min-height: calc(100dvh - 46px - env(safe-area-inset-top));
  height: calc(100dvh - 46px - env(safe-area-inset-top));
  padding: 12px 12px calc(8px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  overflow: hidden;
}

.metrics-strip {
  background: transparent;
  border-bottom: 1px solid #dbe0e7;
  padding: 6px 0 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.strip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.strip-id {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.strip-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  align-items: baseline;
}

.strip-item {
  font-size: 12px;
  color: #344054;
  line-height: 1.65;
  min-width: 0;
}

.tabbed-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.tab-bar {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 0;
  border-bottom: 1px solid #e4e7ec;
}

.tab-bar .tab-button {
  flex: 0 0 auto;
  min-width: 72px;
}

.tab-swipe {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.tab-swipe :deep(.van-swipe__track) {
  display: flex;
  align-items: stretch;
  height: 100%;
}

.tab-swipe :deep(.van-swipe-item) {
  display: flex;
  height: 100%;
}

.tab-panel-body {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.tab-panel-body > .section-card,
.tab-panel-body > .placeholder-card {
  flex: 1;
}

.tab-panel-body > .stage-section-card {
  flex: 0 0 auto;
}

.tab-panel-body .section-card {
  padding: 10px 10px 8px;
}

.stage-panel-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stage-rose-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  margin: 0;
}

.stage-rose-chart {
  width: 100%;
  height: 240px;
  min-height: 220px;
}

.stage-fixed-info {
  margin-top: 0;
  margin-bottom: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 11px;
  color: #334155;
  line-height: 1.4;
}

.stage-share-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
}

.stage-share-item {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  padding: 4px 6px;
  display: grid;
  grid-template-columns: 8px 1fr auto;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #334155;
  min-width: 0;
  text-align: left;
}

.stage-share-item.active {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.stage-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.stage-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-value {
  font-weight: 600;
}

.info-card {
  background-color: var(--surface-bg);
  border: 1px solid var(--line-color);
  border-radius: var(--radius-lg);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 4px rgba(16, 24, 40, 0.04);
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
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  color: #667085;
  line-height: 18px;
  padding: 8px 2px 10px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
}

.tab-button.active {
  background-color: transparent;
  color: #155dfc;
  border-bottom-color: #155dfc;
  box-shadow: none;
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

.overview-card {
  background: var(--surface-bg);
  border-color: var(--line-color);
  box-shadow: 0 1px 4px rgba(16, 24, 40, 0.04);
  padding: 10px;
  gap: 8px;
}

.metrics-section {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
}

.summary-merged-head {
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid #e5eaf2;
}

.summary-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.overview-icon-btn {
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #334155;
  border-radius: 999px;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1;
}

.overview-icon-btn:active {
  transform: scale(0.98);
}

.summary-meta-line {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #667085;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metrics-subheader {
  margin-top: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #475467;
  font-weight: 600;
}

.timeline-entry {
  width: 100%;
  border: 1px solid #cfd4dc;
  background: #ffffff;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.timeline-entry-title {
  font-size: 13px;
  color: #101828;
  font-weight: 600;
}

.timeline-entry-arrow {
  color: #6a7282;
  font-size: 14px;
}

.overview-section + .overview-section {
  margin-top: 4px;
}

.empty-state {
  padding: 20px 0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 10px;
  margin-top: 6px;
}

.kpi-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  min-height: 24px;
  border: none;
  background: transparent;
}

.kpi-item:active {
  opacity: 1;
  transform: none;
}

.kpi-item-duration,
.kpi-item-alerts,
.kpi-item-instruments,
.kpi-item-network,
.kpi-item-time {
  background: transparent;
}

.kpi-content {
  display: flex;
  flex-direction: row-reverse;
  gap: 4px;
  align-items: baseline;
  justify-content: flex-start;
  text-align: left;
}

.kpi-value {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.15;
  white-space: nowrap;
}

.kpi-item-time .kpi-value {
  font-size: 11px;
}

.kpi-label {
  font-size: 11px;
  color: #667085;
  line-height: 1.2;
  font-weight: 500;
  white-space: nowrap;
}

.risk-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.risk-card {
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  padding: 8px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #111827;
}

.risk-card:active {
  opacity: 0.9;
  transform: scale(0.98);
}

.risk-card-title {
  font-size: 10px;
  font-weight: 500;
  color: #475467;
  line-height: 1.4;
}

.risk-card-value {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.risk-card-arrow {
  align-self: flex-end;
  font-size: 14px;
  font-weight: 700;
  opacity: 0.75;
}

.risk-card-fault {
  background: #fff1f1;
  border-color: #fecaca;
  color: #b42318;
}

.risk-card-network {
  background: #eff8ff;
  border-color: #bfdbfe;
  color: #175cd3;
}

.risk-card-operation {
  background: #ecfdf3;
  border-color: #bbf7d0;
  color: #027a48;
}

.overview-arm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.overview-arm-card {
  border: 1px solid #d0d5dd;
  border-radius: var(--radius-md);
  background: #ffffff;
  padding: 9px 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
}

.overview-arm-card.active {
  border-color: #528bff;
  box-shadow: 0 0 0 1px rgba(82, 139, 255, 0.2);
  background: #f5f8ff;
}

.overview-arm-card:active {
  opacity: 0.86;
}

.overview-arm-title {
  font-size: 12px;
  font-weight: 600;
  color: #101828;
}

.overview-arm-metric {
  font-size: 11px;
  color: #667085;
}

.focused-arm-panel {
  margin-top: 2px;
  border-radius: var(--radius-md);
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 10px;
}

.focused-arm-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.focused-arm-title {
  font-size: 14px;
  font-weight: 600;
  color: #101828;
}

.focused-arm-subtitle {
  font-size: 11px;
  color: #667085;
}

.focused-arm-body {
  padding-top: 8px;
  gap: 10px;
  border-top-color: rgba(102, 112, 133, 0.2);
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}

.timeline-list-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.timeline-list-item:last-child {
  border-bottom: none;
}

.timeline-event-name {
  font-size: 14px;
  font-weight: 500;
  color: #101828;
  line-height: 1.4;
}

.timeline-event-time {
  font-size: 12px;
  color: #6a7282;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  line-height: 1.4;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-state {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

:deep(.detail-sheet) {
  max-height: 72vh;
}

.detail-sheet-head {
  display: flex;
  gap: 8px;
  padding: 12px 12px 8px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-sheet-tab {
  border: 1px solid #d1d5db;
  background: #f8fafc;
  color: #475467;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
}

.detail-sheet-tab.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.detail-sheet-body {
  padding: 10px 12px 14px;
  overflow: auto;
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
  background-color: var(--surface-bg);
  border: 1px solid var(--line-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 4px rgba(16, 24, 40, 0.04);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 0;
}

.chart-card {
  padding: 12px 12px 16px;
}

.state-machine-card {
  padding: 12px 12px 16px;
}

.state-machine-card .section-header {
  padding: 0 0 12px;
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

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-card-item {
  background: #f9fafb;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
}

.alert-card-item:active {
  opacity: 0.8;
  transform: scale(0.98);
}

.alert-card-unprocessed {
  background: #fff5f5;
  border-color: rgba(234, 88, 12, 0.2);
}

.alert-card-processed {
  background: #f9fafb;
  border-color: rgba(0, 0, 0, 0.06);
}

.alert-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.alert-card-time {
  font-size: 11px;
  color: #6a7282;
  font-weight: 500;
}

.alert-card-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 999px;
  font-weight: 500;
}

.alert-card-code {
  font-size: 16px;
  font-weight: 600;
  color: #101828;
  letter-spacing: 0.5px;
  line-height: 1.4;
}

.alert-card-message {
  font-size: 13px;
  color: #364153;
  line-height: 1.5;
  word-break: break-word;
  white-space: normal;
}

.explanation-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: #909399;
  font-size: 12px;
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

.instrument-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.instrument-card-item {
  background: #f9fafb;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s ease;
}

.instrument-card-item:active {
  background: #f3f4f6;
}

.instrument-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  gap: 12px;
}

.instrument-card-header:active {
  opacity: 0.7;
}

.instrument-card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
}

.instrument-arm-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 4px 10px;
  background: #2563eb;
  color: #fff;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.instrument-count {
  font-size: 13px;
  color: #364153;
  font-weight: 500;
  line-height: 1.5;
}

.instrument-expand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #6a7282;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.instrument-expand-icon.expanded {
  transform: rotate(180deg);
}

.instrument-type {
  font-size: 15px;
  font-weight: 600;
  color: #101828;
  line-height: 1.4;
}

.instrument-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.instrument-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.instrument-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.instrument-item-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.instrument-image-toggle {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.2;
  padding: 3px 8px;
  white-space: nowrap;
}

.instrument-image {
  width: 100%;
  height: 88px;
  object-fit: contain;
}

.instrument-image-panel {
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #f8fbff;
  overflow: hidden;
}

.instrument-image-fallback {
  width: 100%;
  height: 88px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  letter-spacing: 0.2px;
  color: #667085;
  font-weight: 600;
}

.instrument-item-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.energy-analysis-cta {
  margin-top: 2px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  width: 100%;
}

.energy-analysis-popup {
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  overflow: hidden;
}

.energy-analysis-sheet {
  height: 76vh;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.energy-analysis-sheet-header {
  padding: 12px 14px 10px;
  border-bottom: 1px solid #e5e7eb;
}

.energy-analysis-sheet-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.energy-analysis-sheet-subtitle {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
}

.energy-analysis-segmented {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.energy-analysis-segment {
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #4b5563;
  border-radius: 999px;
  padding: 6px 8px;
  font-size: 11px;
  line-height: 1.2;
}

.energy-analysis-segment.active {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.energy-analysis-sheet-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
}

.energy-analysis-view {
  min-height: 160px;
}

.energy-detail-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.energy-detail-row {
  display: grid;
  grid-template-columns: 1.5fr 1.5fr 0.8fr 0.8fr 0.9fr 0.9fr;
  gap: 8px;
  font-size: 11px;
  color: #374151;
  padding: 8px;
  border-radius: 8px;
  background: #f9fafb;
}

.energy-detail-row span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.energy-detail-header {
  position: sticky;
  top: 0;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
  z-index: 1;
}

.instrument-info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.instrument-info-label {
  color: #6a7282;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 46px;
}

.instrument-info-value {
  color: #364153;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.instrument-info-value.time {
  font-size: 11px;
  color: #6a7282;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  word-break: break-all;
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

.energy-analysis-view :deep(.energy-density-chart-wrap),
.energy-analysis-view :deep(.energy-density-chart) {
  min-height: 210px;
}

.energy-analysis-view :deep(.duration-histogram-chart) {
  min-height: 210px;
}

@media (max-width: 480px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 8px;
  }
  .kpi-item {
    min-height: 22px;
  }
  .kpi-value {
    font-size: 12px;
  }
  .kpi-label {
    font-size: 10px;
  }
  .instrument-card-item {
    padding: 12px;
  }
  .instrument-grid {
    gap: 8px;
  }
  .instrument-item {
    padding: 8px;
    width: 100%;
  }
  .instrument-info-label {
    min-width: 42px;
    font-size: 11px;
  }
  .instrument-info-value {
    font-size: 11px;
  }
  .instrument-type {
    font-size: 13px;
  }
  .table-alerts .table-row {
    grid-template-columns: 1.2fr 0.8fr 1.8fr 1fr;
    padding: 8px;
  }
}

</style>
