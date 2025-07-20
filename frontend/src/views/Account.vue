<template>
  <div class="account-container">
    <el-row :gutter="20">
      <!-- 基本信息 -->
      <el-col :span="12">
        <el-card class="profile-card">
          <template #header>
            <div class="card-header">
              <span>个人信息</span>
            </div>
          </template>
          <el-form ref="profileForm" :model="profileData" :rules="profileRules" label-width="100px">
            <el-form-item label="用户名">
              <el-input v-model="profileData.username" disabled />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="profileData.email" />
            </el-form-item>
            <el-form-item label="角色">
              <el-tag>{{ getRoleText(profileData.role) }}</el-tag>
            </el-form-item>
            <el-form-item label="注册时间">
              <span>{{ formatDate(profileData.created_at) }}</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleUpdateProfile" :loading="updatingProfile">保存</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
      <!-- 修改密码 -->
      <el-col :span="12">
        <el-card class="password-card">
          <template #header>
            <div class="card-header">
              <span>修改密码</span>
            </div>
          </template>
          <el-form ref="passwordForm" :model="passwordData" :rules="passwordRules" label-width="100px">
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="passwordData.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="passwordData.newPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="passwordData.confirmPassword" type="password" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleChangePassword" :loading="changingPassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { ElMessage } from 'element-plus'

export default {
  name: 'Account',
  setup() {
    const store = useStore()
    
    // 响应式数据
    const updatingProfile = ref(false)
    const changingPassword = ref(false)
    const profileForm = ref(null)
    const passwordForm = ref(null)
    
    const profileData = reactive({
      username: '',
      email: '',
      role: '',
      created_at: ''
    })
    
    const passwordData = reactive({
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
    
    // 表单验证规则
    const profileRules = {
      email: [
        { required: true, message: '请输入邮箱', trigger: 'blur' },
        { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
      ]
    }
    
    const validateConfirmPassword = (rule, value, callback) => {
      if (value !== passwordData.newPassword) {
        callback(new Error('两次输入的密码不一致'))
      } else {
        callback()
      }
    }
    
    const passwordRules = {
      oldPassword: [
        { required: true, message: '请输入原密码', trigger: 'blur' }
      ],
      newPassword: [
        { required: true, message: '请输入新密码', trigger: 'blur' },
        { min: 6, message: '密码长度不能少于 6 个字符', trigger: 'blur' }
      ],
      confirmPassword: [
        { required: true, message: '请确认密码', trigger: 'blur' },
        { validator: validateConfirmPassword, trigger: 'blur' }
      ]
    }
    
    // 计算属性
    const currentUser = computed(() => store.getters.currentUser)
    
    // 方法
    const loadUserProfile = () => {
      const user = store.getters['auth/currentUser']
      if (user) {
        Object.assign(profileData, {
          username: user.username,
          email: user.email,
          role: user.role,
          created_at: user.created_at
        })
      }
    }
    
    const handleUpdateProfile = async () => {
      try {
        await profileForm.value.validate()
        updatingProfile.value = true
        await store.dispatch('users/updateUser', {
          id: store.getters['auth/currentUser'].id,
          data: { email: profileData.email }
        })
        ElMessage.success('更新成功')
      } catch (error) {
        ElMessage.error('更新失败')
      } finally {
        updatingProfile.value = false
      }
    }
    
    const handleChangePassword = async () => {
      try {
        await passwordForm.value.validate()
        changingPassword.value = true
        if (passwordData.newPassword !== passwordData.confirmPassword) {
          ElMessage.error('两次输入的新密码不一致')
          return
        }
        await store.dispatch('users/updateUser', {
          id: store.getters['auth/currentUser'].id,
          data: { password: passwordData.newPassword }
        })
        ElMessage.success('密码修改成功')
        Object.assign(passwordData, { oldPassword: '', newPassword: '', confirmPassword: '' })
        passwordForm.value.resetFields()
      } catch (error) {
        ElMessage.error('密码修改失败')
      } finally {
        changingPassword.value = false
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
      loadUserProfile()
    })
    
    return {
      updatingProfile,
      changingPassword,
      profileForm,
      passwordForm,
      profileData,
      passwordData,
      profileRules,
      passwordRules,
      handleUpdateProfile,
      handleChangePassword,
      getRoleType,
      getRoleText,
      formatDate
    }
  }
}
</script>

<style scoped>
.account-container {
  height: 100%;
}

.profile-card,
.password-card {
  height: 100%;
}

.card-header {
  font-weight: 600;
}

.el-form-item:last-child {
  margin-bottom: 0;
}
</style> 