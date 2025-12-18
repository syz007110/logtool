<template>
  <div v-if="isClient">
    <slot />
  </div>
  <div v-else class="client-only-placeholder">
    <el-skeleton :rows="3" animated />
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'

export default {
  name: 'ClientOnly',
  setup() {
    const isClient = ref(false)

    onMounted(() => {
      isClient.value = true
    })

    return {
      isClient
    }
  }
}
</script>

<style scoped>
.client-only-placeholder {
  padding: 20px;
}
</style> 