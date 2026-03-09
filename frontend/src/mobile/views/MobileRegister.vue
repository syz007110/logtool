<template>
  <div class="mobile-register-page">
    <div class="mobile-register-shell">
      <div class="mobile-register-lang">
        <el-dropdown @command="changeLanguage" trigger="click">
          <el-button text class="lang-btn">
            <el-icon><InfoFilled /></el-icon>
            {{ currentLocaleLabel }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="zh-CN">{{ $t('shared.languageNames.zh') }}</el-dropdown-item>
              <el-dropdown-item command="en-US">{{ $t('shared.languageNames.en') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="mobile-register-card">
        <div class="mobile-register-brand">
          <img :src="logoUrl" alt="LogTool" class="brand-logo" />
          <p class="brand-subtitle">{{ $t('mobile.login.subtitle') }}</p>
        </div>

        <div class="mobile-register-header">
          <h1>{{ $t('register.title') }}</h1>
        </div>

        <el-form ref="registerForm" :model="formData" :rules="rules" class="mobile-register-form">
          <el-form-item prop="username">
            <el-input v-model="formData.username" :placeholder="$t('register.username')" :prefix-icon="User" size="large" clearable />
          </el-form-item>

          <el-form-item prop="email">
            <el-input v-model="formData.email" :placeholder="$t('register.email')" :prefix-icon="Message" size="large" clearable />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="formData.password"
              type="password"
              :placeholder="$t('register.password')"
              :prefix-icon="Lock"
              size="large"
              show-password
            />
          </el-form-item>

          <el-form-item prop="confirmPassword">
            <el-input
              v-model="formData.confirmPassword"
              type="password"
              :placeholder="$t('register.confirmPassword')"
              :prefix-icon="Lock"
              size="large"
              show-password
            />
          </el-form-item>

          <el-form-item class="register-submit-item">
            <el-button type="primary" size="large" class="register-button" :loading="loading" @click="handleRegister">
              {{ $t('register.register') }}
            </el-button>
          </el-form-item>
        </el-form>

        <div class="mobile-register-footer">
          <router-link to="/m/login" class="back-to-login">{{ $t('register.backToLogin') }}</router-link>
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
import { InfoFilled, User, Message, Lock } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { validatePasswordStrength } from '@/utils/passwordStrength'

function resolveBaseLogoUrl() {
  const rawBase = process.env.BASE_URL || '/'
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
  return `${normalizedBase}Icons/logo-text.svg`
}

export default {
  name: 'MobileRegister',
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
    const logoUrl = resolveBaseLogoUrl()
    const currentLocaleLabel = computed(() =>
      getCurrentLocale() === 'en-US' ? t('shared.languageNames.en') : t('shared.languageNames.zh')
    )

    const validateConfirmPassword = (rule, value, callback) => {
      if (value !== formData.password) {
        callback(new Error(t('register.validation.passwordMismatch')))
      } else {
        callback()
      }
    }

    const validatePassword = (rule, value, callback) => {
      const r = validatePasswordStrength(value, formData.username)
      if (!r.valid) callback(new Error(t('passwordStrength.' + (r.messageKey || 'minLength'))))
      else callback()
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
        router.push('/m/login')
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
      currentLocaleLabel,
      logoUrl,
      changeLanguage,
      handleRegister,
      InfoFilled,
      User,
      Message,
      Lock
    }
  }
}
</script>

<style scoped>
.mobile-register-page {
  min-height: 100%;
  height: 100%;
  background: var(--m-color-bg);
  box-sizing: border-box;
}

.mobile-register-shell {
  min-height: 100%;
  padding: calc(env(safe-area-inset-top) + var(--m-space-4)) var(--m-space-4) var(--m-space-4);
  background: var(--m-gradient-auth-bg);
}

.mobile-register-lang {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--m-space-3);
}

.lang-btn {
  color: var(--m-color-text-secondary);
  font-weight: var(--m-font-weight-semibold);
}

.mobile-register-card {
  background: var(--m-auth-card-bg);
  border: 1px solid var(--m-auth-card-border);
  border-radius: var(--m-radius-xl);
  padding: 18px var(--m-space-4) var(--m-space-4);
  box-shadow: var(--m-shadow-lg);
}

.mobile-register-brand {
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

.mobile-register-header h1 {
  margin: 0;
  color: var(--m-color-text);
  font-size: var(--m-font-size-2xl);
  line-height: var(--m-line-height-tight);
  font-weight: var(--m-font-weight-bold);
}

.mobile-register-form {
  margin-top: 16px;
}

.mobile-register-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.mobile-register-form :deep(.el-input__wrapper) {
  min-height: var(--m-input-height-md);
  border-radius: var(--m-input-radius);
  background: var(--m-input-bg);
  box-shadow: 0 0 0 1px var(--m-input-border-color) inset;
}

.mobile-register-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--m-input-border-color-focus) inset;
}

.register-submit-item {
  margin-top: 4px;
  margin-bottom: 0;
}

.register-button {
  width: 100%;
  height: var(--m-button-height-md);
  border-radius: var(--m-button-radius);
  font-size: var(--m-button-font-size);
  font-weight: var(--m-button-font-weight);
}

.mobile-register-footer {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.back-to-login {
  color: var(--m-color-brand);
  text-decoration: none;
  font-size: var(--m-font-size-md);
  font-weight: var(--m-font-weight-semibold);
}
</style>
