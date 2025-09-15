<template>
  <div class="roles-container">
    <!-- 操作栏 -->
    <div class="action-bar">
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        添加角色
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
        <el-table-column prop="name" label="角色名称" width="150" />
        <el-table-column prop="description" label="角色描述" show-overflow-tooltip />
        <!-- 移除权限列 -->
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button 
              size="small" 
              @click="handleEdit(row)"
            >
              编辑
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
          <el-checkbox-group v-model="roleForm.permissions">
            <el-row :gutter="20">
              <el-col :span="12" v-for="(group, groupName) in permissionGroups" :key="groupName" style="margin-bottom: 10px;">
                <h4>{{ groupName }}</h4>
                <el-checkbox v-for="perm in group" :key="perm.name" :value="perm.name">
                  {{ perm.name }}
                </el-checkbox>
              </el-col>
            </el-row>
          </el-checkbox-group>
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
import api from '../api'

export default {
  name: 'Roles',
  setup() {
    const store = useStore()
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    const showAddDialog = ref(false)
    const editingRole = ref(null)
    const permissions = ref([])
    
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
      } catch (e) {
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
      handleEdit,
      handleDelete,
      handleSave
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
</style> 