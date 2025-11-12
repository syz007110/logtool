<template>
  <div class="page" :style="{ paddingTop: pagePaddingTop + 'px' }">
    <div class="mobile-header" ref="headerRef">
      <div class="header-container">
        <van-icon name="arrow-left" class="back-icon" @click="$router.back()" />
        <div class="header-content">
            <div class="header-row">
              <div class="header-title">{{ deviceId }}</div>
              <div v-if="deviceInfo" class="header-meta">
                <span class="info-text">
                  {{ $t('mobile.deviceSurgeries.hospitalName') }}：{{ deviceInfo.hospital || '-' }}
                </span>
              </div>
              <div class="header-total">
                <span class="info-text">
                  <span class="info-value-primary">{{ totalSurgeries }}</span>{{ $t('mobile.deviceSurgeries.surgeriesUnit') }}
                </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="filters-fixed"
      ref="filtersRef"
      :style="{ top: headerHeight + 'px' }"
    >
      <!-- 搜索框 -->
      <div class="search-container">
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

      <!-- 筛选按钮 -->
      <div class="filter-menu">
        <van-dropdown-menu>
          <van-dropdown-item
            v-model="surgeryTypeFilter"
            :options="surgeryTypeOptions"
            @change="handleFilterChange"
          />
          <van-dropdown-item
            ref="timeDropdownRef"
            :title="timeFilterTitle"
            @open="onTimeDropdownOpen"
          >
            <div class="time-filter-panel">
              <div class="time-filter-section">
                <div class="section-title">{{ quickRangeTitle }}</div>
                <div class="quick-options">
                  <div
                    v-for="option in quickRangeOptions"
                    :key="option.value"
                    class="quick-option"
                    :class="{ active: selectedQuickRange === option.value }"
                    @click="selectQuickRange(option.value)"
                  >
                    {{ option.text }}
                  </div>
                </div>
              </div>
              <div class="time-filter-section">
                <div class="section-title">{{ customRangeTitle }}</div>
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
                  <div class="custom-row">
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
                  <div class="custom-row">
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
              <div class="time-filter-actions">
                <div class="action-pill" @click="clearTimeFilters">
                  {{ clearText }}
                </div>
              </div>
            </div>
          </van-dropdown-item>
        </van-dropdown-menu>
      </div>
    </div>

    <div class="content" :style="{ paddingTop: contentPaddingTop + 'px' }">
      <!-- 手术列表 -->
      <van-list :finished="finished" :loading="loading" :offset="100" @load="onLoad">
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
                <div v-if="shouldShowTypeBadges(item)" class="type-badges">
                  <van-tag
                    v-if="shouldShowRemoteTag(item)"
                    type="primary"
                    size="small"
                    class="type-badge"
                  >
                    {{ $t('surgeryVisualization.remoteSurgery') }}
                  </van-tag>
                  <van-tag
                    v-if="shouldShowFaultTag(item)"
                    type="danger"
                    size="small"
                    class="type-badge"
                  >
                    {{ $t('surgeryVisualization.faultSurgery') }}
                  </van-tag>
                </div>
              </div>
              <div class="card-mid">
                <div class="card-subheader">
                  <div class="surgery-procedure">{{ item.procedure || '-' }}</div>
                </div>
                <div class="time-info-list">
                  <div class="time-row">
                    <span class="time-label">{{ $t('mobile.deviceSurgeries.startTime') }}:</span>
                    <span class="time-value">{{ formatTime(item.start_time) }}</span>
                  </div>
                  <div class="time-row">
                    <span class="time-label">{{ $t('mobile.deviceSurgeries.endTime') }}:</span>
                    <span class="time-value">{{ formatTime(item.end_time) }}</span>
                  </div>
                  <div class="time-row">
                    <span class="time-label">{{ $t('mobile.deviceSurgeries.duration') }}:</span>
                    <span class="time-value">{{ formatDuration(item.start_time, item.end_time) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </van-list>
      
      <!-- 空状态 -->
      <van-empty
        v-if="!loading && filteredTotal === 0 && finished"
        :description="$t('shared.noData')"
        class="empty-state"
      />
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
  Tag as VanTag,
  DropdownMenu,
  DropdownItem
} from 'vant'
import api from '@/api'
import { adaptSurgeryData, validateAdaptedData, getDataSourceType } from '@/utils/surgeryDataAdapter'

export default {
  name: 'MDeviceSurgeries',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon,
    'van-tag': VanTag,
    'van-dropdown-menu': DropdownMenu,
    'van-dropdown-item': DropdownItem
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const deviceId = computed(() => route.params?.deviceId || '')
    const headerRef = ref(null)
    const filtersRef = ref(null)
    const headerHeight = ref(0)
    const filtersHeight = ref(0)
    const keyword = ref('')
    const surgeryTypeFilter = ref('all')
    const selectedQuickRange = ref('all')
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
    const timeDropdownRef = ref(null)

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
        const resp = await api.surgeries.list({
          device_id: deviceId.value,
          limit: 10000
        })
        const list = resp?.data?.data || []
        const mapped = list.map((entry, index) => ({
          ...entry,
          internalId: entry.id ?? entry.surgery_id ?? `${deviceId.value}-${index}`
        }))
        surgeries.value = mapped
        totalSurgeries.value = resp?.data?.total || mapped.length
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
      let source = [...surgeries.value]
      if (surgeryTypeFilter.value !== 'all') {
        source = source.filter(item => {
          if (surgeryTypeFilter.value === 'remote') return isRemoteSurgery(item)
          if (surgeryTypeFilter.value === 'fault') return isFaultSurgery(item)
          return true
        })
      }

      if (selectedQuickRange.value !== 'all' && selectedQuickRange.value !== 'custom') {
        const now = Date.now()
        let durationMs = 0
        if (selectedQuickRange.value === '1d') durationMs = 24 * 60 * 60 * 1000
        if (selectedQuickRange.value === '7d') durationMs = 7 * 24 * 60 * 60 * 1000
        if (selectedQuickRange.value === '30d') durationMs = 30 * 24 * 60 * 60 * 1000
        if (durationMs > 0) {
          const threshold = now - durationMs
          source = source.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return date.getTime() >= threshold
          })
        }
      }

      if (selectedQuickRange.value === 'custom' || selectedQuickRange.value === 'all') {
        if (selectedYear.value !== 'all') {
          source = source.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return String(date.getFullYear()) === selectedYear.value
          })
        }
        if (selectedMonth.value !== 'all') {
          source = source.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return String(date.getMonth() + 1).padStart(2, '0') === selectedMonth.value
          })
        }
        if (selectedDay.value !== 'all') {
          source = source.filter(item => {
            if (!item.start_time) return false
            const date = new Date(item.start_time)
            if (Number.isNaN(date.getTime())) return false
            return String(date.getDate()).padStart(2, '0') === selectedDay.value
          })
        }
      }
      if (keyword.value.trim()) {
        const kw = keyword.value.trim().toLowerCase()
        source = source.filter(item => {
          const compositeId = buildSurgeryId(item).toLowerCase()
          const procedureText = (item.procedure || '').toLowerCase()
          return compositeId.includes(kw) || procedureText.includes(kw)
        })
      }
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

    const handleFilterChange = () => {
      resetAndReload()
    }

    const closeTimeDropdown = () => {
      timeDropdownRef.value?.toggle(false)
    }

    const onTimeDropdownOpen = () => {
      // no-op placeholder for future analytics hooks
    }

    const selectQuickRange = (value) => {
      if (value === selectedQuickRange.value) {
        closeTimeDropdown()
        return
      }
      selectedQuickRange.value = value
      if (value !== 'custom') {
        selectedYear.value = 'all'
        selectedMonth.value = 'all'
        selectedDay.value = 'all'
      }
      resetAndReload()
      if (value !== 'custom') {
        closeTimeDropdown()
      }
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
      closeTimeDropdown()
    }

    const shouldShowRemoteTag = (item) => isRemoteSurgery(item)
    const shouldShowFaultTag = (item) => hasFaultTag(item)
    const shouldShowTypeBadges = (item) => shouldShowRemoteTag(item) || shouldShowFaultTag(item)

    const updateLayoutMetrics = () => {
      if (headerRef.value) {
        headerHeight.value = headerRef.value.getBoundingClientRect().height
      }
      if (filtersRef.value) {
        filtersHeight.value = filtersRef.value.getBoundingClientRect().height
      }
    }

    const pagePaddingTop = computed(() => headerHeight.value || 0)
    const contentPaddingTop = computed(() => (filtersHeight.value || 0) + 12)

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
      filtersRef,
      headerHeight,
      pagePaddingTop,
      contentPaddingTop,
      deviceInfo,
      totalSurgeries,
      keyword,
      surgeryTypeFilter,
      selectedYear,
      selectedMonth,
      selectedDay,
      surgeryTypeOptions,
      yearOptions,
      monthOptions,
      dayOptions,
      items,
      filteredTotal,
      loading,
      finished,
      onLoad,
      handleSearchInput,
      handleFilterChange,
      timeDropdownRef,
      selectedQuickRange,
      quickRangeOptions,
      quickRangeTitle,
      customRangeTitle,
      yearLabel,
      monthLabel,
      dayLabel,
      clearText,
      timeFilterTitle,
      selectQuickRange,
      selectYear,
      selectMonth,
      selectDay,
      clearTimeFilters,
      onTimeDropdownOpen,
      formatTime,
      formatDuration,
      shouldShowTypeBadges,
      shouldShowRemoteTag,
      shouldShowFaultTag,
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
  background-color: #f7f8fa;
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
  background-color: #fff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  padding: 12px 16px;
  padding-top: max(12px, calc(env(safe-area-inset-top) + 12px));
}

