<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style>
/* 全局样式优化，减少ResizeObserver错误 */
* {
  box-sizing: border-box;
}

/* 优化Element Plus组件的渲染性能 */
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

/* 减少不必要的重绘 */
.el-tabs__item {
  will-change: auto;
}

.el-card__body {
  will-change: auto;
}

/* 优化动画性能 */
.el-collapse-transition {
  transition: height 0.3s ease-in-out, padding-top 0.3s ease-in-out, padding-bottom 0.3s ease-in-out;
}

/* 禁用某些可能导致ResizeObserver错误的动画 */
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

/* 禁用所有可能导致ResizeObserver错误的过渡动画 */
.el-tabs * {
  transition: none !important;
}

/* 全局字体设置 */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0;
  padding: 0;
}

/* 滚动条样式 */
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
</style> 