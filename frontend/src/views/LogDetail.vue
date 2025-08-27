<template>
  <div class="log-detail-container">
    <!-- 加载进度条 -->
    <el-card v-if="loading" class="loading-card">
      <div class="loading-content">
        <el-progress 
          :percentage="loadingProgress" 
          :status="loadingProgress >= 100 ? 'success' : ''"
          :stroke-width="8"
        />
        <p class="loading-text">正在加载日志内容... {{ loadingProgress }}%</p>
      </div>
    </el-card>

    <el-card class="detail-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-button @click="goBack" icon="ArrowLeft" size="small">
              返回
            </el-button>
            <span class="title">日志详情</span>
          </div>
          <div class="header-right">
            <el-tag :type="getStatusType(logInfo.status)" size="small">
              {{ getStatusText(logInfo.status) }}
            </el-tag>
          </div>
        </div>
      </template>

      <!-- 日志基本信息 -->
      <div class="log-info">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="文件名">{{ logInfo.original_name }}</el-descriptions-item>
          <el-descriptions-item label="设备编号">{{ logInfo.device_id }}</el-descriptions-item>
          <el-descriptions-item label="文件大小">{{ formatFileSize(logInfo.size) }}</el-descriptions-item>
          <el-descriptions-item label="上传时间">{{ formatDate(logInfo.upload_time) }}</el-descriptions-item>
          <el-descriptions-item label="解析时间">{{ formatDate(logInfo.parse_time) }}</el-descriptions-item>
          <el-descriptions-item label="上传用户ID">{{ logInfo.uploader_id }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 日志条目表格 -->
      <div class="entries-section">
        <div class="section-header">
          <h3>日志条目 ({{ logEntries.length }})</h3>
          <div class="header-actions">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索释义内容或故障码"
              style="width: 300px; margin-right: 10px;"
              clearable
              @input="filterEntries"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button @click="exportToCSV" type="success" size="small">
              <el-icon><Download /></el-icon>
              导出CSV
            </el-button>
            <el-button @click="goToSurgeryAnalysis" type="primary" size="small" style="margin-left: 10px;">
              <el-icon><DataAnalysis /></el-icon>
              手术统计
            </el-button>
          </div>
        </div>

        <el-table 
          :data="paginatedEntries" 
          style="width: 100%"
          v-loading="loading"
          height="600"
          stripe
        >
          <el-table-column prop="timestamp" label="时间戳" width="180" sortable>
            <template #default="{ row }">
              {{ formatTimestamp(row.timestamp) }}
            </template>
          </el-table-column>
          <el-table-column prop="error_code" label="故障码" width="120" sortable />
          <el-table-column prop="param1" label="参数1" width="100" />
          <el-table-column prop="param2" label="参数2" width="100" />
          <el-table-column prop="param3" label="参数3" width="100" />
          <el-table-column prop="param4" label="参数4" width="100" />
          <el-table-column prop="explanation" label="释义" min-width="300" show-overflow-tooltip />
        </el-table>

        <!-- 分页 -->
        <div class="pagination-wrapper">
          <el-pagination
            :current-page="currentPage"
            :page-size="pageSize"
            :page-sizes="[50, 100, 200, 500]"
            :total="filteredEntries.length"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Download, ArrowLeft, DataAnalysis } from '@element-plus/icons-vue'

