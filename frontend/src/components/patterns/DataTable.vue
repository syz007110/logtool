<template>
  <div class="data-table-container">
    <BaseTable
      :data="data"
      :loading="loading"
      :height="height"
      :max-height="maxHeight"
      :stripe="stripe"
      :border="border"
      :size="size"
      @selection-change="$emit('selection-change', $event)"
      @current-change="$emit('current-change', $event)"
      @row-click="$emit('row-click', $event)"
      @row-dblclick="$emit('row-dblclick', $event)"
    >
      <slot></slot>
    </BaseTable>
    
    <div v-if="showPagination && total > 0" class="data-table-pagination">
      <BasePagination
        :current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="pageSizes"
        :total="total"
        :layout="paginationLayout"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script>
import BaseTable from '../base/Table.vue'
import BasePagination from '../base/Pagination.vue'

export default {
  name: 'DataTable',
  components: {
    BaseTable,
    BasePagination
  },
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
      default: 'default'
    },
    // 分页相关
    showPagination: {
      type: Boolean,
      default: true
    },
    currentPage: {
      type: Number,
      default: 1
    },
    pageSize: {
      type: Number,
      default: 20
    },
    pageSizes: {
      type: Array,
      default: () => [10, 20, 50, 100]
    },
    total: {
      type: Number,
      default: 0
    },
    paginationLayout: {
      type: String,
      default: 'total, sizes, prev, pager, next, jumper'
    }
  },
  emits: ['selection-change', 'current-change', 'row-click', 'row-dblclick', 'size-change', 'current-page-change'],
  setup(props, { emit }) {
    const handleSizeChange = (size) => {
      emit('size-change', size)
    }

    const handleCurrentChange = (page) => {
      emit('current-page-change', page)
    }

    return {
      handleSizeChange,
      handleCurrentChange
    }
  }
}
</script>

<style scoped>
.data-table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.data-table-pagination {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: var(--spacing-md, 16px) 0;
  margin-top: auto;
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
}
</style>
