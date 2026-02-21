<template>
  <div class="dict-container">
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('configManagement.modules.searchPlaceholder')"
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
          v-if="$store.getters['auth/hasPermission']('fault_case_config:manage')"
          type="primary"
          @click="showAddDialog"
        >
          <el-icon><Plus /></el-icon>
          {{ $t('configManagement.modules.add') }}
        </el-button>
      </div>
    </div>

    <!-- 表格容器 - 固定表头 -->
    <div class="table-container">
        <el-table :data="modules" :loading="loading" :height="tableHeight" style="width: 100%" v-loading="loading" table-layout="auto">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="module_key" :label="$t('configManagement.modules.moduleKey')" width="150" />
          <el-table-column v-if="isZhCN" prop="name_zh" :label="$t('shared.name')" width="120" min-width="100" />
          <el-table-column v-if="isEnUS" prop="name_en" :label="$t('shared.name')" width="120" min-width="100" />
          <el-table-column :label="$t('configManagement.common.mappings')" min-width="350">
            <template #default="{ row }">
              <div class="mapping-tags-container">
                <el-tag
                  v-for="(value, index) in (row.mapping_values || [])"
                  :key="index"
                  size="small"
                  class="mapping-tag"
                >
                  {{ value }}
                </el-tag>
                <span v-if="!row.mapping_values || row.mapping_values.length === 0" class="mapping-empty">-</span>
              </div>
            </template>
          </el-table-column>
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
            width="180"
            align="left"
            v-if="$store.getters['auth/hasPermission']('fault_case_config:manage')"
          >
            <template #default="{ row }">
              <div class="operation-buttons">
                <el-button
                  text
                  size="small"
                  @click="handleEdit(row)"
                  :aria-label="$t('shared.edit')"
                  :title="$t('shared.edit')"
                >
                  {{ $t('shared.edit') }}
                </el-button>
                <el-button
                  text
                  size="small"
                  class="btn-danger-text"
                  @click="handleDelete(row)"
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
    <el-dialog 
      v-model="dialogVisible" 
      :title="isEdit ? $t('configManagement.common.editItem') : $t('configManagement.modules.add')" 
      width="640px"
      class="edit-item-dialog"
      append-to-body
      :z-index="3000"
    >
      <template #header>
        <div class="dialog-header">
          <div class="dialog-title-wrapper">
            <h3 class="dialog-title">{{ isEdit ? $t('configManagement.common.editItem') : $t('configManagement.modules.add') }}</h3>
            <p class="dialog-subtitle">{{ $t('configManagement.common.editItemSubtitle') }}</p>
          </div>
        </div>
      </template>
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="120px">
        <el-form-item :label="$t('configManagement.modules.moduleKeyLabel')" prop="module_key">
          <el-input v-model="formData.module_key" :disabled="isEdit" :placeholder="$t('configManagement.modules.moduleKeyPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('shared.name')" prop="name">
          <el-input v-model="formData.name" :placeholder="isZhCN ? $t('configManagement.common.nameZh') : $t('configManagement.common.nameEn')" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.sortOrder')" prop="sort_order">
          <el-input-number v-model="formData.sort_order" :min="0" :max="999" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.isActive')" prop="is_active">
          <el-switch v-model="formData.is_active" />
        </el-form-item>
        
        <!-- Mapping Fields Section -->
        <el-form-item :label="$t('configManagement.common.mappingFields')">
          <div class="mapping-fields-container">
            <div class="mapping-input-wrapper">
              <el-input
                v-model="mappingInputValue"
                :placeholder="$t('configManagement.common.mappingFieldsPlaceholder')"
                @keyup.enter="handleAddMapping"
                class="mapping-input"
              />
              <el-button 
                type="primary"
                class="mapping-add-btn" 
                @click="handleAddMapping"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
            </div>
            <div class="mapping-chips" v-if="formData.mappingValues && formData.mappingValues.length > 0">
              <el-tag
                v-for="(value, index) in formData.mappingValues"
                :key="index"
                closable
                @close="handleRemoveMapping(index)"
                class="mapping-chip"
              >
                {{ value }}
              </el-tag>
            </div>
            <p class="mapping-tip">{{ $t('configManagement.common.mappingTip') }}</p>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button class="btn-secondary" @click="handleCancel">{{ $t('shared.cancel') }}</el-button>
          <el-button type="primary" @click="handleSubmit">{{ $t('shared.confirm') }}</el-button>
        </span>
      </template>
    </el-dialog>

  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import { Search, Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { getTableHeight } from '@/utils/tableHeight'
import api from '../../api'

export default {
  name: 'FaultCaseModules',
  components: { Search, Plus },
  setup() {
    const { t, locale } = useI18n()
    const loading = ref(false)
    const modules = ref([])
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
      module_key: '',
      name: '',
      name_zh: '',
      name_en: '',
      description: '',
      sort_order: 0,
      is_active: true,
      mappingValues: []
    })
    
    const mappingInputValue = ref('')

    const formRules = {
      module_key: [
        { required: true, message: t('configManagement.modules.validation.moduleKeyRequired'), trigger: 'blur' },
        { pattern: /^[a-z0-9_]+$/, message: t('configManagement.modules.validation.moduleKeyPattern'), trigger: 'blur' }
      ],
      name: [
        { required: true, message: isZhCN.value ? t('configManagement.modules.validation.nameZhRequired') : t('configManagement.modules.validation.nameEnRequired'), trigger: 'blur' }
      ]
    }

    const fetchModules = async () => {
      loading.value = true
      try {
        const params = {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        }
        const resp = await api.faultCaseModules.getList(params)
        if (resp.data?.success) {
          modules.value = resp.data.modules || []
          total.value = resp.data.total || 0
        }
      } catch (e) {
        console.error(e)
        ElMessage.error(t('configManagement.modules.fetchFailed'))
      } finally {
        loading.value = false
      }
    }

    const handleSearch = () => {
      currentPage.value = 1
      fetchModules()
    }

    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      fetchModules()
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
      fetchModules()
    }

    const resetForm = () => {
      Object.assign(formData, {
        id: null,
        module_key: '',
        name: '',
        name_zh: '',
        name_en: '',
        description: '',
        sort_order: 0,
        is_active: true,
        mappingValues: []
      })
      mappingInputValue.value = ''
      formRef.value?.resetFields()
    }
    
    const handleAddMapping = () => {
      if (!mappingInputValue.value.trim()) return
      
      // 支持逗号分隔的值
      const values = mappingInputValue.value.split(',').map(v => v.trim()).filter(v => v)
      
      for (const value of values) {
        if (value && !formData.mappingValues.includes(value)) {
          formData.mappingValues.push(value)
        }
      }
      
      mappingInputValue.value = ''
    }
    
    const handleRemoveMapping = (index) => {
      formData.mappingValues.splice(index, 1)
    }
    

    const showAddDialog = () => {
      isEdit.value = false
      resetForm()
      dialogVisible.value = true
    }

    const handleEdit = async (row) => {
      isEdit.value = true
      Object.assign(formData, {
        id: row.id,
        module_key: row.module_key,
        name: isZhCN.value ? row.name_zh : row.name_en,
        name_zh: row.name_zh,
        name_en: row.name_en,
        description: row.description || '',
        sort_order: row.sort_order ?? 0,
        is_active: !!row.is_active,
        mappingValues: []
      })
      
      // 加载映射值
      try {
        const resp = await api.faultCaseModules.getMappings(row.id)
        if (resp.data?.success && resp.data.mappings) {
          formData.mappingValues = resp.data.mappings.map(m => m.source_value)
        }
      } catch (e) {
        console.error('加载映射失败:', e)
      }
      
      dialogVisible.value = true
    }

    // 使用删除确认 composable pattern
    const { confirmDelete } = useDeleteConfirm()

    const handleDelete = async (row) => {
      try {
        const confirmed = await confirmDelete(row, {
          message: t('configManagement.modules.deleteConfirm'),
          title: t('shared.warning')
        })

        if (!confirmed) return

        const resp = await api.faultCaseModules.delete(row.id)
        if (resp.data?.success) {
          ElMessage.success(t('shared.messages.deleteSuccess'))
          fetchModules()
        } else {
          ElMessage.error(resp.data?.message || t('shared.messages.deleteFailed'))
        }
      } catch (e) {
        ElMessage.error(t('shared.messages.deleteFailed'))
      }
    }

    const handleSubmit = async () => {
      try {
        await formRef.value.validate()
        
        // 更新name_zh和name_en
        if (isZhCN.value) {
          formData.name_zh = formData.name
        } else {
          formData.name_en = formData.name
        }
        
        const payload = {
          module_key: formData.module_key,
          name_zh: formData.name_zh,
          name_en: formData.name_en,
          description: formData.description,
          sort_order: formData.sort_order,
          is_active: formData.is_active
        }
        
        let resp
        if (isEdit.value) {
          resp = await api.faultCaseModules.update(formData.id, payload)
        } else {
          resp = await api.faultCaseModules.create(payload)
        }
        
        if (resp.data?.success) {
          const itemId = isEdit.value ? formData.id : resp.data.module?.id
          
          // 保存映射值
          if (itemId && formData.mappingValues.length > 0) {
            try {
              // 先获取现有映射
              const mappingsResp = await api.faultCaseModules.getMappings(itemId)
              const existingMappings = mappingsResp.data?.success ? mappingsResp.data.mappings || [] : []
              
              // 删除不在新列表中的映射
              for (const mapping of existingMappings) {
                if (!formData.mappingValues.includes(mapping.source_value)) {
                  await api.faultCaseModules.deleteMapping(mapping.id)
                }
              }
              
              // 添加新的映射
              for (const value of formData.mappingValues) {
                if (!existingMappings.find(m => m.source_value === value)) {
                  await api.faultCaseModules.createMapping(itemId, {
                    source_field: 'default',
                    source_value: value,
                    sort_order: 0,
                    is_active: true
                  })
                }
              }
            } catch (e) {
              console.error('保存映射失败:', e)
            }
          }
          
          ElMessage.success(isEdit.value ? t('shared.messages.updateSuccess') : t('shared.messages.addSuccess'))
          dialogVisible.value = false
          fetchModules()
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


    onMounted(() => fetchModules())

    return {
      loading,
      modules,
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
      mappingInputValue,
      handleAddMapping,
      handleRemoveMapping
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

.table-container :deep(.el-table__inner) {
  width: 100% !important;
}

.table-container :deep(.el-table__header-wrapper),
.table-container :deep(.el-table__body-wrapper) {
  width: 100% !important;
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
  border-top: 1px solid var(--gray-200);
  background: var(--black-white-white);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-header {
  margin-bottom: 16px;
}

.dialog-title-wrapper {
  margin-bottom: 8px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--slate-900);
  margin: 0 0 4px 0;
}

.dialog-subtitle {
  font-size: 14px;
  color: var(--slate-600);
  margin: 0;
}

.mapping-fields-container {
  width: 100%;
}

.mapping-input-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.mapping-input {
  flex: 1;
}

.mapping-add-btn {
  flex-shrink: 0;
  min-width: 40px;
}

.mapping-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.mapping-chip {
  background-color: var(--slate-100);
  color: var(--slate-900);
  border-color: var(--slate-300);
}

.mapping-tip {
  font-size: 12px;
  color: var(--slate-600);
  margin: 0;
}

.mapping-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
  line-height: 1.5;
  padding: 4px 0;
}

.mapping-tag {
  margin: 0 !important;
  background-color: var(--tag-bg) !important;
  color: var(--tag-text) !important;
  border-color: var(--tag-border) !important;
  border-width: 1px;
  border-style: solid;
  font-size: 11px; /* 字体小一号：从12px改为11px */
  padding: 3px 10px !important; /* 减小高度：从5px改为3px，左右从12px改为10px */
  border-radius: var(--radius-xs);
  flex: 0 0 auto; /* 根据内容自适应宽度 */
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  line-height: 1.3; /* 减小行高，进一步降低高度 */
  height: auto;
}

.mapping-empty {
  color: var(--slate-600);
  font-size: 14px;
}
</style>


