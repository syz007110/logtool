<template>
  <div class="page" :style="{ paddingTop: pagePaddingTop + 'px' }">
    <div class="mobile-header" ref="headerRef">
      <div class="header-container">
        <van-icon name="arrow-left" class="back-icon" @click="$router.back()" />
        <div class="header-content">
            <div class="header-row">
              <div class="header-title">{{ deviceId }}</div>
              <button type="button" class="header-search-btn" @click="toggleSearch">🔍</button>
            </div>
        </div>
      </div>
    </div>

    <div
      class="top-stack-fixed"
      ref="topStackRef"
      :style="{ top: headerHeight + 'px' }"
    >
      <div class="filters-fixed" ref="filtersRef">
      <div v-if="showSearch" class="search-container">
        <div class="search-box">
          <van-icon name="search" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="search-input"
            :placeholder="$t('mobile.deviceSurgeries.searchPlaceholder')"
            @input="handleSearchInput"
          />
        </div>
      </div>

      <div class="chip-row">
        <button class="filter-chip" type="button" @click="openFilterSheet('time')">时间：{{ timeChipLabel }}</button>
        <button class="filter-chip" type="button" @click="openFilterSheet('type')">类型：{{ typeChipLabel }}</button>
        <button class="filter-chip" type="button" @click="openFilterSheet('sort')">排序：{{ sortChipLabel }}</button>
        <button class="filter-chip filter-chip-more" type="button" @click="openFilterSheet('all')">更多</button>
      </div>
      <div class="quick-row">
        <button
          v-for="option in quickShortcutOptions"
          :key="option.value"
          type="button"
          class="quick-shortcut"
          :class="{ active: selectedQuickRange === option.value }"
          @click="selectQuickRange(option.value)"
        >
          {{ option.text }}
        </button>
      </div>
      </div>

      <div class="kpi-block" ref="kpiRef">
        <div class="kpi-card">
          <div class="kpi-item">
            <div class="kpi-value">{{ recent7Stats.count }}</div>
            <div class="kpi-label">手术数</div>
          </div>
          <div class="kpi-item">
            <div class="kpi-value">{{ recent7Stats.avgDuration }}</div>
            <div class="kpi-label">平均时长</div>
          </div>
          <div class="kpi-item">
            <div class="kpi-value">{{ recent7Stats.faultRate }}</div>
            <div class="kpi-label">异常率</div>
          </div>
        </div>
      </div>
    </div>

    <van-popup class="filter-popup" v-model:show="filterSheetVisible" position="bottom" round :style="{ maxHeight: '70vh' }">
      <div class="sheet-wrap">
        <div class="sheet-title">筛选条件</div>

        <div class="sheet-body">
          <div v-if="sheetMode === 'all' || sheetMode === 'time'" class="time-filter-panel">
            <div class="time-filter-section">
              <div class="section-title">{{ customRangeTitle }}</div>
              <div
                v-if="selectedQuickRange !== 'custom' && selectedQuickRange !== 'all'"
                class="time-mode-hint"
              >
                当前使用快捷范围：{{ timeChipLabel }}。选择年月日后将切换为自定义时间。
              </div>
              <div class="custom-options">
                <div class="custom-row">
                  <div class="custom-label">{{ yearLabel }}</div>
                  <div class="option-pills">
                    <div
                      v-for="option in yearOptions"
                      :key="option.value"
                      class="option-pill"
                      :class="{ active: selectedYear === option.value }"
                      @click="selectYear(option.value)"
                    >
                      {{ option.text }}
                    </div>
                  </div>
                </div>
                <div v-if="selectedYear !== 'all'" class="custom-row">
                  <div class="custom-label">{{ monthLabel }}</div>
                  <div class="option-pills">
                    <div
                      v-for="option in monthOptions"
                      :key="option.value"
                      class="option-pill"
                      :class="{ active: selectedMonth === option.value }"
                      @click="selectMonth(option.value)"
                    >
                      {{ option.text }}
                    </div>
                  </div>
                </div>
                <div v-if="selectedYear !== 'all' && selectedMonth !== 'all'" class="custom-row">
                  <div class="custom-label">{{ dayLabel }}</div>
                  <div class="option-pills">
                    <div
                      v-for="option in dayOptions"
                      :key="option.value"
                      class="option-pill"
                      :class="{ active: selectedDay === option.value }"
                      @click="selectDay(option.value)"
                    >
                      {{ option.text }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="sheetMode === 'all' || sheetMode === 'type'" class="time-filter-section">
            <div class="section-title">手术类型</div>
            <div class="quick-options">
              <div
                v-for="option in surgeryTypeOptions"
                :key="option.value"
                class="quick-option"
                :class="{ active: surgeryTypeFilter === option.value }"
                @click="setSurgeryType(option.value)"
              >
                {{ option.text }}
              </div>
            </div>
          </div>

          <div v-if="sheetMode === 'all' || sheetMode === 'sort'" class="time-filter-section">
            <div class="section-title">排序方式</div>
            <div class="quick-options">
              <div class="quick-option" :class="{ active: sortOrder === 'latest' }" @click="setSortOrder('latest')">最新优先</div>
              <div class="quick-option" :class="{ active: sortOrder === 'earliest' }" @click="setSortOrder('earliest')">最早优先</div>
            </div>
          </div>
        </div>

        <div class="sheet-actions">
          <button type="button" class="action-pill" @click="clearAllFilters">重置</button>
          <button type="button" class="action-pill action-pill-primary" @click="closeFilterSheet">关闭</button>
        </div>
      </div>
    </van-popup>

    <div class="content" :class="{ 'is-empty-mode': isEmptyState }" :style="{ paddingTop: contentPaddingTop + 'px', '--list-min-height': listMinHeight + 'px' }">
      <div class="list-stage">
      <!-- 手术列表 -->
      <van-list v-if="!isEmptyState" class="surgery-list-container" :finished="finished" :loading="loading" :offset="100" @load="onLoad">
        <div class="surgery-list">
          <div
            v-for="item in items"
            :key="item.internalId"
            class="surgery-card"
            @click="openVisualization(item)"
          >
            <div class="card-content">
              <div class="card-header">
                <div class="surgery-id">{{ buildSurgeryId(item) }}</div>
                <div class="type-badges">
                  <span v-if="shouldShowRemoteTag(item)" class="status-chip is-remote">{{ $t('surgeryVisualization.remoteSurgery') }}</span>
                  <span :class="['status-chip', getSurgeryStatusClass(item)]">{{ getSurgeryStatusText(item) }}</span>
                </div>
              </div>
              <div class="card-mid">
                <div v-if="item.procedure" class="surgery-procedure">{{ item.procedure }}</div>
                <div class="time-row time-row-primary">
                  <span class="time-label">{{ $t('mobile.deviceSurgeries.startTime') }}:</span>
                  <span class="time-value">{{ formatTime(item.start_time) }}</span>
                </div>
                <div class="card-meta-row">
                  <span class="meta-item">{{ $t('mobile.deviceSurgeries.duration') }}：{{ formatDuration(item.start_time, item.end_time) }}</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </van-list>

      <!-- 空状态 -->
      <van-empty
        v-else
        :description="$t('shared.noData')"
        class="empty-state"
      />
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, onBeforeUnmount, onUpdated, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { 
  List as VanList, 
  Empty as VanEmpty, 
  Icon as VanIcon,
  Popup as VanPopup
} from 'vant'
import api from '@/api'
import { adaptSurgeryData, validateAdaptedData, getDataSourceType } from '@/utils/surgeryDataAdapter'

export default {
  name: 'MDeviceSurgeries',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon,
    'van-popup': VanPopup
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const deviceId = computed(() => route.params?.deviceId || '')
    const headerRef = ref(null)
    const topStackRef = ref(null)
    const filtersRef = ref(null)
    const kpiRef = ref(null)
    const headerHeight = ref(0)
    const filtersHeight = ref(0)
    const kpiHeight = ref(0)
    const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 812)
    const keyword = ref('')
    const showSearch = ref(false)
    const surgeryTypeFilter = ref('all')
    const sortOrder = ref('latest')
    const selectedQuickRange = ref('7d')
    const selectedYear = ref('all')
    const selectedMonth = ref('all')
    const selectedDay = ref('all')
    const surgeries = ref([])
    const items = ref([])
    const filteredTotal = ref(0)
    const deviceInfo = ref(null)
    const totalSurgeries = ref(0)
    const loading = ref(false)
    const finished = ref(false)
    const prepared = ref(false)
    const page = ref(1)
    const pageSize = 20
    const filterSheetVisible = ref(false)
    const sheetMode = ref('all')

    const translateOr = (key, fallback) => {
      const result = t(key)
      return result === key ? fallback : result
    }

    const surgeryTypeOptions = computed(() => ([
      { text: t('mobile.deviceSurgeries.filterAll'), value: 'all' },
      { text: t('surgeryVisualization.remoteSurgery'), value: 'remote' },
      { text: t('surgeryVisualization.faultSurgery'), value: 'fault' }
    ]))

    const quickRangeOptions = computed(() => ([
      { text: translateOr('mobile.deviceSurgeries.timeAll', '全部时间'), value: 'all' },
      { text: translateOr('mobile.deviceSurgeries.last1Day', '近1天'), value: '1d' },
      { text: translateOr('mobile.deviceSurgeries.last7Days', '近7天'), value: '7d' },
      { text: translateOr('mobile.deviceSurgeries.last30Days', '近30天'), value: '30d' }
    ]))

    const typeChipLabel = computed(() => {
      const current = surgeryTypeOptions.value.find(option => option.value === surgeryTypeFilter.value)
      return current?.text || '全部'
    })

    const quickShortcutOptions = computed(() => quickRangeOptions.value.filter(option => ['1d', '7d', '30d'].includes(option.value)))

    const sortChipLabel = computed(() => (sortOrder.value === 'earliest' ? '最早' : '最新'))

    const timeChipLabel = computed(() => {
      if (selectedQuickRange.value === 'custom') return '自定义'
      return quickRangeMap.value[selectedQuickRange.value] || '近7天'
    })

    const quickRangeTitle = computed(() =>
      translateOr('mobile.deviceSurgeries.quickRangeTitle', '快捷选择')
    )

    const customRangeTitle = computed(() =>
      translateOr('mobile.deviceSurgeries.customRangeTitle', '自定义日期')
    )

    const yearLabel = computed(() =>
      translateOr('mobile.deviceSurgeries.yearLabel', '年份')
    )

    const monthLabel = computed(() =>
      translateOr('mobile.deviceSurgeries.monthLabel', '月份')
    )

    const dayLabel = computed(() =>
      translateOr('mobile.deviceSurgeries.dayLabel', '日期')
    )

    const clearText = computed(() =>
      translateOr('mobile.deviceSurgeries.clearTimeFilter', '清除筛选')
    )

    const quickRangeMap = computed(() => {
      const map = {}
      quickRangeOptions.value.forEach(option => {
        map[option.value] = option.text
      })
      return map
    })

    const timeFilterTitle = computed(() => {
      if (selectedQuickRange.value !== 'custom') {
        return quickRangeMap.value[selectedQuickRange.value] || quickRangeOptions.value[0]?.text || ''
      }

      if (selectedYear.value === 'all' && selectedMonth.value === 'all' && selectedDay.value === 'all') {
        return quickRangeOptions.value[0]?.text || ''
      }

      const parts = []
      if (selectedYear.value !== 'all') parts.push(selectedYear.value)
      if (selectedMonth.value !== 'all') parts.push(selectedMonth.value)
      if (selectedDay.value !== 'all') parts.push(selectedDay.value)
      return parts.join('-')
    })

    const timeFiltersLoaded = ref(false)
    const availableYearValues = ref([])
    const availableMonthsByYear = ref({})
    const availableDaysByYearMonth = ref({})
    const currentYear = new Date().getFullYear()

    const normalizeYearValue = (value) => {
      if (value == null) return null
      const num = Number(value)
      if (Number.isNaN(num)) return null
      return String(num).padStart(4, '0')
    }

    const normalizeMonthValue = (value) => {
      if (value == null) return null
      const num = Number(value)
      if (Number.isNaN(num)) return null
      return String(num).padStart(2, '0')
    }

    const normalizeDayValue = (value) => {
      if (value == null) return null
      const num = Number(value)
      if (Number.isNaN(num)) return null
      return String(num).padStart(2, '0')
    }

    const availableYears = computed(() => {
      const yearsSource = Array.isArray(availableYearValues.value) ? availableYearValues.value : []
      const normalized = yearsSource
        .map(normalizeYearValue)
        .filter(Boolean)
      const unique = Array.from(new Set(normalized))
      return unique.sort((a, b) => Number(b) - Number(a))
    })

    const yearOptions = computed(() => {
      const suffix = translateOr('mobile.deviceSurgeries.yearSuffix', '年')
      const years = availableYears.value.length ? availableYears.value : [String(currentYear)]
      const uniqueYears = Array.from(new Set(years))
      return [
        { text: translateOr('mobile.deviceSurgeries.timeAll', '全部年份'), value: 'all' },
        ...uniqueYears.map(year => ({
          text: `${year}${suffix}`,
          value: year
        }))
      ]
    })

    const availableMonths = computed(() => {
      const monthsSet = new Set()
      const monthsMap = availableMonthsByYear.value || {}

      if (selectedYear.value !== 'all') {
        const months = monthsMap[selectedYear.value] || []
        months.forEach(month => {
          const normalized = normalizeMonthValue(month)
          if (normalized) {
            monthsSet.add(normalized)
          }
        })
      } else {
        // 年份为'all'时，显示所有年份的月份合集
        Object.values(monthsMap).forEach(list => {
          (list || []).forEach(month => {
            const normalized = normalizeMonthValue(month)
            if (normalized) {
              monthsSet.add(normalized)
            }
          })
        })
      }

      if (!monthsSet.size) {
        // 如果没有数据，显示所有月份（1-12）
        for (let m = 1; m <= 12; m += 1) {
          monthsSet.add(String(m).padStart(2, '0'))
        }
      }

      return Array.from(monthsSet).sort((a, b) => a.localeCompare(b))
    })

    const monthOptions = computed(() => {
      const suffix = translateOr('mobile.deviceSurgeries.monthSuffix', '月')
      return [
        { text: translateOr('mobile.deviceSurgeries.monthAll', '全部月份'), value: 'all' },
        ...availableMonths.value.map(month => {
          const normalized = normalizeMonthValue(month)
          return {
            text: `${normalized}${suffix}`,
            value: normalized
          }
        })
      ]
    })

    const availableDays = computed(() => {
      const daysSet = new Set()
      const daysMap = availableDaysByYearMonth.value || {}

      if (selectedYear.value !== 'all' && selectedMonth.value !== 'all') {
        // 已选择年份和月份，显示该年月下的所有日期
        const key = `${selectedYear.value}-${selectedMonth.value}`
        const days = daysMap[key] || []
        days.forEach(day => {
          const normalized = normalizeDayValue(day)
          if (normalized) {
            daysSet.add(normalized)
          }
        })
      } else if (selectedYear.value !== 'all') {
        // 只选择了年份，显示该年份下所有月份的日期
        Object.entries(daysMap).forEach(([key, list]) => {
          if (key.startsWith(`${selectedYear.value}-`)) {
            (list || []).forEach(day => {
              const normalized = normalizeDayValue(day)
              if (normalized) {
                daysSet.add(normalized)
              }
            })
          }
        })
      } else {
        // 年份为'all'，显示所有日期
        Object.values(daysMap).forEach(list => {
          (list || []).forEach(day => {
            const normalized = normalizeDayValue(day)
            if (normalized) {
              daysSet.add(normalized)
            }
          })
        })
      }

      if (!daysSet.size) {
        // 如果没有数据，显示所有日期（1-31）
        for (let d = 1; d <= 31; d += 1) {
          daysSet.add(String(d).padStart(2, '0'))
        }
      }

      return Array.from(daysSet).sort((a, b) => a.localeCompare(b))
    })

    const dayOptions = computed(() => {
      const suffix = translateOr('mobile.deviceSurgeries.daySuffix', '日')
      return [
        { text: translateOr('mobile.deviceSurgeries.dayAll', '全部日期'), value: 'all' },
        ...availableDays.value.map(day => {
          const normalized = normalizeDayValue(day)
          return {
            text: `${normalized}${suffix}`,
            value: normalized
          }
        })
      ]
    })

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

    const formatDuration = (start, end) => {
      if (!start || !end) return '-'
      const startTime = new Date(start)
      const endTime = new Date(end)
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return '-'
      const duration = endTime - startTime
      if (duration <= 0) return '-'
      const hours = Math.floor(duration / (1000 * 60 * 60))
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
      if (hours > 0) {
        return `${hours}${t('mobile.deviceSurgeries.hour')}${minutes}${t('mobile.deviceSurgeries.minute')}`
      }
      return `${minutes || 1}${t('mobile.deviceSurgeries.minute')}`
    }

    const normalizeFlag = (value) => {
      if (value === true || value === 'true' || value === 1 || value === '1') return true
      if (value === false || value === 'false' || value === 0 || value === '0' || value == null) return false
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized === 'yes') return true
        if (normalized === 'no') return false
      }
      return Boolean(value)
    }

    const isRemoteSurgery = (item) => normalizeFlag(item?.is_remote)
    const hasFaultTag = (item) => normalizeFlag(item?.has_fault)
    const isFaultSurgery = (item) => hasFaultTag(item)

    const getFaultCount = (item) => {
      const count = Number(item?.fault_count)
      if (!Number.isNaN(count) && count > 0) return count
      return hasFaultTag(item) ? 1 : 0
    }

    const getDurationMinutes = (start, end) => {
      if (!start || !end) return 0
      const startTime = new Date(start)
      const endTime = new Date(end)
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return 0
      const duration = endTime - startTime
      if (duration <= 0) return 0
      return Math.round(duration / (1000 * 60))
    }

    const filterBySelectedTimeRange = (source) => {
      let filtered = [...source]

      if (selectedQuickRange.value !== 'all' && selectedQuickRange.value !== 'custom') {
        const now = Date.now()
        let durationMs = 0
        if (selectedQuickRange.value === '1d') durationMs = 24 * 60 * 60 * 1000
        if (selectedQuickRange.value === '7d') durationMs = 7 * 24 * 60 * 60 * 1000
        if (selectedQuickRange.value === '30d') durationMs = 30 * 24 * 60 * 60 * 1000
        if (durationMs > 0) {
          const threshold = now - durationMs
          filtered = filtered.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return date.getTime() >= threshold
          })
        }
      }

      if (selectedQuickRange.value === 'custom' || selectedQuickRange.value === 'all') {
        if (selectedYear.value !== 'all') {
          filtered = filtered.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return String(date.getFullYear()) === selectedYear.value
          })
        }
        if (selectedMonth.value !== 'all') {
          filtered = filtered.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return String(date.getMonth() + 1).padStart(2, '0') === selectedMonth.value
          })
        }
        if (selectedDay.value !== 'all') {
          filtered = filtered.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return String(date.getDate()).padStart(2, '0') === selectedDay.value
          })
        }
      }

      return filtered
    }

    const recent7Stats = computed(() => {
      const timeFiltered = filterBySelectedTimeRange(surgeries.value)
      const count = timeFiltered.length
      if (!count) {
        return {
          count: 0,
          avgDuration: '0分钟',
          faultRate: '0%'
        }
      }

      const totalMinutes = timeFiltered.reduce((sum, item) => sum + getDurationMinutes(item.start_time, item.end_time), 0)
      const avgMinutes = Math.round(totalMinutes / count)
      const faultCount = timeFiltered.filter(item => hasFaultTag(item)).length
      const rate = ((faultCount / count) * 100).toFixed(1)

      return {
        count,
        avgDuration: `${avgMinutes}分钟`,
        faultRate: `${rate}%`
      }
    })

    const buildSurgeryId = (item) => {
      if (!item) return '-'
      const start = item.start_time ? new Date(item.start_time) : null
      if (start && !Number.isNaN(start.getTime())) {
        const year = start.getFullYear()
        const month = String(start.getMonth() + 1).padStart(2, '0')
        const day = String(start.getDate()).padStart(2, '0')
        const hour = String(start.getHours()).padStart(2, '0')
        const minute = String(start.getMinutes()).padStart(2, '0')
        return `${deviceId.value}-${year}${month}${day}${hour}${minute}`
      }
      return item.surgery_id || item.id || `${deviceId.value}-unknown`
    }

    const openVisualization = (item) => {
      try {
        const adapted = adaptSurgeryData(item)
        if (adapted && validateAdaptedData(adapted)) {
          adapted._dataSource = getDataSourceType(item)
          adapted._originalData = item
          sessionStorage.setItem('surgeryVizData', JSON.stringify(adapted))
        } else {
          sessionStorage.removeItem('surgeryVizData')
        }
      } catch (error) {
        console.error('Failed to prepare surgery visualization data:', error)
        sessionStorage.removeItem('surgeryVizData')
      }

      router.push({
        name: 'MSurgeryVisualization',
        params: { surgeryId: item.surgery_id || item.id },
        query: { deviceId: deviceId.value }
      })
    }

    const fetchSurgeries = async () => {
      loading.value = true
      try {
        const all = []
        let pageNo = 1
        const pageSizeFetch = 1000
        let hasMore = true
        let totalCount = 0

        while (hasMore) {
          const resp = await api.surgeries.list({
            device_id: deviceId.value,
            page: pageNo,
            limit: pageSizeFetch
          })

          const pageList = Array.isArray(resp?.data?.data) ? resp.data.data : []
          const total = Number(resp?.data?.total || 0)
          if (pageNo === 1) totalCount = total

          all.push(...pageList)
          hasMore = pageList.length > 0 && all.length < totalCount
          pageNo += 1

          if (all.length >= 50000) {
            console.warn('Device surgeries: too many rows, capped at 50000')
            break
          }
        }

        const mapped = all.map((entry, index) => ({
          ...entry,
          internalId: entry.id ?? entry.surgery_id ?? `${deviceId.value}-${index}`
        }))
        surgeries.value = mapped
        totalSurgeries.value = totalCount || mapped.length
        if (!deviceInfo.value && mapped.length > 0) {
          deviceInfo.value = {
            hospital: mapped[0].hospital_name || mapped[0].hospital_names?.[0] || '-'
          }
        }
        prepared.value = true
      } catch (error) {
        console.error('Failed to load surgeries:', error)
        surgeries.value = []
        prepared.value = true
      } finally {
        loading.value = false
      }
    }

    const getFilteredSource = () => {
      let source = filterBySelectedTimeRange(surgeries.value)

      if (surgeryTypeFilter.value !== 'all') {
        source = source.filter(item => {
          if (surgeryTypeFilter.value === 'remote') return isRemoteSurgery(item)
          if (surgeryTypeFilter.value === 'fault') return isFaultSurgery(item)
          return true
        })
      }

      if (keyword.value.trim()) {
        const kw = keyword.value.trim().toLowerCase()
        source = source.filter(item => {
          const compositeId = buildSurgeryId(item).toLowerCase()
          const procedureText = (item.procedure || '').toLowerCase()
          return compositeId.includes(kw) || procedureText.includes(kw)
        })
      }

      source.sort((a, b) => {
        const aTime = a?.start_time ? new Date(a.start_time).getTime() : 0
        const bTime = b?.start_time ? new Date(b.start_time).getTime() : 0
        return sortOrder.value === 'earliest' ? aTime - bTime : bTime - aTime
      })

      return source
    }

    const appendNextPage = () => {
      if (loading.value) return
      const source = getFilteredSource()
      filteredTotal.value = source.length
      const startIndex = (page.value - 1) * pageSize
      const next = source.slice(startIndex, startIndex + pageSize)
      loading.value = true
      if (page.value === 1) {
        items.value = [...next]
      } else {
        items.value = items.value.concat(next)
      }
      if (items.value.length >= source.length || next.length < pageSize) {
        finished.value = true
      } else {
        page.value += 1
      }
      loading.value = false
    }

    const onLoad = async () => {
      if (loading.value || finished.value) return
      if (!prepared.value) {
        await fetchSurgeries()
        page.value = 1
        finished.value = false
      }
      appendNextPage()
    }

    const resetAndReload = () => {
      page.value = 1
      items.value = []
      finished.value = false
      filteredTotal.value = 0
      if (!prepared.value) {
        onLoad()
        return
      }
      appendNextPage()
    }

    const handleSearchInput = () => {
      resetAndReload()
    }

    const toggleSearch = () => {
      showSearch.value = !showSearch.value
      if (!showSearch.value && keyword.value) {
        keyword.value = ''
        resetAndReload()
      }
      nextTick(updateLayoutMetrics)
    }

    const handleFilterChange = () => {
      resetAndReload()
    }

    const openFilterSheet = (mode = 'all') => {
      sheetMode.value = mode
      filterSheetVisible.value = true
    }

    const closeFilterSheet = () => {
      filterSheetVisible.value = false
    }

    const setSurgeryType = (value) => {
      surgeryTypeFilter.value = value
      resetAndReload()
    }

    const setSortOrder = (value) => {
      sortOrder.value = value
      resetAndReload()
    }

    const clearAllFilters = () => {
      surgeryTypeFilter.value = 'all'
      sortOrder.value = 'latest'
      selectedQuickRange.value = '7d'
      selectedYear.value = 'all'
      selectedMonth.value = 'all'
      selectedDay.value = 'all'
      keyword.value = ''
      resetAndReload()
      closeFilterSheet()
    }

    const selectQuickRange = (value) => {
      if (value === selectedQuickRange.value) return
      selectedQuickRange.value = value
      selectedYear.value = 'all'
      selectedMonth.value = 'all'
      selectedDay.value = 'all'
      resetAndReload()
    }

    const syncTimeFilterSelections = () => {
      if (selectedYear.value !== 'all') {
        const normalizedYear = normalizeYearValue(selectedYear.value)
        if (!normalizedYear || !availableYears.value.includes(normalizedYear)) {
          selectedYear.value = 'all'
          selectedMonth.value = 'all'
          selectedDay.value = 'all'
        } else if (normalizedYear !== selectedYear.value) {
          selectedYear.value = normalizedYear
        }
      }

      if (selectedMonth.value !== 'all') {
        const monthValues = availableMonths.value
        if (!monthValues.includes(selectedMonth.value)) {
          selectedMonth.value = 'all'
          selectedDay.value = 'all'
        }
      }

      if (selectedDay.value !== 'all') {
        const dayValues = availableDays.value
        if (!dayValues.includes(selectedDay.value)) {
          selectedDay.value = 'all'
        }
      }

      if (
        selectedQuickRange.value === 'custom' &&
        selectedYear.value === 'all' &&
        selectedMonth.value === 'all' &&
        selectedDay.value === 'all'
      ) {
        selectedQuickRange.value = 'all'
      }
    }

    const loadTimeFilters = async () => {
      if (!deviceId.value) {
        return
      }

      try {
        const resp = await api.surgeries.getTimeFilters({ device_id: deviceId.value })
        const data = resp?.data?.data || {}

        const yearsArray = Array.isArray(data.years) ? data.years : []
        availableYearValues.value = Array.from(
          new Set(
            yearsArray
              .map(normalizeYearValue)
              .filter(Boolean)
          )
        )

        const monthsResult = {}
        if (data.monthsByYear && typeof data.monthsByYear === 'object') {
          Object.entries(data.monthsByYear).forEach(([year, list]) => {
            const normalizedYear = normalizeYearValue(year)
            if (!normalizedYear) return
            const months = Array.isArray(list) ? list : []
            const uniqueMonths = Array.from(
              new Set(
                months
                  .map(normalizeMonthValue)
                  .filter(Boolean)
              )
            ).sort((a, b) => a.localeCompare(b))
            if (uniqueMonths.length) {
              monthsResult[normalizedYear] = uniqueMonths
            }
          })
        }
        availableMonthsByYear.value = monthsResult

        const daysResult = {}
        if (data.daysByYearMonth && typeof data.daysByYearMonth === 'object') {
          Object.entries(data.daysByYearMonth).forEach(([key, list]) => {
            const [yearPart, monthPart] = key.split('-')
            const normalizedYear = normalizeYearValue(yearPart)
            const normalizedMonth = normalizeMonthValue(monthPart)
            if (!normalizedYear || !normalizedMonth) return
            const days = Array.isArray(list) ? list : []
            const uniqueDays = Array.from(
              new Set(
                days
                  .map(normalizeDayValue)
                  .filter(Boolean)
              )
            ).sort((a, b) => a.localeCompare(b))
            if (uniqueDays.length) {
              daysResult[`${normalizedYear}-${normalizedMonth}`] = uniqueDays
            }
          })
        }
        availableDaysByYearMonth.value = daysResult

        timeFiltersLoaded.value = true
      } catch (error) {
        console.warn('Failed to load time filters:', error)
        timeFiltersLoaded.value = false
      } finally {
        syncTimeFilterSelections()
      }
    }

    const selectYear = (value) => {
      const normalizedValue = value === 'all' ? 'all' : normalizeYearValue(value)
      if (selectedYear.value === normalizedValue) {
        return
      }
      selectedYear.value = normalizedValue || 'all'
      selectedQuickRange.value = selectedYear.value === 'all' ? 'all' : 'custom'
      if (selectedYear.value === 'all') {
        selectedMonth.value = 'all'
        selectedDay.value = 'all'
      } else if (selectedMonth.value !== 'all') {
        const months = availableMonths.value
        if (!months.includes(selectedMonth.value)) {
          selectedMonth.value = 'all'
          selectedDay.value = 'all'
        }
      }
      resetAndReload()
    }

    const selectMonth = (value) => {
      const normalizedValue = value === 'all' ? 'all' : normalizeMonthValue(value)
      if (selectedMonth.value === normalizedValue) {
        return
      }
      selectedMonth.value = normalizedValue || 'all'
      selectedQuickRange.value =
        selectedMonth.value === 'all' && selectedYear.value === 'all' && selectedDay.value === 'all'
          ? 'all'
          : 'custom'
      if (selectedMonth.value === 'all') {
        selectedDay.value = 'all'
      } else {
        const days = availableDays.value
        if (!days.includes(selectedDay.value)) {
          selectedDay.value = 'all'
        }
      }
      resetAndReload()
    }

    const selectDay = (value) => {
      const normalizedValue = value === 'all' ? 'all' : normalizeDayValue(value)
      if (selectedDay.value === normalizedValue) {
        return
      }
      selectedDay.value = normalizedValue || 'all'
      if (
        selectedDay.value === 'all' &&
        selectedYear.value === 'all' &&
        selectedMonth.value === 'all'
      ) {
        selectedQuickRange.value = 'all'
      } else {
        selectedQuickRange.value = 'custom'
      }
      resetAndReload()
    }

    const clearTimeFilters = () => {
      selectedQuickRange.value = 'all'
      selectedYear.value = 'all'
      selectedMonth.value = 'all'
      selectedDay.value = 'all'
      resetAndReload()
      closeFilterSheet()
    }

    const shouldShowRemoteTag = (item) => isRemoteSurgery(item)
    const shouldShowFaultTag = (item) => hasFaultTag(item)

    const getSurgeryStatusKey = (item) => {
      if (shouldShowFaultTag(item)) return 'fault'
      return 'normal'
    }

    const getSurgeryStatusText = (item) => {
      const key = getSurgeryStatusKey(item)
      if (key === 'fault') return t('surgeryVisualization.faultSurgery')
      return translateOr('mobile.deviceSurgeries.normalStatus', '正常')
    }

    const getSurgeryStatusClass = (item) => {
      const key = getSurgeryStatusKey(item)
      if (key === 'fault') return 'is-fault'
      return 'is-normal'
    }

    const updateLayoutMetrics = () => {
      if (typeof window !== 'undefined') {
        viewportHeight.value = window.innerHeight
      }
      if (headerRef.value) {
        headerHeight.value = headerRef.value.getBoundingClientRect().height
      }
      if (filtersRef.value) {
        filtersHeight.value = filtersRef.value.getBoundingClientRect().height
      }
      if (kpiRef.value) {
        kpiHeight.value = kpiRef.value.getBoundingClientRect().height
      }
    }

    const pagePaddingTop = computed(() => headerHeight.value || 0)
    const contentPaddingTop = computed(() => (filtersHeight.value || 0) + (kpiHeight.value || 0) + 16)
    const listMinHeight = computed(() => Math.max(260, viewportHeight.value - contentPaddingTop.value - 20))
    const isEmptyState = computed(() => !loading.value && filteredTotal.value === 0 && finished.value)

    onMounted(async () => {
      // 先加载时间筛选数据
      if (!timeFiltersLoaded.value) {
        await loadTimeFilters()
      }
      await fetchSurgeries()
      resetAndReload()
      nextTick(updateLayoutMetrics)
      window.addEventListener('resize', updateLayoutMetrics)
    })

    // 监听路由参数变化，切换设备时重置状态
    watch(() => route.params?.deviceId, async (newDeviceId, oldDeviceId) => {
      if (newDeviceId && newDeviceId !== oldDeviceId) {
        // 重置状态
        page.value = 1
        items.value = []
        surgeries.value = []
        deviceInfo.value = null
        totalSurgeries.value = 0
        finished.value = false
        loading.value = false
        prepared.value = false
        timeFiltersLoaded.value = false
        availableYearValues.value = []
        availableMonthsByYear.value = {}
        availableDaysByYearMonth.value = {}
        surgeryTypeFilter.value = 'all'
        selectedQuickRange.value = 'all'
        selectedYear.value = 'all'
        selectedMonth.value = 'all'
        selectedDay.value = 'all'
        keyword.value = ''
        // 重新加载数据
        if (!timeFiltersLoaded.value) {
          await loadTimeFilters()
        }
        onLoad()
        nextTick(updateLayoutMetrics)
      }
    })

    onUpdated(() => {
      nextTick(updateLayoutMetrics)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', updateLayoutMetrics)
    })

    return {
      deviceId,
      headerRef,
      topStackRef,
      filtersRef,
      kpiRef,
      headerHeight,
      pagePaddingTop,
      contentPaddingTop,
      listMinHeight,
      isEmptyState,
      deviceInfo,
      totalSurgeries,
      keyword,
      showSearch,
      filterSheetVisible,
      sheetMode,
      surgeryTypeFilter,
      sortOrder,
      selectedYear,
      selectedMonth,
      selectedDay,
      surgeryTypeOptions,
      quickShortcutOptions,
      yearOptions,
      monthOptions,
      dayOptions,
      recent7Stats,
      items,
      filteredTotal,
      loading,
      finished,
      onLoad,
      handleSearchInput,
      toggleSearch,
      handleFilterChange,
      selectedQuickRange,
      quickRangeOptions,
      typeChipLabel,
      timeChipLabel,
      sortChipLabel,
      quickRangeTitle,
      customRangeTitle,
      yearLabel,
      monthLabel,
      dayLabel,
      clearText,
      timeFilterTitle,
      openFilterSheet,
      closeFilterSheet,
      setSurgeryType,
      setSortOrder,
      clearAllFilters,
      selectQuickRange,
      selectYear,
      selectMonth,
      selectDay,
      clearTimeFilters,
      formatTime,
      formatDuration,
      shouldShowRemoteTag,
      shouldShowFaultTag,
      getSurgeryStatusText,
      getSurgeryStatusClass,
      getFaultCount,
      buildSurgeryId,
      openVisualization
    }
  }
}
</script>

