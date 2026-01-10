<template>
  <el-dropdown
    v-bind="$attrs"
    :trigger="trigger"
    :placement="placement"
    :hide-on-click="hideOnClick"
    :show-timeout="showTimeout"
    :hide-timeout="hideTimeout"
    :popper-class="popperClass"
    :popper-options="popperOptions"
    :disabled="disabled"
    :split-button="splitButton"
    :type="type"
    :size="elSize"
    @visible-change="$emit('visible-change', $event)"
    @click="$emit('click', $event)"
    @command="$emit('command', $event)"
  >
    <template v-if="$slots.default">
      <slot></slot>
    </template>
    <template v-if="$slots.dropdown" #dropdown>
      <slot name="dropdown"></slot>
    </template>
  </el-dropdown>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseDropdown',
  inheritAttrs: false,
  props: {
    trigger: {
      type: String,
      default: 'hover',
      validator: (value) => ['click', 'contextmenu', 'hover'].includes(value)
    },
    placement: {
      type: String,
      default: 'bottom',
      validator: (value) => ['top', 'top-start', 'top-end', 'bottom', 'bottom-start', 'bottom-end', 'left', 'left-start', 'left-end', 'right', 'right-start', 'right-end'].includes(value)
    },
    hideOnClick: {
      type: Boolean,
      default: true
    },
    showTimeout: {
      type: Number,
      default: 250
    },
    hideTimeout: {
      type: Number,
      default: 150
    },
    popperClass: {
      type: String,
      default: ''
    },
    popperOptions: {
      type: Object,
      default: () => ({})
    },
    disabled: {
      type: Boolean,
      default: false
    },
    splitButton: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      default: '',
      validator: (value) => ['', 'primary', 'success', 'warning', 'danger', 'info', 'text'].includes(value)
    },
    size: {
      type: String,
      default: '',
      validator: (value) => ['', 'large', 'default', 'small'].includes(value)
    }
  },
  emits: ['visible-change', 'click', 'command'],
  setup(props) {
    const elSize = computed(() => props.size || 'default')

    return {
      elSize
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

