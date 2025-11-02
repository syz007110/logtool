<template>
  <div class="mobile-login-container">
    <div class="login-content">
      <!-- Logo and Title -->
      <div class="login-header">
        <div class="logo-container">
          <div class="logo-icon">
            <img src="/Icons/logo.svg" alt="Logo" />
          </div>
        </div>
        <h1 class="title">{{ $t('mobile.login.title') }}</h1>
        <p class="subtitle">{{ $t('mobile.login.subtitle') }}</p>
      </div>
      
      <!-- Login Form -->
      <div class="login-form">
        <van-cell-group inset>
          <van-field
            v-model="formData.username"
            :label="$t('login.username')"
            :placeholder="$t('login.validation.usernameRequired')"
            clearable
          />
          <van-field
            v-model="formData.password"
            type="password"
            :label="$t('login.password')"
            :placeholder="$t('login.validation.passwordRequired')"
            clearable
            show-password
          />
        </van-cell-group>
        <van-button
          type="primary"
          block
          size="large"
          :loading="loading"
          :disabled="!canLogin"
          @click="handleLogin"
        >
          {{ $t('login.login') }}
        </van-button>
      </div>
      
      <!-- Test Accounts -->
      <div class="test-accounts">
        <p class="test-accounts-title">{{ $t('mobile.login.testAccount') }}</p>
        <p class="test-account-item">{{ $t('mobile.login.admin') }}</p>
        <p class="test-account-item">{{ $t('mobile.login.user') }}</p>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="login-footer">
      <p>{{ $t('mobile.login.copyright') }}</p>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { CellGroup as VanCellGroup, Field as VanField, Button as VanButton } from 'vant'

export default {
  name: 'MobileLogin',
  components: {
    'van-cell-group': VanCellGroup,
    'van-field': VanField,
    'van-button': VanButton
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()
    
    const formData = reactive({
      username: '',
      password: ''
    })
    
    const loading = ref(false)
    
    const canLogin = computed(() => {
      return formData.username.trim() && formData.password.trim()
    })
    
    const handleLogin = async () => {
      if (!canLogin.value) {
        showToast(t('login.validation.usernameRequired'))
        return
      }
      
      try {
        loading.value = true
        await store.dispatch('auth/login', {
          username: formData.username,
          password: formData.password
        })
        showToast(t('login.loginSuccess'))
        router.push('/m')
      } catch (error) {
        console.error('登录失败:', error)
      } finally {
        loading.value = false
      }
    }
    
    return {
      formData,
      loading,
      canLogin,
      handleLogin
    }
  }
}
</script>

<style scoped>
.mobile-login-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
}

.login-content {
  width: 100%;
  max-width: 640px;
}

.login-header {
  text-align: center;
  margin-bottom: 48px;
}

.logo-container {
  display: flex;
  justify-content: center;
  margin-bottom: 96px;
}

.logo-icon {
  width: 80px;
  height: 80px;
  background: #2b7fff;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.logo-icon img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.title {
  font-size: 30px;
  font-weight: 500;
  color: #0f172a;
  margin: 0 0 24px 0;
  font-family: 'Arimo', 'Noto Sans SC', sans-serif;
}

.subtitle {
  font-size: 16px;
  color: #6a7282;
  margin: 0;
  font-family: 'Arimo', 'Noto Sans SC', sans-serif;
}

.login-form {
  margin-bottom: 28px;
}

.login-form :deep(.van-cell-group) {
  border-radius: 8px;
  overflow: hidden;
}

.login-form :deep(.van-field) {
  background: #f3f3f5;
  border-radius: 8px;
  margin-bottom: 20px;
}

.login-form :deep(.van-field__control) {
  font-size: 14px;
}

.login-form :deep(.van-button) {
  border-radius: 8px;
  background: #030213;
  border: none;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
}

.login-form :deep(.van-button--disabled) {
  background: #e5e7eb !important;
  color: #9ca3af !important;
}

.test-accounts {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 32px;
  text-align: center;
}

.test-accounts-title {
  font-size: 14px;
  color: #6a7282;
  margin: 0 0 8px 0;
  font-weight: 500;
}

.test-account-item {
  font-size: 12px;
  color: #99a1af;
  margin: 4px 0;
  line-height: 1.5;
}

.login-footer {
  text-align: center;
  padding-bottom: 32px;
  width: 100%;
}

.login-footer p {
  font-size: 12px;
  color: #99a1af;
  margin: 0;
}
</style>

