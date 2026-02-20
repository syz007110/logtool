<template>
  <div class="translate-tool-page">
    <div class="translate-tool-header">
      <h1 class="translate-tool-title">{{ $t('translateTool.title') }}</h1>
      <el-button class="translate-tool-advanced-btn" plain @click="advancedVisible = true">
        <el-icon style="margin-right: 6px"><Setting /></el-icon>
        {{ $t('translateTool.advancedSettings') }}
      </el-button>
    </div>

    <div class="translate-tool-lang-bar">
      <el-select v-model="sourceLang" class="lang-select" filterable>
        <el-option v-for="opt in langOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
      <div class="lang-arrow">→</div>
      <el-select v-model="targetLang" class="lang-select" filterable>
        <el-option v-for="opt in langOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
    </div>

    <el-card class="translate-tool-card" shadow="never">
      <div>
        <el-upload
          class="translate-uploader"
          drag
          action="#"
          :auto-upload="false"
          :limit="1"
          :file-list="fileList"
          :on-change="onFileChange"
          :on-remove="onFileRemove"
          :before-upload="() => false"
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="upload-text-main">{{ $t('translateTool.clickOrDrag') }}</div>
          <div class="upload-text-sub">
            {{ $t('translateTool.supportedFormats') }}:
            <span class="mono">.txt, .md, .json, .docx, .xml</span>
          </div>
        </el-upload>

        <div class="translate-actions">
          <el-button
            type="primary"
            :disabled="!fileList.length || submitting || (taskState && taskState !== 'failed' && taskState !== 'completed')"
            :loading="submitting"
            @click="submitTranslate"
          >
            {{ $t('translateTool.translate') }}
          </el-button>
          <el-button v-if="taskState === 'completed'" type="default" plain @click="downloadResult">
            {{ $t('translateTool.download') }}
          </el-button>
        </div>

        <div v-if="taskId" class="translate-status">
          <div class="status-row">
            <div class="status-label">{{ $t('translateTool.taskId') }}</div>
            <div class="status-value mono">{{ taskId }}</div>
          </div>
          <div class="status-row">
            <div class="status-label">{{ $t('translateTool.status') }}</div>
            <div class="status-value">
              <el-tag v-if="taskState === 'waiting'" type="info">{{ $t('translateTool.statusWaiting') }}</el-tag>
              <el-tag v-else-if="taskState === 'active'" type="warning">{{ $t('translateTool.statusRunning') }}</el-tag>
              <el-tag v-else-if="taskState === 'completed'" type="success">{{ $t('translateTool.statusCompleted') }}</el-tag>
              <el-tag v-else-if="taskState === 'failed'" type="danger">{{ $t('translateTool.statusFailed') }}</el-tag>
              <el-tag v-else type="info">{{ taskState }}</el-tag>
            </div>
          </div>
          <div class="status-row">
            <div class="status-label">{{ $t('translateTool.progress') }}</div>
            <div class="status-value">
              <el-progress :percentage="taskProgress" :status="taskState === 'failed' ? 'exception' : undefined" />
            </div>
          </div>
          <div v-if="taskState === 'failed' && taskFailedReason" class="status-row">
            <div class="status-label">{{ $t('translateTool.error') }}</div>
            <div class="status-value error-text">{{ taskFailedReason }}</div>
          </div>
        </div>
      </div>
    </el-card>

    <el-drawer v-model="advancedVisible" :title="$t('translateTool.advancedSettings')" size="420px">
      <div class="advanced-section">
        <div class="advanced-label">{{ $t('translateTool.provider') }}</div>
        <el-select v-model="providerId" filterable clearable :placeholder="$t('translateTool.providerAuto')">
          <el-option
            v-for="p in providerOptions"
            :key="p.id"
            :label="`${p.label} (${p.model})${p.available ? '' : ' - ' + p.reason}`"
            :value="p.id"
            :disabled="!p.available"
          />
        </el-select>
        <div class="advanced-hint">{{ $t('translateTool.providerHint') }}</div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import api from '../api'
import { ElMessage } from 'element-plus'
import { Setting, UploadFilled } from '@element-plus/icons-vue'

