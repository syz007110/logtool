<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    :direction="direction"
    :size="size"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="closeOnPressEscape"
    :show-close="showClose"
    :destroy-on-close="destroyOnClose"
    @update:model-value="handleUpdate"
    @close="$emit('close')"
    @closed="$emit('closed')"
    @opened="$emit('opened')"
  >
    <template v-if="$slots.header" #header>
      <slot name="header"></slot>
    </template>
    <slot></slot>
    <template v-if="$slots.footer" #footer>
      <slot name="footer"></slot>
    </template>
  </el-drawer>
</template>

<script>
export default {
  name: 'BaseDrawer',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: ''
    },
    direction: {
      type: String,
      default: 'rtl',
      validator: (value) => ['ltr', 'rtl', 'ttb', 'btt'].includes(value)
    },
    size: {
      type: [String, Number],
      default: '30%'
    },
    closeOnClickModal: {
      type: Boolean,
      default: true
    },
    closeOnPressEscape: {
      type: Boolean,
      default: true
    },
    showClose: {
      type: Boolean,
      default: true
    },
    destroyOnClose: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue', 'close', 'closed', 'opened'],
  setup(props, { emit }) {
    const handleUpdate = (value) => {
      emit('update:modelValue', value)
    }

    return {
      handleUpdate
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
