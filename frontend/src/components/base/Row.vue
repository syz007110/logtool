<template>
  <el-row
    :gutter="gutter"
    :justify="justify"
    :align="align"
  >
    <slot></slot>
  </el-row>
</template>

<script>
export default {
  name: 'BaseRow',
  props: {
    gutter: {
      type: [Number, String],
      default: 0
    },
    justify: {
      type: String,
      default: 'start',
      validator: (value) => ['start', 'end', 'center', 'space-around', 'space-between', 'space-evenly'].includes(value)
    },
    align: {
      type: String,
      default: 'top',
      validator: (value) => ['top', 'middle', 'bottom'].includes(value)
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
