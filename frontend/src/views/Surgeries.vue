<template>
  <div class="surgeries-container">
    <!-- 按设备分组的手术列表 -->
    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>{{ $t('logs.surgeryData') }}</span>
          <div class="header-actions">
            <div class="search-section">
              <el-input
                v-model="keywordFilter"
                :placeholder="$t('logs.keywordSearchPlaceholder')"
                class="search-input"
                clearable
                @clear="handleKeywordClear"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </div>
            <div class="action-section">
              <button class="btn-secondary btn-sm" @click="resetFilters">
                <i class="fas fa-undo"></i>
                {{ $t('shared.reset') }}
              </button>
              <button class="btn-secondary btn-sm" @click="loadDeviceGroups">
                <i class="fas fa-sync-alt"></i>
                {{ $t('shared.refresh') }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <el-table
        :data="deviceGroups"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="device_id" :label="$t('logs.deviceId')" width="200">
          <template #default="{ row }">
            <div class="min-w-0">
              <el-button 
                type="text" 
                @click="showDeviceDetail(row)"
                style="padding: 0; font-weight: 500; color: var(--text-link); max-width: 100%;"
                :title="row.device_id"
              >
                <span class="one-line-ellipsis" style="display:inline-block; max-width:100%;">{{ row.device_id }}</span>
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="hospital_name" :label="$t('logs.hospitalName')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.hospital_name" class="one-line-ellipsis" :title="maskHospitalName(row.hospital_name, hasDeviceReadPermission)" style="display:inline-block; max-width:100%">{{ maskHospitalName(row.hospital_name, hasDeviceReadPermission) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="surgery_count" :label="$t('logs.totalSurgeries')" width="150" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.surgery_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <div class="btn-group">
              <button class="btn-text btn-sm" @click="showDeviceDetail(row)">
                <i class="fas fa-list"></i>
                {{ $t('logs.detail') }}
              </button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 设备列表分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="deviceTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleDeviceSizeChange"
          @current-change="handleDeviceCurrentChange"
        />
      </div>
    </el-card>

    <!-- 设备详细手术数据抽屉 -->
    <el-drawer
      v-model="showDeviceDetailDrawer"
      :title="`${selectedDevice?.device_id} ${$t('logs.surgeryData')}`"
      direction="rtl"
      size="1200px"
      :before-close="handleDrawerClose"
    >
      <div class="device-detail-content">
        <!-- 设备信息头部 -->
        <div class="device-header">
          <div class="device-info">
            <h3 class="min-w-0"><span class="one-line-ellipsis" :title="selectedDevice?.device_id">{{ $t('logs.deviceId') }}：{{ selectedDevice?.device_id }}</span></h3>
            <p v-if="selectedDevice?.hospital_name" class="min-w-0"><span class="one-line-ellipsis" :title="maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission)">{{ $t('logs.hospitalName') }}：{{ maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission) }}</span></p>
          </div>
          <div class="header-controls">
            <div class="refresh-section">
              <button class="btn-secondary btn-sm" @click="loadDetailSurgeries">
                <i class="fas fa-sync-alt"></i>
                {{ $t('shared.refresh') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 详细手术数据列表 -->
        <div class="detail-surgeries-section">
          <div class="detail-filters">
            <el-tabs
              v-model="detailTypeFilter"
              class="detail-type-tabs"
              @tab-change="handleTypeTabChange"
            >
              <el-tab-pane
                v-for="tab in detailTypeTabs"
                :key="tab.value"
                :label="tab.label"
                :name="tab.value"
              />
            </el-tabs>
            <div class="time-filter-bar">
              <div class="quick-range-group">
                <el-radio-group
                  v-model="detailQuickRange"
                  size="small"
                  @change="handleQuickRangeChange"
                >
                  <el-radio-button
                    v-for="option in detailQuickRangeOptions"
                    :key="option.value"
                    :label="option.value"
                  >
                    {{ option.label }}
                  </el-radio-button>
                </el-radio-group>
              </div>
              <div class="custom-range-selects">
                <el-select
                  v-model="detailSelectedYear"
                  size="small"
                  class="time-select"
                  @change="handleYearChange"
                >
                  <el-option
                    v-for="option in detailYearOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="detailSelectedMonth"
                  size="small"
                  class="time-select"
                  @change="handleMonthChange"
                >
                  <el-option
                    v-for="option in detailMonthOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="detailSelectedDay"
                  size="small"
                  class="time-select"
                  @change="handleDayChange"
                >
                  <el-option
                    v-for="option in detailDayOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
            </div>
          </div>
          <el-table
            :data="detailSurgeries"
            :loading="detailLoading"
            style="width: 100%"
            v-loading="detailLoading"
          >
            <el-table-column :label="$t('logs.surgeryId')">
              <template #default="{ row }">
                {{ row.display_surgery_id }}
              </template>
            </el-table-column>
            <el-table-column prop="start_time" :label="$t('logs.surgeryStartTime')">
              <template #default="{ row }">{{ formatDate(row.start_time) }}</template>
            </el-table-column>
            <el-table-column prop="end_time" :label="$t('logs.surgeryEndTime')">
              <template #default="{ row }">{{ formatDate(row.end_time) }}</template>
            </el-table-column>
            <el-table-column :label="$t('shared.operation')" align="center">
              <template #default="{ row }">
                <div class="btn-group">
                  <button class="btn-text btn-sm" @click="viewLogsBySurgery(row)">{{ $t('logs.viewLogs') }}</button>
                  <button class="btn-text btn-sm" @click="visualizeSurgery(row)">{{ $t('batchAnalysis.visualize') }}</button>
                  <button 
                    v-if="canDeleteSurgery" 
                    class="btn-text-danger btn-sm" 
                    @click="deleteSurgery(row)"
                  >
                    {{ $t('shared.delete') }}
                  </button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <!-- 分页 -->
          <div class="pagination-wrapper">
            <el-pagination
              :current-page="detailCurrentPage"
              :page-size="detailPageSize"
              :page-sizes="[10, 20, 50]"
              :total="detailTotal"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleDetailSizeChange"
              @current-change="handleDetailCurrentChange"
            />
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { visualizeSurgery as visualizeSurgeryData } from '@/utils/visualizationHelper'
import { maskHospitalName } from '@/utils/maskSensitiveData'
import { formatTime, loadServerTimezone } from '@/utils/timeFormatter'

export default {
  name: 'Surgeries',
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t, locale } = useI18n()

    // 设备分组相关数据
    const loading = ref(false)
    const deviceGroups = ref([])
    const deviceTotal = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const keywordFilter = ref('')
    const deviceGroupsLoading = ref(false)
    const lastDeviceGroupsLoadAt = ref(0)
    let searchDebounceTimer = null

    // 设备详情抽屉相关
    const showDeviceDetailDrawer = ref(false)
    const selectedDevice = ref(null)
    const detailSurgeries = ref([])
    const detailLoading = ref(false)
    const detailCurrentPage = ref(1)
    const detailPageSize = ref(20)
    const detailTotal = ref(0)
    const detailAvailableYears = ref([])
    const detailAvailableMonths = ref({})
    const detailAvailableDays = ref({})
    const detailTypeFilter = ref('all')
    const detailQuickRange = ref('all')
    const detailSelectedYear = ref('all')
    const detailSelectedMonth = ref('all')
    const detailSelectedDay = ref('all')

    const canDeleteSurgery = computed(() => store.getters['auth/hasPermission']?.('surgery:delete'))
    const hasDeviceReadPermission = computed(() => store.getters['auth/hasPermission']?.('device:read'))

    // 加载设备分组
    const loadDeviceGroups = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastDeviceGroupsLoadAt.value < 2000) {
        return
      }
      if (!force && deviceGroupsLoading.value) {
        return
      }
      try {
        deviceGroupsLoading.value = true
        loading.value = true
        lastDeviceGroupsLoadAt.value = now

        // 可选获取设备列表（用于获取医院信息）；无设备权限则跳过
        const deviceInfoMap = new Map()
        try {
          if (store.getters['auth/hasPermission']?.('device:read')) {
            const devicesResp = await api.devices.getList({ limit: 1000 })
            const devices = devicesResp.data?.devices || []
            devices.forEach(device => {
              deviceInfoMap.set(device.device_id, {
                hospital_name: device.hospital || null
              })
            })
          }
        } catch (_) {
          // 忽略设备列表拉取失败（例如 403），不影响手术数据分组
        }

        // 使用后端分页获取所有手术数据（用于分组统计）
        // 分页循环获取，避免一次性加载过多数据
        const allSurgeries = []
        let page = 1
        const perPage = 1000 // 每次获取1000条，平衡性能和请求次数
        let hasMore = true
        let totalCount = 0

        while (hasMore) {
          const resp = await api.surgeries.list({
            page,
            limit: perPage
          })
          const surgeries = resp.data?.data || []
          const total = resp.data?.total || 0
          
          if (page === 1) {
            totalCount = total
          }
          
          allSurgeries.push(...surgeries)
          
          // 判断是否还有更多数据
          hasMore = surgeries.length === perPage && allSurgeries.length < totalCount
          page++
          
          // 安全限制：最多获取50000条数据，避免无限循环
          if (allSurgeries.length >= 50000) {
            console.warn('设备分组统计：数据量过大，仅统计前50000条手术数据')
            break
          }
        }

        // 按设备分组并统计
        const deviceMap = new Map()
        allSurgeries.forEach(surgery => {
          const deviceIds = surgery.device_ids || []
          deviceIds.forEach(deviceId => {
            if (!deviceMap.has(deviceId)) {
              const deviceInfo = deviceInfoMap.get(deviceId)
              // 后端已附带 hospital_names（按手术维度），无设备权限时回退到手术的首个医院名
              const fallbackHospital = Array.isArray(surgery.hospital_names) && surgery.hospital_names.length > 0
                ? surgery.hospital_names[0]
                : (surgery.hospital_name || null)
              deviceMap.set(deviceId, {
                device_id: deviceId,
                hospital_name: deviceInfo?.hospital_name || fallbackHospital || null,
                surgery_count: 0
              })
            }
            const deviceGroup = deviceMap.get(deviceId)
            deviceGroup.surgery_count++
          })
        })

        // 转换为数组并排序（按手术数量降序）
        let groupedArray = Array.from(deviceMap.values())
          .sort((a, b) => b.surgery_count - a.surgery_count)

        // 应用关键字筛选（支持设备编号和医院名称）
        const keyword = keywordFilter.value.trim().toLowerCase()
        if (keyword) {
          groupedArray = groupedArray.filter(device => {
            const matchDeviceId = device.device_id?.toLowerCase().includes(keyword) || false
            const matchHospital = device.hospital_name?.toLowerCase().includes(keyword) || false
            return matchDeviceId || matchHospital
          })
        }

        // 应用分页
        const total = groupedArray.length
        const start = (currentPage.value - 1) * pageSize.value
        const end = start + pageSize.value
        deviceGroups.value = groupedArray.slice(start, end)
        deviceTotal.value = total
      } catch (error) {
        if (!silent) {
          ElMessage.error(t('logs.errors.loadSurgeryDataFailed'))
        }
      } finally {
        deviceGroupsLoading.value = false
        loading.value = false
      }
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

    const entryIsRemote = (entry) => {
      if (!entry) return false
      if ((entry.surgery_type || '').toLowerCase() === 'remote') return true
      if (normalizeFlag(entry.is_remote) || normalizeFlag(entry.has_remote)) return true
      return false
    }

    const entryIsFault = (entry) => {
      if (!entry) return false
      const type = (entry.surgery_type || '').toLowerCase()
      if (type === 'fault') return true
      if (normalizeFlag(entry.has_fault) || normalizeFlag(entry.is_fault)) return true
      if (typeof entry.fault_count === 'number' && entry.fault_count > 0) return true
      if (typeof entry.error_count === 'number' && entry.error_count > 0) return true
      return false
    }

    const detailTypeTabs = computed(() => ([
      { value: 'all', label: t('logs.surgeriesFilters.typeAll') },
      { value: 'fault', label: t('logs.surgeriesFilters.typeFault') },
      { value: 'remote', label: t('logs.surgeriesFilters.typeRemote') }
    ]))

    const detailQuickRangeOptions = computed(() => ([
      { value: 'all', label: t('logs.surgeriesFilters.quickAll') },
      { value: '1d', label: t('logs.surgeriesFilters.quick1d') },
      { value: '7d', label: t('logs.surgeriesFilters.quick7d') },
      { value: '30d', label: t('logs.surgeriesFilters.quick30d') },
      { value: 'custom', label: t('logs.surgeriesFilters.quickCustom') }
    ]))


    const detailYearOptions = computed(() => {
      const sorted = Array.from(detailAvailableYears.value || [])
        .sort((a, b) => Number(b) - Number(a))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.yearAll') },
        ...sorted.map(year => ({
          value: year,
          label: `${year}${t('logs.surgeriesFilters.yearSuffix')}`
        }))
      ]
    })

    const detailMonthOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.monthSuffix') || ''
      const monthsSet = new Set()
      const monthsMap = detailAvailableMonths.value || {}

      if (detailSelectedYear.value !== 'all') {
        const months = monthsMap[detailSelectedYear.value] || []
        months.forEach(month => {
          const num = Number(month)
          if (!Number.isNaN(num)) {
            monthsSet.add(String(num).padStart(2, '0'))
          }
        })
      } else {
        // 年份为'all'时，显示所有年份的月份合集
        Object.values(monthsMap).forEach(list => {
          (list || []).forEach(month => {
            const num = Number(month)
            if (!Number.isNaN(num)) {
              monthsSet.add(String(num).padStart(2, '0'))
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

      const sorted = Array.from(monthsSet).sort((a, b) => a.localeCompare(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.monthAll') },
        ...sorted.map(month => ({
          value: month,
          label: `${month}${suffix}`
        }))
      ]
    })

    const detailDayOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.daySuffix') || ''
      const daysSet = new Set()
      const daysMap = detailAvailableDays.value || {}

      if (detailSelectedYear.value !== 'all' && detailSelectedMonth.value !== 'all') {
        // 已选择年份和月份，显示该年月下的所有日期
        const key = `${detailSelectedYear.value}-${detailSelectedMonth.value}`
        const days = daysMap[key] || []
        days.forEach(day => {
          const num = Number(day)
          if (!Number.isNaN(num)) {
            daysSet.add(String(num).padStart(2, '0'))
          }
        })
      } else if (detailSelectedYear.value !== 'all') {
        // 只选择了年份，显示该年份下所有月份的日期
        Object.entries(daysMap).forEach(([key, list]) => {
          if (key.startsWith(`${detailSelectedYear.value}-`)) {
            (list || []).forEach(day => {
              const num = Number(day)
              if (!Number.isNaN(num)) {
                daysSet.add(String(num).padStart(2, '0'))
              }
            })
          }
        })
      } else {
        // 年份为'all'，显示所有日期
        Object.values(daysMap).forEach(list => {
          (list || []).forEach(day => {
            const num = Number(day)
            if (!Number.isNaN(num)) {
              daysSet.add(String(num).padStart(2, '0'))
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

      const sorted = Array.from(daysSet).sort((a, b) => a.localeCompare(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.dayAll') },
        ...sorted.map(day => ({
          value: day,
          label: `${day}${suffix}`
        }))
      ]
    })


    const updateQuickRangeBySelections = () => {
      const allSelected =
        detailSelectedYear.value === 'all' &&
        detailSelectedMonth.value === 'all' &&
        detailSelectedDay.value === 'all'
      detailQuickRange.value = allSelected ? 'all' : 'custom'
    }

    const handleTypeTabChange = () => {
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    const handleQuickRangeChange = (value) => {
      detailQuickRange.value = value
      if (value !== 'custom') {
        detailSelectedYear.value = 'all'
        detailSelectedMonth.value = 'all'
        detailSelectedDay.value = 'all'
      }
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    const handleYearChange = (value) => {
      detailSelectedYear.value = value
      if (value === 'all') {
        detailSelectedMonth.value = 'all'
        detailSelectedDay.value = 'all'
      } else {
        syncDetailSelections()
      }
      updateQuickRangeBySelections()
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    const handleMonthChange = (value) => {
      detailSelectedMonth.value = value
      if (value === 'all') {
        detailSelectedDay.value = 'all'
      } else {
        syncDetailSelections()
      }
      updateQuickRangeBySelections()
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    const handleDayChange = (value) => {
      detailSelectedDay.value = value
      updateQuickRangeBySelections()
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }


    // 显示设备详情
    const showDeviceDetail = (device) => {
      selectedDevice.value = device
      showDeviceDetailDrawer.value = true
      detailSurgeries.value = []
      detailTotal.value = 0
      detailCurrentPage.value = 1
      detailTypeFilter.value = 'all'
      detailQuickRange.value = 'all'
      detailSelectedYear.value = 'all'
      detailSelectedMonth.value = 'all'
      detailSelectedDay.value = 'all'
      detailAvailableYears.value = []
      detailAvailableMonths.value = {}
      detailAvailableDays.value = {}
      loadDetailTimeFilters()
      loadDetailSurgeries()
    }

    const syncDetailSelections = () => {
      const monthValues = detailMonthOptions.value.map(option => option.value)
      if (!monthValues.includes(detailSelectedMonth.value)) {
        detailSelectedMonth.value = 'all'
      }
      const dayValues = detailDayOptions.value.map(option => option.value)
      if (!dayValues.includes(detailSelectedDay.value)) {
        detailSelectedDay.value = 'all'
      }
      if (
        detailSelectedYear.value === 'all' &&
        detailSelectedMonth.value === 'all' &&
        detailSelectedDay.value === 'all'
      ) {
        detailQuickRange.value = 'all'
      }
    }

    const loadDetailTimeFilters = async () => {
      if (!selectedDevice.value?.device_id) return
      try {
        const resp = await api.surgeries.getTimeFilters({ device_id: selectedDevice.value.device_id })
        const data = resp.data?.data || {}

        const normalizeYear = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(4, '0')
        }
        const normalizeMonth = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        }
        const normalizeDay = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        }

        const yearsArray = Array.isArray(data.years) ? data.years : []
        const normalizedYears = yearsArray
          .map(normalizeYear)
          .filter(Boolean)
        detailAvailableYears.value = Array.from(new Set(normalizedYears))

        const monthsResult = {}
        if (data.monthsByYear && typeof data.monthsByYear === 'object') {
          Object.entries(data.monthsByYear).forEach(([year, list]) => {
            const normalizedYear = normalizeYear(year)
            if (!normalizedYear) return
            const months = Array.isArray(list) ? list : []
            const normalizedMonths = months
              .map(normalizeMonth)
              .filter(Boolean)
            if (normalizedMonths.length) {
              monthsResult[normalizedYear] = Array.from(new Set(normalizedMonths))
            }
          })
        }
        detailAvailableMonths.value = monthsResult

        const daysResult = {}
        if (data.daysByYearMonth && typeof data.daysByYearMonth === 'object') {
          Object.entries(data.daysByYearMonth).forEach(([key, list]) => {
            const [yearPart, monthPart] = key.split('-')
            const normalizedYear = normalizeYear(yearPart)
            const normalizedMonth = normalizeMonth(monthPart)
            if (!normalizedYear || !normalizedMonth) return
            const normalizedDays = (Array.isArray(list) ? list : [])
              .map(normalizeDay)
              .filter(Boolean)
            if (normalizedDays.length) {
              daysResult[`${normalizedYear}-${normalizedMonth}`] = Array.from(new Set(normalizedDays))
            }
          })
        }
        detailAvailableDays.value = daysResult

        syncDetailSelections()
      } catch (error) {
        console.warn('loadDetailTimeFilters error:', error)
        detailAvailableYears.value = []
        detailAvailableMonths.value = {}
        detailAvailableDays.value = {}
      }
    }

    watch([detailAvailableYears, detailAvailableMonths, detailAvailableDays], () => {
      syncDetailSelections()
    })

    const formatTimePrefix = (date) => {
      if (!date) return null
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      return `${year}${month}${day}${hour}`
    }

    const computeCustomRange = () => {
      if (detailSelectedYear.value === 'all') return { start: null, end: null }
      const year = Number(detailSelectedYear.value)
      const month =
        detailSelectedMonth.value !== 'all' ? Number(detailSelectedMonth.value) : null
      const day =
        detailSelectedDay.value !== 'all' ? Number(detailSelectedDay.value) : null

      const start = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0)
      let end
      if (day) {
        end = new Date(year, (month || 1) - 1, day, 23, 59, 59, 999)
      } else if (month) {
        end = new Date(year, month, 0, 23, 59, 59, 999)
      } else {
        end = new Date(year, 11, 31, 23, 59, 59, 999)
      }
      return { start, end }
    }

    const buildDetailTimeParams = () => {
      const params = {}
      let startDate = null
      let endDate = null
      const now = new Date()

      if (detailQuickRange.value === '1d') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        endDate = now
      } else if (detailQuickRange.value === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        endDate = now
      } else if (detailQuickRange.value === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        endDate = now
      }

      const hasCustomSelection =
        detailSelectedYear.value !== 'all' ||
        detailSelectedMonth.value !== 'all' ||
        detailSelectedDay.value !== 'all'

      if (detailQuickRange.value === 'custom' || hasCustomSelection) {
        const { start, end } = computeCustomRange()
        if (start && end) {
          startDate = start
          endDate = end
        }
      }

      if (startDate && endDate) {
        params.time_range_start = formatTimePrefix(startDate)
        params.time_range_end = formatTimePrefix(endDate)
      }
      return params
    }

    // 加载设备详细手术数据
    const loadDetailSurgeries = async (options = {}) => {
      if (!selectedDevice.value) return
      try {
        detailLoading.value = true
        const params = {
          device_id: selectedDevice.value.device_id,
          page: detailCurrentPage.value,
          limit: detailPageSize.value
        }
        if (detailTypeFilter.value !== 'all') {
          params.type = detailTypeFilter.value
        }
        Object.assign(params, buildDetailTimeParams())

        const resp = await api.surgeries.list(params)
        const list = Array.isArray(resp.data?.data) ? resp.data.data : []
        const mapped = list.map((entry, index) => {
          const startDate = entry.start_time ? new Date(entry.start_time) : null
          const isValidDate = startDate && !Number.isNaN(startDate.getTime())
          const year = isValidDate ? startDate.getFullYear() : null
          const month = isValidDate ? startDate.getMonth() + 1 : null
          const day = isValidDate ? startDate.getDate() : null
          const hours = isValidDate ? String(startDate.getHours()).padStart(2, '0') : '00'
          const minutes = isValidDate ? String(startDate.getMinutes()).padStart(2, '0') : '00'
          const formattedDate = isValidDate
            ? `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${hours}${minutes}`
            : `unknown-${index}`
          const deviceId = selectedDevice.value?.device_id || 'unknown'
          return {
            ...entry,
            display_surgery_id: `${deviceId}-${formattedDate}`,
            _startYear: year,
            _startMonth: month,
            _startDay: day
          }
        })

        detailTotal.value = resp.data?.total ?? 0

        if (!mapped.length && detailTotal.value > 0 && detailCurrentPage.value > 1) {
          const maxPage = Math.max(1, Math.ceil(detailTotal.value / detailPageSize.value))
          if (detailCurrentPage.value > maxPage) {
            detailCurrentPage.value = maxPage
            await loadDetailSurgeries({ silent: true })
            return
          }
        }

        detailSurgeries.value = mapped

        syncDetailSelections()
      } catch (e) {
        if (!options?.silent) {
        ElMessage.error(t('logs.errors.loadSurgeryDataFailed'))
        }
      } finally {
        detailLoading.value = false
      }
    }

    // 查看手术相关日志
    const viewLogsBySurgery = async (row) => {
      try {
        // 直接从手术记录的 source_log_ids 字段获取日志ID数组
        const sourceLogIds = Array.isArray(row.source_log_ids) ? row.source_log_ids : []
        if (!sourceLogIds.length) {
          ElMessage.warning(t('logs.messages.noRelatedLogFiles'))
          return
        }
        // 过滤掉无效值并去重
        const ids = Array.from(new Set(sourceLogIds.filter(id => id != null && id !== undefined && id !== '')))
        if (!ids.length) {
          ElMessage.warning(t('logs.messages.noRelatedLogFiles'))
          return
        }
        const routeData = router.resolve(`/batch-analysis/${ids.join(',')}`)
        window.open(routeData.href, '_blank')
      } catch (e) {
        ElMessage.error(t('logs.messages.getSurgeryLogsFailed'))
      }
    }

    // 可视化手术
    const visualizeSurgery = (row) => {
      visualizeSurgeryData(row, { queryId: row.id })
    }

    // 删除手术
    const deleteSurgery = async (row) => {
      try {
        await ElMessageBox.confirm(
          t('logs.messages.confirmDeleteSurgery'),
          t('shared.messages.deleteConfirmTitle'),
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        
        await api.surgeries.remove(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        // 如果是在抽屉中删除，刷新抽屉数据；否则刷新设备列表
        if (showDeviceDetailDrawer.value && selectedDevice.value) {
          loadDetailSurgeries()
          // 同时更新设备分组列表中的计数
          loadDeviceGroups({ silent: true })
        } else {
          loadDeviceGroups()
        }
      } catch (e) {
        if (e !== 'cancel') {
          ElMessage.error(t('shared.messages.deleteFailed'))
        }
      }
    }

    // 关闭抽屉
    const handleDrawerClose = () => {
      showDeviceDetailDrawer.value = false
      selectedDevice.value = null
      detailSurgeries.value = []
      detailTotal.value = 0
      detailAvailableYears.value = []
      detailAvailableMonths.value = {}
      detailAvailableDays.value = {}
    }

    // 设备列表分页处理
    const handleDeviceSizeChange = (newSize) => {
      pageSize.value = newSize
      currentPage.value = 1
      loadDeviceGroups({ force: true })
    }

    const handleDeviceCurrentChange = (newPage) => {
      currentPage.value = newPage
      loadDeviceGroups({ force: true })
    }

    // 详细手术列表分页处理
    const handleDetailSizeChange = (size) => {
      detailPageSize.value = size
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    const handleDetailCurrentChange = (page) => {
      detailCurrentPage.value = page
      loadDetailSurgeries()
    }

    // 关键字搜索防抖处理
    watch(keywordFilter, (newVal) => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
      }
      searchDebounceTimer = setTimeout(() => {
        currentPage.value = 1
        loadDeviceGroups({ force: true })
      }, 300) // 300ms 防抖
    })

    // 清空搜索框时的处理
    const handleKeywordClear = () => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
      }
      currentPage.value = 1
      loadDeviceGroups({ force: true })
    }

    // 重置筛选
    const resetFilters = () => {
      keywordFilter.value = ''
      currentPage.value = 1
      loadDeviceGroups({ force: true })
    }

    // 日期格式化（使用统一的时间格式化函数，按原始时间显示，无时区转换）
    const formatDate = (dateString) => {
      return formatTime(dateString, false, false) // useServerTimezone=false, isUtcTime=false（原始时间）
    }

    onMounted(() => {
      loadServerTimezone()
      loadDeviceGroups()
    })

    onUnmounted(() => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
      }
    })

    return {
      // 设备分组相关
      loading,
      deviceGroups,
      deviceTotal,
      currentPage,
      pageSize,
      keywordFilter,
      // 设备详情相关
      showDeviceDetailDrawer,
      selectedDevice,
      detailSurgeries,
      detailLoading,
      detailCurrentPage,
      detailPageSize,
      detailTotal,
      detailTypeFilter,
      detailTypeTabs,
      detailQuickRange,
      detailQuickRangeOptions,
      detailSelectedYear,
      detailSelectedMonth,
      detailSelectedDay,
      detailYearOptions,
      detailMonthOptions,
      detailDayOptions,
      // 权限
      canDeleteSurgery,
      hasDeviceReadPermission,
      // 方法
      loadDeviceGroups,
      showDeviceDetail,
      loadDetailSurgeries,
      viewLogsBySurgery,
      visualizeSurgery,
      deleteSurgery,
      handleDrawerClose,
      handleDeviceSizeChange,
      handleDeviceCurrentChange,
      handleDetailSizeChange,
      handleDetailCurrentChange,
      handleKeywordClear,
      handleTypeTabChange,
      handleQuickRangeChange,
      handleYearChange,
      handleMonthChange,
      handleDayChange,
      resetFilters,
      formatDate,
      // 医院信息脱敏
      maskHospitalName,
      // 图标
      Search
    }
  }
}
</script>

<style scoped>
.surgeries-container {
  height: 100%;
}

.list-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.card-header > span {
  white-space: nowrap;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
}

.search-section {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
}

.action-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.action-section button.btn-sm {
  height: 32px;
  box-sizing: border-box;
  padding: 6px 12px;
}

.search-input {
  width: 280px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.one-line-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.min-w-0 {
  min-width: 0;
}

/* 设备详情相关样式 */
.device-detail-content {
  padding: 12px 10px 10px 10px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-secondary);
}

.device-info {
  flex: 1;
}

.device-info h3 {
  margin: 0 0 10px 0;
  color: var(--text-primary);
  font-size: 18px;
}

.device-info p {
  margin: 5px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-section {
  display: flex;
  align-items: center;
}

.detail-surgeries-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-type-tabs:deep(.el-tabs__nav-wrap) {
  justify-content: flex-start;
}

.time-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.quick-range-group {
  flex-shrink: 0;
}

.custom-range-selects {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.time-select {
  width: 140px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: space-between;
}

.header-total {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
}
</style>
