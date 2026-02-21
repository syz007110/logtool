<template>
  <div class="analysis-categories-container">
    <!-- 操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('analysisCategories.searchPlaceholder')"
          style="width: 300px"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
      
      <div class="action-section">
        <el-button type="primary" @click="showAddDialog" v-if="$store.getters['auth/hasPermission']('loglevel:manage')">
          <el-icon><Plus /></el-icon>
          {{ $t('analysisCategories.addCategory') }}
        </el-button>
      </div>
    </div>

    <!-- 分析等级列表 -->
    <!-- 表格容器 - 固定表头 -->
    <div class="table-container">
        <el-table
          :data="categories"
          :loading="loading"
          :height="tableHeight"
          style="width: 100%"
          v-loading="loading"
        >
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="category_key" :label="$t('analysisCategories.categoryKey')" width="200" />
          <el-table-column v-if="isZhCN" prop="name_zh" :label="$t('shared.name')" min-width="200" />
          <el-table-column v-if="isEnUS" prop="name_en" :label="$t('shared.name')" min-width="200" />
          <el-table-column prop="sort_order" :label="$t('analysisCategories.sortOrder')" width="100" />
          <el-table-column prop="is_active" :label="$t('analysisCategories.isActive')" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'danger'">
                {{ row.is_active ? $t('analysisCategories.statusActive') : $t('analysisCategories.statusInactive') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('shared.operation')" fixed="right" width="180" align="left" v-if="$store.getters['auth/hasPermission']('loglevel:manage')">
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

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? $t('analysisCategories.editCategory') : $t('analysisCategories.addCategory')"
      width="600px"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
      >
        <el-form-item :label="$t('analysisCategories.categoryKeyLabel')" prop="category_key">
          <el-input
            v-model="formData.category_key"
            :placeholder="$t('analysisCategories.categoryKeyPlaceholder')"
            :disabled="isEdit"
          />
        </el-form-item>
        
        <el-form-item :label="$t('analysisCategories.nameZhLabel')" prop="name_zh">
          <el-input
            v-model="formData.name_zh"
            :placeholder="$t('analysisCategories.nameZhPlaceholder')"
          />
        </el-form-item>
        
        <el-form-item :label="$t('analysisCategories.nameEnLabel')" prop="name_en">
          <el-input
            v-model="formData.name_en"
            :placeholder="$t('analysisCategories.nameEnPlaceholder')"
          />
        </el-form-item>
        
        <el-form-item :label="$t('analysisCategories.sortOrderLabel')" prop="sort_order">
          <el-input-number
            v-model="formData.sort_order"
            :min="0"
            :max="999"
            style="width: 100%"
          />
        </el-form-item>
        
        <el-form-item :label="$t('analysisCategories.isActiveLabel')" prop="is_active">
          <el-switch v-model="formData.is_active" />
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
import api from '../api'

export default {
  name: 'AnalysisCategories',
  components: {
    Search,
    Plus
  },
  setup() {
    const { t, locale } = useI18n()
    const loading = ref(false)
    const categories = ref([])
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
    
    // 计算当前语言
    const currentLocale = computed(() => locale.value || 'zh-CN')
    const isZhCN = computed(() => currentLocale.value === 'zh-CN')
    const isEnUS = computed(() => currentLocale.value === 'en-US')
    
    const formData = reactive({
      id: null,
      category_key: '',
      name_zh: '',
      name_en: '',
      sort_order: 0,
      is_active: true
    })
    
    const formRules = {
      category_key: [
        { required: true, message: t('analysisCategories.validation.categoryKeyRequired'), trigger: 'blur' },
        { pattern: /^[A-Za-z_]+$/, message: t('analysisCategories.validation.categoryKeyPattern'), trigger: 'blur' }
      ],
      name_zh: [
        { required: true, message: t('analysisCategories.validation.nameZhRequired'), trigger: 'blur' }
      ],
      name_en: [
        { required: true, message: t('analysisCategories.validation.nameEnRequired'), trigger: 'blur' }
      ],
      sort_order: [
        { required: true, message: t('analysisCategories.validation.sortOrderRequired'), trigger: 'blur' }
      ]
    }
    
    // 过滤后的分析等级列表
    
    // 搜索处理
    const handleSearch = () => {
      currentPage.value = 1
      fetchCategories()
    }

    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      fetchCategories()
    }

    const handleCurrentChange = (page) => {
      currentPage.value = page
      fetchCategories()
    }
    
    // 获取分析等级列表
    const fetchCategories = async () => {
      loading.value = true
      try {
        const params = {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        }
        const response = await api.analysisCategories.getList(params)
        if (response.data.success) {
          categories.value = response.data.categories || []
          total.value = response.data.total || 0
        }
      } catch (error) {
        console.error('获取分析等级列表失败:', error)
        ElMessage.error(t('analysisCategories.fetchFailed'))
      } finally {
        loading.value = false
      }
    }
    
    // 显示添加对话框
    const showAddDialog = () => {
      isEdit.value = false
      resetForm()
      dialogVisible.value = true
    }
    
    // 编辑
    const handleEdit = (record) => {
      isEdit.value = true
      Object.assign(formData, {
        id: record.id,
        category_key: record.category_key,
        name_zh: record.name_zh,
        name_en: record.name_en,
        sort_order: record.sort_order,
        is_active: record.is_active
      })
      dialogVisible.value = true
    }
    
    // 使用删除确认 composable pattern
    const { confirmDelete } = useDeleteConfirm()

    // 删除
    const handleDelete = async (record) => {
      try {
        const confirmed = await confirmDelete(record, {
          message: t('analysisCategories.deleteConfirm'),
          title: t('shared.warning')
        })

        if (!confirmed) return

        const response = await api.analysisCategories.delete(record.id)
        if (response.data.success) {
          ElMessage.success(t('shared.messages.deleteSuccess'))
          fetchCategories()
        } else {
          ElMessage.error(response.data.message || t('shared.messages.deleteFailed'))
        }
      } catch (error) {
        console.error('删除失败:', error)
        ElMessage.error(t('shared.messages.deleteFailed'))
      }
    }
    
    // 提交表单
    const handleSubmit = async () => {
      try {
        await formRef.value.validate()
        
        const data = {
          category_key: formData.category_key,
          name_zh: formData.name_zh,
          name_en: formData.name_en,
          sort_order: formData.sort_order,
          is_active: formData.is_active
        }
        
        let response
        if (isEdit.value) {
          response = await api.analysisCategories.update(formData.id, data)
        } else {
          response = await api.analysisCategories.create(data)
        }
        
        if (response.data.success) {
          ElMessage.success(isEdit.value ? t('shared.messages.updateSuccess') : t('shared.messages.addSuccess'))
          dialogVisible.value = false
          fetchCategories()
        } else {
          ElMessage.error(response.data.message || (isEdit.value ? t('analysisCategories.editFailed') : t('analysisCategories.addFailed')))
        }
      } catch (error) {
        if (error?.message === 'Validation failed') {
          // 表单验证失败
          return
        }
        console.error('提交失败:', error)
        ElMessage.error(t('analysisCategories.submitFailed'))
      }
    }
    
    // 取消
    const handleCancel = () => {
      dialogVisible.value = false
      resetForm()
    }
    
    // 重置表单
    const resetForm = () => {
      Object.assign(formData, {
        id: null,
        category_key: '',
        name_zh: '',
        name_en: '',
        sort_order: 0,
        is_active: true
      })
      formRef.value?.resetFields()
    }
    
    // 页面加载时获取数据
    onMounted(() => {
      fetchCategories()
    })
    
    return {
      t,
      locale: currentLocale,
      isZhCN,
      isEnUS,
      loading,
      categories,
      searchQuery,
      dialogVisible,
      isEdit,
      formRef,
      formData,
      formRules,
      currentPage,
      pageSize,
      total,
      handleSearch,
      handleSizeChange,
      handleCurrentChange,
      showAddDialog,
      handleEdit,
      handleDelete,
      handleSubmit,
      handleCancel,
      tableHeight
    }
  }
}
</script>

<style scoped>
.analysis-categories-container {
  padding: 20px;
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

.search-section {
  display: flex;
  gap: 10px;
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
</style>
