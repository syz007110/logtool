<template>
  <div class="logs-container">
    <!-- 按设备分组的日志列表 -->
    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>日志列表</span>
          <div class="header-actions">
            <!-- 重置按钮 -->
            <div class="header-section reset-section">
              <el-button plain @click="resetAllFilters">重置</el-button>
            </div>

            <!-- 刷新按钮 -->
            <div class="header-section refresh-section">
              <el-button plain @click="loadDeviceGroups">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
            


            <!-- 日志上传按钮 -->
            <div class="header-section upload-section">
              <el-button 
                type="primary" 
                @click="showNormalUpload"
              >
                <el-icon><UploadFilled /></el-icon>
                日志上传
              </el-button>
            </div>
          </div>
        </div>
      </template>
      
      <el-table
        :data="deviceGroups"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="device_id" label="设备编号" width="200">
          <template #header>
            <div class="col-header">
              <span>设备编号</span>
              <el-popover
                placement="bottom-start"
                width="260"
                :visible="showDeviceFilterPanel"
                @update:visible="showDeviceFilterPanel = $event"
                popper-class="custom-filter-panel"
              >
                <div class="filter-panel">
                  <div class="filter-title">设备编号筛选</div>
                  <el-input
                    v-model="deviceFilterValue"
                    placeholder="输入设备编号进行筛选"
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
                  <el-icon :class="['filter-trigger', { active: !!deviceFilterValue }]"><Filter /></el-icon>
                </template>
              </el-popover>
            </div>
          </template>
          <template #default="{ row }">
            <el-button 
              type="text" 
              @click="showDeviceDetail(row)"
              style="padding: 0; font-weight: 500; color: #409eff;"
            >
              {{ row.device_id }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="hospital_name" label="医院名称" width="200">
          <template #default="{ row }">
            {{ row.hospital_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="log_count" label="日志数量" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.log_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="latest_update_time" label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.latest_update_time) }}
          </template>
        </el-table-column>
                 <el-table-column label="操作" width="300" fixed="right">
           <template #default="{ row }">
             <el-button 
               size="small" 
               type="primary"
               @click="showDeviceDetail(row)"
             >
               详情
             </el-button>
             
             <el-button 
               v-if="false"
               size="small" 
               type="success"
               @click="uploadDataForDevice(row)"
             >
               数据上传
             </el-button>
             
             <el-button 
               size="small" 
               type="info"
               @click="openSurgeryDrawerForDevice(row)"
             >
               手术数据
             </el-button>
           </template>
         </el-table-column>
      </el-table>
      
      <!-- 设备列表分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="deviceTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleDeviceSizeChange"
          @current-change="handleDeviceCurrentChange"
        />
      </div>
    </el-card>

    <!-- 设备详细日志列表抽屉 -->
    <el-drawer
      v-model="showDeviceDetailDrawer"
      :title="` ${selectedDevice?.device_id} 详细日志`"
      direction="rtl"
      size="1200px"
      :before-close="handleDrawerClose"
    >
      <div class="device-detail-content">
        <!-- 设备信息头部 -->
        <div class="device-header">
          <div class="device-info">
            <h3>设备编号：{{ selectedDevice?.device_id }}</h3>
            <p>医院名称：{{ selectedDevice?.hospital_name || '暂无' }}</p>
            <p>日志总数：{{ selectedDevice?.log_count || 0 }}</p>
          </div>
          <div class="device-actions">
            
            <el-button 
              type="primary" 
              @click="uploadLogForDevice(selectedDevice)"
            >
              <el-icon><UploadFilled /></el-icon>
              日志上传
            </el-button>
          </div>
        </div>

        <!-- 详细日志列表 -->
        <div class="detail-logs-section">
          <div class="detail-header">
            <h4>日志列表</h4>
            <div class="detail-actions">
              <!-- 批量操作组 -->
              <div class="batch-section" v-if="selectedDetailLogs && selectedDetailLogs.length > 0">
              <div class="batch-actions">
                <el-button 
                  type="primary" 
                  size="small" 
                  @click="handleBatchAnalyze"
                  :disabled="!canBatchView || !isSameDevice || selectedDetailLogs.length > 20"
                  :title="getBatchViewTitle()"
                >
                  <el-icon><Monitor /></el-icon>
                    批量查看 ({{ selectedDetailLogs.length }})
                </el-button>
                <el-button 
                  type="success" 
                  size="small" 
                  @click="handleBatchDownload"
                  :disabled="!canBatchDownload"
                  :title="incompleteLogsMessage"
                >
                  <el-icon><Download /></el-icon>
                    批量下载 ({{ selectedDetailLogs.length }})
                </el-button>
                <el-button 
                  type="danger" 
                  size="small" 
                  @click="handleBatchDelete"
                  :disabled="!canBatchDelete"
                  :title="incompleteLogsMessage"
                >
                  <el-icon><Delete /></el-icon>
                    批量删除 ({{ selectedDetailLogs.length }})
                </el-button>
                <el-button 
                  type="warning" 
                  size="small" 
                  @click="handleBatchReparse"
                    :disabled="selectedDetailLogs.length === 0 || userRole !== 1 || !canBatchReparse || selectedDetailLogs.length > 20"
                  :title="getBatchReparseTitle()"
                  v-if="userRole === 1"
                >
                  <el-icon><Refresh /></el-icon>
                    批量重新解析 ({{ selectedDetailLogs.length }})
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
                    @click="clearDetailSelection"
                >
                  取消选择
                </el-button>
              </div>
            </div>

              <!-- 仅看自己按钮 -->
              <div class="only-own-section">
                <el-checkbox v-model="detailOnlyOwn" @change="applyDetailOnlyOwn" label="仅看自己" />
            </div>

              <!-- 重置按钮 -->
              <div class="reset-section">
                <el-button plain size="small" @click="resetDetailFilters">重置</el-button>
            </div>

              <!-- 刷新按钮 -->
              <div class="refresh-section">
                <el-button plain size="small" @click="loadDetailLogs">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </div>
        </div>
      
      <el-table
            :data="detailLogs"
            :loading="detailLoading"
        style="width: 100%"
            v-loading="detailLoading"
            @selection-change="handleDetailSelectionChange"
            row-key="id"
      >
        <el-table-column type="selection" width="55" />
            <el-table-column prop="original_name" label="日志文件名" width="240">
          <template #header>
            <div class="col-header">
                  <span>日志文件名</span>
              <el-popover
                placement="bottom-start"
                width="260"
                    :visible="showDetailNameFilterPanel"
                    @update:visible="showDetailNameFilterPanel = $event"
                popper-class="custom-filter-panel"
              >
                <div class="filter-panel">
                  <div class="filter-title">时间前缀 (YYYY / YYYYMM / YYYYMMDD / YYYYMMDDHH)</div>
                  <el-input
                        v-model="detailNameTimePrefix"
                    placeholder="例如 2025081611"
                    clearable
                        @keyup.enter="applyDetailNameFilter"
                  >
                    <template #prefix>
                      <el-icon><Search /></el-icon>
                    </template>
                  </el-input>
                  <div class="filter-actions">
                        <el-button size="small" type="primary" @click="applyDetailNameFilter">搜索</el-button>
                        <el-button size="small" @click="resetDetailNameFilter">重置</el-button>
                  </div>
                </div>
                <template #reference>
                      <el-icon :class="['filter-trigger', { active: !!detailNameTimePrefix }]"><Filter /></el-icon>
                </template>
              </el-popover>
            </div>
          </template>
        </el-table-column>
            <el-table-column prop="uploader_id" label="上传用户ID" width="120" />
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
              :disabled="!canView(row)"
            >
              查看
            </el-button>
            
            <el-button 
              size="small" 
              type="success"
              @click="handleDownload(row)"
              :disabled="!canDownload(row)"
            >
              下载
            </el-button>
            
            <el-button 
              size="small" 
              type="danger" 
              @click="handleDelete(row)"
              v-if="canDeleteLog(row)"
              :disabled="!(row.status === 'parsed' || row.status === 'decrypt_failed' || row.status === 'parse_failed' || row.status === 'file_error' || row.status === 'failed' || row.status === 'queue_failed' || row.status === 'upload_failed' || row.status === 'delete_failed')"
            >
              删除
            </el-button>

            <el-button 
              size="small" 
              type="warning"
              @click="handleReparse(row)"
              v-if="canReparse"
              :disabled="!canReparseLog(row) || row.parsing"
            >
              重新解析
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
              :current-page="detailCurrentPage"
              :page-size="detailPageSize"
          :page-sizes="[10, 20, 50, 100]"
              :total="detailTotal"
          layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleDetailSizeChange"
              @current-change="handleDetailCurrentChange"
        />
      </div>
        </div>
      </div>
    </el-drawer>

    <!-- 手术数据抽屉 -->
    <el-drawer
      v-model="showSurgeryDrawer"
      title="手术数据"
      direction="rtl"
      size="1200px"
    >
      <div v-if="selectedDevice" class="device-header" style="margin-bottom:12px;">
        <div class="device-info">
          <h3>医院：{{ selectedDevice.hospital_name || '-' }}</h3>
          <p>设备编号：{{ selectedDevice.device_id }}</p>
        </div>
      </div>
      <el-table :data="surgeryList" :loading="surgeryLoading" style="width:100%">
        <el-table-column prop="surgery_id" label="手术id" width="220" />
        <el-table-column prop="structured_data.surgery_stats.procedure" label="手术术式" min-width="200">
          <template #default="{ row }">
            {{ row.structured_data?.surgery_stats?.procedure || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="start_time" label="手术开始时间" width="180">
          <template #default="{ row }">{{ formatDate(row.start_time) }}</template>
        </el-table-column>
        <el-table-column prop="end_time" label="手术结束时间" width="180">
          <template #default="{ row }">{{ formatDate(row.end_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="viewLogsBySurgery(row)">查看日志</el-button>
            <el-button size="small" type="success" @click="visualizeSurgery(row)">可视化</el-button>
            <el-popconfirm v-if="$store.getters['auth/hasPermission']('surgery:delete')" title="确定删除该手术记录？" @confirm="deleteSurgery(row)">
              <template #reference>
                <el-button size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrapper">
        <el-pagination
          :current-page="surgeryPage"
          :page-size="surgeryPageSize"
          :page-sizes="[10,20,50]"
          :total="surgeryTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="(s)=>{surgeryPageSize=s; surgeryPage=1; loadSurgeries()}"
          @current-change="(p)=>{surgeryPage=p; loadSurgeries()}"
        />
      </div>
    </el-drawer>

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
              文件上传中，上传完成后才能进行下一次上传操作
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
            :disabled="uploading || !canSubmitUpload || uploadFileList.length === 0"
          >
            {{ uploading ? '上传中...' : '上传并解析' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 日志查看弹窗 -->
    <el-dialog v-model="showEntriesDialog" title="日志查看" width="900px">
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Monitor, Refresh, Upload, Key, Document, UploadFilled, Delete, Warning, InfoFilled, Filter } from '@element-plus/icons-vue'
import websocketClient from '@/services/websocketClient'
import api from '@/api'
import { visualizeSurgery as visualizeSurgeryData } from '@/utils/visualizationHelper'

export default {
  name: 'Logs',
  components: {
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    
    // 响应式数据
    const loading = ref(false)
    const uploading = ref(false) // 仅表示"文件上传阶段"
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
    const deviceFilterValue = ref('')
    
    // 设备分组相关数据
    const deviceGroups = ref([])
    const deviceTotal = ref(0)
    const showDeviceDetailDrawer = ref(false)
    const selectedDevice = ref(null)
    const detailLogs = ref([])
    const detailLoading = ref(false)
    const lastDetailLogsLoadAt = ref(0)
    let detailReloadTimer = null
    const detailCurrentPage = ref(1)
    const detailPageSize = ref(20)
    const detailTotal = ref(0)
    const selectedDetailLogs = ref([])
    const showDetailNameFilterPanel = ref(false)
    const detailNameTimePrefix = ref('')
    const detailOnlyOwn = ref(false)
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
    const uploadDeviceId = ref('') // 上传时的设备编号
    const isDeviceUpload = ref(false) // 标记是否为设备操作上传模式
    const currentUploadDeviceId = ref('') // 当前上传的设备编号，用于自动展开
    

    

    
    // 计算属性
    const logs = computed(() => Array.isArray(store.getters['logs/logsList']) ? store.getters['logs/logsList'] : [])
    const total = computed(() => store.getters['logs/totalCount'])
    
    // WebSocket 状态相关计算属性
    const websocketStatusTitle = computed(() => {
      const status = websocketClient.getConnectionStatus()
      if (status === 'connected') {
        return '实时状态监控已启用'
      } else if (status === 'connecting') {
        return '正在连接实时监控...'
      } else {
        return '实时状态监控未连接'
      }
    })
    
    const websocketStatusType = computed(() => {
      const status = websocketClient.getConnectionStatus()
      if (status === 'connected') {
        return 'success'
      } else if (status === 'connecting') {
        return 'warning'
      } else {
        return 'error'
      }
    })
    
    const websocketStatusDescription = computed(() => {
      const status = websocketClient.getConnectionStatus()
      if (status === 'connected') {
        const deviceId = selectedDevice.value?.device_id
        if (deviceId && websocketClient.getSubscribedDevices().includes(deviceId)) {
          return `已订阅设备 ${deviceId} 的状态更新，日志状态变化时将自动刷新`
        } else {
          return 'WebSocket 连接正常，等待订阅设备'
        }
      } else if (status === 'connecting') {
        return '正在尝试连接 WebSocket 服务器，请稍候...'
      } else {
        return '无法连接到 WebSocket 服务器，将无法接收实时状态更新'
      }
    })
    const uploadUrl = computed(() => '/api/logs/upload')
    const uploadHeaders = computed(() => ({
      Authorization: `Bearer ${store.state.auth.token}`,
      'X-Decrypt-Key': decryptKey.value, // 添加密钥到请求头
      'X-Device-ID': uploadDeviceId.value || deviceId.value // 添加设备编号到请求头
    }))
    
    // 判断是否可以提交上传
    const canSubmitUpload = computed(() => {
      // 如果是设备操作上传模式，则只需要有设备编号
      if (isDeviceUpload.value && uploadDeviceId.value) {
        return true
      }
      // 如果是普通上传模式，需要同时有密钥和设备编号
      if (!isDeviceUpload.value) {
        return decryptKey.value.trim() && deviceId.value.trim()
      }
      return false
    })
    
    // 详细日志列表相关计算属性
    const canBatchView = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canView(log)) &&
             selectedDetailLogs.value.every(log => log.status === 'parsed')
    })
    
    const canBatchDownload = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canDownload(log)) &&
             selectedDetailLogs.value.every(log => log.status === 'parsed')
    })
    
    const canBatchReparse = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canReparseLog(log)) &&
             selectedDetailLogs.value.every(log => log.status === 'parsed' || log.status === 'parse_failed')
    })
    
    const canBatchDelete = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canDeleteLog(log)) &&
             selectedDetailLogs.value.every(log => 
               log.status === 'parsed' || 
               log.status === 'decrypt_failed' || 
               log.status === 'parse_failed' ||
               log.status === 'file_error' ||
               log.status === 'failed' ||
               log.status === 'queue_failed' ||
               log.status === 'upload_failed' ||
               log.status === 'delete_failed'
             )
    })
    
    const isSameDevice = computed(() => {
      if (selectedDetailLogs.value.length === 0) return true
      const firstDeviceId = selectedDetailLogs.value[0].device_id
      return selectedDetailLogs.value.every(log => log.device_id === firstDeviceId)
    })
    
    const deviceCheckMessage = computed(() => {
      if (selectedDetailLogs.value.length === 0) return ''
      if (!isSameDevice.value) {
        const deviceIds = [...new Set(selectedDetailLogs.value.map(log => log.device_id))]
        return `选中日志包含不同的设备: ${deviceIds.join(', ')}`
      }
      return ''
    })
    
    const hasIncompleteLogs = computed(() => {
      return selectedDetailLogs.value.some(log => 
        log.status !== 'parsed' && 
        log.status !== 'failed' && 
        log.status !== 'decrypt_failed' && 
        log.status !== 'parse_failed' && 
        log.status !== 'file_error' &&
        log.status !== 'queue_failed' &&
        log.status !== 'upload_failed' &&
        log.status !== 'delete_failed'
      )
    })
    
    const incompleteLogsMessage = computed(() => {
      if (selectedDetailLogs.value.length === 0) return ''
      if (hasIncompleteLogs.value) {
        const incompleteCount = selectedDetailLogs.value.filter(log => 
          log.status !== 'parsed' && 
          log.status !== 'failed' && 
          log.status !== 'decrypt_failed' && 
          log.status !== 'parse_failed' && 
          log.status !== 'file_error' &&
          log.status !== 'queue_failed' &&
          log.status !== 'upload_failed' &&
          log.status !== 'delete_failed'
        ).length
        return `选中的日志中有 ${incompleteCount} 个未完成解析，请等待解析完成后再操作`
      }
      return ''
    })
    
    // 权限相关计算属性
    const userRole = computed(() => store.state.auth.user?.role_id)
    const userId = computed(() => store.state.auth.user?.id)
    

    
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
    const deviceGroupsLoading = ref(false)
    const lastDeviceGroupsLoadAt = ref(0)
    const loadDeviceGroups = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastDeviceGroupsLoadAt.value < 2000) {
        console.log('跳过设备分组加载（节流）')
        return
      }
      if (!force && deviceGroupsLoading.value) {
        console.log('跳过设备分组加载（去重）')
        return
      }
      try {
        deviceGroupsLoading.value = true
        lastDeviceGroupsLoadAt.value = now
        const timeParams = buildTimeParams()
        const response = await store.dispatch('logs/fetchLogsByDevice', {
          ...timeParams,
          page: currentPage.value,
          limit: pageSize.value,
          device_filter: deviceFilterValue.value.trim()
        })
        
        deviceGroups.value = response.data.device_groups || []
        deviceTotal.value = response.data.pagination?.total || 0
      } catch (error) {
        if (!silent && !uploading.value) {
        ElMessage.error('加载设备分组失败')
        } else {
          console.warn('加载设备分组失败(已静默):', error?.message || error)
        }
      } finally {
        deviceGroupsLoading.value = false
      }
    }
    
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
    
    // 设备详情相关方法
    const showDeviceDetail = (device) => {
      selectedDevice.value = device
      showDeviceDetailDrawer.value = true
      
      // 订阅设备状态更新
      if (device && device.device_id) {
        console.log('准备订阅设备状态更新:', device.device_id)
        const subscribed = websocketClient.subscribeToDevice(device.device_id)
        if (subscribed) {
          console.log('✅ 设备订阅成功:', device.device_id)
        } else {
          console.warn('⚠️ 设备订阅失败:', device.device_id)
        }
      }
      
      loadDetailLogs({ force: true })
    }
    
    const loadDetailLogs = async (options = {}) => {
      if (!selectedDevice.value) return
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastDetailLogsLoadAt.value < 800) {
        if (!detailReloadTimer) {
          detailReloadTimer = setTimeout(() => {
            detailReloadTimer = null
            loadDetailLogs({ force: true, silent: true })
          }, 300)
        }
        return
      }
      if (!force && detailLoading.value) {
        if (!detailReloadTimer) {
          detailReloadTimer = setTimeout(() => {
            detailReloadTimer = null
            loadDetailLogs({ force: true, silent: true })
          }, 300)
        }
        return
      }
      try {
        detailLoading.value = true
        lastDetailLogsLoadAt.value = now
        const timeParams = buildDetailTimeParams()
        await store.dispatch('logs/fetchLogs', {
          page: detailCurrentPage.value,
          limit: detailPageSize.value,
          device_id: selectedDevice.value.device_id,
          ...timeParams
        })
        detailLogs.value = logs.value
        detailTotal.value = total.value
      } catch (error) {
        if (!silent) ElMessage.error('加载设备详细日志失败')
      } finally {
        detailLoading.value = false
      }
    }
    
    const buildDetailTimeParams = () => {
      const tp = (detailNameTimePrefix.value || '').trim()
      if (tp && /^[0-9]{4}(?:[0-9]{2}){0,3}$/.test(tp)) {
        return { time_prefix: tp, only_own: detailOnlyOwn.value || undefined }
      }
      return { only_own: detailOnlyOwn.value || undefined }
    }
    
    const handleDrawerClose = () => {
      showDeviceDetailDrawer.value = false
      
      // 取消订阅设备状态更新
      if (selectedDevice.value && selectedDevice.value.device_id) {
        websocketClient.unsubscribeFromDevice(selectedDevice.value.device_id)
      }
      
      selectedDevice.value = null
      selectedDetailLogs.value = []
      
      // 清理智能状态监控
      if (window.smartStatusMonitorCleanup) {
        window.smartStatusMonitorCleanup()
        window.smartStatusMonitorCleanup = null
      }
    }
    
    const uploadLogForDevice = async (device) => {
      // 设置为设备上传模式
      isDeviceUpload.value = true
      uploadDeviceId.value = device.device_id
      console.log('设置设备编号:', uploadDeviceId.value)
      
      // 自动填充设备编号到输入框（用于显示）
      deviceId.value = device.device_id
      
      // 尝试自动获取该设备的密钥
      try {
        const response = await store.dispatch('logs/autoFillKey', device.device_id)
        if (response.data.key) {
          decryptKey.value = response.data.key
          console.log('自动填充密钥:', decryptKey.value)
        } else {
          console.log('未找到设备对应的密钥，需要用户手动输入')
        }
      } catch (error) {
        console.warn('自动获取设备密钥失败:', error.message)
      }
      
      showUploadDialog.value = true
    }
    
    // 普通上传模式（日志解析上侧的日志上传）
    const showNormalUpload = () => {
      // 设置为普通上传模式
      isDeviceUpload.value = false
      // 清空所有输入，确保是空白状态
      uploadDeviceId.value = ''
      deviceId.value = ''
      decryptKey.value = ''
      keyFileName.value = ''
      keyError.value = ''
      deviceIdError.value = ''
      uploadFileList.value = []
      
      showUploadDialog.value = true
    }
    
    const uploadDataForDevice = (device) => {
      ElMessage.info('数据上传功能暂未实现')
    }
    
    const viewSurgeryData = (device) => {
      ElMessage.info('查看手术数据功能暂未实现')
    }
    
    const toggleDeviceFocus = (device) => {
      device.focused = !device.focused
      ElMessage.success(device.focused ? '已关注设备' : '已取消关注')
    }

    // 手术数据抽屉与数据
    const showSurgeryDrawer = ref(false)
    const surgeryLoading = ref(false)
    const surgeryList = ref([])
    const surgeryPage = ref(1)
    const surgeryPageSize = ref(20)
    const surgeryTotal = ref(0)

    const openSurgeryDrawer = () => {
      showSurgeryDrawer.value = true
      loadSurgeries()
    }

    const openSurgeryDrawerForDevice = (device) => {
      selectedDevice.value = device
      showSurgeryDrawer.value = true
      surgeryPage.value = 1
      loadSurgeries()
    }

    const loadSurgeries = async () => {
      try {
        surgeryLoading.value = true
        const params = {
          device_id: selectedDevice.value?.device_id,
          page: surgeryPage.value,
          limit: surgeryPageSize.value
        }
        const resp = await api.surgeries.list(params)
        surgeryList.value = resp.data?.data || []
        surgeryTotal.value = resp.data?.total || 0
      } catch (e) {
        ElMessage.error('加载手术数据失败')
      } finally {
        surgeryLoading.value = false
      }
    }

    const viewLogsBySurgery = async (row) => {
      try {
        const resp = await api.surgeries.getLogEntriesByRange(row.id)
        const entries = resp.data?.entries || []
        if (!entries.length) {
          ElMessage.warning('未找到相关日志条目')
          return
        }
        // 将涉及的日志ID聚合，使用批量查看页展示
        const ids = Array.from(new Set(entries.map(e => e.log_id))).filter(Boolean)
        if (!ids.length) {
          ElMessage.warning('未找到相关日志文件')
          return
        }
        const routeData = router.resolve(`/batch-analysis/${ids.join(',')}`)
        window.open(routeData.href, '_blank')
      } catch (e) {
        ElMessage.error('获取手术相关日志失败')
      }
    }

    const visualizeSurgery = (row) => {
      // 使用统一的可视化函数
      visualizeSurgeryData(row, { queryId: row.id })
    }

    const deleteSurgery = async (row) => {
      try {
        await api.surgeries.remove(row.id)
        ElMessage.success('删除成功')
        loadSurgeries()
      } catch (e) {
        ElMessage.error('删除失败')
      }
    }
    
    // 详细日志列表相关方法
    const handleDetailSelectionChange = (selection) => {
      // 检查选择数量限制
      if (selection.length > 20) {
        // 限制选择数量为20个
        const limitedSelection = selection.slice(0, 20)
        selectedDetailLogs.value = limitedSelection
        
        // 显示提示信息
        ElMessage.warning('批量操作一次最多只能选择20个文件，已自动限制选择数量')
        
        // 更新表格选择状态（需要手动设置）
        nextTick(() => {
          // 清除所有选择
          const table = document.querySelector('.detail-logs-section .el-table')
          if (table) {
            const checkboxes = table.querySelectorAll('.el-table__row .el-checkbox__input')
            checkboxes.forEach((checkbox, index) => {
              const row = detailLogs.value[index]
              if (row && limitedSelection.some(selected => selected.id === row.id)) {
                checkbox.classList.add('is-checked')
                checkbox.setAttribute('aria-checked', 'true')
              } else {
                checkbox.classList.remove('is-checked')
                checkbox.setAttribute('aria-checked', 'false')
              }
            })
          }
        })
      } else {
        selectedDetailLogs.value = selection
      }
    }
    
    const clearDetailSelection = () => {
      selectedDetailLogs.value = []
    }
    
    const handleDetailSizeChange = (size) => {
      detailPageSize.value = size
      detailCurrentPage.value = 1
      loadDetailLogs()
    }
    
    const handleDetailCurrentChange = (page) => {
      detailCurrentPage.value = page
      loadDetailLogs()
    }
    
    const applyDetailOnlyOwn = () => {
      detailCurrentPage.value = 1
      loadDetailLogs()
    }
    
    const resetDetailFilters = () => {
      detailNameTimePrefix.value = ''
      detailOnlyOwn.value = false
      detailCurrentPage.value = 1
      loadDetailLogs()
    }
    
    const applyDetailNameFilter = () => {
      detailCurrentPage.value = 1
      showDetailNameFilterPanel.value = false
      loadDetailLogs()
    }
    
    const resetDetailNameFilter = () => {
      detailNameTimePrefix.value = ''
      applyDetailNameFilter()
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
        return { time_prefix: tp }
      }
      return {}
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
      loadDeviceGroups()
    }
    const resetDeviceFilter = () => {
      deviceFilterValue.value = ''
      currentPage.value = 1
      loadDeviceGroups()
    }
    
    // 设备列表分页处理
    const handleDeviceSizeChange = (newSize) => {
      pageSize.value = newSize
      currentPage.value = 1
      loadDeviceGroups()
    }
    
    const handleDeviceCurrentChange = (newPage) => {
      currentPage.value = newPage
      loadDeviceGroups()
    }

    const resetAllFilters = () => {
      nameTimePrefix.value = ''
      deviceFilterValue.value = ''
      showDeviceFilterPanel.value = false
      currentPage.value = 1
      loadDeviceGroups()
    }

    
    const submitUpload = () => {
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
      
      // 验证输入（根据模式进行不同验证）
      if (isDeviceUpload.value) {
        // 设备上传模式：只需要验证设备编号存在
        if (!uploadDeviceId.value) {
          ElMessage.error('设备编号不能为空')
          return
        }
      } else {
        // 普通上传模式：需要验证密钥和设备编号
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
      
      if (!deviceId.value.trim()) {
        ElMessage.warning('请输入设备编号，或使用默认值0000-00')
        return
      }
      
        // 验证设备编号格式
      if (deviceId.value && deviceId.value !== '0000-00') {
        const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/
        if (!deviceIdRegex.test(deviceId.value)) {
          ElMessage.error('设备编号格式不正确，应为数字或字母组合格式（如：4371-01、ABC-12、123-XY）')
          return
        }
        }
      }
      
      // 记录当前上传的设备编号（用于自动展开）
      if (!isDeviceUpload.value) {
        currentUploadDeviceId.value = deviceId.value
      }
      
      uploadRef.value.submit()
      // 点击上传并解析后立即关闭弹窗
      showUploadDialog.value = false
      // 刷新一次设备分组列表，展示最新的"上传中/处理中"状态
      loadDeviceGroups()
      
              // 启动智能状态监控（如果详细日志抽屉是打开的）
        startMonitoringIfDrawerOpen()
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
      
            // 根据模式决定是否清空输入
      if (!isDeviceUpload.value) {
        // 普通上传模式：清空所有输入
        decryptKey.value = ''
        keyFileName.value = ''
        deviceId.value = ''
        uploadDeviceId.value = ''
        keyError.value = ''
        deviceIdError.value = ''
        currentUploadDeviceId.value = '' // 清空当前上传的设备编号
      } else {
        // 设备上传模式：只清空文件，保留设备信息
        keyError.value = ''
        deviceIdError.value = ''
      }
      
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
      } else if (percentage < 90) {
        return `解析处理中 ${percentage}%`
      } else if (percentage < 100) {
        return `删除处理中 ${percentage}%`
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
      // 确保 Logs 页面加载时建立 WebSocket 连接
      try { websocketClient.connect() } catch (_) {}
      window.addEventListener('beforeunload', preventRefresh)
      
      // 监听 WebSocket 状态变化事件
      websocketClient.on('logStatusChange', (data) => {
        console.log('收到日志状态变化:', data)
        
        // 如果状态变为 'deleted'，清除删除中状态
        if (data.newStatus === 'deleted') {
          deletingIds.value.delete(data.logId)
          console.log('清除删除中状态，日志ID:', data.logId)
        }
        
        // 就地更新当前列表中该条目的状态，避免等待二次拉取
        const i = detailLogs.value.findIndex(l => Number(l.id) === Number(data.logId))
        if (i !== -1) {
          detailLogs.value[i] = { ...detailLogs.value[i], status: data.newStatus }
        }
        
        // 如果当前有选中的设备且详细日志抽屉是打开的，自动刷新
        if (selectedDevice.value && 
            showDeviceDetailDrawer.value && 
            selectedDevice.value.device_id === data.deviceId) {
          
          console.log('WebSocket 状态变化，准备自动刷新详细日志列表')
          // 静默刷新，并通过节流避免过多请求
          loadDetailLogs({ silent: true })
        }
      })
      
      websocketClient.on('batchStatusChange', (data) => {
        console.log('收到批量状态变化:', data)
        
        // 处理批量状态变化中的删除完成状态
        if (data.changes && Array.isArray(data.changes)) {
          data.changes.forEach(change => {
            if (change.newStatus === 'deleted') {
              deletingIds.value.delete(change.logId)
              console.log('批量状态变化：清除删除中状态，日志ID:', change.logId)
            }
            // 就地更新状态
            const i = detailLogs.value.findIndex(l => Number(l.id) === Number(change.logId))
            if (i !== -1) {
              detailLogs.value[i] = { ...detailLogs.value[i], status: change.newStatus }
            }
          })
        }
        
        // 如果当前有选中的设备且详细日志抽屉是打开的，自动刷新
        if (selectedDevice.value && 
            showDeviceDetailDrawer.value && 
            selectedDevice.value.device_id === data.deviceId) {
          
          console.log('WebSocket 批量状态变化，准备自动刷新详细日志列表')
          // 静默刷新，并通过节流避免过多请求
          loadDetailLogs({ silent: true })
        }
      })
      
      // 添加 WebSocket 连接状态监听，用于更新状态横幅
      const updateWebSocketStatus = () => {
        // 强制触发计算属性重新计算
        nextTick(() => {
          // Vue 会自动重新计算计算属性
        })
      }
      
      // 监听连接状态变化
      websocketClient.on('connection', updateWebSocketStatus)
      websocketClient.on('disconnection', updateWebSocketStatus)
      
      // 添加状态更新定时器，确保状态横幅实时更新
      const statusUpdateTimer = setInterval(() => {
        // 强制触发计算属性重新计算
        nextTick(() => {
          // Vue 会自动重新计算计算属性
        })
      }, 1000) // 每秒更新一次
      
      // 清理定时器
      onUnmounted(() => {
        if (statusUpdateTimer) {
          clearInterval(statusUpdateTimer)
        }
      })
    })
    
    const onUploadProgress = (event, file, fileList) => {
      // 进入文件上传阶段
      uploading.value = true
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
        uploading.value = false
        overallProgress.value = 30 // 上传完成，进度到30%
        processingStatus.value = '文件已上传，等待处理...'
        
        // 如果是普通上传模式（非设备操作上传），自动展开对应设备的详细日志列表
        if (!isDeviceUpload.value && currentUploadDeviceId.value && currentUploadDeviceId.value !== '0000-00') {
          // 延迟一下，确保设备列表已更新
          setTimeout(async () => {
            try {
              // 重新加载设备列表（静默）
              await loadDeviceGroups({ silent: true })
              
              // 查找对应的设备
              const targetDevice = deviceGroups.value.find(device => device.device_id === currentUploadDeviceId.value)
              if (targetDevice) {
                console.log('自动展开设备详细日志列表:', targetDevice.device_id)
                showDeviceDetail(targetDevice)
              }
            } catch (error) {
              console.warn('自动展开设备详细日志列表失败:', error)
            }
          }, 1000) // 延迟1秒，确保后端处理完成
        }
        
        // 启动智能状态监控（如果详细日志抽屉是打开的）
        startMonitoringIfDrawerOpen()
        
        // 开始状态监控
        startStatusMonitoring()

        // 清空已选择的上传文件（不影响输入框内容）
        try {
          if (uploadRef.value && uploadRef.value.clearFiles) {
            uploadRef.value.clearFiles()
          }
        } catch (_) {}
        uploadFileList.value = []
      }
    }
    
    // 智能状态变化检测和更新
    const checkAndUpdateDetailLogs = async () => {
      if (!selectedDevice.value || !showDeviceDetailDrawer.value) return
      
      try {
        // 获取当前详细日志列表的状态快照
        const currentStatusSnapshot = detailLogs.value.map(log => ({
          id: log.id,
          status: log.status,
          updated_at: log.updated_at
        }))
        
        // 重新加载详细日志列表
        await loadDetailLogs()
        
        // 检查是否有状态变化
        const hasStatusChange = detailLogs.value.some((log, index) => {
          const oldLog = currentStatusSnapshot[index]
          return oldLog && (
            oldLog.status !== log.status ||
            oldLog.updated_at !== log.updated_at
          )
        })
        
        if (hasStatusChange) {
          console.log('检测到日志状态变化，已自动刷新详细日志列表')
        }
        
        return hasStatusChange
      } catch (error) {
        console.error('检查日志状态变化失败:', error)
        return false
      }
    }
    
    // 智能状态监控函数
    const startSmartStatusMonitoring = () => {
      // 取消详细列表的轮询，完全依赖 WebSocket 事件触发刷新
      return () => {}
    }
    
    // 通用函数：启动智能状态监控（如果详细日志抽屉是打开的）
    const startMonitoringIfDrawerOpen = () => {
      if (selectedDevice.value && showDeviceDetailDrawer.value) {
        // 清理之前的监控
        if (window.smartStatusMonitorCleanup) {
          window.smartStatusMonitorCleanup()
        }
        // 启动新的监控
        window.smartStatusMonitorCleanup = startSmartStatusMonitoring()
        console.log('已启动智能状态监控')
        
        // 订阅设备状态更新
        if (selectedDevice.value.device_id) {
          console.log('准备订阅设备状态更新:', selectedDevice.value.device_id)
          const subscribed = websocketClient.subscribeToDevice(selectedDevice.value.device_id)
          console.log('设备订阅结果:', subscribed ? '成功' : '失败')
        }
      }
    }
    
    // 状态监控函数
    const startStatusMonitoring = () => {
      // 移除轮询监控，完全依赖 WebSocket 事件更新进度和列表
      return
    }
    
    const onUploadError = (error) => {
      uploading.value = false
      overallProgress.value = 0
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
        
        // 启动智能状态监控，跟踪解析进度
        startMonitoringIfDrawerOpen()
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
        
        // 启动智能状态监控，跟踪重新解析进度
        startMonitoringIfDrawerOpen()
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
        
        // 将日志ID添加到删除中状态
        deletingIds.value.add(row.id)
        await nextTick()
        
        try {
          // 调用删除API
          await store.dispatch('logs/deleteLog', row.id)
          
          // 显示队列状态
          ElMessage.success('删除任务已加入队列，正在处理中...')
          
          // 重新加载日志列表以显示"删除中"状态
          await loadDetailLogs()
          
          // 启动智能状态监控，跟踪删除进度
          startMonitoringIfDrawerOpen()
          
        } catch (apiError) {
          console.error('删除API调用失败:', apiError)
          const errorMessage = apiError.response?.data?.message || apiError.message || '删除失败'
          ElMessage.error(errorMessage)
          // API调用失败时，清除删除中状态
          deletingIds.value.delete(row.id)
        }
        
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除确认错误:', error)
          ElMessage.error('删除操作被取消')
        }
      }
    }

    // 跳转到日志查看页面
    const goToLogAnalysis = (row) => {
      // 在新页面中打开日志查看，使用batch-analysis路由
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
        queued: 'info',
        decrypting: 'warning',
        parsing: 'warning',
        parsed: 'success',
        failed: 'danger',
        decrypt_failed: 'danger',
        parse_failed: 'danger',
        file_error: 'danger',
        deleting: 'warning'  // 新增删除中状态
      }
      return map[row.status] || 'info'
    }
    const getRowStatusText = (row) => {
      if (deletingIds.value.has(row.id)) return '删除中'
      
      // 根据状态返回对应的文本
      const map = {
        uploading: '日志上传中',
        queued: '等待处理中',
        decrypting: '解密中',
        parsing: '解析中',
        parsed: '完成',
        decrypt_failed: '解密失败',
        parse_failed: '解析失败',
        file_error: '文件错误',
        failed: '处理失败',
        deleting: '删除中'  // 新增删除中状态
      }
      
      return map[row.status] || (row.status || '-')
    }
    

    

    

    
    // 批量查看
    const handleBatchAnalyze = () => {
      const logIds = selectedDetailLogs.value.map(log => log.id).join(',')
      // 在新页面中打开批量查看
      const routeData = router.resolve(`/batch-analysis/${logIds}`)
      window.open(routeData.href, '_blank')
    }
    
    // 批量下载
    const handleBatchDownload = async () => {
      try {
        ElMessage.info('正在打包文件，请稍候...')
        
        const logIds = selectedDetailLogs.value.map(log => log.id)
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
          `确定要删除选中的 ${selectedDetailLogs.value.length} 个日志文件吗？此操作不可恢复！`, 
          '批量删除确认', 
          {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // 保存选中的日志数据，避免在验证过程中被清空
        const selectedLogsData = [...selectedDetailLogs.value]
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
          
          // 显示队列状态
          ElMessage.success('批量删除任务已加入队列，正在处理中...')
          
          // 清除删除中状态，因为任务已加入队列
          logIds.forEach(id => deletingIds.value.delete(id))
          
          // 重新加载详细日志列表以显示"删除中"状态
          await loadDetailLogs()
          
          // 启动智能状态监控，跟踪删除进度
          startMonitoringIfDrawerOpen()
          
          clearDetailSelection() // 清空选择
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
        if (!selectedDetailLogs.value.length) {
          ElMessage.warning('请先选择要重新解析的日志')
          return
        }
        // 检查是否有未完成的日志
        if (hasIncompleteLogs.value) {
          ElMessage.warning('请等待所有选中的日志解析完成后再进行重新解析操作')
          return
        }
        await ElMessageBox.confirm(
          `确定对选中的 ${selectedDetailLogs.value.length} 个日志重新解析释义吗？`,
          '批量重新解析确认',
          { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
        )
        const ids = selectedDetailLogs.value.map(l => l.id)
        // 订阅所有涉及设备，确保能收到各设备的状态更新
        const deviceIdsToSubscribe = Array.from(new Set(selectedDetailLogs.value.map(l => l.device_id).filter(Boolean)))
        deviceIdsToSubscribe.forEach(d => {
          try { websocketClient.subscribeToDevice(d) } catch (_) {}
        })
        // 乐观更新状态
        selectedDetailLogs.value.forEach(l => { l.status = 'parsing' })
        await store.dispatch('logs/batchReparseLogs', ids)
        await loadDetailLogs()
        
        // 启动智能状态监控，跟踪重新解析进度
        startMonitoringIfDrawerOpen()
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

    // 检查是否可以操作日志（完成状态或失败状态都可以操作）
    const canOperate = (log) => {
      return log.status === 'parsed' || 
             log.status === 'failed' || 
             log.status === 'decrypt_failed' || 
             log.status === 'parse_failed' || 
             log.status === 'file_error' ||
             log.status === 'queue_failed' ||
             log.status === 'upload_failed' ||
             log.status === 'delete_failed'
    }
    
    // 检查是否可以查看日志（只有完成状态的文件可以查看）
    const canView = (log) => {
      return log.status === 'parsed'
    }
    
    // 检查是否可以下载日志（只有完成状态的文件可以下载）
    const canDownload = (log) => {
      return log.status === 'parsed'
    }
    
    // 检查是否可以重新解析（完成状态和解析失败的文件可以重新解析）
    const canReparseLog = (log) => {
      return log.status === 'parsed' || log.status === 'parse_failed'
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
      loadDeviceGroups()
    })
    
    // 获取批量查看按钮的提示信息
    const getBatchViewTitle = () => {
      if (selectedDetailLogs.value.length > 20) {
        return '批量查看一次最多只能选择20个文件'
      }
      if (incompleteLogsMessage.value) {
        return incompleteLogsMessage.value
      }
      if (deviceCheckMessage.value) {
        return deviceCheckMessage.value
      }
      return '批量查看选中的日志文件'
    }

    // 获取批量重新解析按钮的提示信息
    const getBatchReparseTitle = () => {
      if (selectedDetailLogs.value.length > 20) {
        return '批量重新解析一次最多只能选择20个文件'
      }
      if (incompleteLogsMessage.value) {
        return incompleteLogsMessage.value
      }
      return '批量重新解析选中的日志文件'
    }
    
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
      canSubmitUpload,
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
      uploadDeviceId,
      currentUploadDeviceId,
      beforeKeyUpload,
      onKeyFileChange,
      canDeleteLog,
      canOperate,
      canView,
      canDownload,
      canReparseLog,
      keyError,
      deviceIdError,
      autoFillKey,
      validateKeyFormat,
      autoFillDeviceId,
      validateDeviceIdFormat,
      
      // 设备分组相关
      deviceGroups,
      deviceTotal,
      showDeviceDetailDrawer,
      selectedDevice,
      detailLogs,
      detailLoading,
      detailCurrentPage,
      detailPageSize,
      detailTotal,
      selectedDetailLogs,
      showDetailNameFilterPanel,
      detailNameTimePrefix,
      detailOnlyOwn,
      loadDeviceGroups,
      handleDeviceSizeChange,
      handleDeviceCurrentChange,
      showDeviceDetail,
      loadDetailLogs,
      handleDrawerClose,
      uploadLogForDevice,
      showNormalUpload,
      uploadDataForDevice,
      viewSurgeryData,
      toggleDeviceFocus,
      handleDetailSelectionChange,
      clearDetailSelection,
      handleDetailSizeChange,
      handleDetailCurrentChange,
      applyDetailOnlyOwn,
      resetDetailFilters,
      applyDetailNameFilter,
      resetDetailNameFilter,
      checkAndUpdateDetailLogs,
      startSmartStatusMonitoring,
      startMonitoringIfDrawerOpen,
      websocketStatusTitle,
      websocketStatusType,
      websocketStatusDescription,
      
      // 批量操作相关
      canBatchView,
      canBatchDownload,
      canBatchReparse,
      canBatchDelete,
      isSameDevice,
      deviceCheckMessage,
      hasIncompleteLogs,
      incompleteLogsMessage,
      handleBatchAnalyze,
      handleBatchDownload,
      handleBatchDelete,
      handleBatchReparse,
      // 列筛选
      showNameFilterPanel,
      showDeviceFilterPanel,
      nameTimePrefix,
      deviceFilterValue,
      applyNameFilter,
      resetNameFilter,
      applyDeviceFilter,
      resetDeviceFilter,
      resetAllFilters,
      startStatusMonitoring,
      // 新增函数
      getBatchViewTitle,
      getBatchReparseTitle,
      // 手术数据
      showSurgeryDrawer,
      surgeryLoading,
      surgeryList,
      surgeryPage,
      surgeryPageSize,
      surgeryTotal,
      openSurgeryDrawer,
      loadSurgeries,
      viewLogsBySurgery,
      visualizeSurgery,
      deleteSurgery,
      openSurgeryDrawerForDevice: openSurgeryDrawerForDevice
    }
  }
}
</script>

