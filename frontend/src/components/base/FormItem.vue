<template>
  <el-form-item
    :label="label"
    :prop="prop"
    :label-width="labelWidth"
    :required="required"
    :rules="rules"
    :error="error"
  >
    <slot></slot>
  </el-form-item>
</template>

<script>
export default {
  name: 'BaseFormItem',
  props: {
    label: {
      type: String,
      default: ''
    },
    prop: {
      type: String,
      default: ''
    },
    labelWidth: {
      type: [String, Number],
      default: undefined
    },
    required: {
      type: Boolean,
      default: false
    },
    rules: {
      type: [Object, Array],
      default: undefined
    },
    error: {
      type: String,
      default: ''
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
