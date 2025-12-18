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
        <el-button class="btn-primary" @click="showAddDialog" v-if="$store.getters['auth/hasPermission']('loglevel:manage')">
          <el-icon><Plus /></el-icon>
          {{ $t('analysisCategories.addCategory') }}
        </el-button>
      </div>
    </div>

    <!-- 分析等级列表 -->
    <el-card class="list-card">
      <el-table
        :data="filteredCategories"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="category_key" :label="$t('analysisCategories.categoryKey')" width="200" />
        <el-table-column v-if="isZhCN" prop="name_zh" :label="$t('analysisCategories.name')" width="200" />
        <el-table-column v-if="isEnUS" prop="name_en" :label="$t('analysisCategories.name')" width="200" />
        <el-table-column prop="sort_order" :label="$t('analysisCategories.sortOrder')" width="100" />
        <el-table-column prop="is_active" :label="$t('analysisCategories.isActive')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'">
              {{ row.is_active ? $t('analysisCategories.statusActive') : $t('analysisCategories.statusInactive') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" fixed="right" width="180" v-if="$store.getters['auth/hasPermission']('loglevel:manage')">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button @click="handleEdit(row)" class="btn-text btn-sm">{{$t('shared.edit')}}</el-button>
              <el-button @click="handleDelete(row)" class="btn-text-danger btn-sm">{{$t('shared.delete')}}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

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
          <el-button class="btn-primary" @click="handleSubmit">{{ $t('shared.confirm') }}</el-button>
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
    const filteredCategories = computed(() => {
      if (!searchQuery.value) {
        return categories.value
      }
      const query = searchQuery.value.toLowerCase()
      return categories.value.filter(item =>
        item.category_key.toLowerCase().includes(query) ||
        item.name_zh.toLowerCase().includes(query) ||
        item.name_en.toLowerCase().includes(query)
      )
    })
    
    // 搜索处理
    const handleSearch = () => {
      // 搜索逻辑已在 computed 中实现
    }
    
    // 获取分析等级列表
    const fetchCategories = async () => {
      loading.value = true
      try {
        const response = await api.analysisCategories.getList()
        if (response.data.success) {
          categories.value = response.data.categories
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
    
    // 删除
    const handleDelete = async (record) => {
      try {
        await ElMessageBox.confirm(t('analysisCategories.deleteConfirm'), t('shared.warning'), {
          confirmButtonText: t('shared.confirm'),
          cancelButtonText: t('shared.cancel'),
          type: 'warning',
          confirmButtonClass: 'btn-primary-danger',
          cancelButtonClass: 'btn-secondary'
        })
        
        const response = await api.analysisCategories.delete(record.id)
        if (response.data.success) {
          ElMessage.success(t('shared.messages.deleteSuccess'))
          fetchCategories()
        } else {
          ElMessage.error(response.data.message || t('shared.messages.deleteFailed'))
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除失败:', error)
          ElMessage.error(t('shared.messages.deleteFailed'))
        }
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
      filteredCategories,
      dialogVisible,
      isEdit,
      formRef,
      formData,
      formRules,
      handleSearch,
      showAddDialog,
      handleEdit,
      handleDelete,
      handleSubmit,
      handleCancel
    }
  }
}
</script>

<style scoped>
.analysis-categories-container {
  padding: 20px;
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

.list-card {
  margin-bottom: 20px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
