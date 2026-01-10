<template>
  <div class="login-container">
    <!-- 左侧背景区 -->
    <div class="login-left">
      <svg class="bg-pattern" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="rgb(var(--primary))"/>
        <rect width="100%" height="100%" fill="url(#grid)"/>
        <!-- 装饰性几何图形 -->
        <circle cx="200" cy="200" r="150" fill="rgba(255, 255, 255, 0.03)"/>
        <circle cx="800" cy="300" r="200" fill="rgba(255, 255, 255, 0.02)"/>
        <circle cx="300" cy="700" r="180" fill="rgba(255, 255, 255, 0.025)"/>
        <circle cx="750" cy="750" r="120" fill="rgba(255, 255, 255, 0.03)"/>
      </svg>
    </div>

    <!-- 右侧表单区 -->
    <div class="login-right">
      <!-- 语言切换器 -->
      <div class="lang-switch">
        <el-dropdown @command="changeLanguage" trigger="click">
          <el-button type="text" class="lang-button">
            <el-icon><Setting /></el-icon>
            <span>{{ currentLocaleLabel }}</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
              <el-dropdown-item command="en-US">English</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <!-- 主要内容区 -->
      <div class="form-content">
        <h1 class="welcome-title">{{ $t('login.welcomeBack') }}</h1>
        <p class="welcome-subtitle">{{ $t('login.welcomeSubtitle') }}</p>

        <!-- 标签页切换 -->
        <el-tabs v-model="activeTab" class="auth-tabs">
          <!-- 登录标签页 -->
          <el-tab-pane :label="$t('login.login')" name="login">
            <el-form 
              ref="loginForm" 
              :model="loginFormData" 
              :rules="loginRules" 
              class="auth-form"
              @submit.prevent="handleLogin"
            >
              <el-form-item prop="username">
                <el-input
                  v-model="loginFormData.username"
                  :placeholder="$t('login.username')"
                  size="large"
                />
              </el-form-item>
              
              <el-form-item prop="password">
                <div class="password-wrapper">
                  <el-input
                    v-model="loginFormData.password"
                    type="password"
                    :placeholder="$t('login.password')"
                    size="large"
                    show-password
                  />
                  <a href="#" class="forgot-link">{{ $t('login.forgotPassword') }}</a>
                </div>
              </el-form-item>
              
              <el-form-item>
                <el-button 
                  type="primary" 
                  size="large" 
                  class="submit-button"
                  :loading="loading"
                  @click="handleLogin"
                >
                  {{ $t('login.login') }}
                </el-button>
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <!-- 注册标签页 -->
          <el-tab-pane :label="$t('login.register')" name="register">
            <el-form 
              ref="registerForm" 
              :model="registerFormData" 
              :rules="registerRules" 
              class="auth-form"
              @submit.prevent="handleRegister"
            >
              <el-form-item prop="username">
                <el-input
                  v-model="registerFormData.username"
                  :placeholder="$t('register.username')"
                  size="large"
                />
              </el-form-item>

              <el-form-item prop="email">
                <el-input
                  v-model="registerFormData.email"
                  :placeholder="$t('register.email')"
                  size="large"
                />
              </el-form-item>
              
              <el-form-item prop="password">
                <el-input
                  v-model="registerFormData.password"
                  type="password"
                  :placeholder="$t('register.password')"
                  size="large"
                  show-password
                />
              </el-form-item>

              <el-form-item prop="confirmPassword">
                <el-input
                  v-model="registerFormData.confirmPassword"
                  type="password"
                  :placeholder="$t('register.confirmPassword')"
                  size="large"
                  show-password
                />
              </el-form-item>
              
              <el-form-item>
                <el-button 
                  type="primary" 
                  size="large" 
                  class="submit-button"
                  :loading="registerLoading"
                  @click="handleRegister"
                >
                  {{ $t('register.register') }}
                </el-button>
              </el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'
import { Setting } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import * as dd from 'dingtalk-jsapi'