export default {
  name: 'TranslateTool',
  components: { Setting, UploadFilled },
  data() {
    return {
      sourceLang: 'zh',
      targetLang: 'en',
      langOptions: [
        { value: 'zh', label: 'Chinese' },
        { value: 'en', label: 'English' },
        { value: 'ja', label: 'Japanese' },
        { value: 'ko', label: 'Korean' },
        { value: 'fr', label: 'French' },
        { value: 'de', label: 'German' },
        { value: 'es', label: 'Spanish' },
        { value: 'it', label: 'Italian' },
        { value: 'pt', label: 'Portuguese' },
        { value: 'ru', label: 'Russian' }
      ],
      fileList: [],
      submitting: false,
      taskId: null,
      taskState: null,
      taskProgress: 0,
      taskFailedReason: '',
      pollTimer: null,
      advancedVisible: false,
      providerOptions: [],
      providerId: ''
    }
  },
  mounted() {
    this.loadProviders()
  },
  beforeUnmount() {
    this.stopPolling()
  },
  methods: {
    async loadProviders() {
      try {
        const resp = await api.smartSearch.getLlmProviders()
        const list = resp?.data?.data || resp?.data || []
        this.providerOptions = Array.isArray(list) ? list : []
      } catch (e) {
        // provider is optional
      }
    },
    onFileChange(file, files) {
      this.fileList = (files || []).slice(-1)
    },
    onFileRemove(file, files) {
      this.fileList = files || []
    },
    async submitTranslate() {
      if (!this.fileList.length) {
        ElMessage.warning(this.$t('translateTool.selectFile'))
        return
      }
      const raw = this.fileList[0]?.raw
      if (!raw) {
        ElMessage.error(this.$t('translateTool.selectFile'))
        return
      }

      this.submitting = true
      this.taskId = null
      this.taskState = null
      this.taskProgress = 0
      this.taskFailedReason = ''
      this.stopPolling()

      try {
        const formData = new FormData()
        formData.append('file', raw)
        formData.append('sourceLang', this.sourceLang)
        formData.append('targetLang', this.targetLang)
        if (this.providerId) formData.append('providerId', this.providerId)

        const resp = await api.translate.createDocumentTask(formData)
        const taskId = resp?.data?.data?.taskId
        if (!taskId) throw new Error('Missing taskId')
        this.taskId = taskId
        await this.pollOnce()
        this.startPolling()
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || this.$t('shared.requestFailed'))
      } finally {
        this.submitting = false
      }
    },
    startPolling() {
      this.stopPolling()
      if (!this.taskId) return
      this.pollTimer = window.setInterval(() => this.pollOnce(), 1500)
    },
    stopPolling() {
      if (this.pollTimer) {
        window.clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    },
    async pollOnce() {
      if (!this.taskId) return
      try {
        const resp = await api.translate.getTaskStatus(this.taskId)
        const d = resp?.data?.data || {}
        this.taskState = d.state || null
        const p = Number(d.progress)
        this.taskProgress = Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0
        if (this.taskState === 'completed') this.taskProgress = 100
        this.taskFailedReason = d.failedReason || ''
        if (this.taskState === 'completed' || this.taskState === 'failed') this.stopPolling()
      } catch (_) {
        // ignore
      }
    },
    async downloadResult() {
      if (!this.taskId) return
      try {
        const resp = await api.translate.downloadResult(this.taskId)
        const blob = new Blob([resp.data], { type: resp.headers?.['content-type'] || 'application/octet-stream' })
        let filename = 'translated'
        const cd = resp.headers?.['content-disposition'] || ''
        // Prefer RFC 5987 filename*=UTF-8''... for correct Chinese filename
        const mStar = /filename\*=(?:UTF-8'')?([^;\s"]+)/i.exec(cd)
        if (mStar && mStar[1]) {
          try {
            const value = mStar[1].replace(/^["']|["']$/g, '').replace(/^UTF-8''/i, '')
            filename = decodeURIComponent(value)
          } catch (_) {}
        }
        if (filename === 'translated') {
          const m = /filename="?([^";]+)"?/i.exec(cd)
          if (m && m[1]) filename = decodeURIComponent(m[1].replace(/\\"/g, '"'))
        }

        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || e?.message || this.$t('shared.requestFailed'))
      }
    }
  }
}
</script>

<style scoped>
.translate-tool-page {
  padding: 24px;
  min-height: 100%;
}
.translate-tool-header {
  margin-bottom: 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.translate-tool-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-primary);
}
.translate-tool-lang-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
  margin-bottom: 12px;
}
.lang-select {
  width: 240px;
}
.lang-arrow {
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.translate-tool-card {
  border-radius: 12px;
}
.translate-uploader {
  width: 100%;
}
.upload-icon {
  font-size: 40px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.upload-text-main {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--el-text-color-primary);
}
.upload-text-sub {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.translate-actions {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.translate-status {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.status-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px;
  padding: 6px 0;
}
.status-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.status-value {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.error-text {
  color: var(--el-color-danger);
  word-break: break-word;
}
.advanced-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.advanced-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.advanced-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
