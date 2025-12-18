<template>
  <div class="virtual-table-container" ref="containerRef">
    <div class="virtual-table-header" v-if="showHeader">
      <div 
        v-for="column in columns" 
        :key="column.prop"
        class="virtual-table-cell header-cell"
        :style="{ width: column.width || 'auto', minWidth: column.minWidth || 'auto' }"
      >
        {{ column.label }}
      </div>
    </div>
    
    <div class="virtual-table-body" ref="bodyRef" @scroll="handleScroll">
      <div class="virtual-table-spacer" :style="{ height: totalHeight + 'px' }">
        <div 
          class="virtual-table-row"
          :class="getRowClassName(item, startIndex + index)"
          v-for="(item, index) in visibleItems" 
          :key="getItemKey(item, startIndex + index)"
          :style="{ 
            transform: `translateY(${(startIndex + index) * itemHeight}px)`,
            height: itemHeight + 'px'
          }"
        >
          <div 
            v-for="column in columns" 
            :key="column.prop"
            class="virtual-table-cell"
            :style="{ width: column.width || 'auto', minWidth: column.minWidth || 'auto' }"
          >
            <slot :name="column.prop" :row="item" :column="column" :index="startIndex + index">
              {{ getCellValue(item, column.prop) }}
            </slot>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

export default {
  name: 'VirtualTable',
  props: {
    data: {
      type: Array,
      default: () => []
    },
    columns: {
      type: Array,
      default: () => []
    },
    itemHeight: {
      type: Number,
      default: 40
    },
    showHeader: {
      type: Boolean,
      default: true
    },
    itemKey: {
      type: String,
      default: 'id'
    },
    buffer: {
      type: Number,
      default: 5
    },
    rowClassName: {
      type: Function,
      default: null
    }
  },
  emits: ['scroll', 'load-more'],
  setup(props, { emit }) {
    const containerRef = ref(null)
    const bodyRef = ref(null)
    const scrollTop = ref(0)
    const containerHeight = ref(0)
    
    // 计算总高度
    const totalHeight = computed(() => {
      return props.data.length * props.itemHeight
    })
    
    // 计算可见区域的起始和结束索引
    const visibleRange = computed(() => {
      const start = Math.floor(scrollTop.value / props.itemHeight)
      const visibleCount = Math.ceil(containerHeight.value / props.itemHeight)
      const end = Math.min(start + visibleCount + props.buffer * 2, props.data.length)
      const actualStart = Math.max(0, start - props.buffer)
      
      return {
        start: actualStart,
        end: end,
        startIndex: actualStart
      }
    })
    
    // 获取可见的项目
    const visibleItems = computed(() => {
      const { start, end } = visibleRange.value
      return props.data.slice(start, end)
    })
    
    const startIndex = computed(() => visibleRange.value.startIndex)
    
    // 获取单元格值
    const getCellValue = (item, prop) => {
      if (typeof prop === 'function') {
        return prop(item)
      }
      return item[prop]
    }
    
    // 获取项目键值
    const getItemKey = (item, index) => {
      if (props.itemKey && item[props.itemKey]) {
        return item[props.itemKey]
      }
      return index
    }
    
    // 获取行样式类名
    const getRowClassName = (item, index) => {
      if (props.rowClassName && typeof props.rowClassName === 'function') {
        return props.rowClassName({ row: item, index })
      }
      return ''
    }
    
    // 处理滚动事件
    const handleScroll = (event) => {
      scrollTop.value = event.target.scrollTop
      emit('scroll', event)
      
      // 检查是否需要加载更多数据
      const { end } = visibleRange.value
      if (end >= props.data.length - props.buffer) {
        emit('load-more')
      }
    }
    
    // 更新容器高度
    const updateContainerHeight = async () => {
      await nextTick()
      if (containerRef.value) {
        containerHeight.value = containerRef.value.clientHeight
      }
    }
    
    // 滚动到指定位置
    const scrollTo = (index) => {
      if (bodyRef.value) {
        const targetScrollTop = index * props.itemHeight
        bodyRef.value.scrollTop = targetScrollTop
      }
    }
    
    // 滚动到顶部
    const scrollToTop = () => {
      scrollTo(0)
    }
    
    // 滚动到底部
    const scrollToBottom = () => {
      scrollTo(props.data.length - 1)
    }
    
    onMounted(() => {
      updateContainerHeight()
      window.addEventListener('resize', updateContainerHeight)
    })
    
    onUnmounted(() => {
      window.removeEventListener('resize', updateContainerHeight)
    })
    
    // 监听数据变化
    watch(() => props.data.length, () => {
      updateContainerHeight()
    })
    
    return {
      containerRef,
      bodyRef,
      scrollTop,
      containerHeight,
      totalHeight,
      visibleItems,
      startIndex,
      getCellValue,
      getItemKey,
      getRowClassName,
      handleScroll,
      scrollTo,
      scrollToTop,
      scrollToBottom
    }
  }
}
</script>

<style scoped>
.virtual-table-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
}

.virtual-table-header {
  display: flex;
  background-color: #fafafa;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.virtual-table-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.virtual-table-spacer {
  position: relative;
}

.virtual-table-row {
  display: flex;
  position: absolute;
  left: 0;
  right: 0;
  border-bottom: 1px solid #f0f0f0;
  background-color: #fff;
}

.virtual-table-row:hover {
  background-color: #f5f7fa;
}

.virtual-table-row:nth-child(even) {
  background-color: #fafafa;
}

.virtual-table-row:nth-child(even):hover {
  background-color: #f5f7fa;
}

/* 颜色标记行样式 - 需要更高的优先级 */
.virtual-table-row.row-marked-red {
  background-color: rgba(255, 0, 0, 0.2) !important;
}

.virtual-table-row.row-marked-yellow {
  background-color: rgba(255, 255, 0, 0.2) !important;
}

.virtual-table-row.row-marked-blue {
  background-color: rgba(0, 0, 255, 0.2) !important;
}

.virtual-table-row.row-marked-green {
  background-color: rgba(0, 255, 0, 0.2) !important;
}

.virtual-table-cell {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-right: 1px solid #f0f0f0;
}

.virtual-table-cell:last-child {
  border-right: none;
}

.header-cell {
  font-weight: 600;
  color: #606266;
  background-color: #fafafa;
  border-bottom: 1px solid #ebeef5;
}

/* 自定义滚动条 */
.virtual-table-body::-webkit-scrollbar {
  width: 8px;
}

.virtual-table-body::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.virtual-table-body::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.virtual-table-body::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
