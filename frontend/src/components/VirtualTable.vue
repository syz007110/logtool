<template>
  <div class="virtual-table-container" ref="containerRef">
    <div class="virtual-table-header" v-if="showHeader">
      <div 
        v-for="column in columns" 
        :key="column.prop"
        class="virtual-table-cell header-cell"
        :style="getColumnStyle(column)"
      >
        {{ column.label }}
      </div>
    </div>
    
    <div class="virtual-table-body" ref="bodyRef" @scroll="handleScroll">
      <div class="virtual-table-spacer" :style="{ height: totalHeight + 'px' }">
        <!-- 底部哨兵：进入视口时触发 load-more，避免外层裁剪导致 scroll 判断不到底部 -->
        <div
          v-show="data.length > 0 && totalHeight > 0"
          ref="loadMoreSentinelRef"
          class="virtual-table-load-more-sentinel"
          :style="{ top: (totalHeight - 2) + 'px' }"
          aria-hidden="true"
        />
        <div 
          class="virtual-table-row"
          :class="getRowClassName(item, startIndex + index)"
          v-for="(item, index) in visibleItems" 
          :key="getItemKey(item, startIndex + index)"
          :style="{ 
            transform: `translateY(${(startIndex + index) * itemHeight}px)`,
            height: itemHeight + 'px',
            width: '100%'
          }"
          @click="handleRowClick(item, startIndex + index)"
        >
          <div 
            v-for="column in columns" 
            :key="column.prop"
            class="virtual-table-cell"
            :style="getColumnStyle(column)"
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
    debug: {
      type: Boolean,
      default: false
    },
    rowClassName: {
      type: Function,
      default: null
    }
  },
  emits: ['scroll', 'load-more', 'row-click'],
  setup(props, { emit }) {
    const containerRef = ref(null)
    const bodyRef = ref(null)
    const loadMoreSentinelRef = ref(null)
    const scrollTop = ref(0)
    const containerHeight = ref(0)
    let resizeObserver = null
    let loadMoreObserver = null
    let scrollRafPending = false
    let pendingScrollTop = 0
    let lastLoadMoreEmit = 0
    const LOAD_MORE_DEBOUNCE_MS = 800

    const debugLog = (...args) => {
      if (props.debug) console.log('[VirtualTable]', ...args)
    }
    const debugWarn = (...args) => {
      if (props.debug) console.warn('[VirtualTable]', ...args)
    }
    
    // 计算总高度
    const totalHeight = computed(() => {
      return props.data.length * props.itemHeight
    })
    
    // 计算可见区域的起始和结束索引
    const visibleRange = computed(() => {
      if (props.data.length === 0) {
        debugLog('visibleRange: data is empty')
        return { start: 0, end: 0, startIndex: 0 }
      }
      if (containerHeight.value === 0) {
        debugWarn('visibleRange: containerHeight is 0, data.length:', props.data.length)
        // 即使容器高度为0，也尝试渲染一些行，以便容器能够获得高度
        return { start: 0, end: Math.min(10, props.data.length), startIndex: 0 }
      }
      const start = Math.floor((Math.max(0, scrollTop.value) || 0) / props.itemHeight)
      const visibleCount = Math.max(1, Math.ceil(containerHeight.value / props.itemHeight))
      const actualStart = Math.max(0, start - props.buffer)
      // 结束索引：可见行数 + 前后 buffer
      const end = Math.min(actualStart + visibleCount + 2 * props.buffer, props.data.length)
      
      const range = {
        start: actualStart,
        end: Math.max(end, actualStart + 1), // 确保至少渲染一行
        startIndex: actualStart
      }
      debugLog('visibleRange:', range, 'containerHeight:', containerHeight.value, 'scrollTop:', scrollTop.value)
      return range
    })
    
    // 获取可见的项目
    const visibleItems = computed(() => {
      const { start, end } = visibleRange.value
      const items = props.data.slice(start, end)
      debugLog('visibleItems:', items.length, 'range:', { start, end }, 'data.length:', props.data.length)
      return items
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

    // 获取列样式（确保 header 和 row 使用相同的宽度计算）
    const getColumnStyle = (column) => {
      const style = {}
      if (column.width) {
        style.width = column.width
        style.flexShrink = 0
        style.flexGrow = 0
      } else if (column.minWidth) {
        style.minWidth = column.minWidth
        style.flexGrow = 1
        style.flexShrink = 1
      } else {
        style.flexGrow = 1
        style.flexShrink = 1
      }
      return style
    }
    
    // 处理滚动事件
    const handleScroll = (event) => {
      const el = event.target
      const currentScrollTop = el.scrollTop
      pendingScrollTop = currentScrollTop
      if (!scrollRafPending) {
        scrollRafPending = true
        requestAnimationFrame(() => {
          scrollTop.value = pendingScrollTop
          scrollRafPending = false
        })
      }
      emit('scroll', event)
      
      // 检查是否需要加载更多数据（滚动到底部附近）
      const scrollBottom = currentScrollTop + el.clientHeight
      const totalScrollHeight = props.data.length * props.itemHeight
      // 基于当前事件现场计算 end，避免 rAF 节流导致 visibleRange 仍是旧值
      const visibleCountNow = Math.max(1, Math.ceil(el.clientHeight / props.itemHeight))
      const startNow = Math.floor(Math.max(0, currentScrollTop) / props.itemHeight)
      const actualStartNow = Math.max(0, startNow - props.buffer)
      const endNow = Math.min(actualStartNow + visibleCountNow + 2 * props.buffer, props.data.length)
      // 当滚动到距离底部小于一个 itemHeight 时触发加载
      if (scrollBottom >= totalScrollHeight - props.itemHeight && endNow >= props.data.length - props.buffer) {
        emit('load-more')
      }
    }

    const handleRowClick = (row, index) => {
      emit('row-click', row, index)
    }
    
    // 更新容器高度
    const measureContainerHeight = () => {
      // 用可滚动区域的真实高度（bodyRef），避免把 header 高度算进去导致渲染行数偏少/抖动
      const el = bodyRef.value || containerRef.value
      if (!el) return 0
      const rect = el.getBoundingClientRect?.()
      const h = rect?.height ?? el.clientHeight ?? 0
      return Math.max(0, Math.floor(h))
    }

    const commitContainerHeightWithRetry = async (attempt = 0) => {
      const height = measureContainerHeight()
      const oldHeight = containerHeight.value

      // 高度为 0 往往是布局尚未完成（或父容器未给出高度），做少量 rAF 重试
      if (height === 0 && attempt < 6) {
        await new Promise((r) => requestAnimationFrame(r))
        return commitContainerHeightWithRetry(attempt + 1)
      }

      containerHeight.value = height
      debugLog('updateContainerHeight:', height, 'oldHeight:', oldHeight, 'data.length:', props.data.length)

      // 如果高度从0变为有值，强制触发一次更新
      if (oldHeight === 0 && height > 0 && props.data.length > 0) {
        debugLog('容器高度从0变为有值，触发更新')
        await nextTick()
        // 通过访问 visibleRange 来触发重新计算
        const _ = visibleRange.value
      }
    }

    const updateContainerHeight = async () => {
      await nextTick()
      if (!containerRef.value) {
        debugWarn('containerRef.value is null')
        return
      }
      await commitContainerHeightWithRetry(0)
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

      // 监听容器尺寸变化（比 window.resize 更可靠）
      const roTarget = bodyRef.value || containerRef.value
      if (window.ResizeObserver && roTarget) {
        resizeObserver = new window.ResizeObserver(() => {
          // 不阻塞 observer 回调
          updateContainerHeight()
        })
        resizeObserver.observe(roTarget)
      }

    })
    
    onUnmounted(() => {
      window.removeEventListener('resize', updateContainerHeight)
      if (resizeObserver) {
        try {
          resizeObserver.disconnect()
        } catch (e) {
          // ignore
        }
        resizeObserver = null
      }
      if (loadMoreObserver && loadMoreSentinelRef.value) {
        try {
          loadMoreObserver.unobserve(loadMoreSentinelRef.value)
        } catch (e) {}
        loadMoreObserver.disconnect()
        loadMoreObserver = null
      }
    })
    
    // 监听数据变化
    watch(() => props.data.length, () => {
      updateContainerHeight()
    })

    // 数据加载后建立底部哨兵 observer（哨兵 v-show 依赖 totalHeight > 0）
    const setupLoadMoreObserver = () => {
      nextTick(() => {
        const body = bodyRef.value
        const sentinel = loadMoreSentinelRef.value
        if (!body || !sentinel || props.data.length === 0 || typeof IntersectionObserver === 'undefined') return
        if (loadMoreObserver) {
          try { loadMoreObserver.unobserve(sentinel) } catch (e) {}
          loadMoreObserver.disconnect()
          loadMoreObserver = null
        }
        loadMoreObserver = new IntersectionObserver(
          (entries) => {
            const entry = entries[0]
            if (!entry?.isIntersecting || props.data.length === 0) return
            const now = Date.now()
            if (now - lastLoadMoreEmit < LOAD_MORE_DEBOUNCE_MS) return
            lastLoadMoreEmit = now
            emit('load-more')
          },
          { root: body, rootMargin: '0px', threshold: 0 }
        )
        loadMoreObserver.observe(sentinel)
      })
    }
    watch(() => props.data.length, () => {
      if (props.data.length > 0) setupLoadMoreObserver()
    }, { immediate: true })
    
    // 监听容器高度变化，确保在高度更新后重新计算可见区域
    watch(containerHeight, (newHeight) => {
      if (newHeight > 0 && props.data.length > 0) {
        debugLog('containerHeight changed to:', newHeight)
        // 触发 visibleRange 重新计算（通过访问它）
        const _ = visibleRange.value
      }
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
      getColumnStyle,
      handleScroll,
      handleRowClick,
      scrollTo,
      scrollToTop,
      scrollToBottom,
      updateContainerHeight // 暴露方法供外部调用
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
  min-width: 0;
}

.virtual-table-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.virtual-table-spacer {
  position: relative;
  width: 100%;
}

.virtual-table-load-more-sentinel {
  position: absolute;
  left: 0;
  width: 1px;
  height: 2px;
  pointer-events: none;
  visibility: hidden;
}

.virtual-table-row {
  display: flex;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  border-bottom: 1px solid #f0f0f0;
  background-color: #fff;
  min-width: 0;
  box-sizing: border-box;
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
  flex-shrink: 0;
  box-sizing: border-box;
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
