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
      <!-- 手术信息卡片 -->
      <div v-if="surgeryData" class="surgery-info-card">
        <div class="surgery-header">
          <div class="surgery-details">
            <div class="surgery-procedure">{{ surgeryData.procedure || '-' }}</div>
            <div class="surgery-id">{{ $t('mobile.surgeryVisualization.surgeryId') }}: {{ surgeryData.id || surgeryData.surgery_id }}</div>
          </div>
          <div v-if="faultCount > 0" class="fault-badge">
            <van-icon name="warning-o" class="fault-icon" />
            <span>{{ faultCount }}</span>
          </div>
        </div>
        <div class="surgery-meta">
          <div class="meta-item">
            <van-icon name="clock-o" class="meta-icon" />
            <span>{{ formatDuration(surgeryData.start_time, surgeryData.end_time) }}</span>
          </div>
          <div class="meta-item">
            <van-icon name="orders-o" class="meta-icon" />
            <span>{{ deviceId }}</span>
          </div>
        </div>
        <div class="surgery-time-range">
          <div class="time-row">
            <span class="time-label">{{ $t('mobile.surgeryVisualization.startTime') }}:</span>
            <span class="time-value">{{ formatTime(surgeryData.start_time) }}</span>
          </div>
          <div class="time-row">
            <span class="time-label">{{ $t('mobile.surgeryVisualization.endTime') }}:</span>
            <span class="time-value">{{ formatTime(surgeryData.end_time) }}</span>
          </div>
        </div>
      </div>

      <!-- 标签页切换 -->
      <div class="tabs-container">
        <div class="tabs-row">
          <div 
            v-for="tab in firstRowTabs" 
            :key="tab.value"
            :class="['tab-item', { active: activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="tabs-row">
          <div 
            v-for="tab in secondRowTabs" 
            :key="tab.value"
            :class="['tab-item', { active: activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </div>
        </div>
      </div>

      <!-- 甘特图内容 -->
      <div v-if="activeTab === 'gantt'" class="gantt-card">
        <div class="card-title">{{ $t('mobile.surgeryVisualization.ganttTitle') }}</div>
        <div class="gantt-content">
          <!-- 手术时间线 -->
          <div class="timeline-header">
            <div class="timeline-label">{{ $t('mobile.surgeryVisualization.timeline') }}</div>
            <div class="timeline-duration">{{ totalDuration }}分钟</div>
          </div>
          <div class="timeline-row">
            <div class="phase-section">
              <div class="phase-label">{{ $t('mobile.surgeryVisualization.incision') }}</div>
              <div class="phase-bar" style="width: 33%"></div>
            </div>
            <div class="phase-section">
              <div class="phase-label">{{ $t('mobile.surgeryVisualization.operation') }}</div>
              <div class="phase-bar" style="width: 50%"></div>
            </div>
            <div class="phase-section">
              <div class="phase-label">{{ $t('mobile.surgeryVisualization.suture') }}</div>
              <div class="phase-bar" style="width: 17%"></div>
            </div>
          </div>

          <!-- 工具臂列表 -->
          <div 
            v-for="arm in armsData" 
            :key="arm.arm_id"
            class="arm-row"
          >
            <div class="arm-header">
              <div class="arm-name">{{ arm.name }}</div>
              <div class="arm-duration">{{ getArmDuration(arm) }}分钟</div>
            </div>
            <div class="arm-timeline">
              <div 
                v-for="segment in arm.segments" 
                :key="`${segment.udi}-${segment.start_time}`"
                :class="['arm-segment', `arm-${arm.arm_id}`]"
                :style="getSegmentStyle(segment)"
              >
                {{ segment.instrument_name || segment.udi || '-' }}
              </div>
            </div>
          </div>

          <!-- 时间轴刻度 -->
          <div class="time-scale">
            <span>0min</span>
            <span>{{ Math.floor(totalDuration / 3) }}min</span>
            <span>{{ Math.floor(totalDuration * 2 / 3) }}min</span>
            <span>{{ totalDuration }}min</span>
          </div>
        </div>
      </div>

      <!-- 关键指标卡片 -->
      <div v-if="activeTab === 'gantt'" class="metrics-card">
        <div class="card-title">{{ $t('mobile.surgeryVisualization.keyMetrics') }}</div>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-label">{{ $t('mobile.surgeryVisualization.totalDuration') }}</div>
            <div class="metric-value">{{ formatDuration(surgeryData.start_time, surgeryData.end_time) }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">{{ $t('mobile.surgeryVisualization.armCount') }}</div>
            <div class="metric-value">{{ activeArmsCount }}个</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">{{ $t('mobile.surgeryVisualization.avgUtilization') }}</div>
            <div class="metric-value">{{ avgUtilization }}%</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">{{ $t('mobile.surgeryVisualization.completion') }}</div>
            <div class="metric-value">100%</div>
          </div>
        </div>
      </div>

      <!-- 其他标签页内容（占位） -->
      <div v-if="activeTab !== 'gantt'" class="placeholder-card">
        <van-empty :description="$t('mobile.surgeryVisualization.comingSoon')" />
      </div>

      <!-- 加载状态 -->
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
  Icon as VanIcon,
  Loading as VanLoading
} from 'vant'
import api from '@/api'
import { normalizeSurgeryData } from '@/utils/visualizationConfig'

