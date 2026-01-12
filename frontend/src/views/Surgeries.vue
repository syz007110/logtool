<template>
  <div class="surgeries-container">
    <!-- 统一卡片：包含所有控件 -->
    <el-card class="main-card">
      <!-- 搜索和操作栏 -->
      <div class="action-bar">
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
          <el-button type="default" :icon="RefreshLeft" @click="resetFilters">
            {{ $t('shared.reset') }}
          </el-button>
          <el-button type="default" :icon="Refresh" @click="loadDeviceGroups">
            {{ $t('shared.refresh') }}
          </el-button>
        </div>
      </div>

      <!-- 设备列表 - 可滚动容器 -->
      <div class="table-container">
        <el-table
          :data="deviceGroups"
          :loading="loading"
          :height="tableHeight"
          style="width: 100%"
          v-loading="loading"
        >
        <el-table-column prop="device_id" :label="$t('logs.deviceId')" width="200">
          <template #default="{ row }">
            <el-button 
              text
              size="small"
              @click="showDeviceDetail(row)"
              :title="row.device_id"
            >
              {{ row.device_id }}
            </el-button>
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
        <el-table-column :label="$t('shared.operation')" width="200" fixed="right" align="left">
          <template #default="{ row }">
            <div class="btn-group operation-buttons">
              <el-button
                text
                size="small"
                @click="showDeviceDetail(row)"
                :aria-label="$t('logs.detail')"
                :title="$t('logs.detail')"
              >
                {{ $t('logs.detail') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
        </el-table>
      </div>

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
      direction="rtl"
      size="1200px"
      :with-header="false"
      :before-close="handleDrawerClose"
    >
      <div class="device-detail-content">
        <!-- 详细手术数据列表 - 使用卡片包裹 -->
        <el-card class="detail-surgeries-card">
          <!-- 卡片头部：关闭按钮和设备信息 -->
          <div class="detail-surgeries-card-header">
            <div class="device-header">
              <div class="device-info">
                <h3 class="min-w-0"><span class="one-line-ellipsis" :title="selectedDevice?.device_id">{{ $t('logs.deviceId') }}：{{ selectedDevice?.device_id }}</span></h3>
                <p v-if="selectedDevice?.hospital_name" class="min-w-0"><span class="one-line-ellipsis" :title="maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission)">{{ $t('logs.hospitalName') }}：{{ maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission) }}</span></p>
              </div>
              <div class="header-controls">
                <div class="refresh-section">
                  <el-button type="default" :icon="Refresh" @click="loadDetailSurgeries">
                    {{ $t('shared.refresh') }}
                  </el-button>
                </div>
                <!-- 关闭按钮 -->
                <el-button 
                  text 
                  size="small" 
                  :icon="Close" 
                  @click="handleDrawerClose"
                  class="close-drawer-btn"
                  :title="$t('shared.close')"
                />
              </div>
            </div>
          </div>

          <!-- 筛选和操作栏 -->
          <div class="detail-surgeries-header">
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
          </div>

          <!-- 表格容器 - 可滚动 -->
          <div class="detail-table-container">
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
              <el-table-column :label="$t('shared.operation')" align="left">
                <template #default="{ row }">
                  <div class="btn-group operation-buttons">
                    <el-button
                      text
                      size="small"
                      @click="viewLogsBySurgery(row)"
                      :aria-label="$t('logs.viewLogs')"
                      :title="$t('logs.viewLogs')"
                    >
                      {{ $t('logs.viewLogs') }}
                    </el-button>
                    <el-button
                      text
                      size="small"
                      @click="visualizeSurgery(row)"
                      :aria-label="$t('batchAnalysis.visualize')"
                      :title="$t('batchAnalysis.visualize')"
                    >
                      {{ $t('batchAnalysis.visualize') }}
                    </el-button>
                    <el-button 
                      v-if="canDeleteSurgery" 
                      text
                      size="small"
                      class="btn-danger-text"
                      @click="deleteSurgery(row)"
                      :aria-label="$t('shared.delete')"
                      :title="$t('shared.delete')"
                    >
                      {{ $t('shared.delete') }}
                    </el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- 分页 -->
          <div class="detail-pagination-wrapper">
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
        </el-card>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import { Search, Refresh, RefreshLeft, List, Close } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { visualizeSurgery as visualizeSurgeryData } from '@/utils/visualizationHelper'
import { maskHospitalName } from '@/utils/maskSensitiveData'
import { formatTime, loadServerTimezone } from '@/utils/timeFormatter'
import { getTableHeight } from '@/utils/tableHeight'

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

    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('basic')
    })

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

        // ⚠️ 性能优化：之前实现会循环请求所有手术数据后在内存中分组，数据量大时非常慢
        // 现在改为直接调用后端按设备分组的接口，数据库层完成分组和分页
        const resp = await api.surgeries.getByDevice({
          page: currentPage.value,
          limit: pageSize.value,
          keyword: keywordFilter.value.trim() || undefined
        })
        
        deviceGroups.value = resp.data?.device_groups || []
        deviceTotal.value = resp.data?.pagination?.total || 0
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
        detailQuickRange.value = 'all'
      } else {
        syncDetailSelections()
        detailQuickRange.value = 'custom'
      }
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    const handleMonthChange = (value) => {
      detailSelectedMonth.value = value
      if (value === 'all') {
        detailSelectedDay.value = 'all'
        if (detailSelectedYear.value === 'all') {
          detailQuickRange.value = 'all'
        } else {
          detailQuickRange.value = 'custom'
        }
      } else {
        syncDetailSelections()
        detailQuickRange.value = 'custom'
      }
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    const handleDayChange = (value) => {
      detailSelectedDay.value = value
      if (value === 'all') {
        if (
          detailSelectedYear.value === 'all' &&
          detailSelectedMonth.value === 'all'
        ) {
          detailQuickRange.value = 'all'
        } else {
          detailQuickRange.value = 'custom'
        }
      } else {
        detailQuickRange.value = 'custom'
      }
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
      // 不再自动更新 detailQuickRange，由 handleYearChange/handleMonthChange/handleDayChange 直接设置
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

    // 使用删除确认 composable pattern
    const { confirmDelete } = useDeleteConfirm()

    // 删除手术
    const deleteSurgery = async (row) => {
      try {
        const confirmed = await confirmDelete(row, {
          message: t('logs.messages.confirmDeleteSurgery'),
          title: t('shared.messages.deleteConfirmTitle')
        })

        if (!confirmed) return

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
        ElMessage.error(t('shared.messages.deleteFailed'))
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
      Search,
      Refresh,
      RefreshLeft,
      List,
      Close,
      // 表格高度
      tableHeight
    }
  }
}
</script>

<style scoped>
.surgeries-container {
  height: calc(100vh - 64px);
  background: var(--black-white-white);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px; /* 底部 padding 减少到 4px */
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
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


.search-input {
  width: 280px;
}

/* 表格容器 - 固定表头 */
.table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.table-container :deep(.el-table) {
  flex: 1;
}

.table-container :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

.pagination-wrapper {
  padding: 8px 0 12px 0;
  display: flex;
  justify-content: center;
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
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 详细手术数据卡片样式 - 类似故障码页面 */
.detail-surgeries-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-surgeries-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px; /* 底部 padding 减少到 4px */
}

/* 卡片头部：包含关闭按钮和设备信息 */
.detail-surgeries-card-header {
  flex-shrink: 0;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgb(var(--border-secondary));
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.device-info {
  flex: 1;
}

.device-info h3 {
  margin: 0 0 10px 0;
  color: var(--slate-900);
  font-size: 18px;
}

.device-info p {
  margin: 5px 0;
  color: var(--slate-600);
  font-size: 14px;
}

.header-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.close-drawer-btn {
  margin-left: auto;
  color: rgb(var(--text-secondary));
}

.close-drawer-btn:hover {
  color: rgb(var(--text-primary));
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

.detail-surgeries-header {
  flex-shrink: 0;
  margin-bottom: 20px;
}

.detail-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 0;
}

/* 表格容器 - 固定表头，可滚动 */
.detail-table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-table-container :deep(.el-table) {
  flex: 1;
}

.detail-table-container :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

/* 分页容器 - 固定在底部 */
.detail-pagination-wrapper {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 0 12px 0; /* 上8px， 下12px */
  margin-top: auto;
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
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

/* 操作列按钮组样式 */
.operation-buttons {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

/* 删除按钮文字颜色（使用 Design Token） */
.btn-danger-text {
  color: var(--el-color-danger) !important;
}

.btn-danger-text:hover {
  color: var(--el-color-danger-light-3) !important;
}

.btn-danger-text:active {
  color: var(--el-color-danger-dark-2) !important;
}

</style>
