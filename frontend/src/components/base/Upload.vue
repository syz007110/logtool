<template>
  <el-upload
    v-bind="$attrs"
    :action="action"
    :headers="headers"
    :method="method"
    :data="data"
    :multiple="multiple"
    :name="name"
    :with-credentials="withCredentials"
    :show-file-list="showFileList"
    :drag="drag"
    :accept="accept"
    :on-preview="onPreview"
    :on-remove="onRemove"
    :on-success="onSuccess"
    :on-error="onError"
    :on-progress="onProgress"
    :on-change="onChange"
    :on-exceed="onExceed"
    :before-upload="beforeUpload"
    :before-remove="beforeRemove"
    :list-type="listType"
    :auto-upload="autoUpload"
    :file-list="fileList"
    :http-request="httpRequest"
    :disabled="disabled"
    :limit="limit"
  >
    <template v-if="$slots.trigger">
      <slot name="trigger"></slot>
    </template>
    <template v-if="$slots.default">
      <slot></slot>
    </template>
    <template v-if="$slots.tip" #tip>
      <slot name="tip"></slot>
    </template>
  </el-upload>
</template>

<script>
export default {
  name: 'BaseUpload',
  inheritAttrs: false,
  props: {
    action: {
      type: String,
      default: ''
    },
    headers: {
      type: Object,
      default: () => ({})
    },
    method: {
      type: String,
      default: 'post'
    },
    data: {
      type: Object,
      default: () => ({})
    },
    multiple: {
      type: Boolean,
      default: false
    },
    name: {
      type: String,
      default: 'file'
    },
    withCredentials: {
      type: Boolean,
      default: false
    },
    showFileList: {
      type: Boolean,
      default: true
    },
    drag: {
      type: Boolean,
      default: false
    },
    accept: {
      type: String,
      default: ''
    },
    onPreview: {
      type: Function,
      default: null
    },
    onRemove: {
      type: Function,
      default: null
    },
    onSuccess: {
      type: Function,
      default: null
    },
    onError: {
      type: Function,
      default: null
    },
    onProgress: {
      type: Function,
      default: null
    },
    onChange: {
      type: Function,
      default: null
    },
    onExceed: {
      type: Function,
      default: null
    },
    beforeUpload: {
      type: Function,
      default: null
    },
    beforeRemove: {
      type: Function,
      default: null
    },
    listType: {
      type: String,
      default: 'text',
      validator: (value) => ['text', 'picture', 'picture-card'].includes(value)
    },
    autoUpload: {
      type: Boolean,
      default: true
    },
    fileList: {
      type: Array,
      default: () => []
    },
    httpRequest: {
      type: Function,
      default: null
    },
    disabled: {
      type: Boolean,
      default: false
    },
    limit: {
      type: Number,
      default: null
    }
  },
  emits: ['update:file-list']
}
</script>

<style scoped>
/* Base 组件层不添加样式，样式通过 Theme Mapping 自动应用 */
</style>

