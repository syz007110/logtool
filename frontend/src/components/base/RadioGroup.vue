<template>
  <el-radio-group
    v-bind="$attrs"
    :model-value="modelValue"
    :size="elSize"
    :disabled="disabled"
    :text-color="textColor"
    :fill="fill"
    @change="$emit('update:modelValue', $event); $emit('change', $event)"
  >
    <slot></slot>
  </el-radio-group>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseRadioGroup',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Number, Boolean],
      default: null
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
    textColor: {
      type: String,
      default: '#409EFF'
    },
    fill: {
      type: String,
      default: '#409EFF'
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

