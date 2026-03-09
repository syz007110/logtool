<template>
  <div class="json-editor-root" :style="{ height }">
    <CodeMirror
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :minimal="true"
      :tab="true"
      :tab-size="2"
      :extensions="extensions"
      @update:model-value="(v) => $emit('update:modelValue', v)"
    />
  </div>
</template>

<script>
import CodeMirror from 'vue-codemirror6'
import { explanationExtensions } from '@/utils/explanationEditor'

export default {
  name: 'JsonEditor',
  components: { CodeMirror },
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    height: {
      type: String,
      default: '120px'
    },
    placeholder: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue'],
  setup() {
    return { extensions: explanationExtensions() }
  }
}
</script>

<style scoped>
/* 根容器：固定高度 + flex，让 CodeMirror 填满并正确滚动 */
/* overflow: visible 允许补全悬浮窗溢出显示，不被裁剪；滚动由 .cm-scroller 的 overflow: auto 负责 */
.json-editor-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  overflow: visible;
}

/* vue-codemirror6 根元素参与 flex，才能正确约束高度 */
.json-editor-root :deep(> *) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.json-editor-root :deep(.cm-editor) {
  flex: 1;
  min-height: 0;
  border-radius: inherit;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

/* 校验错误行高亮 */
.json-editor-root :deep(.cm-lintRange-error) {
  background: rgba(245, 108, 108, 0.2);
  border-bottom: 1px wavy #f56c6c;
}

/* 左侧错误标记 */
.json-editor-root :deep(.cm-lintGutter) {
  width: 1.2em;
}

/* 占位符高亮颜色 */
.json-editor-root :deep(.cm-explanationPlaceholder) {
  color: #0969da;
  font-weight: 500;
}
</style>

<style>
/* 补全悬浮窗渲染到 body 后，需提高 z-index 以显示在弹窗之上（Element Plus 弹窗约 3000） */
.cm-tooltip-autocomplete,
.cm-tooltips {
  z-index: 9999 !important;
}
</style>
