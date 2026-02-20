<template>
  <div class="data-replay-container">
    <el-card class="main-card">
      <div class="action-bar">
        <div class="action-section">
          <el-button type="primary" :icon="Upload" @click="openUploadDialog()">
            {{ $t('dataReplay.uploadMotionData') }}
          </el-button>
          <el-button type="default" :icon="Refresh" @click="loadDeviceGroups({ force: true })">
            {{ $t('shared.refresh') }}
          </el-button>
        </div>
      </div>

      <el-table
        :data="deviceGroups"
        v-loading="loading"
        style="width: 100%"
      >
        <el-table-column prop="device_id" :label="$t('logs.deviceId')" min-width="160">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetailDrawer(row)">
              <span class="one-line-ellipsis" style="display:inline-block; max-width:100%;" :title="row.device_id">{{ row.device_id }}</span>
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="hospital_name" :label="$t('logs.hospitalName')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.hospital_name" class="one-line-ellipsis" :title="maskHospitalName(row.hospital_name, hasDeviceReadPermission)" style="display:inline-block; max-width:100%">{{ maskHospitalName(row.hospital_name, hasDeviceReadPermission) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="data_count" :label="$t('dataReplay.dataCount')" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.data_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="latest_upload_time" :label="$t('logs.updateTime')" width="180">
          <template #default="{ row }">{{ formatDate(row.latest_upload_time) }}</template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="120" fixed="right" align="left">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openDetailDrawer(row)">{{ $t('logs.detail') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="deviceTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 详情抽屉（上传 + 文件列表） -->
    <el-drawer
      v-model="detailDrawerVisible"
      direction="rtl"
      size="1000px"
      :with-header="false"
      :before-close="closeDetailDrawer"
    >
      <div class="drawer-content drawer-content--detail">
        <div class="drawer-header">
          <div class="device-info">
            <h3 class="min-w-0 one-line-ellipsis" :title="selectedDevice?.device_id">{{ selectedDevice?.device_id }} {{ $t('dataReplay.detailDrawerTitle') }}（{{ $t('dataReplay.dataCount') }}：{{ detailTotal }}）</h3>
            <p v-if="selectedDevice?.hospital_name" class="min-w-0 device-info-hospital"><span class="one-line-ellipsis" :title="maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission)">{{ $t('logs.hospitalName') }}：{{ maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission) }}</span></p>
          </div>
          <div class="header-controls">
            <div class="device-actions">
              <el-button type="default" size="small" :icon="Refresh" :disabled="detailLoading" @click="loadDetailFiles">
                {{ $t('shared.refresh') }}
              </el-button>
              <el-button type="primary" size="small" :icon="Upload" :disabled="uploading" @click="openUploadDialog(selectedDevice?.device_id)">
                {{ $t('dataReplay.uploadMotionData') }}
              </el-button>
            </div>
            <el-button text size="small" :icon="Close" @click="closeDetailDrawer" class="close-drawer-btn" :title="$t('shared.close')" />
          </div>
        </div>

        <!-- 状态筛选 + 时间筛选（两行布局，参考设备详细日志列表） -->
        <div class="detail-filters">
          <el-tabs v-model="detailStatusFilter" class="detail-status-tabs" @tab-change="handleDetailStatusFilterChange">
            <el-tab-pane v-for="tab in detailStatusTabs" :key="tab.value" :label="tab.label" :name="tab.value" />
          </el-tabs>
          <div class="time-filter-bar">
            <div class="quick-range-group">
              <el-radio-group v-model="detailQuickRange" size="small" @change="handleDetailQuickRangeChange">
                <el-radio-button v-for="opt in detailQuickRangeOptions" :key="opt.value" :label="opt.value">
                  {{ opt.label }}
                </el-radio-button>
              </el-radio-group>
            </div>
            <div class="custom-range-selects custom-range-selects-right">
              <el-select
                v-model="detailSelectedYear"
                size="small"
                class="time-select"
                @change="handleDetailYearChange"
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
                @change="handleDetailMonthChange"
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
                @change="handleDetailDayChange"
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

        <!-- 批量操作（参考设备详细日志列表样式） -->
        <div class="batch-section" v-if="selectedDetailFiles.length > 0 && hasDataReplayManagePermission">
          <div class="batch-actions">
            <el-dropdown trigger="click" placement="bottom-start" @command="(format) => batchDownloadDetail(format)">
              <el-button type="primary" size="small" :disabled="!canBatchDownloadDetail">
                <i class="fas fa-download"></i>
                {{ $t('logs.batchDownload') }} ({{ selectedDetailFiles.length }})
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="csv">CSV 格式</el-dropdown-item>
                  <el-dropdown-item command="jsonl">JSONL 格式</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button type="default" size="small" @click="batchDeleteDetail" :disabled="!canBatchDeleteDetail">
              <i class="fas fa-trash"></i>
              {{ $t('logs.batchDelete') }} ({{ selectedDetailFiles.length }})
            </el-button>
            <el-button type="default" size="small" @click="clearDetailSelection">
              <i class="fas fa-times"></i>
              {{ $t('logs.clearSelection') }}
            </el-button>
          </div>
        </div>

        <!-- 表格容器 - 固定表头，仅 body 滚动 -->
        <div class="detail-table-container">
          <el-table
            ref="detailTableRef"
            :data="detailFiles"
            v-loading="detailLoading"
            style="width: 100%"
            row-key="id"
            @selection-change="handleDetailSelectionChange"
          >
            <el-table-column 
              v-if="hasDataReplayManagePermission"
              type="selection" 
              width="55"
              :selectable="(row) => {
                const status = String(row.status)
                return ['parse_failed', 'completed', 'file_error', 'processing_failed'].includes(status)
              }"
            />
            <el-table-column prop="original_name" label="文件名" min-width="180" />
            <el-table-column prop="device_id" label="设备编号" min-width="120" />
            <el-table-column prop="file_time" label="运行时间" min-width="160">
              <template #default="{ row }">{{ formatDate(row.file_time || row.upload_time) }}</template>
            </el-table-column>
            <el-table-column label="状态" min-width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="200" fixed="right" align="left">
              <template #default="{ row }">
                <div class="operation-buttons">
                  <el-dropdown 
                    v-if="hasDataReplayManagePermission"
                    trigger="click" 
                    placement="bottom-end" 
                    @command="(format) => downloadParsed(row, format)"
                  >
                    <el-button 
                      text 
                      size="small" 
                      type="primary"
                      :disabled="String(row.status) !== 'completed'"
                    >
                      {{ $t('dataReplay.download') }}
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="jsonl">JSONL 格式</el-dropdown-item>
                        <el-dropdown-item command="csv">CSV 格式</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <el-dropdown 
                    v-if="hasDataReplayManagePermission"
                    trigger="click" 
                    placement="bottom-end" 
                    @command="(cmd) => handleDetailMoreAction(cmd)"
                  >
                    <el-button text size="small"><i class="fas fa-ellipsis-h"></i></el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item 
                          :command="{ action: 'downloadRaw', row }"
                          :disabled="String(row.status) !== 'completed'"
                        >
                          {{ $t('dataReplay.downloadRaw') }}
                        </el-dropdown-item>
                        <el-dropdown-item 
                          :command="{ action: 'delete', row }" 
                          class="dropdown-item-danger"
                          :disabled="!['parse_failed', 'completed', 'file_error', 'processing_failed'].includes(String(row.status))"
                        >
                          {{ $t('shared.delete') }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
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
            :page-sizes="[10, 20, 50, 100]"
            :total="detailTotal"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleDetailSizeChange"
            @current-change="handleDetailCurrentChange"
          />
        </div>
      </div>
    </el-drawer>

    <!-- 上传运行数据弹窗（主页面/详情复用） -->
    <el-dialog v-model="uploadDialogVisible" title="上传运行数据" width="700px" append-to-body :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="设备编号" required>
          <el-input
            v-model="uploadDialogDeviceId"
            placeholder="请输入设备编号"
            :disabled="uploadDialogDeviceIdLocked || uploading"
            style="width: 300px;"
          />
        </el-form-item>
        <el-form-item label="文件" required>
          <el-upload
            action=""
            :http-request="() => {}"
            accept=".bin"
            multiple
            :limit="5"
            :on-exceed="handleExceed"
            :on-change="onFileChange"
            :on-remove="onFileRemove"
            :auto-upload="false"
            :show-file-list="false"
            ref="uploadDialogUploadRef"
            :disabled="uploading"
          >
            <el-button type="primary" :disabled="uploading">
              <i class="fas fa-upload"></i>
              选择文件
            </el-button>
            <template #tip>
              <div class="el-upload__tip">
                <div v-if="!uploading">
                  支持 {{ $t('dataReplay.uploadDialogMaxFiles') }}；文件名需为 YYYYMMDDhhmm.bin
                </div>
                <div v-else class="parsing-tip">
                  <el-icon class="is-loading"><Refresh /></el-icon>
                  正在上传/解析...
                </div>
              </div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>

      <!-- 自定义文件列表 -->
      <div v-if="uploadFileList && uploadFileList.length > 0" class="custom-file-list">
        <div class="file-list-header">
          <span>已选择文件 ({{ uploadFileList.length }})</span>
          <el-button type="default" size="small" @click="clearUpload" :disabled="uploading">
            <i class="fas fa-times"></i>
            清空
          </el-button>
        </div>
        <div class="file-items">
          <div 
            v-for="(file, index) in uploadFileList" 
            :key="index" 
            class="file-item"
          >
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ file.name || file.originalname }}</span>
            <span class="file-size">{{ file.sizeText }}</span>
            <el-button 
              type="danger"
              plain
              size="small"
              @click="removeFile(index)"
              :disabled="uploading"
              :aria-label="'移除文件'"
              :title="'移除文件'"
            >
              <i class="fas fa-trash"></i>
            </el-button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="upload-actions">
          <el-button type="default" @click="closeUploadDialog" :disabled="uploading">
            <i class="fas fa-times"></i>
            取消
          </el-button>
          <el-button 
            type="primary" 
            @click="submitUploadDialog" 
            :disabled="uploading || uploadFileList.length === 0 || !uploadDialogDeviceId.trim()"
          >
            <i class="fas fa-upload" v-if="!uploading"></i>
            {{ uploading ? '上传中...' : '上传' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Upload, Close, Document } from '@element-plus/icons-vue'
import { maskHospitalName } from '@/utils/maskSensitiveData'
import api from '@/api'

export default {
  name: 'DataReplay',
  components: { Refresh, Upload, Close },
  setup() {
    const store = useStore()
    const { t } = useI18n()
    const deviceGroups = ref([])
    const deviceTotal = ref(0)
    const loading = ref(false)
    const currentPage = ref(1)
    const pageSize = ref(20)

    const selectedDevice = ref(null)

    const detailDrawerVisible = ref(false)
    const detailFiles = ref([])
    const detailLoading = ref(false)
    const detailCurrentPage = ref(1)
    const detailPageSize = ref(10)
    const detailTotal = ref(0)
    const detailQuickRange = ref('all')
    const detailSelectedYear = ref('all')
    const detailSelectedMonth = ref('all')
    const detailSelectedDay = ref('all')
    const detailStatusFilter = ref('all')
    const detailAvailableYears = ref([])
    const detailAvailableMonths = ref({})
    const detailAvailableDays = ref({})
    const currentYear = new Date().getFullYear()
    const selectedDetailFiles = ref([])
    const detailTableRef = ref(null)

    const detailQuickRangeOptions = computed(() => ([
      { value: 'all', label: t('logs.surgeriesFilters.quickAll') },
      { value: '1d', label: t('logs.surgeriesFilters.quick1d') },
      { value: '7d', label: t('logs.surgeriesFilters.quick7d') },
      { value: '30d', label: t('logs.surgeriesFilters.quick30d') },
      { value: 'custom', label: t('logs.surgeriesFilters.quickCustom') }
    ]))
    const detailStatusTabs = computed(() => ([
      { value: 'all', label: t('logs.statusFilter.all') },
      { value: 'completed', label: t('logs.statusFilter.completed') },
      { value: 'incomplete', label: t('logs.statusFilter.incomplete') }
    ]))

    const detailYearOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.yearSuffix') || ''
      const yearsSource = detailAvailableYears.value || []
      const normalized = yearsSource
        .map((year) => {
          const num = Number(year)
          return Number.isNaN(num) ? null : String(num).padStart(4, '0')
        })
        .filter(Boolean)
      const years = normalized.length ? [...new Set(normalized)].sort((a, b) => Number(b) - Number(a)) : [String(currentYear)]
      return [
        { value: 'all', label: t('logs.surgeriesFilters.yearAll') },
        ...years.map((year) => ({ value: year, label: `${year}${suffix}` }))
      ]
    })

    const detailMonthOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.monthSuffix') || ''
      const monthsSet = new Set()
      const monthsMap = detailAvailableMonths.value || {}
      if (detailSelectedYear.value !== 'all') {
        (monthsMap[detailSelectedYear.value] || []).forEach((month) => {
          const num = Number(month)
          if (!Number.isNaN(num)) monthsSet.add(String(num).padStart(2, '0'))
        })
      } else {
        Object.values(monthsMap).forEach((list) => {
          (list || []).forEach((month) => {
            const num = Number(month)
            if (!Number.isNaN(num)) monthsSet.add(String(num).padStart(2, '0'))
          })
        })
      }
      if (!monthsSet.size) {
        for (let m = 1; m <= 12; m += 1) monthsSet.add(String(m).padStart(2, '0'))
      }
      const sorted = Array.from(monthsSet).sort((a, b) => a.localeCompare(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.monthAll') },
        ...sorted.map((month) => ({ value: month, label: `${month}${suffix}` }))
      ]
    })

    const detailDayOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.daySuffix') || ''
      const daysSet = new Set()
      const daysMap = detailAvailableDays.value || {}
      const y = detailSelectedYear.value
      const m = detailSelectedMonth.value
      if (y !== 'all' && m !== 'all') {
        const key = `${y}-${m}`
        ;(daysMap[key] || []).forEach((day) => {
          const num = Number(day)
          if (!Number.isNaN(num)) daysSet.add(String(num).padStart(2, '0'))
        })
      } else if (y !== 'all') {
        Object.entries(daysMap).forEach(([key, list]) => {
          if (key.startsWith(`${y}-`)) {
            (list || []).forEach((day) => {
              const num = Number(day)
              if (!Number.isNaN(num)) daysSet.add(String(num).padStart(2, '0'))
            })
          }
        })
      } else {
        Object.values(daysMap).forEach((list) => {
          (list || []).forEach((day) => {
            const num = Number(day)
            if (!Number.isNaN(num)) daysSet.add(String(num).padStart(2, '0'))
          })
        })
      }
      if (!daysSet.size) {
        for (let d = 1; d <= 31; d += 1) daysSet.add(String(d).padStart(2, '0'))
      }
      const sorted = Array.from(daysSet).sort((a, b) => a.localeCompare(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.dayAll') },
        ...sorted.map((day) => ({ value: day, label: `${day}${suffix}` }))
      ]
    })

    // 上传弹窗（主页面/详情复用）
    const uploadDialogVisible = ref(false)
    const uploadDialogDeviceId = ref('')
    const uploadDialogDeviceIdLocked = ref(false)
    const uploadFileList = ref([])
    const uploadDialogUploadRef = ref(null)

    const uploading = ref(false)
    const uploadProgress = ref(0)
    const uploadProgressText = ref('')
    let pollTimer = null

    const hasDeviceReadPermission = computed(() => store.getters['auth/hasPermission']?.('device:read'))
    const hasDataReplayManagePermission = computed(() => store.getters['auth/hasPermission']?.('data_replay:manage'))

    const lastDeviceGroupsLoadAt = ref(0)
    const hasRetriedDeviceGroups = ref(false)

    const formatDate = (d) => {
      if (!d) return '-'
      return new Date(d).toLocaleString('zh-CN')
    }

    const statusLabel = (s) => {
      const map = { uploading: '上传中', parsing: '解析中', parse_failed: '解析失败', completed: '完成', file_error: '文件错误', processing_failed: '处理失败' }
      return map[s] || s || '-'
    }
    const statusTagType = (s) => {
      if (s === 'completed') return 'success'
      if (s === 'parsing' || s === 'uploading') return 'warning'
      if (['file_error', 'parse_failed', 'processing_failed'].includes(s)) return 'danger'
      return ''
    }

    const loadDeviceGroups = async (options = {}) => {
      const force = options?.force === true
      const initial = options?.initial === true
      const now = Date.now()
      if (!force && now - lastDeviceGroupsLoadAt.value < 2000) return
      if (!force && loading.value) return

      loading.value = true
      lastDeviceGroupsLoadAt.value = now
      try {
        const { data } = await api.motionData.listFilesByDevice({ page: currentPage.value, limit: pageSize.value })
        deviceGroups.value = data?.device_groups || []
        deviceTotal.value = data?.pagination?.total || 0
      } catch (e) {
        const willRetry = initial && !hasRetriedDeviceGroups.value
        if (willRetry) {
          hasRetriedDeviceGroups.value = true
          setTimeout(() => loadDeviceGroups({ force: true }), 1500)
        } else {
          ElMessage.error(e?.response?.data?.message || t('logs.errors.loadDeviceGroupsFailed'))
        }
      } finally {
        loading.value = false
      }
    }

    const handleSizeChange = () => { loadDeviceGroups({ force: true }) }
    const handlePageChange = () => { loadDeviceGroups({ force: true }) }


    const syncDetailSelections = () => {
      const monthValues = detailMonthOptions.value.map((o) => o.value)
      if (!monthValues.includes(detailSelectedMonth.value)) detailSelectedMonth.value = 'all'
      const dayValues = detailDayOptions.value.map((o) => o.value)
      if (!dayValues.includes(detailSelectedDay.value)) detailSelectedDay.value = 'all'
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
        const resp = await api.motionData.getTimeFilters({ device_id: selectedDevice.value.device_id })
        const data = resp.data?.data || {}
        const normalize = (v) => {
          if (v == null) return null
          const n = Number(v)
          return Number.isNaN(n) ? null : n
        }
        const normalizeYear = (v) => (normalize(v) != null ? String(normalize(v)).padStart(4, '0') : null)
        const normalizeMonth = (v) => (normalize(v) != null ? String(normalize(v)).padStart(2, '0') : null)
        const normalizeDay = (v) => (normalize(v) != null ? String(normalize(v)).padStart(2, '0') : null)
        const yearsArr = (data.years || []).map(normalizeYear).filter(Boolean)
        detailAvailableYears.value = [...new Set(yearsArr)]
        const monthsResult = {}
        const monthsByYear = data.monthsByYear || {}
        Object.entries(monthsByYear).forEach(([year, list]) => {
          const y = normalizeYear(year)
          if (!y) return
          const months = (list || []).map(normalizeMonth).filter(Boolean)
          if (months.length) monthsResult[y] = [...new Set(months)]
        })
        detailAvailableMonths.value = monthsResult
        const daysResult = {}
        const daysByYearMonth = data.daysByYearMonth || {}
        Object.entries(daysByYearMonth).forEach(([key, list]) => {
          const [yPart, mPart] = String(key).split('-')
          const y = normalizeYear(yPart)
          const m = normalizeMonth(mPart)
          if (!y || !m) return
          const days = (list || []).map(normalizeDay).filter(Boolean)
          if (days.length) daysResult[`${y}-${m}`] = [...new Set(days)]
        })
        detailAvailableDays.value = daysResult
        syncDetailSelections()
      } catch (e) {
        console.warn('loadDetailTimeFilters error:', e)
        detailAvailableYears.value = []
        detailAvailableMonths.value = {}
        detailAvailableDays.value = {}
      }
    }

    const computeCustomRange = () => {
      if (
        detailSelectedYear.value === 'all' &&
        detailSelectedMonth.value === 'all' &&
        detailSelectedDay.value === 'all'
      ) {
        return { start: null, end: null }
      }
      const year = detailSelectedYear.value === 'all' ? currentYear : Number(detailSelectedYear.value)
      const month = detailSelectedMonth.value === 'all' ? null : Number(detailSelectedMonth.value)
      const day = detailSelectedDay.value === 'all' ? null : Number(detailSelectedDay.value)
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

    const formatLocalDateTimeParam = (date) => {
      if (!date) return ''
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const hh = String(date.getHours()).padStart(2, '0')
      const mm = String(date.getMinutes()).padStart(2, '0')
      const ss = String(date.getSeconds()).padStart(2, '0')
      // no timezone suffix, let backend treat as local time
      return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
    }

    const buildDetailTimeParams = () => {
      const params = {}
      const now = new Date()
      let startDate = null
      let endDate = null
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
      if (
        detailQuickRange.value === 'custom' ||
        detailSelectedYear.value !== 'all' ||
        detailSelectedMonth.value !== 'all' ||
        detailSelectedDay.value !== 'all'
      ) {
        const { start, end } = computeCustomRange()
        if (start && end) {
          startDate = start
          endDate = end
        }
      }
      if (startDate && endDate) {
        params.file_time_start = formatLocalDateTimeParam(startDate)
        params.file_time_end = formatLocalDateTimeParam(endDate)
      }
      return params
    }

    const fetchDetailFiles = async (force = false) => {
      if (!selectedDevice.value?.device_id) return
      if (!force && detailLoading.value) return
      
      detailLoading.value = true
      try {
        const timeParams = buildDetailTimeParams()
        const { data } = await api.motionData.listFiles({ 
          device_id: selectedDevice.value.device_id, 
          page: detailCurrentPage.value,
          limit: detailPageSize.value,
          status_filter: detailStatusFilter.value,
          ...timeParams
        })
        detailFiles.value = data?.data || []
        detailTotal.value = data?.total || 0
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '加载文件列表失败')
      } finally {
        detailLoading.value = false
      }
    }

    const handleDetailQuickRangeChange = () => {
      if (detailQuickRange.value !== 'custom') {
        detailSelectedYear.value = 'all'
        detailSelectedMonth.value = 'all'
        detailSelectedDay.value = 'all'
      }
      detailCurrentPage.value = 1
      fetchDetailFiles(true)
    }

    const handleDetailYearChange = (value) => {
      detailSelectedYear.value = value
      if (value === 'all') {
        detailSelectedMonth.value = 'all'
        detailSelectedDay.value = 'all'
        detailQuickRange.value = 'all'
      } else {
        detailQuickRange.value = 'custom'
      }
      detailCurrentPage.value = 1
      fetchDetailFiles(true)
    }

    const handleDetailMonthChange = (value) => {
      if (value !== 'all' && detailSelectedYear.value === 'all') {
        detailSelectedYear.value = String(currentYear)
      }
      detailSelectedMonth.value = value
      if (value === 'all') {
        detailSelectedDay.value = 'all'
        detailQuickRange.value = detailSelectedYear.value === 'all' ? 'all' : 'custom'
      } else {
        detailQuickRange.value = 'custom'
      }
      detailCurrentPage.value = 1
      fetchDetailFiles(true)
    }

    const handleDetailDayChange = (value) => {
      if (value !== 'all') {
        if (detailSelectedYear.value === 'all') detailSelectedYear.value = String(currentYear)
        if (detailSelectedMonth.value === 'all') {
          detailSelectedMonth.value = String(new Date().getMonth() + 1).padStart(2, '0')
        }
        detailQuickRange.value = 'custom'
      } else if (
        detailSelectedYear.value === 'all' &&
        detailSelectedMonth.value === 'all'
      ) {
        detailQuickRange.value = 'all'
      }
      detailSelectedDay.value = value
      detailCurrentPage.value = 1
      fetchDetailFiles(true)
    }

    const handleDetailStatusFilterChange = () => {
      detailCurrentPage.value = 1
      fetchDetailFiles(true)
    }

    const loadDetailFiles = () => {
      detailCurrentPage.value = 1
      fetchDetailFiles(true)
    }

    watch([detailAvailableYears, detailAvailableMonths, detailAvailableDays], () => {
      syncDetailSelections()
    })

    const handleDetailSizeChange = (size) => {
      detailPageSize.value = size
      detailCurrentPage.value = 1
      fetchDetailFiles(true)
    }

    const handleDetailCurrentChange = (page) => {
      detailCurrentPage.value = page
      fetchDetailFiles(true)
    }

    const openDetailDrawer = async (row) => {
      selectedDevice.value = row
      detailDrawerVisible.value = true
      detailFiles.value = []
      detailCurrentPage.value = 1
      detailPageSize.value = 10
      detailQuickRange.value = 'all'
      detailSelectedYear.value = 'all'
      detailSelectedMonth.value = 'all'
      detailSelectedDay.value = 'all'
      detailStatusFilter.value = 'all'
      detailAvailableYears.value = []
      detailAvailableMonths.value = {}
      detailAvailableDays.value = {}
      selectedDetailFiles.value = []
      loadDetailTimeFilters()
      await fetchDetailFiles(true)
    }

    const closeDetailDrawer = () => {
      detailDrawerVisible.value = false
      selectedDevice.value = null
      detailFiles.value = []
      selectedDetailFiles.value = []
      detailQuickRange.value = 'all'
      detailSelectedYear.value = 'all'
      detailSelectedMonth.value = 'all'
      detailSelectedDay.value = 'all'
      detailStatusFilter.value = 'all'
      detailAvailableYears.value = []
      detailAvailableMonths.value = {}
      detailAvailableDays.value = {}
    }

    const handleDetailSelectionChange = (selection) => {
      const filtered = (selection || []).slice(0, 10) // 最多选择10个
      selectedDetailFiles.value = filtered
      // 如果超过10个，需要更新表格选择状态
      if (selection && selection.length > 10) {
        setTimeout(() => {
          if (detailTableRef.value) {
            detailTableRef.value.clearSelection()
            filtered.forEach((row) => {
              detailTableRef.value.toggleRowSelection(row, true)
            })
          }
        }, 0)
      }
    }

    const clearDetailSelection = () => {
      selectedDetailFiles.value = []
      try {
        if (detailTableRef.value) detailTableRef.value.clearSelection()
      } catch (_) {}
    }

    const canBatchDownloadDetail = computed(() => {
      if (!selectedDetailFiles.value.length) return false
      if (selectedDetailFiles.value.length > 10) return false
      return selectedDetailFiles.value.every((r) => String(r.status) === 'completed')
    })

    const canBatchDeleteDetail = computed(() => {
      if (!selectedDetailFiles.value.length) return false
      if (selectedDetailFiles.value.length > 10) return false
      const allowedStatuses = ['parse_failed', 'completed', 'file_error', 'processing_failed']
      return selectedDetailFiles.value.every((r) => allowedStatuses.includes(String(r.status)))
    })

    const batchDownloadDetail = async (format = 'csv') => {
      if (!hasDataReplayManagePermission.value) {
        ElMessage.error('无权限执行此操作')
        return
      }
      try {
        const ids = selectedDetailFiles.value.map((r) => r.id).filter(Boolean)
        if (!ids.length) return
        if (ids.length > 10) {
          ElMessage.warning('批量下载一次最多10条')
          return
        }
        
        // 超过5个文件时提示用户预计处理时间较长
        if (ids.length > 5) {
          ElMessage.info(`已选择 ${ids.length} 个文件，打包处理可能需要较长时间，请耐心等待...`)
        }
        
        // 使用新的批量下载接口（支持格式选择）
        const { data } = await api.motionData.batchDownload(ids, format)
        const taskId = data?.taskId
        if (!taskId) throw new Error('未返回 taskId')
        
        ElMessage.info('批量下载任务已创建，正在处理...')
        
        // 轮询任务状态
        const pollInterval = setInterval(async () => {
          try {
            const resp = await api.motionData.getTaskStatus(taskId)
            const st = resp.data?.data
            const state = st?.status
            
            if (state === 'completed') {
              clearInterval(pollInterval)
              if (timeoutId) clearTimeout(timeoutId)
              // 下载结果文件
              try {
                const downloadResp = await api.motionData.downloadTaskResult(taskId)
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                const formatName = format === 'csv' ? 'csv' : 'jsonl'
                const zipName = st?.result?.zipFileName || `motion_data_${formatName}_${selectedDevice.value?.device_id || 'device'}_${ts}.zip`
                downloadBlob(new Blob([downloadResp.data]), zipName)
                ElMessage.success('批量下载完成')
              } catch (downloadErr) {
                ElMessage.error(downloadErr?.response?.data?.message || '下载结果文件失败')
              }
            } else if (state === 'failed') {
              clearInterval(pollInterval)
              if (timeoutId) clearTimeout(timeoutId)
              ElMessage.error(st?.error || '批量下载任务失败')
            }
            // waiting/active 状态继续轮询
          } catch (pollErr) {
            clearInterval(pollInterval)
            if (timeoutId) clearTimeout(timeoutId)
            ElMessage.error('查询任务状态失败')
          }
        }, 2000) // 每2秒轮询一次
        
        // CSV 打包大文件可能超过 30s，这里放宽超时，避免误报
        const timeoutId = setTimeout(() => {
          clearInterval(pollInterval)
          ElMessage.warning('批量下载任务超时，请稍后在任务列表中下载')
        }, 180000)
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '批量下载失败')
      }
    }

    const batchDeleteDetail = async () => {
      if (!hasDataReplayManagePermission.value) {
        ElMessage.error('无权限执行此操作')
        return
      }
      try {
        const ids = selectedDetailFiles.value.map((r) => r.id).filter(Boolean)
        if (!ids.length) return
        if (ids.length > 10) {
          ElMessage.warning('批量删除一次最多10条')
          return
        }
        await ElMessageBox.confirm(
          `确定删除选中的 ${ids.length} 条运行数据吗？`,
          t('logs.messages.batchDeleteConfirm') || '批量删除确认',
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        await api.motionData.batchDeleteFiles(ids)
        ElMessage.success('已提交批量删除')
        selectedDetailFiles.value = []
        clearDetailSelection()
        await fetchDetailFiles(true)
        await loadDeviceGroups({ force: true })
      } catch (e) {
        if (e === 'cancel') return
        ElMessage.error(e?.response?.data?.message || e?.message || '批量删除失败')
      }
    }

    const handleExceed = () => { ElMessage.warning('最多只能选择5个文件') }

    const openUploadDialog = (deviceId) => {
      uploadDialogVisible.value = true
      uploadFileList.value = []
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      uploadProgress.value = 0
      uploadProgressText.value = ''
      uploading.value = false

      const did = String(deviceId || '').trim()
      if (did) {
        uploadDialogDeviceId.value = did
        uploadDialogDeviceIdLocked.value = true
      } else {
        uploadDialogDeviceId.value = ''
        uploadDialogDeviceIdLocked.value = false
      }
    }

    const closeUploadDialog = () => {
      if (uploading.value) return
      uploadDialogVisible.value = false
      uploadFileList.value = []
      uploadDialogDeviceId.value = ''
      uploadDialogDeviceIdLocked.value = false
      if (uploadDialogUploadRef.value) uploadDialogUploadRef.value.clearFiles()
    }

    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const onFileChange = (file, fileList) => {
      updateUploadFileList(fileList)
    }

    const onFileRemove = (file, fileList) => {
      updateUploadFileList(fileList)
    }

    const updateUploadFileList = (rawList) => {
      const normalized = (rawList || []).map(f => {
        const size = f.size || f.raw?.size || 0
        const sizeText = formatFileSize(size)
        return { ...f, sizeText }
      })
      uploadFileList.value = normalized
    }

    const removeFile = (index) => {
      uploadFileList.value.splice(index, 1)
      if (uploadDialogUploadRef.value) {
        const fileList = uploadDialogUploadRef.value.fileList || []
        if (fileList[index]) {
          uploadDialogUploadRef.value.handleRemove(fileList[index])
        }
      }
    }

    const clearUpload = () => {
      if (uploadDialogUploadRef.value) {
        uploadDialogUploadRef.value.clearFiles()
      }
      uploadFileList.value = []
    }

    const submitUploadDialog = async () => {
      const deviceId = String(uploadDialogDeviceId.value || '').trim()
      if (!deviceId) {
        ElMessage.warning('请填写设备编号')
        return
      }
      const raws = (uploadFileList.value || []).map(f => f.raw).filter(Boolean)
      if (!raws.length) {
        ElMessage.warning('请选择文件')
        return
      }
      
      // 立即关闭弹窗
      uploadDialogVisible.value = false
      uploadFileList.value = []
      if (uploadDialogUploadRef.value) uploadDialogUploadRef.value.clearFiles()
      
      await processUpload(deviceId, raws)
    }

    const processUpload = async (deviceId, filesToUpload) => {
      if (!filesToUpload?.length || !deviceId) return
      uploading.value = true
      try {
        const form = new FormData()
        form.append('device_id', deviceId)
        filesToUpload.forEach(f => form.append('files', f))
        const { data } = await api.motionData.batchUpload(form)
        const taskId = data?.taskId
        if (!taskId) throw new Error('未返回 taskId')
        
        // 刷新列表以显示上传中的状态
        await fetchDetailFiles(true)
        await loadDeviceGroups({ force: true })
        
        // 轮询任务状态（状态会显示在详情列表中）
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = setInterval(async () => {
          try {
            const resp = await api.motionData.getTaskStatus(taskId)
            const st = resp.data?.data
            if (st?.status === 'completed' || st?.status === 'failed') {
              clearInterval(pollTimer)
              pollTimer = null
              uploading.value = false
              await fetchDetailFiles(true)
              await loadDeviceGroups({ force: true })
            }
          } catch (_) {}
        }, 1500)
      } catch (e) {
        uploading.value = false
        ElMessage.error(e?.response?.data?.message || e?.message || '上传失败')
        await fetchDetailFiles(true)
      }
    }

    const downloadBlob = (blob, filename) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    const downloadRaw = async (row) => {
      if (!hasDataReplayManagePermission.value) {
        ElMessage.error('无权限执行此操作')
        return
      }
      if (String(row.status) !== 'completed') {
        ElMessage.warning('仅完成状态的文件可以下载原文件')
        return
      }
      try {
        const resp = await api.motionData.downloadRaw(row.id)
        downloadBlob(new Blob([resp.data]), row.original_name || `motion-${row.id}.bin`)
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '下载失败')
      }
    }

    const downloadParsed = async (row, format = 'jsonl') => {
      if (!hasDataReplayManagePermission.value) {
        ElMessage.error('无权限执行此操作')
        return
      }
      if (String(row.status) !== 'completed') {
        ElMessage.warning('仅完成状态的文件可以下载')
        return
      }
      try {
        const resp = await api.motionData.downloadParsed(row.id, format)
        const base = (row.original_name || `motion-${row.id}.bin`).replace(/\.bin$/i, '')
        const ext = format === 'csv' ? '.csv' : '.jsonl.gz'
        downloadBlob(new Blob([resp.data]), `${base}${ext}`)
        ElMessage.success('下载完成')
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '下载失败')
      }
    }


    const deleteFileInDetail = async (row) => {
      if (!hasDataReplayManagePermission.value) {
        ElMessage.error('无权限执行此操作')
        return
      }
      const allowedStatuses = ['parse_failed', 'completed', 'file_error', 'processing_failed']
      if (!allowedStatuses.includes(String(row.status))) {
        ElMessage.warning('只有解析失败、完成、文件错误、处理失败状态的文件可以删除')
        return
      }
      try {
        await ElMessageBox.confirm(
          '确定删除该运行数据吗？',
          t('shared.messages.deleteConfirmTitle') || '删除确认',
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        await api.motionData.deleteFile(row.id)
        ElMessage.success('已删除')
        await fetchDetailFiles()
        await loadDeviceGroups({ force: true })
      } catch (e) {
        if (e === 'cancel') return
        ElMessage.error(e?.response?.data?.message || '删除失败')
      }
    }

    const handleDetailMoreAction = (command) => {
      const { action, row } = command
      if (action === 'downloadRaw') downloadRaw(row)
      else if (action === 'delete') deleteFileInDetail(row)
    }

    onMounted(() => {
      hasRetriedDeviceGroups.value = false
      loadDeviceGroups({ initial: true })
    })
    onUnmounted(() => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    })

    return {
      Refresh,
      Upload,
      Close,
      deviceGroups,
      deviceTotal,
      loading,
      currentPage,
      pageSize,
      handleSizeChange,
      handlePageChange,
      loadDeviceGroups,
      formatDate,
      statusLabel,
      statusTagType,
      maskHospitalName,
      hasDeviceReadPermission,
      hasDataReplayManagePermission,
      selectedDevice,
      detailDrawerVisible,
      detailFiles,
      detailLoading,
      detailCurrentPage,
      detailPageSize,
      detailTotal,
      handleDetailSizeChange,
      handleDetailCurrentChange,
      uploading,
      uploadProgress,
      uploadProgressText,
      openDetailDrawer,
      closeDetailDrawer,
      detailQuickRange,
      detailStatusFilter,
      detailQuickRangeOptions,
      detailStatusTabs,
      detailSelectedYear,
      detailSelectedMonth,
      detailSelectedDay,
      detailYearOptions,
      detailMonthOptions,
      detailDayOptions,
      handleDetailQuickRangeChange,
      handleDetailStatusFilterChange,
      handleDetailYearChange,
      handleDetailMonthChange,
      handleDetailDayChange,
      loadDetailFiles,
      selectedDetailFiles,
      detailTableRef,
      handleDetailSelectionChange,
      clearDetailSelection,
      canBatchDownloadDetail,
      canBatchDeleteDetail,
      batchDownloadDetail,
      batchDeleteDetail,
      handleExceed,
      uploadDialogVisible,
      uploadDialogDeviceId,
      uploadDialogDeviceIdLocked,
      uploadFileList,
      uploadDialogUploadRef,
      openUploadDialog,
      closeUploadDialog,
      submitUploadDialog,
      onFileChange,
      onFileRemove,
      removeFile,
      clearUpload,
      formatFileSize,
      Document,
      downloadRaw,
      downloadParsed,
      deleteFileInDetail,
      handleDetailMoreAction
    }
  }
}
</script>

