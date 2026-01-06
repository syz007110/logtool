<template>
  <div class="dict-container">
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('configManagement.statuses.searchPlaceholder')"
          style="width: 320px"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
      <div class="action-section">
        <el-button
          v-if="$store.getters['auth/hasPermission']('loglevel:manage')"
          class="btn-primary"
          @click="showAddDialog"
        >
          <el-icon><Plus /></el-icon>
          {{ $t('configManagement.statuses.add') }}
        </el-button>
      </div>
    </div>

    <!-- 表格容器 - 固定表头 -->
    <div class="table-container">
        <el-table :data="statuses" :loading="loading" :height="tableHeight" style="width: 100%" v-loading="loading">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="status_key" :label="$t('configManagement.statuses.statusKey')" width="220" />
          <el-table-column v-if="isZhCN" prop="name_zh" :label="$t('configManagement.common.name')" min-width="200" />
          <el-table-column v-if="isEnUS" prop="name_en" :label="$t('configManagement.common.name')" min-width="200" />
          <el-table-column prop="sort_order" :label="$t('configManagement.common.sortOrder')" width="110" />
          <el-table-column prop="is_active" :label="$t('configManagement.common.isActive')" width="110">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'danger'">
                {{ row.is_active ? $t('configManagement.common.active') : $t('configManagement.common.inactive') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            :label="$t('shared.operation')"
            fixed="right"
            width="260"
            v-if="$store.getters['auth/hasPermission']('loglevel:manage')"
          >
            <template #default="{ row }">
              <div class="action-buttons">
                <el-button @click="openMappings(row)" class="btn-text btn-sm">{{ $t('configManagement.common.mappings') }}</el-button>
                <el-button @click="handleEdit(row)" class="btn-text btn-sm">{{ $t('shared.edit') }}</el-button>
                <el-button @click="handleDelete(row)" class="btn-text-danger btn-sm">{{ $t('shared.delete') }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

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

    <!-- Add/Edit dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? $t('configManagement.statuses.edit') : $t('configManagement.statuses.add')" width="640px">
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="120px">
        <el-form-item :label="$t('configManagement.statuses.statusKeyLabel')" prop="status_key">
          <el-input v-model="formData.status_key" :disabled="isEdit" :placeholder="$t('configManagement.statuses.statusKeyPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.nameZh')" prop="name_zh">
          <el-input v-model="formData.name_zh" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.nameEn')" prop="name_en">
          <el-input v-model="formData.name_en" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.description')" prop="description">
          <el-input v-model="formData.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.sortOrder')" prop="sort_order">
          <el-input-number v-model="formData.sort_order" :min="0" :max="999" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.isActive')" prop="is_active">
          <el-switch v-model="formData.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button class="btn-secondary" @click="handleCancel">{{ $t('shared.cancel') }}</el-button>
          <el-button class="btn-primary" @click="handleSubmit">{{ $t('shared.confirm') }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Mappings drawer -->
    <el-drawer v-model="mappingsDrawerVisible" :title="$t('configManagement.statuses.mappingsTitle')" size="50%">
      <div class="drawer-header">
        <div class="drawer-title">
          <div class="drawer-key">{{ currentStatus?.status_key }}</div>
          <div class="drawer-name">{{ isZhCN ? currentStatus?.name_zh : currentStatus?.name_en }}</div>
        </div>
        <el-button class="btn-primary" @click="showAddMappingDialog">
          <el-icon><Plus /></el-icon>
          {{ $t('configManagement.common.addMapping') }}
        </el-button>
      </div>

      <el-table :data="mappings" :loading="mappingsLoading" style="width: 100%" v-loading="mappingsLoading">
        <el-table-column prop="id" label="ID" width="90" />
        <el-table-column prop="source_field" :label="$t('configManagement.common.sourceField')" width="180" />
        <el-table-column prop="source_value" :label="$t('configManagement.common.sourceValue')" />
        <el-table-column prop="sort_order" :label="$t('configManagement.common.sortOrder')" width="110" />
        <el-table-column prop="is_active" :label="$t('configManagement.common.isActive')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'">
              {{ row.is_active ? $t('configManagement.common.active') : $t('configManagement.common.inactive') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" fixed="right" width="180">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button @click="editMapping(row)" class="btn-text btn-sm">{{ $t('shared.edit') }}</el-button>
              <el-button @click="deleteMapping(row)" class="btn-text-danger btn-sm">{{ $t('shared.delete') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <!-- Add/Edit mapping dialog -->
    <el-dialog v-model="mappingDialogVisible" :title="mappingIsEdit ? $t('configManagement.common.editMapping') : $t('configManagement.common.addMapping')" width="640px">
      <el-form ref="mappingFormRef" :model="mappingForm" :rules="mappingRules" label-width="120px">
        <el-form-item :label="$t('configManagement.common.sourceField')" prop="source_field">
          <el-input v-model="mappingForm.source_field" :placeholder="$t('configManagement.common.sourceFieldPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.sourceValue')" prop="source_value">
          <el-input v-model="mappingForm.source_value" :placeholder="$t('configManagement.common.sourceValuePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.sortOrder')" prop="sort_order">
          <el-input-number v-model="mappingForm.sort_order" :min="0" :max="999" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.isActive')" prop="is_active">
          <el-switch v-model="mappingForm.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button class="btn-secondary" @click="mappingDialogVisible = false">{{ $t('shared.cancel') }}</el-button>
          <el-button class="btn-primary" @click="submitMapping">{{ $t('shared.confirm') }}</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { getTableHeight } from '@/utils/tableHeight'
import api from '../../api'

export default {
  name: 'FaultCaseStatuses',
  components: { Search, Plus },
  setup() {
    const { t, locale } = useI18n()
    const loading = ref(false)
    const statuses = ref([])
    const searchQuery = ref('')

    const dialogVisible = ref(false)
    const isEdit = ref(false)
    const formRef = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const total = ref(0)
    
    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('configSubPage')
    })

    const currentLocale = computed(() => locale.value || 'zh-CN')
    const isZhCN = computed(() => currentLocale.value === 'zh-CN')
    const isEnUS = computed(() => currentLocale.value === 'en-US')

    const formData = reactive({
      id: null,
      status_key: '',
      name_zh: '',
      name_en: '',
      description: '',
      sort_order: 0,
      is_active: true
    })

    const formRules = {
      status_key: [
        { required: true, message: t('configManagement.statuses.validation.statusKeyRequired'), trigger: 'blur' },
        { pattern: /^[a-z0-9_]+$/, message: t('configManagement.statuses.validation.statusKeyPattern'), trigger: 'blur' }
      ],
      name_zh: [{ required: true, message: t('configManagement.statuses.validation.nameZhRequired'), trigger: 'blur' }],
      name_en: [{ required: true, message: t('configManagement.statuses.validation.nameEnRequired'), trigger: 'blur' }]
    }

    const filteredStatuses = computed(() => {
      if (!searchQuery.value) return statuses.value
      const q = searchQuery.value.toLowerCase()
      return statuses.value.filter(item =>
        String(item.status_key || '').toLowerCase().includes(q) ||
        String(item.name_zh || '').toLowerCase().includes(q) ||
        String(item.name_en || '').toLowerCase().includes(q)
      )
    })

    const fetchStatuses = async () => {
      loading.value = true
      try {
        const params = {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        }
        const resp = await api.faultCaseStatuses.getList(params)
        if (resp.data?.success) {
          statuses.value = resp.data.statuses || []
          total.value = resp.data.total || 0
        }
      } catch (e) {
        console.error(e)
        ElMessage.error(t('configManagement.statuses.fetchFailed'))
      } finally {
        loading.value = false
      }
    }

    const handleSearch = () => {
      currentPage.value = 1
      fetchStatuses()
    }

    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      fetchStatuses()
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
      fetchStatuses()
    }

    const resetForm = () => {
      Object.assign(formData, {
        id: null,
        status_key: '',
        name_zh: '',
        name_en: '',
        description: '',
        sort_order: 0,
        is_active: true
      })
      formRef.value?.resetFields()
    }

    const showAddDialog = () => {
      isEdit.value = false
      resetForm()
      dialogVisible.value = true
    }

    const handleEdit = (row) => {
      isEdit.value = true
      Object.assign(formData, {
        id: row.id,
        status_key: row.status_key,
        name_zh: row.name_zh,
        name_en: row.name_en,
        description: row.description || '',
        sort_order: row.sort_order ?? 0,
        is_active: !!row.is_active
      })
      dialogVisible.value = true
    }

    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm(t('configManagement.statuses.deleteConfirm'), t('shared.warning'), {
          confirmButtonText: t('shared.confirm'),
          cancelButtonText: t('shared.cancel'),
          type: 'warning',
          confirmButtonClass: 'btn-primary-danger',
          cancelButtonClass: 'btn-secondary'
        })
        const resp = await api.faultCaseStatuses.delete(row.id)
        if (resp.data?.success) {
          ElMessage.success(t('shared.messages.deleteSuccess'))
          fetchStatuses()
        } else {
          ElMessage.error(resp.data?.message || t('shared.messages.deleteFailed'))
        }
      } catch (e) {
        if (e !== 'cancel') ElMessage.error(t('shared.messages.deleteFailed'))
      }
    }

    const handleSubmit = async () => {
      try {
        await formRef.value.validate()
        const payload = {
          status_key: formData.status_key,
          name_zh: formData.name_zh,
          name_en: formData.name_en,
          description: formData.description,
          sort_order: formData.sort_order,
          is_active: formData.is_active
        }
        const resp = isEdit.value
          ? await api.faultCaseStatuses.update(formData.id, payload)
          : await api.faultCaseStatuses.create(payload)
        if (resp.data?.success) {
          ElMessage.success(isEdit.value ? t('shared.messages.updateSuccess') : t('shared.messages.addSuccess'))
          dialogVisible.value = false
          fetchStatuses()
        } else {
          ElMessage.error(resp.data?.message || t('configManagement.common.submitFailed'))
        }
      } catch (e) {
        if (e?.message === 'Validation failed') return
        ElMessage.error(t('configManagement.common.submitFailed'))
      }
    }

    const handleCancel = () => {
      dialogVisible.value = false
      resetForm()
    }

    // mappings
    const mappingsDrawerVisible = ref(false)
    const mappingsLoading = ref(false)
    const mappings = ref([])
    const currentStatus = ref(null)

    const openMappings = async (row) => {
      currentStatus.value = row
      mappingsDrawerVisible.value = true
      await fetchMappings()
    }

    const fetchMappings = async () => {
      if (!currentStatus.value?.id) return
      mappingsLoading.value = true
      try {
        const resp = await api.faultCaseStatuses.getMappings(currentStatus.value.id)
        if (resp.data?.success) mappings.value = resp.data.mappings || []
      } catch (e) {
        console.error(e)
        ElMessage.error(t('configManagement.common.fetchMappingsFailed'))
      } finally {
        mappingsLoading.value = false
      }
    }

    const mappingDialogVisible = ref(false)
    const mappingIsEdit = ref(false)
    const mappingFormRef = ref(null)
    const mappingForm = reactive({
      id: null,
      source_field: 'default',
      source_value: '',
      sort_order: 0,
      is_active: true
    })
    const mappingRules = {
      source_field: [{ required: true, message: t('configManagement.common.validation.sourceFieldRequired'), trigger: 'blur' }],
      source_value: [{ required: true, message: t('configManagement.common.validation.sourceValueRequired'), trigger: 'blur' }]
    }

    const showAddMappingDialog = () => {
      mappingIsEdit.value = false
      Object.assign(mappingForm, { id: null, source_field: 'default', source_value: '', sort_order: 0, is_active: true })
      mappingFormRef.value?.resetFields()
      mappingDialogVisible.value = true
    }

    const editMapping = (row) => {
      mappingIsEdit.value = true
      Object.assign(mappingForm, {
        id: row.id,
        source_field: row.source_field,
        source_value: row.source_value,
        sort_order: row.sort_order ?? 0,
        is_active: !!row.is_active
      })
      mappingDialogVisible.value = true
    }

    const submitMapping = async () => {
      try {
        await mappingFormRef.value.validate()
        const payload = {
          source_field: mappingForm.source_field,
          source_value: mappingForm.source_value,
          sort_order: mappingForm.sort_order,
          is_active: mappingForm.is_active
        }
        const resp = mappingIsEdit.value
          ? await api.faultCaseStatuses.updateMapping(mappingForm.id, payload)
          : await api.faultCaseStatuses.createMapping(currentStatus.value.id, payload)
        if (resp.data?.success) {
          ElMessage.success(mappingIsEdit.value ? t('shared.messages.updateSuccess') : t('shared.messages.addSuccess'))
          mappingDialogVisible.value = false
          fetchMappings()
        } else {
          ElMessage.error(resp.data?.message || t('configManagement.common.submitFailed'))
        }
      } catch (e) {
        if (e?.message === 'Validation failed') return
        ElMessage.error(t('configManagement.common.submitFailed'))
      }
    }

    const deleteMapping = async (row) => {
      try {
        await ElMessageBox.confirm(t('configManagement.common.deleteMappingConfirm'), t('shared.warning'), {
          confirmButtonText: t('shared.confirm'),
          cancelButtonText: t('shared.cancel'),
          type: 'warning',
          confirmButtonClass: 'btn-primary-danger',
          cancelButtonClass: 'btn-secondary'
        })
        const resp = await api.faultCaseStatuses.deleteMapping(row.id)
        if (resp.data?.success) {
          ElMessage.success(t('shared.messages.deleteSuccess'))
          fetchMappings()
        } else {
          ElMessage.error(resp.data?.message || t('shared.messages.deleteFailed'))
        }
      } catch (e) {
        if (e !== 'cancel') ElMessage.error(t('shared.messages.deleteFailed'))
      }
    }

    onMounted(() => fetchStatuses())

    return {
      loading,
      statuses,
      searchQuery,
      dialogVisible,
      isEdit,
      formRef,
      formData,
      formRules,
      currentPage,
      pageSize,
      total,
      isZhCN,
      isEnUS,
      tableHeight,
      handleSearch,
      handleSizeChange,
      handleCurrentChange,
      showAddDialog,
      handleEdit,
      handleDelete,
      handleSubmit,
      handleCancel,
      mappingsDrawerVisible,
      mappingsLoading,
      mappings,
      currentStatus,
      openMappings,
      mappingDialogVisible,
      mappingIsEdit,
      mappingFormRef,
      mappingForm,
      mappingRules,
      showAddMappingDialog,
      editMapping,
      submitMapping,
      deleteMapping
    }
  }
}
</script>

<style scoped>
.dict-container {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.action-buttons {
  display: flex;
  gap: 8px;
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.drawer-key {
  font-weight: 600;
}

.drawer-name {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
</style>


