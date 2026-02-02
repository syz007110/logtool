<template>
  <div class="translate-tool-page">
    <div class="translate-tool-header">
      <h1 class="translate-tool-title">{{ $t('toolbox.translateTool') }}</h1>
      <p class="translate-tool-desc">{{ $t('toolbox.translateToolDesc') }}</p>
    </div>
    <div class="translate-tool-content">
      <el-empty :description="$t('toolbox.translateToolPlaceholder')" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'TranslateTool'
}
</script>

<style scoped>
.translate-tool-page {
  padding: 24px;
  min-height: 100%;
}
.translate-tool-header {
  margin-bottom: 24px;
}
.translate-tool-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--el-text-color-primary);
}
.translate-tool-desc {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin: 0;
}
.translate-tool-content {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  background: var(--el-fill-color-blank);
  border-radius: 8px;
  border: 1px dashed var(--el-border-color-lighter);
}
</style>