<style scoped>
.data-replay-container {
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
  padding: 20px 20px 4px 20px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.action-section {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.pagination-wrapper {
  padding: 8px 0 12px 0;
  display: flex;
  justify-content: center;
}

.progress-section {
  margin: 16px 0;
  padding: 16px;
  background: rgb(var(--background));
  border-radius: var(--radius-md);
  border: 1px solid rgb(var(--border));
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  color: rgb(var(--text-primary));
  font-size: 14px;
}

.progress-text {
  color: rgb(var(--text-secondary));
  font-size: 13px;
}

.drawer-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: auto;
}

/* 详情抽屉：不整体滚动，表格区域固定表头、仅 body 滚动 */
.drawer-content--detail {
  overflow: hidden;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-shrink: 0;
}

.drawer-header .device-info {
  flex: 1;
  min-width: 0;
}

.drawer-header .device-info h3 {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: 600;
  color: rgb(var(--text-primary));
}

.drawer-header .device-info p.device-info-hospital {
  margin: 0;
  font-size: 14px;
  color: rgb(var(--text-secondary));
}

.header-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.close-drawer-btn {
  margin-left: auto;
  color: rgb(var(--text-secondary));
}

.close-drawer-btn:hover {
  color: rgb(var(--text-primary));
}

.device-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.detail-filters {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.detail-filters .detail-status-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.detail-filters .detail-status-tabs :deep(.el-tabs__nav-wrap) {
  justify-content: flex-start;
}

.detail-filters .time-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.detail-filters .quick-range-group {
  flex-shrink: 0;
}

.detail-filters .custom-range-selects {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-filters .custom-range-selects-right {
  margin-left: auto;
}

.detail-filters .time-select {
  width: 130px;
}

.batch-section {
  flex-shrink: 0;
  margin-bottom: 4px;
  display: flex;
  justify-content: flex-end;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: #f0f9ff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

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

.detail-pagination-wrapper {
  padding: 12px 0;
  display: flex;
  justify-content: center;
  border-top: 1px solid rgb(var(--border));
  margin-top: 8px;
}

.operation-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
}

.custom-file-list {
  margin-top: 15px;
  border: 1px solid rgb(var(--border-secondary));
  border-radius: var(--radius-md);
  overflow: hidden;
}

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: rgb(var(--bg-secondary));
  border-bottom: 1px solid rgb(var(--border-secondary));
  font-size: 14px;
  font-weight: 500;
}

.file-items {
  max-height: 200px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px 15px;
  border-bottom: 1px solid rgb(var(--border-secondary));
  transition: background-color 0.2s;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background-color: rgb(var(--bg-secondary));
}

.file-item .el-icon {
  margin-right: 8px;
  color: rgb(var(--text-secondary));
}

.file-name {
  flex: 1;
  margin-right: 10px;
  font-size: 14px;
  color: rgb(var(--text-primary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  margin-right: 10px;
  font-size: 12px;
  color: rgb(var(--text-secondary));
}

.upload-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.parsing-tip {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
 