<style scoped>
.page {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  background-color: var(--m-color-bg);
  padding-top: 0;
  /* 底部留白由 App.vue 全局样式统一设置 */
  box-sizing: border-box;
}

.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: var(--m-color-surface);
  border-bottom: 1px solid var(--m-color-border);
  padding: var(--m-space-3) var(--m-space-4);
  padding-top: max(var(--m-space-3), calc(env(safe-area-inset-top) + var(--m-space-3)));
}

.header-container {
  display: flex;
  align-items: flex-start;
  gap: var(--m-space-3);
}

.back-icon {
  font-size: 20px;
  color: var(--m-color-text);
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 2px;
}

.header-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  flex-wrap: wrap;
  justify-content: space-between;
}

.header-title {
  font-size: var(--m-font-size-lg);
  font-weight: 600;
  color: var(--m-color-text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.info-text {
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
  line-height: 16px;
}

.content {
  padding: 10px 12px 12px;
  /* 增加底部 padding，确保滚动能正确触发加载（移除底部导航栏后需要更多空间） */
  padding-bottom: max(20px, env(safe-area-inset-bottom) + 20px);
}

.content.is-empty-mode {
  padding-bottom: 0;
}

.top-stack-fixed {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 90;
  background-color: var(--m-color-bg);
}

.kpi-block {
  padding: 0 12px 6px;
}

.kpi-card {
  background-color: var(--m-color-surface);
  border-radius: var(--m-radius-md);
  box-shadow: var(--m-shadow-card);
  padding: 10px 8px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.kpi-item {
  text-align: center;
  border-right: 1px solid var(--m-color-border);
}

.kpi-item:last-child {
  border-right: none;
}

.kpi-value {
  font-size: 16px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--m-color-text);
}

.kpi-label {
  margin-top: 2px;
  font-size: 11px;
  color: var(--m-color-text-secondary);
}

.filters-fixed {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--m-color-bg);
  padding: 8px 12px;
  box-shadow: var(--m-shadow-card);
}

.search-container {
  background-color: var(--m-color-surface);
  padding: 8px;
  border-radius: var(--m-radius-md);
  box-shadow: var(--m-shadow-card);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: var(--m-color-bg);
  border-radius: var(--m-radius-md);
  padding: 0 var(--m-space-3);
  height: 36px;
}

.search-icon {
  font-size: var(--m-font-size-lg);
  color: var(--gray-400);
  margin-right: var(--m-space-2);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--m-font-size-md);
  color: var(--m-color-text);
  outline: none;
}

