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
        :on-exceed="onExceed"
        :on-change="onFileChange"
        :on-remove="onFileRemove"
        :auto-upload="false"
        :show-file-list="true"
        :multiple="true"
        :limit="50"
        accept=".medbot"
        drag
        name="file"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          将文件拖到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持上传 .medbot 文件，最多50个文件，总大小不超过200MB，上传后将自动解密并解析
          </div>
        </template>
      </el-upload>
      
      <!-- 密钥输入区域 -->
      <div class="key-input-section">
        <div class="key-input-row">
          <el-input
            v-model="decryptKey"
            placeholder="请输入解密密钥"
            style="width: 300px;"
            clearable
          >
            <template #prefix>
              <el-icon><Key /></el-icon>
            </template>
          </el-input>
          
          <span class="key-separator">或</span>
          
          <el-upload
            ref="keyUploadRef"
            :auto-upload="false"
            :show-file-list="false"
            accept=".txt"
            :before-upload="beforeKeyUpload"
            :on-change="onKeyFileChange"
          >
            <el-button type="primary" plain>
              <el-icon><Upload /></el-icon>
              上传密钥文件
            </el-button>
          </el-upload>
        </div>
        
        <div v-if="keyFileName" class="key-file-info">
          <el-tag type="success" size="small">
            <el-icon><Document /></el-icon>
            {{ keyFileName }}
          </el-tag>
        </div>
      </div>
      
      <!-- 设备编号输入区域 -->
      <div class="device-input-section">
        <el-input
          v-model="deviceId"
          placeholder="设备编号（可选，格式：XXXX-XX，例：4371-01）"
          style="width: 300px;"
          clearable
        >
          <template #prefix>
            <el-icon><Monitor /></el-icon>
          </template>
        </el-input>
      </div>
      
      <div class="upload-actions">
        <el-button type="primary" @click="submitUpload" :loading="uploading">
          上传并解析
        </el-button>
        <el-button @click="clearUpload">清空</el-button>
      </div>
    </el-card>
    
    <!-- 日志列表 -->
    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>日志列表</span>
          <div class="header-actions">
            <el-input
              v-model="filterDeviceId"
              placeholder="按设备编号筛选"
              style="width: 200px; margin-right: 10px;"
              clearable
              @keyup.enter="loadLogs"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          <el-button type="primary" size="small" @click="loadLogs">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          </div>
        </div>
      </template>
      
      <el-table
        :data="logs"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="original_name" label="原始文件名" width="200" />
        <el-table-column prop="device_id" label="设备编号" width="120" />
        <el-table-column prop="uploader_id" label="上传用户ID" width="100" />
        <el-table-column prop="upload_time" label="上传时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.upload_time) }}
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button 
              size="small" 
              type="primary"
              @click="showEntries(row)"
            >
              分析
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

  <el-dialog v-model="showEntriesDialog" title="日志分析" width="900px">
    <el-table :data="logEntries" style="width: 100%">
      <el-table-column prop="timestamp" label="时间戳" width="180" />
      <el-table-column prop="error_code" label="故障码" width="100" />
      <el-table-column prop="param1" label="参数1" width="100" />
      <el-table-column prop="param2" label="参数2" width="100" />
      <el-table-column prop="param3" label="参数3" width="100" />
      <el-table-column prop="param4" label="参数4" width="100" />
      <el-table-column prop="explanation" label="日志解释" />
    </el-table>
  </el-dialog>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Monitor, Refresh, Upload, Key, Document, UploadFilled } from '@element-plus/icons-vue'

