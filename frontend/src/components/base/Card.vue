<template>
  <el-card
    :header="title"
    :shadow="shadow ? 'always' : 'never'"
    :body-style="bodyStyle"
    :class="cardClass"
  >
    <template v-if="$slots.header" #header>
      <slot name="header"></slot>
    </template>
    <slot></slot>
    <template v-if="$slots.footer" #footer>
      <slot name="footer"></slot>
    </template>
  </el-card>
</template>

<script>
export default {
  name: 'BaseCard',
  props: {
    title: {
      type: String,
      default: ''
    },
    shadow: {
      type: Boolean,
      default: true
    },
    bodyStyle: {
      type: Object,
      default: () => ({})
    }
  },
  computed: {
    cardClass() {
      return []
    }
  }
}
</script>

<style scoped>
/* Base组件不包含样式，样式通过Element Plus Theme Mapping自动应用 */
</style>
