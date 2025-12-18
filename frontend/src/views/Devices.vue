<template>
  <div class="devices-container">
    <div class="action-bar">
      <div class="search-section">
        <el-input v-model="search" :placeholder="$t('devices.searchPlaceholder')" style="width: 300px" clearable @input="handleSearch" />
      </div>
      <div class="action-section" v-if="$store.getters['auth/hasPermission']('device:create')">
        <el-button class="btn-primary" @click="openEdit()">{{ $t('devices.addDevice') }}</el-button>
      </div>
    </div>

    <el-card class="list-card">
      <el-table :data="devices" :loading="loading" style="width: 100%">
        <el-table-column prop="device_id" :label="$t('devices.deviceId')" width="160" />
        <el-table-column prop="device_model" :label="$t('devices.deviceModel')" width="160" />
        <el-table-column prop="device_key" :label="$t('devices.deviceKey')" width="200" />
        <el-table-column prop="hospital" :label="$t('devices.hospital')">
          <template #default="{ row }">
            <span v-if="row.hospital">{{ maskHospitalName(row.hospital, hasDeviceReadPermission) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="200" v-if="$store.getters['auth/hasPermission']('device:update') || $store.getters['auth/hasPermission']('device:delete')">
          <template #default="{ row }">
            <el-button size="small" class="btn-text btn-sm" @click="openEdit(row)" v-if="$store.getters['auth/hasPermission']('device:update')">{{ $t('shared.edit') }}</el-button>
            <el-button size="small" class="btn-text-danger btn-sm" @click="onDelete(row)" v-if="$store.getters['auth/hasPermission']('device:delete')">{{ $t('shared.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          :current-page="page"
          :page-size="limit"
          :total="total"
          :page-sizes="[10,20,50,100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="(p)=>{page=p;loadDevices()}"
          @size-change="(s)=>{limit=s;page=1;loadDevices()}"
        />
      </div>
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
                    <el-button size="small" class="btn-text btn-sm" @click="editKeyRow(row)">编辑</el-button>
                    <el-button size="small" class="btn-text-danger btn-sm" @click="deleteKey(row)">删除</el-button>
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
        <el-button class="btn-secondary" @click="showEdit=false">{{ $t('shared.cancel') }}</el-button>
        <el-button class="btn-primary" :loading="saving" @click="save" v-if="activeTab === 'basic' || !editing">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

  </div>
  
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'
import { useStore } from 'vuex'
import { maskHospitalName } from '../utils/maskSensitiveData'

export default {
  name: 'Devices',
  components: {
    Plus
  },
  setup() {
    const store = useStore()
    const canEdit = computed(() => {
      return store.getters['auth/hasPermission']('device:update')
    })
    const hasDeviceReadPermission = computed(() => {
      return store.getters['auth/hasPermission']('device:read')
    })

    const loading = ref(false)
    const saving = ref(false)
    const devices = ref([])
    const total = ref(0)
    const page = ref(1)
    const limit = ref(20)
    const search = ref('')
    let searchTimer = null

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

    const loadDevices = async () => {
      loading.value = true
      try {
        const res = await api.devices.getList({ page: page.value, limit: limit.value, search: search.value })
        devices.value = res.data.devices || []
        total.value = res.data.total || 0
      } catch {
        ElMessage.error('加载设备失败')
      } finally {
        loading.value = false
      }
    }

    const handleSearch = () => {
      if (searchTimer) {
        clearTimeout(searchTimer)
      }
      searchTimer = setTimeout(() => {
        page.value = 1
        loadDevices()
      }, 300)
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
        await loadDevices()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || '保存失败')
      } finally {
        saving.value = false
      }
    }

    const onDelete = async (row) => {
      try {
        await ElMessageBox.confirm('确定删除该设备？', '提示', { type: 'warning' })
        await api.devices.delete(row.id)
        ElMessage.success('删除成功')
        loadDevices()
      } catch (e) {
        if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
      }
    }

    onMounted(loadDevices)

    return {
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
      loadDeviceKeys,
      addNewKeyRow,
      editKeyRow,
      cancelEditKey,
      saveKeyRow,
      deleteKey
    }
  }
}
</script>

<style scoped>
.devices-container { height: 100%; }
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.action-section { display: flex; gap: 10px; }
.list-card { margin-bottom: 20px; }
.pagination-wrapper { display: flex; justify-content: center; margin-top: 20px; }

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
  color: #303133;
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
  background-color: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.error-input {
  border-color: #f56c6c;
}

.error-message {
  color: #f56c6c;
  font-size: 12px;
  margin-top: 4px;
}
</style>


