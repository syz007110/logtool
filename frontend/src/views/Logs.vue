<template>
  <div class="logs-container">
    <!-- 上传区域 -->
    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <span>日志上传</span>
        </div>
      </template>
      
      <!-- 总体进度条 -->
      <div v-if="uploading" class="overall-progress">
        <el-progress 
          :percentage="overallProgress" 
          :status="overallProgress >= 100 ? 'success' : ''"
          :stroke-width="12"
          :show-text="true"
          :format="progressFormat"
        />
        <div class="progress-stages">
          <span class="stage" :class="{ active: overallProgress >= 0, completed: overallProgress >= 30 }">
            文件上传
          </span>
          <span class="stage" :class="{ active: overallProgress >= 30, completed: overallProgress >= 60 }">
            解密处理
          </span>
          <span class="stage" :class="{ active: overallProgress >= 60, completed: overallProgress >= 100 }">
            解析完成
          </span>
        </div>
      </div>

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
        :on-progress="onUploadProgress"
        :auto-upload="false"
        :show-file-list="false"
        :multiple="true"
        :limit="50"
        accept=".medbot"
        drag
        name="file"
        :disabled="uploading"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          将文件拖到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            <div v-if="!uploading">
              支持上传 .medbot 文件，最多50个文件，总大小不超过200MB，上传后将自动解密并解析
            </div>
            <div v-else class="parsing-tip">
              <el-icon class="is-loading"><Refresh /></el-icon>
              正在解析中，请勿刷新页面...
            </div>
          </div>
        </template>
      </el-upload>
      
      <!-- 自定义文件列表 -->
      <div v-if="uploadFileList.length > 0" class="custom-file-list">
        <div class="file-list-header">
          <span>已选择的文件 ({{ uploadFileList.length }})</span>
          <el-button type="text" size="small" @click="clearUpload" :disabled="uploading">
            清空
          </el-button>
        </div>
        <div class="file-items">
          <div 
            v-for="(file, index) in uploadFileList" 
            :key="index" 
            class="file-item"
          >
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ file.name || file.originalname }}</span>
            <span class="file-size">{{ formatFileSize(file.size || file.raw?.size || 0) }}</span>
            <el-button 
              type="text" 
              size="small" 
              @click="removeFile(index)"
              :disabled="uploading"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      
      <!-- 密钥输入区域 -->
      <div class="key-input-section">
        <div class="key-input-row">
          <el-input
            v-model="decryptKey"
            placeholder="请输入解密密钥（MAC地址格式，如：00-01-05-77-6a-09）"
            style="width: 300px;"
            clearable
            @blur="validateKeyFormat"
          >
            <template #prefix>
              <el-icon><Key /></el-icon>
            </template>
          </el-input>
          
          <el-button 
            type="primary" 
            plain 
            @click="autoFillDeviceId"
            :disabled="!decryptKey.trim()"
          >
            自动填充设备编号
          </el-button>
          
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
        
        <div v-if="keyError" class="key-error">
          <el-tag type="danger" size="small">
            {{ keyError }}
          </el-tag>
        </div>
      </div>
      
      <!-- 设备编号输入区域 -->
      <div class="device-input-section">
        <div class="device-input-row">
          <el-input
            v-model="deviceId"
            placeholder="设备编号（格式：数字或字母组合，例：4371-01、ABC-12，默认为0000-00）"
            style="width: 300px;"
            clearable
            @blur="validateDeviceIdFormat"
          >
            <template #prefix>
              <el-icon><Monitor /></el-icon>
            </template>
          </el-input>
          
          <el-button 
            type="primary" 
            plain 
            @click="autoFillKey"
            :disabled="!deviceId.trim()"
          >
            自动填充密钥
          </el-button>
        </div>
        
        <div v-if="deviceIdError" class="device-error">
          <el-tag type="danger" size="small">
            {{ deviceIdError }}
          </el-tag>
        </div>
      </div>
      
      <div class="upload-actions">
        <el-button 
          type="primary" 
          @click="submitUpload" 
          :loading="uploading"
          :disabled="uploading || !decryptKey.trim() || uploadFileList.length === 0"
        >
          {{ uploading ? '解析中...' : '上传并解析' }}
        </el-button>
      </div>
    </el-card>
    
    <!-- 日志列表 -->
    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>日志列表</span>
          <div class="header-actions">
            <!-- 批量操作区域 -->
            <div v-if="selectedLogs.length > 0" class="batch-operations">
              <!-- 批量操作按钮组 -->
              <div class="batch-actions">
                <el-button 
                  type="primary" 
                  size="small" 
                  @click="handleBatchAnalyze"
                  :disabled="!canBatchOperate || !isSameDevice"
                  :title="deviceCheckMessage"
                >
                  <el-icon><Monitor /></el-icon>
                  批量分析 ({{ selectedLogs.length }})
                </el-button>
                
                <el-button 
                  type="success" 
                  size="small" 
                  @click="handleBatchDownload"
                  :disabled="!canBatchOperate"
                >
                  <el-icon><Download /></el-icon>
                  批量下载 ({{ selectedLogs.length }})
                </el-button>
                
                <el-button 
                  type="danger" 
                  size="small" 
                  @click="handleBatchDelete"
                  :disabled="!canBatchDelete"
                >
                  <el-icon><Delete /></el-icon>
                  批量删除 ({{ selectedLogs.length }})
                </el-button>
                <el-tooltip 
                  content="普通用户只能删除自己上传的日志" 
                  placement="top" 
                  v-if="userRole === 3"
                >
                  <el-icon class="info-icon"><InfoFilled /></el-icon>
                </el-tooltip>
                
                <el-button 
                  type="info" 
                  size="small" 
                  @click="clearSelection"
                >
                  取消选择
                </el-button>
              </div>
              
              <!-- 设备检测提示 -->
              <div v-if="deviceCheckMessage" class="device-check-tip">
                <el-tag type="warning" size="small">
                  <el-icon><Warning /></el-icon>
                  <span class="device-message">{{ deviceCheckMessage }}</span>
                </el-tag>
              </div>
            </div>
            
            <!-- 搜索和刷新区域 -->
            <div class="search-section">
              <el-input
                v-model="filterDeviceId"
                placeholder="按设备编号筛选"
                class="search-input"
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
        </div>
      </template>
      
      <el-table
        :data="logs"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="original_name" label="原始文件名" width="200" />
        <el-table-column prop="device_id" label="设备编号" width="120" />
        <el-table-column prop="uploader_id" label="用户ID" width="80" />
        <el-table-column prop="upload_time" label="上传时间" width="150">
          <template #default="{ row }">
            {{ formatDate(row.upload_time) }}
          </template>
        </el-table-column>
        
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
            <div v-if="!canOperate(row)" class="status-tip">
              <el-icon><Warning /></el-icon>
              <span>处理中，请稍候</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button 
              size="small" 
              type="primary"
              @click="goToLogAnalysis(row)"
              :disabled="!canOperate(row)"
            >
              分析
            </el-button>
            
            <el-button 
              size="small" 
              type="success"
              @click="handleDownload(row)"
              :disabled="!canOperate(row)"
            >
              下载
            </el-button>
            
            <el-button 
              size="small" 
              type="danger" 
              @click="handleDelete(row)"
              v-if="canDeleteLog(row)"
              :disabled="!canOperate(row)"
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

    <!-- 日志分析弹窗 -->
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




  </div>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Monitor, Refresh, Upload, Key, Document, UploadFilled, Delete, Warning, InfoFilled } from '@element-plus/icons-vue'

