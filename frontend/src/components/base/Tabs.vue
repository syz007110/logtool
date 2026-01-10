<template>
  <el-tabs
    :model-value="modelValue"
    :type="type"
    :tab-position="tabPosition"
    :closable="closable"
    @tab-click="$emit('tab-click', $event)"
    @tab-change="$emit('tab-change', $event)"
    @tab-remove="$emit('tab-remove', $event)"
  >
    <slot></slot>
  </el-tabs>
</template>

<script>
export default {
  name: 'BaseTabs',
  props: {
    modelValue: {
      type: [String, Number],
      default: ''
    },
    type: {
      type: String,
      default: '',
      validator: (value) => ['', 'card', 'border-card'].includes(value)
    },
    tabPosition: {
      type: String,
      default: 'top',
      validator: (value) => ['top', 'right', 'bottom', 'left'].includes(value)
    },
    closable: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue', 'tab-click', 'tab-change', 'tab-remove']
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
