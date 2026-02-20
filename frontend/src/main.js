import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import i18n, { loadLocaleMessages, getCurrentLocale } from './i18n'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import '@fortawesome/fontawesome-free/css/all.css'
import './assets/styles/i18n-utilities.css'
// 样式导入顺序（必须遵守）：
import 'element-plus/dist/index.css' // 1. Element Plus 基础样式
import './assets/styles/design-tokens.css' // 2. Design Tokens（定义所有设计变量）
import './assets/styles/mobile-design-tokens.css' // 3. Mobile Design Tokens（移动端 scoped 覆盖 & Vant 映射）
import { initResizeObserverFix } from './utils/resizeObserverFix'
import VueDiff from 'vue-diff'
import 'vue-diff/dist/index.css'

// 预加载当前语言后再挂载
const app = createApp(App)

// 初始化 ResizeObserver 错误处理
initResizeObserverFix()

// 全局错误处理
app.config.errorHandler = (err, vm, info) => {
  // 忽略ResizeObserver错误，这是Element Plus的已知问题
  if (err.message && err.message.includes('ResizeObserver loop completed with undelivered notifications')) {
    return
  }
  console.error('Vue Error:', err)
  console.error('Error Info:', info)
  console.error('Component:', vm)
}

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  if (component) {
    app.component(key, component)
  }
}

// 按顺序使用插件
app.use(store)
app.use(router)
app.use(i18n)
app.use(ElementPlus, {
  // 配置Element Plus以减少ResizeObserver的使用
  size: 'default',
  zIndex: 3000,
  // 禁用某些可能导致ResizeObserver错误的特性
  experimentalFeatures: {
    // 禁用某些实验性功能
  }
})

// 注册 Ant Design Vue（用于 Steps 等组件）
app.use(Antd)
// 注册 vue-diff（数据比较弹窗）
app.use(VueDiff)

// 在挂载前设置 <html lang> 并监听语言变化
const setHtmlLang = (loc) => {
  try {
    const lang = String(loc || 'zh').split('-')[0]
    document.documentElement.setAttribute('lang', lang)
  } catch (_) {}
}

setHtmlLang(getCurrentLocale())

// 监听语言变化（vue-i18n v9）
try {
  const stop = app.config.globalProperties?.$i18n
    ? app.config.globalProperties.$watch?.(() => app.config.globalProperties.$i18n.locale, (loc) => setHtmlLang(loc))
    : null
} catch (_) {}

// 确保当前语言包加载完成后再挂载
loadLocaleMessages(getCurrentLocale()).then(() => {
  app.mount('#app')
}).catch(() => {
  app.mount('#app')
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.error('Service worker registration failed:', err)
    })
  })
}
