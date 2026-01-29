<template>
  <div class="users-container">
    <!-- 统一卡片：包含操作栏和列表 -->
    <el-card class="main-card">
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
          <el-button type="primary" @click="showAddDialog = true" v-if="$store.getters['auth/hasPermission']('user:create')">
            <el-icon><Plus /></el-icon>
            {{ $t('users.addUser') }}
          </el-button>
        </div>
      </div>
      
      <!-- 用户列表 - 固定表头 -->
      <div class="table-container">
        <el-table
          :data="users"
          :loading="loading"
          :height="tableHeight"
          style="width: 100%"
          v-loading="loading"
        >
        <el-table-column prop="username" :label="$t('users.username')" width="120" />
        <el-table-column prop="email" :label="$t('users.email')" min-width="220" />
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
        <el-table-column prop="created_at" :label="$t('users.createTime')" min-width="200" />
        <el-table-column :label="$t('shared.operation')" fixed="right" width="160" align="left">
          <template #default="{ row }">
            <div class="operation-buttons">
              <el-button
                text
                size="small"
                @click="handleEdit(row)"
                v-if="$store.getters['auth/hasPermission']('user:update')"
                :aria-label="$t('shared.edit')"
                :title="$t('shared.edit')"
              >
                {{ $t('shared.edit') }}
              </el-button>
              
              <el-dropdown 
                trigger="click" 
                placement="bottom-end"
                @command="handleMoreAction"
              >
                <el-button text size="small">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item 
                      :command="{ action: 'resetPassword', row }"
                      v-if="$store.getters['auth/hasPermission']('user:update')"
                      class="dropdown-item-normal"
                    >
                      {{ $t('users.resetPassword') }}
                    </el-dropdown-item>
                    
                    <el-dropdown-item 
                      :command="{ action: 'delete', row }"
                      v-if="$store.getters['auth/hasPermission']('user:delete')"
                      divided
                      class="dropdown-item-danger"
                    >
                      {{ $t('shared.delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
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
        <el-button type="default" @click="showAddDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">
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
        <el-button type="default" @click="showEditDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" @click="handleSaveEdit">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="showResetPasswordDialog"
      :title="$t('users.resetPasswordTitle')"
      width="400px"
    >
      <el-form :model="resetPasswordForm" :rules="resetPasswordRules" ref="resetPasswordFormRef" label-width="130px">
        <el-form-item :label="$t('users.newPassword')" prop="newPassword">
          <el-input v-model="resetPasswordForm.newPassword" type="password" show-password style="max-width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('users.confirmNewPassword')" prop="confirmPassword">
          <el-input v-model="resetPasswordForm.confirmPassword" type="password" show-password style="max-width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="default" @click="showResetPasswordDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" @click="handleResetPassword" :loading="resettingPassword">{{ $t('shared.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import { MoreFilled, Search, Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { getTableHeight } from '@/utils/tableHeight'
import { validatePasswordStrength } from '@/utils/passwordStrength'

export default {
  name: 'Users',
  components: {
    Search,
    Plus,
    MoreFilled
  },
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
    
    // 分页节流和去重机制
    const usersLoading = ref(false)
    const lastUsersLoadAt = ref(0)
    
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
    
    const validateUserPassword = (rule, value, callback) => {
      const r = validatePasswordStrength(value, userForm.value?.username)
      if (!r.valid) {
        callback(new Error(t('passwordStrength.' + (r.messageKey || 'minLength'))))
      } else {
        callback()
      }
    }
    
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
        { validator: validateUserPassword, trigger: 'blur' }
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
    
    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('basic')
    })

    // 方法
    const loadUsers = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastUsersLoadAt.value < 2000) {
        return
      }
      if (!force && usersLoading.value) {
        return
      }
      try {
        usersLoading.value = true
        loading.value = true
        lastUsersLoadAt.value = now
        await store.dispatch('users/fetchUsers', {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        })
      } catch (error) {
        if (!silent) {
          ElMessage.error(t('users.loadFailed'))
        } else {
          console.warn('加载用户失败(已静默):', error?.message || error)
        }
      } finally {
        usersLoading.value = false
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
      loadUsers({ force: true })
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadUsers({ force: true })
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadUsers({ force: true })
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
    
    // 使用删除确认 composable pattern
    const { confirmDelete } = useDeleteConfirm()

    const handleDelete = async (row) => {
      try {
        const confirmed = await confirmDelete(row, {
          message: t('users.deleteConfirm'),
          title: t('shared.info')
        })

        if (!confirmed) return

        await store.dispatch('users/deleteUser', row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadUsers({ force: true })
      } catch (error) {
        ElMessage.error(t('shared.messages.deleteFailed'))
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
        loadUsers({ force: true })
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
    const resetPasswordForm = reactive({ newPassword: '', confirmPassword: '' })
    const resettingPassword = ref(false)
    const resetPasswordFormRef = ref(null)
    let resetUserId = null
    const resetUsername = ref('')

    const validateResetPassword = (rule, value, callback) => {
      const r = validatePasswordStrength(value, resetUsername.value)
      if (!r.valid) {
        callback(new Error(t('passwordStrength.' + (r.messageKey || 'minLength'))))
      } else {
        callback()
      }
    }

    // 校验规则
    const resetPasswordRules = computed(() => ({
      newPassword: [
        { required: true, message: t('users.validation.newPasswordRequired'), trigger: 'blur' },
        { validator: validateResetPassword, trigger: 'blur' }
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
      resetUsername.value = row.username || ''
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
            password: resetPasswordForm.newPassword
          }
        })
        ElMessage.success(t('users.resetPasswordSuccess'))
        showResetPasswordDialog.value = false
        loadUsers({ force: true })
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
      handleMoreAction,
      tableHeight
    }
  }
}
</script>

<style scoped>
.users-container {
  height: calc(100vh - 64px);
  background: rgb(var(--background));
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px; /* 底部 padding 减少到 4px */
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.search-section {
  display: flex;
  align-items: center;
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
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
}

</style> 