.search-input::placeholder {
  color: var(--gray-400);
}

.header-search-btn {
  border: none;
  background: transparent;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  font-size: 14px;
  color: var(--m-color-text-secondary);
}

.chip-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.quick-row {
  display: flex;
  gap: 8px;
}

.quick-shortcut {
  border: 1px solid var(--m-color-border);
  background: var(--m-color-surface);
  color: var(--m-color-text-secondary);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
}

.quick-shortcut.active {
  background: var(--m-color-brand);
  border-color: var(--m-color-brand);
  color: var(--m-color-surface);
}

.filter-chip {
  border: 1px solid var(--m-color-border);
  background: var(--m-color-surface);
  color: var(--m-color-text-secondary);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
}

.filter-chip-more {
  color: var(--m-color-brand);
  border-color: rgba(21, 93, 252, 0.3);
}

.sheet-wrap {
  padding: 14px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 70vh;
  overflow: hidden;
}

.sheet-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--m-color-text);
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  position: sticky;
  bottom: 0;
  background: var(--m-color-surface);
  padding-top: 6px;
}

.action-pill-primary {
  background-color: var(--m-color-brand);
  color: var(--m-color-surface);
}

.time-filter-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.time-filter-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: var(--m-font-size-md);
  font-weight: 500;
  color: var(--m-color-text);
}

