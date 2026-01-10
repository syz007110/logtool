<template>
  <el-tooltip
    :content="content"
    :placement="placement"
    :effect="effect"
    :disabled="disabled"
    :offset="offset"
    :transition="transition"
    :popper-options="popperOptions"
    :show-after="showAfter"
    :hide-after="hideAfter"
    :trigger="trigger"
    :raw-content="rawContent"
    v-bind="$attrs"
  >
    <template #default>
      <slot></slot>
    </template>
  </el-tooltip>
</template>

<script>
export default {
  name: 'BaseTooltip',
  inheritAttrs: false,
  props: {
    content: {
      type: String,
      default: ''
    },
    placement: {
      type: String,
      default: 'top',
      validator: (value) => ['top', 'top-start', 'top-end', 'bottom', 'bottom-start', 'bottom-end', 'left', 'left-start', 'left-end', 'right', 'right-start', 'right-end'].includes(value)
    },
    effect: {
      type: String,
      default: 'dark',
      validator: (value) => ['dark', 'light'].includes(value)
    },
    disabled: {
      type: Boolean,
      default: false
    },
    offset: {
      type: Number,
      default: 12
    },
    transition: {
      type: String,
      default: 'el-fade-in-linear'
    },
    popperOptions: {
      type: Object,
      default: () => ({})
    },
    showAfter: {
      type: Number,
      default: 0
    },
    hideAfter: {
      type: Number,
      default: 0
    },
    trigger: {
      type: String,
      default: 'hover',
      validator: (value) => ['hover', 'click', 'focus', 'contextmenu'].includes(value)
    },
    rawContent: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

