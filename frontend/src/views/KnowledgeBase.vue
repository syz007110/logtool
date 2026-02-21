<template>
  <div class="kb-container">
    <el-card class="main-card">
      <div class="action-bar">
        <div class="left-section">
          <div class="search-section">
            <el-input
              v-model="searchQuery"
              class="kb-search-input"
              :placeholder="$t('knowledgeBase.search.placeholder')"
              clearable
              @keyup.enter="handleSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button
              type="primary"
              :icon="Search"
              :loading="searchLoading"
              @click="handleSearch"
            >
              {{ $t('shared.search') }}
            </el-button>
          </div>

          <div class="filter-section">
            <el-select
              v-model="filterFileType"
              class="kb-filter-filetype"
              clearable
              :placeholder="$t('knowledgeBase.filters.fileTypePlaceholder')"
              @change="onFilterChange"
            >
              <el-option
                v-for="opt in enabledFileTypes"
                :key="opt.id"
                :label="`${getFileTypeName(opt)} (${opt.code})`"
                :value="opt.id"
              />
            </el-select>

            <el-select
              v-model="filterStatus"
              class="kb-filter-status"
              clearable
              :placeholder="$t('knowledgeBase.filters.statusPlaceholder')"
              @change="onFilterChange"
            >
              <el-option
                v-for="opt in statusOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>

            <el-date-picker
              v-model="filterUploadDate"
              class="kb-filter-date"
              type="date"
              value-format="YYYY-MM-DD"
              :placeholder="$t('knowledgeBase.filters.uploadDatePlaceholder')"
              clearable
              @change="onFilterChange"
            />
          </div>
        </div>

        <div class="action-section">
          <el-button
            v-if="$store.getters['auth/hasPermission']('kb:upload')"
            type="primary"
            :icon="Upload"
            @click="showUploadDialog = true"
          >
            {{ $t('knowledgeBase.upload') }}
          </el-button>
          <el-button type="default" :icon="Refresh" @click="loadDocuments">
            {{ $t('shared.refresh') }}
          </el-button>
        </div>
      </div>

      <el-table
        :data="docs"
        :loading="loading"
        style="width: 100%"
        row-key="id"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="original_name" :label="$t('knowledgeBase.columns.filename')" min-width="260" />
        <el-table-column :label="$t('knowledgeBase.columns.fileType')" width="160">
          <template #default="{ row }">
            {{ getFileTypesText(row.fileTypes || []) }}
          </template>
        </el-table-column>
        <el-table-column prop="upload_time" :label="$t('knowledgeBase.columns.uploadTime')" width="220">
          <template #default="{ row }">
            {{ formatDate(row.upload_time) }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.status')" width="160" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="200" fixed="right" align="left">
          <template #default="{ row }">
            <div class="operation-buttons">
              <el-button
                text
                size="small"
                @click="download(row)"
                :disabled="row.status !== 'parsed'"
              >
                {{ $t('shared.download') }}
              </el-button>
              <el-dropdown
                v-if="$store.getters['auth/hasPermission']('kb:rebuild') || $store.getters['auth/hasPermission']('kb:delete')"
                trigger="click"
                placement="bottom-end"
                @command="(command) => handleOperationCommand(row, command)"
              >
                <el-button text size="small">
                  <i class="fas fa-ellipsis-h"></i>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-if="$store.getters['auth/hasPermission']('kb:rebuild')"
                      command="rebuild"
                      :disabled="!canRebuild(row)"
                    >
                      {{ $t('knowledgeBase.actions.rebuild') }}
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="$store.getters['auth/hasPermission']('kb:delete')"
                      command="delete"
                      class="dropdown-item-danger"
                      :disabled="!canDelete(row)"
                    >
                      {{ $t('shared.delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="(s) => { pageSize = s; page = 1; loadDocuments() }"
          @current-change="(p) => { page = p; loadDocuments() }"
        />
      </div>
    </el-card>

    <!-- 关键词检索结果（右侧抽屉） -->
    <el-drawer
      v-model="showSearchDrawer"
      direction="rtl"
      size="700px"
      :with-header="true"
      :title="$t('knowledgeBase.search.drawerTitle')"
    >
      <div v-loading="searchLoading" class="kb-search-drawer-body">
        <div v-if="!searchQuery.trim()" class="kb-search-hint">
          {{ $t('knowledgeBase.search.hint') }}
        </div>

        <div v-else-if="!searchGroups.length && !searchLoading" class="kb-search-empty">
          <el-empty :description="$t('knowledgeBase.search.empty')" :image-size="80" />
        </div>

        <el-collapse v-else v-model="activeSearchCollapseNames" accordion>
          <el-collapse-item
            v-for="g in searchGroups"
            :key="g.docId"
            :name="String(g.docId)"
          >
            <template #title>
              <div class="kb-search-item-title" :title="g.title">
                <span class="kb-search-filename">{{ g.title }}</span>
                <span class="kb-search-count">{{ $t('knowledgeBase.search.resultCount', { count: g.items.length }) }}</span>
              </div>
            </template>

            <div class="kb-search-snippets">
              <div v-for="(it, idx) in g.items" :key="`${g.docId}-${idx}`" class="kb-search-snippet-item">
                <div v-if="it.headingPath" class="kb-search-snippet-meta">
                  {{ it.headingPath }}
                </div>
                <div class="kb-search-snippet-wrapper">
                  <!-- 显示片段或完整上下文内容 -->
                  <div
                    class="kb-search-snippet"
                    :class="{ 'kb-search-snippet-collapsed': !hasChunkContent(g.docId, it.chunkNo) }"
                    v-html="sanitizeSnippet(hasChunkContent(g.docId, it.chunkNo) ? getHighlightedChunkContent(g.docId, it.chunkNo) : getDisplaySnippet(it))"
                  ></div>
                  <!-- 显示截断提示 -->
                  <div v-if="hasChunkContent(g.docId, it.chunkNo) && getChunkContentMeta(g.docId, it.chunkNo)?.isTruncated" class="kb-search-chunk-content-tip">
                    内容已截断（完整长度：{{ getChunkContentMeta(g.docId, it.chunkNo)?.fullLength }} 字符）
                  </div>
                  <!-- 展开上下文按钮：加载完整chunk内容（仅当有chunkNo时显示） -->
                  <div v-if="it.chunkNo" class="kb-search-context-toggle">
                    <el-button
                      text
                      size="small"
                      :loading="isChunkLoading(g.docId, it.chunkNo)"
                      @click="toggleChunkContext(g.docId, it.chunkNo)"
                    >
                      {{ hasChunkContent(g.docId, it.chunkNo) ? '收起上下文' : '展开上下文' }}
                      <el-icon>
                        <ArrowDown :class="{ 'rotated': hasChunkContent(g.docId, it.chunkNo) }" />
                      </el-icon>
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-drawer>

    <el-dialog v-model="showUploadDialog" :title="$t('knowledgeBase.uploadDialog.title')" width="680px" append-to-body>
      <el-upload
        ref="uploadRef"
        :action="uploadUrl"
        :headers="uploadHeaders"
        :data="getUploadExtraData"
        :auto-upload="false"
        :show-file-list="false"
        :multiple="true"
        :limit="kbConfig.maxFiles"
        accept=".docx,.md,.txt"
        name="files"
        :on-change="onFileChange"
        :on-remove="onFileRemove"
        :on-exceed="onExceed"
        :on-progress="onUploadProgress"
        :on-success="onUploadSuccess"
        :on-error="onUploadError"
        :disabled="uploading"
      >
        <el-button type="primary" :disabled="uploading">
          {{ $t('knowledgeBase.uploadDialog.chooseFiles') }}
        </el-button>
        <template #tip>
          <div class="el-upload__tip">
            <div v-if="!uploading">
              {{ $t('knowledgeBase.uploadDialog.tip', {
                maxSize: formatFileSize(kbConfig.maxFileSize),
                maxFiles: kbConfig.maxFiles
              }) }}
            </div>
            <div v-else>
              {{ $t('knowledgeBase.uploadDialog.uploadingTip') }}
            </div>
          </div>
        </template>
      </el-upload>

      <div v-if="fileList.length" class="custom-file-list">
        <div class="file-list-header">
          <span>{{ $t('knowledgeBase.uploadDialog.selectedFiles', { count: fileList.length }) }}</span>
          <el-button type="default" size="small" @click="clearFiles" :disabled="uploading">
            {{ $t('shared.clear') }}
          </el-button>
        </div>
        <div class="file-items">
          <div v-for="(f, idx) in fileList" :key="idx" class="file-item">
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ f.name }}</span>
            <span class="file-size">{{ formatFileSize(f.size) }}</span>
            <el-select
              v-model="fileTypeSelections[f.uid]"
              class="file-type-select"
              multiple
              collapse-tags
              collapse-tags-tooltip
              :placeholder="$t('knowledgeBase.uploadDialog.typePlaceholder')"
              :disabled="uploading"
              filterable
              clearable
            >
              <el-option
                v-for="opt in enabledFileTypes"
                :key="opt.id"
                :label="`${getFileTypeName(opt)} (${opt.code})`"
                :value="opt.id"
              />
            </el-select>
            <el-button type="danger" plain size="small" @click="removeFile(idx)" :disabled="uploading">
              {{ $t('shared.delete') }}
            </el-button>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showUploadDialog = false" :disabled="uploading">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" @click="submitUpload" :loading="uploading" :disabled="!fileList.length">
          {{ $t('shared.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Refresh, Document, Search, ArrowDown } from '@element-plus/icons-vue'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import api from '../api'

const { t, locale } = useI18n()
const store = useStore()

const currentLocale = computed(() => locale.value || 'zh-CN')
const isZhCN = computed(() => currentLocale.value === 'zh-CN')

const loading = ref(false)
const docs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const selected = ref([])

const showUploadDialog = ref(false)
const uploading = ref(false)
const fileList = ref([])
const uploadRef = ref()
const uploadFilesInternal = ref([]) // Element Plus 内部 uploadFileList（用于真正移除）

// 文件类型（多标签）
const kbFileTypes = ref([])
const fileTypeSelections = ref({}) // { [uid]: number[] }
const enabledFileTypes = computed(() => (kbFileTypes.value || []).filter((x) => x && x.enabled !== false))

// KB 配置（从后端获取）
const kbConfig = ref({
  maxFiles: 5,
  maxFileSize: 50 * 1024 * 1024 // 默认 50MB，会在 onMounted 时从后端获取
})

// 上传相关配置
const uploadUrl = computed(() => '/api/kb/documents/upload')
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${store.state.auth.token}`
}))

// 筛选器：状态、上传时间（按天）、文件类型
const filterStatus = ref('')
const filterUploadDate = ref('') // YYYY-MM-DD
const filterFileType = ref('')

// 关键词检索（ES）
const searchQuery = ref('')
const showSearchDrawer = ref(false)
const searchLoading = ref(false)
const searchItems = ref([]) // raw items from /kb/search
const activeSearchCollapseNames = ref('')
const chunkContents = ref(new Map()) // 存储已加载的完整chunk内容，key: `${docId}-${chunkNo}`
const loadingChunks = ref(new Set()) // 正在加载的chunk，key: `${docId}-${chunkNo}`

const statusOptions = computed(() => {
  const keys = [
    'uploading',
    'queued',
    'decrypting',
    'decrypt_failed',
    'parsing',
    'parse_failed',
    'parsed',
    'file_error',
    'processing_failed',
    'upload_failed',
    'deleting'
  ]
  return keys.map((k) => ({ value: k, label: getStatusText(k) }))
})

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}

const formatFileSize = (bytes) => {
  const b = Number(bytes || 0)
  if (!b) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const getStatusType = (status) => {
  const map = {
    uploading: 'warning',
    queued: 'info',
    decrypting: 'warning',
    parsing: 'warning',
    parsed: 'success',
    decrypt_failed: 'danger',
    parse_failed: 'danger',
    file_error: 'danger',
    processing_failed: 'danger',
    upload_failed: 'danger',
    deleting: 'warning'
  }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = {
    uploading: t('knowledgeBase.statusText.uploading'),
    queued: t('knowledgeBase.statusText.queued'),
    decrypting: t('knowledgeBase.statusText.decrypting'),
    decrypt_failed: t('knowledgeBase.statusText.decrypt_failed'),
    parsing: t('knowledgeBase.statusText.parsing'),
    parse_failed: t('knowledgeBase.statusText.parse_failed'),
    parsed: t('knowledgeBase.statusText.parsed'),
    file_error: t('knowledgeBase.statusText.file_error'),
    processing_failed: t('knowledgeBase.statusText.processing_failed'),
    upload_failed: t('knowledgeBase.statusText.upload_failed'),
    deleting: t('knowledgeBase.statusText.deleting')
  }
  return map[status] || status
}

const getFileTypesText = (fileTypes) => {
  if (!Array.isArray(fileTypes) || fileTypes.length === 0) return '-'

  return fileTypes.map(typeId => {
    const type = kbFileTypes.value.find(t => t.id === typeId)
    return type ? getFileTypeName(type) : `ID:${typeId}`
  }).join(', ')
}

const canDelete = (row) => {
  return ['parse_failed', 'parsed', 'file_error', 'processing_failed'].includes(row.status)
}

const canRebuild = (row) => {
  return row.status === 'parsed'
}

const onSelectionChange = (rows) => {
  selected.value = rows || []
}

const loadDocuments = async () => {
  loading.value = true
  try {
    const resp = await api.kb.listDocuments({
      page: page.value,
      limit: pageSize.value,
      status: filterStatus.value || undefined,
      upload_date: filterUploadDate.value || undefined,
      file_type: filterFileType.value || undefined
    })
    docs.value = resp.data?.data || []
    total.value = resp.data?.total || 0
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || t('shared.requestFailed'))
  } finally {
    loading.value = false
  }
}

const download = (row) => {
  if (!row.downloadUrl) return
  window.open(row.downloadUrl, '_blank')
}

const { confirmDelete } = useDeleteConfirm()

const handleOperationCommand = (row, command) => {
  if (command === 'rebuild') {
    handleRebuild(row)
  } else if (command === 'delete') {
    handleDelete(row)
  }
}

const handleRebuild = async (row) => {
  try {
    await ElMessageBox.confirm(
      t('knowledgeBase.messages.confirmRebuild'),
      t('knowledgeBase.messages.rebuildConfirmTitle'),
      {
        confirmButtonText: t('shared.confirm'),
        cancelButtonText: t('shared.cancel'),
        type: 'warning'
      }
    )

    await api.kb.rebuildDocument(row.id)
    ElMessage.success(t('knowledgeBase.messages.rebuildQueued'))
    await loadDocuments()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e?.response?.data?.message || t('knowledgeBase.messages.rebuildFailed'))
  }
}

const handleDelete = async (row) => {
  try {
    const confirmed = await confirmDelete(row, {
      message: t('knowledgeBase.messages.confirmDelete'),
      title: t('shared.messages.deleteConfirmTitle')
    })
    
    if (!confirmed) return
    
    await api.kb.deleteDocument(row.id)
    ElMessage.success(t('shared.messages.deleteSuccess'))
    await loadDocuments()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.message || t('shared.messages.deleteFailed'))
    }
  }
}

const onExceed = () => {
  ElMessage.warning(t('knowledgeBase.messages.maxFiles', { count: kbConfig.maxFiles }))
}

const onFileChange = (file, uploadFileList) => {
  // 同步更新自定义文件列表
  if (file?.raw) {
    const limit = Number(kbConfig.value?.maxFiles || 5)
    const list = (uploadFileList || []).slice(0, limit).map((f) => ({
      uid: String(f.uid),
      name: f.name,
      size: f.size,
      raw: f.raw
    }))
    fileList.value = list
    uploadFilesInternal.value = uploadFileList || []
    // 初始化每个文件的类型选择
    for (const it of list) {
      if (!fileTypeSelections.value[it.uid]) fileTypeSelections.value[it.uid] = []
    }
  }
}

const onFileRemove = (file, uploadFileList) => {
  // 同步更新自定义文件列表
  const list = (uploadFileList || []).map((f) => ({
    uid: String(f.uid),
    name: f.name,
    size: f.size,
    raw: f.raw
  }))
  fileList.value = list
  uploadFilesInternal.value = uploadFileList || []
  // 清理已移除文件的类型选择
  const alive = new Set(list.map((x) => x.uid))
  Object.keys(fileTypeSelections.value || {}).forEach((uid) => {
    if (!alive.has(uid)) delete fileTypeSelections.value[uid]
  })
}

const removeFile = (idx) => {
  const removed = fileList.value.splice(idx, 1)[0]
  if (removed?.uid) delete fileTypeSelections.value[String(removed.uid)]
  // 同步移除 Upload 内部文件，避免仍然上传
  try {
    const uid = String(removed?.uid || '')
    const uf = (uploadFilesInternal.value || []).find((x) => String(x?.uid || '') === uid)
    if (uf && uploadRef.value?.handleRemove) {
      uploadRef.value.handleRemove(uf)
    } else {
      // fallback：重新同步一次 internal list
      uploadFilesInternal.value = uploadRef.value?.uploadFiles || uploadFilesInternal.value
    }
  } catch (_) {}
}

const clearFiles = () => {
  fileList.value = []
  fileTypeSelections.value = {}
  try {
    uploadRef.value?.clearFiles?.()
  } catch (_) {}
}

const submitUpload = () => {
  if (!uploadRef.value) {
    ElMessage.error(t('knowledgeBase.uploadDialog.uploaderNotReady'))
    return
  }

  if (fileList.value.length === 0) {
    ElMessage.error(t('knowledgeBase.uploadDialog.chooseFilesRequired'))
    return
  }

  const missingTypes = (fileList.value || []).some((f) => {
    const arr = fileTypeSelections.value?.[String(f.uid)] || []
    return !Array.isArray(arr) || arr.length === 0
  })
  if (missingTypes) {
    ElMessage.error(t('knowledgeBase.uploadDialog.typeRequired'))
    return
  }

  // 触发 Element Plus Upload 组件的自动上传
  uploadRef.value.submit()
  
  // 立即关闭对话框（异步上传在后台进行）
  showUploadDialog.value = false
  
  // 刷新文档列表，展示最新的"上传中/处理中"状态
  loadDocuments()
}

const onUploadProgress = (event, file, fileList) => {
  // 进入文件上传阶段
  uploading.value = true
}

const onUploadSuccess = (response, file, uploadFileList) => {
  // 更新文件列表状态
  const allUploaded = uploadFileList.length > 0 && uploadFileList.every(f => f.status === 'success')
  
  if (allUploaded) {
    // 所有文件上传完成
    uploading.value = false
    ElMessage.success(t('knowledgeBase.messages.uploadQueued', { count: uploadFileList.length }))
    
    // 清空文件列表
    clearFiles()
    
    // 刷新文档列表
    loadDocuments()
  }
}

const getUploadExtraData = (uploadFile) => {
  const uid = String(uploadFile?.uid || '')
  return {
    typeIds: JSON.stringify(fileTypeSelections.value?.[uid] || [])
  }
}

const onUploadError = (error, file, uploadFileList) => {
  uploading.value = false
  const errorMessage = error?.response?.data?.message || error?.message || '上传失败'
  ElMessage.error(errorMessage)
  
  // 刷新文档列表以更新状态
  loadDocuments()
}

const onFilterChange = () => {
  page.value = 1
  loadDocuments()
}

const escapeHtml = (s) => {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 仅允许 <em> 高亮标签，避免 v-html 带来的风险
const sanitizeSnippet = (html) => {
  const raw = String(html || '')
  const OPEN = '___KB_EM_OPEN___'
  const CLOSE = '___KB_EM_CLOSE___'
  const withTokens = raw
    .replace(/<\s*em\s*>/gi, OPEN)
    .replace(/<\s*\/\s*em\s*>/gi, CLOSE)
  const escaped = escapeHtml(withTokens)
  return escaped
    .replaceAll(OPEN, '<em>')
    .replaceAll(CLOSE, '</em>')
}

const groupSearchItems = (items) => {
  const map = new Map()
  for (const it of items || []) {
    const docId = String(it?.docId || '').trim()
    if (!docId) continue
    const title = String(it?.title || '').trim() || `Doc ${docId}`
    const arr = map.get(docId) || { docId, title, items: [] }
    // 支持 snippets 数组（新格式）或 snippet 字符串（向后兼容）
    const snippets = Array.isArray(it?.snippets) && it.snippets.length > 0
      ? it.snippets
      : (it?.snippet ? [it.snippet] : [])
    arr.items.push({
      headingPath: String(it?.headingPath || '').trim(),
      chunkNo: it?.chunkNo || null, // 保留 chunkNo，用于加载完整内容
      snippets: snippets.filter(Boolean),
      snippet: snippets[0] || '' // 向后兼容
    })
    map.set(docId, arr)
  }
  return Array.from(map.values())
    .map((g) => ({ ...g, items: g.items.filter((x) => x.snippets && x.snippets.length > 0) }))
    .filter((g) => g.items.length)
}

const searchGroups = computed(() => groupSearchItems(searchItems.value))

const handleSearch = async () => {
  const q = searchQuery.value.trim()
  if (!q) {
    showSearchDrawer.value = true
    searchItems.value = []
    return
  }

  showSearchDrawer.value = true
  searchLoading.value = true
  try {
    const resp = await api.kb.search({ q, limit: 10 })
    searchItems.value = resp.data?.items || []
    activeSearchCollapseNames.value = searchGroups.value.length ? String(searchGroups.value[0].docId) : ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || t('shared.requestFailed'))
    searchItems.value = []
  } finally {
    searchLoading.value = false
  }
}

const loadKbConfig = async () => {
  try {
    const resp = await api.kb.status()
    if (resp.data?.ok && resp.data?.kb) {
      kbConfig.value = {
        maxFiles: resp.data.kb.maxFiles || 5,
        maxFileSize: resp.data.kb.maxFileSize || 50 * 1024 * 1024
      }
    }
  } catch (e) {
    // 失败时使用默认值
    console.warn('Failed to load KB config:', e)
  }
}

const loadKbFileTypes = async () => {
  try {
    const resp = await api.kb.listFileTypes()
    if (resp.data?.success) {
      kbFileTypes.value = resp.data.data || []
    } else {
      kbFileTypes.value = []
    }
  } catch (e) {
    kbFileTypes.value = []
    ElMessage.error(t('knowledgeBase.uploadDialog.typeLoadFailed'))
  }
}

// 根据系统语言获取文件类型名称
const getFileTypeName = (type) => {
  if (!type) return ''
  return isZhCN.value ? (type.name_zh || type.name || '') : (type.name_en || type.name || '')
}

const getDisplaySnippet = (item) => {
  const snippets = item.snippets || []
  if (snippets.length === 0) return ''
  // 只显示第一个片段
  return snippets[0]
}

const highlightKeywords = (text, query) => {
  if (!text || !query || !query.trim()) return text

  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
  if (keywords.length === 0) return text

  let highlightedText = text

  // 对每个关键词进行高亮
  keywords.forEach(keyword => {
    // 转义正则表达式特殊字符
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 创建不区分大小写的正则表达式
    const regex = new RegExp(`(${escapedKeyword})`, 'gi')
    // 用 <em> 标签包围匹配的关键词
    highlightedText = highlightedText.replace(regex, '<em>$1</em>')
  })

  return highlightedText
}

const getHighlightedChunkContent = (docId, chunkNo) => {
  const content = getChunkContentText(docId, chunkNo)
  return highlightKeywords(content, searchQuery.value)
}

// Chunk 完整内容相关函数
const getChunkKey = (docId, chunkNo) => `${docId}-${chunkNo}`

const isChunkLoading = (docId, chunkNo) => {
  if (!docId || !chunkNo) return false
  return loadingChunks.value.has(getChunkKey(docId, chunkNo))
}

const hasChunkContent = (docId, chunkNo) => {
  if (!docId || !chunkNo) return false
  return chunkContents.value.has(getChunkKey(docId, chunkNo))
}

const getChunkContentText = (docId, chunkNo) => {
  if (!docId || !chunkNo) return ''
  const content = chunkContents.value.get(getChunkKey(docId, chunkNo))
  return content?.content || ''
}

const getChunkContentMeta = (docId, chunkNo) => {
  if (!docId || !chunkNo) return null
  const content = chunkContents.value.get(getChunkKey(docId, chunkNo))
  return content || null
}

const toggleChunkContext = async (docId, chunkNo) => {
  if (!docId || !chunkNo) return
  
  const key = getChunkKey(docId, chunkNo)
  
  // 如果已加载，则折叠
  if (chunkContents.value.has(key)) {
    chunkContents.value.delete(key)
    return
  }
  
  // 如果正在加载，则不重复请求
  if (loadingChunks.value.has(key)) return
  
  // 加载完整内容
  loadingChunks.value.add(key)
  try {
    const resp = await api.kb.getChunkContent(docId, chunkNo)
    if (resp.data?.ok && resp.data?.data) {
      chunkContents.value.set(key, resp.data.data)
    } else {
      ElMessage.error(resp.data?.message || '加载上下文失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载上下文失败')
  } finally {
    loadingChunks.value.delete(key)
  }
}

onMounted(async () => {
  await loadKbConfig()
  await loadKbFileTypes()
  loadDocuments()
})
</script>

<style scoped>
.kb-container {
  padding: 16px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
  align-items: flex-start;
}

.left-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.search-section {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.kb-search-input {
  width: 320px;
  min-width: 220px;
}

.kb-filter-filetype {
  width: 180px;
}

.kb-filter-status {
  width: 180px;
}

.kb-filter-date {
  width: 180px;
}

.operation-buttons {
  display: flex;
  gap: 8px;
}

.btn-danger-text {
  color: var(--el-color-danger);
}

.pagination-wrapper {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.custom-file-list {
  margin-top: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 12px;
}

.file-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  color: var(--el-text-color-secondary);
  width: 90px;
  text-align: right;
}

.file-type-select {
  width: 260px;
  min-width: 220px;
}

.kb-search-drawer-body {
  min-height: 100%;
}

/* 确保 header 布局正确，title 和 arrow 都能显示 */
:deep(.el-collapse-item__header) {
  display: flex;
  align-items: center;
  min-width: 0;
  padding-right: 20px;
}

:deep(.el-collapse-item__arrow) {
  flex-shrink: 0;
  width: 20px;
  margin-left: 12px;
}

.kb-search-item-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  max-width: calc(100% - 32px);
  overflow: hidden;
}

.kb-search-filename {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.kb-search-count {
  flex-shrink: 0;
  padding-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.kb-search-snippets {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb-search-snippet-item {
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.kb-search-snippet-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.kb-search-snippet-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-search-snippet {
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.kb-search-snippet-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}


.kb-search-context-toggle {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.kb-search-context-toggle .el-button {
  padding: 0;
  font-size: 12px;
  color: var(--el-color-primary);
}

.kb-search-context-toggle .el-icon {
  margin-left: 4px;
  transition: transform 0.3s;
}

.kb-search-context-toggle .el-icon.rotated {
  transform: rotate(180deg);
}


.kb-search-chunk-content-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-style: italic;
  padding: 4px 0;
}

/* 高亮关键词（ES 返回 <em>） */
.kb-search-snippet :deep(em) {
  font-style: normal;
  padding: 0 2px;
  border-radius: 2px;
  background: var(--el-color-warning-light-8);
  color: var(--el-color-warning-dark-2);
}
</style>