export default {
  name: 'Login',
  components: { Setting },
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()
    const loginForm = ref(null)
    const registerForm = ref(null)
    
    const activeTab = ref('login')
    const loading = ref(false)
    const registerLoading = ref(false)
    const dingLoading = ref(false)
    const autoLoginTried = ref(false)
    
    // H5 免登所需 corpId / appKey，允许从 URL ?corpid= 透传
    const urlParams = new URLSearchParams(window.location.search)
    const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
    const dingtalkCorpId = urlParams.get('corpid') || urlParams.get('corpId') || process.env.VUE_APP_DINGTALK_CORP_ID || process.env.VITE_DINGTALK_CORP_ID || viteEnv.VITE_DINGTALK_CORP_ID || ''
    const dingtalkAppKey = process.env.VUE_APP_DINGTALK_APP_KEY || process.env.VITE_DINGTALK_APP_KEY || viteEnv.VITE_DINGTALK_APP_KEY || ''
    const isDingTalkUA = navigator.userAgent.toLowerCase().includes('dingtalk')
    
    // 暴露调试用环境变量，方便控制台查看是否注入成功
    if (typeof window !== 'undefined') {
      window.__DD_DEBUG__ = {
        appKey: dingtalkAppKey,
        corpId: dingtalkCorpId,
        isDingTalkUA
      }
    }
    
    const loginFormData = reactive({
      username: '',
      password: ''
    })

    const registerFormData = reactive({
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    })
    
    const currentLanguage = computed(() => store.getters['auth/currentLanguage'])
    const currentLocaleLabel = computed(() => (getCurrentLocale() === 'en-US' ? 'English' : '中文'))
    
    const validateConfirmPassword = (rule, value, callback) => {
      if (value !== registerFormData.password) {
        callback(new Error(t('register.validation.passwordMismatch')))
      } else {
        callback()
      }
    }

    const loginRules = computed(() => ({
      username: [
        { required: true, message: t('login.validation.usernameRequired'), trigger: 'blur' }
      ],
      password: [
        { required: true, message: t('login.validation.passwordRequired'), trigger: 'blur' }
      ]
    }))

    const registerRules = computed(() => ({
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
        { min: 6, message: t('register.validation.passwordMinLength'), trigger: 'blur' }
      ],
      confirmPassword: [
        { required: true, message: t('register.validation.confirmPasswordRequired'), trigger: 'blur' },
        { validator: validateConfirmPassword, trigger: 'blur' }
      ]
    }))
    
    const handleLogin = async () => {
      try {
        await loginForm.value.validate()
        loading.value = true
        
        await store.dispatch('auth/login', loginFormData)
        ElMessage.success(t('login.loginSuccess'))
        const isMobileContext = window.location.pathname.startsWith('/m')
        router.push(isMobileContext ? '/m' : '/smart-search')
      } catch (error) {
        // 不在这里显示错误信息，因为响应拦截器已经处理了
        console.error('登录失败:', error)
      } finally {
        loading.value = false
      }
    }

    const handleRegister = async () => {
      try {
        await registerForm.value.validate()
        registerLoading.value = true
        
        const { confirmPassword, ...registerData } = registerFormData
        await store.dispatch('auth/register', registerData)
        ElMessage.success(t('register.registerSuccess'))
        activeTab.value = 'login'
        // 清空注册表单
        Object.assign(registerFormData, {
          username: '',
          email: '',
          password: '',
          confirmPassword: ''
        })
      } catch (error) {
        ElMessage.error(error.response?.data?.message || t('register.registerFailed'))
      } finally {
        registerLoading.value = false
      }
    }

    const handleDingTalkCallback = async () => {
      const params = new URLSearchParams(window.location.search)
      const authCode = params.get('authCode') || params.get('code')
      if (!authCode) return
      try {
        dingLoading.value = true
        await store.dispatch('auth/dingtalkLogin', { authCode })
        ElMessage.success(t('login.loginSuccess'))
        router.replace('/smart-search')
      } catch (error) {
        console.error('DingTalk callback login failed:', error)
      } finally {
        dingLoading.value = false
      }
    }
    
    const changeLanguage = async (language) => {
      await loadLocaleMessages(language)
    }

    const tryAutoDingTalkLogin = async () => {
      if (autoLoginTried.value) return
      autoLoginTried.value = true
      // 仅在钉钉容器内尝试免登
      if (!isDingTalkUA) return
      if (!dingtalkCorpId || !dingtalkAppKey) return
      if (!dd || !dd.runtime || !dd.runtime.permission) return
      try {
        const { code } = await new Promise((resolve, reject) => {
          dd.runtime.permission.requestAuthCode({
            corpId: dingtalkCorpId,
            clientId: dingtalkAppKey,
            onSuccess: res => resolve(res),
            onFail: err => reject(err)
          })
        })
        await store.dispatch('auth/dingtalkLogin', { authCode: code })
        ElMessage.success(t('login.loginSuccess'))
        router.replace('/smart-search')
      } catch (error) {
        console.error('Auto DingTalk login failed:', error)
      }
    }

    onMounted(() => {
      handleDingTalkCallback()
      tryAutoDingTalkLogin()
    })
    
    return {
      loginForm,
      registerForm,
      loginFormData,
      registerFormData,
      activeTab,
      loading,
      registerLoading,
      loginRules,
      registerRules,
      currentLanguage,
      currentLocaleLabel,
      handleLogin,
      handleRegister,
      changeLanguage,
      Setting
    }
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  width: 100%;
}

/* 左侧背景区 - 60% */
.login-left {
  width: 60%;
  background: rgb(var(--primary));
  position: relative;
  overflow: hidden;
}

.bg-pattern {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

/* 右侧操作区 - 40% */
.login-right {
  width: 40%;
  background: rgb(var(--bg-secondary));
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 3rem;
}

.lang-switch {
  position: absolute;
  top: 2rem;
  right: 2rem;
  z-index: 10;
}

.lang-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: rgb(var(--text-primary));
  padding: 0.5rem 1rem;
}

.form-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 400px;
  width: 100%;
  margin: 0 auto;
}

.welcome-title {
  font-size: 2rem;
  font-weight: 700;
  color: rgb(var(--text-primary));
  margin: 0 0 0.5rem 0;
}

.welcome-subtitle {
  font-size: 1rem;
  color: rgb(var(--text-secondary));
  margin: 0 0 2rem 0;
}

.auth-tabs {
  margin-top: 2rem;
}

.auth-form {
  margin-top: 1.5rem;
}

.password-wrapper {
  width: 100%;
  position: relative;
}

.forgot-link {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.875rem;
  color: rgb(var(--text-brand-primary));
  text-decoration: none;
  padding-right: 0.75rem;
  z-index: 1;
}

.forgot-link:hover {
  color: rgb(var(--text-brand-primary-hover));
}

.submit-button {
  width: 100%;
  height: 48px;
  font-size: 1rem;
  font-weight: 500;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .login-container {
    flex-direction: column;
  }

  .login-left {
    width: 100%;
    min-height: 30vh;
  }

  .login-right {
    width: 100%;
    padding: 2rem;
  }
}
</style>
