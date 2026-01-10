<template>
  <el-dropdown-menu
    v-bind="$attrs"
  >
    <slot></slot>
  </el-dropdown-menu>
</template>

<script>
export default {
  name: 'BaseDropdownMenu',
  inheritAttrs: false
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

