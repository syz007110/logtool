<template>
  <div class="fault-cases-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ $t('faultCases.title') }}</span>
          <div class="header-actions">
            <el-button v-if="canCreate" type="primary" @click="openCreate">
              {{ $t('faultCases.create') }}
            </el-button>
            <el-button @click="loadLatest">
              {{ $t('shared.refresh') }}
            </el-button>
          </div>
        </div>
      </template>

      <div class="filters">
        <el-radio-group v-model="query.scope" @change="handleScopeChange" style="margin-right: 6px">
          <el-radio-button label="latest">{{ $t('faultCases.scopes.latestPublished') }}</el-radio-button>
          <el-radio-button label="mine">{{ $t('faultCases.scopes.mine') }}</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="query.q"
          :placeholder="$t('faultCases.searchPlaceholder')"
          clearable
          style="width: 260px"
          @keyup.enter="handleSearch"
        />
        <el-input
          v-model="query.errorCode"
          :placeholder="$t('faultCases.errorCodePlaceholder')"
          clearable
          style="width: 200px"
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" @click="handleSearch">{{ $t('shared.search') }}</el-button>
        <el-button @click="handleReset">{{ $t('shared.reset') }}</el-button>
      </div>

      <el-alert
        v-if="showLatestHint"
        :title="$t('faultCases.latestHint')"
        type="info"
        show-icon
        :closable="false"
        style="margin: 12px 0"
      />

      <el-table :data="rows" :loading="loading" style="width: 100%">
        <el-table-column prop="title" :label="$t('faultCases.columns.title')" min-width="220" show-overflow-tooltip />
        <el-table-column :label="$t('faultCases.columns.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.is_published === true ? 'success' : 'info'">
              {{ row.is_published === true ? $t('faultCases.statusPublished') : $t('faultCases.statusDraft') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('faultCases.columns.updatedAt')" width="190">
          <template #default="{ row }">
            {{ formatDate(row.updated_at_user || row.updatedAt || row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="goDetail(row)">{{ $t('faultCases.view') }}</el-button>
            <el-button v-if="canUpdate" size="small" @click="openEdit(row)">{{ $t('shared.edit') }}</el-button>
            <el-button v-if="canDelete" size="small" type="danger" @click="confirmDelete(row)">{{ $t('shared.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Create / Edit dialog -->
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? $t('faultCases.edit') : $t('faultCases.create')" width="980px">
      <el-form ref="formRef" :model="form" label-width="140px">
        <el-form-item :label="$t('faultCases.fields.title')" required>
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item :label="$t('faultCases.fields.symptom')">
          <el-input v-model="form.symptom" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="$t('faultCases.fields.possible_causes')">
          <el-input v-model="form.possible_causes" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="$t('faultCases.fields.troubleshooting_steps')">
          <el-input v-model="form.troubleshooting_steps" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item :label="$t('faultCases.fields.experience')">
          <el-input v-model="form.experience" type="textarea" :rows="3" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item :label="$t('faultCases.fields.device_id')">
              <el-input v-model="form.device_id" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('faultCases.fields.updated_at_user')">
              <el-date-picker
                v-model="form.updated_at_user"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
                :placeholder="$t('faultCases.updatedAtUserPlaceholder')"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item :label="$t('faultCases.fields.keywords')">
          <el-input v-model="form.keywordsRaw" :placeholder="$t('faultCases.keywordsPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('faultCases.fields.related_error_code_ids')">
          <el-input v-model="form.relatedErrorCodeIdsRaw" :placeholder="$t('faultCases.relatedErrorCodesPlaceholder')" />
        </el-form-item>

        <el-form-item :label="$t('faultCases.fields.attachments')">
          <el-upload
            multiple
            :file-list="uploadFileList"
            :http-request="handleUploadRequest"
            :on-remove="handleUploadRemove"
            :on-exceed="handleExceed"
          >
            <el-button>{{ $t('faultCases.upload') }}</el-button>
            <template #tip>
              <div class="el-upload__tip">
                {{ $t('faultCases.uploadTip') }}
              </div>
            </template>
          </el-upload>
          <div v-if="form.attachments.length" class="attachment-preview">
            <div v-for="(a, idx) in form.attachments" :key="idx" class="attachment-item">
              <a :href="a.url" target="_blank" rel="noopener noreferrer">{{ a.original_name || a.filename || a.url }}</a>
              <span class="attachment-meta">({{ formatSize(a.size_bytes) }})</span>
            </div>
          </div>
        </el-form-item>

        <el-divider />
        <div class="i18n-section">
          <div class="i18n-header">
            <span>{{ $t('faultCases.i18n.title') }}</span>
            <div class="i18n-actions">
              <el-select v-model="i18n.lang" style="width: 180px" :placeholder="$t('faultCases.i18n.selectLang')">
                <el-option label="English (en)" value="en" />
              </el-select>
              <el-button :disabled="!dialog.isEdit" @click="loadI18n">{{ $t('faultCases.i18n.load') }}</el-button>
              <el-button :disabled="!dialog.isEdit" @click="autoTranslate(false)">{{ $t('faultCases.i18n.autoTranslate') }}</el-button>
              <el-button :disabled="!dialog.isEdit" @click="autoTranslate(true)">{{ $t('faultCases.i18n.autoTranslateOverwrite') }}</el-button>
              <el-button type="primary" :disabled="!dialog.isEdit" @click="saveI18n">{{ $t('shared.save') }}</el-button>
            </div>
          </div>

          <el-form label-width="140px">
            <el-form-item :label="$t('faultCases.fields.title')">
              <el-input v-model="i18nForm.title" :placeholder="i18nPlaceholder" />
            </el-form-item>
            <el-form-item :label="$t('faultCases.fields.symptom')">
              <el-input v-model="i18nForm.symptom" type="textarea" :rows="2" :placeholder="i18nPlaceholder" />
            </el-form-item>
            <el-form-item :label="$t('faultCases.fields.possible_causes')">
              <el-input v-model="i18nForm.possible_causes" type="textarea" :rows="2" :placeholder="i18nPlaceholder" />
            </el-form-item>
            <el-form-item :label="$t('faultCases.fields.troubleshooting_steps')">
              <el-input v-model="i18nForm.troubleshooting_steps" type="textarea" :rows="3" :placeholder="i18nPlaceholder" />
            </el-form-item>
            <el-form-item :label="$t('faultCases.fields.experience')">
              <el-input v-model="i18nForm.experience" type="textarea" :rows="2" :placeholder="i18nPlaceholder" />
            </el-form-item>
            <el-form-item :label="$t('faultCases.fields.keywords')">
              <el-input v-model="i18nForm.keywordsRaw" :placeholder="$t('faultCases.keywordsPlaceholder')" />
            </el-form-item>
          </el-form>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialog.visible = false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save(false)">{{ $t('faultCases.saveDraft') }}</el-button>
        <el-button type="success" :loading="saving" @click="save(true)">{{ $t('faultCases.saveAndSubmit') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import api from '../api'

export default {
  name: 'FaultCases',
  setup () {
    const router = useRouter()
    const store = useStore()
    const { t } = useI18n()

    const loading = ref(false)
    const rows = ref([])
    const showLatestHint = ref(true)

    const query = reactive({
      scope: 'latest', // latest | mine
      q: '',
      errorCode: ''
    })

    const canCreate = computed(() => store.getters['auth/hasPermission']?.('fault_case:create'))
    const canUpdate = computed(() => store.getters['auth/hasPermission']?.('fault_case:update'))
    const canDelete = computed(() => store.getters['auth/hasPermission']?.('fault_case:delete'))

    const dialog = reactive({ visible: false, isEdit: false, id: null })
    const saving = ref(false)
    const formRef = ref(null)

    const form = reactive({
      title: '',
      symptom: '',
      possible_causes: '',
      troubleshooting_steps: '',
      experience: '',
      device_id: '',
      keywordsRaw: '',
      relatedErrorCodeIdsRaw: '',
      attachments: [],
      updated_at_user: null
    })

    const uploadFileList = ref([])

    const i18n = reactive({ lang: 'en' })
    const i18nForm = reactive({
      title: '',
      symptom: '',
      possible_causes: '',
      troubleshooting_steps: '',
      experience: '',
      keywordsRaw: ''
    })

    const i18nPlaceholder = computed(() => ' ')

    const resetForm = () => {
      Object.assign(form, {
        title: '',
        symptom: '',
        possible_causes: '',
        troubleshooting_steps: '',
        experience: '',
        device_id: '',
        keywordsRaw: '',
        relatedErrorCodeIdsRaw: '',
        attachments: [],
        updated_at_user: null
      })
      uploadFileList.value = []
      Object.assign(i18nForm, {
        title: '',
        symptom: '',
        possible_causes: '',
        troubleshooting_steps: '',
        experience: '',
        keywordsRaw: ''
      })
    }

    const formatDate = (d) => {
      if (!d) return '-'
      try {
        return new Date(d).toLocaleString()
      } catch {
        return String(d)
      }
    }

    const formatSize = (n) => {
      const num = Number(n)
      if (!Number.isFinite(num) || num <= 0) return '-'
      const units = ['B', 'KB', 'MB', 'GB']
      let v = num
      let i = 0
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
      return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
    }

    const parseIdList = (raw) => {
      if (!raw) return []
      return String(raw)
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((x) => Number.isFinite(x) && x > 0)
    }

    const parseKeywords = (raw) => {
      if (!raw) return []
      return String(raw)
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    }

    const loadLatest = async () => {
      loading.value = true
      showLatestHint.value = true
      try {
        const resp = await api.faultCases.latest({ limit: 5 })
        rows.value = resp.data.faultCases || []
      } catch (e) {
        ElMessage.error(e.response?.data?.message || 'Load failed')
      } finally {
        loading.value = false
      }
    }

    const loadMine = async () => {
      loading.value = true
      showLatestHint.value = false
      try {
        const resp = await api.faultCases.search({ mine: 1, limit: 20 })
        rows.value = resp.data.faultCases || []
      } catch (e) {
        ElMessage.error(e.response?.data?.message || 'Load failed')
      } finally {
        loading.value = false
      }
    }

    const handleSearch = async () => {
      const q = (query.q || '').trim()
      const errorCode = (query.errorCode || '').trim()
      if (!q && !errorCode) {
        return query.scope === 'mine' ? loadMine() : loadLatest()
      }

      loading.value = true
      try {
        showLatestHint.value = false
        const resp = await api.faultCases.search({
          q,
          errorCode,
          limit: 20,
          mine: query.scope === 'mine' ? 1 : undefined
        })
        rows.value = resp.data.faultCases || []
      } catch (e) {
        ElMessage.error(e.response?.data?.message || 'Search failed')
      } finally {
        loading.value = false
      }
    }

    const handleReset = () => {
      query.q = ''
      query.errorCode = ''
      query.scope === 'mine' ? loadMine() : loadLatest()
    }

    const handleScopeChange = () => {
      query.q = ''
      query.errorCode = ''
      query.scope === 'mine' ? loadMine() : loadLatest()
    }

    const goDetail = (row) => {
      router.push(`/dashboard/fault-cases/${row._id}`)
    }

    const openCreate = () => {
      resetForm()
      dialog.visible = true
      dialog.isEdit = false
      dialog.id = null
    }

    const openEdit = async (row) => {
      resetForm()
      dialog.visible = true
      dialog.isEdit = true
      dialog.id = row._id
      try {
        const resp = await api.faultCases.get(row._id)
        const fc = resp.data.faultCase
        Object.assign(form, {
          title: fc.title || '',
          symptom: fc.symptom || '',
          possible_causes: fc.possible_causes || '',
          troubleshooting_steps: fc.troubleshooting_steps || '',
          experience: fc.experience || '',
          device_id: fc.device_id || '',
          keywordsRaw: Array.isArray(fc.keywords) ? fc.keywords.join(', ') : '',
          relatedErrorCodeIdsRaw: Array.isArray(fc.related_error_code_ids) ? fc.related_error_code_ids.join(', ') : '',
          attachments: Array.isArray(fc.attachments) ? fc.attachments : [],
          updated_at_user: fc.updated_at_user || null
        })
        uploadFileList.value = (form.attachments || []).map((a, idx) => ({ name: a.original_name || a.filename || `file-${idx}`, url: a.url }))
      } catch (e) {
        ElMessage.error(e.response?.data?.message || 'Load failed')
      }
    }

    const confirmDelete = async (row) => {
      try {
        await ElMessageBox.confirm(t('shared.messages.confirmDelete'), t('shared.messages.deleteConfirmTitle'), { type: 'warning' })
        await api.faultCases.delete(row._id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        await handleSearch()
      } catch (_) {}
    }

    const handleUploadRequest = async ({ file }) => {
      try {
        const fd = new FormData()
        fd.append('files', file)
        const resp = await api.faultCases.uploadAttachments(fd)
        const uploaded = resp.data.files?.[0]
        if (uploaded) {
          form.attachments.push(uploaded)
          uploadFileList.value.push({ name: uploaded.original_name || uploaded.filename || file.name, url: uploaded.url })
        }
      } catch (e) {
        ElMessage.error(e.response?.data?.message || 'Upload failed')
      }
    }

    const handleUploadRemove = (file) => {
      const idx = (form.attachments || []).findIndex((a) => a.url === file.url || a.original_name === file.name)
      if (idx >= 0) form.attachments.splice(idx, 1)
    }

    const handleExceed = () => {
      ElMessage.warning(t('faultCases.uploadExceed'))
    }

    const save = async (submitForReview) => {
      if (!form.title || !form.title.trim()) {
        ElMessage.warning(t('faultCases.validation.titleRequired'))
        return
      }
      saving.value = true
      try {
        const payload = {
          title: form.title,
          symptom: form.symptom,
          possible_causes: form.possible_causes,
          troubleshooting_steps: form.troubleshooting_steps,
          experience: form.experience,
          device_id: form.device_id,
          keywords: parseKeywords(form.keywordsRaw),
          related_error_code_ids: parseIdList(form.relatedErrorCodeIdsRaw),
          attachments: form.attachments,
          updated_at_user: form.updated_at_user,
          submit_for_review: !!submitForReview
        }
        if (dialog.isEdit && dialog.id) {
          await api.faultCases.update(dialog.id, payload)
        } else {
          await api.faultCases.create(payload)
        }
        ElMessage.success(t('shared.messages.saveSuccess'))
        dialog.visible = false
        await handleSearch()
      } catch (e) {
        ElMessage.error(e.response?.data?.message || t('shared.messages.saveFailed'))
      } finally {
        saving.value = false
      }
    }

    const loadI18n = async () => {
      if (!dialog.isEdit || !dialog.id) return
      try {
        const resp = await api.faultCases.getI18nByLang(dialog.id, i18n.lang)
        const c = resp.data.i18nContent || {}
        Object.assign(i18nForm, {
          title: c.title || '',
          symptom: c.symptom || '',
          possible_causes: c.possible_causes || '',
          troubleshooting_steps: c.troubleshooting_steps || '',
          experience: c.experience || '',
          keywordsRaw: Array.isArray(c.keywords) ? c.keywords.join(', ') : ''
        })
        ElMessage.success(t('shared.success'))
      } catch (e) {
        ElMessage.error(e.response?.data?.message || t('shared.messages.loadFailed'))
      }
    }

    const saveI18n = async () => {
      if (!dialog.isEdit || !dialog.id) return
      try {
        await api.faultCases.saveI18nByLang(dialog.id, i18n.lang, {
          title: i18nForm.title,
          symptom: i18nForm.symptom,
          possible_causes: i18nForm.possible_causes,
          troubleshooting_steps: i18nForm.troubleshooting_steps,
          experience: i18nForm.experience,
          keywords: parseKeywords(i18nForm.keywordsRaw)
        })
        ElMessage.success(t('shared.messages.saveSuccess'))
      } catch (e) {
        ElMessage.error(e.response?.data?.message || t('shared.messages.saveFailed'))
      }
    }

    const autoTranslate = async (overwrite) => {
      if (!dialog.isEdit || !dialog.id) return
      try {
        const resp = await api.faultCases.autoTranslateI18n(dialog.id, i18n.lang, overwrite)
        const t = resp.data.translatedFields || {}
        Object.assign(i18nForm, {
          title: t.title || '',
          symptom: t.symptom || '',
          possible_causes: t.possible_causes || '',
          troubleshooting_steps: t.troubleshooting_steps || '',
          experience: t.experience || '',
          keywordsRaw: Array.isArray(t.keywords) ? t.keywords.join(', ') : ''
        })
        ElMessage.success(t('faultCases.i18n.translated'))
      } catch (e) {
        ElMessage.error(e.response?.data?.message || t('faultCases.i18n.translateFailed'))
      }
    }

    onMounted(() => {
      loadLatest()
    })

    return {
      loading,
      rows,
      query,
      showLatestHint,
      canCreate,
      canUpdate,
      canDelete,
      dialog,
      form,
      formRef,
      saving,
      uploadFileList,
      i18n,
      i18nForm,
      i18nPlaceholder,
      formatDate,
      formatSize,
      loadLatest,
      loadMine,
      handleSearch,
      handleReset,
      handleScopeChange,
      goDetail,
      openCreate,
      openEdit,
      confirmDelete,
      handleUploadRequest,
      handleUploadRemove,
      handleExceed,
      save,
      loadI18n,
      saveI18n,
      autoTranslate
    }
  }
}
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.attachment-preview {
  margin-top: 8px;
}
.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}
.attachment-meta {
  color: #909399;
  font-size: 12px;
}
.i18n-section {
  margin-top: 8px;
}
.i18n-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.i18n-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
</style>


