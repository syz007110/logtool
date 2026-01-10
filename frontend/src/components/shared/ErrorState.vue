<template>
  <div class="error-state" :class="{ 'error-state-center': center }">
    <div class="error-icon-wrapper">
      <slot name="icon">
        <i :class="icon || 'fas fa-exclamation-triangle'" class="error-icon"></i>
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
    icon: {
      type: String,
      default: 'fas fa-exclamation-triangle'
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
  setup(props, { emit }) {
    const handleRetry = () => {
      emit('retry')
    }

    return {
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
  font-size: 64px;
  color: var(--text-error-primary, #ff4d4f);
}

.error-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary, #030213);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.error-message {
  font-size: 14px;
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

