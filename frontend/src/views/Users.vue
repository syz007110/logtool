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
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="email" label="邮箱" width="180" />
        <el-table-column prop="role" label="账户类型" width="100">
          <template #default="{ row }">
            <el-tag>{{ getRoleText(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="是否启用" width="90">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'">
              {{ row.is_active ? '激活' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="注册时间" width="150" />
        <el-table-column label="操作" fixed="right" width="260">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button @click="handleEdit(row)">编辑</el-button>
              <el-button @click="openResetPassword(row)">重置密码</el-button>
              <el-button @click="handleDelete(row)" type="danger">删除</el-button>
            </div>
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
        ref="userFormRef"
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
        <el-form-item label="账户类型" prop="role">
          <el-select v-model="userForm.role" placeholder="请选择账户类型" v-if="roles.length">
            <el-option v-for="role in roles" :key="role.id" :label="getRoleText(role.name)" :value="role.name" />
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="!editingUser" label="密码" prop="password">
          <el-input v-model="userForm.password" type="password" show-password />
        </el-form-item>
        
        <el-form-item v-if="editingUser" label="新密码" prop="password">
          <el-input v-model="userForm.password" type="password" show-password placeholder="如需修改请输入新密码" />
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

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showEditDialog" title="编辑用户" width="400px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="邮箱">
          <el-input v-model="editForm.email" />
        </el-form-item>
        <el-form-item label="账户类型">
          <el-select v-model="editForm.role">
            <el-option v-for="role in roles" :key="role.id" :label="getRoleText(role.name)" :value="role.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="editForm.is_active" active-text="激活" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSaveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="showResetPasswordDialog"
      title="重置密码"
      width="400px"
    >
      <el-form :model="resetPasswordForm" :rules="resetPasswordRules" ref="resetPasswordFormRef" label-width="100px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="resetPasswordForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="resetPasswordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="resetPasswordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResetPasswordDialog = false">取消</el-button>
        <el-button type="primary" @click="handleResetPassword" :loading="resettingPassword">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

export default {
  name: 'Users',
  setup() {
    const store = useStore()
    const router = useRouter()
    
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
    const showEditDialog = ref(false)
    let editUserId = null

    const getDefaultUserForm = () => ({
      username: '',
      email: '',
      password: '',
      status: 'active',
      role: ''
    })
    const userForm = ref(getDefaultUserForm())
    
    const rules = {
      username: [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
      ],
      email: [
        { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
      ],
      password: [
        { required: true, message: '请输入密码', trigger: 'blur' },
        { min: 6, message: '密码长度不能少于 6 个字符', trigger: 'blur' }
      ],
      status: [
        { required: true, message: '请选择状态', trigger: 'change' }
      ],
      role: [
        { required: true, message: '请选择账户类型', trigger: 'change' }
      ]
    }
    
    // 计算属性
    const users = computed(() => store.getters['users/usersList'])
    const roles = ref([])
    const total = computed(() => store.getters['users/totalCount'])
    const userRole = computed(() => store.getters['auth/userRole'])

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
        const res = await store.dispatch('users/fetchRoles')
        // 直接赋值，避免反复计算
        roles.value = store.getters['users/rolesList']
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
      userForm.value = getDefaultUserForm()
      editingUser.value = null
    }
    
    const handleEdit = (row) => {
      editingUser.value = row
      userForm.value = getDefaultUserForm()
      userForm.value.username = row.username
      userForm.value.email = row.email
      userForm.value.status = row.status
      userForm.value.role = row.role // 编辑时也带上角色
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
        const data = { ...userForm.value }
        if (editingUser.value && !userForm.value.password) {
          delete data.password // 编辑时未填写新密码则不传
        }
        // 账户类型字段处理
        if (data.role) {
          // 查找对应角色id
          const selectedRole = roles.value.find(r => r.name === data.role)
          if (selectedRole) {
            data.roles = [selectedRole.id]
          }
          delete data.role
        }
        if (editingUser.value) {
          await store.dispatch('users/updateUser', {
            id: editingUser.value.id,
            data
          })
          ElMessage.success('更新成功')
        } else {
          await store.dispatch('users/createUser', data)
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
      // 调试输出
      console.log('userRole in Users.vue:', userRole.value)
      if (userRole.value !== 'admin') {
        router.replace('/dashboard/account')
        return
      }
      loadUsers()
      loadRoles()
    })
    
    // data
    const showResetPasswordDialog = ref(false)
    const resetPasswordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
    const resettingPassword = ref(false)
    const resetPasswordFormRef = ref(null)
    let resetUserId = null

    // 校验规则
    const resetPasswordRules = {
      oldPassword: [
        { required: true, message: '请输入原密码', trigger: 'blur' }
      ],
      newPassword: [
        { required: true, message: '请输入新密码', trigger: 'blur' },
        { min: 6, message: '密码长度不能少于 6 个字符', trigger: 'blur' }
      ],
      confirmPassword: [
        { required: true, message: '请确认新密码', trigger: 'blur' },
        { validator: (rule, value, callback) => {
            if (value !== resetPasswordForm.newPassword) {
              callback(new Error('两次输入的新密码不一致'))
            } else {
              callback()
            }
          }, trigger: 'blur' }
      ]
    }

    // 打开重置密码弹窗
    const openResetPassword = (row) => {
      resetUserId = row.id
      resetPasswordForm.oldPassword = ''
      resetPasswordForm.newPassword = ''
      resetPasswordForm.confirmPassword = ''
      showResetPasswordDialog.value = true
    }

    // 重置密码逻辑
    const handleResetPassword = async () => {
      await resetPasswordFormRef.value.validate()
      resettingPassword.value = true
      try {
        await store.dispatch('users/updateUser', {
          id: resetUserId,
          data: {
            oldPassword: resetPasswordForm.oldPassword,
            password: resetPasswordForm.newPassword
          }
        })
        ElMessage.success('密码重置成功')
        showResetPasswordDialog.value = false
        loadUsers()
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '密码重置失败')
      } finally {
        resettingPassword.value = false
      }
    }
    
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
      formatDate,
      showEditDialog,
      showResetPasswordDialog,
      resetPasswordForm,
      resettingPassword,
      resetPasswordFormRef,
      resetPasswordRules,
      openResetPassword,
      handleResetPassword
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

.action-buttons {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}
</style> 