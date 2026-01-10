<template>
  <el-icon
    :size="size"
    :color="color"
    :class="iconClass"
    v-bind="$attrs"
  >
    <slot></slot>
  </el-icon>
</template>

<script>
export default {
  name: 'BaseIcon',
  inheritAttrs: false,
  props: {
    size: {
      type: [String, Number],
      default: undefined
    },
    color: {
      type: String,
      default: undefined
    }
  },
  computed: {
    iconClass() {
      return this.$attrs.class || ''
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