export default {
  name: 'Logs',
  setup() {
    const store = useStore()
    
    // 响应式数据
    const loading = ref(false)
    const uploading = ref(false)
    const uploadRef = ref(null)
    const keyUploadRef = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const decryptKey = ref('') // 密钥输入
    const keyFileName = ref('') // 密钥文件名
    const deviceId = ref('') // 设备编号
    const filterDeviceId = ref('') // 筛选设备编号
    const uploadFileList = ref([]) // 手动跟踪上传文件列表
    
    // 计算属性
    const logs = computed(() => store.getters['logs/logsList'])
    const total = computed(() => store.getters['logs/totalCount'])
    const uploadUrl = computed(() => '/api/logs/upload')
    const uploadHeaders = computed(() => ({
      Authorization: `Bearer ${store.state.auth.token}`,
      'X-Decrypt-Key': decryptKey.value, // 添加密钥到请求头
      'X-Device-ID': deviceId.value // 添加设备编号到请求头
    }))
    
    // 方法
    const loadLogs = async () => {
      try {
        loading.value = true
        await store.dispatch('logs/fetchLogs', {
          page: currentPage.value,
          limit: pageSize.value,
          device_id: filterDeviceId.value || undefined
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
    
    const submitUpload = () => {
      if (!decryptKey.value.trim()) {
        ElMessage.error('请输入解密密钥或上传密钥文件')
        return
      }
      if (!uploadRef.value) {
        ElMessage.error('上传组件未初始化')
        return
      }
      
      // 使用手动跟踪的文件列表
      if (uploadFileList.value.length === 0) {
        ElMessage.error('请选择要上传的文件')
        return
      }
      
      if (uploadFileList.value.length > 50) {
        ElMessage.error('最多只能上传50个文件')
        return
      }
      
      const totalSize = uploadFileList.value.reduce((sum, f) => sum + (f.size || f.raw?.size || 0), 0)
      if (totalSize / 1024 / 1024 > 200) {
        ElMessage.error('总文件大小不能超过200MB')
        return
      }
      
      uploadRef.value.submit()
    }
    
    const beforeUpload = (file) => {
      const isMedbotFile = file.name.endsWith('.medbot')
      const isLt200M = file.size / 1024 / 1024 < 200
      
      if (!isMedbotFile) {
        ElMessage.error('只能上传 .medbot 文件!')
        return false
      }
      if (!isLt200M) {
        ElMessage.error('单个文件大小不能超过200MB!')
        return false
      }
      
      if (!decryptKey.value.trim()) {
        ElMessage.error('请输入解密密钥或上传密钥文件!')
        return false
      }
      
      return true
    }
    
    const beforeKeyUpload = (file) => {
      const isTxtFile = file.name.endsWith('.txt')
      const isLt1M = file.size / 1024 / 1024 < 1
      
      if (!isTxtFile) {
        ElMessage.error('密钥文件必须是 .txt 格式!')
        return false
      }
      if (!isLt1M) {
        ElMessage.error('密钥文件大小不能超过1MB!')
        return false
      }
      return false // 阻止自动上传
    }
    
    const onKeyFileChange = (file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target.result.trim()
        decryptKey.value = content
        keyFileName.value = file.name
        ElMessage.success('密钥文件读取成功')
      }
      reader.readAsText(file.raw)
    }
    
    const clearUpload = () => {
      if (uploadRef.value) {
        uploadRef.value.clearFiles()
      }
      if (keyUploadRef.value) {
        keyUploadRef.value.clearFiles()
      }
      uploadFileList.value = []
      decryptKey.value = ''
      keyFileName.value = ''
      deviceId.value = ''
    }
    
    const onUploadSuccess = (response, file, fileList) => {
      ElMessage.success(`文件 ${file.name} 上传并解析成功`)
      // 更新手动跟踪的文件列表
      uploadFileList.value = fileList
      // 所有文件上传完成后清空
      if (fileList.length === 0) {
        decryptKey.value = ''
        keyFileName.value = ''
        deviceId.value = ''
        uploadFileList.value = []
        loadLogs()
      }
    }
    
    const onUploadError = (error) => {
      ElMessage.error('上传失败: ' + (error.message || '未知错误'))
    }
    
    const onExceed = (files, fileList) => {
      ElMessage.error('最多只能上传50个文件!')
    }
    
    const onFileChange = (file, fileList) => {
      uploadFileList.value = fileList
    }
    
    const onFileRemove = (file, fileList) => {
      uploadFileList.value = fileList
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
    
    // 明细弹窗相关
    const showEntriesDialog = ref(false)
    const logEntries = ref([])
    const selectedLog = ref(null)
    const showEntries = async (row) => {
      selectedLog.value = row
      showEntriesDialog.value = true
      try {
        const res = await store.dispatch('logs/fetchLogEntries', row.id)
        logEntries.value = res.entries || []
      } catch (e) {
        logEntries.value = []
      }
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
      onExceed,
      onFileChange,
      onFileRemove,
      handleParse,
      handleDownload,
      handleDelete,
      formatFileSize,
      formatDate,
      getStatusType,
      getStatusText,
      showEntriesDialog,
      logEntries,
      selectedLog,
      showEntries,
      decryptKey,
      keyUploadRef,
      keyFileName,
      deviceId,
      filterDeviceId,
      uploadFileList,
      beforeKeyUpload,
      onKeyFileChange
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

.header-actions {
  display: flex;
  align-items: center;
}

.upload-actions {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}

.key-input-section {
  margin-top: 15px;
}

.key-input-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.key-separator {
  color: #666;
  font-size: 14px;
}

.key-file-info {
  margin-top: 10px;
}

.device-input-section {
  margin-top: 15px;
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