.header-container {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.back-icon {
  font-size: 20px;
  color: #323233;
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
  gap: 8px;
  flex-wrap: wrap;
  justify-content: space-between;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #101828;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.header-total {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
}

.info-text {
  font-size: 12px;
  color: #6a7282;
  line-height: 16px;
}

.info-value-primary {
  color: #155dfc;
  font-weight: 600;
  margin-right: 2px;
}

.content {
  padding: 12px;
  /* 增加底部 padding，确保滚动能正确触发加载（移除底部导航栏后需要更多空间） */
  padding-bottom: max(20px, env(safe-area-inset-bottom) + 20px);
}

.filters-fixed {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: #f7f8fa;
  padding: 12px;
  padding-bottom: 12px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.search-container {
  background-color: #fff;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: #f7f8fa;
  border-radius: 8px;
  padding: 0 12px;
  height: 36px;
}

.search-icon {
  font-size: 16px;
  color: #969799;
  margin-right: 8px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #323233;
  outline: none;
}

.search-input::placeholder {
  color: #969799;
}

.filter-menu {
  background-color: transparent;
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
  font-size: 14px;
  font-weight: 500;
  color: #323233;
}

.quick-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-option {
  padding: 6px 12px;
  border-radius: 16px;
  background-color: #f2f3f5;
  font-size: 13px;
  color: #646566;
  transition: all 0.2s ease;
}

.quick-option.active {
  background-color: #1989fa;
  color: #fff;
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
  color: #646566;
}

.option-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-pill {
  padding: 6px 12px;
  border-radius: 16px;
  background-color: #f2f3f5;
  font-size: 13px;
  color: #646566;
  transition: all 0.2s ease;
}

.option-pill.active {
  background-color: #1989fa;
  color: #fff;
}

.time-filter-actions {
  display: flex;
  justify-content: flex-end;
}

.action-pill {
  padding: 6px 16px;
  border-radius: 16px;
  background-color: #f2f3f5;
  font-size: 13px;
  color: #646566;
  transition: all 0.2s ease;
}

.action-pill:hover {
  background-color: #1989fa;
  color: #fff;
}

.surgery-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.surgery-card {
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.surgery-card:active {
  background-color: #f7f8fa;
  transform: scale(0.98);
}

.card-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.surgery-id {
  font-size: 16px;
  font-weight: 600;
  color: #323233;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-badge {
  flex-shrink: 0;
}

.type-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-mid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.surgery-procedure {
  font-size: 14px;
  font-weight: 500;
  color: #323233;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-info-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.time-row {
  display: flex;
  align-items: center;
  font-size: 14px;
  gap: 4px;
}

.time-label {
  color: #646566;
}

.time-value {
  color: #323233;
  font-weight: 500;
}


.empty-state {
  margin-top: 60px;
}

:deep(.van-list__loading) {
  padding: 20px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}

:deep(.van-list__finished) {
  padding: 20px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}

:deep(.van-dropdown-menu) {
  background-color: #fff;
  border-radius: 8px;
}

:deep(.van-dropdown-menu__item) {
  padding: 0 12px;
}
</style>