.time-mode-hint {
  font-size: 12px;
  color: var(--m-color-text-secondary);
  background: var(--gray-100);
  border-radius: 8px;
  padding: 8px 10px;
}

.quick-options {
  display: flex;
  gap: var(--m-space-2);
  flex-wrap: wrap;
}

.quick-option {
  padding: 6px var(--m-space-3);
  border-radius: var(--m-radius-xl);
  background-color: var(--gray-100);
  font-size: 13px;
  color: var(--gray-500);
  transition: all 0.2s ease;
}

.quick-option.active {
  background-color: var(--m-color-brand);
  color: var(--m-color-surface);
}

.custom-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-label {
  font-size: 13px;
  color: var(--gray-500);
}

.option-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2);
  align-content: flex-start;
}

.option-pill {
  padding: 6px var(--m-space-3);
  border-radius: var(--m-radius-xl);
  background-color: var(--gray-100);
  font-size: 13px;
  color: var(--gray-500);
  transition: all 0.2s ease;
}

.option-pill.active {
  background-color: var(--m-color-brand);
  color: var(--m-color-surface);
}

.time-filter-actions {
  display: flex;
  justify-content: flex-end;
}

.action-pill {
  padding: 6px var(--m-space-4);
  border-radius: var(--m-radius-xl);
  background-color: var(--gray-100);
  font-size: 13px;
  color: var(--gray-500);
  transition: all 0.2s ease;
}

