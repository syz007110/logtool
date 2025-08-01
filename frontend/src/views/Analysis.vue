<template>
  <div class="analysis-container">
    <el-card class="analysis-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="title">日志分析</span>
            <el-tag v-if="logInfo.original_name" type="info" size="small">
              {{ logInfo.original_name }}
            </el-tag>
          </div>
          <div class="header-right">
            <el-button @click="exportToCSV" type="success" size="small">
              <el-icon><Download /></el-icon>
              导出CSV
            </el-button>
          </div>
        </div>
      </template>

      <!-- 日志基本信息 -->
      <div class="log-info" v-if="logInfo.id">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="文件名">{{ logInfo.original_name }}</el-descriptions-item>
          <el-descriptions-item label="设备编号">{{ logInfo.device_id }}</el-descriptions-item>
          <el-descriptions-item label="文件大小">{{ formatFileSize(logInfo.size) }}</el-descriptions-item>
          <el-descriptions-item label="上传时间">{{ formatDate(logInfo.upload_time) }}</el-descriptions-item>
          <el-descriptions-item label="解析时间">{{ formatDate(logInfo.parse_time) }}</el-descriptions-item>
          <el-descriptions-item label="上传用户ID">{{ logInfo.uploader_id }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 搜索和筛选 -->
      <div class="search-section">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索释义内容或故障码"
          style="width: 250px; margin-right: 15px;"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-date-picker
          v-model="timeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 300px; margin-right: 15px;"
          @change="handleTimeRangeChange"
        />
        <el-tag v-if="timeRangeLimit" type="info" size="small" style="margin-left: 10px;">
          可选范围: {{ formatTimestamp(timeRangeLimit[0]) }} 至 {{ formatTimestamp(timeRangeLimit[1]) }}
        </el-tag>
        
        <el-button 
          v-if="timeRangeLimit" 
          @click="setFullTimeRange" 
          type="primary" 
          size="small"
          style="margin-left: 10px;"
        >
          选择全部时间
        </el-button>
        
        <el-button @click="clearFilters" type="info" size="small">
          清除筛选
        </el-button>
      </div>

      <!-- 日志条目表格 -->
      <div class="entries-section">
        <div class="section-header">
          <h3>日志条目 ({{ filteredEntries.length }})</h3>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-section">
          <el-empty description="正在加载日志数据..." />
        </div>

        <!-- 错误状态 -->
        <div v-else-if="logEntries.length === 0" class="error-section">
          <el-empty description="未找到日志条目" />
        </div>

        <!-- 数据表格 -->
        <div v-else class="table-container">
          <el-table 
            :data="paginatedEntries" 
            style="width: 100%"
            v-loading="loading"
            height="calc(100vh - 350px)"
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
        </div>

        <!-- 分页 -->
        <div class="pagination-wrapper" v-if="filteredEntries.length > 0">
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
import { Search, Download, ArrowLeft } from '@element-plus/icons-vue'

export default {
  name: 'Analysis',
  components: {
    Search,
    Download,
    ArrowLeft
  },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    
    const logId = route.params.id
    const loading = ref(false)
    const logInfo = ref({})
    const logEntries = ref([])
    const searchKeyword = ref('')
    const timeRange = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(100)

    // 获取时间范围限制
    const timeRangeLimit = computed(() => {
      if (logEntries.value.length === 0) return null
      
      const timestamps = logEntries.value.map(entry => new Date(entry.timestamp))
      const minTime = new Date(Math.min(...timestamps))
      const maxTime = new Date(Math.max(...timestamps))
      
      console.log('时间范围限制:', {
        minTime: minTime.toISOString(),
        maxTime: maxTime.toISOString(),
        entriesCount: logEntries.value.length
      })
      
      return [minTime, maxTime]
    })

    // 过滤后的条目
    const filteredEntries = computed(() => {
      let entries = logEntries.value
      
      // 搜索过滤
      if (searchKeyword.value) {
        entries = entries.filter(entry => 
          entry.explanation.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
          entry.error_code.toLowerCase().includes(searchKeyword.value.toLowerCase())
        )
      }
      
      // 时间范围过滤
      if (timeRange.value && timeRange.value.length === 2) {
        const [startTime, endTime] = timeRange.value
        entries = entries.filter(entry => {
          const entryTime = new Date(entry.timestamp)
          const start = new Date(startTime)
          const end = new Date(endTime)
          return entryTime >= start && entryTime <= end
        })
      }
      
      return entries
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
          router.go(-1)
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
        const response = await store.dispatch('logs/fetchLogEntries', logId)
        logEntries.value = response.data?.entries || response.entries || []
      } catch (error) {
        ElMessage.error('加载日志条目失败')
      } finally {
        loading.value = false
      }
    }

    // 搜索处理
    const handleSearch = () => {
      currentPage.value = 1
    }

    // 时间范围变化处理
    const handleTimeRangeChange = () => {
      currentPage.value = 1
    }

    // 清除筛选
    const clearFilters = () => {
      searchKeyword.value = ''
      timeRange.value = null
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
      link.download = `${logInfo.value.original_name}_analysis.csv`
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
      const date = new Date(timestamp)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    // 设置时间范围为全部
    const setFullTimeRange = () => {
      if (timeRangeLimit.value) {
        timeRange.value = [timeRangeLimit.value[0], timeRangeLimit.value[1]]
      }
    }

    onMounted(() => {
      loadLogInfo()
      loadLogEntries()
    })

    return {
      loading,
      logInfo,
      logEntries,
      searchKeyword,
      timeRange,
      currentPage,
      pageSize,
      filteredEntries,
      paginatedEntries,
      loadLogInfo,
      loadLogEntries,
      handleSearch,
      handleTimeRangeChange,
      clearFilters,
      exportToCSV,
      handleSizeChange,
      handleCurrentChange,
      formatFileSize,
      formatDate,
      formatTimestamp,
      timeRangeLimit,
      setFullTimeRange
    }
  }
}
</script>

<style scoped>
.analysis-container {
  padding: 0;
  height: 100vh;
  overflow: hidden;
  background-color: #f5f7fa;
}

.analysis-card {
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border: none;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: white;
  border-bottom: 1px solid #e6e6e6;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: bold;
}

.log-info {
  margin: 5px 20px;
}

.log-info .el-descriptions {
  font-size: 5px;
}

.log-info .el-descriptions__label {
  font-size: 11px;
  font-weight: 300;
}

.search-section {
  display: flex;
  align-items: center;
  margin: 0 20px 10px 20px;
  padding: 10px 12px;
  background-color: white;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.entries-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0 20px 10px 20px;
  background-color: white;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.table-container {
  flex: 1;
  overflow: hidden;
  padding: 0 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 15px 20px 0 20px;
}

.section-header h3 {
  margin: 0;
  color: #303133;
  font-size: 14px;
}

.loading-section,
.error-section {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  background-color: #fafafa;
  border-radius: 6px;
  margin: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin: 10px 20px;
  padding: 8px 0;
  background-color: white;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
</style> 