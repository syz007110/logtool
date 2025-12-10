<template>
  <div class="users-container">
    <!-- 操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('users.searchPlaceholder')"
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
        <el-button class="btn-primary" @click="showAddDialog = true" v-if="$store.getters['auth/hasPermission']('user:create')">
          <el-icon><Plus /></el-icon>
          {{ $t('users.addUser') }}
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
        <el-table-column prop="username" :label="$t('users.username')" width="120" />
        <el-table-column prop="email" :label="$t('users.email')" width="220" />
        <el-table-column prop="role" :label="$t('users.role')" width="100">
          <template #default="{ row }">
            <el-tag>{{ getRoleText(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" :label="$t('users.status')" width="90">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'">
              {{ row.is_active ? $t('users.statusActive') : $t('users.statusInactive') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" :label="$t('users.createTime')" width="200" />
        <el-table-column :label="$t('shared.operation')" fixed="right" width="160">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button @click="handleEdit(row)" class="btn-text btn-sm" v-if="$store.getters['auth/hasPermission']('user:update')">{{ $t('shared.edit') }}</el-button>
              
              <el-dropdown 
                trigger="click" 
                placement="bottom-end"
                @command="handleMoreAction"
              >
                <el-button class="btn-text btn-sm">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item 
                      :command="{ action: 'resetPassword', row }"
                      v-if="$store.getters['auth/hasPermission']('user:update')"
                    >
                      {{ $t('users.resetPassword') }}
                    </el-dropdown-item>
                    
                    <el-dropdown-item 
                      :command="{ action: 'delete', row }"
                      v-if="$store.getters['auth/hasPermission']('user:delete')"
                      divided
                    >
                      <span style="color: var(--el-color-danger)">{{ $t('shared.delete') }}</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
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
      :title="editingUser ? $t('users.editUser') : $t('users.addUser')"
      width="500px"
    >
      <el-form
        ref="userFormRef"
        :model="userForm"
        :rules="rules"
        label-width="130px"
      >
        <el-form-item :label="$t('users.username')" prop="username">
          <el-input v-model="userForm.username" :disabled="!!editingUser" />
        </el-form-item>
        
        <el-form-item :label="$t('users.email')" prop="email">
          <el-input v-model="userForm.email" />
        </el-form-item>
        <el-form-item :label="$t('users.role')" prop="role">
          <el-select v-model="userForm.role" :placeholder="$t('users.selectRole')" v-if="roles.length">
            <el-option v-for="role in roles" :key="role.id" :label="getRoleText(role.name)" :value="role.name" />
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="!editingUser" :label="$t('users.password')" prop="password">
          <el-input v-model="userForm.password" type="password" show-password style="max-width: 100%" />
        </el-form-item>
        
        <el-form-item :label="$t('users.status')" prop="status">
          <el-select v-model="userForm.status" :placeholder="$t('users.selectStatus')">
            <el-option :label="$t('users.statusActive')" value="active" />
            <el-option :label="$t('users.statusInactive')" value="inactive" />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button class="btn-secondary" @click="showAddDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button class="btn-primary" @click="handleSave" :loading="saving">
          {{ $t('shared.save') }}
        </el-button>
      </template>
    </el-dialog>
    
    

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showEditDialog" :title="$t('users.editUser')" width="400px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item :label="$t('users.email')">
          <el-input v-model="editForm.email" />
        </el-form-item>
        <el-form-item :label="$t('users.role')">
          <el-select v-model="editForm.role">
            <el-option v-for="role in roles" :key="role.id" :label="getRoleText(role.name)" :value="role.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('users.status')">
          <el-switch v-model="editForm.is_active" :active-text="$t('users.statusActive')" :inactive-text="$t('users.statusInactive')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-secondary" @click="showEditDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button class="btn-primary" @click="handleSaveEdit">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="showResetPasswordDialog"
      :title="$t('users.resetPasswordTitle')"
      width="400px"
    >
      <el-form :model="resetPasswordForm" :rules="resetPasswordRules" ref="resetPasswordFormRef" label-width="130px">
        <el-form-item :label="$t('users.oldPassword')" prop="oldPassword">
          <el-input v-model="resetPasswordForm.oldPassword" type="password" show-password style="max-width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('users.newPassword')" prop="newPassword">
          <el-input v-model="resetPasswordForm.newPassword" type="password" show-password style="max-width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('users.confirmNewPassword')" prop="confirmPassword">
          <el-input v-model="resetPasswordForm.confirmPassword" type="password" show-password style="max-width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-secondary" @click="showResetPasswordDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button class="btn-primary" @click="handleResetPassword" :loading="resettingPassword">{{ $t('shared.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

export default {
  name: 'Users',
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t, locale } = useI18n()
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    
    const showAddDialog = ref(false)
    const editingUser = ref(null)
    const searchQuery = ref('')
    const currentPage = ref(1)
    const pageSize = ref(20)
    
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
    
    const rules = computed(() => ({
      username: [
        { required: true, message: t('users.validation.usernameRequired'), trigger: 'blur' },
        { min: 3, max: 20, message: t('users.validation.usernameLength'), trigger: 'blur' }
      ],
      email: [
        { type: 'email', message: t('users.validation.emailFormat'), trigger: 'blur' }
      ],
      password: editingUser.value ? [] : [
        { required: true, message: t('users.validation.passwordRequired'), trigger: 'blur' },
        { min: 6, message: t('users.validation.passwordMinLength'), trigger: 'blur' }
      ],
      status: [
        { required: true, message: t('users.validation.statusRequired'), trigger: 'change' }
      ],
      role: [
        { required: true, message: t('users.validation.roleRequired'), trigger: 'change' }
      ]
    }))
    
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
        ElMessage.error(t('users.loadFailed'))
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
        ElMessage.error(t('users.loadRolesFailed'))
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
        await ElMessageBox.confirm(t('users.deleteConfirm'), t('shared.info'), {
          confirmButtonText: t('shared.confirm'),
          cancelButtonText: t('shared.cancel'),
          type: 'warning'
        })
        
        await store.dispatch('users/deleteUser', row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadUsers()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error(t('shared.messages.deleteFailed'))
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
          ElMessage.success(t('shared.messages.updateSuccess'))
        } else {
          await store.dispatch('users/createUser', data)
          ElMessage.success(t('shared.messages.createSuccess'))
        }
        showAddDialog.value = false
        resetForm()
        loadUsers()
      } catch (error) {
        ElMessage.error(t('shared.messages.saveFailed'))
      } finally {
        saving.value = false
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
      const roleMap = {
        admin: t('users.roleAdmin'),
        expert: t('users.roleExpert'),
        user: t('users.roleUser')
      }
      return roleMap[role] || role
    }
    
    const formatDate = (dateString) => {
      if (!dateString) return '-'
      const localeStr = locale.value === 'en' ? 'en-US' : 'zh-CN'
      return new Date(dateString).toLocaleString(localeStr)
    }
    
    // 生命周期
    onMounted(() => {
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
    const resetPasswordRules = computed(() => ({
      oldPassword: [
        { required: true, message: t('users.validation.oldPasswordRequired'), trigger: 'blur' }
      ],
      newPassword: [
        { required: true, message: t('users.validation.newPasswordRequired'), trigger: 'blur' },
        { min: 6, message: t('users.validation.passwordMinLength'), trigger: 'blur' }
      ],
      confirmPassword: [
        { required: true, message: t('users.validation.confirmPasswordRequired'), trigger: 'blur' },
        { validator: (rule, value, callback) => {
            if (value !== resetPasswordForm.newPassword) {
              callback(new Error(t('users.validation.passwordMismatch')))
            } else {
              callback()
            }
          }, trigger: 'blur' }
      ]
    }))

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
        ElMessage.success(t('users.resetPasswordSuccess'))
        showResetPasswordDialog.value = false
        loadUsers()
      } catch (error) {
        ElMessage.error(error.response?.data?.message || t('users.resetPasswordFailed'))
      } finally {
        resettingPassword.value = false
      }
    }
    
    // 处理更多操作下拉菜单
    const handleMoreAction = (command) => {
      const { action, row } = command
      switch (action) {
        case 'resetPassword':
          openResetPassword(row)
          break
        
        case 'delete':
          handleDelete(row)
          break
        default:
          console.warn('Unknown action:', action)
      }
    }
    
    return {
      loading,
      saving,
      showAddDialog,
      editingUser,
      searchQuery,
      currentPage,
      pageSize,
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
      handleResetPassword,
      handleMoreAction
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
  align-items: center;
  gap: 8px;
}
</style> 