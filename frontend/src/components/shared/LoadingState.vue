<template>
  <div class="loading-state" :class="{ 'loading-state-center': center, 'loading-state-full': full }">
    <div class="loading-spinner" :class="`loading-spinner-${size}`">
      <i class="fas fa-spinner fa-spin" :class="spinnerIconClass"></i>
    </div>
    <p v-if="text" class="loading-text">{{ text }}</p>
  </div>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'LoadingState',
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
  setup(props) {
    const spinnerIconClass = computed(() => {
      const sizeMap = {
        small: 'fa-2x',
        medium: 'fa-3x',
        large: 'fa-4x'
      }
      return sizeMap[props.size] || 'fa-3x'
    })

    return {
      spinnerIconClass
    }
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

.loading-spinner i {
  color: var(--text-brand-primary, #6366f1);
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary, #64748b);
  margin: 0;
  line-height: 1.5;
}
</style>

