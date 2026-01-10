<template>
  <el-tag
    v-bind="$attrs"
    :type="type"
    :size="elSize"
    :closable="closable"
    :disable-transitions="disableTransitions"
    :hit="hit"
    :color="color"
    :effect="effect"
    @close="$emit('close', $event)"
    @click="$emit('click', $event)"
  >
    <slot></slot>
  </el-tag>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'BaseTag',
  inheritAttrs: false,
  props: {
    type: {
      type: String,
      default: '',
      validator: (value) => ['', 'success', 'info', 'warning', 'danger'].includes(value)
    },
    size: {
      type: String,
      default: '',
      validator: (value) => ['', 'large', 'default', 'small'].includes(value)
    },
    closable: {
      type: Boolean,
      default: false
    },
    disableTransitions: {
      type: Boolean,
      default: false
    },
    hit: {
      type: Boolean,
      default: false
    },
    color: {
      type: String,
      default: ''
    },
    effect: {
      type: String,
      default: 'light',
      validator: (value) => ['dark', 'light', 'plain'].includes(value)
    }
  },
  emits: ['close', 'click'],
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

