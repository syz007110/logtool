<template>
  <el-button
    :type="elType"
    :size="elSize"
    :disabled="disabled || loading"
    :loading="loading"
    :text="isTextButton"
    :bg="textBg"
    :icon="icon ? h(resolveComponent('el-icon'), {}, { default: () => h(resolveComponent(icon)) }) : undefined"
    v-bind="$attrs"
    @click="handleClick"
  >
    <slot></slot>
  </el-button>
</template>

<script>
import { h, resolveComponent, computed } from 'vue'

export default {
  name: 'BaseButton',
  inheritAttrs: false,
  props: {
    type: {
      type: String,
      default: 'primary',
      validator: (value) => ['primary', 'secondary', 'success', 'warning', 'danger', 'info', 'text', 'default'].includes(value)
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'lg', 'default', 'small', 'sm'].includes(value)
    },
    disabled: {
      type: Boolean,
      default: false
    },
    loading: {
      type: Boolean,
      default: false
    },
    icon: {
      type: String,
      default: ''
    },
    textBg: {
      type: Boolean,
      default: false,
      // 文字按钮悬停时是否显示背景色
    }
  },
  emits: ['click'],
  setup(props, { emit }) {
    // 判断是否为文字按钮
    const isTextButton = computed(() => props.type === 'text')

    // 将自定义type映射到Element Plus的type
    // 如果是text类型，则使用default类型（因为text属性会处理样式）
    const elType = computed(() => {
      if (props.type === 'text') {
        return 'default' // text类型使用default，然后通过text属性实现文字按钮效果
      }
      const typeMap = {
        'primary': 'primary',
        'secondary': 'default',
        'success': 'success',
        'warning': 'warning',
        'danger': 'danger',
        'info': 'info'
      }
      return typeMap[props.type] || 'primary'
    })

    // 将自定义size映射到Element Plus的size
    const elSize = computed(() => {
      const sizeMap = {
        'lg': 'large',
        'default': 'default',
        'sm': 'small'
      }
      return sizeMap[props.size] || 'default'
    })

    const handleClick = (event) => {
      if (!props.disabled && !props.loading) {
        emit('click', event)
      }
    }

    return {
      elType,
      elSize,
      isTextButton,
      handleClick,
      h,
      resolveComponent
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
