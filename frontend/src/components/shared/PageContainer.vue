<template>
  <div class="page-container" :class="containerClass">
    <!-- 页面头部 -->
    <div v-if="title || $slots.header || showBack" class="page-header">
      <slot name="header">
        <div class="header-left">
          <button v-if="showBack" class="back-button" @click="handleBack" aria-label="返回">
            <i class="fas fa-arrow-left"></i>
          </button>
          <h1 v-if="title" class="page-title">{{ title }}</h1>
          <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="header-actions">
        <slot name="actions"></slot>
      </div>
    </div>

    <!-- 页面内容 -->
    <div class="page-content" :class="{ 'page-content-no-header': !title && !$slots.header && !showBack }">
      <slot></slot>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'PageContainer',
  props: {
    title: {
      type: String,
      default: ''
    },
    subtitle: {
      type: String,
      default: ''
    },
    showBack: {
      type: Boolean,
      default: false
    },
    padding: {
      type: String,
      default: 'normal',
      validator: (value) => ['none', 'small', 'normal', 'large'].includes(value)
    }
  },
  emits: ['back'],
  setup(props, { emit }) {
    const router = useRouter()

    const containerClass = computed(() => {
      return `page-container-padding-${props.padding}`
    })

    const handleBack = () => {
      emit('back')
      if (!props.showBack) {
        router.back()
      }
    }

    return {
      containerClass,
      handleBack
    }
  }
}
</script>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-primary, #ffffff);
}

.page-container-padding-none {
  padding: 0;
}

.page-container-padding-small {
  padding: 12px;
}

.page-container-padding-normal {
  padding: 24px;
}

.page-container-padding-large {
  padding: 32px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-primary, #e2e8f0);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.back-button {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-primary, #e2e8f0);
  border-radius: var(--radius, 4px);
  cursor: pointer;
  color: var(--text-primary, #030213);
  transition: all 0.2s;
  padding: 0;
  outline: none;
}

.back-button:hover {
  background-color: var(--bg-primary-hover, #f5f5f5);
  border-color: var(--border-secondary, #cbd5e1);
}

.back-button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #030213);
  line-height: 1.5;
  margin: 0;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary, #64748b);
  line-height: 1.5;
  margin: 4px 0 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-content {
  flex: 1;
  overflow-y: auto;
}

.page-content-no-header {
  margin-top: 0;
}
</style>

