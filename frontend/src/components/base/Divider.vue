<template>
  <el-divider
    :direction="direction"
    :content-position="contentPosition"
    :border-style="borderStyle"
    v-bind="$attrs"
  >
    <template v-if="$slots.default" #default>
      <slot></slot>
    </template>
  </el-divider>
</template>

<script>
export default {
  name: 'BaseDivider',
  inheritAttrs: false,
  props: {
    direction: {
      type: String,
      default: 'horizontal',
      validator: (value) => ['horizontal', 'vertical'].includes(value)
    },
    contentPosition: {
      type: String,
      default: 'center',
      validator: (value) => ['left', 'center', 'right'].includes(value)
    },
    borderStyle: {
      type: String,
      default: 'solid',
      validator: (value) => ['solid', 'dashed', 'dotted'].includes(value)
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

