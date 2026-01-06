<template>
  <div class="account-container">
    <el-row :gutter="20">
      <!-- 基本信息 -->
      <el-col :span="12">
        <el-card class="profile-card">
          <template #header>
            <div class="card-header">
              <span>{{ $t('account.profile') }}</span>
            </div>
          </template>
          <el-form ref="profileForm" :model="profileData" :rules="profileRules" label-width="100px">
            <el-form-item :label="$t('users.username')">
              <el-input v-model="profileData.username" disabled />
            </el-form-item>
            <el-form-item :label="$t('users.email')" prop="email">
              <el-input v-model="profileData.email" />
            </el-form-item>
            <el-form-item :label="$t('users.role')">
              <el-tag>{{ getRoleText(profileData.role) }}</el-tag>
            </el-form-item>
            <el-form-item :label="$t('users.createTime')">
              <span>{{ formatDate(profileData.created_at) }}</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleUpdateProfile" :loading="updatingProfile">{{ $t('shared.save') }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
      <!-- 修改密码 -->
      <el-col :span="12">
        <el-card class="password-card">
          <template #header>
            <div class="card-header">
              <span>{{ $t('account.changePassword') }}</span>
            </div>
          </template>
          <el-form ref="passwordForm" :model="passwordData" :rules="passwordRules" label-width="140px">
            <el-form-item :label="$t('account.oldPassword')" prop="oldPassword">
              <el-input v-model="passwordData.oldPassword" type="password" show-password style="max-width: 250px" />
            </el-form-item>
            <el-form-item :label="$t('account.newPassword')" prop="newPassword">
              <el-input v-model="passwordData.newPassword" type="password" show-password style="max-width: 250px" />
            </el-form-item>
            <el-form-item :label="$t('account.confirmPassword')" prop="confirmPassword">
              <el-input v-model="passwordData.confirmPassword" type="password" show-password style="max-width: 250px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleChangePassword" :loading="changingPassword">{{ $t('account.changePassword') }}</el-button>
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
import { useI18n } from 'vue-i18n'

export default {
  name: 'Account',
  setup() {
    const store = useStore()
    const { t, locale } = useI18n()
    
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
        { required: true, message: t('account.rules.emailRequired'), trigger: 'blur' },
        { type: 'email', message: t('account.rules.emailFormat'), trigger: 'blur' }
      ]
    }
    
    const validateConfirmPassword = (rule, value, callback) => {
      if (value !== passwordData.newPassword) {
        callback(new Error(t('account.passwordMismatch')))
      } else {
        callback()
      }
    }
    
    const passwordRules = {
      oldPassword: [
        { required: true, message: t('account.rules.oldPasswordRequired'), trigger: 'blur' }
      ],
      newPassword: [
        { required: true, message: t('account.rules.newPasswordRequired'), trigger: 'blur' },
        { min: 6, message: t('account.rules.newPasswordMin'), trigger: 'blur' }
      ],
      confirmPassword: [
        { required: true, message: t('account.rules.confirmPasswordRequired'), trigger: 'blur' },
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
        ElMessage.success(t('account.updateSuccess'))
      } catch (error) {
        ElMessage.error(t('account.updateFailed'))
      } finally {
        updatingProfile.value = false
      }
    }
    
    const handleChangePassword = async () => {
      try {
        await passwordForm.value.validate()
        changingPassword.value = true
        if (passwordData.newPassword !== passwordData.confirmPassword) {
          ElMessage.error(t('account.passwordMismatch'))
          return
        }
        await store.dispatch('users/updateUser', {
          id: store.getters['auth/currentUser'].id,
          data: { 
            password: passwordData.newPassword,
            oldPassword: passwordData.oldPassword
          }
        })
        ElMessage.success(t('account.changePasswordSuccess'))
        Object.assign(passwordData, { oldPassword: '', newPassword: '', confirmPassword: '' })
        passwordForm.value.resetFields()
      } catch (error) {
        ElMessage.error(error.response?.data?.message || t('account.changePasswordFailed'))
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
      const roleMap = {
        admin: t('users.roleAdmin'),
        expert: t('users.roleExpert'),
        user: t('users.roleUser')
      }
      return roleMap[role] || role
    }
    
    const formatDate = (dateString) => {
      if (!dateString) return '-'
      const localeStr = locale.value === 'en-US' ? 'en-US' : 'zh-CN'
      return new Date(dateString).toLocaleString(localeStr)
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
      formatDate,
      currentUser
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

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.el-form-item:last-child {
  margin-bottom: 0;
}
</style> 