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
        <p class="loading-text">{{ $t('shared.loading') }} {{ loadingProgress }}%</p>
      </div>
    </el-card>

    <el-card class="detail-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <button class="btn-secondary btn-sm" @click="goBack">
              <i class="fas fa-arrow-left"></i>
              {{ $t('shared.back') || 'Back' }}
            </button>
            <span class="title">{{ $t('logDetail.title') }}</span>
          </div>
          <div class="header-right">
            <el-tag :type="getStatusType(logInfo.status)" size="small">
              <span class="one-line-ellipsis" :title="getStatusText(logInfo.status)" style="display:inline-block; max-width:100%">{{ getStatusText(logInfo.status) }}</span>
            </el-tag>
          </div>
        </div>
      </template>

      <!-- 日志基本信息 -->
      <div class="log-info">
        <el-descriptions :column="3" border>
          <el-descriptions-item :label="$t('logs.filename') || 'Filename'">
            <span class="one-line-ellipsis" :title="logInfo.original_name" style="display:inline-block; max-width:100%">{{ logInfo.original_name }}</span>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('logs.deviceId')">
            <span class="one-line-ellipsis" :title="logInfo.device_id" style="display:inline-block; max-width:100%">{{ logInfo.device_id }}</span>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('logs.size') || 'Size'">{{ formatFileSize(logInfo.size) }}</el-descriptions-item>
          <el-descriptions-item :label="$t('logs.uploadTime')">{{ formatDate(logInfo.upload_time) }}</el-descriptions-item>
          <el-descriptions-item :label="$t('logs.parseTime')">{{ formatDate(logInfo.parse_time) }}</el-descriptions-item>
          <el-descriptions-item :label="$t('logs.uploaderId')">
            <span class="one-line-ellipsis" :title="String(logInfo.uploader_id)" style="display:inline-block; max-width:100%">{{ logInfo.uploader_id }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 日志条目表格 -->
      <div class="entries-section">
        <div class="section-header">
          <h3 class="min-w-0 one-line-ellipsis" :title="$t('logs.detailLogs') + ' (' + logEntries.length + ')'">{{ $t('logs.detailLogs') }} ({{ logEntries.length }})</h3>
          <div class="header-actions">
            <el-input
              v-model="searchKeyword"
              :placeholder="$t('logs.search') + ' / ' + $t('errorCodes.code')"
              style="width: 300px; margin-right: 10px;"
              clearable
              @input="filterEntries"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <div class="btn-group">
              <button class="btn-secondary btn-sm" @click="exportToCSV">
                <i class="fas fa-download"></i>
                {{ $t('errorCodes.exportCSV') }}
              </button>
              <button class="btn-primary btn-sm" @click="goToSurgeryAnalysis">
                <i class="fas fa-chart-line"></i>
                {{ $t('surgeryStatistics.title') }}
              </button>
            </div>
          </div>
        </div>

        <el-table 
          :data="paginatedEntries" 
          style="width: 100%"
          v-loading="loading"
          height="600"
          stripe
        >
          <el-table-column prop="timestamp" :label="$t('logs.timestamp')" width="180" sortable>
            <template #default="{ row }">
              {{ formatTimestamp(row.timestamp) }}
            </template>
          </el-table-column>
          <el-table-column prop="error_code" :label="$t('errorCodes.code')" width="100" sortable />
          <el-table-column prop="param1" label="Param1" width="90" />
          <el-table-column prop="param2" label="Param2" width="90" />
          <el-table-column prop="param3" label="Param3" width="90" />
          <el-table-column prop="param4" label="Param4" width="90" />
          <el-table-column prop="explanation" :label="$t('logs.explanation')" min-width="250" show-overflow-tooltip />
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
import { Search } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

export default {
  name: 'LogDetail',
  components: {
    Search
  },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    
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
        // 直接通过 log_ids 参数查询指定的日志，避免 1000 条限制问题
        const response = await store.dispatch('logs/fetchLogs', { 
          log_ids: String(logId),
          page: 1,
          limit: 1
        })
        const logs = response.data.logs || []
        const log = logs.length > 0 ? logs[0] : null
        if (log) {
          logInfo.value = log
        } else {
          ElMessage.error(t('logs.messages.logNotFound'))
          goBack()
        }
      } catch (error) {
        ElMessage.error(t('logs.messages.loadLogInfoFailed'))
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
        ElMessage.error(t('logs.messages.loadLogEntriesFailed'))
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
      const headers = [
        t('logs.csvHeaders.timestamp'),
        t('logs.csvHeaders.errorCode'),
        t('logs.csvHeaders.param1'),
        t('logs.csvHeaders.param2'),
        t('logs.csvHeaders.param3'),
        t('logs.csvHeaders.param4'),
        t('logs.csvHeaders.explanation')
      ]
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
      
      ElMessage.success(t('logs.messages.csvExportSuccess'))
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
        failed: 'danger',
        decrypt_failed: 'danger',
        parse_failed: 'danger',
        file_error: 'danger'
      }
      return typeMap[status] || 'info'
    }

    const getStatusText = (status) => {
      const textMap = {
        uploaded: t('logs.statusText.uploading'),
        parsed: t('logs.statusText.parsed'),
        decrypt_failed: t('logs.statusText.decrypt_failed'),
        parse_failed: t('logs.statusText.parse_failed'),
        file_error: t('logs.statusText.file_error'),
        failed: t('logs.statusText.failed')
      }
      
      return textMap[status] || t('logs.messages.unknown')
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
  gap: 10px;
}

.header-actions .btn-group {
  margin-left: 0;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding: 10px 0;
}
</style> 