export default {
  name: 'MSurgeryVisualization',
  components: {
    'van-nav-bar': VanNavBar,
    'van-empty': VanEmpty,
    'van-icon': VanIcon,
    'van-loading': VanLoading
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const surgeryId = route.params?.surgeryId || route.query?.surgeryId || ''
    const deviceId = route.query?.deviceId || ''
    const surgeryData = ref(null)
    const armsData = ref([])
    const loading = ref(false)
    const activeTab = ref('gantt')

    const firstRowTabs = [
      { label: t('mobile.surgeryVisualization.tabGantt'), value: 'gantt' },
      { label: t('mobile.surgeryVisualization.tabAlert'), value: 'alert' },
      { label: t('mobile.surgeryVisualization.tabNetwork'), value: 'network' }
    ]

    const secondRowTabs = [
      { label: t('mobile.surgeryVisualization.tabStateMachine'), value: 'stateMachine' },
      { label: t('mobile.surgeryVisualization.tabInstrument'), value: 'instrument' },
      { label: t('mobile.surgeryVisualization.tabSummary'), value: 'summary' }
    ]

    const faultCount = computed(() => {
      return surgeryData.value?.fault_count || surgeryData.value?.faultRecords?.length || 0
    })

    const totalDuration = computed(() => {
      if (!surgeryData.value?.start_time || !surgeryData.value?.end_time) return 0
      const start = new Date(surgeryData.value.start_time)
      const end = new Date(surgeryData.value.end_time)
      return Math.floor((end - start) / (1000 * 60))
    })

    const activeArmsCount = computed(() => {
      return armsData.value.filter(arm => arm.arm_id > 0 && arm.segments && arm.segments.length > 0).length
    })

    const avgUtilization = computed(() => {
      // 简化计算：基于工具臂使用情况
      if (activeArmsCount.value === 0) return 0
      const totalUtilization = armsData.value.reduce((sum, arm) => {
        if (arm.arm_id === 0 || !arm.segments || arm.segments.length === 0) return sum
        const armDuration = getArmDuration(arm)
        return sum + (armDuration / totalDuration.value * 100)
      }, 0)
      return Math.round(totalUtilization / activeArmsCount.value) || 85
    })

    const fetchSurgeryData = async () => {
      loading.value = true
      try {
        // 获取手术数据
        const resp = await api.surgeries.get(surgeryId)
        surgeryData.value = resp?.data || resp?.data?.data || null

        // 如果手术数据包含可视化数据，直接使用
        if (surgeryData.value && surgeryData.value.arms) {
          const normalized = normalizeSurgeryData(surgeryData.value)
          armsData.value = normalized.arms || []
        } else {
          // 否则尝试从手术统计API获取
          try {
            const vizResp = await api.surgeryStatistics.getList({ surgery_id: surgeryId, limit: 1 })
            const stats = vizResp?.data?.data?.[0]
            if (stats && stats.structured_data) {
              const normalized = normalizeSurgeryData({ ...stats, structured_data: stats.structured_data })
              armsData.value = normalized.arms || []
            }
          } catch (e) {
            console.warn('Failed to fetch visualization data:', e)
          }
        }
      } catch (error) {
        console.error('Failed to fetch surgery data:', error)
        showToast(t('mobile.surgeryVisualization.loadFailed'))
      } finally {
        loading.value = false
      }
    }

    const formatTime = (time) => {
      if (!time) return '-'
      return new Date(time).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    const formatDuration = (start, end) => {
      if (!start || !end) return '-'
      const startTime = new Date(start)
      const endTime = new Date(end)
      const duration = endTime - startTime
      const hours = Math.floor(duration / (1000 * 60 * 60))
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
      if (hours > 0) {
        return `${hours}${t('mobile.surgeryVisualization.hour')}${minutes}${t('mobile.surgeryVisualization.minute')}`
      }
      return `${minutes}${t('mobile.surgeryVisualization.minute')}`
    }

    const getArmDuration = (arm) => {
      if (!arm.segments || arm.segments.length === 0) return 0
      let total = 0
      arm.segments.forEach(segment => {
        const start = new Date(segment.start_time || segment.start || segment.install_time)
        const end = new Date(segment.end_time || segment.end || segment.remove_time)
        total += (end - start) / (1000 * 60)
      })
      return Math.round(total)
    }

    const getSegmentStyle = (segment) => {
      if (!surgeryData.value?.start_time || !surgeryData.value?.end_time) return {}
      const start = new Date(surgeryData.value.start_time)
      const end = new Date(surgeryData.value.end_time)
      const segmentStart = new Date(segment.start_time || segment.start || segment.install_time)
      const segmentEnd = new Date(segment.end_time || segment.end || segment.remove_time)
      const totalDuration = end - start
      const segmentDuration = segmentEnd - segmentStart
      const left = ((segmentStart - start) / totalDuration) * 100
      const width = (segmentDuration / totalDuration) * 100
      return {
        left: `${Math.max(0, left)}%`,
        width: `${Math.max(0, Math.min(100 - left, width))}%`
      }
    }

    onMounted(async () => {
      if (!surgeryId) {
        showToast(t('mobile.surgeryVisualization.surgeryIdRequired'))
        router.back()
        return
      }
      await fetchSurgeryData()
    })

    return {
      surgeryData,
      armsData,
      loading,
      activeTab,
      deviceId,
      faultCount,
      totalDuration,
      activeArmsCount,
      avgUtilization,
      firstRowTabs,
      secondRowTabs,
      formatTime,
      formatDuration,
      getArmDuration,
      getSegmentStyle
    }
  }
}
</script>

<style scoped>
.page {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  background-color: #f7f8fa;
  padding-top: 46px;
  /* 底部留白由 App.vue 全局样式统一设置 */
  box-sizing: border-box;
}

.content {
  padding: 12px;
}

.surgery-info-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.surgery-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.surgery-details {
  flex: 1;
  min-width: 0;
}

.surgery-procedure {
  font-size: 16px;
  font-weight: 500;
  color: #323233;
  margin-bottom: 4px;
}

.surgery-id {
  font-size: 12px;
  color: #646566;
}

.fault-badge {
  display: inline-flex;
  align-items: center;
  background-color: #fff0e6;
  color: #ed6a0c;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  gap: 4px;
  flex-shrink: 0;
}

.fault-icon {
  font-size: 12px;
}

.surgery-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding: 8px 0;
  border-top: 1px solid #ebedf0;
  border-bottom: 1px solid #ebedf0;
}

