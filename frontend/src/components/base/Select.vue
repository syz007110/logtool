<template>
  <el-select
    :model-value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :clearable="clearable"
    :size="elSize"
    :multiple="multiple"
    @update:model-value="handleChange"
    @change="$emit('change', $event)"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
    @clear="$emit('clear')"
  >
    <el-option
      v-for="option in options"
      :key="getOptionValue(option)"
      :label="getOptionLabel(option)"
      :value="getOptionValue(option)"
      :disabled="option.disabled || false"
    />
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix"></slot>
    </template>
  </el-select>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseSelect',
  props: {
    modelValue: {
      type: [String, Number, Boolean, Array],
      default: null
    },
    options: {
      type: Array,
      default: () => []
    },
    placeholder: {
      type: String,
      default: '请选择'
    },
    disabled: {
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
    multiple: {
      type: Boolean,
      default: false
    },
    optionLabel: {
      type: String,
      default: 'label'
    },
    optionValue: {
      type: String,
      default: 'value'
    }
  },
  emits: ['update:modelValue', 'change', 'focus', 'blur', 'clear'],
  setup(props, { emit }) {
    const elSize = computed(() => {
      const sizeMap = {
        'lg': 'large',
        'default': 'default',
        'sm': 'small'
      }
      return sizeMap[props.size] || 'default'
    })

    const getOptionLabel = (option) => {
      return typeof option === 'object' ? option[props.optionLabel] : option
    }

    const getOptionValue = (option) => {
      return typeof option === 'object' ? option[props.optionValue] : option
    }

    const handleChange = (value) => {
      emit('update:modelValue', value)
    }

    return {
      elSize,
      getOptionLabel,
      getOptionValue,
      handleChange
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
