<template>
  <div class="history-container">
    <!-- 统一卡片：包含操作栏和列表 -->
    <el-card class="main-card">
      <!-- 操作栏 -->
      <div class="action-bar">
        <div class="action-section">
          <el-button type="primary" @click="loadHistory">
            <el-icon><Refresh /></el-icon>
            {{ $t('shared.refresh') }}
          </el-button>
        </div>
      </div>
      
      <!-- 历史记录列表 - 固定表头 -->
      <div class="table-container">
        <el-table
          :data="historyList"
          :loading="loading"
          :height="tableHeight"
          style="width: 100%"
          v-loading="loading"
        >
        <el-table-column prop="operation" :label="$t('history.operation')" width="150" />
        <el-table-column :label="$t('history.description')" min-width="200">
          <template #default="{ row }">
            <el-tooltip
              :content="row.description || ''"
              placement="top"
              effect="dark"
              :show-after="500"
              :disabled="!row.description"
            >
              <span class="description-cell">{{ row.description }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="user" :label="$t('history.user')" width="120" />
        <el-table-column prop="time" :label="$t('shared.time')" min-width="180">
          <template #default="{ row }">
            {{ formatDate(row.time) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('shared.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ $t(getStatusText(row.status)) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="$t('history.details')" width="100" fixed="right" align="left">
          <template #default="{ row }">
            <div class="operation-buttons">
              <el-button
                text
                size="small"
                @click="showDetails(row)"
                :aria-label="$t('history.view')"
                :title="$t('history.view')"
              >
                {{ $t('history.view') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>
      
      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    
    <!-- 详情对话框 -->
    <el-dialog
      v-model="showDetailsDialog"
      :title="$t('history.details')"
      width="600px"
    >
      <div v-if="selectedRecord">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="$t('history.operation')">{{ selectedRecord.operation }}</el-descriptions-item>
          <el-descriptions-item :label="$t('history.description')">{{ selectedRecord.description }}</el-descriptions-item>
          <el-descriptions-item :label="$t('history.user')">{{ selectedRecord.user }}</el-descriptions-item>
          <el-descriptions-item :label="$t('shared.time')">{{ formatDate(selectedRecord.time) }}</el-descriptions-item>
          <el-descriptions-item :label="$t('shared.status')">
            <el-tag :type="getStatusType(selectedRecord.status)">
              {{ $t(getStatusText(selectedRecord.status)) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('history.ip')">{{ selectedRecord.ip || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('history.userAgent')">{{ selectedRecord.userAgent || '-' }}</el-descriptions-item>
        </el-descriptions>
        
        <div v-if="selectedRecord.details" class="details-section">
          <h4>{{ $t('history.moreDetails') }}</h4>
          <pre>{{ JSON.stringify(selectedRecord.details, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../api'
import { getTableHeight } from '@/utils/tableHeight'

export default {
  name: 'History',
  components: {
    Refresh
  },
  setup() {
    const { t } = useI18n()
    // 响应式数据
    const loading = ref(false)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const total = ref(0)
    const historyList = ref([])
    const showDetailsDialog = ref(false)
    const selectedRecord = ref(null)
    
    // 分页节流和去重机制
    const historyLoading = ref(false)
    const lastHistoryLoadAt = ref(0)
    
    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('basic')
    })
    
    // 方法
    const loadHistory = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastHistoryLoadAt.value < 2000) {
        return
      }
      if (!force && historyLoading.value) {
        return
      }
      try {
        historyLoading.value = true
        loading.value = true
        lastHistoryLoadAt.value = now
        
        const response = await api.operationLogs.getList({
          page: currentPage.value,
          limit: pageSize.value
        })
        
        historyList.value = response.data.logs || []
        total.value = response.data.total || 0
      } catch (error) {
        if (!silent) {
          console.error('Load history failed:', error)
          ElMessage.error(t('history.loadFailed'))
        } else {
          console.warn('加载历史记录失败(已静默):', error?.message || error)
        }
      } finally {
        historyLoading.value = false
        loading.value = false
      }
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadHistory({ force: true })
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadHistory({ force: true })
    }
    
    const showDetails = (row) => {
      selectedRecord.value = row
      showDetailsDialog.value = true
    }
    
    const formatDate = (dateString) => {
      if (!dateString) return '-'
      return new Date(dateString).toLocaleString('zh-CN')
    }
    
    const getStatusType = (status) => {
      const typeMap = {
        success: 'success',
        failed: 'danger',
        pending: 'warning'
      }
      return typeMap[status] || 'info'
    }
    
    const getStatusText = (status) => {
      const textMap = {
        success: 'history.statusSuccess',
        failed: 'history.statusFailed',
        pending: 'history.statusPending'
      }
      return textMap[status] || status
    }
    
    // 生命周期
    onMounted(() => {
      loadHistory()
    })
    
    return {
      loading,
      currentPage,
      pageSize,
      total,
      historyList,
      showDetailsDialog,
      selectedRecord,
      loadHistory,
      handleSizeChange,
      handleCurrentChange,
      showDetails,
      formatDate,
      getStatusType,
      getStatusText,
      tableHeight
    }
  }
}
</script>

<style scoped>
.history-container {
  height: calc(100vh - 64px);
  background: rgb(var(--background));
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-lg);
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

.action-section {
  display: flex;
  gap: 10px;
}

/* 表格容器 - 固定表头 */
.table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.table-container :deep(.el-table) {
  flex: 1;
  width: 100%;
}

.table-container :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 0 12px 0; /* 上8px， 下12px */
  margin-top: auto;
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
}

.details-section {
  margin-top: 20px;
}

.details-section h4 {
  margin-bottom: 10px;
  color: rgb(var(--text-primary));
}

.details-section pre {
  background: rgb(var(--bg-secondary));
  padding: 10px;
  border-radius: var(--radius-xs);
  font-size: 12px;
  overflow-x: auto;
  color: rgb(var(--text-primary));
}

.description-cell {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style> 