<template>
  <div class="fault-case-form-page">
    <!-- 顶部标题栏和操作按钮 -->
    <div class="page-header">
      <div class="header-left">
        <el-button text @click="goBack" class="back-button">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <div class="title-section">
          <h1 class="page-title">{{ isEdit ? $t('faultCases.edit') : $t('faultCases.create') }}</h1>
          <span class="draft-status">{{ $t('faultCases.statusDraft') }}</span>
        </div>
      </div>
      <div class="header-right">
        <el-button @click="goBack">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save()">
          <el-icon><Document /></el-icon>
          {{ $t('faultCases.publish') }}
        </el-button>
      </div>
    </div>

    <!-- 主要内容区域 - 两列布局 -->
    <div class="form-content">
      <!-- 左列 -->
      <div class="form-left-column">
        <!-- 案例定义板块 -->
        <el-card class="section-card" shadow="hover">
          <template #header>
            <div class="section-header">
              <h2 class="section-title">{{ $t('faultCases.sections.problemDefinition') }}</h2>
            </div>
          </template>
          <el-form :model="form" label-width="0">
            <div class="form-row">
              <div class="form-item">
                <label class="form-label">
                  {{ $t('faultCases.fields.module') }}
                  <span class="required">*</span>
                </label>
                <el-input v-model="form.module" :placeholder="$t('faultCases.modulePlaceholder')" />
              </div>
              <div class="form-item">
                <label class="form-label">{{ $t('faultCases.fields.jira_key') }}</label>
                <el-input 
                  v-model="form.jira_key" 
                  :disabled="form.source !== 'jira'"
                  :placeholder="$t('faultCases.jiraKeyPlaceholder')"
                />
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">
                {{ $t('faultCases.fields.title') }}
                <span class="required">*</span>
              </label>
              <el-input v-model="form.title" :placeholder="$t('faultCases.titlePlaceholder')" />
            </div>

            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.symptom') }}</label>
              <el-input 
                v-model="form.symptom" 
                type="textarea" 
                :rows="5"
                :placeholder="$t('faultCases.symptomPlaceholder')"
              />
            </div>
          </el-form>
        </el-card>

        <!-- 分析与结果板块 -->
        <el-card class="section-card" shadow="hover">
          <template #header>
            <div class="section-header">
              <h2 class="section-title">{{ $t('faultCases.sections.analysisResolution') }}</h2>
            </div>
          </template>
          <el-form :model="form" label-width="0">
            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.possible_causes') }}</label>
              <el-input 
                v-model="form.possible_causes" 
                type="textarea" 
                :rows="4"
                :placeholder="$t('faultCases.possibleCausesPlaceholder')"
              />
            </div>

            <div class="form-item">
              <label class="form-label solution-label">{{ $t('faultCases.fields.solution') }}</label>
              <el-input 
                v-model="form.solution" 
                type="textarea" 
                :rows="6"
                :placeholder="$t('faultCases.solutionPlaceholder')"
                class="solution-textarea"
              />
            </div>

            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.remark') }}</label>
              <el-input 
                v-model="form.remark" 
                type="textarea" 
                :rows="4"
                :placeholder="$t('faultCases.remarkPlaceholder')"
                class="remark-textarea"
              />
            </div>
          </el-form>
        </el-card>
      </div>

      <!-- 右列 -->
      <div class="form-right-column">
        <!-- 分类板块 -->
        <el-card class="section-card" shadow="hover">
          <template #header>
            <div class="section-header">
              <el-icon class="section-icon"><FolderOpened /></el-icon>
              <h3 class="section-title-small">{{ $t('faultCases.sections.classification') }}</h3>
            </div>
          </template>
          <el-form :model="form" label-width="0">
            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.equipment_model') }}</label>
              <el-select
                v-model="form.equipment_model"
                multiple
                filterable
                clearable
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="3"
                style="width: 100%"
                :placeholder="$t('faultCases.equipmentModelPlaceholder')"
                @focus="loadEquipmentModels"
              >
                <el-option v-for="m in equipmentModelOptions" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
            </div>

            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.related_error_code_ids') }}</label>
              <div class="error-codes-selector">
                <div class="selected-error-codes">
                  <el-tag
                    v-for="codeId in form.related_error_code_ids"
                    :key="codeId"
                    closable
                    size="small"
                    style="margin-right: 8px; margin-bottom: 8px;"
                    @close="removeErrorCode(codeId)"
                  >
                    {{ getErrorCodeLabel(codeId) }}
                  </el-tag>
                </div>
                <el-button
                  type="primary"
                  plain
                  size="small"
                  @click="showErrorCodeDialog = true"
                >
                  <el-icon><Plus /></el-icon>
                  {{ $t('faultCases.selectErrorCodes') }}
                </el-button>
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.keywords') }}</label>
              <el-select
                v-model="keywordTags"
                multiple
                filterable
                allow-create
                default-first-option
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="3"
                style="width: 100%"
                :placeholder="$t('faultCases.keywordsPlaceholder')"
                @keyup.enter="handleKeywordEnter"
                @keydown.enter.prevent
                @input="handleKeywordSelectInput"
              >
                <el-option
                  v-for="(keyword, index) in keywordTags"
                  :key="index"
                  :label="keyword"
                  :value="keyword"
                />
              </el-select>
            </div>
          </el-form>
        </el-card>

        <!-- 附件板块 -->
        <el-card class="section-card" shadow="hover">
          <template #header>
            <div class="section-header">
              <el-icon class="section-icon"><Paperclip /></el-icon>
              <h3 class="section-title-small">{{ $t('faultCases.sections.attachments') }}</h3>
              <span class="attachment-count">{{ form.attachments.length }}/10</span>
            </div>
          </template>
          <div class="attachment-section">
            <el-upload
              class="attachment-upload"
              drag
              multiple
              :file-list="uploadFileList"
              :http-request="handleUploadRequest"
              :on-remove="handleUploadRemove"
              :on-exceed="handleExceed"
              :limit="10"
            >
              <el-icon class="upload-icon"><Upload /></el-icon>
              <div class="upload-text">{{ $t('faultCases.uploadClickText') }}</div>
              <div class="upload-hint">{{ $t('faultCases.uploadTip') }}</div>
            </el-upload>
            <div v-if="form.attachments.length > 0" class="attachment-list">
              <div v-for="(a, idx) in form.attachments" :key="idx" class="attachment-item">
                <a :href="a.url" target="_blank" rel="noopener noreferrer" class="attachment-link">
                  {{ a.original_name || a.filename || a.url }}
                </a>
                <span class="attachment-meta">({{ formatSize(a.size_bytes) }})</span>
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 关联故障码选择弹窗 -->
    <el-dialog
      v-model="showErrorCodeDialog"
      :title="$t('faultCases.selectErrorCodes')"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="error-code-dialog-content">
        <div class="search-bar">
          <el-input
            v-model="errorCodeSearch"
            :placeholder="$t('faultCases.searchErrorCodes')"
            clearable
            style="width: 100%;"
            @input="handleErrorCodeSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div v-if="!errorCodeSearch || errorCodeSearch.trim() === ''" class="search-hint">
          <el-empty :description="$t('faultCases.searchErrorCodesHint')" :image-size="80" />
        </div>

        <el-table
          v-else
          ref="errorCodeTableRef"
          :data="errorCodeTableData"
          :loading="errorCodeTableLoading"
          style="width: 100%"
          max-height="300px"
          @selection-change="handleErrorCodeSelectionChange"
        >
          <el-table-column type="selection" width="55" :reserve-selection="true" />
          <el-table-column prop="subsystem" :label="$t('errorCodes.subsystem')" width="100" />
          <el-table-column prop="code" :label="$t('errorCodes.code')" width="120" />
          <el-table-column :label="$t('faultCases.fields.hintInfo')" min-width="200">
            <template #default="{ row }">
              <div class="min-w-0">
                {{ [row.user_hint, row.operation].filter(Boolean).join(', ') || '-' }}
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="selected-count">
          {{ $t('faultCases.selectedErrorCodesCount', { count: form.related_error_code_ids.length }) }}
        </div>
      </div>

      <template #footer>
        <el-button @click="showErrorCodeDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" @click="confirmErrorCodeSelection">{{ $t('shared.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { ElMessage } from 'element-plus'
import { Search, ArrowLeft, Document, FolderOpened, Paperclip, Upload, Plus } from '@element-plus/icons-vue'
import api from '../api'

export default {
  name: 'FaultCaseForm',
  components: {
    Search,
    ArrowLeft,
    Document,
    FolderOpened,
    Paperclip,
    Upload,
    Plus
  },
  setup() {
    const { t } = useI18n()
    const router = useRouter()
    const route = useRoute()
    const store = useStore()

    const isEdit = computed(() => route.params.id && route.params.id !== 'new')
    const saving = ref(false)

    // Form state
    const form = reactive({
      source: 'manual',
      jira_key: '',
      module: '',
      title: '',
      symptom: '',
      possible_causes: '',
      solution: '',
      remark: '',
      troubleshooting_steps: '',
      experience: '',
      equipment_model: [],
      keywordsRaw: '',
      related_error_code_ids: [],
      attachments: [],
      updated_at_user: null,
      is_published: false
    })

    const uploadFileList = ref([])
    const equipmentModelOptions = ref([])
    const equipmentModelLoading = ref(false)
    const keywordTags = ref([])

    // Error code selection dialog
    const showErrorCodeDialog = ref(false)
    const errorCodeSearch = ref('')
    const errorCodeTableData = ref([])
    const errorCodeTableLoading = ref(false)
    const errorCodeSelectedRows = ref([])
    const errorCodeOptionsMap = ref(new Map()) // Map<id, {code, subsystem, short_message, user_hint, operation}>
    let errorCodeSearchTimer = null

    const formatSize = (n) => {
      const num = Number(n)
      if (!Number.isFinite(num) || num <= 0) return '-'
      const units = ['B', 'KB', 'MB', 'GB']
      let v = num
      let i = 0
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
      return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
    }

    const parseKeywords = (raw) => {
      if (!raw) return []
      return String(raw)
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    }

    const handleKeywordSelectInput = (value) => {
      if (Array.isArray(value)) {
        keywordTags.value = value
        updateKeywordsRaw()
      }
    }

    const handleKeywordEnter = () => {
      updateKeywordsRaw()
    }

    const updateKeywordsRaw = () => {
      form.keywordsRaw = keywordTags.value.join(', ')
    }

    const loadKeywordsFromRaw = () => {
      if (form.keywordsRaw) {
        keywordTags.value = parseKeywords(form.keywordsRaw)
      } else {
        keywordTags.value = []
      }
    }

    const loadEquipmentModels = async () => {
      if (equipmentModelOptions.value.length > 0) return
      equipmentModelLoading.value = true
      try {
        const resp = await api.deviceModels.getList()
        const models = resp.data?.models || []
        equipmentModelOptions.value = models.map((m) => ({
          value: m.device_model || m.model || m.id,
          label: `${m.device_model || m.model || m.id}${m.hospital ? ` (${m.hospital})` : ''}`
        }))
      } catch (e) {
        console.error('Failed to load equipment models:', e)
      } finally {
        equipmentModelLoading.value = false
      }
    }

    const getErrorCodeLabel = (codeId) => {
      const option = errorCodeOptionsMap.value.get(codeId)
      if (option) {
        const hintText = [option.user_hint, option.operation].filter(Boolean).join(', ')
        return `${option.subsystem || ''}${option.subsystem ? ' - ' : ''}${option.code}${hintText ? ` - ${hintText}` : ''}`
      }
      return String(codeId)
    }

    const loadErrorCodeOptionsForSelected = async () => {
      if (!form.related_error_code_ids || form.related_error_code_ids.length === 0) {
        errorCodeOptionsMap.value.clear()
        return
      }
      try {
        const resp = await api.errorCodes.getList({ ids: form.related_error_code_ids.join(',') })
        const codes = resp.data?.error_codes || []
        errorCodeOptionsMap.value.clear()
        codes.forEach((code) => {
          errorCodeOptionsMap.value.set(code.id, {
            code: code.code,
            subsystem: code.subsystem,
            user_hint: code.user_hint,
            operation: code.operation
          })
        })
      } catch (e) {
        console.error('Failed to load error codes:', e)
      }
    }

    const handleErrorCodeSearch = () => {
      if (errorCodeSearchTimer) {
        clearTimeout(errorCodeSearchTimer)
      }
      errorCodeSearchTimer = setTimeout(async () => {
        const q = (errorCodeSearch.value || '').trim()
        if (!q) {
          errorCodeTableData.value = []
          return
        }
        errorCodeTableLoading.value = true
        try {
          const resp = await api.errorCodes.getList({ q, page: 1, limit: 50 })
          errorCodeTableData.value = resp.data?.error_codes || []
        } catch (e) {
          console.error('Failed to search error codes:', e)
          ElMessage.error(t('shared.requestFailed'))
          errorCodeTableData.value = []
        } finally {
          errorCodeTableLoading.value = false
        }
      }, 300)
    }

    const handleErrorCodeSelectionChange = (selection) => {
      errorCodeSelectedRows.value = selection
    }

    const confirmErrorCodeSelection = () => {
      const selectedIds = errorCodeSelectedRows.value.map((row) => row.id)
      const existingIds = new Set(form.related_error_code_ids)
      selectedIds.forEach((id) => {
        if (!existingIds.has(id)) {
          form.related_error_code_ids.push(id)
        }
      })
      loadErrorCodeOptionsForSelected()
      showErrorCodeDialog.value = false
      errorCodeSearch.value = ''
      errorCodeTableData.value = []
      errorCodeSelectedRows.value = []
    }

    const removeErrorCode = (codeId) => {
      const index = form.related_error_code_ids.indexOf(codeId)
      if (index > -1) {
        form.related_error_code_ids.splice(index, 1)
        errorCodeOptionsMap.value.delete(codeId)
      }
    }

    const handleUploadRequest = async (options) => {
      const formData = new FormData()
      formData.append('file', options.file)
      try {
        const resp = await api.faultCases.uploadAttachments(formData)
        const attachment = resp.data?.attachment
        if (attachment) {
          form.attachments.push(attachment)
          uploadFileList.value.push({
            name: attachment.original_name || attachment.filename,
            url: attachment.url,
            uid: attachment.id || Date.now()
          })
        }
      } catch (e) {
        ElMessage.error(e.response?.data?.message || t('shared.requestFailed'))
        throw e
      }
    }

    const handleUploadRemove = (file) => {
      const index = form.attachments.findIndex((a) => a.url === file.url || a.id === file.uid)
      if (index > -1) {
        form.attachments.splice(index, 1)
      }
      const fileListIndex = uploadFileList.value.findIndex((f) => f.uid === file.uid)
      if (fileListIndex > -1) {
        uploadFileList.value.splice(fileListIndex, 1)
      }
    }

    const handleExceed = () => {
      ElMessage.warning(t('faultCases.uploadExceed'))
    }

    const goBack = () => {
      router.back()
    }

    const save = async () => {
      // 基本验证
      if (!form.title || !form.title.trim()) {
        ElMessage.warning(t('faultCases.validation.titleRequired'))
        return
      }
      if (!form.module || !form.module.trim()) {
        ElMessage.warning(t('faultCases.validation.moduleRequired'))
        return
      }

      saving.value = true
      try {
        updateKeywordsRaw()
        const payload = {
          source: form.source,
          jira_key: form.jira_key || undefined,
          module: form.module || undefined,
          title: form.title,
          symptom: form.symptom || undefined,
          possible_causes: form.possible_causes || undefined,
          solution: form.solution || undefined,
          remark: form.remark || undefined,
          equipment_model: form.equipment_model || [],
          keywords: form.keywordsRaw || undefined,
          related_error_code_ids: form.related_error_code_ids || [],
          attachments: form.attachments.map((a) => a.id || a.url) || [],
          updated_at_user: form.updated_at_user || undefined,
          is_published: form.is_published
        }

        if (isEdit.value) {
          await api.faultCases.update(route.params.id, payload)
          ElMessage.success(t('shared.messages.updateSuccess'))
        } else {
          await api.faultCases.create(payload)
          ElMessage.success(t('shared.messages.createSuccess'))
        }

        if (route.query.source === 'jira' && route.query.jira_key) {
          window.close()
        } else {
          router.back()
        }
      } catch (e) {
        const errorMessage = e.response?.data?.message || t('shared.messages.saveFailed')
        ElMessage.error(errorMessage)
        console.error('Save fault case failed:', e)
      } finally {
        saving.value = false
      }
    }

    const loadFaultCase = async () => {
      if (!isEdit.value) {
        if (route.query.source === 'jira' && route.query.jira_key) {
          form.source = 'jira'
          form.jira_key = route.query.jira_key
          try {
            const resp = await api.jira.getIssue(route.query.jira_key)
            const issue = resp.data?.issue
            if (issue) {
              form.module = issue.components?.[0] || issue.module || ''
              form.title = issue.summary || issue.title || ''
              form.symptom = issue.description || ''
              form.possible_causes = issue.possible_causes || ''
              form.solution = issue.solution || ''
              form.remark = issue.remark || ''
            }
          } catch (e) {
            console.error('Failed to load Jira issue:', e)
          }
        }
        return
      }

      try {
        const resp = await api.faultCases.get(route.params.id)
        const data = resp.data?.fault_case
        if (data) {
          form.source = data.source || 'manual'
          form.jira_key = data.jira_key || ''
          form.module = data.module || ''
          form.title = data.title || ''
          form.symptom = data.symptom || ''
          form.possible_causes = data.possible_causes || ''
          form.solution = data.solution || ''
          form.remark = data.remark || ''
          form.equipment_model = data.equipment_model || []
          form.keywordsRaw = data.keywords || ''
          form.related_error_code_ids = data.related_error_code_ids || []
          form.attachments = data.attachments || []
          form.updated_at_user = data.updated_at_user || null
          form.is_published = data.is_published || false

          loadKeywordsFromRaw()
          if (form.related_error_code_ids.length > 0) {
            loadErrorCodeOptionsForSelected()
          }
          if (form.attachments.length > 0) {
            uploadFileList.value = form.attachments.map((a) => ({
              name: a.original_name || a.filename || a.url,
              url: a.url,
              uid: a.id || Date.now()
            }))
          }
        }
      } catch (e) {
        ElMessage.error(e.response?.data?.message || t('shared.requestFailed'))
        router.back()
      }
    }

    onMounted(() => {
      loadFaultCase()
    })

    return {
      form,
      saving,
      isEdit,
      goBack,
      save,
      uploadFileList,
      equipmentModelOptions,
      equipmentModelLoading,
      loadEquipmentModels,
      keywordTags,
      handleKeywordSelectInput,
      handleKeywordEnter,
      showErrorCodeDialog,
      errorCodeSearch,
      errorCodeTableData,
      errorCodeTableLoading,
      handleErrorCodeSearch,
      handleErrorCodeSelectionChange,
      confirmErrorCodeSelection,
      removeErrorCode,
      getErrorCodeLabel,
      handleUploadRequest,
      handleUploadRemove,
      handleExceed,
      formatSize
    }
  }
}
</script>

<style scoped>
.fault-case-form-page {
  min-height: 100vh;
  background: rgba(236, 236, 240, 0.1);
  padding: 24px;
}

.page-header {
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-button {
  padding: 8px;
}

.title-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #0a0a0a;
  line-height: 28px;
}

.draft-status {
  font-size: 12px;
  color: #717182;
  line-height: 16px;
}

.header-right {
  display: flex;
  gap: 16px;
  align-items: center;
}

.form-content {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.form-left-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.form-right-column {
  width: 376px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex-shrink: 0;
}

.section-card {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #0a0a0a;
  line-height: 28px;
}

.section-title-small {
  margin: 0;
  font-size: 14px;
  font-weight: normal;
  color: #717182;
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.section-icon {
  font-size: 16px;
  color: #717182;
}

.attachment-count {
  margin-left: auto;
  font-size: 12px;
  color: #717182;
}

.form-row {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.form-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.form-label {
  font-size: 14px;
  color: #0a0a0a;
  line-height: 14px;
}

.required {
  color: #fb2c36;
  margin-left: 4px;
}

.solution-label {
  font-weight: bold;
  color: #008236;
}

.solution-textarea :deep(.el-textarea__inner) {
  background: rgba(240, 253, 244, 0.2);
  border-color: #b9f8cf;
}

.remark-textarea :deep(.el-textarea__inner) {
  background: rgba(255, 251, 235, 0.3);
  border-color: #fef3c6;
}

.error-codes-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.selected-error-codes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
  padding: 4px 0;
}

.attachment-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.attachment-upload :deep(.el-upload) {
  width: 100%;
}

.attachment-upload :deep(.el-upload-dragger) {
  width: 100%;
  padding: 40px 20px;
  border: 2px dashed rgba(113, 113, 130, 0.2);
  border-radius: 10px;
  background: transparent;
}

.upload-icon {
  font-size: 32px;
  color: #717182;
  margin-bottom: 12px;
}

.upload-text {
  font-size: 14px;
  color: #0a0a0a;
  margin-bottom: 8px;
}

.upload-hint {
  font-size: 12px;
  color: #717182;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  background: #f5f7fa;
}

.attachment-link {
  color: #409eff;
  text-decoration: none;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-link:hover {
  text-decoration: underline;
}

.attachment-meta {
  color: #909399;
  font-size: 12px;
  flex-shrink: 0;
}

.error-code-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-bar {
  margin-bottom: 8px;
}

.search-hint {
  padding: 40px 0;
}

.selected-count {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 14px;
  color: #606266;
}

.min-w-0 {
  min-width: 0;
  word-break: break-word;
}
</style>
