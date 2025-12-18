<template>
  <div class="analysis-container">
    <el-card class="analysis-card">
        <div class="card-header">
          <div class="header-left">
            <span class="title">{{ $t('analysis.title') }}</span>
            <el-tag v-if="logInfo.original_name" type="info" size="small">
              {{ logInfo.original_name }}
            </el-tag>
          </div>
          <div class="header-right">
            <el-button 
              v-if="!loading && logEntries.length > 0" 
              @click="exportToCSV" 
              class="btn-success btn-sm"
            >
              <el-icon><Download /></el-icon>
              {{ $t('analysis.exportCSV') }}
            </el-button>
            <el-button 
              v-if="!loading && logEntries.length > 0" 
              @click="showSurgeryStatistics" 
              class="btn-primary btn-sm"
              style="margin-left: 10px;"
            >
              <el-icon><DataAnalysis /></el-icon>
              {{ $t('analysis.surgeryAnalysis') }}
            </el-button>
          </div>
        </div>

      <!-- 日志基本信息 -->
      <div class="log-info" v-if="logInfo.id">
        <el-descriptions :column="4" border size="small">
          <el-descriptions-item :label="$t('analysis.filename')" :label-style="{ width: '100px' }" :content-style="{ width: '100px' }">
            <el-tag v-if="logInfo.original_name" size="small">
            {{ logInfo.original_name }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('analysis.deviceId')">
            <el-tag v-if="logInfo.device_id" size="small">
              {{ logInfo.device_id }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('analysis.fileSize')">
            <el-tag v-if="logInfo.size" size="small">
              {{ formatFileSize(logInfo.size) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('analysis.uploaderId')">
            <el-tag v-if="logInfo.uploader_id" size="small">
              {{ logInfo.uploader_id }}
            </el-tag>
          </el-descriptions-item>
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
           :default-value="defaultPickerRange"
           :disabled-date="disableOutOfRangeDates"
           @change="handleTimeRangeChange"
        />
        <el-tag v-if="timeRangeLimit" type="info" size="small" style="margin-left: 10px;">
          可选范围: {{ formatTimestamp(timeRangeLimit[0]) }} 至 {{ formatTimestamp(timeRangeLimit[1]) }}
        </el-tag>
        
        <el-button 
          v-if="timeRangeLimit" 
          @click="setFullTimeRange" 
          class="btn-primary btn-sm"
          style="margin-left: 10px;"
        >
          {{ $t('shared.selectAll') }}
        </el-button>
        
        <el-button @click="clearFilters" class="btn-secondary btn-sm">
          {{ $t('analysis.clearFilters') }}
        </el-button>
      </div>

      <!-- 日志条目表格 -->
      <div class="entries-section">
        <div class="section-header">
          <h3>{{ $t('analysis.logEntries') }} ({{ filteredEntries.length }})</h3>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-section">
          <el-empty :description="$t('analysis.loading')" />
        </div>

        <!-- 错误状态 -->
        <div v-else-if="logEntries.length === 0" class="error-section">
          <el-empty :description="$t('analysis.noData')" />
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
            <el-table-column prop="timestamp" :label="$t('analysis.timestamp')" width="180" sortable>
              <template #default="{ row }">
                {{ formatTimestamp(row.timestamp) }}
              </template>
            </el-table-column>
            <el-table-column prop="error_code" :label="$t('analysis.errorCode')" width="120" sortable />
            <el-table-column prop="param1" :label="$t('analysis.param1')" width="100" />
            <el-table-column prop="param2" :label="$t('analysis.param2')" width="100" />
            <el-table-column prop="param3" :label="$t('analysis.param3')" width="100" />
            <el-table-column prop="param4" :label="$t('analysis.param4')" width="100" />
            <el-table-column prop="explanation" :label="$t('analysis.explanation')" min-width="300" show-overflow-tooltip />
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

    <!-- 手术统计对话框 -->
    <el-dialog 
      title="手术统计分析" 
      v-model="surgeryStatisticsVisible"
      width="90%"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div class="surgery-statistics-content">
        <!-- 分析按钮 -->
        <div class="analysis-section" v-if="!surgeryData">
          <el-card>
            <div class="analysis-content">
              <el-icon><DataAnalysis /></el-icon>
              <h3>分析当前日志的手术数据</h3>
              <p>将对当前日志文件进行手术统计分析</p>
              <el-button class="btn-primary" @click="analyzeSurgeryData" :loading="analyzing">
                {{ $t('analysis.analyzeSurgeryData') }}
              </el-button>
            </div>
          </el-card>
        </div>

        <!-- 手术统计内容 -->
        <div v-else>
          <div v-if="surgeryData">
            <el-result
              icon="success"
              title="手术数据分析完成"
              sub-title="已成功分析出手术数据，详细统计信息请查看手术统计页面"
            >
              <template #extra>
                <el-button class="btn-primary" @click="showSurgeryStatistics">
                  {{ $t('analysis.surgeryStatistics') }}
                </el-button>
                <el-button class="btn-secondary" @click="surgeryStatisticsVisible = false">
                  {{ $t('analysis.close') }}
                </el-button>
              </template>
            </el-result>
          </div>
          <div v-else>
            <el-empty description="未分析出手术数据，请检查日志内容" />
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Download, ArrowLeft, DataAnalysis } from '@element-plus/icons-vue'
import api from '@/api'
import { useI18n } from 'vue-i18n'

export default {
  name: 'Analysis',
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
    const { t } = useI18n()
    
    const logId = route.params.id
    const loading = ref(false)
    const logInfo = ref({})
    const logEntries = ref([])
    const searchKeyword = ref('')
    const timeRange = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(100)
    
    // 手术统计相关
    const surgeryStatisticsVisible = ref(false)
    const surgeryData = ref(null)
    const analyzing = ref(false)

    // 获取时间范围限制
    const timeRangeLimit = computed(() => {
      if (logEntries.value.length === 0) return null
      
      const timestamps = logEntries.value.map(entry => new Date(entry.timestamp))
      const minTime = new Date(Math.min(...timestamps))
      const maxTime = new Date(Math.max(...timestamps))
      
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
          ElMessage.error('日志不存在')
          router.go(-1)
        }
      } catch (error) {
        ElMessage.error('加载日志信息失败')
      }
    }

    // 加载日志条目
    const loadLogEntries = async () => {
      try {
        const response = await store.dispatch('logs/fetchLogEntries', logId)
        logEntries.value = response.data?.entries || response.entries || []
        
        // 保存到sessionStorage供手术统计页面使用
        try {
          sessionStorage.setItem('batchLogEntries', JSON.stringify(logEntries.value))
        } catch (error) {
          // console.warn('保存日志条目到sessionStorage失败:', error)
        }
      } catch (error) {
        ElMessage.error('加载日志条目失败')
      }
    }

    // 搜索处理
    const handleSearch = () => {
      currentPage.value = 1
    }

    // 时间范围变化处理
    const handleTimeRangeChange = () => {
      // 越界纠正：确保选择范围始终在可选范围内
      if (timeRangeLimit.value && timeRange.value && timeRange.value.length === 2) {
        const min = new Date(timeRangeLimit.value[0])
        const max = new Date(timeRangeLimit.value[1])
        let [start, end] = timeRange.value
        const startDate = new Date(start)
        const endDate = new Date(end)
        let changed = false
        if (startDate < min) { start = timeRangeLimit.value[0]; changed = true }
        if (endDate > max) { end = timeRangeLimit.value[1]; changed = true }
        if (changed) {
          timeRange.value = [formatTimestamp(start), formatTimestamp(end)]
        }
      }
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
        timeRange.value = [
          formatTimestamp(timeRangeLimit.value[0]),
          formatTimestamp(timeRangeLimit.value[1])
        ]
      }
    }

    // 禁用超出范围的日期（按天限制）
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    const disableOutOfRangeDates = (date) => {
      if (!timeRangeLimit.value || !date) return false
      const [min, max] = timeRangeLimit.value
      return date < startOfDay(new Date(min)) || date > endOfDay(new Date(max))
    }

    // 打开面板时默认展示的页（左右两侧月份/日期依据最小、最大值）
    const defaultPickerRange = computed(() => {
      if (!timeRangeLimit.value) return null
      return [timeRangeLimit.value[0], timeRangeLimit.value[1]]
    })

    // 跳转到手术统计页面
    const showSurgeryStatistics = () => {
      // 直接传递日志ID，避免传递大量日志条目数据
      router.push({
        path: '/surgery-statistics',
        query: { logIds: logId }
      })
    }

    // 分析手术数据
    const analyzeSurgeryData = async () => {
      analyzing.value = true
      try {
        // 使用统一的接口，传递单个日志ID数组
        const response = await api.surgeryStatistics.analyzeByLogIds([logId])
        if (response.data.success) {
          // 如果返回的是数组，取第一个手术数据
          if (Array.isArray(response.data.data)) {
            surgeryData.value = response.data.data[0] || null
          } else {
            surgeryData.value = response.data.data
          }
          ElMessage.success('手术数据分析完成')
        } else {
          ElMessage.error(response.data.message || '分析手术数据失败')
        }
      } catch (error) {
        ElMessage.error('分析手术数据失败: ' + (error.response?.data?.message || error.message))
      } finally {
        analyzing.value = false
      }
    }

    onMounted(async () => {
      loading.value = true
      try {
        await loadLogInfo()
        await loadLogEntries()
        // 默认选择全部时间范围（最早至最晚）
        if (timeRangeLimit.value) {
          timeRange.value = [
            formatTimestamp(timeRangeLimit.value[0]),
            formatTimestamp(timeRangeLimit.value[1])
          ]
        }
      } finally {
        loading.value = false
      }
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
      setFullTimeRange,
      defaultPickerRange,
      disableOutOfRangeDates,
      showSurgeryStatistics,
      analyzeSurgeryData,
      surgeryStatisticsVisible,
      surgeryData,
      analyzing
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
  margin: 10px 20px;
}

.log-info .el-descriptions {
  font-size: 12px;
}

.log-info .el-descriptions__label {
  font-size: 11px;
  font-weight: 600;
}

.log-info .el-descriptions__label,
.log-info .el-descriptions__content {
  white-space: normal;
  word-break: break-word;
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

/* 手术统计对话框样式 */
.surgery-statistics-content {
  max-height: 70vh;
  overflow-y: auto;
}

.analysis-section {
  margin: 40px 0;
}

.analysis-content {
  text-align: center;
  padding: 40px;
}

.analysis-content .el-icon {
  font-size: 48px;
  color: #165dff;
  margin-bottom: 16px;
}

.analysis-content h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: #1d2129;
}

.analysis-content p {
  margin: 0 0 24px 0;
  color: #86909c;
}
</style> 