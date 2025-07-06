<template>
  <div class="error-codes-container">
    <!-- 搜索和操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          placeholder="搜索故障码..."
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
        <el-button 
          v-if="canCreate"
          type="primary" 
          @click="showAddDialog = true"
        >
          <el-icon><Plus /></el-icon>
          添加故障码
        </el-button>
        
        <el-button 
          type="success" 
          @click="handleExport"
          :loading="exporting"
        >
          <el-icon><Download /></el-icon>
          导出XML
        </el-button>
      </div>
    </div>
    
    <!-- 故障码列表 -->
    <el-card class="list-card">
      <el-table
        :data="errorCodes"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="code" label="故障码" width="120" />
        <el-table-column prop="name" label="名称" width="200" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="severity" label="严重程度" width="100">
          <template #default="{ row }">
            <el-tag :type="getSeverityType(row.severity)">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button 
              v-if="canUpdate"
              size="small" 
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button 
              v-if="canDelete"
              size="small" 
              type="danger" 
              @click="handleDelete(row)"
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
    
    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingErrorCode ? '编辑故障码' : '添加故障码'"
      width="600px"
    >
      <el-form
        ref="errorCodeForm"
        :model="errorCodeForm"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="故障码" prop="code">
          <el-input v-model="errorCodeForm.code" />
        </el-form-item>
        
        <el-form-item label="名称" prop="name">
          <el-input v-model="errorCodeForm.name" />
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="errorCodeForm.description"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
        
        <el-form-item label="解决方案" prop="solution">
          <el-input
            v-model="errorCodeForm.solution"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
        
        <el-form-item label="分类" prop="category">
          <el-input v-model="errorCodeForm.category" />
        </el-form-item>
        
        <el-form-item label="严重程度" prop="severity">
          <el-select v-model="errorCodeForm.severity" placeholder="选择严重程度">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
            <el-option label="严重" value="critical" />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'

export default {
  name: 'ErrorCodes',
  setup() {
    const store = useStore()
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    const exporting = ref(false)
    const showAddDialog = ref(false)
    const editingErrorCode = ref(null)
    const searchQuery = ref('')
    const currentPage = ref(1)
    const pageSize = ref(20)
    
    const errorCodeForm = reactive({
      code: '',
      name: '',
      description: '',
      solution: '',
      category: '',
      severity: 'medium'
    })
    
    const rules = {
      code: [
        { required: true, message: '请输入故障码', trigger: 'blur' }
      ],
      name: [
        { required: true, message: '请输入名称', trigger: 'blur' }
      ],
      severity: [
        { required: true, message: '请选择严重程度', trigger: 'change' }
      ]
    }
    
    // 计算属性
    const errorCodes = computed(() => store.getters['errorCodes/errorCodesList'])
    const total = computed(() => store.getters['errorCodes/totalCount'])
    const canCreate = computed(() => store.getters.userRole === 'admin' || store.getters.userRole === 'expert')
    const canUpdate = computed(() => store.getters.userRole === 'admin' || store.getters.userRole === 'expert')
    const canDelete = computed(() => store.getters.userRole === 'admin' || store.getters.userRole === 'expert')
    
    // 方法
    const loadErrorCodes = async () => {
      try {
        loading.value = true
        await store.dispatch('errorCodes/fetchErrorCodes', {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        })
      } catch (error) {
        ElMessage.error('加载故障码失败')
      } finally {
        loading.value = false
      }
    }
    
    const handleSearch = () => {
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadErrorCodes()
    }
    
    const resetForm = () => {
      Object.assign(errorCodeForm, {
        code: '',
        name: '',
        description: '',
        solution: '',
        category: '',
        severity: 'medium'
      })
      editingErrorCode.value = null
    }
    
    const handleEdit = (row) => {
      editingErrorCode.value = row
      Object.assign(errorCodeForm, { ...row })
      showAddDialog.value = true
    }
    
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm('确定要删除这个故障码吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })
        
        await store.dispatch('errorCodes/deleteErrorCode', row.id)
        ElMessage.success('删除成功')
        loadErrorCodes()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
      }
    }
    
    const handleSave = async () => {
      try {
        saving.value = true
        
        if (editingErrorCode.value) {
          await store.dispatch('errorCodes/updateErrorCode', {
            id: editingErrorCode.value.id,
            data: errorCodeForm
          })
          ElMessage.success('更新成功')
        } else {
          await store.dispatch('errorCodes/createErrorCode', errorCodeForm)
          ElMessage.success('添加成功')
        }
        
        showAddDialog.value = false
        resetForm()
        loadErrorCodes()
      } catch (error) {
        ElMessage.error('保存失败')
      } finally {
        saving.value = false
      }
    }
    
    const handleExport = async () => {
      try {
        exporting.value = true
        const response = await store.dispatch('errorCodes/exportToXML', {
          search: searchQuery.value
        })
        
        // 创建下载链接
        const blob = new Blob([response.data], { type: 'application/xml' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'error_codes.xml'
        link.click()
        window.URL.revokeObjectURL(url)
        
        ElMessage.success('导出成功')
      } catch (error) {
        ElMessage.error('导出失败')
      } finally {
        exporting.value = false
      }
    }
    
    const getSeverityType = (severity) => {
      const typeMap = {
        low: 'info',
        medium: 'warning',
        high: 'danger',
        critical: 'danger'
      }
      return typeMap[severity] || 'info'
    }
    
    // 生命周期
    onMounted(() => {
      loadErrorCodes()
    })
    
    return {
      loading,
      saving,
      exporting,
      showAddDialog,
      editingErrorCode,
      searchQuery,
      currentPage,
      pageSize,
      errorCodeForm,
      rules,
      errorCodes,
      total,
      canCreate,
      canUpdate,
      canDelete,
      handleSearch,
      handleSizeChange,
      handleCurrentChange,
      handleEdit,
      handleDelete,
      handleSave,
      handleExport,
      getSeverityType
    }
  }
}
</script>

<style scoped>
.error-codes-container {
  height: 100%;
}

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

.action-section {
  display: flex;
  gap: 10px;
}

.list-card {
  margin-bottom: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style> 