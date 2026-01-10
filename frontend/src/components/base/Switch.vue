<template>
  <el-switch
    :model-value="modelValue"
    :disabled="disabled"
    :size="elSize"
    :inline-prompt="inlinePrompt"
    :active-text="activeText"
    :inactive-text="inactiveText"
    :active-value="activeValue"
    :inactive-value="inactiveValue"
    v-bind="$attrs"
    @update:model-value="handleChange"
    @change="$emit('change', $event)"
  />
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseSwitch',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [Boolean, String, Number],
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    },
    inlinePrompt: {
      type: Boolean,
      default: false
    },
    activeText: {
      type: String,
      default: ''
    },
    inactiveText: {
      type: String,
      default: ''
    },
    activeValue: {
      type: [Boolean, String, Number],
      default: true
    },
    inactiveValue: {
      type: [Boolean, String, Number],
      default: false
    }
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const elSize = computed(() => {
      const sizeMap = {
        'large': 'large',
        'default': 'default',
        'small': 'small'
      }
      return sizeMap[props.size] || 'default'
    })

    const handleChange = (value) => {
      emit('update:modelValue', value)
    }

    return {
      elSize,
      handleChange
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

