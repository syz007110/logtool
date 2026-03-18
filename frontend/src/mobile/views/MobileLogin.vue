<template>
  <div class="mobile-login-page">
    <div class="mobile-login-shell">
      <div class="mobile-login-card">
        <div class="mobile-login-lang">
          <el-dropdown @command="changeLanguage" trigger="click">
            <el-button text class="lang-btn">
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
        <div class="mobile-login-brand">
          <img :src="logoUrl" alt="LogTool" class="brand-logo" />
          <p class="brand-subtitle">{{ $t('mobile.login.subtitle') }}</p>
        </div>

        <div class="mobile-login-header">
          <h1>{{ $t('login.welcomeBack') }}</h1>
          <p>{{ $t('login.welcomeSubtitle') }}</p>
        </div>

        <el-form
          ref="loginForm"
          :model="formData"
          :rules="rules"
          class="mobile-login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="formData.username"
              :placeholder="$t('login.username')"
              :prefix-icon="User"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="formData.password"
              type="password"
              :placeholder="$t('login.password')"
              :prefix-icon="Lock"
              size="large"
              show-password
            />
          </el-form-item>

          <el-form-item class="remember-me-item">
            <el-checkbox v-model="formData.rememberMe">
              {{ $t('login.rememberMe') }}
            </el-checkbox>
          </el-form-item>

          <el-form-item v-if="requireCaptcha" prop="captchaCode" class="captcha-form-item">
            <div class="captcha-row">
              <div class="captcha-svg" v-html="captchaSvg" />
              <el-button text type="primary" @click="fetchCaptcha" :loading="captchaLoading">{{ $t('shared.refresh') }}</el-button>
            </div>
            <el-input
              v-model="formData.captchaCode"
              :placeholder="$t('auth.captchaRequired')"
              size="large"
              maxlength="6"
              style="margin-top: 8px"
            />
          </el-form-item>

          <el-form-item class="login-submit-item">
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

        <div class="mobile-login-footer">
          <router-link to="/m/register" class="register-link">
            {{ $t('login.register') }}
          </router-link>
        </div>
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
import { InfoFilled, User, Lock } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'

function resolveBaseLogoUrl() {
  const rawBase = process.env.BASE_URL || '/'
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
  return `${normalizedBase}Icons/logo-text.svg`
}

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
      password: '',
      captchaCode: '',
      rememberMe: false
    })

    const loading = ref(false)
    const requireCaptcha = ref(false)
    const captchaId = ref('')
    const captchaSvg = ref('')
    const captchaLoading = ref(false)
    const logoUrl = resolveBaseLogoUrl()

    const currentLocaleLabel = computed(() =>
      getCurrentLocale() === 'en-US' ? 'English' : '中文'
    )

    const rules = computed(() => ({
      username: [{ required: true, message: t('login.validation.usernameRequired'), trigger: 'blur' }],
      password: [{ required: true, message: t('login.validation.passwordRequired'), trigger: 'blur' }],
      captchaCode: [{ required: requireCaptcha.value, message: t('auth.captchaRequired'), trigger: 'blur' }]
    }))

    const fetchCaptcha = async () => {
      try {
        captchaLoading.value = true
        const { data } = await api.auth.getCaptcha()
        captchaId.value = data.id
        captchaSvg.value = data.svg || ''
        formData.captchaCode = ''
      } catch (_) {
        requireCaptcha.value = false
      } finally {
        captchaLoading.value = false
      }
    }

    const handleLogin = async () => {
      try {
        await loginForm.value.validate()
        if (requireCaptcha.value && !formData.captchaCode?.trim()) {
          ElMessage.warning(t('auth.captchaRequired'))
          return
        }
        loading.value = true

        const payload = {
          username: formData.username,
          password: formData.password,
          rememberMe: !!formData.rememberMe
        }

        if (requireCaptcha.value) {
          payload.captchaId = captchaId.value
          payload.captchaCode = formData.captchaCode.trim()
        }

        const res = await store.dispatch('auth/login', payload)
        ElMessage.success(t('login.loginSuccess'))
        requireCaptcha.value = false
        if (res?.data?.mustChangePassword) {
          router.push('/m/profile')
        } else {
          router.push('/m')
        }
      } catch (error) {
        const d = error?.response?.data
        if ((error?.response?.status === 401 || error?.response?.status === 400) && d?.requireCaptcha) {
          requireCaptcha.value = true
          fetchCaptcha()
        }
        console.error('Login failed:', error)
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
      currentLocaleLabel,
      logoUrl,
      requireCaptcha,
      captchaSvg,
      captchaLoading,
      fetchCaptcha,
      handleLogin,
      changeLanguage,
      InfoFilled,
      User,
      Lock
    }
  }
}
</script>

