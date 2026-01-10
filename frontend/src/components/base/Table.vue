<template>
  <el-table
    :data="data"
    :loading="loading"
    :height="height"
    :max-height="maxHeight"
    :stripe="stripe"
    :border="border"
    :size="elSize"
    :show-header="showHeader"
    :highlight-current-row="highlightCurrentRow"
    @selection-change="$emit('selection-change', $event)"
    @current-change="$emit('current-change', $event)"
    @row-click="$emit('row-click', $event)"
    @row-dblclick="$emit('row-dblclick', $event)"
  >
    <slot></slot>
  </el-table>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseTable',
  props: {
    data: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    },
    height: {
      type: [String, Number],
      default: undefined
    },
    maxHeight: {
      type: [String, Number],
      default: undefined
    },
    stripe: {
      type: Boolean,
      default: false
    },
    border: {
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    },
    showHeader: {
      type: Boolean,
      default: true
    },
    highlightCurrentRow: {
      type: Boolean,
      default: false
    }
  },
  emits: ['selection-change', 'current-change', 'row-click', 'row-dblclick'],
  setup(props) {
    const elSize = computed(() => {
      const sizeMap = {
        'lg': 'large',
        'default': 'default',
        'sm': 'small'
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
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