.action-pill:hover {
  background-color: var(--m-color-brand);
  color: var(--m-color-surface);
}

.surgery-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.surgery-card {
  background-color: var(--m-color-surface);
  border-radius: var(--m-radius-md);
  overflow: hidden;
  box-shadow: var(--m-shadow-card);
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.surgery-card:active {
  background-color: var(--m-color-bg);
  transform: scale(0.98);
}

.card-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.surgery-id {
  font-size: var(--m-font-size-lg);
  font-weight: 600;
  color: var(--m-color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.status-chip {
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.card-mid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.surgery-procedure {
  font-size: 13px;
  color: var(--m-color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-row {
  display: flex;
  align-items: center;
  font-size: var(--m-font-size-md);
  gap: var(--m-space-1);
}

.time-row-primary {
  font-size: 13px;
}

.time-label {
  color: var(--gray-500);
}

.time-value {
  color: var(--m-color-text);
  font-weight: 500;
}

.card-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.meta-item {
  font-size: 12px;
  color: var(--m-color-text-secondary);
}

.status-chip.is-normal {
  background: rgba(18, 183, 106, 0.14);
  color: #067647;
}

.status-chip.is-fault {
  background: rgba(240, 68, 56, 0.14);
  color: #b42318;
}

.status-chip.is-remote {
  background: rgba(37, 99, 235, 0.14);
  color: #1d4ed8;
}



.list-stage {
  min-height: var(--list-min-height);
}

.surgery-list-container {
  min-height: var(--list-min-height);
}

.empty-state {
  min-height: var(--list-min-height);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state :deep(.van-empty) {
  padding: 0;
}


:deep(.van-list__loading) {
  min-height: var(--list-min-height);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--gray-400);
  font-size: var(--m-font-size-md);
}

:deep(.van-list__finished) {
  padding: var(--m-space-5) 0;
  text-align: center;
  color: var(--gray-400);
  font-size: var(--m-font-size-md);
}

</style>
