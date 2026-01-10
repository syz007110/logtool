<template>
  <el-form
    :model="model"
    :rules="rules"
    :label-width="labelWidth"
    :label-position="labelPosition"
    :size="elSize"
    :disabled="disabled"
    ref="formRef"
  >
    <slot></slot>
  </el-form>
</template>

<script>
import { computed, ref } from 'vue'

export default {
  name: 'BaseForm',
  props: {
    model: {
      type: Object,
      required: true
    },
    rules: {
      type: Object,
      default: () => ({})
    },
    labelWidth: {
      type: [String, Number],
      default: '100px'
    },
    labelPosition: {
      type: String,
      default: 'right',
      validator: (value) => ['left', 'right', 'top'].includes(value)
    },
    size: {
      type: String,
      default: 'default',
      validator: (value) => ['large', 'default', 'small'].includes(value)
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['validate'],
  setup(props, { expose }) {
    const formRef = ref(null)

    const elSize = computed(() => {
      const sizeMap = {
        'lg': 'large',
        'default': 'default',
        'sm': 'small'
      }
      return sizeMap[props.size] || 'default'
    })

    expose({
      validate: (callback) => formRef.value?.validate(callback),
      validateField: (props, callback) => formRef.value?.validateField(props, callback),
      resetFields: () => formRef.value?.resetFields(),
      clearValidate: (props) => formRef.value?.clearValidate(props),
      scrollToField: (prop) => formRef.value?.scrollToField(prop)
    })

    return {
      formRef,
      elSize
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
