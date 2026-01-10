<template>
  <el-empty
    :image="image"
    :image-size="imageSize"
    :description="description"
  >
    <slot></slot>
  </el-empty>
</template>

<script>
export default {
  name: 'BaseEmpty',
  props: {
    image: {
      type: String,
      default: ''
    },
    imageSize: {
      type: Number,
      default: 100
    },
    description: {
      type: String,
      default: '暂无数据'
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
