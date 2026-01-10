<template>
  <el-col
    :span="span"
    :offset="offset"
    :push="push"
    :pull="pull"
  >
    <slot></slot>
  </el-col>
</template>

<script>
export default {
  name: 'BaseCol',
  props: {
    span: {
      type: Number,
      default: 24
    },
    offset: {
      type: Number,
      default: 0
    },
    push: {
      type: Number,
      default: 0
    },
    pull: {
      type: Number,
      default: 0
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
