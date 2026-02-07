<template>
  <div class="roles-container">
    <!-- 统一卡片：包含操作栏和列表 -->
    <el-card class="main-card">
      <!-- 操作栏 -->
      <div class="action-bar">
        <div class="search-section">
          <el-input
            v-model="searchQuery"
            :placeholder="$t('roles.searchPlaceholder')"
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
          <el-button type="primary" @click="showAddDialog = true" v-if="$store.getters['auth/hasPermission']('role:create')">
            <el-icon><Plus /></el-icon>
            {{ $t('roles.addRole') }}
          </el-button>
        </div>
      </div>
      
      <!-- 角色列表 - 固定表头 -->
      <div class="table-container">
        <el-table
          :data="roles"
          :loading="loading"
          :height="tableHeight"
          style="width: 100%"
          v-loading="loading"
        >
        <el-table-column prop="name" :label="$t('roles.name')" width="150" />
        <el-table-column prop="userCount" :label="$t('roles.userCount')" width="120" />
        <el-table-column prop="description" :label="$t('roles.description')" show-overflow-tooltip />
        <!-- 移除权限列 -->
        <el-table-column :label="$t('shared.operation')" width="180" fixed="right" align="left">
          <template #default="{ row }">
            <div class="operation-buttons">
              <el-button
                text
                size="small"
                @click="handleEdit(row)"
                v-if="$store.getters['auth/hasPermission']('role:update')"
                :aria-label="$t('shared.edit')"
                :title="$t('shared.edit')"
              >
                {{ $t('shared.edit') }}
              </el-button>
              <template v-if="$store.getters['auth/hasPermission']('role:delete')">
                <el-tooltip
                  v-if="isDeleteDisabled(row)"
                  effect="dark"
                  :content="deleteDisabledReason(row)"
                >
                  <span>
                    <el-button
                      text
                      size="small"
                      :disabled="true"
                      class="btn-danger-text"
                      :aria-label="$t('shared.delete')"
                      :title="$t('shared.delete')"
                    >
                      {{ $t('shared.delete') }}
                    </el-button>
                  </span>
                </el-tooltip>
                <el-button
                  v-else
                  text
                  size="small"
                  class="btn-danger-text"
                  @click="handleDelete(row)"
                  :aria-label="$t('shared.delete')"
                  :title="$t('shared.delete')"
                >
                  {{ $t('shared.delete') }}
                </el-button>
              </template>
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
    
    <!-- 添加/编辑角色对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingRole ? $t('roles.editRole') : $t('roles.addRole')"
      width="600px"
    >
      <el-form
        ref="roleFormRef"
        :model="roleForm"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item :label="$t('roles.name')" prop="name">
          <el-input v-model="roleForm.name" />
        </el-form-item>
        
        <el-form-item :label="$t('roles.description')" prop="description">
          <el-input
            v-model="roleForm.description"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
        
        <el-form-item :label="$t('roles.permissions')" prop="permissions">
          <div class="permission-tree-container">
            <el-tree
              ref="permTreeRef"
              :data="permissionTree"
              node-key="key"
              show-checkbox
              default-expand-all
              :props="treeProps"
              :check-strictly="false"
              :disabled="isAdminRole"
              @check="handlePermissionCheck"
              class="ant-design-tree"
            >
              <template #default="{ data }">
                <div class="tree-node-content">
                  <span class="tree-node-label">{{ data.label }}</span>
                </div>
              </template>
            </el-tree>
            <div v-if="isAdminRole" class="admin-permission-notice">
              <el-icon><InfoFilled /></el-icon>
              <span>{{ $t('roles.adminNotice') }}</span>
            </div>
          </div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button type="default" @click="showAddDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">
          {{ $t('shared.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { ElMessage } from 'element-plus'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import { InfoFilled, Plus, Search } from '@element-plus/icons-vue'
import api from '../api'
import { useI18n } from 'vue-i18n'
import { getTableHeight } from '@/utils/tableHeight'

export default {
  name: 'Roles',
  components: {
    InfoFilled,
    Plus,
    Search
  },
  setup() {
    const store = useStore()
    const { t } = useI18n()
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    const showAddDialog = ref(false)
    const editingRole = ref(null)
    const permissions = ref([])
    const permTreeRef = ref(null)
    const searchQuery = ref('')
    const currentPage = ref(1)
    const pageSize = ref(20)
    let searchTimer = null
    
    // 分页节流和去重机制
    const rolesLoading = ref(false)
    const lastRolesLoadAt = ref(0)
    
    const roleFormRef = ref(null)
    const roleForm = reactive({
      name: '',
      description: '',
      permissions: []
    })
    
    const rules = {
      name: [
        { required: true, message: t('roles.rules.nameRequired'), trigger: 'blur' }
      ],
      description: [
        { required: true, message: t('roles.rules.descriptionRequired'), trigger: 'blur' }
      ]
    }
    
    // 计算属性
    const roles = computed(() => store.getters['users/rolesList'])
    const total = computed(() => store.getters['users/rolesTotalCount'])
    
    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('basic')
    })

    const permissionGroups = computed(() => {
      const groups = {}
      for (const p of permissions.value) {
        const prefix = getPermissionPrefix(p.name)
        if (!groups[prefix]) groups[prefix] = []
        groups[prefix].push(p)
      }
      return groups
    })

    // 检查是否为管理员角色
    const isAdminRole = computed(() => {
      if (!editingRole.value) return false
      const roleName = (editingRole.value.name || '').toString().trim().toLowerCase()
      return roleName === 'admin' || roleName === '管理员'
    })

    // 构建树形数据 - 从数据库动态读取权限并分组
    const permissionTree = computed(() => {
      if (!permissions.value || permissions.value.length === 0) {
        return []
      }

      // 权限分组映射
      const groupMapping = {
        user: t('roles.permissionGroups.user'),
        role: t('roles.permissionGroups.role'),
        error_code: t('roles.permissionGroups.error_code'),
        fault_case: t('roles.permissionGroups.fault_case'),
        fault_case_config: t('roles.permissionGroups.fault_case_config'),
        log: t('roles.permissionGroups.log'),
        i18n: t('roles.permissionGroups.i18n'),
        device: t('roles.permissionGroups.device'),
        history: t('roles.permissionGroups.history'),
        surgery: t('roles.permissionGroups.surgery'),
        data_replay: t('roles.permissionGroups.data_replay'),
        kb: t('roles.permissionGroups.kb'),
        dashboard: t('roles.permissionGroups.dashboard'),
        test: t('roles.permissionGroups.test'),
        system: t('roles.permissionGroups.system'),
        loglevel: t('roles.permissionGroups.loglevel')
      }

      // 按权限前缀分组
      const groupedPermissions = {}
      permissions.value.forEach(permission => {
        const prefix = getPermissionPrefix(permission.name)
        const groupKey = prefix || 'other'
        const groupLabel = groupMapping[groupKey] || t('roles.permissionGroups.other')
        
        if (!groupedPermissions[groupKey]) {
          groupedPermissions[groupKey] = {
            key: `${groupKey}_management`,
            label: groupLabel,
            children: []
          }
        }
        
        groupedPermissions[groupKey].children.push({
          key: permission.name,
          label: getPermissionLabel(permission, groupLabel),
          description: permission.description
        })
      })

      const treeData = Object.values(groupedPermissions)

      // 如果当前编辑的是管理员角色，返回所有权限且禁用
      if (isAdminRole.value) {
        return treeData.map(group => ({
          ...group,
          children: group.children.map(child => ({
            ...child,
            disabled: true // 管理员角色的权限不可修改
          }))
        }))
      }

      return treeData
    })
    const treeProps = { label: 'label', children: 'children' }
    
    // 方法
    const loadRoles = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastRolesLoadAt.value < 2000) {
        return
      }
      if (!force && rolesLoading.value) {
        return
      }
      try {
        rolesLoading.value = true
        loading.value = true
        lastRolesLoadAt.value = now
        await store.dispatch('users/fetchRoles', {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchQuery.value
        })
      } catch (error) {
        if (!silent) {
          ElMessage.error(t('roles.loadFailed'))
        } else {
          console.warn('加载角色失败(已静默):', error?.message || error)
        }
      } finally {
        rolesLoading.value = false
        loading.value = false
      }
    }
    
    const handleSearch = () => {
      if (searchTimer) {
        clearTimeout(searchTimer)
      }
      searchTimer = setTimeout(() => {
        currentPage.value = 1
        loadRoles({ force: true })
      }, 300)
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadRoles({ force: true })
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadRoles({ force: true })
    }

    const loadPermissions = async () => {
      try {
        const res = await api.permissions.getList()
        permissions.value = res.data.permissions || []
        console.log('Loaded permissions:', permissions.value)
      } catch (e) {
        console.error('Failed to load permissions:', e)
        ElMessage.error(t('roles.loadPermsFailed'))
      }
    }
    
    const resetForm = () => {
      Object.assign(roleForm, {
        name: '',
        description: '',
        permissions: []
      })
      editingRole.value = null
    }
    
    const handleEdit = (row) => {
      editingRole.value = row
      Object.assign(roleForm, {
        name: row.name,
        description: row.description,
        permissions: row.permissions || []
      })
      showAddDialog.value = true
      // 等DOM更新后设置勾选
      setTimeout(() => {
        if (permTreeRef.value) {
          if (isAdminRole.value) {
            // 管理员角色：选中所有权限
            const allPermissionKeys = []
            const getAllKeys = (nodes) => {
              nodes.forEach(node => {
                if (node.children) {
                  getAllKeys(node.children)
                } else {
                  allPermissionKeys.push(node.key)
                }
              })
            }
            getAllKeys(permissionTree.value)
            permTreeRef.value.setCheckedKeys(allPermissionKeys)
          } else {
            permTreeRef.value.setCheckedKeys(roleForm.permissions)
          }
        }
      })
    }
    
    // 使用删除确认 composable pattern
    const { confirmDelete } = useDeleteConfirm()

    const handleDelete = async (row) => {
      try {
        const confirmed = await confirmDelete(row, {
          message: t('roles.deleteConfirmText'),
          title: t('roles.deleteConfirmTitle')
        })

        if (!confirmed) return

        await store.dispatch('users/deleteRole', row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadRoles({ force: true })
      } catch (error) {
        const errorMessage = error?.response?.data?.message || error?.message || t('shared.messages.deleteFailed')
        ElMessage.error(errorMessage)
        console.error('删除角色失败:', error)
      }
    }
    
    const handleSave = async () => {
      try {
        saving.value = true
        // 从树中读取选中权限
        const checked = permTreeRef.value ? permTreeRef.value.getCheckedKeys(true) : []
        roleForm.permissions = checked
        if (editingRole.value) {
          await store.dispatch('users/updateRole', {
            id: editingRole.value.id,
            data: roleForm
          })
          ElMessage.success(t('shared.messages.updateSuccess'))
        } else {
          await store.dispatch('users/createRole', roleForm)
          ElMessage.success(t('shared.messages.createSuccess'))
        }
        showAddDialog.value = false
        resetForm()
        loadRoles({ force: true })
      } catch (error) {
        ElMessage.error(t('shared.messages.saveFailed'))
      } finally {
        saving.value = false
      }
    }

    const isDefaultRole = (row) => {
      if (!row || !row.name) return false
      const n = String(row.name).toLowerCase()
      return n === 'admin' || n === 'expert' || n === 'user'
    }

    const isDeleteDisabled = (row) => {
      if (!row) return false
      return isDefaultRole(row) || (row.userCount && row.userCount > 0)
    }

    const deleteDisabledReason = (row) => {
      if (isDefaultRole(row)) return t('roles.deleteDisabled.builtInRole')
      if (row.userCount && row.userCount > 0) return t('roles.deleteDisabled.inUse', { count: row.userCount })
      return t('roles.deleteDisabled.cannotDelete')
    }

    const handlePermissionCheck = (data, checkedInfo) => {
      // 当权限发生变化时，更新表单数据
      const checkedKeys = checkedInfo.checkedKeys
      const halfCheckedKeys = checkedInfo.halfCheckedKeys
      
      // 只保存叶子节点（具体权限），不保存父节点
      const leafKeys = checkedKeys.filter(key => {
        // 查找该key对应的节点
        const findNode = (nodes, targetKey) => {
          for (const node of nodes) {
            if (node.key === targetKey) return node
            if (node.children) {
              const found = findNode(node.children, targetKey)
              if (found) return found
            }
          }
          return null
        }
        
        const node = findNode(permissionTree.value, key)
        return node && (!node.children || node.children.length === 0)
      })
      
      roleForm.permissions = leafKeys
    }
    
    onMounted(() => {
      loadRoles({ force: true })
      loadPermissions()
    })

    function getPermissionPrefix (permissionName) {
      if (!permissionName) return 'other'
      const normalized = String(permissionName).toLowerCase()
      const parts = normalized.split(':')
      if (parts.length > 1 && parts[0]) {
        return parts[0]
      }
      return 'other'
    }

    function getPermissionLabel (permission, groupLabel) {
      const normalizedName = String(permission?.name || '').toLowerCase()
      if (!normalizedName) {
        return permission?.description || ''
      }

      const overrideKey = `roles.permissionLabels.${normalizedName.replace(/:/g, '.')}`
      const overrideText = t(overrideKey)
      if (overrideText && overrideText !== overrideKey) {
        return overrideText
      }

      const segments = normalizedName.split(':')
      const actionSegment = segments[1] || 'default'
      const actionKey = actionSegment.replace(/[^a-z_]/g, '') || 'default'
      const actionI18nKey = `roles.permissionActions.${actionKey}`
      const translatedAction = t(actionI18nKey)
      const actionLabel = translatedAction && translatedAction !== actionI18nKey
        ? translatedAction
        : actionSegment.toUpperCase()

      const baseLabel = groupLabel || t('roles.permissionGroups.other')

      if (actionLabel) {
        return `${baseLabel} · ${actionLabel}`
      }

      return permission?.description || permission?.name || baseLabel
    }
    
    return {
      loading,
      saving,
      showAddDialog,
      editingRole,
      roleForm,
      roleFormRef,
      rules,
      roles,
      permissions,
      permissionGroups,
      permissionTree,
      treeProps,
      permTreeRef,
      isAdminRole,
      handleEdit,
      handleDelete,
      handleSave,
      isDefaultRole,
      isDeleteDisabled,
      deleteDisabledReason,
      handlePermissionCheck,
      tableHeight,
      searchQuery,
      currentPage,
      pageSize,
      total,
      handleSearch,
      handleSizeChange,
      handleCurrentChange,
      Search
    }
  }
}
</script>

