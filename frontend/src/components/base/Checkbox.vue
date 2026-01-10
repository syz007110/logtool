<template>
  <el-checkbox
    :model-value="modelValue"
    :label="label"
    :disabled="disabled"
    :size="elSize"
    @change="handleChange"
  >
    <slot></slot>
  </el-checkbox>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseCheckbox',
  props: {
    modelValue: {
      type: [Boolean, String, Number],
      default: undefined
    },
    label: {
      type: [String, Number, Boolean],
      default: undefined
    },
    disabled: {
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    }
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const elSize = computed(() => {
      const sizeMap = {
        'lg': 'large',
        'default': 'default',
        'sm': 'small'
      }
      return sizeMap[props.size] || 'default'
    })

    const handleChange = (value) => {
      emit('update:modelValue', value)
      emit('change', value)
    }

    return {
      elSize,
      handleChange
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
