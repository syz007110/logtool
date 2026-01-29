<template>
  <div class="page" :style="{ paddingTop: pagePaddingTop + 'px' }">
    <!-- 顶部导航栏 -->
    <div class="mobile-header" ref="headerRef">
      <div class="header-container">
        <van-icon name="arrow-left" class="back-icon" @click="$router.back()" />
        <div class="header-content">
          <!-- 同一行：设备编号、医院名称、日志总数 -->
          <div class="header-row">
            <div class="header-title">{{ deviceId }}</div>
            <div v-if="deviceInfo" class="header-hospital">
              <span class="info-text">{{ $t('mobile.deviceLogs.hospitalName') || '医院名称' }}：{{ deviceInfo.hospital || '-' }}</span>
            </div>
            <div v-if="deviceInfo" class="header-logs">
              <span class="info-text">{{ $t('logs.logCount') || '日志总数' }}：<span class="info-value-primary">{{ totalLogs }}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 筛选区域（固定定位） -->
    <div
      class="filter-section"
      ref="filtersRef"
      :style="{ top: headerHeight + 'px' }"
    >
      <div class="filter-menu">
        <van-dropdown-menu>
          <van-dropdown-item
            v-model="statusFilter"
            :options="statusOptions"
            @change="handleStatusSelect"
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

    <!-- 日志列表内容区域 -->
    <div class="content" :style="{ paddingTop: contentPaddingTop + 'px' }">
      <van-list :finished="finished" :loading="loading" :offset="100" @load="onLoad">
        <div class="log-list">
          <div
            v-for="log in filteredLogs"
            :key="log.id"
            class="log-card"
            @click="viewLog(log)"
          >
            <div class="card-content">
              <!-- 文件名 -->
              <div class="file-name">{{ log.original_name || '-' }}</div>
              
              <!-- 状态和操作 -->
              <div class="card-footer">
                <!-- 点击查看文字（仅当状态为完成时显示） -->
                <div
                  v-if="log.status === 'parsed' || log.status === 'completed'"
                  class="view-text"
                >
                  点击查看
                </div>

                <!-- 状态Badge -->
                <div class="status-badge-wrapper">
                  <div :class="['status-badge', getStatusBadgeClass(log.status)]">
                    <van-icon :name="getStatusIcon(log.status)" class="status-icon" />
                    <span>{{ getStatusText(log.status) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </van-list>
      
      <!-- 空状态 -->
      <van-empty
        v-if="!loading && filteredLogs.length === 0 && finished"
        :description="$t('shared.noData')"
        class="empty-state"
      />
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { 
  List as VanList, 
  Empty as VanEmpty,
  Icon as VanIcon,
  DropdownMenu,
  DropdownItem
} from 'vant'
import api from '@/api'

export default {
  name: 'MDeviceLogs',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon,
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
    const allLogs = ref([])
    const deviceInfo = ref(null)
    const totalLogs = ref(0)
    const loading = ref(false)
    const finished = ref(false)
    const statusFilter = ref('all')
    const selectedQuickRange = ref('all')
    const selectedYear = ref('all')
    const selectedMonth = ref('all')
    const selectedDay = ref('all')
    const timeDropdownRef = ref(null)
    const page = ref(1)
    const pageSize = 20
    const currentYear = new Date().getFullYear()

    const timeFiltersLoaded = ref(false)
    const availableYearValues = ref([])
    const availableMonthsByYear = ref({})
    const availableDaysByYearMonth = ref({})

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

    const translateOr = (key, fallback) => {
      const result = t(key)
      return result === key ? fallback : result
    }

    const statusOptions = computed(() => ([
      { text: t('mobile.deviceLogs.statusAll'), value: 'all' },
      { text: t('mobile.deviceLogs.statusCompleted'), value: 'completed' },
      { text: t('mobile.deviceLogs.statusIncomplete'), value: 'incomplete' }
    ]))

    const quickRangeOptions = computed(() => ([
      { text: translateOr('mobile.deviceLogs.timeAll', '全部时间'), value: 'all' },
      { text: translateOr('mobile.deviceLogs.last1Day', '近1天'), value: '1d' },
      { text: translateOr('mobile.deviceLogs.last7Days', '近7天'), value: '7d' },
      { text: translateOr('mobile.deviceLogs.last30Days', '近30天'), value: '30d' }
    ]))

    const quickRangeTitle = computed(() =>
      translateOr('mobile.deviceLogs.quickRangeTitle', '快捷选择')
    )

    const customRangeTitle = computed(() =>
      translateOr('mobile.deviceLogs.customRangeTitle', '自定义日期')
    )

    const yearLabel = computed(() =>
      translateOr('mobile.deviceLogs.yearLabel', '年份')
    )

    const monthLabel = computed(() =>
      translateOr('mobile.deviceLogs.monthLabel', '月份')
    )

    const dayLabel = computed(() =>
      translateOr('mobile.deviceLogs.dayLabel', '日期')
    )

    const clearText = computed(() =>
      translateOr('mobile.deviceLogs.clearTimeFilter', '清除筛选')
    )

    const quickRangeMap = computed(() => {
      const map = {}
      quickRangeOptions.value.forEach(option => {
        map[option.value] = option.text
      })
      return map
    })

    const parseLogDate = (log) => {
      if (!log) return null
      const nameCandidates = [
        log.original_name,
        log.originalName,
        log.file_name,
        log.fileName,
        log.name
      ].filter(Boolean)

      for (const candidate of nameCandidates) {
        const match = /^(\d{4})(\d{2})(\d{2})(\d{2})/.exec(candidate)
        if (match) {
          const [, year, month, day, hour] = match
          const parsed = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            0,
            0,
            0
          )
          if (!Number.isNaN(parsed.getTime())) {
            return parsed
          }
        }
      }

      const fallbackFields = [
        log.completed_at,
        log.completedAt,
        log.updated_at,
        log.updatedAt,
        log.created_at,
        log.createdAt,
        log.uploaded_at,
        log.uploadedAt
      ]

      for (const field of fallbackFields) {
        if (!field) continue
        const parsed = new Date(field)
        if (!Number.isNaN(parsed.getTime())) {
          return parsed
        }
      }

      return null
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
      const suffix = translateOr('mobile.deviceLogs.yearSuffix', '年')
      const years = availableYears.value.length ? availableYears.value : [String(currentYear)]
      const uniqueYears = Array.from(new Set(years))
      return [
        { text: translateOr('mobile.deviceLogs.timeAll', '全部年份'), value: 'all' },
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
        for (let m = 1; m <= 12; m += 1) {
          monthsSet.add(String(m).padStart(2, '0'))
        }
      }

      return Array.from(monthsSet).sort((a, b) => a.localeCompare(b))
    })

    const monthOptions = computed(() => {
      const suffix = translateOr('mobile.deviceLogs.monthSuffix', '月')
      return [
        { text: translateOr('mobile.deviceLogs.monthAll', '全部月份'), value: 'all' },
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
        const key = `${selectedYear.value}-${selectedMonth.value}`
        const days = daysMap[key] || []
        days.forEach(day => {
          const normalized = normalizeDayValue(day)
          if (normalized) {
            daysSet.add(normalized)
          }
        })
      } else if (selectedYear.value !== 'all') {
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
      } else if (selectedMonth.value !== 'all') {
        Object.entries(daysMap).forEach(([key, list]) => {
          if (key.endsWith(`-${selectedMonth.value}`)) {
            (list || []).forEach(day => {
              const normalized = normalizeDayValue(day)
              if (normalized) {
                daysSet.add(normalized)
              }
            })
          }
        })
      } else {
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
        for (let d = 1; d <= 31; d += 1) {
          daysSet.add(String(d).padStart(2, '0'))
        }
      }

      return Array.from(daysSet).sort((a, b) => a.localeCompare(b))
    })

    const dayOptions = computed(() => {
      const suffix = translateOr('mobile.deviceLogs.daySuffix', '日')
      return [
        { text: translateOr('mobile.deviceLogs.dayAll', '全部日期'), value: 'all' },
        ...availableDays.value.map(day => {
          const normalized = normalizeDayValue(day)
          return {
            text: `${normalized}${suffix}`,
            value: normalized
          }
        })
      ]
    })

    const timeFilterTitle = computed(() => {
      if (selectedQuickRange.value !== 'custom') {
        return quickRangeMap.value[selectedQuickRange.value] || quickRangeOptions.value[0]?.text || ''
      }

      if (selectedYear.value === 'all' && selectedMonth.value === 'all' && selectedDay.value === 'all') {
        return quickRangeOptions.value[0]?.text || ''
      }

      const segments = []
      if (selectedYear.value !== 'all') segments.push(selectedYear.value)
      if (selectedMonth.value !== 'all') segments.push(selectedMonth.value)
      if (selectedDay.value !== 'all') segments.push(selectedDay.value)
      return segments.join('-')
    })

    const normalizeToHour = (input) => {
      const date = new Date(input)
      if (Number.isNaN(date.getTime())) return null
      date.setMinutes(0, 0, 0)
      return date
    }

    const formatDateParam = (input) => {
      const date = normalizeToHour(input)
      if (!date) return null
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      return `${year}${month}${day}${hour}`
    }

    const getQuickRangeDates = (range) => {
      const now = new Date()
      const endDate = normalizeToHour(now) || now
      const startDate = new Date(endDate)

      if (range === '1d') {
        startDate.setDate(startDate.getDate() - 1)
      } else if (range === '7d') {
        startDate.setDate(startDate.getDate() - 7)
      } else if (range === '30d') {
        startDate.setDate(startDate.getDate() - 30)
      }

      return {
        start: normalizeToHour(startDate),
        end: endDate
      }
    }

    const resolveTimeRange = () => {
      const defaultResult = { time_range_start: null, time_range_end: null }

      if (
        selectedQuickRange.value === 'all' &&
        selectedYear.value === 'all' &&
        selectedMonth.value === 'all' &&
        selectedDay.value === 'all'
      ) {
        return defaultResult
      }

      if (selectedQuickRange.value !== 'custom' && selectedQuickRange.value !== 'all') {
        const { start, end } = getQuickRangeDates(selectedQuickRange.value)
        return {
          time_range_start: formatDateParam(start),
          time_range_end: formatDateParam(end)
        }
      }

      const normalizedYear = normalizeYearValue(
        selectedYear.value === 'all' ? currentYear : selectedYear.value
      )
      if (!normalizedYear) {
        return defaultResult
      }

      const year = Number(normalizedYear)
      if (Number.isNaN(year)) {
        return defaultResult
      }

      const monthValue = selectedMonth.value === 'all' ? null : Number(selectedMonth.value)
      const dayValue = selectedDay.value === 'all' ? null : Number(selectedDay.value)

      let startDate = new Date(year, (monthValue || 1) - 1, dayValue || 1, 0, 0, 0, 0)
      let endDate

      if (dayValue) {
        endDate = new Date(year, (monthValue || 1) - 1, dayValue, 23, 59, 59, 999)
      } else if (monthValue) {
        endDate = new Date(year, monthValue, 0, 23, 59, 59, 999)
      } else {
        endDate = new Date(year, 11, 31, 23, 59, 59, 999)
      }

      return {
        time_range_start: formatDateParam(startDate),
        time_range_end: formatDateParam(endDate)
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

    const deriveTimeFiltersFromLogs = () => {
      const yearSet = new Set()
      const monthsMap = {}
      const daysMap = {}

      allLogs.value.forEach(log => {
        const date = parseLogDate(log)
        if (!date) return
        const year = normalizeYearValue(date.getFullYear())
        if (!year) return
        yearSet.add(year)

        const month = normalizeMonthValue(date.getMonth() + 1)
        if (month) {
          if (!monthsMap[year]) {
            monthsMap[year] = new Set()
          }
          monthsMap[year].add(month)
        }

        const day = normalizeDayValue(date.getDate())
        if (day && month) {
          const key = `${year}-${month}`
          if (!daysMap[key]) {
            daysMap[key] = new Set()
          }
          daysMap[key].add(day)
        }
      })

      availableYearValues.value = Array.from(yearSet)

      const formattedMonths = {}
      Object.entries(monthsMap).forEach(([year, set]) => {
        formattedMonths[year] = Array.from(set).sort((a, b) => a.localeCompare(b))
      })
      availableMonthsByYear.value = formattedMonths

      const formattedDays = {}
      Object.entries(daysMap).forEach(([key, set]) => {
        formattedDays[key] = Array.from(set).sort((a, b) => a.localeCompare(b))
      })
      availableDaysByYearMonth.value = formattedDays

      syncTimeFilterSelections()
    }

    const loadTimeFilters = async () => {
      if (!deviceId.value) {
        return
      }

      try {
        const resp = await api.logs.getTimeFilters({ device_id: deviceId.value })
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

    const closeTimeDropdown = () => {
      timeDropdownRef.value?.toggle(false)
    }

    const onTimeDropdownOpen = () => {
      // placeholder for analytics hooks
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

    // 定义完成状态和未完成状态
    const completedStatuses = ['parsed', 'completed']
    const incompleteStatuses = [
      'uploading',
      'queued',
      'decrypting',
      'parsing',
      'failed',
      'decrypt_failed',
      'parse_failed',
      'file_error',
      'processing_failed',
      'process_failed',
      'handle_failed',
      'upload_failed'
    ]

    // 状态筛选在前端进行（因为后端不支持状态筛选参数）
    // 时间筛选在后端进行（使用 time_range_start 和 time_range_end）
    const filteredLogs = computed(() => {
      // 如果状态筛选是"全部"，直接返回
      if (statusFilter.value === 'all') {
        return allLogs.value
      }
      // 完成状态：只显示已完成的状态
      if (statusFilter.value === 'completed') {
        return allLogs.value.filter(log => completedStatuses.includes(log.status))
      }
      // 未完成状态：显示所有未完成的状态
      if (statusFilter.value === 'incomplete') {
        return allLogs.value.filter(log => incompleteStatuses.includes(log.status))
      }
      // 默认返回全部
      return allLogs.value
    })

    const fetchDeviceInfo = async () => {
      // 如果 deviceInfo 已经设置（从日志中提取），就不需要再获取
      if (deviceInfo.value) {
        return
      }
      
      try {
        // 方法1：尝试从 getByDevice 获取（不使用 limit: 1，而是获取所有设备组）
        const resp = await api.logs.getByDevice({ device_id: deviceId.value, limit: 10000 })
        const groups = resp?.data?.device_groups || []
        const group = groups.find(g => g.device_id === deviceId.value)
        if (group) {
          deviceInfo.value = {
            hospital: group.hospital_name || '-'
          }
          // 如果 totalLogs 还没有设置，使用设备组的 log_count
          if (!totalLogs.value) {
            totalLogs.value = group.log_count || 0
          }
        } else {
          // 如果没找到设备组，从日志列表中提取设备信息（fetchPage 已经执行）
          extractDeviceInfoFromLogs()
        }
      } catch (error) {
        console.error('Failed to fetch device info:', error)
        // 如果出错，从日志列表中提取设备信息
        extractDeviceInfoFromLogs()
      } finally {
        nextTick(updateLayoutMetrics)
      }
    }
    
    const extractDeviceInfoFromLogs = () => {
      if (allLogs.value.length > 0) {
        const firstLog = allLogs.value[0]
        deviceInfo.value = {
          hospital: firstLog.hospital_name || '-'
        }
      } else {
        deviceInfo.value = {
          hospital: '-'
        }
      }
    }

    const fetchPage = async (currentPage) => {
      if (loading.value) return
      
      try {
        loading.value = true
        
        // 使用传入的页码，避免在 onLoad 中提前递增导致的问题
        const pageToFetch = currentPage !== undefined ? currentPage : page.value
        
        // 构建查询参数
        const params = {
          page: pageToFetch,
          limit: pageSize,
          device_id: deviceId.value
        }
        
        // 添加时间范围筛选（转换为文件名前缀格式 YYYYMMDDHH）
        const timeRangeParams = resolveTimeRange()
        if (timeRangeParams.time_range_start) {
          params.time_range_start = timeRangeParams.time_range_start
        }
        if (timeRangeParams.time_range_end) {
          params.time_range_end = timeRangeParams.time_range_end
        }
        
        const resp = await api.logs.getList(params)
        const list = resp?.data?.logs || []
        const total = resp?.data?.total || 0
        
        // 调试信息：记录请求参数和响应
        console.log('fetchPage - Request params:', params)
        console.log('fetchPage - Response:', { listLength: list.length, total, pageToFetch })
        
        if (pageToFetch === 1) {
          // 第一页，替换所有数据
          allLogs.value = list
          totalLogs.value = total
          
          // 如果 deviceInfo 还没有设置，从日志中提取
          if (!deviceInfo.value && list.length > 0) {
            const firstLog = list[0]
            deviceInfo.value = {
              hospital: firstLog.hospital_name || '-'
            }
          }
        } else {
          // 后续页，追加数据（去重，避免重复数据）
          const existingIds = new Set(allLogs.value.map(log => log.id))
          const newLogs = list.filter(log => !existingIds.has(log.id))
          allLogs.value = [...allLogs.value, ...newLogs]
          console.log('Appended logs:', newLogs.length, 'Total now:', allLogs.value.length)
        }

        if (!timeFiltersLoaded.value) {
          deriveTimeFiltersFromLogs()
        }
        
        // 判断是否还有更多数据
        // 1. 如果返回的数据为空，说明没有更多数据
        // 2. 如果返回的数据少于 pageSize，说明已经是最后一页
        // 3. 如果已加载的数据量已经达到或超过总数
        if (list.length === 0 || allLogs.value.length >= total) {
          finished.value = true
          console.log('Marked as finished - list.length:', list.length, 'allLogs.length:', allLogs.value.length, 'total:', total)
        } else if (list.length < pageSize) {
          // 返回的数据少于 pageSize，说明是最后一页
          finished.value = true
          console.log('Marked as finished - last page, list.length:', list.length, '< pageSize:', pageSize)
        } else {
          finished.value = false
          console.log('More data available - allLogs.length:', allLogs.value.length, 'total:', total)
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error)
        finished.value = true
      } finally {
        loading.value = false
        nextTick(updateLayoutMetrics)
      }
    }

    const onLoad = async () => {
      console.log('onLoad called, page:', page.value, 'finished:', finished.value, 'loading:', loading.value, 'allLogs.length:', allLogs.value.length, 'totalLogs:', totalLogs.value)
      
      if (finished.value) {
        console.log('onLoad skipped: already finished')
        return
      }
      
      if (loading.value) {
        console.log('onLoad skipped: already loading')
        return
      }
      
      // 保存当前页码，避免在 fetchPage 执行过程中被修改
      const currentPage = page.value
      console.log('Starting to load page:', currentPage)
      
      // 如果是第一页，先获取设备信息
      if (currentPage === 1) {
        if (!timeFiltersLoaded.value) {
          await loadTimeFilters()
        }
        await fetchDeviceInfo()
      }
      
      // 加载当前页数据（传入当前页码，避免使用可能被修改的 page.value）
      await fetchPage(currentPage)
      
      // 加载完成后，如果还有更多数据，增加页码准备下次加载
      // 注意：只有在确实还有更多数据时才增加页码
      if (!finished.value && allLogs.value.length < totalLogs.value) {
        page.value = currentPage + 1
        console.log('Page incremented to:', page.value, 'Ready for next load. Current:', allLogs.value.length, 'Total:', totalLogs.value)
      } else {
        console.log('All data loaded, finished. Total loaded:', allLogs.value.length, 'Total:', totalLogs.value)
      }
    }
    
    // 筛选条件变化时，重置分页并重新加载
    const resetAndReload = () => {
      page.value = 1
      allLogs.value = []
      finished.value = false
      onLoad()
    }

    const handleStatusSelect = (value) => {
      statusFilter.value = value
      resetAndReload()
    }

    const getStatusBadgeClass = (status) => {
      if (status === 'parsed' || status === 'completed') {
        return 'status-badge-success'
      }
      return 'status-badge-error'
    }

    const formatFileSize = (bytes) => {
      if (!bytes) return '-'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

    const getUploaderName = (log) => {
      return log.uploader_name || log.uploader_id || t('mobile.deviceLogs.unknownUser')
    }

    const getStatusText = (status) => {
      const statusMap = {
        'uploading': t('logs.statusText.uploading'),
        'queued': t('logs.statusText.queued'),
        'decrypting': t('logs.statusText.decrypting'),
        'parsing': t('logs.statusText.parsing'),
        'parsed': t('logs.statusText.parsed'),
        'completed': t('logs.statusText.parsed'), // 兼容别名
        'failed': t('logs.statusText.failed'),
        'decrypt_failed': t('logs.statusText.decrypt_failed'),
        'parse_failed': t('logs.statusText.parse_failed'),
        'file_error': t('logs.statusText.file_error')
      }
      return statusMap[status] || status || '-'
    }

    const getStatusIcon = (status) => {
      const iconMap = {
        'uploading': 'clock-o',
        'queued': 'clock-o',
        'decrypting': 'lock-o',
        'parsing': 'setting-o',
        'parsed': 'checked',
        'completed': 'checked', // 兼容别名
        'failed': 'close',
        'decrypt_failed': 'warning-o',
        'parse_failed': 'close',
        'file_error': 'warning-o'
      }
      return iconMap[status] || 'info-o'
    }

    const getStatusTagType = (status) => {
      const typeMap = {
        'uploading': 'warning',
        'queued': 'primary',
        'decrypting': 'warning',
        'parsing': 'primary',
        'parsed': 'success',
        'completed': 'success', // 兼容别名
        'failed': 'danger',
        'decrypt_failed': 'danger',
        'parse_failed': 'danger',
        'file_error': 'danger'
      }
      return typeMap[status] || 'default'
    }

    const viewLog = (log) => {
      router.push({ name: 'MLogView', params: { logId: log.id } })
    }

    // 监听路由参数变化，切换设备时重置状态
    watch(() => route.params?.deviceId, (newDeviceId, oldDeviceId) => {
      if (newDeviceId && newDeviceId !== oldDeviceId) {
        // 重置状态
        page.value = 1
        allLogs.value = []
        deviceInfo.value = null
        totalLogs.value = 0
        finished.value = false
        loading.value = false
        timeFiltersLoaded.value = false
        availableYearValues.value = []
        availableMonthsByYear.value = {}
        availableDaysByYearMonth.value = {}
        statusFilter.value = 'all'
        selectedQuickRange.value = 'all'
        selectedYear.value = 'all'
        selectedMonth.value = 'all'
        selectedDay.value = 'all'
        // 重新加载数据
        onLoad()
        nextTick(updateLayoutMetrics)
      }
    })

    onMounted(() => {
      // 确保初始状态正确
      page.value = 1
      finished.value = false
      allLogs.value = []
      nextTick(updateLayoutMetrics)
      window.addEventListener('resize', updateLayoutMetrics)
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
      totalLogs,
      filteredLogs,
      loading,
      finished,
      statusFilter,
      statusOptions,
      selectedQuickRange,
      selectedYear,
      selectedMonth,
      selectedDay,
      quickRangeOptions,
      quickRangeTitle,
      customRangeTitle,
      yearLabel,
      monthLabel,
      dayLabel,
      clearText,
      timeFilterTitle,
      yearOptions,
      monthOptions,
      dayOptions,
      timeDropdownRef,
      onLoad,
      handleStatusSelect,
      selectQuickRange,
      selectYear,
      selectMonth,
      selectDay,
      clearTimeFilters,
      onTimeDropdownOpen,
      formatFileSize,
      formatTime,
      getUploaderName,
      getStatusText,
      getStatusIcon,
      getStatusBadgeClass,
      viewLog
    }
  }
}
</script>

<style scoped>
.page {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  background-color: var(--m-color-bg);
  /* 底部留白由 App.vue 全局样式统一设置 */
  box-sizing: border-box;
}

/* 顶部导航栏 */
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
  gap: 12px;
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
  gap: 8px;
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
  flex-shrink: 0;
}

.header-hospital {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
  line-height: 16px;
}

.header-logs {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
  line-height: 16px;
  margin-left: auto;
}

.header-row .info-text {
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
  line-height: 16px;
}

.info-text {
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-value-primary {
  color: var(--m-color-brand);
  font-weight: 600;
  margin-right: 2px;
}

/* 筛选区域（固定定位） */
.filter-section {
  position: fixed;
  top: calc(max(var(--m-space-4), calc(env(safe-area-inset-top) + var(--m-space-2))) + 40px);
  left: 0;
  right: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
  background-color: var(--m-color-bg);
  padding: var(--m-space-3);
  padding-bottom: var(--m-space-3);
  box-shadow: var(--m-shadow-card);
}

.content {
  padding-left: var(--m-space-3);
  padding-right: var(--m-space-3);
  /* 增加底部 padding，确保滚动能正确触发加载（移除底部导航栏后需要更多空间） */
  padding-bottom: max(var(--m-space-5), env(safe-area-inset-bottom) + var(--m-space-5));
  /* 给固定区域留出空间：header高度 + 筛选区域高度 */
  padding-top: calc(max(var(--m-space-4), calc(env(safe-area-inset-top) + var(--m-space-2))) + 40px + var(--m-space-3) + 134px);
}

/* 时间范围选择器 */
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
  font-size: var(--m-font-size-md);
  font-weight: 500;
  color: var(--m-color-text);
}

.quick-options {
  display: flex;
  gap: 8px;
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
  gap: 8px;
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

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-card {
  background-color: var(--m-color-surface);
  border-radius: var(--m-radius-lg);
  border: 1.439px solid var(--m-color-border);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.log-card:active {
  background-color: var(--gray-100);
}

.card-content {
  padding: 13.43px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-name {
  font-size: var(--m-font-size-md);
  font-weight: 400;
  color: var(--m-color-text);
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-footer {
  display: flex;
  align-items: center;
  min-height: 22.85px;
}

.view-text {
  font-size: var(--m-font-size-sm);
  font-weight: 400;
  color: var(--gray-400);
  line-height: 16px;
  margin-right: auto;
}

.status-badge-wrapper {
  flex-shrink: 0;
  margin-left: auto;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--m-space-1);
  height: 22.85px;
  border-radius: var(--m-radius-md);
  padding: 0 9.42px;
  font-size: var(--m-font-size-sm);
  font-weight: 400;
  line-height: 16px;
}

.status-icon {
  font-size: 12px;
  width: 12px;
  height: 12px;
}

.status-badge-success {
  background-color: var(--green-50);
  color: var(--green-700);
}

.status-badge-error {
  background-color: var(--red-50);
  color: var(--red-700);
}

.empty-state {
  margin-top: 60px;
}

:deep(.van-list__loading) {
  padding: var(--m-space-5) 0;
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