export default {
  name: 'Logs',
  setup() {
    const store = useStore()
    const router = useRouter()
    
    // 响应式数据
    const loading = ref(false)
    const uploading = ref(false)
    const overallProgress = ref(0) // 总体进度
    const uploadRef = ref(null)
    const keyUploadRef = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const decryptKey = ref('') // 密钥输入
    const keyFileName = ref('') // 密钥文件名
    const deviceId = ref('') // 设备编号
    const filterDeviceId = ref('') // 筛选设备编号
    const uploadFileList = ref([]) // 手动跟踪上传文件列表
    const keyError = ref('') // 密钥格式错误提示
    const deviceIdError = ref('') // 设备编号格式错误提示
    
    // 批量操作相关数据
    const selectedLogs = ref([]) // 选中的日志
    

    
    // 计算属性
    const logs = computed(() => store.getters['logs/logsList'])
    const total = computed(() => store.getters['logs/totalCount'])
    const uploadUrl = computed(() => '/api/logs/upload')
    const uploadHeaders = computed(() => ({
      Authorization: `Bearer ${store.state.auth.token}`,
      'X-Decrypt-Key': decryptKey.value, // 添加密钥到请求头
      'X-Device-ID': deviceId.value // 添加设备编号到请求头
    }))
    
    // 权限相关计算属性
    const userRole = computed(() => store.state.auth.user?.role_id)
    const userId = computed(() => store.state.auth.user?.id)
    
    // 批量操作相关计算属性
    const canBatchOperate = computed(() => {
      return selectedLogs.value.length > 0 && selectedLogs.value.every(log => canOperate(log))
    })
    
    // 检查选中的日志是否属于同一设备
    const isSameDevice = computed(() => {
      if (selectedLogs.value.length === 0) return true
      const firstDeviceId = selectedLogs.value[0].device_id
      return selectedLogs.value.every(log => log.device_id === firstDeviceId)
    })
    
    // 获取设备检测提示信息
    const deviceCheckMessage = computed(() => {
      if (selectedLogs.value.length === 0) return ''
      if (!isSameDevice.value) {
        const deviceIds = [...new Set(selectedLogs.value.map(log => log.device_id))]
        return `选中日志包含不同的设备: ${deviceIds.join(', ')}`
      }
      return ''
    })
    
    const canBatchDelete = computed(() => {
      return selectedLogs.value.length > 0 && selectedLogs.value.every(log => canDeleteLog(log))
    })
    
    // 检查是否可以删除日志
    const canDeleteLog = (log) => {
      
      // 管理员可以删除任何日志
      if (userRole.value === 1) return true
      // 专家可以删除任何日志
      if (userRole.value === 2) return true
      // 普通用户只能删除自己上传的日志
      if (userRole.value === 3) {
        return log.uploader_id === userId.value
      }
      return false
    }
    
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
      
      // 验证密钥格式
      const macRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/
      if (!macRegex.test(decryptKey.value)) {
        ElMessage.error('密钥格式不正确，应为MAC地址格式（如：00-01-05-77-6a-09）')
        return
      }
      
      // 检查设备编号是否输入
      if (!deviceId.value.trim()) {
        ElMessage.warning('请输入设备编号，或使用默认值0000-00')
        return
      }
      
      // 验证设备编号格式 - 允许数字+字母组合
      if (deviceId.value && deviceId.value !== '0000-00') {
        const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/
        if (!deviceIdRegex.test(deviceId.value)) {
          ElMessage.error('设备编号格式不正确，应为数字或字母组合格式（如：4371-01、ABC-12、123-XY）')
          return
        }
      } else {
        // 如果没有输入设备编号，弹窗提示
        ElMessage.warning('请输入设备编号，或使用默认值0000-00')
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
      const isSystemInfoFile = file.name === 'systemInfo.txt'
      const isLt1M = file.size / 1024 / 1024 < 1
      
      if (!isTxtFile) {
        ElMessage.error('密钥文件必须是 .txt 格式!')
        return false
      }
      if (!isSystemInfoFile) {
        ElMessage.error('密钥文件名必须是 systemInfo.txt!')
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
        
        // 验证文件内容是否为MAC地址格式
        const macRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/
        if (!macRegex.test(content)) {
          ElMessage.error('密钥文件内容格式不正确，应为MAC地址格式（如：00-01-05-77-6a-09）')
          return
        }
        
        decryptKey.value = content
        keyFileName.value = file.name
        keyError.value = '' // 清除错误提示
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
      keyError.value = ''
      deviceIdError.value = ''
      // 重置上传状态和进度
      uploading.value = false
      overallProgress.value = 0
    }

    // 进度格式化方法
    const progressFormat = (percentage) => {
      if (percentage < 30) {
        return `文件上传中 ${percentage}%`
      } else if (percentage < 60) {
        return `解密处理中 ${percentage}%`
      } else if (percentage < 100) {
        return `解析处理中 ${percentage}%`
      } else {
        return `处理完成 ${percentage}%`
      }
    }

    // 防止页面刷新导致解析中断
    const preventRefresh = () => {
      if (uploading.value) {
        return '解析正在进行中，刷新页面可能导致解析失败。确定要离开吗？'
      }
    }

    // 监听页面刷新事件
    onMounted(() => {
      window.addEventListener('beforeunload', preventRefresh)
    })
    
    const onUploadProgress = (event, file, fileList) => {
      // 上传进度处理，显示文件上传阶段（占总进度的30%）
      const uploadProgress = Math.floor(event.percent * 0.3) // 上传占30%
      overallProgress.value = uploadProgress
      
    }

    const onUploadSuccess = (response, file, fileList) => {
      // 上传成功，开始解密和解析阶段
      
      
      // 更新手动跟踪的文件列表
      uploadFileList.value = fileList
      
      // 检查是否所有文件都上传完成
      if (fileList.length === 0) {
        // 所有文件上传完成，开始解密和解析阶段
        uploading.value = true
        ElMessage.success('文件上传完成，正在解密和解析中...')
        
        // 模拟解密和解析进度（占总进度的70%）
        let decryptProgress = 30 // 从30%开始（上传已完成）
        let parseProgress = 0
        
        // 解密阶段（30% -> 60%）
        const decryptInterval = setInterval(() => {
          if (decryptProgress < 60) {
            decryptProgress += 2
            overallProgress.value = decryptProgress
    
          } else {
            clearInterval(decryptInterval)
            // 开始解析阶段
            startParsePhase()
          }
        }, 100)
        
        // 解析阶段（60% -> 100%）
        const startParsePhase = () => {
          const parseInterval = setInterval(() => {
            if (parseProgress < 40) {
              parseProgress += 1
              overallProgress.value = 60 + parseProgress
      
            } else {
              clearInterval(parseInterval)
              // 解析完成
              finishProcessing()
            }
          }, 200)
        }
        
        // 完成处理
        const finishProcessing = async () => {
          try {
            await loadLogs()
            // 检查是否所有日志都已解析完成
            const allParsed = logs.value.every(log => log.status === 'parsed')
            if (allParsed) {
              overallProgress.value = 100
              uploading.value = false
              // 显示具体的文件名
              const uploadedFiles = uploadFileList.value.map(f => f.name || f.originalname).join(', ')
              ElMessage.success(`${uploadedFiles} 上传成功，解析完成`)
              // 清空表单
              clearUpload()
            } else {
              // 如果后端解析还未完成，继续等待
              setTimeout(finishProcessing, 1000)
            }
          } catch (error) {
            uploading.value = false
            overallProgress.value = 0
            ElMessage.error('检查解析状态失败')
            clearUpload()
          }
        }
        
        // 开始解密阶段
        setTimeout(() => {
          // 解密阶段开始
        }, 500)
      } else {
        ElMessage.success(`文件 ${file.name} 上传成功，正在处理中...`)
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

    // 删除单个文件
    const removeFile = (index) => {
      uploadFileList.value.splice(index, 1)
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

    // 跳转到日志分析页面
    const goToLogAnalysis = (row) => {
      // 在新页面中打开日志分析
      const routeData = router.resolve(`/analysis/${row.id}`)
      window.open(routeData.href, '_blank')
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
        uploading: 'warning',
        decrypting: 'warning',
        parsing: 'warning',
        parsed: 'success',
        failed: 'danger'
      }
      return typeMap[status] || 'info'
    }
    
    const getStatusText = (status) => {
      const textMap = {
        uploading: '上传中',
        decrypting: '解密中',
        parsing: '解析中',
        parsed: '完成',
        failed: '解析失败'
      }
      return textMap[status] || status
    }
    
        // 批量操作相关方法
    const handleSelectionChange = (selection) => {
      selectedLogs.value = selection
      // 保存选中的日志到sessionStorage，供手术统计页面使用
      try {
        sessionStorage.setItem('selectedLogs', JSON.stringify(selection))
      } catch (error) {
        console.warn('保存选中日志到sessionStorage失败:', error)
      }
    }
    
    const clearSelection = () => {
      selectedLogs.value = []
    }
    
    // 批量分析
    const handleBatchAnalyze = () => {
      const logIds = selectedLogs.value.map(log => log.id).join(',')
      // 在新页面中打开批量分析
      const routeData = router.resolve(`/batch-analysis/${logIds}`)
      window.open(routeData.href, '_blank')
    }
    
    // 批量下载
    const handleBatchDownload = async () => {
      try {
        ElMessage.info('正在打包文件，请稍候...')
        
        const logIds = selectedLogs.value.map(log => log.id)
        const response = await store.dispatch('logs/batchDownloadLogs', logIds)
        
        // 创建下载链接
        const blob = new Blob([response.data])
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        
        // 生成ZIP文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        link.download = `logs_batch_${timestamp}.zip`
        
        link.click()
        window.URL.revokeObjectURL(url)
        
        ElMessage.success('批量下载完成')
      } catch (error) {
        console.error('批量下载失败:', error)
        const errorMessage = error.response?.data?.message || error.message || '批量下载失败'
        ElMessage.error(errorMessage)
      }
    }
    
    // 批量删除
    const handleBatchDelete = async () => {
      try {
        await ElMessageBox.confirm(
          `确定要删除选中的 ${selectedLogs.value.length} 个日志文件吗？此操作不可恢复！`, 
          '批量删除确认', 
          {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        ElMessage.info('开始批量删除...')
        
        // 保存选中的日志数据，避免在验证过程中被清空
        const selectedLogsData = [...selectedLogs.value]
        const logIds = selectedLogsData.map(log => parseInt(log.id)).filter(id => !isNaN(id))
        
        if (logIds.length === 0) {
          ElMessage.error('选中的日志ID格式不正确')
          return
        }
        

        
        // 执行批量删除
        let response;
        try {
          response = await store.dispatch('logs/batchDeleteLogs', logIds)
        } catch (apiError) {
          console.error('批量删除失败:', apiError)
          const errorMessage = apiError.response?.data?.message || apiError.message || '批量删除失败'
          ElMessage.error(errorMessage)
          return
        }
        
        // 检查响应中的失败信息
        if (response.data.failCount > 0) {
          ElMessage.warning(`批量删除完成，成功 ${response.data.successCount} 个，失败 ${response.data.failCount} 个`)
          if (response.data.failedLogs && response.data.failedLogs.length > 0) {
            console.error('删除失败的日志:', response.data.failedLogs)
          }
        } else {
          ElMessage.success(response.data.message)
        }
        
        loadLogs() // 重新加载日志列表
        clearSelection() // 清空选择
      } catch (error) {
        if (error !== 'cancel') {
          console.error('批量删除错误:', error)
          console.error('错误详情:', {
            name: error.name,
            message: error.message,
            code: error.code,
            response: error.response?.data,
            status: error.response?.status,
            statusText: error.response?.statusText,
            config: {
              url: error.config?.url,
              method: error.config?.method,
              data: error.config?.data
            }
          })
          
          let errorMessage = '批量删除失败'
          if (error.response?.data?.message) {
            errorMessage = error.response.data.message
          } else if (error.message) {
            errorMessage = error.message
          }
          
          ElMessage.error(errorMessage)
        }
      }
    }
    

    

    
    // 格式化时间戳
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

    // 检查是否可以操作日志（只有完成状态才能操作）
    const canOperate = (log) => {
      return log.status === 'parsed'
    }
    

    

    
    // 自动填充密钥
    const autoFillKey = async () => {
      try {
        const response = await store.dispatch('logs/autoFillKey', deviceId.value)
        if (response.data.key) {
          decryptKey.value = response.data.key
          ElMessage.success('已自动填充密钥')
        } else {
          ElMessage.warning('未找到该设备编号对应的密钥')
        }
      } catch (error) {
        console.error('自动填充密钥错误:', error)
        const errorMessage = error.response?.data?.message || error.message || '自动填充密钥失败'
        ElMessage.error(errorMessage)
      }
    }

    // 验证密钥格式
    const validateKeyFormat = () => {
      const macRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/
      if (decryptKey.value && !macRegex.test(decryptKey.value)) {
        keyError.value = '请输入有效的MAC地址格式密钥 (如: 00-01-05-77-6a-09)'
      } else {
        keyError.value = ''
      }
    }

    // 自动填充设备编号
    const autoFillDeviceId = async () => {
      try {
        const response = await store.dispatch('logs/autoFillDeviceId', decryptKey.value)
        if (response.data.device_id) {
          deviceId.value = response.data.device_id
          ElMessage.success('已自动填充设备编号')
        } else {
          ElMessage.warning('未找到该密钥对应的设备编号')
        }
      } catch (error) {
        console.error('自动填充设备编号错误:', error)
        const errorMessage = error.response?.data?.message || error.message || '自动填充设备编号失败'
        ElMessage.error(errorMessage)
      }
    }

    // 验证设备编号格式
    const validateDeviceIdFormat = () => {
      const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/
      if (deviceId.value && !deviceIdRegex.test(deviceId.value)) {
        deviceIdError.value = '请输入有效的设备编号格式 (如: 4371-01、ABC-12、123-XY)'
      } else {
        deviceIdError.value = ''
      }
    }
    
    // 生命周期
    onMounted(() => {
      loadLogs()
    })
    
    return {
      loading,
      uploading,
      overallProgress,
      progressFormat,
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
      removeFile,
      handleParse,
      handleDownload,
      handleDelete,
      formatFileSize,
      formatDate,
      getStatusType,
      getStatusText,
      goToLogAnalysis,
      decryptKey,
      keyUploadRef,
      keyFileName,
      deviceId,
      filterDeviceId,
      uploadFileList,
      beforeKeyUpload,
      onKeyFileChange,
      canDeleteLog,
      canOperate,
      keyError,
      deviceIdError,
      autoFillKey,
      validateKeyFormat,
      autoFillDeviceId,
      validateDeviceIdFormat,
      
      // 批量操作相关
      selectedLogs,
      canBatchOperate,
      canBatchDelete,
      isSameDevice,
      deviceCheckMessage,
      handleSelectionChange,
      clearSelection,
      handleBatchAnalyze,
      handleBatchDownload,
      handleBatchDelete
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
  align-items: flex-start;
}

.header-actions {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
  min-width: 0;
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

.key-error {
  margin-top: 10px;
}

.device-input-section {
  margin-top: 15px;
}

.device-input-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.device-error {
  margin-top: 10px;
}

.list-card {
  margin-bottom: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.parsing-tip {
  color: #e6a23c;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.parsing-tip .el-icon {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.overall-progress {
  margin-bottom: 20px;
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.progress-stages {
  display: flex;
  justify-content: space-between;
  margin-top: 15px;
  padding: 0 10px;
}

.stage {
  font-size: 12px;
  color: #909399;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.stage.active {
  color: #409eff;
  background-color: #ecf5ff;
  font-weight: 500;
}

.stage.completed {
  color: #67c23a;
  background-color: #f0f9ff;
  font-weight: 500;
}

.custom-file-list {
  margin-top: 15px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  font-size: 14px;
  font-weight: 500;
}

.file-items {
  max-height: 200px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px 15px;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.2s;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background-color: #f5f7fa;
}

.file-item .el-icon {
  margin-right: 8px;
  color: #909399;
}

.file-name {
  flex: 1;
  margin-right: 10px;
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  margin-right: 10px;
  font-size: 12px;
  color: #909399;
}

.status-tip {
  margin-top: 4px;
  font-size: 11px;
  color: #e6a23c;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.status-tip .el-icon {
  font-size: 12px;
}

/* 批量操作样式 */
.batch-operations {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

/* 搜索区域样式 */
.search-section {
  display: flex;
  align-items: center;
  margin-left: auto;
  flex-shrink: 0;
  gap: 10px;
}

.search-input {
  width: 200px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: #f0f9ff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.device-check-tip {
  margin-left: 0;
}

.device-check-tip .el-tag {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 12px;
  max-width: 300px;
  white-space: normal;
  word-wrap: break-word;
  line-height: 1.4;
}

.device-message {
  white-space: normal;
  word-wrap: break-word;
}

.info-icon {
  color: #909399;
  margin-left: 4px;
  cursor: help;
  font-size: 14px;
}

/* 响应式布局 */
@media (max-width: 1024px) {
  .header-actions {
    gap: 15px;
  }
  
  .batch-actions {
    gap: 8px;
  }
  
  .batch-actions .el-button {
    font-size: 12px;
    padding: 6px 10px;
  }
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }
  
  .header-actions {
    flex-direction: column;
    gap: 15px;
  }
  
  .search-section {
    margin-left: 0;
    justify-content: flex-start;
  }
  
  .batch-actions {
    justify-content: flex-start;
  }
  
  .batch-actions .el-button {
    flex: 1;
    min-width: 120px;
  }
}

@media (max-width: 480px) {
  .batch-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .batch-actions .el-button {
    width: 100%;
  }
  
  .search-section {
    flex-direction: column;
    gap: 10px;
  }
  
  .search-section .search-input {
    width: 100% !important;
  }
}

</style> 