<template>
  <div class="logs-container">
    <!-- 日志上传卡片 -->
    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <span>日志上传</span>
        </div>
      </template>
      <div class="upload-actions">
        <el-button 
          type="primary" 
          @click="showUploadDialog = true"
        >
          <el-icon><UploadFilled /></el-icon>
          上传日志
        </el-button>
      </div>
    </el-card>
    
    <!-- 日志列表 -->
    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>日志列表</span>
          <div class="header-actions">
            <!-- 1) 批量操作组 -->
            <div class="header-section batch-section" v-if="selectedLogs && selectedLogs.length > 0">
              <div class="batch-actions">
                <el-button 
                  type="primary" 
                  size="small" 
                  @click="handleBatchAnalyze"
                  :disabled="!canBatchOperate || !isSameDevice"
                  :title="incompleteLogsMessage || deviceCheckMessage"
                >
                  <el-icon><Monitor /></el-icon>
                  批量分析 ({{ selectedLogs.length }})
                </el-button>
                <el-button 
                  type="success" 
                  size="small" 
                  @click="handleBatchDownload"
                  :disabled="!canBatchOperate"
                  :title="incompleteLogsMessage"
                >
                  <el-icon><Download /></el-icon>
                  批量下载 ({{ selectedLogs.length }})
                </el-button>
                <el-button 
                  type="danger" 
                  size="small" 
                  @click="handleBatchDelete"
                  :disabled="!canBatchDelete"
                  :title="incompleteLogsMessage"
                >
                  <el-icon><Delete /></el-icon>
                  批量删除 ({{ selectedLogs.length }})
                </el-button>
                <el-button 
                  type="warning" 
                  size="small" 
                  @click="handleBatchReparse"
                  :disabled="selectedLogs.length === 0 || userRole !== 1 || !canBatchOperate"
                  :title="incompleteLogsMessage"
                  v-if="userRole === 1"
                >
                  <el-icon><Refresh /></el-icon>
                  批量重新解析 ({{ selectedLogs.length }})
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
            </div>

            <!-- 2) 仅看自己按钮 -->
            <div class="header-section only-own-section">
              <el-checkbox v-model="onlyOwn" @change="applyOnlyOwn" label="仅看自己" />
            </div>

            <!-- 3) 重置按钮 -->
            <div class="header-section reset-section">
              <el-button plain size="small" @click="resetAllFilters">重置</el-button>
            </div>

            <!-- 4) 刷新按钮 -->
            <div class="header-section refresh-section">
              <el-button plain size="small" @click="loadLogs">
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
        <el-table-column prop="original_name" label="原始文件名" width="240">
          <template #header>
            <div class="col-header">
              <span>原始文件名</span>
              <el-popover
                placement="bottom-start"
                width="260"
                v-model:visible="showNameFilterPanel"
                popper-class="custom-filter-panel"
              >
                <div class="filter-panel">
                  <div class="filter-title">时间前缀 (YYYY / YYYYMM / YYYYMMDD / YYYYMMDDHH)</div>
                  <el-input
                    v-model="nameTimePrefix"
                    placeholder="例如 2025081611"
                    clearable
                    @keyup.enter="applyNameFilter"
                  >
                    <template #prefix>
                      <el-icon><Search /></el-icon>
                    </template>
                  </el-input>
                  <div class="filter-actions">
                    <el-button size="small" type="primary" @click="applyNameFilter">搜索</el-button>
                    <el-button size="small" @click="resetNameFilter">重置</el-button>
                  </div>
                </div>
                <template #reference>
                  <el-icon :class="['filter-trigger', { active: !!nameTimePrefix }]"><Filter /></el-icon>
                </template>
              </el-popover>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="device_id" label="设备编号" width="160">
          <template #header>
            <div class="col-header">
              <span>设备编号</span>
              <el-popover
                placement="bottom-start"
                width="260"
                v-model:visible="showDeviceFilterPanel"
                popper-class="custom-filter-panel"
              >
                <div class="filter-panel">
                  <div class="filter-title">设备编号</div>
                  <el-input
                    v-model="filterDeviceId"
                    placeholder="例如 4371-01"
                    clearable
                    @keyup.enter="applyDeviceFilter"
                  >
                    <template #prefix>
                      <el-icon><Search /></el-icon>
                    </template>
                  </el-input>
                  <div class="filter-actions">
                    <el-button size="small" type="primary" @click="applyDeviceFilter">搜索</el-button>
                    <el-button size="small" @click="resetDeviceFilter">重置</el-button>
                  </div>
                </div>
                <template #reference>
                  <el-icon :class="['filter-trigger', { active: !!filterDeviceId }]"><Filter /></el-icon>
                </template>
              </el-popover>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="uploader_id" label="用户ID" width="80" />
        <el-table-column prop="upload_time" label="上传时间" width="150">
          <template #default="{ row }">
            {{ formatDate(row.upload_time) }}
          </template>
        </el-table-column>
        
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getRowStatusType(row)" size="small">
              {{ getRowStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="300" fixed="right">
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

            <el-button 
              size="small" 
              type="warning"
              @click="handleReparse(row)"
              v-if="canReparse"
              :disabled="!canOperate(row) || row.parsing"
            >
              重新解析
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

    <!-- 上传日志弹窗 -->
    <el-dialog v-model="showUploadDialog" title="上传日志" width="700px" append-to-body>

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
        name="file"
        :disabled="uploading"
      >
        <el-button type="primary" :disabled="uploading">
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          选择文件
        </el-button>
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
      <div v-if="uploadFileList && uploadFileList.length > 0" class="custom-file-list">
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
            <span class="file-size">{{ file.sizeText }}</span>
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

      <template #footer>
        <div class="upload-actions">
          <el-button @click="showUploadDialog = false" :disabled="uploading">取消</el-button>
          <el-button 
            type="primary" 
            @click="submitUpload" 
            :loading="uploading"
            :disabled="uploading || !decryptKey.trim() || uploadFileList.length === 0"
          >
            {{ uploading ? '解析中...' : '上传并解析' }}
          </el-button>
        </div>
      </template>
    </el-dialog>


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
import { Search, Monitor, Refresh, Upload, Key, Document, UploadFilled, Delete, Warning, InfoFilled, Filter } from '@element-plus/icons-vue'

export default {
  name: 'Logs',
  setup() {
    const store = useStore()
    const router = useRouter()
    
    // 响应式数据
    const loading = ref(false)
    const uploading = ref(false)
    const showUploadDialog = ref(false)
    const overallProgress = ref(0) // 总体进度
    const processingStatus = ref('') // 处理状态
    const uploadRef = ref(null)
    const keyUploadRef = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const showNameFilterPanel = ref(false)
    const showDeviceFilterPanel = ref(false)
    const nameTimePrefix = ref('')
    const onlyOwn = ref(false)
    const dateShortcuts = ref([
      {
        text: '本年',
        value: () => {
          const start = new Date(new Date().getFullYear(), 0, 1, 0, 0, 0)
          const end = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59)
          return [start, end]
        }
      },
      {
        text: '本月',
        value: () => {
          const now = new Date()
          const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
          return [start, end]
        }
      },
      {
        text: '今天',
        value: () => {
          const now = new Date()
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
          const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
          return [start, end]
        }
      }
    ])
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
    const logs = computed(() => Array.isArray(store.getters['logs/logsList']) ? store.getters['logs/logsList'] : [])
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
      return selectedLogs.value.length > 0 && 
             selectedLogs.value.every(log => canOperate(log)) &&
             selectedLogs.value.every(log => log.status === 'parsed')
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
    
    // 检查是否有未完成的日志
    const hasIncompleteLogs = computed(() => {
      return selectedLogs.value.some(log => log.status !== 'parsed')
    })
    
    // 获取未完成日志提示信息
    const incompleteLogsMessage = computed(() => {
      if (selectedLogs.value.length === 0) return ''
      if (hasIncompleteLogs.value) {
        const incompleteCount = selectedLogs.value.filter(log => log.status !== 'parsed').length
        return `选中的日志中有 ${incompleteCount} 个未完成解析，请等待解析完成后再操作`
      }
      return ''
    })
    
    const canBatchDelete = computed(() => {
      return selectedLogs.value.length > 0 && 
             selectedLogs.value.every(log => canDeleteLog(log)) &&
             selectedLogs.value.every(log => log.status === 'parsed')
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
        const timeParams = buildTimeParams()
        await store.dispatch('logs/fetchLogs', {
          page: currentPage.value,
          limit: pageSize.value,
          device_id: filterDeviceId.value || undefined,
          ...timeParams
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

    const buildTimeParams = () => {
      const tp = (nameTimePrefix.value || '').trim()
      if (tp && /^[0-9]{4}(?:[0-9]{2}){0,3}$/.test(tp)) {
        return { time_prefix: tp, only_own: onlyOwn.value || undefined }
      }
      return { only_own: onlyOwn.value || undefined }
    }

    const applyNameFilter = () => {
      currentPage.value = 1
      showNameFilterPanel.value = false
      loadLogs()
    }
    const resetNameFilter = () => {
      nameTimePrefix.value = ''
      applyNameFilter()
    }

    const applyDeviceFilter = () => {
      currentPage.value = 1
      showDeviceFilterPanel.value = false
      loadLogs()
    }
    const resetDeviceFilter = () => {
      filterDeviceId.value = ''
      applyDeviceFilter()
    }

    const applyOnlyOwn = () => {
      currentPage.value = 1
      loadLogs()
    }

    const resetAllFilters = () => {
      nameTimePrefix.value = ''
      filterDeviceId.value = ''
      onlyOwn.value = false
      currentPage.value = 1
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
      // 点击上传并解析后立即关闭弹窗
      showUploadDialog.value = false
      // 刷新一次日志列表，展示最新的“上传中/处理中”状态
      loadLogs()
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
        // 在空闲时验证，避免主线程长时间占用
        scheduleUpdate(() => {
          const content = (e.target.result || '').trim()
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
        })
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
      console.log('上传成功:', response)
      
      // 更新手动跟踪的文件列表
      updateUploadFileList(fileList)
      
      // 检查是否所有文件都上传完成
      const allUploaded = fileList.length > 0 && fileList.every(f => f.status === 'success')
      if (allUploaded) {
        // 所有文件上传完成，开始解密和解析阶段
        uploading.value = true
        overallProgress.value = 30 // 上传完成，进度到30%
        processingStatus.value = '文件已上传，等待处理...'
        
        // 开始状态监控
        startStatusMonitoring()
      }
    }
    
    // 状态监控函数
    const startStatusMonitoring = () => {
      let checkCount = 0
      const maxChecks = 30 // 最多检查30次（60秒）
      
      const checkStatus = async () => {
        try {
          await loadLogs()
          checkCount++
          
          // 检查是否有新上传的日志
          const newLogs = logs.value.filter(log => 
            log.status === 'uploading' || 
            log.status === 'decrypting' || 
            log.status === 'parsing'
          )
          
          if (newLogs.length > 0) {
            // 根据状态更新进度和显示
            const uploadingCount = newLogs.filter(log => log.status === 'uploading').length
            const decryptingCount = newLogs.filter(log => log.status === 'decrypting').length
            const parsingCount = newLogs.filter(log => log.status === 'parsing').length
            
            if (uploadingCount > 0) {
              overallProgress.value = 30
              processingStatus.value = '文件上传中...'
            } else if (decryptingCount > 0) {
              overallProgress.value = 45
              processingStatus.value = '解密中...'
            } else if (parsingCount > 0) {
              overallProgress.value = 75
              processingStatus.value = '解析中...'
            }
            
            // 继续监控
            if (checkCount < maxChecks) {
              setTimeout(checkStatus, 2000)
            } else {
              // 超时处理
              uploading.value = false
              overallProgress.value = 0
              processingStatus.value = ''
              ElMessage.warning('处理超时，请刷新页面查看最新状态')
              clearUpload()
            }
          } else {
            // 所有日志都处理完成
            const allParsed = logs.value.every(log => log.status === 'parsed')
            const hasFailed = logs.value.some(log => log.status === 'failed')
            
            if (allParsed) {
              overallProgress.value = 100
              uploading.value = false
              processingStatus.value = ''
              showUploadDialog.value = false
              clearUpload()
            } else if (hasFailed) {
              uploading.value = false
              overallProgress.value = 0
              processingStatus.value = ''
              ElMessage.error('部分日志解析失败，请检查日志详情')
              clearUpload()
            } else {
              // 继续监控
              if (checkCount < maxChecks) {
                setTimeout(checkStatus, 2000)
              } else {
                uploading.value = false
                overallProgress.value = 0
                processingStatus.value = ''
                ElMessage.warning('处理超时，请刷新页面查看最新状态')
                clearUpload()
              }
            }
          }
        } catch (error) {
          uploading.value = false
          overallProgress.value = 0
          processingStatus.value = ''
          ElMessage.error('检查状态失败')
          clearUpload()
        }
      }
      
      // 开始检查
      setTimeout(checkStatus, 1000)
    }
    
    const onUploadError = (error) => {
      ElMessage.error('上传失败: ' + (error.message || '未知错误'))
    }
    
    const onExceed = (files, fileList) => {
      ElMessage.error('最多只能上传50个文件!')
    }
    
    const onFileChange = (file, fileList) => {
      updateUploadFileList(fileList)
    }
    
    const onFileRemove = (file, fileList) => {
      updateUploadFileList(fileList)
    }

    // 删除单个文件
    const removeFile = (index) => {
      uploadFileList.value.splice(index, 1)
    }

    // 空闲时批量更新文件列表并预计算显示字段，减少同步阻塞
    const scheduleUpdate = (fn) => {
      const idle = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 0 }), 1))
      idle(() => fn())
    }
    const updateUploadFileList = (rawList) => {
      const normalized = (rawList || []).map(f => {
        const size = f.size || f.raw?.size || 0
        const sizeText = formatFileSize(size)
        return { ...f, sizeText }
      })
      scheduleUpdate(() => {
        uploadFileList.value = normalized
      })
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

    const canReparse = computed(() => store.getters['auth/hasPermission']?.('log:reparse'))

    const handleReparse = async (row) => {
      try {
        if (!canReparse.value) {
          ElMessage.error('仅管理员可重新解析')
          return
        }
        row.parsing = true
        row.status = 'parsing'
        await store.dispatch('logs/reparseLog', row.id)
        ElMessage.success('重新解析完成')
        await loadLogs()
      } catch (error) {
        const msg = error.response?.data?.message || error.message || '重新解析失败'
        ElMessage.error(msg)
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
    
    // 跟踪删除中ID集合
    const deletingIds = ref(new Set())

    const isDeleting = (id) => deletingIds.value.has(id)

    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm('确定要删除这个日志文件吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })
        deletingIds.value.add(row.id)
        await nextTick()
        await store.dispatch('logs/deleteLog', row.id)
        ElMessage.success('删除成功')
        await loadLogs()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
      } finally {
        deletingIds.value.delete(row.id)
      }
    }

    // 跳转到日志分析页面
    const goToLogAnalysis = (row) => {
      // 在新页面中打开日志分析，使用batch-analysis路由
      const routeData = router.resolve(`/batch-analysis/${row.id}`)
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
    
    // 行状态：根据需求映射显示文字
    const getRowStatusType = (row) => {
      if (deletingIds.value.has(row.id)) return 'warning'
      const map = {
        uploading: 'warning',
        decrypting: 'warning',
        parsing: 'warning',
        parsed: 'success',
        failed: 'danger'
      }
      return map[row.status] || 'info'
    }
    const getRowStatusText = (row) => {
      if (deletingIds.value.has(row.id)) return '删除中'
      const map = {
        uploading: '日志上传中',
        decrypting: '解密中',
        parsing: '解析中',
        parsed: '完成',
        failed: '解析失败'
      }
      return map[row.status] || (row.status || '-')
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
        // 检查是否有未完成的日志
        if (hasIncompleteLogs.value) {
          ElMessage.warning('请等待所有选中的日志解析完成后再进行删除操作')
          return
        }
        
        await ElMessageBox.confirm(
          `确定要删除选中的 ${selectedLogs.value.length} 个日志文件吗？此操作不可恢复！`, 
          '批量删除确认', 
          {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // 保存选中的日志数据，避免在验证过程中被清空
        const selectedLogsData = [...selectedLogs.value]
        const logIds = selectedLogsData.map(log => parseInt(log.id)).filter(id => !isNaN(id))
        
        if (logIds.length === 0) {
          ElMessage.error('选中的日志ID格式不正确')
          return
        }
        
        // 将选中的日志ID添加到删除中状态
        logIds.forEach(id => deletingIds.value.add(id))
        await nextTick()
        
        // 执行批量删除
        try {
          await store.dispatch('logs/batchDeleteLogs', logIds)
          // 清除删除中状态，因为任务已加入队列
          logIds.forEach(id => deletingIds.value.delete(id))
          loadLogs() // 重新加载日志列表
          clearSelection() // 清空选择
        } catch (apiError) {
          console.error('批量删除失败:', apiError)
          const errorMessage = apiError.response?.data?.message || apiError.message || '批量删除失败'
          ElMessage.error(errorMessage)
          // 删除失败时，清除删除中状态
          logIds.forEach(id => deletingIds.value.delete(id))
        }
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

    // 批量重新解析（仅管理员）
    const handleBatchReparse = async () => {
      try {
        if (!canReparse.value) {
          ElMessage.error('仅管理员可批量重新解析')
          return
        }
        if (!selectedLogs.value.length) {
          ElMessage.warning('请先选择要重新解析的日志')
          return
        }
        // 检查是否有未完成的日志
        if (hasIncompleteLogs.value) {
          ElMessage.warning('请等待所有选中的日志解析完成后再进行重新解析操作')
          return
        }
        await ElMessageBox.confirm(
          `确定对选中的 ${selectedLogs.value.length} 个日志重新解析释义吗？`,
          '批量重新解析确认',
          { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
        )
        const ids = selectedLogs.value.map(l => l.id)
        // 乐观更新状态
        selectedLogs.value.forEach(l => { l.status = 'parsing' })
        await store.dispatch('logs/batchReparseLogs', ids)
        await loadLogs()
      } catch (error) {
        if (error !== 'cancel') {
          const msg = error.response?.data?.message || error.message || '批量重新解析失败'
          ElMessage.error(msg)
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
      showUploadDialog,
      overallProgress,
      processingStatus,
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
      dateShortcuts,
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
      handleReparse,
      canReparse,
      formatFileSize,
      formatDate,
      getRowStatusType,
      getRowStatusText,
      goToLogAnalysis,
      isDeleting,
      userRole,
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
      handleBatchDelete,
      handleBatchReparse,
      // 列筛选
      showNameFilterPanel,
      showDeviceFilterPanel,
      nameTimePrefix,
      onlyOwn,
      applyNameFilter,
      resetNameFilter,
      applyDeviceFilter,
      resetDeviceFilter,
      applyOnlyOwn,
      resetAllFilters,
      startStatusMonitoring
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
  gap: 12px;
  min-width: 0;
}

.header-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.batch-section {
  flex: 1 1 auto;
  min-width: 240px;
}

.only-own-section,
.reset-section,
.refresh-section {
  flex: 0 0 auto;
}

/* 统一按钮样式与对齐 */
.only-own-section .el-button,
.reset-section .el-button,
.refresh-section .el-button {
  height: 28px;
  line-height: 26px;
  padding: 0 12px;
}

.only-own-section .el-checkbox {
  display: inline-flex;
  align-items: center;
  height: 28px;
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

.processing-status {
  margin-top: 10px;
  text-align: center;
}

.processing-status .el-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
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

.status-progress {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.status-progress .el-progress {
  width: 60px;
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