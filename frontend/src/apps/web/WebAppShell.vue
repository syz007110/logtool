<template>
  <router-view />
</template>

<script>
import { onMounted } from 'vue'

export default {
  name: 'WebAppShell',
  setup() {
    onMounted(() => {
      try {
        document.documentElement.dataset.platform = 'web'
      } catch (_) {}
    })
  }
}
</script>
