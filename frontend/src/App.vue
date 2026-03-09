<template>
  <div id="app">
    <el-config-provider :locale="elementLocale">
      <router-view />
    </el-config-provider>

    <SplashScreen v-if="showSplash" :leaving="splashLeaving" />
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import SplashScreen from './components/SplashScreen.vue'

const SPLASH_COMPLETE_HOLD_MS = 250
const SPLASH_HARD_MAX_MS = 4000
const SPLASH_LEAVE_MS = 240

export default {
  name: 'App',
  components: { SplashScreen },
  setup() {
    const { locale } = useI18n()
    const elementLocale = computed(() => (String(locale.value).startsWith('en') ? en : zhCn))

    const showSplash = ref(__APP_TARGET__ === 'mobile')
    const splashLeaving = ref(false)
    let cleanupTimer = null
    let completeHoldTimer = null
    let hardMaxTimer = null
    let bootReady = false
    let splashAnimComplete = false

    const clearTimers = () => {
      if (cleanupTimer) clearTimeout(cleanupTimer)
      if (completeHoldTimer) clearTimeout(completeHoldTimer)
      if (hardMaxTimer) clearTimeout(hardMaxTimer)
      cleanupTimer = null
      completeHoldTimer = null
      hardMaxTimer = null
    }

    const hideSplash = () => {
      if (!showSplash.value || splashLeaving.value) return
      splashLeaving.value = true
      cleanupTimer = setTimeout(() => {
        showSplash.value = false
      }, SPLASH_LEAVE_MS)
    }

    const tryFinishSplash = () => {
      if (!showSplash.value) return
      if (!(bootReady && splashAnimComplete)) return
      if (completeHoldTimer) return

      completeHoldTimer = setTimeout(() => {
        hideSplash()
      }, SPLASH_COMPLETE_HOLD_MS)
    }

    const onBootReady = () => {
      bootReady = true
      tryFinishSplash()
    }

    const onSplashComplete = () => {
      splashAnimComplete = true
      tryFinishSplash()
    }

    watch(showSplash, (visible) => {
      if (visible) {
        document.body.classList.add('splash-lock')
      } else {
        document.body.classList.remove('splash-lock')
      }
    }, { immediate: true })

    onMounted(() => {
      if (!showSplash.value) return

      hardMaxTimer = setTimeout(() => {
        hideSplash()
      }, SPLASH_HARD_MAX_MS)

      window.addEventListener('app:boot-ready', onBootReady, { once: true })
      window.addEventListener('app:splash-complete', onSplashComplete, { once: true })

      if (window.__APP_BOOT_READY__ === true) {
        onBootReady()
      }
    })

    onBeforeUnmount(() => {
      clearTimers()
      window.removeEventListener('app:boot-ready', onBootReady)
      window.removeEventListener('app:splash-complete', onSplashComplete)
      document.body.classList.remove('splash-lock')
    })

    return { elementLocale, showSplash, splashLeaving }
  }
}
</script>

<style>
* {
  box-sizing: border-box;
}

.el-tabs__content {
  contain: layout style paint;
}

.el-tab-pane {
  contain: layout style paint;
}

.el-card {
  contain: layout style paint;
}

.el-table {
  contain: layout style paint;
}

.el-tabs__item {
  will-change: auto;
}

.el-card__body {
  will-change: auto;
}

.el-collapse-transition {
  transition: height 0.3s ease-in-out, padding-top 0.3s ease-in-out, padding-bottom 0.3s ease-in-out;
}

.el-tabs__item.is-active {
  transition: none !important;
}

.el-button {
  transition: none !important;
}

.el-tabs__item {
  transition: none !important;
}

.el-tabs__content {
  transition: none !important;
}

.el-tab-pane {
  transition: none !important;
}

.el-tabs * {
  transition: none !important;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0;
  padding: 0;
}

body.splash-lock {
  overflow: hidden;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

@media (max-width: 768px) {
  .page {
    padding-bottom: max(0px, env(safe-area-inset-bottom) - 20px) !important;
  }
}
</style>
