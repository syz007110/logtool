<template>
  <el-date-picker
    :model-value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :start-placeholder="startPlaceholder"
    :end-placeholder="endPlaceholder"
    :format="format"
    :value-format="valueFormat"
    :disabled="disabled"
    :clearable="clearable"
    :size="elSize"
    v-bind="$attrs"
    @update:model-value="handleChange"
    @change="$emit('change', $event)"
  />
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseDatePicker',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Array, Date],
      default: null
    },
    type: {
      type: String,
      default: 'date',
      validator: (value) => ['year', 'month', 'date', 'dates', 'datetime', 'week', 'datetimerange', 'daterange', 'monthrange'].includes(value)
    },
    placeholder: {
      type: String,
      default: ''
    },
    startPlaceholder: {
      type: String,
      default: ''
    },
    endPlaceholder: {
      type: String,
      default: ''
    },
    format: {
      type: String,
      default: 'YYYY-MM-DD'
    },
    valueFormat: {
      type: String,
      default: undefined
    },
    disabled: {
      type: Boolean,
      default: false
    },
    clearable: {
      type: Boolean,
      default: true
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    },
    rangeSeparator: {
      type: String,
      default: '至'
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

