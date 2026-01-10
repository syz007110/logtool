<template>
  <el-link
    :type="type"
    :underline="underline"
    :disabled="disabled"
    :href="href"
    :icon="icon"
    v-bind="$attrs"
    @click="handleClick"
  >
    <slot></slot>
  </el-link>
</template>

<script>
export default {
  name: 'BaseLink',
  inheritAttrs: false,
  props: {
    type: {
      type: String,
      default: 'default',
      validator: (value) => ['default', 'primary', 'success', 'warning', 'danger', 'info'].includes(value)
    },
    underline: {
      type: Boolean,
      default: true
    },
    disabled: {
      type: Boolean,
      default: false
    },
    href: {
      type: String,
      default: ''
    },
    icon: {
      type: [String, Object],
      default: undefined
    }
  },
  emits: ['click'],
  setup(props, { emit }) {
    const handleClick = (event) => {
      if (!props.disabled) {
        emit('click', event)
      }
    }

    return {
      handleClick
    }
  }
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

