<template>
  <div class="register-container">
    <div class="register-lang-switch">
      <el-dropdown @command="changeLanguage">
        <el-button type="text">
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
    <div class="register-box">
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

export default {
  name: 'Register',
  setup() {
    const store = useStore()
    const router = useRouter()
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
        callback(new Error('两次输入的密码不一致'))
      } else {
        callback()
      }
    }
    
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
      confirmPassword: [
        { required: true, message: '请确认密码', trigger: 'blur' },
        { validator: validateConfirmPassword, trigger: 'blur' }
      ]
    }
    
    const handleRegister = async () => {
      try {
        await registerForm.value.validate()
        loading.value = true
        
        const { confirmPassword, ...registerData } = formData
        await store.dispatch('auth/register', registerData)
        ElMessage.success('注册成功，请登录')
        router.push('/login')
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '注册失败')
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
      currentLocaleLabel
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