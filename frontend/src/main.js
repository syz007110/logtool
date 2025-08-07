import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import i18n from './i18n'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import '@fortawesome/fontawesome-free/css/all.css'
import { initResizeObserverFix } from './utils/resizeObserverFix'

// 创建应用实例
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



// 挂载应用
app.mount('#app') 