<template>
  <main class="login-page">
    <section class="login-card">
      <div class="language"><el-button text @click="toggleLanguage">{{ currentLocaleLabel }}</el-button></div>
      <h1>{{ isEmergency ? $t('login.emergencyTitle') : $t('login.title') }}</h1>

      <template v-if="!isEmergency">
        <el-tabs v-model="activeTab" class="auth-tabs">
          <el-tab-pane :label="$t('login.dingtalkLogin')" name="dingtalk">
            <p v-if="isDingTalk" class="hint">{{ $t('login.dingtalkIdentityLoading') }}</p>
            <p v-else class="hint">{{ $t('login.qrLoginPending') }}</p>
            <el-button type="primary" size="large" :loading="dingLoading" :disabled="!isDingTalk || !dingtalkEnabled" @click="loginFromDingtalk">{{ $t('login.dingtalkLogin') }}</el-button>
          </el-tab-pane>
          <el-tab-pane v-if="localLoginEnabled" :label="$t('login.tabPassword')" name="local">
            <local-login-form :loading="loading" :require-captcha="requireCaptcha" :captcha-svg="captchaSvg" @submit="submitLocal" @refresh-captcha="fetchCaptcha" />
          </el-tab-pane>
        </el-tabs>
        <el-button text class="emergency-link" @click="isEmergency = true">{{ $t('login.emergencyTitle') }}</el-button>
      </template>

      <template v-else>
        <local-login-form :loading="loading" :require-captcha="requireCaptcha" :captcha-svg="captchaSvg" @submit="submitEmergency" @refresh-captcha="fetchCaptcha" />
        <el-button text class="emergency-link" @click="isEmergency = false">{{ $t('login.backToNormalLogin') }}</el-button>
      </template>
    </section>
  </main>
</template>

<script>
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import * as dd from 'dingtalk-jsapi'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'

const LocalLoginForm = defineComponent({
  name: 'LocalLoginForm',
  props: { loading: Boolean, requireCaptcha: Boolean, captchaSvg: String },
  emits: ['submit', 'refresh-captcha'],
  setup (props, { emit }) {
    const { t } = useI18n()
    const username = ref('')
    const password = ref('')
    const rememberMe = ref(false)
    const captchaCode = ref('')
    const submit = () => emit('submit', { username: username.value, password: password.value, rememberMe: rememberMe.value, captchaCode: captchaCode.value })
    return () => h('form', { class: 'local-form', onSubmit: (event) => { event.preventDefault(); submit() } }, [
      h('input', { value: username.value, placeholder: t('login.username'), autocomplete: 'username', onInput: (event) => { username.value = event.target.value } }),
      h('input', { value: password.value, placeholder: t('login.password'), type: 'password', autocomplete: 'current-password', onInput: (event) => { password.value = event.target.value } }),
      props.requireCaptcha ? h('div', { class: 'captcha' }, [h('div', { innerHTML: props.captchaSvg }), h('input', { value: captchaCode.value, placeholder: t('auth.captchaLabel'), onInput: (event) => { captchaCode.value = event.target.value } }), h('button', { type: 'button', onClick: () => emit('refresh-captcha') }, t('login.refreshCaptcha'))]) : null,
      h('label', [h('input', { type: 'checkbox', checked: rememberMe.value, onChange: (event) => { rememberMe.value = event.target.checked } }), ` ${t('login.rememberMe')}`]),
      h('button', { class: 'primary', disabled: props.loading, type: 'submit' }, props.loading ? t('login.loggingIn') : t('login.login'))
    ])
  }
})

