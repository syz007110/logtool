<template>
  <el-checkbox-group
    v-bind="$attrs"
    :model-value="modelValue"
    :size="elSize"
    :disabled="disabled"
    :min="min"
    :max="max"
    @change="$emit('update:modelValue', $event); $emit('change', $event)"
  >
    <slot></slot>
  </el-checkbox-group>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseCheckboxGroup',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: Array,
      default: () => []
    },
    size: {
      type: String,
      default: '',
      validator: (value) => ['', 'large', 'default', 'small'].includes(value)
    },
    disabled: {
      type: Boolean,
      default: false
    },
    min: {
      type: Number,
      default: null
    },
    max: {
      type: Number,
      default: null
    }
  },
  emits: ['update:modelValue', 'change'],
  setup(props) {
    const elSize = computed(() => props.size || 'default')

    return {
      elSize
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

