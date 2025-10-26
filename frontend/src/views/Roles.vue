<template>
  <div class="roles-container">
    <!-- 操作栏 -->
    <div class="action-bar">
      <el-button type="primary" @click="showAddDialog = true" v-if="$store.getters['auth/hasPermission']('role:create')">
        <el-icon><Plus /></el-icon>
        {{ $t('roles.addRole') }}
      </el-button>
    </div>
    
    <!-- 角色列表 -->
    <el-card class="list-card">
      <el-table
        :data="roles"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="name" :label="$t('roles.name')" width="150" />
        <el-table-column prop="userCount" :label="$t('roles.userCount')" width="120" />
        <el-table-column prop="description" :label="$t('roles.description')" show-overflow-tooltip />
        <!-- 移除权限列 -->
        <el-table-column :label="$t('common.operation')" width="180" fixed="right">
          <template #default="{ row }">
            <el-button 
              size="small" 
              @click="handleEdit(row)"
              v-if="$store.getters['auth/hasPermission']('role:update')"
            >
              {{ $t('common.edit') }}
            </el-button>
            <template v-if="$store.getters['auth/hasPermission']('role:delete')">
              <el-tooltip
                v-if="isDeleteDisabled(row)"
                effect="dark"
                :content="deleteDisabledReason(row)"
              >
                <span>
                  <el-button 
                    size="small" 
                    type="danger" 
                    :disabled="true"
                  >
                    {{ $t('common.delete') }}
                  </el-button>
                </span>
              </el-tooltip>
              <el-button 
                v-else
                size="small" 
                type="danger" 
                @click="handleDelete(row)"
              >
                {{ $t('common.delete') }}
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    
    <!-- 添加/编辑角色对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingRole ? '编辑角色' : '添加角色'"
      width="600px"
    >
      <el-form
        ref="roleFormRef"
        :model="roleForm"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="roleForm.name" />
        </el-form-item>
        
        <el-form-item label="角色描述" prop="description">
          <el-input
            v-model="roleForm.description"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
        
        <el-form-item label="权限" prop="permissions">
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
                  <span v-if="data.description" class="tree-node-description">{{ data.description }}</span>
                </div>
              </template>
            </el-tree>
            <div v-if="isAdminRole" class="admin-permission-notice">
              <el-icon><InfoFilled /></el-icon>
              <span>管理员角色拥有所有权限，无法修改</span>
            </div>
          </div>
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
import { InfoFilled } from '@element-plus/icons-vue'
import api from '../api'

