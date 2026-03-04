<template>
  <div id="app">
    <el-config-provider :locale="elementLocale">
      <router-view />
    </el-config-provider>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

export default {
  name: 'App',
  setup() {
    const { locale } = useI18n()
    const elementLocale = computed(() => (String(locale.value).startsWith('en') ? en : zhCn))
    return { elementLocale }
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
