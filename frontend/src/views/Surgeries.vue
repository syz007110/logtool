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
            <span v-if="row.hospital_name" class="one-line-ellipsis" :title="row.hospital_name" style="display:inline-block; max-width:100%">{{ row.hospital_name }}</span>
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
            <p v-if="selectedDevice?.hospital_name" class="min-w-0"><span class="one-line-ellipsis" :title="selectedDevice.hospital_name">{{ $t('logs.hospitalName') }}：{{ selectedDevice.hospital_name }}</span></p>
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
          <el-table
            :data="detailSurgeries"
            :loading="detailLoading"
            style="width: 100%"
            v-loading="detailLoading"
          >
            <el-table-column prop="surgery_id" :label="$t('logs.surgeryId')" />
            <el-table-column prop="start_time" :label="$t('logs.surgeryStartTime')">
              <template #default="{ row }">{{ formatDate(row.start_time) }}</template>
            </el-table-column>
            <el-table-column prop="end_time" :label="$t('logs.surgeryEndTime')">
              <template #default="{ row }">{{ formatDate(row.end_time) }}</template>
            </el-table-column>
            <el-table-column :label="$t('shared.operation')" align="center">
              <template #default="{ row }">
                <div class="btn-group">
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

    const canDeleteSurgery = computed(() => store.getters['auth/hasPermission']?.('surgery:delete'))

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

        // 获取所有手术数据（用于分组统计）
        const allSurgeriesResp = await api.surgeries.list({
          limit: 10000 // 获取足够多的数据进行分组
        })
        const allSurgeries = allSurgeriesResp.data?.data || []

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

    // 显示设备详情
    const showDeviceDetail = (device) => {
      selectedDevice.value = device
      showDeviceDetailDrawer.value = true
      detailCurrentPage.value = 1
      loadDetailSurgeries()
    }

    // 加载设备详细手术数据
    const loadDetailSurgeries = async () => {
      if (!selectedDevice.value) return
      try {
        detailLoading.value = true
        const resp = await api.surgeries.list({
          device_id: selectedDevice.value.device_id,
          page: detailCurrentPage.value,
          limit: detailPageSize.value
        })
        detailSurgeries.value = resp.data?.data || []
        detailTotal.value = resp.data?.total || 0
      } catch (e) {
        ElMessage.error(t('logs.errors.loadSurgeryDataFailed'))
      } finally {
        detailLoading.value = false
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

    // 日期格式化
    const formatDate = (dateString) => {
      if (!dateString) return '-'
      const dateLocale = locale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
      return new Date(dateString).toLocaleString(dateLocale)
    }

    onMounted(() => {
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
      // 权限
      canDeleteSurgery,
      // 方法
      loadDeviceGroups,
      showDeviceDetail,
      loadDetailSurgeries,
      visualizeSurgery,
      deleteSurgery,
      handleDrawerClose,
      handleDeviceSizeChange,
      handleDeviceCurrentChange,
      handleDetailSizeChange,
      handleDetailCurrentChange,
      handleKeywordClear,
      resetFilters,
      formatDate,
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
}
</style>