export default {
  name: 'Login',
  components: { LocalLoginForm },
  setup () {
    const { t } = useI18n()
    const authStore = useAuthStore()
    const router = useRouter()
    const activeTab = ref('dingtalk')
    const isEmergency = ref(false)
    const localLoginEnabled = ref(false)
    const dingtalkEnabled = ref(false)
    const loading = ref(false)
    const dingLoading = ref(false)
    const requireCaptcha = ref(false)
    const captchaId = ref('')
    const captchaSvg = ref('')
    const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
    const dingtalkCorpId = env.VITE_DINGTALK_CORP_ID || process.env.VUE_APP_DINGTALK_CORP_ID || ''
    const dingtalkClientId = env.VITE_DINGTALK_APP_KEY || process.env.VUE_APP_DINGTALK_APP_KEY || ''
    const isDingTalk = navigator.userAgent.toLowerCase().includes('dingtalk')
    const currentLocaleLabel = computed(() => getCurrentLocale() === 'en-US' ? t('shared.languageNames.en') : t('shared.languageNames.zh'))

    const finish = (response) => {
      if (response.data.mustChangePassword) router.replace('/dashboard/account')
      else router.replace('/smart-search')
    }
    const fetchCaptcha = async () => {
      const { data } = await api.auth.getCaptcha()
      captchaId.value = data.captchaId
      captchaSvg.value = data.svg
    }
    const submit = async (kind, fields) => {
      loading.value = true
      try {
        const payload = { ...fields }
        if (requireCaptcha.value) payload.captchaId = captchaId.value
        const response = await authStore[kind](payload)
        finish(response)
      } catch (error) {
        if (error.response?.data?.requireCaptcha) { requireCaptcha.value = true; await fetchCaptcha() }
      } finally { loading.value = false }
    }
    const submitLocal = (fields) => submit('login', fields)
    const submitEmergency = (fields) => submit('emergencyLogin', fields)
    const loginFromDingtalk = async () => {
      if (!dd?.runtime?.permission || !dingtalkCorpId || !dingtalkClientId) return
      dingLoading.value = true
      try {
        const authCode = await new Promise((resolve, reject) => dd.runtime.permission.requestAuthCode({ corpId: dingtalkCorpId, clientId: dingtalkClientId, onSuccess: ({ code }) => resolve(code), onFail: reject }))
        finish(await authStore.dingtalkLogin({ authCode, rememberMe: true }))
      } catch (_) { ElMessage.error(t('auth.dingtalkLoginFailed')) } finally { dingLoading.value = false }
    }
    const toggleLanguage = () => loadLocaleMessages(getCurrentLocale() === 'en-US' ? 'zh-CN' : 'en-US')
    onMounted(async () => {
      try {
        const { data } = await api.auth.loginOptions()
        localLoginEnabled.value = data.localLoginEnabled
        dingtalkEnabled.value = data.dingtalkEnabled
        if (!data.dingtalkEnabled && data.localLoginEnabled) activeTab.value = 'local'
      } catch (_) { ElMessage.error(t('auth.configurationUnavailable')) }
    })
    return { activeTab, isEmergency, localLoginEnabled, dingtalkEnabled, loading, dingLoading, requireCaptcha, captchaSvg, isDingTalk, currentLocaleLabel, submitLocal, submitEmergency, loginFromDingtalk, fetchCaptcha, toggleLanguage }
  }
}
</script>

<style scoped>
.login-page { min-height: 100vh; display: grid; place-items: center; background: #fff; padding: 24px; }
.login-card { width: min(100%, 400px); position: relative; }
.language { position: absolute; right: 0; top: -8px; }
h1 { margin: 0 0 28px; text-align: center; font-size: 26px; }
.hint { color: #606266; line-height: 1.6; margin-bottom: 24px; }
.emergency-link { display: block; margin: 28px auto 0; color: #909399; }
.local-form { display: grid; gap: 14px; }
.local-form input:not([type='checkbox']) { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid #dcdfe6; border-radius: 4px; }
.captcha { display: grid; gap: 8px; }
.captcha button { width: max-content; border: 0; color: #409eff; background: transparent; cursor: pointer; }
.primary { height: 40px; border: 0; border-radius: 4px; background: #409eff; color: white; cursor: pointer; }
</style>
