<template>
  <div class="error-state" :class="{ 'error-state-center': center }">
    <div class="error-icon-wrapper">
      <slot name="icon">
        <el-icon :size="64" class="error-icon">
          <component :is="resolvedIcon" />
        </el-icon>
      </slot>
    </div>
    <h3 v-if="title" class="error-title">{{ title }}</h3>
    <p v-if="message" class="error-message">{{ message }}</p>
    <div v-if="$slots.default || showRetry" class="error-action">
      <slot name="action">
        <Button v-if="showRetry" type="primary" @click="handleRetry">
          {{ retryText }}
        </Button>
      </slot>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import BaseButton from '../base/Button.vue'

export default {
  name: 'ErrorState',
  components: {
    Button: BaseButton
  },
  props: {
    title: {
      type: String,
      default: '出错了'
    },
    message: {
      type: String,
      default: ''
    },
    /** Element Plus 图标组件；未传时用 WarningFilled */
    icon: {
      type: [Object, Function],
      default: null
    },
    center: {
      type: Boolean,
      default: true
    },
    showRetry: {
      type: Boolean,
      default: false
    },
    retryText: {
      type: String,
      default: '重试'
    }
  },
  emits: ['retry'],
  setup (props, { emit }) {
    const resolvedIcon = computed(() => props.icon || WarningFilled)
    const handleRetry = () => {
      emit('retry')
    }

    return {
      resolvedIcon,
      handleRetry
    }
  }
}
</script>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 24px;
  color: var(--text-secondary, #64748b);
}

.error-state-center {
  align-items: center;
  text-align: center;
}

.error-icon-wrapper {
  margin-bottom: 16px;
}

.error-icon {
  color: var(--text-error-primary, #ff4d4f);
}

.error-title {
  font-size: var(--font-size-lg);
  font-weight: 500;
  color: var(--text-primary, #030213);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.error-message {
  font-size: var(--font-size-md);
  color: var(--text-secondary, #64748b);
  margin: 0 0 24px 0;
  line-height: 1.5;
  max-width: 400px;
}

.error-action {
  display: flex;
  gap: 12px;
}

.error-state-center .error-action {
  justify-content: center;
}
</style>