export default {
  name: 'LogDetail',
  components: {
    Search,
    Download,
    ArrowLeft,
    DataAnalysis
  },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    
    const logId = route.params.id
    const loading = ref(false)
    const loadingProgress = ref(0)
    const logInfo = ref({})
    const logEntries = ref([])
    const searchKeyword = ref('')
    const currentPage = ref(1)
    const pageSize = ref(100)

    // 过滤后的条目
    const filteredEntries = computed(() => {
      if (!searchKeyword.value) {
        return logEntries.value
      }
      return logEntries.value.filter(entry => 
        entry.explanation.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
        entry.error_code.toLowerCase().includes(searchKeyword.value.toLowerCase())
      )
    })

    // 分页后的条目
    const paginatedEntries = computed(() => {
      const start = (currentPage.value - 1) * pageSize.value
      const end = start + pageSize.value
      return filteredEntries.value.slice(start, end)
    })

    // 加载日志信息
    const loadLogInfo = async () => {
      try {
        loading.value = true
        const response = await store.dispatch('logs/fetchLogs', { page: 1, limit: 1000 })
        const log = response.data.logs.find(l => l.id == logId)
        if (log) {
          logInfo.value = log
        } else {
          ElMessage.error('日志不存在')
          goBack()
        }
      } catch (error) {
        ElMessage.error('加载日志信息失败')
      } finally {
        loading.value = false
      }
    }

    // 加载日志条目
    const loadLogEntries = async () => {
      try {
        loading.value = true
        loadingProgress.value = 0
        
        // 模拟加载进度
        const progressInterval = setInterval(() => {
          if (loadingProgress.value < 90) {
            loadingProgress.value += 10
          }
        }, 100)
        
        const response = await store.dispatch('logs/fetchLogEntries', logId)
        logEntries.value = response.data?.entries || response.entries || []
        
        // 完成加载
        clearInterval(progressInterval)
        loadingProgress.value = 100
        
        // 延迟隐藏进度条
        setTimeout(() => {
          loading.value = false
          loadingProgress.value = 0
        }, 500)
        
      } catch (error) {
        ElMessage.error('加载日志条目失败')
        loading.value = false
        loadingProgress.value = 0
      }
    }

    // 过滤条目
    const filterEntries = () => {
      currentPage.value = 1
    }

    // 导出CSV
    const exportToCSV = () => {
      const headers = ['时间戳', '故障码', '参数1', '参数2', '参数3', '参数4', '释义']
      const csvContent = [
        headers.join(','),
        ...filteredEntries.value.map(entry => [
          formatTimestamp(entry.timestamp),
          entry.error_code,
          entry.param1,
          entry.param2,
          entry.param3,
          entry.param4,
          `"${entry.explanation.replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n')

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${logInfo.value.original_name}_entries.csv`
      link.click()
      URL.revokeObjectURL(link.href)
      
      ElMessage.success('CSV文件导出成功')
    }

    // 分页处理
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
    }

    // 返回上一页
    const goBack = () => {
      router.go(-1)
    }

    // 跳转到手术统计页面
const goToSurgeryAnalysis = () => {
  // 准备日志条目数据
  const entriesData = {
    logId: logId,
    logName: logInfo.value.original_name,
    entries: logEntries.value,
    totalCount: logEntries.value.length,
    timeRange: {
      start: logEntries.value.length > 0 ? logEntries.value[0].timestamp : null,
      end: logEntries.value.length > 0 ? logEntries.value[logEntries.value.length - 1].timestamp : null
    }
  }
  
  // 压缩数据以减少传输大小
  const compressedData = compressLogEntries(entriesData.entries)
  
  // 存储到sessionStorage
  sessionStorage.setItem('surgeryAnalysisData', JSON.stringify({
    ...entriesData,
    entries: compressedData,
    compressed: true,
    timestamp: Date.now()
  }))
  
  // 设置自动分析标志
  sessionStorage.setItem('autoAnalyze', 'true')
  
  // 跳转到手术统计页面
  router.push('/surgery-statistics')
}

// 压缩日志条目数据
const compressLogEntries = (entries) => {
  return entries.map(entry => ({
    t: entry.timestamp,
    e: entry.error_code,
    p1: entry.param1,
    p2: entry.param2,
    p3: entry.param3,
    p4: entry.param4,
    exp: entry.explanation,
    ln: entry.log_name || logInfo.value.original_name
  }))
}

// 解压缩日志条目数据
const decompressLogEntries = (compressedEntries) => {
  return compressedEntries.map(entry => ({
    timestamp: entry.t,
    error_code: entry.e,
    param1: entry.p1,
    param2: entry.p2,
    param3: entry.p3,
    param4: entry.p4,
    explanation: entry.exp,
    log_name: entry.ln
  }))
}

    // 格式化函数
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const formatDate = (dateString) => {
      if (!dateString) return '-'
      return new Date(dateString).toLocaleString('zh-CN')
    }

    const formatTimestamp = (timestamp) => {
      if (!timestamp) return '-'
      // 将时间戳格式化为 YYYY-MM-DD HH:mm:ss 格式
      const date = new Date(timestamp)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    const getStatusType = (status) => {
      const typeMap = {
        uploaded: 'warning',
        parsed: 'success',
        failed: 'danger'
      }
      return typeMap[status] || 'info'
    }

    const getStatusText = (status) => {
      const textMap = {
        uploaded: '已上传',
        parsed: '已解析',
        failed: '解析失败'
      }
      return textMap[status] || '未知'
    }

    onMounted(() => {
      loadLogInfo()
      loadLogEntries()
    })

    return {
      loading,
      loadingProgress,
      logInfo,
      logEntries,
      searchKeyword,
      currentPage,
      pageSize,
      filteredEntries,
      paginatedEntries,
      loadLogInfo,
      loadLogEntries,
      filterEntries,
      exportToCSV,
      handleSizeChange,
      handleCurrentChange,
      goBack,
      goToSurgeryAnalysis,
      formatFileSize,
      formatDate,
      formatTimestamp,
      getStatusType,
      getStatusText
    }
  }
}
</script>

<style scoped>
.log-detail-container {
  padding: 20px;
  height: 100vh;
  overflow: hidden;
}

.loading-card {
  margin-bottom: 20px;
}

.loading-content {
  text-align: center;
  padding: 20px;
}

.loading-text {
  margin-top: 10px;
  color: #606266;
  font-size: 14px;
}

.detail-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.title {
  font-size: 18px;
  font-weight: bold;
}

.log-info {
  margin-bottom: 20px;
}

.entries-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-header h3 {
  margin: 0;
  color: #303133;
}

.header-actions {
  display: flex;
  align-items: center;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding: 10px 0;
}
</style> 