<style scoped>
.websocket-status-section {
  margin-right: 16px;
}

.websocket-status-banner {
  margin-bottom: 16px;
}

.status-alert {
  margin-bottom: 0;
}
.logs-container {
  height: 100%;
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
.refresh-section,
.upload-section {
  flex: 0 0 auto;
}

/* 统一按钮样式与对齐 */
.only-own-section .el-button,
.reset-section .el-button,
.refresh-section .el-button,
.upload-section .el-button {
  height: 32px;
  line-height: 30px;
  padding: 0 16px;
}

.only-own-section .el-checkbox {
  display: inline-flex;
  align-items: center;
  height: 28px;
}

/* 列头筛选样式 */
.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-trigger {
  cursor: pointer;
  color: #909399;
  transition: color 0.3s;
}

.filter-trigger:hover {
  color: #409eff;
}

.filter-trigger.active {
  color: #409eff;
}

.filter-panel {
  padding: 12px;
}

.filter-title {
  margin-bottom: 12px;
  font-weight: 500;
  color: #303133;
}

.filter-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
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

.device-info-section {
  margin-top: 15px;
}

.device-info-row {
  display: flex;
  align-items: center;
  gap: 15px;
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

/* 设备详情相关样式 */
.device-detail-content {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e4e7ed;
}

.device-info h3 {
  margin: 0 0 10px 0;
  color: #303133;
  font-size: 18px;
}

.device-info p {
  margin: 5px 0;
  color: #606266;
  font-size: 14px;
}

.device-actions {
  display: flex;
  gap: 10px;
}

.detail-logs-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.detail-header h4 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.detail-actions {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.detail-actions .batch-section {
  flex: 1 1 auto;
  min-width: 240px;
}

.detail-actions .only-own-section,
.detail-actions .reset-section,
.detail-actions .refresh-section {
  flex: 0 0 auto;
}

.detail-actions .batch-actions {
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