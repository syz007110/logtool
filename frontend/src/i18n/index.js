import { createI18n } from 'vue-i18n'

// 获取语言设置（本地存储 > 浏览器语言 > 默认中文）
const normalizeLocale = (lang) => {
  if (!lang) return 'zh-CN'
  const lower = String(lang).toLowerCase()
  if (lower.startsWith('en')) return 'en-US'
  return 'zh-CN'
}

const getStoredLocale = () => {
  try {
    const saved = localStorage.getItem('locale')
    if (saved) return saved
  } catch {}
  return normalizeLocale(navigator.language || navigator.userLanguage)
}

const i18n = createI18n({
  legacy: false, // 使用 Vue 3 的 Composition API 模式
  globalInjection: true, // 全局注入 $t 函数
  locale: getStoredLocale(),
  fallbackLocale: 'zh-CN',
  messages: {},
  silentTranslationWarn: true, // 静默翻译警告
  missingWarn: false, // 禁用缺失翻译警告
  fallbackWarn: false // 禁用回退警告
})

export const loadLocaleMessages = async (locale) => {
  const target = locale === 'en' ? 'en-US' : locale
  if (!i18n.global.getLocaleMessage(target) || Object.keys(i18n.global.getLocaleMessage(target) || {}).length === 0) {
    const messages = (await import(/* webpackChunkName: "locale-[request]" */ `./locales/${target}.json`)).default
    i18n.global.setLocaleMessage(target, messages)
  }
  i18n.global.locale.value = target
  try { localStorage.setItem('locale', target) } catch {}
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', target)
}

export const getCurrentLocale = () => i18n.global.locale?.value || 'zh-CN'

export const supportedLocales = ['zh-CN', 'en-US']

export default i18n
