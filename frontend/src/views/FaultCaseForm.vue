<template>
  <div class="fault-case-form-page">
    <!-- 顶部标题栏和操作按钮 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">{{ isEdit ? $t('faultCases.edit') : $t('faultCases.create') }}</h1>
      </div>
      <div class="header-right">
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
        <el-card class="section-card">
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
                <el-select
                  v-model="form.module"
                  filterable
                  clearable
                  style="width: 100%"
                  :placeholder="$t('faultCases.modulePlaceholder')"
                >
                  <el-option
                    v-for="module in moduleOptions"
                    :key="module.module_key"
                    :label="module.displayName"
                    :value="module.module_key"
                  />
                </el-select>
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
        <el-card class="section-card">
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
                class="remark-textarea"
              />
            </div>
          </el-form>
        </el-card>
      </div>

      <!-- 右列 -->
      <div class="form-right-column">
        <!-- 分类板块 -->
        <el-card class="section-card">
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
              <div class="error-codes-selector-new">
                <el-select
                  v-model="form.related_error_code_ids"
                  multiple
                  filterable
                  remote
                  reserve-keyword
                  :placeholder="$t('faultCases.searchErrorCodes')"
                  :remote-method="remoteSearchErrorCodes"
                  :loading="remoteErrorCodeLoading"
                  class="error-code-select"
                  @change="handleErrorCodeSelectChange"
                >
                  <el-option
                    v-for="item in remoteErrorCodeOptions"
                    :key="item.id"
                    :label="formatErrorCodeOptionLabel(item)"
                    :value="item.id"
                  >
                    <div class="error-code-option">
                      <span class="option-code">{{ item.code }}</span>
                      <span class="option-subsystem">{{ item.subsystem }}</span>
                      <span class="option-hint">{{ item.user_hint || item.operation || '-' }}</span>
                    </div>
                  </el-option>
                </el-select>
                <el-button
                  type="default"
                  class="advanced-select-btn"
                  @click="showErrorCodeDialog = true"
                >
                  <el-icon><Search /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.keywords') }}</label>
              <el-select
                ref="keywordSelect"
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
                @change="handleKeywordSelectInput"
              >
                <el-option
                  v-for="(keyword, index) in keywordTags"
                  :key="index"
                  :label="keyword"
                  :value="keyword"
                />
              </el-select>
            </div>

            <div class="form-item">
              <label class="form-label">{{ $t('faultCases.fields.status') }}</label>
              <el-select
                v-model="form.status"
                filterable
                clearable
                style="width: 100%"
                :placeholder="$t('faultCases.statusPlaceholder')"
                :loading="statusLoading"
              >
                <el-option
                  v-for="status in statusOptions"
                  :key="status.status_key"
                  :label="status.displayName"
                  :value="status.status_key"
                />
              </el-select>
            </div>
          </el-form>
        </el-card>

        <!-- 附件板块 -->
        <el-card class="section-card">
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
import { Search, Document, FolderOpened, Paperclip, Upload, Plus } from '@element-plus/icons-vue'
import api from '../api'

