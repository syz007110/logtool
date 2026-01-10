<template>
  <div class="devices-container">
    <!-- 统一卡片：包含tabs、操作栏和列表 -->
    <el-card class="main-card">
      <el-tabs v-model="mainTab" class="main-tabs">
        <el-tab-pane label="设备列表" name="devices">
          <!-- 操作栏 -->
          <div class="action-bar">
            <div class="search-section">
              <el-input v-model="search" :placeholder="$t('devices.searchPlaceholder')" style="width: 300px" clearable @input="handleSearch" />
            </div>
            <div class="action-section" v-if="$store.getters['auth/hasPermission']('device:create')">
              <el-button type="primary" @click="openEdit()">{{ $t('devices.addDevice') }}</el-button>
            </div>
          </div>

          <!-- 设备列表 - 固定表头 -->
          <div class="table-container">
            <el-table :data="devices" :loading="loading" :height="tableHeight" style="width: 100%">
        <el-table-column prop="device_id" :label="$t('devices.deviceId')" width="160" />
        <el-table-column prop="device_model" :label="$t('devices.deviceModel')" width="160" />
        <el-table-column prop="device_key" :label="$t('devices.deviceKey')" min-width="200" />
        <el-table-column prop="hospital" :label="$t('devices.hospital')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.hospital">{{ maskHospitalName(row.hospital, hasDeviceReadPermission) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="200" align="left" v-if="$store.getters['auth/hasPermission']('device:update') || $store.getters['auth/hasPermission']('device:delete')">
          <template #default="{ row }">
            <div class="operation-buttons">
              <el-button
                text
                size="small"
                @click="openEdit(row)"
                v-if="$store.getters['auth/hasPermission']('device:update')"
                :aria-label="$t('shared.edit')"
                :title="$t('shared.edit')"
              >
                {{ $t('shared.edit') }}
              </el-button>
              <el-button
                text
                size="small"
                class="btn-danger-text"
                @click="onDelete(row)"
                v-if="$store.getters['auth/hasPermission']('device:delete')"
                :aria-label="$t('shared.delete')"
                :title="$t('shared.delete')"
              >
                {{ $t('shared.delete') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
          </div>

          <!-- 分页 -->
          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="page"
              v-model:page-size="limit"
              :total="total"
              :page-sizes="[10,20,50,100]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleDeviceSizeChange"
              @current-change="handleDeviceCurrentChange"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="设备型号" name="models">
          <!-- 操作栏 -->
          <div class="action-bar">
            <div class="search-section">
              <el-input v-model="modelSearch" placeholder="搜索设备型号" style="width: 300px" clearable @input="handleModelSearch" />
            </div>
            <div class="action-section" v-if="$store.getters['auth/hasPermission']('device:update')">
              <el-button type="primary" @click="openModelEdit()">添加设备型号</el-button>
            </div>
          </div>

          <!-- 设备型号列表 - 固定表头 -->
          <div class="table-container">
            <el-table :data="deviceModels" :loading="modelsLoading" :height="tableHeight" style="width: 100%">
            <el-table-column prop="device_model" label="设备型号" min-width="200">
              <template #default="{ row }">
                <span>{{ row.device_model }}</span>
                <el-tag v-if="!row.is_active" type="info" size="small" style="margin-left: 8px">已停用</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" min-width="180">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column prop="updated_at" label="更新时间" min-width="180">
              <template #default="{ row }">
                {{ formatDate(row.updated_at) }}
              </template>
            </el-table-column>
            <el-table-column :label="$t('shared.operation')" width="200" v-if="$store.getters['auth/hasPermission']('device:update') || $store.getters['auth/hasPermission']('device:delete')">
              <template #default="{ row }">
                <el-button size="small" text @click="openModelEdit(row)" v-if="$store.getters['auth/hasPermission']('device:update')">{{ $t('shared.edit') }}</el-button>
                <el-button size="small" text @click="onDeleteModel(row)" v-if="$store.getters['auth/hasPermission']('device:delete')" style="color: var(--el-color-danger);">{{ $t('shared.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          </div>

          <!-- 分页 -->
          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="modelPage"
              v-model:page-size="modelLimit"
              :total="modelTotal"
              :page-sizes="[10,20,50,100]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleModelSizeChange"
              @current-change="handleModelCurrentChange"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="showEdit" :title="editing ? $t('devices.editDevice') : $t('devices.addDevice')" width="800px">
      <el-tabs v-model="activeTab" v-if="editing">
        <el-tab-pane label="基本信息" name="basic">
          <el-form :model="form" label-width="110px" :rules="rules" ref="formRef">
            <el-form-item :label="$t('devices.deviceId')" prop="device_id">
              <el-input v-model="form.device_id" :disabled="!!editing" :placeholder="$t('devices.deviceIdPlaceholder')" />
            </el-form-item>
            <el-form-item :label="$t('devices.deviceModel')" prop="device_model">
              <el-input v-model="form.device_model" />
            </el-form-item>
            <el-form-item :label="$t('devices.deviceKey')" prop="device_key">
              <el-input v-model="form.device_key" placeholder="00-01-05-77-6a-09" />
              <div style="font-size: 12px; color: #909399; margin-top: 4px;">
                注意：此字段为默认密钥（向后兼容），建议使用密钥管理功能配置多密钥
              </div>
            </el-form-item>
            <el-form-item :label="$t('devices.hospital')" prop="hospital">
              <el-input v-model="form.hospital" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="密钥管理" name="keys">
          <div class="keys-management">
            <div class="keys-header">
              <span class="keys-title">设备密钥列表（支持按时间范围配置多个密钥）</span>
            </div>
            <el-table :data="editableKeys" :loading="keysLoading" style="width: 100%" border>
              <el-table-column prop="key_value" label="密钥值" width="160">
                <template #default="{ row, $index }">
                  <el-input
                    v-if="row.editing"
                    v-model="row.key_value"
                    placeholder="00-01-05-77-6a-09"
                    size="small"
                    :class="{ 'error-input': row.errors?.key_value }"
                  />
                  <code v-else>{{ row.key_value }}</code>
                  <div v-if="row.errors?.key_value" class="error-message">{{ row.errors.key_value }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="valid_from_date" label="生效起始日期" width="130">
                <template #default="{ row }">
                  <el-date-picker
                    v-if="row.editing"
                    v-model="row.valid_from_date"
                    type="date"
                    placeholder="选择日期"
                    format="YYYY-MM-DD"
                    value-format="YYYY-MM-DD"
                    size="small"
                    style="width: 100%"
                  />
                  <span v-else>{{ row.valid_from_date }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="valid_to_date" label="生效结束日期" width="130">
                <template #default="{ row }">
                  <el-date-picker
                    v-if="row.editing"
                    v-model="row.valid_to_date"
                    type="date"
                    placeholder="留空表示永久有效"
                    format="YYYY-MM-DD"
                    value-format="YYYY-MM-DD"
                    size="small"
                    style="width: 100%"
                    clearable
                  />
                  <template v-else>
                    <span v-if="row.valid_to_date">{{ row.valid_to_date }}</span>
                    <el-tag v-else type="success" size="small">永久有效</el-tag>
                  </template>
                </template>
              </el-table-column>
              <el-table-column prop="priority" label="优先级" width="120">
                <template #default="{ row }">
                  <el-input-number
                    v-if="row.editing"
                    v-model="row.priority"
                    :min="0"
                    :max="100"
                    size="small"
                    style="width: 100%"
                  />
                  <span v-else>{{ row.priority }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="description" label="描述" min-width="150">
                <template #default="{ row }">
                  <el-input
                    v-if="row.editing"
                    v-model="row.description"
                    placeholder="例如：更换硬件前的密钥"
                    size="small"
                  />
                  <span v-else>{{ row.description || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="is_default" label="默认" width="80">
                <template #default="{ row }">
                  <el-tag v-if="row.is_default" type="info" size="small">是</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row, $index }">
                  <template v-if="row.editing">
                    <el-button size="small" type="primary" @click="saveKeyRow(row, $index)">保存</el-button>
                    <el-button size="small" @click="cancelEditKey(row, $index)">取消</el-button>
                  </template>
                  <template v-else>
                    <el-button size="small" text @click="editKeyRow(row)">编辑</el-button>
                    <el-button size="small" text @click="deleteKey(row)" style="color: var(--el-color-danger);">删除</el-button>
                  </template>
                </template>
              </el-table-column>
            </el-table>
            <div class="add-key-row" v-if="editing">
              <el-button type="primary" plain @click="addNewKeyRow" :disabled="hasNewKeyRow">
                <el-icon><Plus /></el-icon>
                添加密钥
              </el-button>
            </div>
            <div v-if="editableKeys.length === 0 && !keysLoading" class="empty-keys">
              <el-empty description="暂无密钥，点击下方按钮添加密钥" :image-size="100" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
      <el-form v-else :model="form" label-width="110px" :rules="rules" ref="formRef">
        <el-form-item :label="$t('devices.deviceId')" prop="device_id">
          <el-input v-model="form.device_id" :disabled="!!editing" :placeholder="$t('devices.deviceIdPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('devices.deviceModel')" prop="device_model">
          <el-input v-model="form.device_model" />
        </el-form-item>
        <el-form-item :label="$t('devices.deviceKey')" prop="device_key">
          <el-input v-model="form.device_key" placeholder="00-01-05-77-6a-09" />
        </el-form-item>
        <el-form-item :label="$t('devices.hospital')" prop="hospital">
          <el-input v-model="form.hospital" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="default" @click="showEdit=false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save" v-if="activeTab === 'basic' || !editing">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 设备型号编辑对话框 -->
    <el-dialog v-model="showModelEdit" :title="editingModel ? '编辑设备型号' : '添加设备型号'" width="500px">
      <el-form :model="modelForm" label-width="100px" ref="modelFormRef">
        <el-form-item label="设备型号" prop="device_model" :rules="[{ required: true, message: '请输入设备型号', trigger: 'blur' }]">
          <el-input v-model="modelForm.device_model" placeholder="例如 4371" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="modelForm.is_active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="default" @click="showModelEdit=false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="savingModel" @click="saveModel">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

  </div>
  
</template>

<script>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../api'
import { useStore } from 'vuex'
import { maskHospitalName } from '../utils/maskSensitiveData'
import { getTableHeight } from '@/utils/tableHeight'

export default {
  name: 'Devices',
  components: {
    Plus
  },
  setup() {
    const { t } = useI18n()
    const store = useStore()
    const canEdit = computed(() => {
      return store.getters['auth/hasPermission']('device:update')
    })
    const hasDeviceReadPermission = computed(() => {
      return store.getters['auth/hasPermission']('device:read')
    })

    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('configSubPage') // 使用 configSubPage 因为页面有 tabs
    })

    const mainTab = ref('devices')
    const loading = ref(false)
    const saving = ref(false)
    const devices = ref([])
    const total = ref(0)
    const page = ref(1)
    const limit = ref(20)
    const search = ref('')
    let searchTimer = null
    
    // 分页节流和去重机制
    const devicesLoading = ref(false)
    const lastDevicesLoadAt = ref(0)

    // 设备型号相关
    const deviceModels = ref([])
    const modelsLoading = ref(false)
    const modelPage = ref(1)
    const modelLimit = ref(20)
    const modelTotal = ref(0)
    const modelSearch = ref('')
    let modelSearchTimer = null
    const showModelEdit = ref(false)
    const editingModel = ref(null)
    const savingModel = ref(false)
    const modelFormRef = ref(null)
    const modelForm = reactive({ device_model: '', is_active: true })

    const showEdit = ref(false)
    const activeTab = ref('basic')
    const editing = ref(null)
    const formRef = ref(null)
    const form = reactive({ device_id: '', device_model: '', device_key: '', hospital: '' })

    // 密钥管理相关
    const deviceKeys = ref([])
    const editableKeys = ref([])
    const keysLoading = ref(false)
    const savingKey = ref(false)

    const rules = {
      device_id: [
        { required: true, message: '请输入设备编号', trigger: 'blur' },
        { pattern: /^[0-9A-Za-z]+-[0-9A-Za-z]+$/, message: '格式如 4371-01 / ABC-12', trigger: 'blur' }
      ],
      device_key: [
        { pattern: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, message: '请输入MAC地址格式', trigger: 'blur' }
      ]
    }

    // 验证密钥行数据
    const validateKeyRow = (row) => {
      const errors = {}
      if (!row.key_value || row.key_value.trim() === '') {
        errors.key_value = '密钥值不能为空'
      } else {
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
        if (!macRegex.test(row.key_value)) {
          errors.key_value = '请输入MAC地址格式（如：00-01-05-77-6a-09）'
        }
      }
      if (!row.valid_from_date) {
        errors.valid_from_date = '生效起始日期不能为空'
      }
      return errors
    }

    const loadDevices = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastDevicesLoadAt.value < 2000) {
        return
      }
      if (!force && devicesLoading.value) {
        return
      }
      try {
        devicesLoading.value = true
        loading.value = true
        lastDevicesLoadAt.value = now
        const res = await api.devices.getList({ page: page.value, limit: limit.value, search: search.value })
        devices.value = res.data.devices || []
        total.value = res.data.total || 0
      } catch (error) {
        if (!silent) {
          ElMessage.error('加载设备失败')
        } else {
          console.warn('加载设备失败(已静默):', error?.message || error)
        }
      } finally {
        devicesLoading.value = false
        loading.value = false
      }
    }

    const handleSearch = () => {
      if (searchTimer) {
        clearTimeout(searchTimer)
      }
      searchTimer = setTimeout(() => {
        page.value = 1
        loadDevices({ force: true })
      }, 300)
    }

    const handleDeviceSizeChange = (newSize) => {
      limit.value = newSize
      page.value = 1
      loadDevices({ force: true })
    }

    const handleDeviceCurrentChange = (newPage) => {
      page.value = newPage
      loadDevices({ force: true })
    }

    const openEdit = (row) => {
      if (row) {
        editing.value = row
        Object.assign(form, { device_id: row.device_id, device_model: row.device_model, device_key: row.device_key, hospital: row.hospital })
        activeTab.value = 'basic'
        // 加载密钥列表
        loadDeviceKeys(row.device_id)
      } else {
        editing.value = null
        Object.assign(form, { device_id: '', device_model: '', device_key: '', hospital: '' })
        deviceKeys.value = []
        activeTab.value = 'basic'
      }
      showEdit.value = true
    }

    // 加载设备密钥列表
    const loadDeviceKeys = async (deviceId) => {
      if (!deviceId) return
      keysLoading.value = true
      try {
        const res = await api.devices.getKeys(deviceId)
        deviceKeys.value = res.data.keys || []
        // 转换为可编辑格式
        editableKeys.value = deviceKeys.value.map(key => ({
          ...key,
          editing: false,
          originalData: { ...key },
          errors: {}
        }))
      } catch (error) {
        ElMessage.error('加载密钥列表失败')
        deviceKeys.value = []
        editableKeys.value = []
      } finally {
        keysLoading.value = false
      }
    }

    // 计算是否有新添加的行（正在编辑且没有id）
    const hasNewKeyRow = computed(() => {
      return editableKeys.value.some(row => row.editing && !row.id)
    })

    // 添加新密钥行
    const addNewKeyRow = () => {
      if (hasNewKeyRow.value) {
        ElMessage.warning('请先保存或取消当前编辑的密钥')
        return
      }
      const newRow = {
        id: null,
        key_value: '',
        valid_from_date: '',
        valid_to_date: null,
        priority: 0,
        description: '',
        is_default: false,
        editing: true,
        originalData: null,
        errors: {}
      }
      editableKeys.value.push(newRow)
    }

    // 编辑密钥行
    const editKeyRow = (row) => {
      if (hasNewKeyRow.value) {
        ElMessage.warning('请先保存或取消当前编辑的密钥')
        return
      }
      row.editing = true
      row.originalData = { ...row }
      row.errors = {}
    }

    // 取消编辑
    const cancelEditKey = (row, index) => {
      if (row.id) {
        // 恢复原始数据
        Object.assign(row, row.originalData)
        row.editing = false
        row.errors = {}
      } else {
        // 删除新添加的行
        editableKeys.value.splice(index, 1)
      }
    }

    // 保存密钥行
    const saveKeyRow = async (row, index) => {
      // 验证数据
      const errors = validateKeyRow(row)
      if (Object.keys(errors).length > 0) {
        row.errors = errors
        ElMessage.error('请检查输入的数据')
        return
      }

      savingKey.value = true
      try {
        const keyData = {
          key_value: row.key_value,
          valid_from_date: row.valid_from_date,
          valid_to_date: row.valid_to_date || null,
          priority: row.priority || 0,
          description: row.description || ''
        }

        if (row.id) {
          // 更新现有密钥
          await api.devices.updateKey(row.id, keyData)
          ElMessage.success('密钥更新成功')
          // 重新加载密钥列表
          await loadDeviceKeys(editing.value.device_id)
        } else {
          // 创建新密钥
          await api.devices.createKey(editing.value.device_id, keyData)
          ElMessage.success('密钥添加成功')
          // 重新加载密钥列表
          await loadDeviceKeys(editing.value.device_id)
        }
      } catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存密钥失败')
      } finally {
        savingKey.value = false
      }
    }

    // 删除密钥
    const deleteKey = async (key) => {
      if (key.editing) {
        ElMessage.warning('请先保存或取消编辑')
        return
      }
      try {
        await ElMessageBox.confirm('确定删除该密钥？', '提示', { type: 'warning' })
        await api.devices.deleteKey(key.id)
        ElMessage.success('密钥删除成功')
        await loadDeviceKeys(editing.value.device_id)
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error(error?.response?.data?.message || '删除密钥失败')
        }
      }
    }

    const save = async () => {
      await formRef.value?.validate()
      saving.value = true
      try {
        if (editing.value) {
          await api.devices.update(editing.value.id, form)
          ElMessage.success('更新成功')
        } else {
          await api.devices.create(form)
          ElMessage.success('创建成功')
        }
        showEdit.value = false
        await loadDevices({ force: true })
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '保存失败')
      } finally {
        saving.value = false
      }
    }

    // 使用删除确认 composable pattern
    const { confirmDelete } = useDeleteConfirm()

    const onDelete = async (row) => {
      try {
        const confirmed = await confirmDelete(row, {
          message: '确定删除该设备？',
          title: t('shared.messages.deleteConfirmTitle')
        })

        if (!confirmed) return

        await api.devices.delete(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadDevices({ force: true })
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || t('shared.messages.deleteFailed'))
      }
    }

    // 设备型号相关函数
    const formatDate = (d) => {
      if (!d) return '-'
      try {
        return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      } catch {
        return String(d)
      }
    }

    const loadDeviceModels = async () => {
      modelsLoading.value = true
      try {
        const res = await api.deviceModels.getList({ 
          page: modelPage.value, 
          limit: modelLimit.value, 
          search: modelSearch.value,
          includeInactive: 'true' // 设备管理页面显示所有（包括停用的）
        })
        deviceModels.value = res.data.models || []
        modelTotal.value = res.data.total || 0
      } catch (e) {
        console.error('加载设备型号失败:', e)
        ElMessage.error(e.response?.data?.message || '加载设备型号失败')
      } finally {
        modelsLoading.value = false
      }
    }

    const handleModelSearch = () => {
      if (modelSearchTimer) {
        clearTimeout(modelSearchTimer)
      }
      modelSearchTimer = setTimeout(() => {
        modelPage.value = 1
        loadDeviceModels()
      }, 300)
    }

    const handleModelSizeChange = (newSize) => {
      modelLimit.value = newSize
      modelPage.value = 1
      loadDeviceModels()
    }

    const handleModelCurrentChange = (newPage) => {
      modelPage.value = newPage
      loadDeviceModels()
    }

    const openModelEdit = (row) => {
      if (row) {
        editingModel.value = row
        Object.assign(modelForm, { device_model: row.device_model, is_active: row.is_active === 1 || row.is_active === true })
      } else {
        editingModel.value = null
        Object.assign(modelForm, { device_model: '', is_active: true })
      }
      showModelEdit.value = true
    }

    const saveModel = async () => {
      if (!modelFormRef.value) return
      await modelFormRef.value.validate(async (valid) => {
        if (!valid) return
        savingModel.value = true
        try {
          if (editingModel.value) {
            await api.deviceModels.update(editingModel.value.id, modelForm)
            ElMessage.success('更新成功')
          } else {
            await api.deviceModels.create(modelForm)
            ElMessage.success('添加成功')
          }
          showModelEdit.value = false
          loadDeviceModels()
        } catch (e) {
          ElMessage.error(e.response?.data?.message || '操作失败')
        } finally {
          savingModel.value = false
        }
      })
    }

    const onDeleteModel = async (row) => {
      try {
        await ElMessageBox.confirm(
          '确定删除该设备型号吗？',
          t('shared.messages.deleteConfirmTitle'),
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        await api.deviceModels.delete(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadDeviceModels()
      } catch (e) {
        if (e !== 'cancel') {
          ElMessage.error(e.response?.data?.message || t('shared.messages.deleteFailed'))
        }
      }
    }

    // 监听Tab切换，自动加载对应数据
    watch(mainTab, (newTab) => {
      if (newTab === 'models') {
        loadDeviceModels()
      }
    })

    onMounted(() => {
      loadDevices({ force: true })
      // 如果默认Tab是设备型号，加载设备型号列表
      if (mainTab.value === 'models') {
        loadDeviceModels()
      }
    })

    return {
      t,
      mainTab,
      devices,
      total,
      page,
      limit,
      search,
      loading,
      saving,
      showEdit,
      activeTab,
      editing,
      form,
      rules,
      formRef,
      canEdit,
      // 设备型号
      deviceModels,
      modelsLoading,
      modelPage,
      modelLimit,
      modelTotal,
      modelSearch,
      showModelEdit,
      editingModel,
      savingModel,
      modelFormRef,
      modelForm,
      formatDate,
      loadDeviceModels,
      handleModelSearch,
      handleModelSizeChange,
      handleModelCurrentChange,
      openModelEdit,
      saveModel,
      onDeleteModel,
      hasDeviceReadPermission,
      maskHospitalName,
      deviceKeys,
      editableKeys,
      keysLoading,
      savingKey,
      hasNewKeyRow,
      loadDevices,
      openEdit,
      save,
      onDelete,
      handleSearch,
      handleDeviceSizeChange,
      handleDeviceCurrentChange,
      loadDeviceKeys,
      addNewKeyRow,
      editKeyRow,
      cancelEditKey,
      saveKeyRow,
      deleteKey,
      tableHeight
    }
  }
}
</script>

<style scoped>
.devices-container {
  height: calc(100vh - 64px);
  background: rgb(var(--background));
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px; /* 底部 padding 减少到 4px */
}

.main-tabs {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.search-section {
  display: flex;
  align-items: center;
}

.action-section {
  display: flex;
  gap: 10px;
}

/* 表格容器 - 固定表头 */
.table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.table-container :deep(.el-table) {
  flex: 1;
  width: 100%;
}

.table-container :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 0 12px 0; /* 上8px， 下12px */
  margin-top: auto;
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
}

.keys-management {
  padding: 10px 0;
}

.keys-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.keys-title {
  font-size: 14px;
  font-weight: 500;
  color: rgb(var(--text-primary));
}

.empty-keys {
  padding: 40px 0;
  text-align: center;
}

.add-key-row {
  margin-top: 16px;
  text-align: center;
}

code {
  background-color: rgb(var(--bg-secondary));
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: rgb(var(--text-primary));
}

.error-input {
  border-color: rgb(var(--text-error-primary));
}

.error-message {
  color: rgb(var(--text-error-primary));
  font-size: 12px;
  margin-top: 4px;
}
</style>