<style scoped>
.roles-container {
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
  padding: 8px 0 12px 0;
  display: flex;
  justify-content: center;
}

h4 {
  margin: 10px 0;
  color: rgb(var(--text-primary));
  font-size: 14px;
}

.el-checkbox {
  display: block;
  margin-bottom: 8px;
}

/* Ant Design Tree Styles */
.permission-tree-container {
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-sm);
  padding: 8px;
  background: rgb(var(--background));
  max-height: 400px;
  overflow-y: auto;
  width: 100%;
  box-sizing: border-box;
}

.ant-design-tree {
  background: transparent;
}

.ant-design-tree :deep(.el-tree-node) {
  margin-bottom: 4px;
}

.ant-design-tree :deep(.el-tree-node__content) {
  height: 32px;
  line-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-xs);
  transition: all 0.2s;
}

.ant-design-tree :deep(.el-tree-node__content:hover) {
  background-color: rgb(var(--bg-secondary));
}

.ant-design-tree :deep(.el-tree-node.is-checked > .el-tree-node__content) {
  background-color: rgb(var(--bg-info-primary));
  border-color: rgb(var(--border-info-primary));
}

.ant-design-tree :deep(.el-tree-node__expand-icon) {
  color: rgb(var(--text-secondary));
  font-size: 12px;
  margin-right: 4px;
}

