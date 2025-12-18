<template>
  <div class="history-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ $t('history.title') }}</span>
          <el-button class="btn-primary btn-sm" @click="loadHistory">
            <el-icon><Refresh /></el-icon>
            {{ $t('shared.refresh') }}
          </el-button>
        </div>
      </template>
      
      <el-table
        :data="historyList"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="operation" :label="$t('history.operation')" width="150" />
        <el-table-column prop="description" :label="$t('history.description')" show-overflow-tooltip />
        <el-table-column prop="user" :label="$t('history.user')" width="120" />
        <el-table-column prop="time" :label="$t('history.time')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.time) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('history.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ $t(getStatusText(row.status)) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="$t('history.details')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button 
              size="small" 
              class="btn-text btn-sm"
              @click="showDetails(row)"
            >
              {{ $t('history.view') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
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
          <el-descriptions-item :label="$t('history.time')">{{ formatDate(selectedRecord.time) }}</el-descriptions-item>
          <el-descriptions-item :label="$t('history.status')">
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../api'

export default {
  name: 'History',
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
    
    // 方法
    const loadHistory = async () => {
      try {
        loading.value = true
        
        const response = await api.operationLogs.getList({
          page: currentPage.value,
          limit: pageSize.value
        })
        
        historyList.value = response.data.logs || []
        total.value = response.data.total || 0
      } catch (error) {
        console.error('Load history failed:', error)
        ElMessage.error(t('history.loadFailed'))
      } finally {
        loading.value = false
      }
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadHistory()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadHistory()
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
      getStatusText
    }
  }
}
</script>

<style scoped>
.history-container {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.details-section {
  margin-top: 20px;
}

.details-section h4 {
  margin-bottom: 10px;
  color: #333;
}

.details-section pre {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
}
</style> 