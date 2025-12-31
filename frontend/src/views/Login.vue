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
        
        <el-form-item class="login-actions">
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
import { ref, reactive, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'
import { InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import * as dd from 'dingtalk-jsapi'

export default {
  name: 'Login',
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
        const isMobileContext = window.location.pathname.startsWith('/m')
        router.push(isMobileContext ? '/m' : '/smart-search')
      } catch (error) {
        // 不在这里显示错误信息，因为响应拦截器已经处理了
        console.error('登录失败:', error)
      } finally {
        loading.value = false
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
      formData,
      loading,
      dingLoading,
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
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-box {
  background: white;
  border-radius: 10px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  padding: 40px;
  width: 400px;
  max-width: 90vw;
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
  flex: 1;
  height: 45px;
  font-size: 16px;
}

.login-actions {
  display: flex;
  gap: 12px;
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

</style> 