.ant-design-tree :deep(.el-checkbox) {
  margin-right: 8px;
}

.ant-design-tree :deep(.el-checkbox__input.is-disabled .el-checkbox__inner) {
  background-color: rgb(var(--bg-secondary));
  border-color: rgb(var(--border));
  cursor: not-allowed;
}

.ant-design-tree :deep(.el-checkbox__input.is-disabled.is-checked .el-checkbox__inner) {
  background-color: rgb(var(--primary));
  border-color: rgb(var(--primary));
}

.tree-node-content {
  display: flex;
  align-items: center;
  width: 100%;
}

.tree-node-label {
  font-size: 14px;
  color: rgb(var(--text-primary));
  font-weight: 400;
}

.admin-permission-notice {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: rgb(var(--bg-warning));
  border: 1px solid rgb(var(--border-warning));
  border-radius: var(--radius-xs);
  margin-top: 8px;
  color: rgb(var(--text-warning));
  font-size: 12px;
}

.admin-permission-notice .el-icon {
  margin-right: 4px;
  font-size: 14px;
}

/* 禁用状态的样式 */
.ant-design-tree :deep(.el-tree-node.is-disabled .el-tree-node__content) {
  background-color: rgb(var(--bg-secondary));
  color: rgb(var(--text-disabled));
  cursor: not-allowed;
}

.ant-design-tree :deep(.el-tree-node.is-disabled .el-tree-node__content:hover) {
  background-color: rgb(var(--bg-secondary));
}
</style> 