export default {
  name: 'FaultCaseForm',
  components: {
    Search,
    Document,
    FolderOpened,
    Paperclip,
    Upload,
    Plus
  },
  setup() {
    const { t, locale } = useI18n()
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
      status: ''
    })

    const uploadFileList = ref([])
    const equipmentModelOptions = ref([])
    const equipmentModelLoading = ref(false)
    const keywordTags = ref([])
    const keywordSelect = ref(null)

    // Related Error Codes Remote Search
    const remoteErrorCodeOptions = ref([])
    const remoteErrorCodeLoading = ref(false)

    const remoteSearchErrorCodes = (query) => {
      const trimmed = String(query || '').trim()
      if (trimmed !== '') {
        remoteErrorCodeLoading.value = true
        if (errorCodeSearchTimer) clearTimeout(errorCodeSearchTimer)
        
        errorCodeSearchTimer = setTimeout(async () => {
          try {
            // 若输入看起来是“故障码”（如 010A / 0x010A），优先走 code 精确匹配；否则走 keyword 模糊搜索
            const normalizedCode = trimmed.replace(/^0x/i, '').toUpperCase()
            const isLikelyCode = /^[0-9A-F]{4}$/.test(normalizedCode)

            const resp = await api.errorCodes.getList(
              isLikelyCode
                ? { code: normalizedCode, page: 1, limit: 20 }
                : { keyword: trimmed, page: 1, limit: 20 }
            )
            remoteErrorCodeOptions.value = resp.data?.errorCodes || []
            
            // 确保已选择的项也在列表中，否则 label 会显示为 ID
            await ensureSelectedOptionsInRemote()
          } catch (e) {
            console.error('Failed to remote search error codes:', e)
          } finally {
            remoteErrorCodeLoading.value = false
          }
        }, 300)
      } else {
        remoteErrorCodeOptions.value = []
      }
    }

    const ensureSelectedOptionsInRemote = async () => {
      const selectedIds = form.related_error_code_ids
      if (!selectedIds || selectedIds.length === 0) return

      const missingIds = selectedIds.filter(id => !remoteErrorCodeOptions.value.find(opt => opt.id === id))
      if (missingIds.length > 0) {
        try {
          const resp = await api.errorCodes.getList({ ids: missingIds.join(',') })
          const missingOptions = resp.data?.errorCodes || []
          remoteErrorCodeOptions.value = [...remoteErrorCodeOptions.value, ...missingOptions]
        } catch (e) {
          console.error('Failed to load missing selected error codes:', e)
        }
      }
    }

    const formatErrorCodeOptionLabel = (item) => {
      return `${item.subsystem ? item.subsystem + ' - ' : ''}${item.code}`
    }

    const handleErrorCodeSelectChange = () => {
      // 当选择变化时，更新本地映射以便显示 label（如果需要的话，目前 el-select 内部会自动处理展示）
      loadErrorCodeOptionsForSelected()
    }

    // Module options
    const moduleList = ref([])
    const moduleLoading = ref(false)
    const isZhCN = computed(() => {
      const currentLocale = locale.value || 'zh-CN'
      return currentLocale === 'zh-CN'
    })
    const moduleOptions = computed(() => {
      return moduleList.value.map(module => ({
        ...module,
        displayName: isZhCN.value ? module.name_zh : module.name_en
      }))
    })

    // Status options
    const statusList = ref([])
    const statusLoading = ref(false)
    const statusOptions = computed(() => {
      return statusList.value.map(status => ({
        ...status,
        displayName: isZhCN.value ? status.name_zh : status.name_en
      }))
    })

    // Load module list
    const loadModules = async () => {
      if (moduleList.value.length > 0) return
      
      // 检查权限
      const hasPermission = store.getters['auth/hasPermission']?.('fault_case_config:manage')
      if (!hasPermission) {
        console.warn('没有权限加载故障案例模块列表: fault_case_config:manage', {
          user: store.state.auth.user,
          permissions: store.getters['auth/permissions']
        })
        // 即使没有权限，也尝试调用 API，以便显示明确的错误信息
      }
      
      moduleLoading.value = true
      try {
        const resp = await api.faultCaseModules.getList({ is_active: true })
        console.log('获取故障案例模块列表响应:', resp.data)
        if (resp.data?.success) {
          moduleList.value = resp.data.modules || []
          console.log('模块列表加载成功，共', moduleList.value.length, '条记录')
        } else {
          console.error('获取故障案例模块列表失败: 响应数据格式不正确', resp.data)
          ElMessage.error('获取模块列表失败: 响应数据格式不正确')
        }
      } catch (e) {
        console.error('获取故障案例模块列表失败:', e)
        // 如果是权限错误，显示更明确的提示
        if (e.response?.status === 403) {
          ElMessage.warning(t('faultCases.noPermissionToLoadModules') || '没有权限加载模块列表，请联系管理员授予 fault_case_config:manage 权限')
        } else if (e.response?.status === 401) {
          ElMessage.warning('未登录或登录已过期，请重新登录')
        } else {
          ElMessage.error(t('faultCases.failedToLoadModules') || '加载模块列表失败: ' + (e.response?.data?.message || e.message))
        }
      } finally {
        moduleLoading.value = false
      }
    }

    // Load status list
    const loadStatuses = async () => {
      if (statusList.value.length > 0) return
      
      // 检查权限
      const hasPermission = store.getters['auth/hasPermission']?.('fault_case_config:manage')
      if (!hasPermission) {
        console.warn('没有权限加载故障案例状态列表: fault_case_config:manage', {
          user: store.state.auth.user,
          permissions: store.getters['auth/permissions']
        })
        // 即使没有权限，也尝试调用 API，以便显示明确的错误信息
        // 这样可以区分权限问题和 API 问题
      }
      
      statusLoading.value = true
      try {
        const resp = await api.faultCaseStatuses.getList({ is_active: true })
        console.log('获取故障案例状态列表响应:', resp.data)
        if (resp.data?.success) {
          statusList.value = resp.data.statuses || []
          console.log('状态列表加载成功，共', statusList.value.length, '条记录')
        } else {
          console.error('获取故障案例状态列表失败: 响应数据格式不正确', resp.data)
          ElMessage.error('获取状态列表失败: 响应数据格式不正确')
        }
      } catch (e) {
        console.error('获取故障案例状态列表失败:', e)
        // 如果是权限错误，显示更明确的提示
        if (e.response?.status === 403) {
          ElMessage.warning(t('faultCases.noPermissionToLoadStatuses') || '没有权限加载状态列表，请联系管理员授予 fault_case_config:manage 权限')
        } else if (e.response?.status === 401) {
          ElMessage.warning('未登录或登录已过期，请重新登录')
        } else {
          ElMessage.error(t('faultCases.failedToLoadStatuses') || '加载状态列表失败: ' + (e.response?.data?.message || e.message))
        }
      } finally {
        statusLoading.value = false
      }
    }

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
        .split(/[,，\s\n\r]+/) // 支持多种分隔符，包括换行
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
      // 形成标签后清空输入框内容
      if (keywordSelect.value) {
        nextTick(() => {
          if (keywordSelect.value.states) {
            keywordSelect.value.states.inputValue = ''
          }
        })
      }
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
        const codes = resp.data?.errorCodes || []
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
          // 高级弹窗同样对齐后端：keyword 模糊搜索
          const resp = await api.errorCodes.getList({ keyword: q, page: 1, limit: 50 })
          errorCodeTableData.value = resp.data?.errorCodes || []
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
      ensureSelectedOptionsInRemote() // 同步更新远程搜索选项
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
      formData.append('files', options.file)
      try {
        const resp = await api.faultCases.uploadAttachments(formData)
        const uploaded = resp.data?.files?.[0]
        if (uploaded) {
          form.attachments.push(uploaded)
          uploadFileList.value.push({
            name: uploaded.original_name || uploaded.filename,
            url: uploaded.url,
            uid: uploaded.id || Date.now()
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

    const handleFileClick = (file) => {
      if (file.url) {
        window.open(file.url, '_blank', 'noopener,noreferrer')
      }
    }

    const goBack = () => {
      router.back()
    }

    const save = async () => {
      // 基本验证：标题和模块是必填项
      if (!form.title || !form.title.trim()) {
        ElMessage.warning(t('faultCases.validation.titleRequired'))
        return
      }
      if (!form.module || (typeof form.module === 'string' && !form.module.trim())) {
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
          // 后端期望附件为对象数组（含 storage/object_key/url 等）；不要压缩为字符串数组，否则会被后端丢弃
          attachments: form.attachments || [],
          updated_at_user: form.updated_at_user || undefined,
          status: form.status || undefined
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

    // 判断是否为客诉项目
    const isComplaintProject = (issue) => {
      if (!issue) return false
      const projectName = issue.projectName || ''
      const projectKey = issue.projectKey || ''
      // 如果项目名称包含"客诉"或项目key包含特定标识，则认为是客诉项目
      return projectName.includes('客诉') || projectKey.toUpperCase().includes('COMPLAINT') || projectKey.toUpperCase().includes('KS')
    }

    const loadFaultCase = async () => {
      if (!isEdit.value) {
        if (route.query.source === 'jira' && route.query.jira_key) {
          form.source = 'jira'
          form.jira_key = route.query.jira_key
          try {
            // 确保状态列表已加载（如果还没有加载）
            if (statusList.value.length === 0) {
              await loadStatuses()
            }
            
            // 确保模块列表已加载（如果还没有加载）
            if (moduleList.value.length === 0) {
              await loadModules()
            }
            
            const resp = await api.jira.getIssue(route.query.jira_key)
            const issue = resp.data?.issue
            if (issue) {
              // 基础信息字段
              // title: 对应JIRA的summary
              form.title = issue.summary || issue.title || ''
              
              // module: 对应JIRA的components，需要通过模块映射表匹配
              const jiraModule = Array.isArray(issue.components) && issue.components.length > 0
                ? issue.components.join(', ')
                : (issue.module || '')
              
              if (jiraModule) {
                const jiraModuleStr = String(jiraModule).trim()
                console.log('[模块映射] JIRA 模块值:', jiraModuleStr)
                console.log('[模块映射] 可用模块列表数量:', moduleList.value.length)
                
                // 如果模块列表为空，再次尝试加载
                if (moduleList.value.length === 0) {
                  console.warn('[模块映射] 模块列表为空，尝试重新加载...')
                  await loadModules()
                }
                
                // 处理多个模块值（用逗号分隔）
                const moduleParts = jiraModuleStr.split(',').map(p => p.trim()).filter(Boolean)
                const matchedModuleKeys = []
                
                for (const part of moduleParts) {
                  const matchedModule = moduleList.value.find(module => {
                    if (!module.is_active) return false
                    // 检查模块的映射值是否包含JIRA的模块值，或直接匹配module_key
                    const mappingValues = module.mapping_values || []
                    const matched = mappingValues.some(mv => String(mv).trim() === part) || module.module_key === part
                    if (matched) {
                      console.log(`[模块映射] 找到匹配的模块: ${module.module_key} (${module.name_zh}), 映射值:`, mappingValues)
                    }
                    return matched
                  })
                  
                  if (matchedModule) {
                    matchedModuleKeys.push(matchedModule.module_key)
                  }
                }
                
                if (matchedModuleKeys.length > 0) {
                  form.module = matchedModuleKeys.join(', ')
                  console.log(`[模块映射] 设置表单模块为: ${form.module}`)
                } else {
                  form.module = ''
                  console.warn(`[模块映射] 未找到匹配的模块映射，JIRA 模块: "${jiraModuleStr}"`)
                  console.log('[模块映射] 当前模块列表:', moduleList.value.map(m => ({
                    key: m.module_key,
                    name: m.name_zh,
                    mappings: m.mapping_values || []
                  })))
                }
              } else {
                form.module = ''
                console.log('[模块映射] JIRA issue 没有模块值')
              }
              
              // status: 对应JIRA的status，需要通过状态映射表匹配
              if (issue.status) {
                // 查找匹配的状态：遍历所有状态的映射值，找到匹配的status_key
                const jiraStatus = String(issue.status).trim()
                console.log('[状态映射] JIRA 状态值:', jiraStatus)
                console.log('[状态映射] 可用状态列表数量:', statusList.value.length)
                
                // 如果状态列表为空，再次尝试加载
                if (statusList.value.length === 0) {
                  console.warn('[状态映射] 状态列表为空，尝试重新加载...')
                  await loadStatuses()
                }
                
                const matchedStatus = statusList.value.find(status => {
                  if (!status.is_active) return false
                  // 检查状态的映射值是否包含JIRA的status
                  const mappingValues = status.mapping_values || []
                  const matched = mappingValues.some(mv => String(mv).trim() === jiraStatus)
                  if (matched) {
                    console.log(`[状态映射] 找到匹配的状态: ${status.status_key} (${status.name_zh}), 映射值:`, mappingValues)
                  }
                  return matched
                })
                
                if (matchedStatus) {
                  form.status = matchedStatus.status_key
                  console.log(`[状态映射] 设置表单状态为: ${form.status} (${matchedStatus.name_zh})`)
                } else {
                  form.status = ''
                  console.warn(`[状态映射] 未找到匹配的状态映射，JIRA 状态: "${jiraStatus}"`)
                  console.log('[状态映射] 当前状态列表:', statusList.value.map(s => ({
                    key: s.status_key,
                    name: s.name_zh,
                    mappings: s.mapping_values || []
                  })))
                }
              } else {
                form.status = ''
                console.log('[状态映射] JIRA issue 没有状态值')
              }
              
              // 判断是否为客诉项目
              const isComplaint = isComplaintProject(issue)
              
              // 内容字段映射
              if (isComplaint) {
                // 客诉字段映射
                // symptom: 客诉对应customfield_12213
                form.symptom = issue.customfield_12213 || ''
                // possible_causes: 客诉对应customfield_10705
                form.possible_causes = issue.customfield_10705 || ''
                // solution: 客诉对应customfield_12233+customfield_12239
                const containment = issue.customfield_12233 || ''
                const longTerm = issue.customfield_12239 || ''
                form.solution = [containment, longTerm].filter(Boolean).join('\n\n')
              } else {
                // 普通JIRA字段映射
                // symptom: 普通JIRA对应description
              form.symptom = issue.description || ''
                // possible_causes: 普通JIRA对应customfield_12284
                form.possible_causes = issue.customfield_12284 || ''
                // solution: 普通JIRA对应customfield_10600
                form.solution = issue.customfield_10600 || ''
              }
              
              // remark: 备注字段，JIRA中没有对应字段，保持为空
              form.remark = ''
              
              // 附件字段（严格对齐“先上传临时、发布后入库/OSS”逻辑）：
              // 方案B：自动把JIRA附件导入到临时区，拿到 object_key 后再写入 form.attachments
              form.attachments = []
              uploadFileList.value = []
              try {
                const importResp = await api.jira.importAttachments(route.query.jira_key)
                const files = Array.isArray(importResp.data?.files) ? importResp.data.files : []
                form.attachments = files
                uploadFileList.value = files.map((a, index) => ({
                  name: a.original_name || a.filename || `attachment_${index}`,
                  url: a.url,
                  uid: a.object_key || `${index}_${Date.now()}`
                }))
              } catch (e) {
                // 导入失败不阻塞创建；用户仍可手动上传
                console.error('Failed to import Jira attachments:', e)
                ElMessage.warning('JIRA附件导入失败，可稍后手动上传')
              }
            }
          } catch (e) {
            console.error('Failed to load Jira issue:', e)
            ElMessage.error(t('shared.requestFailed'))
          }
        }
        return
      }

      try {
        const resp = await api.faultCases.get(route.params.id)
        const data = resp.data?.faultCase
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
          form.status = data.status || ''

          loadKeywordsFromRaw()
          if (form.related_error_code_ids.length > 0) {
            loadErrorCodeOptionsForSelected()
            ensureSelectedOptionsInRemote() // 初始化远程搜索选项，确保已选项能显示 Label
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

    // 添加文件列表项点击事件监听
    const setupFileListClickHandler = () => {
      nextTick(() => {
        const uploadEl = document.querySelector('.attachment-upload')
        if (uploadEl) {
          // 移除旧的事件监听器（如果存在）
          const existingHandler = uploadEl._fileClickHandler
          if (existingHandler) {
            uploadEl.removeEventListener('click', existingHandler)
          }
          
          // 添加新的事件监听器
          const clickHandler = (e) => {
            const fileNameEl = e.target.closest('.el-upload-list__item-name')
            if (fileNameEl && !e.target.closest('.el-upload-list__item-delete')) {
              const fileItem = fileNameEl.closest('.el-upload-list__item')
              if (fileItem) {
                // 通过 data-uid 属性查找对应的文件对象
                const uid = fileItem.getAttribute('data-uid') || fileItem.querySelector('[data-uid]')?.getAttribute('data-uid')
                if (uid) {
                  const file = uploadFileList.value.find(f => String(f.uid) === String(uid))
                  if (file && file.url) {
                    e.preventDefault()
                    e.stopPropagation()
                    window.open(file.url, '_blank', 'noopener,noreferrer')
                  }
                } else {
                  // 如果没有 uid，通过索引查找
                  const fileIndex = Array.from(fileItem.parentElement?.children || []).indexOf(fileItem)
                  const file = uploadFileList.value[fileIndex]
                  if (file && file.url) {
                    e.preventDefault()
                    e.stopPropagation()
                    window.open(file.url, '_blank', 'noopener,noreferrer')
                  }
                }
              }
            }
          }
          
          uploadEl._fileClickHandler = clickHandler
          uploadEl.addEventListener('click', clickHandler)
        }
      })
    }

    onMounted(async () => {
      // 先加载状态和模块列表，然后再加载故障案例数据（从 JIRA 添加时需要状态列表进行映射）
      await Promise.all([
        loadModules(),
        loadStatuses()
      ])
      // 状态列表加载完成后再加载故障案例数据，确保状态映射可以正常工作
      await loadFaultCase()
      setupFileListClickHandler()
    })

    // 监听文件列表变化，重新设置事件监听器
    watch(uploadFileList, () => {
      setupFileListClickHandler()
    }, { deep: true })

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
      keywordSelect,
      handleKeywordSelectInput,
      handleKeywordEnter,
      moduleOptions,
      moduleLoading,
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
      handleFileClick,
      formatSize,
      statusOptions,
      statusLoading,
      remoteErrorCodeOptions,
      remoteErrorCodeLoading,
      remoteSearchErrorCodes,
      formatErrorCodeOptionLabel,
      handleErrorCodeSelectChange
    }
  }
}
</script>

<style scoped>
.fault-case-form-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 24px;
  overflow-y: auto;
}

.page-header {
  padding: 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: rgb(var(--foreground));
  line-height: 28px;
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
  flex: 1;
  min-height: 0;
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

/* 使用 Element Plus 默认卡片样式，只添加必要的阴影 */
.section-card {
  box-shadow: var(--card-shadow);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: rgb(var(--foreground));
  line-height: 28px;
}

.section-title-small {
  margin: 0;
  font-size: 14px;
  font-weight: normal;
  color: rgb(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.section-icon {
  font-size: 16px;
  color: rgb(var(--muted-foreground));
}

.attachment-count {
  margin-left: auto;
  font-size: 12px;
  color: rgb(var(--muted-foreground));
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
  color: rgb(var(--foreground));
  line-height: 14px;
}

.required {
  color: var(--red-500);
  margin-left: 4px;
}

.solution-label {
  font-weight: bold;
  color: var(--green-600);
}

.solution-textarea :deep(.el-textarea__inner) {
  background: var(--green-50);
  border-color: var(--green-300);
}

.remark-textarea :deep(.el-textarea__inner) {
  background: var(--yellow-50);
  border-color: var(--yellow-200);
}

.error-codes-selector-new {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.error-code-select {
  flex: 1;
}

.advanced-select-btn {
  flex-shrink: 0;
}

.error-code-option {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 0;
}

.option-code {
  font-weight: bold;
  color: rgb(var(--foreground));
  min-width: 80px;
}

.option-subsystem {
  color: rgb(var(--muted-foreground));
  font-size: 12px;
  background: rgb(var(--muted));
  padding: 0 6px;
  border-radius: 4px;
}

.option-hint {
  color: rgb(var(--muted-foreground));
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
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
  border: 2px dashed rgb(var(--border));
  border-radius: var(--radius-md);
  background: transparent;
}

.upload-icon {
  font-size: 32px;
  color: rgb(var(--muted-foreground));
  margin-bottom: 12px;
}

.upload-text {
  font-size: 14px;
  color: rgb(var(--foreground));
  margin-bottom: 8px;
}

.upload-hint {
  font-size: 12px;
  color: rgb(var(--muted-foreground));
}

/* 让文件列表项的文件名可点击跳转 */
.attachment-upload :deep(.el-upload-list__item-name) {
  color: rgb(var(--text-brand-primary));
  cursor: pointer;
  text-decoration: none;
}

.attachment-upload :deep(.el-upload-list__item-name:hover) {
  text-decoration: underline;
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
  background: rgb(var(--muted));
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: rgb(var(--muted-foreground));
}

.min-w-0 {
  min-width: 0;
  word-break: break-word;
}
</style>
