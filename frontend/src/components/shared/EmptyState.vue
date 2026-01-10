<template>
  <div class="empty-state" :class="{ 'empty-state-center': center }">
    <div class="empty-icon-wrapper">
      <slot name="icon">
        <i :class="icon || 'fas fa-inbox'" class="empty-icon"></i>
      </slot>
    </div>
    <h3 v-if="title" class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-description">{{ description }}</p>
    <div v-if="$slots.default || $slots.action" class="empty-action">
      <slot name="action"></slot>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    title: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    icon: {
      type: String,
      default: 'fas fa-inbox'
    },
    center: {
      type: Boolean,
      default: true
    }
  }
}
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 24px;
  color: var(--text-secondary, #64748b);
}

.empty-state-center {
  align-items: center;
  text-align: center;
}

.empty-icon-wrapper {
  margin-bottom: 16px;
}

.empty-icon {
  font-size: 64px;
  color: var(--text-placeholder, #cbd5e1);
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary, #030213);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.empty-description {
  font-size: 14px;
  color: var(--text-secondary, #64748b);
  margin: 0 0 24px 0;
  line-height: 1.5;
  max-width: 400px;
}

.empty-action {
  display: flex;
  gap: 12px;
}

.empty-state-center .empty-action {
  justify-content: center;
}
</style>

