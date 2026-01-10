<template>
  <el-pagination
    :current-page="currentPage"
    :page-size="pageSize"
    :page-sizes="pageSizes"
    :total="total"
    :layout="layout"
    :size="elSize"
    @size-change="$emit('size-change', $event)"
    @current-change="$emit('current-change', $event)"
  />
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BasePagination',
  props: {
    currentPage: {
      type: Number,
      default: 1
    },
    pageSize: {
      type: Number,
      default: 10
    },
    pageSizes: {
      type: Array,
      default: () => [10, 20, 50, 100]
    },
    total: {
      type: Number,
      default: 0
    },
    layout: {
      type: String,
      default: 'total, sizes, prev, pager, next, jumper'
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    }
  },
  emits: ['size-change', 'current-change'],
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