<style scoped>
.mobile-login-page {
  position: fixed;
  inset: 0;
  min-height: 100dvh;
  height: 100dvh;
  background: var(--m-color-bg);
  box-sizing: border-box;
  overflow: hidden;
}

.mobile-login-shell {
  min-height: 100%;
  height: 100%;
  padding: calc(env(safe-area-inset-top) + var(--m-space-4)) var(--m-space-4) var(--m-space-4);
  background: var(--m-gradient-auth-bg);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.mobile-login-lang {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--m-space-3);
}

.lang-btn {
  color: var(--m-color-text-secondary);
  font-weight: var(--m-font-weight-semibold);
}

.mobile-login-card {
  background: var(--m-auth-card-bg);
  border: 1px solid var(--m-auth-card-border);
  border-radius: var(--m-radius-xl);
  padding: 18px var(--m-space-4) var(--m-space-4);
  box-shadow: var(--m-shadow-lg);
}

.mobile-login-brand {
  padding: 2px 2px 10px;
}

.brand-logo {
  width: 186px;
  max-width: 100%;
  height: auto;
  display: block;
}

.brand-subtitle {
  margin: var(--m-space-2) 0 0;
  color: var(--m-color-text-tertiary);
  font-size: 13px;
}

.mobile-login-header h1 {
  margin: 0;
  color: var(--m-color-text);
  font-size: var(--m-font-size-2xl);
  line-height: var(--m-line-height-tight);
  font-weight: var(--m-font-weight-bold);
}

.mobile-login-header p {
  margin: var(--m-space-2) 0 0;
  color: var(--m-color-text-secondary);
  font-size: var(--m-font-size-md);
}

.mobile-login-form {
  margin-top: 18px;
}

.mobile-login-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.mobile-login-form :deep(.el-input__wrapper) {
  min-height: var(--m-input-height-md);
  border-radius: var(--m-input-radius);
  background: var(--m-input-bg);
  box-shadow: 0 0 0 1px var(--m-input-border-color) inset;
}

.mobile-login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--m-input-border-color-focus) inset;
}

.captcha-form-item {
  margin-bottom: 12px;
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.captcha-svg {
  width: 120px;
  height: 40px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--m-radius-sm);
  border: 1px solid var(--m-color-border);
  background: var(--m-color-surface);
}

.captcha-svg :deep(svg) {
  max-width: 100%;
  max-height: 100%;
}

.login-submit-item {
  margin-top: 4px;
  margin-bottom: 0;
}

.login-button {
  width: 100%;
  height: var(--m-button-height-md);
  border-radius: var(--m-button-radius);
  font-size: var(--m-button-font-size);
  font-weight: var(--m-button-font-weight);
}

.mobile-login-footer {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.register-link {
  color: var(--m-color-brand);
  text-decoration: none;
  font-size: var(--m-font-size-md);
  font-weight: 600;
}

@media (max-height: 680px) {
  .mobile-login-header h1 {
    font-size: 22px;
  }

  .mobile-login-card {
    padding-top: 14px;
  }
}
</style>
