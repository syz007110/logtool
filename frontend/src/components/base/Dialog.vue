<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="width"
    :align-center="alignCenter"
    :append-to-body="appendToBody"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="closeOnPressEscape"
    :show-close="showClose"
    :destroy-on-close="destroyOnClose"
    class="app-dialog"
    :class="{ 'app-dialog--unconstrained': unconstrained }"
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
  </el-dialog>
</template>

<script>
export default {
  name: 'BaseDialog',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: ''
    },
    width: {
      type: [String, Number],
      default: '50%'
    },
    /** 垂直居中；配合 design-tokens 视口 max-height 使用 */
    alignCenter: {
      type: Boolean,
      default: true
    },
    appendToBody: {
      type: Boolean,
      default: true
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
    },
    /** 为 true 时退出全局视口高度封顶（见 design-tokens --dialog-*） */
    unconstrained: {
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
/* Base 组件保持轻样式；视口布局由 design-tokens.css 全局 Dialog 规范提供 */
</style>