export default {
  name: 'Roles',
  components: {
    InfoFilled
  },
  setup() {
    const store = useStore()
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    const showAddDialog = ref(false)
    const editingRole = ref(null)
    const permissions = ref([])
    const permTreeRef = ref(null)
    
    const roleFormRef = ref(null)
    const roleForm = reactive({
      name: '',
      description: '',
      permissions: []
    })
    
    const rules = {
      name: [
        { required: true, message: '请输入角色名称', trigger: 'blur' }
      ],
      description: [
        { required: true, message: '请输入角色描述', trigger: 'blur' }
      ]
    }
    
    // 计算属性
    const roles = computed(() => store.getters['users/rolesList'])

    const permissionGroups = computed(() => {
      const groups = {}
      for (const p of permissions.value) {
        const key = (p.name.includes(':') ? p.name.split(':')[0] : '其他')
        if (!groups[key]) groups[key] = []
        groups[key].push(p)
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
        'user': '用户管理',
        'role': '角色管理', 
        'error_code': '故障码管理',
        'log': '日志管理',
        'i18n': '多语言管理',
        'device': '设备管理',
        'history': '历史记录',
        'surgery': '手术数据',
        'data_replay': '数据回放',
        'dashboard': '系统看板',
        'test': '测试',
        'system': '系统监控',
        'loglevel': '日志分析等级'
      }

      // 按权限前缀分组
      const groupedPermissions = {}
      permissions.value.forEach(permission => {
        const prefix = permission.name.split(':')[0]
        const groupName = groupMapping[prefix] || '其他权限'
        
        if (!groupedPermissions[groupName]) {
          groupedPermissions[groupName] = {
            key: `${prefix}_management`,
            label: groupName,
            children: []
          }
        }
        
        groupedPermissions[groupName].children.push({
          key: permission.name,
          label: permission.description || permission.name,
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
    const loadRoles = async () => {
      loading.value = true
      try {
        await store.dispatch('users/fetchRoles')
      } catch (error) {
        ElMessage.error('加载角色失败')
      } finally {
        loading.value = false
      }
    }

    const loadPermissions = async () => {
      try {
        const res = await api.permissions.getList()
        permissions.value = res.data.permissions || []
        console.log('Loaded permissions:', permissions.value)
      } catch (e) {
        console.error('Failed to load permissions:', e)
        ElMessage.error('加载权限清单失败')
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
    
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm('确定要删除这个角色吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })
        await store.dispatch('users/deleteRole', row.id)
        ElMessage.success('删除成功')
        loadRoles()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
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
          ElMessage.success('更新成功')
        } else {
          await store.dispatch('users/createRole', roleForm)
          ElMessage.success('添加成功')
        }
        showAddDialog.value = false
        resetForm()
        loadRoles()
      } catch (error) {
        ElMessage.error('保存失败')
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
      if (isDefaultRole(row)) return '系统内置角色不可删除'
      if (row.userCount && row.userCount > 0) return `有 ${row.userCount} 个用户正在使用，无法删除`
      return '不可删除'
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
      loadRoles()
      loadPermissions()
    })
    
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
      handlePermissionCheck
    }
  }
}
</script>

<style scoped>
.roles-container {
  height: 100%;
}

.action-bar {
  margin-bottom: 20px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.list-card {
  margin-bottom: 20px;
}

h4 {
  margin: 10px 0;
  color: #333;
  font-size: 14px;
}

.el-checkbox {
  display: block;
  margin-bottom: 8px;
}

/* Ant Design Tree Styles */
.permission-tree-container {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 8px;
  background: #fafafa;
  max-height: 400px;
  overflow-y: auto;
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
  border-radius: 4px;
  transition: all 0.2s;
}

.ant-design-tree :deep(.el-tree-node__content:hover) {
  background-color: #f5f5f5;
}

.ant-design-tree :deep(.el-tree-node.is-checked > .el-tree-node__content) {
  background-color: #e6f7ff;
  border-color: #1890ff;
}

.ant-design-tree :deep(.el-tree-node__expand-icon) {
  color: #666;
  font-size: 12px;
  margin-right: 4px;
}

.ant-design-tree :deep(.el-checkbox) {
  margin-right: 8px;
}

.ant-design-tree :deep(.el-checkbox__input.is-disabled .el-checkbox__inner) {
  background-color: #f5f5f5;
  border-color: #d9d9d9;
  cursor: not-allowed;
}

.ant-design-tree :deep(.el-checkbox__input.is-disabled.is-checked .el-checkbox__inner) {
  background-color: #1890ff;
  border-color: #1890ff;
}

.tree-node-content {
  display: flex;
  align-items: center;
  width: 100%;
}

.tree-node-label {
  font-size: 14px;
  color: #262626;
  font-weight: 400;
}

.tree-node-description {
  font-size: 12px;
  color: #8c8c8c;
  margin-left: 8px;
  flex: 1;
}

.admin-permission-notice {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4px;
  margin-top: 8px;
  color: #d46b08;
  font-size: 12px;
}

.admin-permission-notice .el-icon {
  margin-right: 4px;
  font-size: 14px;
}

/* 禁用状态的样式 */
.ant-design-tree :deep(.el-tree-node.is-disabled .el-tree-node__content) {
  background-color: #f5f5f5;
  color: #bfbfbf;
  cursor: not-allowed;
}

.ant-design-tree :deep(.el-tree-node.is-disabled .el-tree-node__content:hover) {
  background-color: #f5f5f5;
}
</style> 