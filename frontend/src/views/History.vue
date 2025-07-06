<template>
  <div class="history-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>历史记录</span>
          <el-button type="primary" size="small" @click="loadHistory">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      
      <el-table
        :data="historyList"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="operation" label="操作" width="150" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="user" label="用户" width="120" />
        <el-table-column prop="time" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.time) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="详情" width="100" fixed="right">
          <template #default="{ row }">
            <el-button 
              size="small" 
              type="primary"
              @click="showDetails(row)"
            >
              查看
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
      title="操作详情"
      width="600px"
    >
      <div v-if="selectedRecord">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="操作">{{ selectedRecord.operation }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ selectedRecord.description }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ selectedRecord.user }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatDate(selectedRecord.time) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(selectedRecord.status)">
              {{ getStatusText(selectedRecord.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="IP地址">{{ selectedRecord.ip || '-' }}</el-descriptions-item>
          <el-descriptions-item label="用户代理">{{ selectedRecord.userAgent || '-' }}</el-descriptions-item>
        </el-descriptions>
        
        <div v-if="selectedRecord.details" class="details-section">
          <h4>详细信息</h4>
          <pre>{{ JSON.stringify(selectedRecord.details, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

export default {
  name: 'History',
  setup() {
    // 响应式数据
    const loading = ref(false)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const total = ref(0)
    const historyList = ref([])
    const showDetailsDialog = ref(false)
    const selectedRecord = ref(null)
    
    // 模拟历史记录数据
    const mockHistoryData = [
      {
        id: 1,
        operation: '登录',
        description: '用户登录系统',
        user: 'admin',
        time: new Date().toISOString(),
        status: 'success',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        details: { loginMethod: 'password' }
      },
      {
        id: 2,
        operation: '上传日志',
        description: '上传日志文件: system.log',
        user: 'admin',
        time: new Date(Date.now() - 3600000).toISOString(),
        status: 'success',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        details: { filename: 'system.log', size: '2.5MB' }
      },
      {
        id: 3,
        operation: '解析日志',
        description: '解析日志文件: system.log',
        user: 'admin',
        time: new Date(Date.now() - 1800000).toISOString(),
        status: 'success',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        details: { parsedLines: 1500, errors: 5 }
      },
      {
        id: 4,
        operation: '添加故障码',
        description: '添加故障码: E001',
        user: 'expert',
        time: new Date(Date.now() - 900000).toISOString(),
        status: 'success',
        ip: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        details: { code: 'E001', name: '系统错误' }
      },
      {
        id: 5,
        operation: '导出XML',
        description: '导出故障码到XML文件',
        user: 'user',
        time: new Date(Date.now() - 300000).toISOString(),
        status: 'success',
        ip: '192.168.1.102',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        details: { exportedCount: 150 }
      }
    ]
    
    // 方法
    const loadHistory = async () => {
      try {
        loading.value = true
        
        // 模拟API调用
        await new Promise(resolve => setTimeout(resolve, 500))
        
        const start = (currentPage.value - 1) * pageSize.value
        const end = start + pageSize.value
        historyList.value = mockHistoryData.slice(start, end)
        total.value = mockHistoryData.length
      } catch (error) {
        ElMessage.error('加载历史记录失败')
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
        success: '成功',
        failed: '失败',
        pending: '进行中'
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