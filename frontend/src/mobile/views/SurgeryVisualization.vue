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
        <!-- 手术概况卡片（包含关键指标和时间线） -->
        <div class="section-card overview-card">
          <div class="overview-layout">
            <!-- 左侧：关键事件时间线 -->
            <div class="overview-left">
              <div v-if="timelineEvents.length > 0">
                <div class="section-header">{{ $t('mobile.surgeryVisualization.timelineTitle') }}</div>
                <div class="timeline-list">
                  <div
                    v-for="event in timelineEvents"
                    :key="`${event.type}-${event.time}`"
                    class="timeline-list-item"
                  >
                    <div class="timeline-event-name">{{ event.name }}</div>
                    <div class="timeline-event-time">{{ formatEventTime(event.time) }}</div>
                  </div>
                </div>
              </div>
              <div v-else>
                <div class="section-header">{{ $t('mobile.surgeryVisualization.timelineTitle') }}</div>
                <div class="empty-state">
                  <van-empty :description="$t('mobile.surgeryVisualization.noTimelineData')" />
                </div>
              </div>
            </div>

            <!-- 右侧：关键指标 -->
            <div class="overview-right">
              <div class="section-header">{{ $t('mobile.surgeryVisualization.keyMetrics') }}</div>
              <div class="kpi-grid">
                <div class="kpi-item kpi-item-duration">
                  <div class="kpi-content">
                    <div class="kpi-value">{{ formatDuration(totalDuration) }}</div>
                    <div class="kpi-label">{{ $t('mobile.surgeryVisualization.kpiDuration') }}</div>
                  </div>
                </div>
                <div class="kpi-item kpi-item-alerts">
                  <div class="kpi-content">
                    <div class="kpi-value">{{ faultSummary.total }}</div>
                    <div class="kpi-label">{{ $t('mobile.surgeryVisualization.kpiAlerts') }}</div>
                  </div>
                </div>
                <div class="kpi-item kpi-item-instruments">
                  <div class="kpi-content">
                    <div class="kpi-value">{{ totalInstrumentCount }}</div>
                    <div class="kpi-label">{{ $t('mobile.surgeryVisualization.kpiInstruments') }}</div>
                  </div>
                </div>
                <div v-if="isRemoteSurgery && hasNetworkLatency" class="kpi-item kpi-item-network">
                  <div class="kpi-content">
                    <div class="kpi-value">{{ formatNetworkLatency(averageNetworkLatency) }}</div>
                    <div class="kpi-label">{{ $t('mobile.surgeryVisualization.kpiNetworkLatency') }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'alerts'">
        <div v-if="hasAlerts" class="section-card alert-card">
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
          <div class="instrument-cards">
            <div
              v-for="armGroup in instrumentUsageRows"
              :key="armGroup.id"
              class="instrument-card-item"
            >
              <div
                class="instrument-card-header"
                @click="toggleCard(armGroup.id)"
              >
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
              <div
                v-show="isCardExpanded(armGroup.id)"
                class="instrument-card-body"
              >
                <div
                  v-for="instrument in armGroup.instruments"
                  :key="instrument.id"
                  class="instrument-item"
                >
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
                  </div>
                </div>
              </div>
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
import { computed, ref, onMounted, watch } from 'vue'
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
import { resolveInstrumentTypeLabel } from '@/utils/analysisMappings'

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
    
    const getInstrumentLabel = (value) => {
      const label = resolveInstrumentTypeLabel(value)
      if (label) return label
      if (value === null || value === undefined || value === '') return '-'
      return typeof value === 'string' ? value : String(value)
    }

    const surgeryId = route.params?.surgeryId || route.query?.surgeryId || ''
    const surgeryData = ref(null)
    const armsData = ref([])
    const loading = ref(false)
    const activeTab = ref('overview')
    const timelineEvents = ref([])

    const isRemoteSurgery = computed(() => {
      return surgeryData.value?.is_remote === true || surgeryData.value?.isRemote === true
    })

    const primaryTabs = computed(() => {
      const tabs = [
        { key: 'overview', label: t('mobile.surgeryVisualization.tabOverview') }
      ]
      // 只在有安全报警时显示安全报警标签页
      if (hasAlerts.value) {
        tabs.push({ key: 'alerts', label: t('mobile.surgeryVisualization.tabAlerts') })
      }
      // 只在远程手术时显示网络延时标签页
      if (isRemoteSurgery.value) {
        tabs.push({ key: 'network', label: t('mobile.surgeryVisualization.tabNetwork') })
      }
      return tabs
    })

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

    const formatEventTime = (time) => {
      if (!time) return '-'
      const date = new Date(time)
      if (Number.isNaN(date.getTime())) return '-'
      // 格式：2025/09/12 9:00:36
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
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
        
        // 构建预览请求载荷
        const previewPayload = {
          code: errorCode,
          subsystem: targetSubsystem || undefined,
          param1: param1 || undefined,
          param2: param2 || undefined,
          param3: param3 || undefined,
          param4: param4 || undefined
        }
        
        // 调用释义预览接口
        const resp = await api.explanations.preview(previewPayload)
        const explanation = resp?.data?.explanation
        
        if (explanation) {
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
          // 兼容多种字段命名：tool_type/instrument_type/instrument_name（下划线）或 toolType/instrumentType/instrumentName（驼峰）
          const toolType = getInstrumentLabel(
            usage.tool_type ?? 
            usage.instrument_type ?? 
            usage.instrument_name ?? 
            usage.toolType ?? 
            usage.instrumentType ?? 
            usage.instrumentName
          )
          // 兼容多种UDI字段命名
          const udi = usage.udi || usage.udi_code || usage.udiCode || '-'
          return {
            id: `${armId}-${usageIndex}`,
            toolType: toolType || '-',
            udi: udi,
            installTime: install,
            removeTime: remove
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
          
          // 如果当前在network标签页，但手术不是远程手术，切换到overview
          if (activeTab.value === 'network' && !(adapted.is_remote === true || adapted.isRemote === true)) {
            activeTab.value = 'overview'
          }
          // 如果当前在alerts标签页，但没有安全报警，切换到overview
          if (activeTab.value === 'alerts' && !hasAlerts.value) {
            activeTab.value = 'overview'
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
        
        // 如果当前在network标签页，但手术不是远程手术，切换到overview
        if (activeTab.value === 'network' && !(raw.is_remote === true || raw.isRemote === true)) {
          activeTab.value = 'overview'
        }
        // 如果当前在alerts标签页，但没有安全报警，切换到overview
        if (activeTab.value === 'alerts' && !hasAlerts.value) {
          activeTab.value = 'overview'
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

    const getSegmentStyle = (segment) => {
      if (!surgeryData.value?.start_time || !surgeryData.value?.end_time) return {}
      const start = new Date(surgeryData.value.start_time)
      const end = new Date(surgeryData.value.end_time)
      const totalDuration = end - start
      if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        return { left: '0%', width: '100%' }
      }

      // 兼容多种字段命名：start_time/install_time（下划线）或 startTime/installTime（驼峰）
      const segmentStartRaw = segment.start_time || segment.start || segment.install_time || segment.startTime || segment.installTime
      const segmentEndRaw = segment.end_time || segment.end || segment.remove_time || segment.endTime || segment.removeTime || segmentStartRaw
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

    // 监听isRemoteSurgery变化，如果从远程手术变为非远程手术，且当前在network标签页，切换到overview
    watch(isRemoteSurgery, (isRemote) => {
      if (!isRemote && activeTab.value === 'network') {
        activeTab.value = 'overview'
      }
    })

    // 监听hasAlerts变化，如果没有安全报警且当前在alerts标签页，切换到overview
    watch(hasAlerts, (hasAlertsValue) => {
      if (!hasAlertsValue && activeTab.value === 'alerts') {
        activeTab.value = 'overview'
      }
    })

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
      formatEventTime,
      formatDuration,
      formatNetworkLatency,
      operationSummaryRows,
      hasOperationSummary,
      instrumentUsageRows,
      hasInstrumentUsage,
      totalInstrumentCount,
      averageNetworkLatency,
      toggleCard,
      isCardExpanded,
      stateMachineSeries,
      hasStateMachine,
      networkLatencySeries,
      hasNetworkLatency,
      timelineEvents,
      faultExplanations,
      faultExplanationLoading
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

.overview-card {
  padding: 16px;
}

.overview-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.overview-left {
  flex: 1;
  min-width: 0;
}

.overview-right {
  flex: 1;
  min-width: 0;
}

/* 在小屏幕上优化间距，确保两列布局在普通手机上也能良好显示 */
@media (max-width: 640px) {
  .overview-layout {
    gap: 12px;
  }
}

.overview-left .section-header,
.overview-right .section-header {
  margin-bottom: 12px;
}

.empty-state {
  padding: 20px 0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.kpi-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  border-radius: 12px;
  transition: all 0.2s ease;
  min-height: 80px;
}

.kpi-item:active {
  opacity: 0.9;
  transform: scale(0.98);
}

.kpi-item-duration {
  background: #667eea;
}

.kpi-item-alerts {
  background: #f5576c;
}

.kpi-item-instruments {
  background: #4facfe;
}

.kpi-item-network {
  background: #43e97b;
}

.kpi-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  text-align: center;
}

.kpi-value {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  line-height: 1.2;
  word-break: break-word;
}

.kpi-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
  font-weight: 500;
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
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.instrument-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.instrument-item:not(:last-child) {
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.instrument-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.instrument-item-header .instrument-type {
  font-size: 14px;
  font-weight: 600;
  color: #101828;
}

.instrument-item-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 4px;
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
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 60px;
}

.instrument-info-value {
  color: #364153;
  text-align: right;
  word-break: break-all;
  flex: 1;
}

.instrument-info-value.time {
  font-size: 12px;
  color: #6a7282;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
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

/* 普通手机（375px-414px）保持两列显示，只有非常小的屏幕才上下排列 */
@media (max-width: 360px) {
  .overview-layout {
    flex-direction: column;
    gap: 24px;
  }
  .overview-left,
  .overview-right {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .kpi-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .kpi-item {
    padding: 14px;
    min-height: 70px;
  }
  .kpi-value {
    font-size: 22px;
  }
  .kpi-label {
    font-size: 12px;
  }
  .instrument-card-item {
    padding: 12px;
  }
  .instrument-info-label {
    min-width: 56px;
    font-size: 11px;
  }
  .instrument-info-value {
    font-size: 12px;
  }
  .instrument-type {
    font-size: 14px;
  }
  .table-alerts .table-row {
    grid-template-columns: 1.2fr 0.8fr 1.8fr 1fr;
    padding: 8px;
  }
}

</style>

