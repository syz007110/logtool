<template>
  <el-image
    :src="src"
    :fit="fit"
    :alt="alt"
    :referrer-policy="referrerPolicy"
    :lazy="lazy"
    :scroll-container="scrollContainer"
    :preview-src-list="previewSrcList"
    :z-index="zIndex"
    :initial-index="initialIndex"
    :preview-teleported="previewTeleported"
    :hide-on-click-modal="hideOnClickModal"
    v-bind="$attrs"
    @load="$emit('load', $event)"
    @error="$emit('error', $event)"
    @switch="$emit('switch', $event)"
    @close="$emit('close', $event)"
  >
    <template v-if="$slots.error" #error>
      <slot name="error"></slot>
    </template>
    <template v-if="$slots.placeholder" #placeholder>
      <slot name="placeholder"></slot>
    </template>
  </el-image>
</template>

<script>
export default {
  name: 'BaseImage',
  inheritAttrs: false,
  props: {
    src: {
      type: String,
      default: ''
    },
    fit: {
      type: String,
      default: 'fill',
      validator: (value) => ['fill', 'contain', 'cover', 'none', 'scale-down'].includes(value)
    },
    alt: {
      type: String,
      default: ''
    },
    referrerPolicy: {
      type: String,
      default: undefined
    },
    lazy: {
      type: Boolean,
      default: false
    },
    scrollContainer: {
      type: [String, Object],
      default: undefined
    },
    previewSrcList: {
      type: Array,
      default: () => []
    },
    zIndex: {
      type: Number,
      default: 2000
    },
    initialIndex: {
      type: Number,
      default: 0
    },
    previewTeleported: {
      type: Boolean,
      default: false
    },
    hideOnClickModal: {
      type: Boolean,
      default: false
    }
  },
  emits: ['load', 'error', 'switch', 'close']
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

