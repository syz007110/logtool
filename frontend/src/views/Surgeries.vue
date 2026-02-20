<template>
  <div class="surgeries-container">
    <!-- 统一卡片：包含所有控件 -->
    <el-card class="main-card">
      <!-- 搜索和操作栏 -->
      <div class="action-bar">
        <div class="search-section">
          <el-button
            type="primary"
            :icon="DataAnalysis"
            @click="openSurgeryAnalysisDialog"
          >
            {{ $t('batchAnalysis.surgeryStatistics') }}
          </el-button>
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
        <el-table-column prop="device_id" :label="$t('logs.deviceId')" min-width="160">
          <template #default="{ row }">
            <div class="device-id-cell">
              <el-button 
                text
                size="small"
                @click="showDeviceDetail(row)"
                :title="row.device_id"
              >
                {{ row.device_id }}
              </el-button>
              <el-tag v-if="Number(row.pending_confirm_count || 0) > 0" size="small" type="warning">
                {{ $t('logs.pendingConfirmCount', { count: Number(row.pending_confirm_count || 0) }) }}
              </el-tag>
              <el-tag v-if="getFailedLogCountForDevice(row.device_id) > 0" size="small" type="danger">
                分析失败日志 {{ getFailedLogCountForDevice(row.device_id) }} 条
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="hospital_name" :label="$t('logs.hospitalName')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.hospital_name" class="one-line-ellipsis" :title="maskHospitalName(row.hospital_name, hasDeviceReadPermission)" style="display:inline-block; max-width:100%">{{ maskHospitalName(row.hospital_name, hasDeviceReadPermission) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="surgery_count" :label="$t('logs.totalSurgeries')" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.surgery_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="latest_surgery_time" :label="$t('logs.updateTime')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.latest_surgery_time) }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="220" fixed="right" align="left">
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

    <!-- 手术数据统计参数弹窗 -->
    <el-dialog
      v-model="showAnalyzeDialog"
      :title="$t('batchAnalysis.surgeryStatistics')"
      width="680px"
      append-to-body
    >
      <el-form label-width="120px">
        <el-form-item :label="$t('logs.deviceId')">
          <el-select
            v-model="analysisForm.deviceId"
            filterable
            remote
            clearable
            reserve-keyword
            :placeholder="$t('logs.deviceId')"
            :remote-method="loadAnalysisDeviceOptions"
            :loading="analysisDeviceLoading"
            class="analysis-select"
            @change="handleAnalysisDeviceChange"
          >
            <el-option
              v-for="item in analysisDeviceOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('batchAnalysis.startLogTime')">
          <el-select
            v-model="analysisForm.startLogId"
            filterable
            clearable
            :disabled="!analysisForm.deviceId || analysisLogLoading"
            :placeholder="$t('batchAnalysis.selectStartLogPlaceholder')"
            class="analysis-select"
          >
            <el-option
              v-for="item in analysisLogOptions"
              :key="item.logId"
              :label="item.label"
              :value="item.logId"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('batchAnalysis.endLogTime')">
          <el-select
            v-model="analysisForm.endLogId"
            filterable
            clearable
            :disabled="!analysisForm.deviceId || analysisLogLoading"
            :placeholder="$t('batchAnalysis.selectEndLogPlaceholder')"
            class="analysis-select"
          >
            <el-option
              v-for="item in analysisLogOptions"
              :key="`end-${item.logId}`"
              :label="item.label"
              :value="item.logId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <div class="analysis-hint">
        {{ $t('batchAnalysis.analysisHint') }}
      </div>
      <template #footer>
        <el-button @click="showAnalyzeDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="analysisSubmitting" @click="submitAnalyzeByLogRange">
          {{ $t('batchAnalysis.startAnalyze') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 手术数据统计结果弹窗（列表） -->
    <el-dialog
      v-model="showAnalyzeResultDialog"
      :title="$t('batchAnalysis.surgeryStatistics')"
      width="980px"
      append-to-body
    >
      <div v-if="analysisResultLoading" class="analysis-result-loading">
        <el-empty :description="$t('batchAnalysis.analyzing')" />
      </div>
      <el-table v-else :data="analysisResultRows" style="width: 100%">
        <el-table-column prop="surgery_id" :label="$t('logs.surgeryId')" min-width="220" />
        <el-table-column :label="$t('logs.surgeryStartTime')" min-width="180">
          <template #default="{ row }">{{ formatDate(row.surgery_start_time || row.start_time) }}</template>
        </el-table-column>
        <el-table-column :label="$t('logs.surgeryEndTime')" min-width="180">
          <template #default="{ row }">{{ formatDate(row.surgery_end_time || row.end_time) }}</template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="320" align="left">
          <template #default="{ row }">
            <div class="btn-group operation-buttons">
              <el-button text size="small" @click="visualizeSurgeryStatFromResult(row)">
                {{ $t('batchAnalysis.visualize') }}
              </el-button>
              <el-button text size="small" @click="previewSurgeryDataFromResult(row)">
                {{ $t('batchAnalysis.viewData') }}
              </el-button>
              <el-button
                v-if="hasExportPermission"
                text
                size="small"
                :loading="analysisExportingRow[row.id] === true"
                @click="exportSurgeryRowFromResult(row)"
              >
                {{ $t('batchAnalysis.export') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showAnalyzeResultDialog = false">{{ $t('batchAnalysis.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- 查看数据弹窗（手术统计结果） -->
    <el-dialog
      v-model="analysisSurgeryJsonVisible"
      :title="$t('batchAnalysis.surgeryDataPostgresFormat')"
      width="760px"
      append-to-body
    >
      <div class="analysis-hint" style="margin-bottom: 8px;">
        {{ $t('batchAnalysis.postgresFormatDescription') }}
      </div>
      <el-input type="textarea" :rows="18" v-model="analysisSurgeryJsonText" readonly />
      <template #footer>
        <el-button @click="analysisSurgeryJsonVisible = false">{{ $t('batchAnalysis.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- 手术数据差异比对（与批量日志页一致） -->
    <SurgeryDataCompare
      v-model="showCompareDialog"
      :surgery-id="compareData.surgeryId"
      :existing-data="compareData.existingData"
      :new-data="compareData.newData"
      :differences="compareData.differences"
      :text-diff="compareData.textDiff || ''"
      :surgery-data="compareData.surgeryData"
      :allow-keep-existing="Number(compareData.pendingExportId || 0) > 0"
      :pending-export-id="compareData.pendingExportId || null"
      :full-data-included="compareData.fullDataIncluded === true"
      :loading-full-data="compareLoading"
      @confirmed="handleCompareConfirmed"
      @load-full-data="loadCompareFullData"
    />

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
                <h3 class="min-w-0"><span class="one-line-ellipsis" :title="selectedDevice?.device_id">{{ selectedDevice?.device_id }} {{ $t('dataReplay.detailDrawerTitle') }}</span>（{{ $t('logs.totalSurgeries') }}：{{ detailTotal }}）</h3>
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

          <div v-if="detailFailedGroupsLoading || detailFailedGroups.length > 0" class="failed-group-panel">
            <div class="failed-group-panel-title">
              最近失败分组（按 failed_log_ids 聚合）
            </div>
            <div v-if="detailFailedGroupsLoading" class="failed-group-panel-loading">
              加载失败分组中...
            </div>
            <div v-else class="failed-group-list">
              <div
                v-for="group in detailFailedGroups"
                :key="group.id"
                class="failed-group-item"
              >
                <div class="failed-group-item-main">
                  <el-tag type="danger" size="small">
                    failed_log_ids: {{ (group.failed_log_ids || []).join(', ') || '-' }}
                  </el-tag>
                  <el-tag type="info" size="small">
                    原始分组: {{ (group.source_group_log_ids || []).join(', ') || '-' }}
                  </el-tag>
                  <el-tag size="small">
                    失败次数: {{ Number(group.fail_count || 1) }}
                  </el-tag>
                  <span class="failed-group-time">最近失败: {{ formatDate(group.last_failed_at) }}</span>
                </div>
                <div class="failed-group-actions">
                  <el-button
                    text
                    type="danger"
                    size="small"
                    :loading="retryingFailedGroupId === group.id"
                    @click="retryFailedGroup(group)"
                  >
                    重试该组
                  </el-button>
                </div>
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
              <el-table-column :label="$t('logs.surgeryStatusLabel')" width="100" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.has_pending_confirmation" size="small" type="warning">{{ $t('logs.surgeryStatusPendingConfirm') }}</el-tag>
                  <el-tag v-else size="small" type="success">{{ $t('logs.surgeryStatusExported') }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="$t('shared.operation')" align="left" width="220">
                <template #default="{ row }">
                  <div class="operation-buttons">
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
                      v-if="row.has_pending_confirmation"
                      text
                      size="small"
                      type="warning"
                      :loading="compareLoadingRowId === row.surgery_id"
                      :disabled="compareLoadingRowId != null"
                      @click="openPendingCompare(row)"
                      :aria-label="$t('logs.pendingConfirmProcess')"
                      :title="$t('logs.pendingConfirmProcess')"
                    >
                      {{ $t('logs.pendingConfirmProcess') }}
                    </el-button>
                    <el-dropdown
                      trigger="click"
                      placement="bottom-end"
                      @command="(cmd) => handleDetailSurgeryMoreAction(cmd, row)"
                    >
                      <el-button text size="small">
                        <i class="fas fa-ellipsis-h"></i>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item :command="'viewLogs'">
                            {{ $t('logs.viewLogs') }}
                          </el-dropdown-item>
                          <el-dropdown-item :command="'viewData'">
                            {{ $t('batchAnalysis.viewData') }}
                          </el-dropdown-item>
                          <el-dropdown-item
                            v-if="canDeleteSurgery"
                            :command="'delete'"
                            class="dropdown-item-danger"
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
import { Search, Refresh, RefreshLeft, List, Close, DataAnalysis } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { visualizeSurgery as visualizeSurgeryData } from '@/utils/visualizationHelper'
import SurgeryDataCompare from '@/components/SurgeryDataCompare.vue'
import { maskHospitalName } from '@/utils/maskSensitiveData'
import { formatTime, loadServerTimezone } from '@/utils/timeFormatter'
import { getTableHeight } from '@/utils/tableHeight'

export default {
  name: 'Surgeries',
  components: {
    SurgeryDataCompare
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t, locale } = useI18n()

    const ANALYSIS_FAILED_CACHE_KEY = 'surgeries.analysis.failedLogsByDevice.v1'

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
    const detailFailedGroups = ref([])
    const detailFailedGroupsLoading = ref(false)
    const retryingFailedGroupId = ref(null)
    const detailAvailableYears = ref([])
    const detailAvailableMonths = ref({})
    const detailAvailableDays = ref({})
    const detailTypeFilter = ref('all')
    const detailQuickRange = ref('all')
    const detailSelectedYear = ref('all')
    const detailSelectedMonth = ref('all')
    const detailSelectedDay = ref('all')

    // 手术分析弹窗相关
    const showAnalyzeDialog = ref(false)
    const showAnalyzeResultDialog = ref(false)
    const analysisSubmitting = ref(false)
    const analysisResultLoading = ref(false)
    const analysisResultRows = ref([])
    const analysisDeviceLoading = ref(false)
    const analysisLogLoading = ref(false)
    const analysisDeviceOptions = ref([])
    const analysisLogOptions = ref([])
    const analysisForm = ref({
      deviceId: '',
      startLogId: null,
      endLogId: null
    })
    const analysisExportingRow = ref({})
    const analysisSurgeryJsonVisible = ref(false)
    const analysisSurgeryJsonText = ref('')
    const analysisFailedByDevice = ref({})
    const showCompareDialog = ref(false)
    const compareData = ref({})
    const compareLoading = ref(false)
    const compareLoadingRowId = ref(null)

    const canDeleteSurgery = computed(() => store.getters['auth/hasPermission']?.('surgery:delete'))
    const hasDeviceReadPermission = computed(() => store.getters['auth/hasPermission']?.('device:read'))
    const hasExportPermission = computed(() => store.getters['auth/hasPermission']?.('surgery:export'))

    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('basic')
    })

    const normalizeLogIds = (logIds) => {
      return Array.from(new Set(
        (Array.isArray(logIds) ? logIds : [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ))
    }

    const persistFailedLogCache = () => {
      try {
        localStorage.setItem(ANALYSIS_FAILED_CACHE_KEY, JSON.stringify(analysisFailedByDevice.value || {}))
      } catch (_) {
        // ignore
      }
    }

    const loadFailedLogCache = () => {
      try {
        const raw = localStorage.getItem(ANALYSIS_FAILED_CACHE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return
        const normalized = {}
        Object.entries(parsed).forEach(([deviceId, item]) => {
          const did = String(deviceId || '').trim()
          if (!did) return
          const logIds = normalizeLogIds(item?.logIds)
          if (!logIds.length) return
          normalized[did] = {
            logIds,
            details: Array.isArray(item?.details) ? item.details : [],
            updatedAt: item?.updatedAt || null
          }
        })
        analysisFailedByDevice.value = normalized
      } catch (_) {
        // ignore broken cache
      }
    }

    const refreshDeviceFailureMarks = () => {
      deviceGroups.value = (deviceGroups.value || []).map((row) => {
        const did = String(row?.device_id || '').trim()
        const cached = did ? analysisFailedByDevice.value[did] : null
        const serverIds = normalizeLogIds(row?.failed_analysis_log_ids)
        const finalIds = serverIds.length > 0 ? serverIds : normalizeLogIds(cached?.logIds)
        return {
          ...row,
          failed_analysis_log_ids: finalIds,
          failed_analysis_log_count: Number(finalIds.length || 0),
          failed_analysis_updated_at: row?.failed_analysis_updated_at || cached?.updatedAt || null
        }
      })
    }

    const syncFailureCacheFromServerRows = (rows = []) => {
      const merged = { ...(analysisFailedByDevice.value || {}) }
      ;(Array.isArray(rows) ? rows : []).forEach((row) => {
        const did = String(row?.device_id || '').trim()
        if (!did) return
        const serverIds = normalizeLogIds(row?.failed_analysis_log_ids)
        if (!serverIds.length) {
          delete merged[did]
          return
        }
        merged[did] = {
          logIds: serverIds,
          details: Array.isArray(row?.failed_analysis_log_details) ? row.failed_analysis_log_details : (merged[did]?.details || []),
          updatedAt: row?.failed_analysis_updated_at || merged[did]?.updatedAt || null
        }
      })
      analysisFailedByDevice.value = merged
      persistFailedLogCache()
    }

    const updateFailedLogsForDevice = (deviceId, failedLogDetails = []) => {
      const did = String(deviceId || '').trim()
      if (!did) return
      const details = (Array.isArray(failedLogDetails) ? failedLogDetails : []).map((item) => ({
        logId: Number(item?.logId),
        reason: item?.reason || 'unknown error'
      })).filter((item) => Number.isFinite(item.logId))
      const logIds = normalizeLogIds(details.map((item) => item.logId))
      if (!logIds.length) {
        delete analysisFailedByDevice.value[did]
      } else {
        analysisFailedByDevice.value[did] = {
          logIds,
          details,
          updatedAt: new Date().toISOString()
        }
      }
      persistFailedLogCache()
      refreshDeviceFailureMarks()
    }

    const clearFailedLogsForDevice = (deviceId) => {
      const did = String(deviceId || '').trim()
      if (!did) return
      if (!analysisFailedByDevice.value[did]) return
      delete analysisFailedByDevice.value[did]
      persistFailedLogCache()
      refreshDeviceFailureMarks()
    }

    const getFailedLogCountForDevice = (deviceId) => {
      const did = String(deviceId || '').trim()
      if (!did) return 0
      const row = (deviceGroups.value || []).find((item) => String(item?.device_id || '').trim() === did)
      const serverCount = Number(row?.failed_analysis_log_count || 0)
      if (serverCount > 0) return serverCount
      const item = analysisFailedByDevice.value[did]
      return Array.isArray(item?.logIds) ? item.logIds.length : 0
    }

    const getFailedLogIdsForDevice = (deviceId) => {
      const did = String(deviceId || '').trim()
      if (!did) return []
      const row = (deviceGroups.value || []).find((item) => String(item?.device_id || '').trim() === did)
      const serverIds = normalizeLogIds(row?.failed_analysis_log_ids)
      if (serverIds.length > 0) return serverIds
      const item = analysisFailedByDevice.value[did]
      return normalizeLogIds(item?.logIds)
    }

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
        
        const groups = Array.isArray(resp.data?.device_groups) ? resp.data.device_groups : []
        syncFailureCacheFromServerRows(groups)
        deviceGroups.value = groups
        refreshDeviceFailureMarks()
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

    const buildLogTimeMs = (log) => {
      if (!log) return null
      const y = Number(log.file_year)
      const mo = Number(log.file_month)
      const d = Number(log.file_day)
      const h = Number(log.file_hour)
      const mi = log.file_minute != null && log.file_minute !== '' ? Number(log.file_minute) : 0
      if (![y, mo, d, h, mi].every((v) => Number.isFinite(v))) return null
      return new Date(y, mo - 1, d, h, mi, 0, 0).getTime()
    }

    const formatLogTimeLabel = (log) => {
      const ts = buildLogTimeMs(log)
      if (!Number.isFinite(ts)) return log?.original_name || `log-${log?.id || ''}`
      const dt = new Date(ts)
      const y = dt.getFullYear()
      const mo = String(dt.getMonth() + 1).padStart(2, '0')
      const d = String(dt.getDate()).padStart(2, '0')
      const h = String(dt.getHours()).padStart(2, '0')
      const mi = String(dt.getMinutes()).padStart(2, '0')
      return `${y}-${mo}-${d} ${h}:${mi}`
    }

    // 设备下拉：从日志侧取“有上传过日志”的设备（logs 表按 device_id 分组）
    const loadAnalysisDeviceOptions = async (keyword = '') => {
      try {
        analysisDeviceLoading.value = true
        const resp = await api.logs.getByDevice({
          page: 1,
          limit: 200,
          device_filter: String(keyword || '').trim() || undefined
        })
        const groups = Array.isArray(resp.data?.device_groups) ? resp.data.device_groups : []
        analysisDeviceOptions.value = groups
          .map((g) => {
            const deviceId = String(g.device_id || '').trim()
            if (!deviceId) return null
            const label = g.hospital_name ? `${deviceId}（${g.hospital_name}）` : deviceId
            return { value: deviceId, label }
          })
          .filter(Boolean)
      } catch (error) {
        ElMessage.error(t('logs.errors.loadSurgeryDataFailed'))
      } finally {
        analysisDeviceLoading.value = false
      }
    }

    const loadParsedLogsForAnalysis = async (deviceId) => {
      const did = String(deviceId || '').trim()
      if (!did) return
      try {
        analysisLogLoading.value = true
        analysisLogOptions.value = []
        analysisForm.value.startLogId = null
        analysisForm.value.endLogId = null

        let page = 1
        const limit = 500
        const maxPages = 40
        let allLogs = []
        let total = 0
        do {
          const resp = await api.logs.getList({
            device_id: did,
            status_filter: 'parsed',
            page,
            limit
          })
          const logs = Array.isArray(resp.data?.logs) ? resp.data.logs : []
          total = Number(resp.data?.total || 0)
          allLogs = allLogs.concat(logs)
          if (!logs.length) break
          page += 1
        } while ((page - 1) < maxPages && allLogs.length < total)

        const normalized = allLogs
          .map((log) => {
            const ts = buildLogTimeMs(log)
            if (!Number.isFinite(ts)) return null
            return {
              logId: log.id,
              timestampMs: ts,
              label: `${formatLogTimeLabel(log)} (${log.original_name || `ID:${log.id}`})`
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.timestampMs - b.timestampMs)

        analysisLogOptions.value = normalized
        if (normalized.length > 0) {
          analysisForm.value.startLogId = normalized[0].logId
          analysisForm.value.endLogId = normalized[normalized.length - 1].logId
        }
      } catch (error) {
        ElMessage.error('加载可分析日志失败')
      } finally {
        analysisLogLoading.value = false
      }
    }

    const openSurgeryAnalysisDialog = async () => {
      showAnalyzeDialog.value = true
      if (!analysisDeviceOptions.value.length) {
        await loadAnalysisDeviceOptions('')
      }
      if (selectedDevice.value?.device_id) {
        analysisForm.value.deviceId = selectedDevice.value.device_id
        await loadParsedLogsForAnalysis(selectedDevice.value.device_id)
      }
    }

    const handleAnalysisDeviceChange = async (deviceId) => {
      await loadParsedLogsForAnalysis(deviceId)
    }

    const pollSurgeryAnalysisTask = async (taskId) => {
      const maxAttempts = 60
      let attempts = 0
      while (attempts < maxAttempts) {
        const resp = await api.surgeryStatistics.getAnalysisTaskStatus(taskId)
        const task = resp.data?.data
        if (task?.status === 'completed') {
          return {
            surgeries: Array.isArray(task.result) ? task.result : [],
            exportSummary: task.exportSummary || null,
            failedLogIds: normalizeLogIds(task.failedLogIds),
            failedLogDetails: Array.isArray(task.failedLogDetails) ? task.failedLogDetails : []
          }
        }
        if (task?.status === 'failed') {
          const err = new Error(task.error || '分析任务失败')
          err.failedLogIds = normalizeLogIds(task.failedLogIds)
          err.failedLogDetails = Array.isArray(task.failedLogDetails) ? task.failedLogDetails : []
          throw err
        }
        attempts += 1
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
      throw new Error('分析任务超时，请稍后重试')
    }

    const runAnalyzeAndAutoImportInBackground = async (taskId, fallbackRows = null, context = {}) => {
      try {
        let summary = null
        let surgeries = []
        let failedLogIds = []
        let failedLogDetails = []
        if (taskId) {
          const taskResult = await pollSurgeryAnalysisTask(taskId)
          surgeries = taskResult.surgeries
          summary = taskResult.exportSummary
          failedLogIds = normalizeLogIds(taskResult.failedLogIds)
          failedLogDetails = Array.isArray(taskResult.failedLogDetails) ? taskResult.failedLogDetails : []
        } else if (Array.isArray(fallbackRows)) {
          surgeries = fallbackRows
          summary = {
            total: surgeries.length,
            imported: 0,
            pending: 0,
            failed: 0
          }
        }

        if (context?.deviceId) {
          if (failedLogIds.length > 0) {
            updateFailedLogsForDevice(
              context.deviceId,
              (failedLogDetails.length > 0 ? failedLogDetails : failedLogIds.map((logId) => ({ logId, reason: 'unknown error' })))
            )
          } else {
            clearFailedLogsForDevice(context.deviceId)
          }
        }

        await loadDeviceGroups({ silent: true, force: true })
        if (showDeviceDetailDrawer.value) {
          await loadDetailSurgeries({ silent: true })
          await loadDetailFailedGroups({ silent: true })
        }
        const finalSummary = summary || {
          total: surgeries.length,
          imported: 0,
          pending: 0,
          failed: 0
        }
        ElMessage.success(
          `手术分析与自动入库完成：共 ${finalSummary.total} 条，已入库 ${finalSummary.imported} 条，待确认 ${finalSummary.pending} 条，失败 ${finalSummary.failed} 条`
        )
        if (failedLogIds.length > 0) {
          ElMessage.warning(`本次仍有 ${failedLogIds.length} 个日志分析失败，已在设备详情抽屉记录，可按分组重试`)
        }
      } catch (error) {
        if (context?.deviceId) {
          const failedLogIds = normalizeLogIds(error?.failedLogIds)
          if (failedLogIds.length > 0) {
            const failedLogDetails = Array.isArray(error?.failedLogDetails) ? error.failedLogDetails : []
            updateFailedLogsForDevice(
              context.deviceId,
              (failedLogDetails.length > 0 ? failedLogDetails : failedLogIds.map((logId) => ({ logId, reason: error?.message || 'analysis failed' })))
            )
          }
        }
        ElMessage.error(error?.response?.data?.message || error.message || '后台手术分析/入库失败')
      }
    }

    const submitAnalyzeByLogRange = async () => {
      const { deviceId, startLogId, endLogId } = analysisForm.value
      if (!deviceId) {
        ElMessage.warning('请选择设备编号')
        return
      }
      if (!startLogId || !endLogId) {
        ElMessage.warning('请选择开始和结束日志时间')
        return
      }

      const startIndex = analysisLogOptions.value.findIndex((item) => item.logId === startLogId)
      const endIndex = analysisLogOptions.value.findIndex((item) => item.logId === endLogId)
      if (startIndex < 0 || endIndex < 0) {
        ElMessage.warning('请选择有效的日志时间范围')
        return
      }

      const from = Math.min(startIndex, endIndex)
      const to = Math.max(startIndex, endIndex)
      const selectedLogIds = analysisLogOptions.value.slice(from, to + 1).map((item) => item.logId)
      if (!selectedLogIds.length) {
        ElMessage.warning('未找到可分析日志')
        return
      }

      analysisSubmitting.value = true
      try {
        const resp = await api.surgeryStatistics.analyzeByLogIds(selectedLogIds, true, null, { autoImport: true })
        if (resp.data?.taskId) {
          showAnalyzeDialog.value = false
          ElMessage.success('手术分析任务已加入队列，系统将在后台自动入库')
          runAnalyzeAndAutoImportInBackground(resp.data.taskId, null, { deviceId })
        } else if (Array.isArray(resp.data?.data)) {
          showAnalyzeDialog.value = false
          ElMessage.success('手术分析完成，系统正在自动入库')
          runAnalyzeAndAutoImportInBackground(null, resp.data.data, { deviceId })
        } else {
          throw new Error(resp.data?.message || '创建手术分析任务失败')
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || error.message || '手术数据统计失败')
      } finally {
        analysisSubmitting.value = false
      }
    }

    // 手术统计结果列表操作（与批量日志页一致：可视化、查看数据、导出）
    const visualizeSurgeryStatFromResult = (row) => {
      const data = row?.postgresql_row_preview || row
      visualizeSurgeryData(data)
    }

    const previewSurgeryDataFromResult = (row) => {
      const data = row?.postgresql_row_preview || row
      analysisSurgeryJsonText.value = JSON.stringify(data, null, 2)
      analysisSurgeryJsonVisible.value = true
    }

    const exportSurgeryRowFromResult = async (row) => {
      if (!store.getters['auth/hasPermission']?.('surgery:export')) return
      try {
        analysisExportingRow.value[row.id] = true
        const response = await api.surgeryStatistics.exportSingleSurgeryData(row)
        if (response.data.success) {
          ElMessage.success('手术数据已成功导出到PostgreSQL数据库')
        } else if (response.data.needsConfirmation) {
          ElMessage.warning(response.data.message || t('logs.messages.surgeryExistsAsPending', { id: response.data.surgery_id }))
          loadDeviceGroups({ silent: true, force: true })
          if (showDeviceDetailDrawer.value) {
            loadDetailSurgeries({ silent: true })
          }
        } else {
          ElMessage.warning(response.data.message || '导出完成，但可能未存储到数据库')
        }
      } catch (e) {
        ElMessage.error('导出到PostgreSQL数据库失败: ' + (e?.response?.data?.message || e?.message || ''))
      } finally {
        analysisExportingRow.value[row.id] = false
      }
    }

    const openPendingCompare = async (row) => {
      const pendingId = Number(row?.pending_export_id)
      if (!Number.isFinite(pendingId)) {
        ElMessage.warning(t('logs.messages.noPendingConfirmData'))
        return
      }
      try {
        compareLoadingRowId.value = row.surgery_id
        // 默认不拉取完整 structured_data，加快首屏响应；展开「显示详细比对」时再请求 full=1
        const resp = await api.surgeryStatistics.getPendingExportDetail(pendingId, { full: '0' })
        const detail = resp.data?.data || {}
        showCompareDialog.value = true
        compareData.value = {
          surgeryId: detail.surgery_id,
          existingData: detail.existingData || {},
          newData: detail.newData || {},
          differences: Array.isArray(detail.differences) ? detail.differences : [],
          textDiff: typeof detail.textDiff === 'string' ? detail.textDiff : '',
          surgeryData: detail.surgeryData || {},
          pendingExportId: pendingId,
          fullDataIncluded: detail.fullDataIncluded === true
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || error?.message || t('logs.messages.loadPendingConfirmFailed'))
      } finally {
        compareLoadingRowId.value = null
      }
    }

    const loadCompareFullData = async () => {
      const pendingId = Number(compareData.value?.pendingExportId)
      if (!Number.isFinite(pendingId) || compareData.value?.fullDataIncluded) return
      try {
        compareLoading.value = true
        const resp = await api.surgeryStatistics.getPendingExportDetail(pendingId, { full: '1' })
        const detail = resp.data?.data || {}
        compareData.value = {
          ...compareData.value,
          existingData: detail.existingData || compareData.value.existingData,
          newData: detail.newData || compareData.value.newData,
          differences: Array.isArray(detail.differences) ? detail.differences : compareData.value.differences,
          textDiff: typeof detail.textDiff === 'string' ? detail.textDiff : (compareData.value.textDiff || ''),
          fullDataIncluded: true
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || error?.message || t('logs.messages.loadPendingConfirmFailed'))
      } finally {
        compareLoading.value = false
      }
    }

    const handleCompareConfirmed = async () => {
      try {
        await loadDeviceGroups({ silent: true, force: true })
        if (showDeviceDetailDrawer.value) {
          await loadDetailSurgeries({ silent: true })
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || error?.message || t('logs.messages.updateTodoStatusFailed'))
      } finally {
        showCompareDialog.value = false
        compareData.value = {}
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
    const loadDetailFailedGroups = async (options = {}) => {
      const deviceId = String(selectedDevice.value?.device_id || '').trim()
      if (!deviceId) {
        detailFailedGroups.value = []
        return
      }
      try {
        detailFailedGroupsLoading.value = true
        const resp = await api.surgeries.getFailedAnalysisGroups({ device_id: deviceId })
        detailFailedGroups.value = Array.isArray(resp.data?.data) ? resp.data.data : []
      } catch (error) {
        detailFailedGroups.value = []
        if (!options?.silent) {
          ElMessage.error('加载失败分组记录失败')
        }
      } finally {
        detailFailedGroupsLoading.value = false
      }
    }

    const retryFailedGroup = async (group) => {
      const deviceId = String(selectedDevice.value?.device_id || '').trim()
      if (!deviceId) {
        ElMessage.warning('设备编号无效')
        return
      }
      const sourceGroup = normalizeLogIds(group?.source_group_log_ids)
      const failedIds = normalizeLogIds(group?.failed_log_ids)
      const retryLogIds = sourceGroup.length > 0 ? sourceGroup : failedIds
      if (!retryLogIds.length) {
        ElMessage.warning('该分组没有可重试的日志ID')
        return
      }
      try {
        retryingFailedGroupId.value = group?.id || null
        const resp = await api.surgeryStatistics.analyzeByLogIds(
          retryLogIds,
          true,
          null,
          { autoImport: true, retryFailedGroupId: group?.id || null }
        )
        if (resp.data?.taskId) {
          ElMessage.success(`分组重试任务已提交（${retryLogIds.length} 条日志）`)
          runAnalyzeAndAutoImportInBackground(resp.data.taskId, null, { deviceId })
        } else if (Array.isArray(resp.data?.data)) {
          ElMessage.success('分组重试分析完成，系统正在自动入库')
          runAnalyzeAndAutoImportInBackground(null, resp.data.data, { deviceId })
        } else {
          throw new Error(resp.data?.message || '创建分组重试任务失败')
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || error.message || '分组重试任务创建失败')
      } finally {
        retryingFailedGroupId.value = null
      }
    }

    // 显示设备详情
    const showDeviceDetail = (device) => {
      selectedDevice.value = device
      showDeviceDetailDrawer.value = true
      detailSurgeries.value = []
      detailTotal.value = Number(device?.surgery_count || 0)
      detailFailedGroups.value = []
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
      loadDetailSurgeries({ fast: true })
      loadDetailFailedGroups({ silent: true })
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
          limit: detailPageSize.value,
          // 列表场景不返回 structured_data 大字段，减少传输和前端处理耗时
          include_structured_data: 0
        }
        if (detailTypeFilter.value !== 'all') {
          params.type = detailTypeFilter.value
        }
        const timeParams = buildDetailTimeParams()
        Object.assign(params, timeParams)
        const isDefaultRange = !timeParams.time_range_start && !timeParams.time_range_end
        const shouldUseFastPath =
          !!options.fast &&
          detailCurrentPage.value === 1 &&
          detailTypeFilter.value === 'all' &&
          isDefaultRange
        if (shouldUseFastPath) {
          params.skip_count = 1
        }

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

        const respTotal = resp.data?.total
        if (typeof respTotal === 'number') {
          detailTotal.value = respTotal
        } else if (shouldUseFastPath) {
          detailTotal.value = Number(selectedDevice.value?.surgery_count || detailTotal.value || 0)
        } else {
          detailTotal.value = 0
        }

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

    // 设备详情手术数据「查看数据」：显示 surgeries 表全部字段
    const previewSurgeryDataFromDetail = async (row) => {
      try {
        let data = null
        if (row?.id) {
          const resp = await api.surgeries.get(row.id, { raw_structured_data: 1 })
          data = resp.data?.data ?? null
        }
        if (!data && row) {
          data = row
        }
        analysisSurgeryJsonText.value = data != null ? JSON.stringify(data, null, 2) : '{}'
        analysisSurgeryJsonVisible.value = true
      } catch (e) {
        ElMessage.error(t('shared.messages.operationFailed'))
      }
    }

    // 设备详情手术数据「更多」操作
    const handleDetailSurgeryMoreAction = (cmd, row) => {
      if (cmd === 'viewLogs') {
        viewLogsBySurgery(row)
      } else if (cmd === 'viewData') {
        previewSurgeryDataFromDetail(row)
      } else if (cmd === 'delete') {
        deleteSurgery(row)
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
    const visualizeSurgery = async (row) => {
      try {
        let surgeryRow = row
        // 设备详情列表默认不带 structured_data，点击可视化时再按需拉取单条完整数据
        if (!row?.structured_data && row?.id) {
          const resp = await api.surgeries.get(row.id, { raw_structured_data: 1 })
          surgeryRow = resp.data?.data || row
        }
        visualizeSurgeryData(surgeryRow, { queryId: row.id })
      } catch (e) {
        ElMessage.error(t('shared.messages.operationFailed'))
      }
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
      detailFailedGroups.value = []
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
      loadFailedLogCache()
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
      showAnalyzeDialog,
      showAnalyzeResultDialog,
      analysisSubmitting,
      analysisResultLoading,
      analysisResultRows,
      analysisDeviceLoading,
      analysisLogLoading,
      analysisDeviceOptions,
      analysisLogOptions,
      analysisForm,
      analysisExportingRow,
      analysisSurgeryJsonVisible,
      analysisSurgeryJsonText,
      showCompareDialog,
      compareData,
      compareLoading,
      hasExportPermission,
      // 设备详情相关
      showDeviceDetailDrawer,
      selectedDevice,
      detailSurgeries,
      detailLoading,
      detailCurrentPage,
      detailPageSize,
      detailTotal,
      detailFailedGroups,
      detailFailedGroupsLoading,
      retryingFailedGroupId,
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
      openSurgeryAnalysisDialog,
      loadAnalysisDeviceOptions,
      getFailedLogCountForDevice,
      handleAnalysisDeviceChange,
      submitAnalyzeByLogRange,
      visualizeSurgeryStatFromResult,
      previewSurgeryDataFromResult,
      exportSurgeryRowFromResult,
      compareLoadingRowId,
      openPendingCompare,
      loadCompareFullData,
      handleDetailSurgeryMoreAction,
      handleCompareConfirmed,
      showDeviceDetail,
      retryFailedGroup,
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
      DataAnalysis,
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
  gap: 10px;
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

.analysis-select {
  width: 100%;
}

.analysis-hint {
  margin-top: 6px;
  color: rgb(var(--text-secondary));
  font-size: 12px;
}

.analysis-result-loading {
  padding: 20px 0;
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

/* 卡片头部：包含关闭按钮和设备信息（与 DataReplay 详细列表统一） */
.detail-surgeries-card-header {
  flex-shrink: 0;
  margin-bottom: 12px;
  padding-bottom: 8px;
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
  min-width: 0;
}

.device-info h3 {
  margin: 0 0 6px 0;
  color: rgb(var(--text-primary));
  font-size: 16px;
  font-weight: 600;
}

.device-info p {
  margin: 0;
  color: rgb(var(--text-secondary));
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

.failed-group-panel {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgb(var(--border-secondary));
  border-radius: 6px;
  background: rgb(var(--background-secondary));
}

.failed-group-panel-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: rgb(var(--text-primary));
}

.failed-group-panel-loading {
  color: rgb(var(--text-secondary));
  font-size: 12px;
}

.failed-group-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.failed-group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgb(var(--black-white-white));
  border: 1px solid rgb(var(--border-secondary));
}

.failed-group-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.failed-group-time {
  font-size: 12px;
  color: rgb(var(--text-secondary));
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

.device-id-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 操作列按钮组样式 */
.operation-buttons {
  display: flex;
  justify-content: flex-start;
  align-items: center;
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
