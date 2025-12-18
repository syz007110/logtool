<template>
  <span ref="el" :style="style"><slot /></span>
  
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

export default {
  name: 'AutoFitText',
  props: {
    minScale: { type: Number, default: 0.85 },
    maxScale: { type: Number, default: 1 }
  },
  setup(props) {
    const el = ref(null)
    const scale = ref(1)
    const style = computed(() => ({
      display: 'inline-block',
      transformOrigin: 'left center',
      transform: `scale(${scale.value})`,
      whiteSpace: 'nowrap',
      maxWidth: '100%'
    }))

    let ro = null
    const fit = () => {
      const node = el.value
      if (!node) return
      const parent = node.parentElement
      if (!parent) return
      const available = parent.clientWidth
      if (!available) return
      // 先重置为1再测，避免累计误差
      const prev = scale.value
      scale.value = 1
      // 下一帧读取 scrollWidth
      nextTick(() => {
        const needed = node.scrollWidth
        if (!needed) {
          scale.value = prev
          return
        }
        const nextScale = Math.min(props.maxScale, Math.max(props.minScale, available / needed))
        scale.value = Number.isFinite(nextScale) ? nextScale : 1
      })
    }

    onMounted(() => {
      try {
        ro = new ResizeObserver(() => fit())
        const parent = el.value && el.value.parentElement
        if (parent) ro.observe(parent)
      } catch (_) {}
      fit()
      window.addEventListener('resize', fit)
    })
    onBeforeUnmount(() => {
      try { ro && ro.disconnect() } catch (_) {}
      ro = null
      window.removeEventListener('resize', fit)
    })

    return { el, style }
  }
}
</script>

<style scoped>
</style>


