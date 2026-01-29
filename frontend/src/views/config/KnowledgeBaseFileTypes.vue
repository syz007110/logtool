<template>
  <div class="dict-container">
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('configManagement.kbFileTypes.searchPlaceholder')"
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
          {{ $t('configManagement.kbFileTypes.add') }}
        </el-button>
      </div>
    </div>

    <!-- 表格容器 - 固定表头 -->
    <div class="table-container">
      <el-table
        :data="items"
        :loading="loading"
        :height="tableHeight"
        style="width: 100%"
        v-loading="loading"
        table-layout="auto"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="code" :label="$t('configManagement.kbFileTypes.columns.code')" width="200" />
        <el-table-column v-if="isZhCN" prop="name_zh" :label="$t('analysisCategories.name')" min-width="200" />
        <el-table-column v-if="isEnUS" prop="name_en" :label="$t('analysisCategories.name')" min-width="200" />
        <el-table-column prop="sort_order" :label="$t('analysisCategories.sortOrder')" width="100" />
        <el-table-column prop="enabled" :label="$t('analysisCategories.isActive')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'danger'">
              {{ row.enabled ? $t('analysisCategories.statusActive') : $t('analysisCategories.statusInactive') }}
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

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? $t('configManagement.common.editItem') : $t('configManagement.kbFileTypes.add')"
      width="600px"
      append-to-body
      :z-index="3000"
    >
      <template #header>
        <div class="dialog-header">
          <div class="dialog-title-wrapper">
            <h3 class="dialog-title">{{ isEdit ? $t('configManagement.common.editItem') : $t('configManagement.kbFileTypes.add') }}</h3>
            <p class="dialog-subtitle">{{ $t('configManagement.kbFileTypes.subtitle') }}</p>
          </div>
        </div>
      </template>

      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="120px">
        <el-form-item :label="$t('configManagement.kbFileTypes.form.code')" prop="code">
          <el-input
            v-model="formData.code"
            :disabled="isEdit"
            :placeholder="$t('configManagement.kbFileTypes.form.codePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.nameZh')" prop="name_zh">
          <el-input v-model="formData.name_zh" :placeholder="$t('configManagement.common.nameZh')" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.nameEn')" prop="name_en">
          <el-input v-model="formData.name_en" :placeholder="$t('configManagement.common.nameEn')" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.sortOrder')" prop="sort_order">
          <el-input-number v-model="formData.sort_order" :min="0" :max="999" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('configManagement.common.isActive')" prop="enabled">
          <el-switch v-model="formData.enabled" />
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import { Plus, Search } from '@element-plus/icons-vue'
import { getTableHeight } from '@/utils/tableHeight'
import { useI18n } from 'vue-i18n'
import api from '../../api'

export default {
  name: 'KnowledgeBaseFileTypes',
  components: { Plus, Search },
  setup() {
    const { t, locale } = useI18n()
    const loading = ref(false)
    const items = ref([])
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
      code: '',
      name_zh: '',
      name_en: '',
      sort_order: 0,
      enabled: true
    })

    const formRules = computed(() => ({
      code: [
        { required: true, message: t('configManagement.kbFileTypes.validation.codeRequired'), trigger: 'blur' },
        { pattern: /^[A-Za-z0-9_-]+$/, message: t('configManagement.kbFileTypes.validation.codePattern'), trigger: 'blur' }
      ],
      name_zh: [
        { required: true, message: t('configManagement.kbFileTypes.validation.nameZhRequired'), trigger: 'blur' }
      ],
      name_en: [
        { required: true, message: t('configManagement.kbFileTypes.validation.nameEnRequired'), trigger: 'blur' }
      ]
    }))

    const resetForm = () => {
      formData.id = null
      formData.code = ''
      formData.name_zh = ''
      formData.name_en = ''
      formData.sort_order = 0
      formData.enabled = true
    }

    const fetchItems = async () => {
      loading.value = true
      try {
        const params = {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        }
        const resp = await api.kb.listFileTypes(params)
        if (resp.data?.success) {
          items.value = resp.data.data || []
          total.value = resp.data.total || 0
        } else {
          items.value = []
          total.value = 0
        }
      } catch (e) {
        items.value = []
        total.value = 0
        ElMessage.error(t('configManagement.kbFileTypes.fetchFailed'))
      } finally {
        loading.value = false
      }
    }

    const handleSearch = () => {
      currentPage.value = 1
      fetchItems()
    }

    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      fetchItems()
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
      fetchItems()
    }

    const showAddDialog = () => {
      isEdit.value = false
      resetForm()
      dialogVisible.value = true
    }

    const handleEdit = (row) => {
      isEdit.value = true
      formData.id = row.id
      formData.code = row.code
      formData.name_zh = row.name_zh || ''
      formData.name_en = row.name_en || ''
      formData.sort_order = row.sort_order ?? 0
      formData.enabled = row.enabled !== false
      dialogVisible.value = true
    }

    const handleCancel = () => {
      dialogVisible.value = false
    }

    const { confirmDelete } = useDeleteConfirm()

    const handleDelete = async (row) => {
      try {
        const confirmed = await confirmDelete(row, {
          message: t('configManagement.kbFileTypes.deleteConfirm'),
          title: t('shared.messages.deleteConfirmTitle')
        })
        if (!confirmed) return
        await api.kb.deleteFileType(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        await fetchItems()
      } catch (e) {
        if (e !== 'cancel') ElMessage.error(t('shared.messages.deleteFailed'))
      }
    }

    const handleSubmit = async () => {
      try {
        await formRef.value?.validate?.()
        const payload = {
          code: formData.code,
          name_zh: formData.name_zh,
          name_en: formData.name_en,
          sort_order: formData.sort_order,
          enabled: formData.enabled
        }
        if (isEdit.value && formData.id) {
          await api.kb.updateFileType(formData.id, payload)
          ElMessage.success(t('shared.messages.updateSuccess'))
        } else {
          await api.kb.createFileType(payload)
          ElMessage.success(t('shared.messages.createSuccess'))
        }
        dialogVisible.value = false
        await fetchItems()
      } catch (e) {
        if (e?.message !== 'cancel') ElMessage.error(t('configManagement.kbFileTypes.submitFailed'))
      }
    }

    onMounted(() => {
      fetchItems()
    })

      return {
      loading,
      searchQuery,
      items,
      tableHeight,
      currentPage,
      pageSize,
      total,
      dialogVisible,
      isEdit,
      formRef,
      formData,
      formRules,
      isZhCN,
      isEnUS,
      handleSearch,
      handleSizeChange,
      handleCurrentChange,
      showAddDialog,
      handleEdit,
      handleDelete,
      handleCancel,
      handleSubmit
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
  padding: 8px 0 12px 0;
  margin-top: auto;
  border-top: 1px solid var(--gray-200);
  background: var(--black-white-white);
}

.operation-buttons {
  display: flex;
  gap: 8px;
}

.btn-danger-text {
  color: var(--el-color-danger);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

