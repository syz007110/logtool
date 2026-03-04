<template>
  <router-view />
</template>

<script>
import { onBeforeUnmount, onMounted } from 'vue'

export default {
  name: 'MobileAppShell',
  setup() {
    const preventGestureZoom = (e) => {
      try {
        e.preventDefault()
      } catch (_) {}
    }

    const bindGesture = () => {
      window.addEventListener('gesturestart', preventGestureZoom, { passive: false })
      window.addEventListener('gesturechange', preventGestureZoom, { passive: false })
      window.addEventListener('gestureend', preventGestureZoom, { passive: false })
    }

    const unbindGesture = () => {
      window.removeEventListener('gesturestart', preventGestureZoom)
      window.removeEventListener('gesturechange', preventGestureZoom)
      window.removeEventListener('gestureend', preventGestureZoom)
    }

    onMounted(() => {
      try {
        document.documentElement.dataset.platform = 'mobile'
      } catch (_) {}

      const isSmall = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(max-width: 768px)').matches
        : false

      if (isSmall) bindGesture()
    })

    onBeforeUnmount(() => {
      unbindGesture()
    })
  }
}
</script>
