<template>
  <el-input
    :model-value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :clearable="clearable"
    :size="elSize"
    :type="type"
    @update:model-value="handleInput"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
    @clear="$emit('clear')"
  >
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix"></slot>
    </template>
    <template v-if="$slots.suffix" #suffix>
      <slot name="suffix"></slot>
    </template>
    <template v-if="$slots.prepend" #prepend>
      <slot name="prepend"></slot>
    </template>
    <template v-if="$slots.append" #append>
      <slot name="append"></slot>
    </template>
  </el-input>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseInput',
  props: {
    modelValue: {
      type: [String, Number],
      default: ''
    },
    placeholder: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: false
    },
    readonly: {
      type: Boolean,
      default: false
    },
    clearable: {
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    },
    type: {
      type: String,
      default: 'text',
      validator: (value) => ['text', 'textarea', 'password', 'number', 'email', 'url', 'tel'].includes(value)
    }
  },
  emits: ['update:modelValue', 'focus', 'blur', 'clear'],
  setup(props, { emit }) {
    const elSize = computed(() => {
      const sizeMap = {
        'lg': 'large',
        'default': 'default',
        'sm': 'small'
      }
      return sizeMap[props.size] || 'default'
    })

    const handleInput = (value) => {
      emit('update:modelValue', value)
    }

    return {
      elSize,
      handleInput
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
