<template>
  <div class="loading-state" :class="{ 'loading-state-center': center, 'loading-state-full': full }">
    <div class="loading-spinner" :class="`loading-spinner-${size}`">
      <el-icon :size="spinnerSize" class="spinner-icon">
        <Loading />
      </el-icon>
    </div>
    <p v-if="text" class="loading-text">{{ text }}</p>
  </div>
</template>

<script>
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'

export default {
  name: 'LoadingState',
  components: { Loading },
  props: {
    text: {
      type: String,
      default: ''
    },
    size: {
      type: String,
      default: 'medium',
      validator: (value) => ['small', 'medium', 'large'].includes(value)
    },
    center: {
      type: Boolean,
      default: true
    },
    full: {
      type: Boolean,
      default: false
    }
  },
  setup (props) {
    const spinnerSize = computed(() => {
      const sizeMap = { small: 24, medium: 36, large: 48 }
      return sizeMap[props.size] || 36
    })
    return { spinnerSize }
  }
}
</script>

<style scoped>
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 24px;
  color: var(--text-secondary, #64748b);
}

.loading-state-center {
  align-items: center;
  text-align: center;
}

.loading-state-full {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-primary, #ffffff);
  z-index: 10;
}

.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.loading-spinner-small {
  height: 32px;
}

.loading-spinner-medium {
  height: 48px;
}

.loading-spinner-large {
  height: 64px;
}

.spinner-icon {
  color: var(--text-brand-primary, #6366f1);
  animation: loading-rotate 1.2s linear infinite;
}

.loading-text {
  font-size: var(--font-size-md);
  color: var(--text-secondary, #64748b);
  margin: 0;
  line-height: 1.5;
}

@keyframes loading-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
