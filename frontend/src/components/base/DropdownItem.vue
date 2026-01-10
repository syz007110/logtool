<template>
  <el-dropdown-item
    v-bind="$attrs"
    :command="command"
    :disabled="disabled"
    :divided="divided"
  >
    <slot></slot>
    <template v-if="$slots.icon" #icon>
      <slot name="icon"></slot>
    </template>
  </el-dropdown-item>
</template>

<script>
export default {
  name: 'BaseDropdownItem',
  inheritAttrs: false,
  props: {
    command: {
      type: [String, Number, Object],
      default: null
    },
    disabled: {
      type: Boolean,
      default: false
    },
    divided: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