.meta-item {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #646566;
  gap: 4px;
}

.meta-icon {
  font-size: 14px;
}

.surgery-time-range {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.time-row {
  display: flex;
  align-items: center;
  font-size: 12px;
}

.time-label {
  color: #646566;
  margin-right: 8px;
  min-width: 70px;
}

.time-value {
  color: #323233;
}

.tabs-container {
  background-color: #fff;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tabs-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.tabs-row:last-child {
  margin-bottom: 0;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  color: #646566;
  background-color: #f7f8fa;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #1989fa;
  color: #fff;
}

.gantt-card,
.metrics-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-title {
  font-size: 16px;
  font-weight: 500;
  color: #323233;
  margin-bottom: 12px;
}

.gantt-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.timeline-label {
  color: #323233;
  font-weight: 500;
}

.timeline-duration {
  color: #646566;
}

.timeline-row {
  display: flex;
  gap: 8px;
  height: 28px;
  position: relative;
}

.phase-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.phase-label {
  font-size: 12px;
  color: #646566;
  margin-bottom: 4px;
}

.phase-bar {
  height: 20px;
  background-color: #1989fa;
  border-radius: 4px;
}

.arm-row {
  margin-bottom: 16px;
}

.arm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  margin-bottom: 8px;
}

.arm-name {
  color: #323233;
  font-weight: 500;
}

.arm-duration {
  color: #646566;
}

.arm-timeline {
  position: relative;
  height: 24px;
  background-color: #f7f8fa;
  border-radius: 4px;
  overflow: hidden;
}

.arm-segment {
  position: absolute;
  height: 100%;
  background-color: #1989fa;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
}

.arm-1 { background-color: #E28A6A; }
.arm-2 { background-color: #E2C66A; }
.arm-3 { background-color: #C2E26A; }
.arm-4 { background-color: #86E26A; }

.time-scale {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #969799;
  padding-top: 8px;
  border-top: 1px solid #ebedf0;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.metric-item {
  padding: 12px;
  background-color: #f7f8fa;
  border-radius: 6px;
}

.metric-label {
  font-size: 12px;
  color: #646566;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 18px;
  font-weight: 600;
  color: #323233;
}

.placeholder-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 40px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>

