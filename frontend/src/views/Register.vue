<template>
  <div class="register-container">
    <div class="register-box">
      <div class="register-lang-switch">
        <el-dropdown @command="changeLanguage">
          <el-button type="text">
            <el-icon><InfoFilled /></el-icon>
            {{ currentLocaleLabel }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
              <el-dropdown-item command="en-US">English</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="register-header">
        <h1>{{ $t('register.title') }}</h1>
      </div>
      
      <el-form 
        ref="registerForm" 
        :model="formData" 
        :rules="rules" 
        class="register-form"
      >
        <el-form-item prop="username">
          <el-input
            v-model="formData.username"
            :placeholder="$t('register.username')"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>
        
        <el-form-item prop="email">
          <el-input
            v-model="formData.email"
            :placeholder="$t('register.email')"
            prefix-icon="Message"
            size="large"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            :placeholder="$t('register.password')"
            prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        
        <el-form-item prop="confirmPassword">
          <el-input
            v-model="formData.confirmPassword"
            type="password"
            :placeholder="$t('register.confirmPassword')"
            prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            size="large" 
            class="register-button"
            :loading="loading"
            @click="handleRegister"
          >
            {{ $t('register.register') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="register-footer">
        <router-link to="/login" class="back-to-login">
          {{ $t('register.backToLogin') }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'
import { InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { validatePasswordStrength } from '@/utils/passwordStrength'

export default {
  name: 'Register',
  components: { InfoFilled },
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()
    const registerForm = ref(null)
    
    const formData = reactive({
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    })
    
    const loading = ref(false)
    const currentLocaleLabel = computed(() => (getCurrentLocale() === 'en-US' ? 'English' : '中文'))
    
    const validateConfirmPassword = (rule, value, callback) => {
      if (value !== formData.password) {
        callback(new Error(t('register.validation.passwordMismatch')))
      } else {
        callback()
      }
    }
    
    const validatePassword = (rule, value, callback) => {
      const r = validatePasswordStrength(value, formData.username)
      if (!r.valid) {
        callback(new Error(t('passwordStrength.' + (r.messageKey || 'minLength'))))
      } else {
        callback()
      }
    }
    
    const rules = computed(() => ({
      username: [
        { required: true, message: t('register.validation.usernameRequired'), trigger: 'blur' },
        { min: 3, max: 20, message: t('register.validation.usernameLength'), trigger: 'blur' }
      ],
      email: [
        { required: true, message: t('register.validation.emailRequired'), trigger: 'blur' },
        { type: 'email', message: t('register.validation.emailFormat'), trigger: 'blur' }
      ],
      password: [
        { required: true, message: t('register.validation.passwordRequired'), trigger: 'blur' },
        { validator: validatePassword, trigger: 'blur' }
      ],
      confirmPassword: [
        { required: true, message: t('register.validation.confirmPasswordRequired'), trigger: 'blur' },
        { validator: validateConfirmPassword, trigger: 'blur' }
      ]
    }))
    
    const handleRegister = async () => {
      try {
        await registerForm.value.validate()
        loading.value = true
        
        const { confirmPassword, ...registerData } = formData
        await store.dispatch('auth/register', registerData)
        ElMessage.success(t('register.registerSuccess'))
        router.push('/login')
      } catch (error) {
        ElMessage.error(error.response?.data?.message || t('register.registerFailed'))
      } finally {
        loading.value = false
      }
    }
    const changeLanguage = async (language) => {
      await loadLocaleMessages(language)
    }
    
    return {
      registerForm,
      formData,
      loading,
      rules,
      handleRegister,
      changeLanguage,
      currentLocaleLabel,
      InfoFilled
    }
  }
}
</script>

<style scoped>
.register-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.register-box {
  background: white;
  border-radius: 10px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  padding: 40px;
  width: 400px;
  max-width: 90vw;
  position: relative;
}

.register-lang-switch {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  display: flex;
  align-items: center;
}

.register-lang-switch .el-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
}

.register-header {
  text-align: center;
  margin-bottom: 30px;
}

.register-header h1 {
  color: #333;
  margin-bottom: 20px;
  font-size: 24px;
  font-weight: 600;
}

.register-form {
  margin-bottom: 20px;
}

.register-button {
  width: 100%;
  height: 45px;
  font-size: 16px;
}

.register-footer {
  text-align: center;
  margin-top: 20px;
}

.back-to-login {
  color: #409eff;
  text-decoration: none;
  font-size: 14px;
}

.back-to-login:hover {
  color: #66b1ff;
}
</style> 