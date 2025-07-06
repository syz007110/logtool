<template>
  <div class="logs-container">
    <!-- 上传区域 -->
    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <span>日志上传</span>
        </div>
      </template>
      
      <el-upload
        ref="uploadRef"
        :action="uploadUrl"
        :headers="uploadHeaders"
        :before-upload="beforeUpload"
        :on-success="onUploadSuccess"
        :on-error="onUploadError"
        :auto-upload="false"
        :show-file-list="false"
        accept=".log,.txt"
        drag
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          将文件拖到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            只能上传 log/txt 文件，且不超过 100MB
          </div>
        </template>
      </el-upload>
      
      <div class="upload-actions">
        <el-button type="primary" @click="submitUpload" :loading="uploading">
          开始上传
        </el-button>
        <el-button @click="clearUpload">清空</el-button>
      </div>
    </el-card>
    
    <!-- 日志列表 -->
    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>日志列表</span>
          <el-button type="primary" size="small" @click="loadLogs">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      
      <el-table
        :data="logs"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="filename" label="文件名" width="200" />
        <el-table-column prop="size" label="文件大小" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="uploadTime" label="上传时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.uploadTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="parseTime" label="解析时间" width="180">
          <template #default="{ row }">
            {{ row.parseTime ? formatDate(row.parseTime) : '-' }}
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button 
              v-if="row.status === 'uploaded'"
              size="small" 
              type="primary"
              @click="handleParse(row)"
              :loading="row.parsing"
            >
              解析
            </el-button>
            
            <el-button 
              size="small" 
              type="success"
              @click="handleDownload(row)"
            >
              下载
            </el-button>
            
            <el-button 
              size="small" 
              type="danger" 
              @click="handleDelete(row)"
            >
              删除
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
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'

export default {
  name: 'Logs',
  setup() {
    const store = useStore()
    
    // 响应式数据
    const loading = ref(false)
    const uploading = ref(false)
    const uploadRef = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(20)
    
    // 计算属性
    const logs = computed(() => store.getters['logs/logsList'])
    const total = computed(() => store.getters['logs/totalCount'])
    const uploadUrl = computed(() => '/api/logs/upload')
    const uploadHeaders = computed(() => ({
      Authorization: `Bearer ${store.state.auth.token}`
    }))
    
    // 方法
    const loadLogs = async () => {
      try {
        loading.value = true
        await store.dispatch('logs/fetchLogs', {
          page: currentPage.value,
          limit: pageSize.value
        })
      } catch (error) {
        ElMessage.error('加载日志失败')
      } finally {
        loading.value = false
      }
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadLogs()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadLogs()
    }
    
    const beforeUpload = (file) => {
      const isLogFile = file.type === 'text/plain' || file.name.endsWith('.log')
      const isLt100M = file.size / 1024 / 1024 < 100
      
      if (!isLogFile) {
        ElMessage.error('只能上传 log/txt 文件!')
        return false
      }
      if (!isLt100M) {
        ElMessage.error('文件大小不能超过 100MB!')
        return false
      }
      return true
    }
    
    const submitUpload = () => {
      uploadRef.value.submit()
    }
    
    const clearUpload = () => {
      uploadRef.value.clearFiles()
    }
    
    const onUploadSuccess = (response) => {
      ElMessage.success('上传成功')
      loadLogs()
    }
    
    const onUploadError = (error) => {
      ElMessage.error('上传失败')
    }
    
    const handleParse = async (row) => {
      try {
        row.parsing = true
        await store.dispatch('logs/parseLog', row.id)
        ElMessage.success('解析成功')
        loadLogs()
      } catch (error) {
        ElMessage.error('解析失败')
      } finally {
        row.parsing = false
      }
    }
    
    const handleDownload = async (row) => {
      try {
        const response = await store.dispatch('logs/downloadLog', row.id)
        
        // 创建下载链接
        const blob = new Blob([response.data])
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = row.filename
        link.click()
        window.URL.revokeObjectURL(url)
        
        ElMessage.success('下载成功')
      } catch (error) {
        ElMessage.error('下载失败')
      }
    }
    
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm('确定要删除这个日志文件吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })
        
        await store.dispatch('logs/deleteLog', row.id)
        ElMessage.success('删除成功')
        loadLogs()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
      }
    }
    
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
      return textMap[status] || status
    }
    
    // 生命周期
    onMounted(() => {
      loadLogs()
    })
    
    return {
      loading,
      uploading,
      uploadRef,
      currentPage,
      pageSize,
      logs,
      total,
      uploadUrl,
      uploadHeaders,
      loadLogs,
      handleSizeChange,
      handleCurrentChange,
      beforeUpload,
      submitUpload,
      clearUpload,
      onUploadSuccess,
      onUploadError,
      handleParse,
      handleDownload,
      handleDelete,
      formatFileSize,
      formatDate,
      getStatusType,
      getStatusText
    }
  }
}
</script>

<style scoped>
.logs-container {
  height: 100%;
}

.upload-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.upload-actions {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}

.list-card {
  margin-bottom: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style> 