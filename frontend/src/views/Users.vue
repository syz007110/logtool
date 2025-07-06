<template>
  <div class="users-container">
    <!-- 操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          placeholder="搜索用户..."
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
        <el-button type="primary" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          添加用户
        </el-button>
      </div>
    </div>
    
    <!-- 用户列表 -->
    <el-card class="list-card">
      <el-table
        :data="users"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="username" label="用户名" width="150" />
        <el-table-column prop="email" label="邮箱" width="200" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="getRoleType(row.role)">
              {{ getRoleText(row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
              {{ row.status === 'active' ? '激活' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button 
              size="small" 
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button 
              size="small" 
              type="warning"
              @click="handleAssignRole(row)"
            >
              分配角色
            </el-button>
            <el-button 
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
    
    <!-- 添加/编辑用户对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingUser ? '编辑用户' : '添加用户'"
      width="500px"
    >
      <el-form
        ref="userForm"
        :model="userForm"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" :disabled="!!editingUser" />
        </el-form-item>
        
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" />
        </el-form-item>
        
        <el-form-item v-if="!editingUser" label="密码" prop="password">
          <el-input v-model="userForm.password" type="password" show-password />
        </el-form-item>
        
        <el-form-item label="状态" prop="status">
          <el-select v-model="userForm.status" placeholder="选择状态">
            <el-option label="激活" value="active" />
            <el-option label="禁用" value="inactive" />
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
    
    <!-- 分配角色对话框 -->
    <el-dialog
      v-model="showRoleDialog"
      title="分配角色"
      width="400px"
    >
      <el-form label-width="100px">
        <el-form-item label="用户">
          <span>{{ selectedUser?.username }}</span>
        </el-form-item>
        
        <el-form-item label="角色">
          <el-select v-model="selectedRole" placeholder="选择角色">
            <el-option
              v-for="role in roles"
              :key="role.id"
              :label="getRoleText(role.name)"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showRoleDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSaveRole" :loading="savingRole">
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
  name: 'Users',
  setup() {
    const store = useStore()
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    const savingRole = ref(false)
    const showAddDialog = ref(false)
    const showRoleDialog = ref(false)
    const editingUser = ref(null)
    const selectedUser = ref(null)
    const searchQuery = ref('')
    const currentPage = ref(1)
    const pageSize = ref(20)
    const selectedRole = ref('')
    
    const userForm = reactive({
      username: '',
      email: '',
      password: '',
      status: 'active'
    })
    
    const rules = {
      username: [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
      ],
      email: [
        { required: true, message: '请输入邮箱', trigger: 'blur' },
        { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
      ],
      password: [
        { required: true, message: '请输入密码', trigger: 'blur' },
        { min: 6, message: '密码长度不能少于 6 个字符', trigger: 'blur' }
      ],
      status: [
        { required: true, message: '请选择状态', trigger: 'change' }
      ]
    }
    
    // 计算属性
    const users = computed(() => store.getters['users/usersList'])
    const roles = computed(() => store.getters['users/rolesList'])
    const total = computed(() => store.getters['users/totalCount'])
    
    // 方法
    const loadUsers = async () => {
      try {
        loading.value = true
        await store.dispatch('users/fetchUsers', {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        })
      } catch (error) {
        ElMessage.error('加载用户失败')
      } finally {
        loading.value = false
      }
    }
    
    const loadRoles = async () => {
      try {
        await store.dispatch('users/fetchRoles')
      } catch (error) {
        ElMessage.error('加载角色失败')
      }
    }
    
    const handleSearch = () => {
      currentPage.value = 1
      loadUsers()
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadUsers()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadUsers()
    }
    
    const resetForm = () => {
      Object.assign(userForm, {
        username: '',
        email: '',
        password: '',
        status: 'active'
      })
      editingUser.value = null
    }
    
    const handleEdit = (row) => {
      editingUser.value = row
      Object.assign(userForm, {
        username: row.username,
        email: row.email,
        status: row.status
      })
      showAddDialog.value = true
    }
    
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm('确定要删除这个用户吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })
        
        await store.dispatch('users/deleteUser', row.id)
        ElMessage.success('删除成功')
        loadUsers()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
      }
    }
    
    const handleSave = async () => {
      try {
        saving.value = true
        
        if (editingUser.value) {
          await store.dispatch('users/updateUser', {
            id: editingUser.value.id,
            data: userForm
          })
          ElMessage.success('更新成功')
        } else {
          await store.dispatch('users/createUser', userForm)
          ElMessage.success('添加成功')
        }
        
        showAddDialog.value = false
        resetForm()
        loadUsers()
      } catch (error) {
        ElMessage.error('保存失败')
      } finally {
        saving.value = false
      }
    }
    
    const handleAssignRole = (row) => {
      selectedUser.value = row
      selectedRole.value = row.roleId || ''
      showRoleDialog.value = true
    }
    
    const handleSaveRole = async () => {
      try {
        savingRole.value = true
        await store.dispatch('users/assignUserRole', selectedUser.value.id, selectedRole.value)
        ElMessage.success('角色分配成功')
        showRoleDialog.value = false
        loadUsers()
      } catch (error) {
        ElMessage.error('角色分配失败')
      } finally {
        savingRole.value = false
      }
    }
    
    const getRoleType = (role) => {
      const typeMap = {
        admin: 'danger',
        expert: 'warning',
        user: 'info'
      }
      return typeMap[role] || 'info'
    }
    
    const getRoleText = (role) => {
      const textMap = {
        admin: '管理员',
        expert: '专家用户',
        user: '普通用户'
      }
      return textMap[role] || role
    }
    
    const formatDate = (dateString) => {
      if (!dateString) return '-'
      return new Date(dateString).toLocaleString('zh-CN')
    }
    
    // 生命周期
    onMounted(() => {
      loadUsers()
      loadRoles()
    })
    
    return {
      loading,
      saving,
      savingRole,
      showAddDialog,
      showRoleDialog,
      editingUser,
      selectedUser,
      searchQuery,
      currentPage,
      pageSize,
      selectedRole,
      userForm,
      rules,
      users,
      roles,
      total,
      handleSearch,
      handleSizeChange,
      handleCurrentChange,
      handleEdit,
      handleDelete,
      handleSave,
      handleAssignRole,
      handleSaveRole,
      getRoleType,
      getRoleText,
      formatDate
    }
  }
}
</script>

<style scoped>
.users-container {
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