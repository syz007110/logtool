<template>
  <el-alert
    :title="title"
    :type="type"
    :description="description"
    :closable="closable"
    :center="center"
    :show-icon="showIcon"
    :effect="effect"
    v-bind="$attrs"
    @close="$emit('close', $event)"
  />
</template>

<script>
export default {
  name: 'BaseAlert',
  inheritAttrs: false,
  props: {
    title: {
      type: String,
      default: ''
    },
    type: {
      type: String,
      default: 'info',
      validator: (value) => ['success', 'warning', 'info', 'error'].includes(value)
    },
    description: {
      type: String,
      default: ''
    },
    closable: {
      type: Boolean,
      default: true
    },
    center: {
      type: Boolean,
      default: false
    },
    showIcon: {
      type: Boolean,
      default: false
    },
    effect: {
      type: String,
      default: 'light',
      validator: (value) => ['dark', 'light'].includes(value)
    }
  },
  emits: ['close']
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

