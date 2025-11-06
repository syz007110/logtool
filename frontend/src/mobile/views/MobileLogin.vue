<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-lang-switch">
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
      <div class="login-header">
        <h1>{{ $t('login.title') }}</h1>
      </div>
      
      <el-form 
        ref="loginForm" 
        :model="formData" 
        :rules="rules" 
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="formData.username"
            :placeholder="$t('login.username')"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            :placeholder="$t('login.password')"
            prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            size="large" 
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            {{ $t('login.login') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="login-footer">
        <router-link to="/register" class="register-link">
          {{ $t('login.register') }}
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
import { getCurrentLocale, loadLocaleMessages } from '../../i18n'
import { InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

export default {
  name: 'MobileLogin',
  components: { InfoFilled },
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()
    const loginForm = ref(null)
    
    const formData = reactive({
      username: '',
      password: ''
    })
    
    const loading = ref(false)
    
    const currentLanguage = computed(() => store.getters['auth/currentLanguage'])
    const currentLocaleLabel = computed(() => (getCurrentLocale() === 'en-US' ? 'English' : '中文'))
    
    const rules = computed(() => ({
      username: [
        { required: true, message: t('login.validation.usernameRequired'), trigger: 'blur' }
      ],
      password: [
        { required: true, message: t('login.validation.passwordRequired'), trigger: 'blur' }
      ]
    }))
    
    const handleLogin = async () => {
      try {
        await loginForm.value.validate()
        loading.value = true
        
        await store.dispatch('auth/login', formData)
        ElMessage.success(t('login.loginSuccess'))
        router.push('/m')
      } catch (error) {
        // 不在这里显示错误信息，因为响应拦截器已经处理了
        console.error('登录失败:', error)
      } finally {
        loading.value = false
      }
    }
    
    const changeLanguage = async (language) => {
      await loadLocaleMessages(language)
    }
    
    return {
      loginForm,
      formData,
      loading,
      rules,
      currentLanguage,
      currentLocaleLabel,
      handleLogin,
      changeLanguage,
      InfoFilled
    }
  }
}
</script>

<style scoped>
.login-container {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  /* 顶部安全区域：防止被前置摄像头遮挡 */
  padding-top: max(20px, env(safe-area-inset-top) + 20px);
  /* 登录页不需要底部额外留白，避免空白区域 */
  padding-bottom: 0 !important;
  box-sizing: border-box;
}

.login-box {
  background: white;
  border-radius: 10px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  padding: 40px;
  width: 100%;
  max-width: 400px;
  position: relative;
}

.login-lang-switch {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  display: flex;
  align-items: center;
}

.login-lang-switch .el-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h1 {
  color: #333;
  margin-bottom: 20px;
  font-size: 24px;
  font-weight: 600;
}

.language-switch {
  display: none;
}

.login-form {
  margin-bottom: 20px;
}

.login-button {
  width: 100%;
  height: 45px;
  font-size: 16px;
}

.login-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
}

.register-link,
.forgot-link {
  color: #409eff;
  text-decoration: none;
  font-size: 14px;
}

.register-link:hover,
.forgot-link:hover {
  color: #66b1ff;
}

/* 移动端响应式适配 */
@media (max-width: 480px) {
  .login-box {
    padding: 30px 20px;
  }
  
  .login-header h1 {
    font-size: 20px;
  }
  
  .login-lang-switch {
    top: 15px;
    right: 15px;
  }
}
</style>
