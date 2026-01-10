<template>
  <el-text
    :type="type"
    :size="elSize"
    :truncated="truncated"
    :tag="tag"
    v-bind="$attrs"
  >
    <slot></slot>
  </el-text>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseText',
  inheritAttrs: false,
  props: {
    type: {
      type: String,
      default: '',
      validator: (value) => ['', 'primary', 'success', 'warning', 'danger', 'info'].includes(value)
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    },
    truncated: {
      type: Boolean,
      default: false
    },
    tag: {
      type: String,
      default: 'span'
    }
  },
  setup(props) {
    const elSize = computed(() => {
      const sizeMap = {
        'large': 'large',
        'default': 'default',
        'small': 'small'
      }
      return sizeMap[props.size] || 'default'
    })

    return {
      elSize
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

