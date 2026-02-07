<template>
  <div class="fault-cases-container">
    <!-- 统一卡片：包含所有控件 -->
    <el-card class="main-card">
    <!-- Search and Actions Section -->
    <div class="search-actions-section">
      <!-- First Row: Keyword Search, Search/Reset Buttons, Toggle Buttons, Create Button -->
      <div class="search-actions-row">
        <div class="search-input-group">
          <el-input
            v-model="jiraQuery.q"
            :placeholder="$t('faultCases.jira.searchPlaceholder')"
            clearable
            class="search-input"
            @keyup.enter="handleJiraSearch(true)"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" class="search-btn" @click="handleJiraSearch(true)">
            {{ $t('shared.search') }}
          </el-button>
          <el-button class="reset-btn" @click="resetFilters">
            <el-icon style="margin-right: 4px;"><Refresh /></el-icon>
            {{ $t('shared.reset') }}
          </el-button>
        </div>

        <div class="actions-group">
          <div class="jira-preview-toggle">
            <span class="toggle-label">{{ $t('faultCases.jira.previewModeLabel') }}</span>
            <el-switch
              v-model="preferJiraPreview"
              inline-prompt
              :active-text="$t('faultCases.jira.previewModeOn')"
              :inactive-text="$t('faultCases.jira.previewModeOff')"
            />
            <el-tooltip :content="$t('faultCases.jira.previewModeTip')" placement="top">
              <el-icon class="help-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <el-button 
            v-if="canCreate"
            class="create-btn"
            @click="openCreate"
          >
            <el-icon><Plus /></el-icon>
            {{ $t('faultCases.create') }}
          </el-button>
        </div>
      </div>

      <!-- Second Row: Filters -->
      <div class="filters-row">
        <div class="filters-label">
          <el-icon><Filter /></el-icon>
          <span>{{ $t('faultCases.filters.label') || '筛选:' }}</span>
        </div>
        <div class="filters-group">
          <el-select
            v-model="filters.source"
            :placeholder="$t('faultCases.filters.sourcePlaceholder')"
            clearable
            class="filter-select"
            @change="handleFilterChange"
          >
            <el-option :label="$t('faultCases.sourceJira')" value="jira" />
            <el-option :label="$t('faultCases.sourceManual')" value="manual" />
          </el-select>

          <el-select
            v-if="hasConfigManagePermission"
            v-model="filters.moduleKeys"
            :placeholder="$t('faultCases.filters.modulePlaceholder')"
            multiple
            clearable
            collapse-tags
            collapse-tags-tooltip
            class="filter-select filter-select-module"
            @change="handleFilterChange"
          >
            <el-option
              v-for="m in availableModuleKeys"
              :key="m.module_key"
              :label="isZhCN ? m.name_zh : m.name_en"
              :value="m.module_key"
            />
          </el-select>

          <el-select
            v-if="hasConfigManagePermission"
            v-model="filters.statusKeys"
            :placeholder="$t('faultCases.filters.statusPlaceholder')"
            multiple
            clearable
            collapse-tags
            collapse-tags-tooltip
            class="filter-select filter-select-status"
            @change="handleFilterChange"
          >
            <el-option
              v-for="s in availableStatusKeys"
              :key="s.status_key"
              :label="isZhCN ? s.name_zh : s.name_en"
              :value="s.status_key"
          />
          </el-select>

          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            :range-separator="$t('logs.to')"
            :start-placeholder="$t('faultCases.filters.startDate')"
            :end-placeholder="$t('faultCases.filters.endDate')"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            class="filter-date-picker"
            clearable
            @change="handleFilterChange"
          />
        </div>
        <div class="filter-results">
          <span>{{ $t('faultCases.filters.results') || '筛选结果' }}: {{ jiraPager.total || 0 }} {{ $t('shared.items') }}</span>
        </div>
      </div>
    </div>

    <!-- Divider between search and table -->
    <!-- TODO: 需要创建 BaseDivider 组件替换 el-divider -->
    <el-divider style="margin: 20px 0;" />

    <!-- TODO: 需要创建 BaseAlert 组件替换 el-alert -->
    <el-alert
        v-if="jiraState.enabled === false"
        :title="$t('faultCases.jira.notEnabledHint')"
        type="info"
        show-icon
        :closable="false"
        style="margin: 10px 0"
      />

      <!-- TODO: 需要创建 BaseAlert 组件替换 el-alert -->
      <el-alert
        v-else-if="jiraState.ok === false && jiraState.message"
        :title="jiraState.message"
        type="warning"
        show-icon
        :closable="false"
        style="margin: 10px 0"
      />

      <!-- Jira Results Table -->
      <div class="table-container">
      <el-table :data="jiraRows" :loading="jiraLoading" v-loading="jiraLoading" :height="tableHeight" style="width: 100%" :empty-text="$t('shared.noData')">
        <!-- 关键字 -->
        <el-table-column :label="$t('faultCases.jira.columns.key')" width="140" align="left">
          <template #default="{ row }">
            <el-button
              text
              type="primary"
              size="small"
              @click="openJiraOrPreview(row)"
            >{{ row.source === 'jira' ? row.key : (row.case_code || row.key) }}</el-button>
          </template>
        </el-table-column>
        <!-- 主题 -->
        <el-table-column :label="$t('faultCases.jira.columns.summary')" min-width="320">
          <template #default="{ row }">
            <el-tooltip
              :content="row.summary || ''"
              placement="top"
              effect="dark"
              :show-after="500"
              :disabled="!row.summary"
            >
              <span class="summary-cell">{{ row.summary }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <!-- 模块 -->
        <el-table-column
          :label="$t('faultCases.jira.columns.module')"
          width="180"
        >
          <template #default="{ row }">
            <el-tooltip
              :content="getModuleTooltipContent(row)"
              placement="top"
              effect="dark"
              :show-after="500"
              :disabled="!getModuleTooltipContent(row)"
            >
              <div class="table-cell-content">
                <span>
                  {{ getModuleDisplayText(row.module || '', row.source) }}
                  <span v-if="!getModuleHasMapping(row.module || '')" class="asterisk">*</span>
                </span>
              </div>
            </el-tooltip>
          </template>
        </el-table-column>
        <!-- 来源 -->
        <el-table-column :label="$t('faultCases.fields.source')" width="110">
          <template #default="{ row }">
            <el-tag 
              size="small" 
              :type="row.source === 'jira' ? 'warning' : 'info'"
            >
              {{ row.source === 'jira' ? 'JIRA' : $t('faultCases.sourceManual') }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- 状态 -->
        <el-table-column
          prop="status"
          :label="$t('faultCases.jira.columns.status')"
          width="140"
        >
          <template #default="{ row }">
            <el-tooltip
              :content="getStatusTooltipContent(row)"
              placement="top"
              effect="dark"
              :show-after="500"
              :disabled="!getStatusTooltipContent(row)"
            >
              <div class="table-cell-content">
                <span>
                  {{ getStatusDisplayText(row.status || '', row.source) }}
                  <span v-if="!getStatusHasMapping(row.status || '')" class="asterisk">*</span>
                </span>
              </div>
            </el-tooltip>
          </template>
        </el-table-column>
        <!-- 更新日期 -->
        <el-table-column :label="$t('faultCases.jira.columns.updated')" width="110">
          <template #default="{ row }">
            {{ formatDateOnly(row.updated) }}
          </template>
        </el-table-column>
        <!-- 操作 -->
        <el-table-column :label="$t('shared.operation')" width="120" fixed="right" align="left">
          <template #default="{ row }">
            <div class="operation-buttons">
              <template v-if="row.source === 'jira'">
                <el-button
                  text
                  size="small"
                  :disabled="!canCreate"
                  @click="addToFaultCases(row)"
                >{{ $t('faultCases.jira.addToFaultCases') }}</el-button>
              </template>
              <template v-else>
                <el-button
                  v-if="canUpdate"
                  text
                  size="small"
                  @click="openEditByMixedRow(row)"
                >{{ $t('shared.edit') }}</el-button>
                <el-button
                  v-if="canDelete"
                  text
                  size="small"
                  class="btn-danger-text"
                  @click="handleDelete(row)"
                  :aria-label="$t('shared.delete')"
                  :title="$t('shared.delete')"
                >{{ $t('shared.delete') }}</el-button>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>

      <div v-if="jiraPager.total > 0" class="pager">
        <el-pagination
          :current-page="jiraPager.page"
          :page-size="jiraPager.limit"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="jiraPager.total"
          @size-change="(val) => { jiraPager.limit = val; handleJiraSearch(true); }"
          @current-change="(val) => { jiraPager.page = val; handleJiraSearch(false); }"
        />
      </div>


    <!-- Image preview dialog -->
    <el-dialog v-model="imagePreview.visible" :title="imagePreview.filename || '图片预览'" width="90%" top="5vh" :close-on-click-modal="true">
      <div v-loading="imagePreview.loading" class="image-preview-container">
        <div v-if="imagePreview.error" class="image-error">
          <el-icon size="48" color="#f56c6c"><Warning /></el-icon>
          <p>图片加载失败</p>
          <p class="error-desc">可能的原因：图片不存在、跨域限制或网络问题</p>
        </div>
        <img
          v-else
          :src="imagePreview.src"
          class="preview-image"
          @load="imagePreview.loading = false"
          @error="imagePreview.error = true; imagePreview.loading = false"
          alt="图片预览"
        />
      </div>
      <template #footer>
        <div class="image-preview-footer">
          <el-button @click="imagePreview.visible = false">关闭</el-button>
          <el-button type="primary" @click="downloadImage">下载图片</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Jira preview dialog (when Jira is not reachable / no VPN) -->
    <el-dialog 
      v-model="jiraPreview.visible" 
      :title="''" 
      width="820px"
      class="jira-preview-dialog"
      :close-on-click-modal="true"
    >
      <div v-loading="jiraPreview.loading" class="jira-preview-content">
        <!-- Header: Key / Project Name + Title -->
        <div class="jira-preview-header">
          <div class="jira-preview-key-project">
            {{ jiraPreview.key || '-' }}<span v-if="jiraPreview.projectName"> / {{ jiraPreview.projectName }}</span>
          </div>
          <div class="jira-preview-title">{{ jiraPreview.summary || '-' }}</div>
        </div>

        <!-- Key Information Section: Two Columns -->
        <div class="jira-key-info">
          <div class="jira-key-info-left">
            <div class="jira-info-item">
              <div class="jira-info-label">STATUS</div>
              <el-tag v-if="jiraPreview.status" type="primary" size="small" class="jira-status-tag">
                {{ jiraPreview.status }}
              </el-tag>
              <span v-else class="jira-info-empty">-</span>
            </div>
            <div class="jira-info-item">
              <div class="jira-info-label">COMPONENTS</div>
              <div class="jira-components">
                <el-tag 
                  v-for="(comp, idx) in jiraPreview.components" 
                  :key="idx"
                  size="small"
                  class="jira-component-tag"
                >
                  {{ comp }}
                </el-tag>
                <span v-if="!jiraPreview.components || jiraPreview.components.length === 0" class="jira-info-empty">-</span>
              </div>
            </div>
          </div>
          <div class="jira-key-info-right">
            <div class="jira-info-item">
              <div class="jira-info-label">RESOLUTION</div>
              <div class="jira-info-value">
                {{ jiraPreview.resolution?.name || 'Unresolved' }}
              </div>
            </div>
            <div class="jira-info-item">
              <div class="jira-info-label">UPDATED</div>
              <div class="jira-info-value">
                <i class="fas fa-clock" style="margin-right: 4px; font-size: 12px;"></i>
                {{ formatDate(jiraPreview.updated) || '-' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Content Section: Different for Regular JIRA vs Complaint -->
        <template v-if="isComplaintProject">
          <!-- 客诉字段显示 -->
          <div v-if="jiraPreview.customfield_12213" class="jira-content-section">
            <div class="jira-content-label">DETAILED DESCRIPTION</div>
            <div class="jira-content-box">{{ jiraPreview.customfield_12213 }}</div>
          </div>
          <div v-if="jiraPreview.customfield_12284" class="jira-content-section">
            <div class="jira-content-label">PRELIMINARY INVESTIGATION</div>
            <div class="jira-content-box">{{ jiraPreview.customfield_12284 }}</div>
          </div>
          <div class="jira-content-two-columns">
            <div v-if="jiraPreview.customfield_12233" class="jira-content-section">
              <div class="jira-content-label">CONTAINMENT MEASURES</div>
              <div class="jira-content-box">{{ jiraPreview.customfield_12233 }}</div>
            </div>
            <div v-if="jiraPreview.customfield_12239" class="jira-content-section">
              <div class="jira-content-label">LONG-TERM MEASURES</div>
              <div class="jira-content-box">{{ jiraPreview.customfield_12239 }}</div>
            </div>
          </div>
          <div v-if="!jiraPreview.customfield_12213 && !jiraPreview.customfield_12284 && !jiraPreview.customfield_12233 && !jiraPreview.customfield_12239" class="jira-content-section">
            <div class="jira-content-label">DETAILED DESCRIPTION</div>
            <div class="jira-content-box">{{ jiraPreview.description || jiraPreview.summary || '-' }}</div>
          </div>
        </template>
        <template v-else>
          <!-- 普通JIRA字段显示 -->
          <div v-if="jiraPreview.description || jiraPreview.summary" class="jira-content-section">
            <div class="jira-content-label">DESCRIPTION</div>
            <div class="jira-content-box">{{ jiraPreview.description || jiraPreview.summary }}</div>
          </div>
          <div v-if="jiraPreview.customfield_10705" class="jira-content-section">
            <div class="jira-content-label">INVESTIGATION & CAUSE ANALYSIS</div>
            <div class="jira-content-box">{{ jiraPreview.customfield_10705 }}</div>
          </div>
          <div v-if="jiraPreview.customfield_10600" class="jira-content-section">
            <div class="jira-content-label">SOLUTION DETAILS</div>
            <div class="jira-content-box">{{ jiraPreview.customfield_10600 }}</div>
          </div>
        </template>

        <!-- Attachments Section (if any) -->
        <div v-if="jiraPreview.attachments && jiraPreview.attachments.length > 0" class="jira-attachments-section">
          <!-- 图片附件：直接显示缩略图 -->
          <div v-if="imageAttachments.length > 0" class="jira-image-attachments">
            <div class="jira-attachment-label">{{ $t('faultCases.jira.columns.imageAttachments') }}</div>
            <div class="jira-attachment-images">
              <div
                v-for="img in imageAttachments"
                :key="img.id"
                class="jira-image-thumbnail"
                :title="img.filename"
              >
                <el-image
                  :src="getImageSrc(img)"
                  :preview-src-list="imagePreviewUrls"
                  fit="cover"
                  class="jira-attachment-image"
                  :initial-index="getImageIndex(img)"
                  :preview-teleported="true"
                />
                <div class="jira-image-overlay">
                  <i class="fas fa-search-plus"></i>
                </div>
                <div class="jira-image-name">{{ img.filename }}</div>
              </div>
            </div>
          </div>

          <!-- 非图片附件：显示文件名和下载链接 -->
          <div v-if="fileAttachments.length > 0" class="jira-file-attachments">
            <div class="jira-attachment-label">{{ $t('faultCases.jira.columns.fileAttachments') }}</div>
            <div v-for="file in fileAttachments" :key="file.id" class="jira-attachment-item">
              <el-link type="primary" :underline="false" @click="downloadFile(file)">
                <i class="fas fa-paperclip"></i>
                {{ file.filename }}
              </el-link>
              <span class="jira-attachment-size">({{ formatFileSize(file.size) }})</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="jira-dialog-footer">
          <div class="jira-footer-right">
            <el-button v-if="jiraPreview.url" @click="openUrl(jiraPreview.url)">
              <i class="fas fa-external-link-alt"></i>
              {{ $t('faultCases.jira.openInJira') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
    </el-card>
  </div>
</template>

<script>
import { ref, reactive, computed, nextTick, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled, Search, Refresh, Link, View, Plus, Filter } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { getTableHeight } from '@/utils/tableHeight'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import api from '../api'
export default {
  name: 'JiraFaultCases',
  components: {
    InfoFilled,
    Search,
    Refresh,
    Link,
    View,
    Plus,
    Filter
  },
  setup () {
    const { t, locale } = useI18n()
    const store = useStore()
    const router = useRouter()
    const route = useRoute()

    const FILTER_ALL = '__all__'

    // Jira search state
    const jiraQuery = reactive({ q: '' })

    // Prefer showing Jira preview instead of redirecting (useful without VPN)
    const preferJiraPreview = ref(false)
    try {
      preferJiraPreview.value = window?.localStorage?.getItem('jira_preview_mode') === '1'
    } catch (_) {}
    watch(preferJiraPreview, (v) => {
      try {
        window?.localStorage?.setItem('jira_preview_mode', v ? '1' : '0')
      } catch (_) {}
    })

    // Filters state
    const filters = reactive({
      source: '',
      dateRange: null,
      statusKeys: [],
      moduleKeys: []
    })
    
    // Fault case statuses list
    const faultCaseStatuses = ref([])
    const loadingStatuses = ref(false)
    
    // Fault case modules list
    const faultCaseModules = ref([])
    const loadingModules = ref(false)
    const jiraLoading = ref(false)
    const jiraRows = ref([])
    const hasSearched = ref(false) // 标记是否已执行过搜索
    const jiraState = reactive({
      enabled: true,
      ok: true,
      message: ''
    })
    const jiraPager = reactive({
      page: 1,
      limit: 20,
      total: 0
    })

    const jiraPreview = reactive({
      visible: false,
      loading: false,
      key: '',
      title: '',
      summary: '',
      description: '',
      status: '',
      updated: null,
      url: '',
      module: '',
      projectName: '',
      projectKey: '',
      components: [],
      attachments: [],
      resolution: null,
      // 普通JIRA自定义字段
      customfield_10705: '', // 调查与原因分析
      customfield_10600: '', // 解决方案
      // 客诉自定义字段
      customfield_12213: '', // 详细描述
      customfield_12284: '', // 初步调查潜在原因
      customfield_12233: '', // 围堵措施
      customfield_12239: '' // 长期措施
    })

    // 图片预览弹窗
    const imagePreview = reactive({
      visible: false,
      src: '',
      filename: '',
      loading: false,
      error: false
    })

    // Filter state
    const activeFilters = reactive({
      modules: [],
      statuses: []
    })
    const hasFilteredModules = ref(false)
    const hasFilteredStatuses = ref(false)

    // Permissions
    const canCreate = computed(() => store.getters['auth/hasPermission']?.('fault_case:create'))
    const canUpdate = computed(() => store.getters['auth/hasPermission']?.('fault_case:update'))
    const canDelete = computed(() => store.getters['auth/hasPermission']?.('fault_case:delete'))

    
    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('withSearch')
    })

    const formatFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    // 判断是否为客诉项目（根据项目名称或项目key判断）
    const isComplaintProject = computed(() => {
      const projectName = jiraPreview.projectName || ''
      const projectKey = jiraPreview.projectKey || ''
      // 如果项目名称包含"客诉"或项目key包含特定标识，则认为是客诉项目
      // 这里可以根据实际需求调整判断逻辑
      return projectName.includes('客诉') || projectKey.toUpperCase().includes('COMPLAINT') || projectKey.toUpperCase().includes('KS')
    })

    // 判断是否为图片
    const isImageAttachment = (attachment) => {
      const filename = attachment?.filename || attachment?.original_name || ''
      const mimeType = attachment?.mimeType || attachment?.mime_type || ''

      // 支持的图片格式
      const supportedImageTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'image/bmp', 'image/webp', 'image/svg+xml'
      ]

      // 通过 MIME 类型判断
      const isImageByMime = supportedImageTypes.includes(String(mimeType).toLowerCase())

      // 通过文件扩展名判断
      const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
      const isImageByExtension = imageExtensions.test(filename)

      return isImageByMime || isImageByExtension
    }

    const getAttachmentUrl = (attachment) => {
      return attachment?.content || attachment?.url || ''
    }

    // 获取附件代理 URL（适用于所有文件类型，包括图片和非图片）
    const getAttachmentProxyUrl = (attachment) => {
      const raw = getAttachmentUrl(attachment)
      if (!raw) return ''
      const token = store?.state?.auth?.token || ''
      const qs = new URLSearchParams()
      qs.set('url', raw)
      // 后端 auth 中间件支持 GET query token，用于处理跨域和认证
      if (token) qs.set('token', token)
      return `/api/jira/attachment/proxy?${qs.toString()}`
    }

    const getImageSrc = (img) => {
      return getAttachmentProxyUrl(img)
    }

    // 获取图片附件列表
    const imageAttachments = computed(() => {
      if (!jiraPreview.attachments || !Array.isArray(jiraPreview.attachments)) return []
      return jiraPreview.attachments.filter(att => getAttachmentUrl(att) && isImageAttachment(att))
    })

    // 获取非图片附件列表
    const fileAttachments = computed(() => {
      if (!jiraPreview.attachments || !Array.isArray(jiraPreview.attachments)) return []
      return jiraPreview.attachments.filter(att => !isImageAttachment(att))
    })

    // 获取图片预览 URL 列表（用于 el-image 的 preview-src-list）
    const imagePreviewUrls = computed(() => {
      return imageAttachments.value.map(img => getImageSrc(img)).filter(Boolean)
    })

    // 获取图片在预览列表中的索引
    const getImageIndex = (img) => {
      return imageAttachments.value.findIndex(item => item.id === img.id)
    }

    // 下载文件（使用后端代理，支持未连接 JIRA 的情况）
    const downloadFile = (file) => {
      const rawUrl = getAttachmentUrl(file)
      if (!rawUrl) {
        console.warn('附件缺少 content URL:', file)
        ElMessage.warning('附件链接无效')
        return
      }
      
      // 使用后端代理 URL，解决跨域和认证问题（适用于未连接 JIRA 的情况）
      const proxyUrl = getAttachmentProxyUrl(file)
      try {
        const link = document.createElement('a')
        link.href = proxyUrl
        link.download = file.filename || 'attachment'
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (error) {
        console.warn('文件下载失败:', error)
        // 降级：尝试使用原始 URL（可能失败）
        try {
          window.open(proxyUrl, '_blank')
        } catch (fallbackError) {
          console.error('降级下载也失败:', fallbackError)
          ElMessage.error('文件下载失败，请检查网络连接')
        }
      }
    }

    const downloadImage = () => {
      if (imagePreview.src) {
        const link = document.createElement('a')
        link.href = imagePreview.src
        link.download = imagePreview.filename || 'image'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    }

    const formatDate = (d) => {
      if (!d) return '-'
      try {
        return new Date(d).toLocaleString()
      } catch {
        return String(d)
      }
    }

    const formatDateOnly = (d) => {
      if (!d) return '-'
      try {
        return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
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


    // Available filter options
    const availableModules = computed(() => {
      const modules = new Set()
      jiraRows.value.forEach((row) => {
        const comps = Array.isArray(row?.components) ? row.components : []
        if (comps.length > 0) {
          comps.forEach((c) => { if (c) modules.add(String(c)) })
        } else if (row?.module) {
          modules.add(String(row.module))
        }
      })
      return Array.from(modules).map((m) => m.trim()).filter(Boolean).sort()
    })

    // 从API获取故障案例状态列表（需要 fault_case_config:manage 权限）
    const fetchFaultCaseStatuses = async () => {
      // 检查权限
      if (!store.getters['auth/hasPermission']('fault_case_config:manage')) {
        return
      }
      loadingStatuses.value = true
      try {
        const resp = await api.faultCaseStatuses.getList({ is_active: true })
        if (resp.data?.success) {
          faultCaseStatuses.value = resp.data.statuses || []
        }
      } catch (e) {
        console.error('获取故障案例状态列表失败:', e)
      } finally {
        loadingStatuses.value = false
      }
    }
    
    // 从API获取故障案例模块列表（需要 fault_case_config:manage 权限）
    const fetchFaultCaseModules = async () => {
      // 检查权限
      if (!store.getters['auth/hasPermission']('fault_case_config:manage')) {
        return
      }
      loadingModules.value = true
      try {
        const resp = await api.faultCaseModules.getList({ is_active: true })
        if (resp.data?.success) {
          faultCaseModules.value = resp.data.modules || []
        }
      } catch (e) {
        console.error('获取故障案例模块列表失败:', e)
      } finally {
        loadingModules.value = false
      }
    }
    
    // 检查是否有配置管理权限
    const hasConfigManagePermission = computed(() => {
      return store.getters['auth/hasPermission']('fault_case_config:manage')
    })
    
    const availableStatusKeys = computed(() => {
      if (!hasConfigManagePermission.value) return []
      return faultCaseStatuses.value.filter(s => s.is_active)
    })
    
    const availableModuleKeys = computed(() => {
      if (!hasConfigManagePermission.value) return []
      return faultCaseModules.value.filter(m => m.is_active)
    })
    
    
    const isZhCN = computed(() => {
      const currentLocale = locale.value || 'zh-CN'
      return currentLocale === 'zh-CN'
    })
    
    // 根据 JIRA 状态值反向查找对应的故障案例状态名称和匹配信息
    // 通过 mapping_values 匹配，然后根据用户选择的系统语言返回 name_zh 或 name_en
    // 返回 { displayName, hasMapping, originalValue }
    const getStatusDisplayInfo = (statusValue) => {
      if (!statusValue) return { displayName: '-', hasMapping: false, originalValue: '' }
      const statusStr = String(statusValue).trim()
      if (!statusStr) return { displayName: '-', hasMapping: false, originalValue: '' }
      
      // 首先尝试通过 status_key 直接匹配（MongoDB 存储的是 status_key）
      const directMatch = faultCaseStatuses.value.find(s => s.is_active && s.status_key === statusStr)
      if (directMatch) {
        const displayName = isZhCN.value ? directMatch.name_zh : directMatch.name_en
        return {
          displayName: displayName || directMatch.status_key,
          hasMapping: true,
          originalValue: '',
          statusKey: directMatch.status_key
        }
      }
      
      // 如果不是直接匹配，尝试通过 mapping_values 反向查找（JIRA 原值）
      for (const status of faultCaseStatuses.value) {
        if (!status.is_active) continue
        const mappingValues = status.mapping_values || []
        const matched = mappingValues.some(mv => String(mv).trim() === statusStr)
        if (matched) {
          const displayName = isZhCN.value ? status.name_zh : status.name_en
          return {
            displayName: displayName || status.status_key,
            hasMapping: true,
            originalValue: statusStr,
            statusKey: status.status_key
          }
        }
      }
      
      // 如果没有找到匹配的映射，返回原始值
      return {
        displayName: statusStr,
        hasMapping: false,
        originalValue: statusStr
      }
    }
    
    // 向后兼容：只返回显示名称
    const getStatusDisplayName = (statusValue) => {
      return getStatusDisplayInfo(statusValue).displayName
    }
    
    // 根据 JIRA 模块值反向查找对应的故障案例模块名称和匹配信息
    // 通过 mapping_values 匹配，然后根据用户选择的系统语言返回 name_zh 或 name_en
    // 返回 { displayName, hasMapping, originalValue }
    const getModuleDisplayInfo = (moduleValue) => {
      if (!moduleValue) return { displayName: '-', hasMapping: false, originalValue: '' }
      const moduleStr = String(moduleValue).trim()
      if (!moduleStr) return { displayName: '-', hasMapping: false, originalValue: '' }
      
      // 首先尝试通过 module_key 直接匹配（MongoDB 存储的是 module_key）
      const directMatch = faultCaseModules.value.find(m => m.is_active && m.module_key === moduleStr)
      if (directMatch) {
        const displayName = isZhCN.value ? directMatch.name_zh : directMatch.name_en
        return {
          displayName: displayName || directMatch.module_key,
          hasMapping: true,
          originalValue: '',
          moduleKey: directMatch.module_key
        }
      }
      
      // 如果不是直接匹配，尝试通过 mapping_values 反向查找（JIRA 原值）
      // 注意：模块可能是逗号分隔的多个值
      const moduleParts = moduleStr.split(',').map(p => p.trim()).filter(Boolean)
      if (moduleParts.length > 1) {
        // 多个模块值，尝试分别查找
        const matchedParts = []
        const unmatchedParts = []
        for (const part of moduleParts) {
          let found = false
          for (const module of faultCaseModules.value) {
            if (!module.is_active) continue
            const mappingValues = module.mapping_values || []
            if (mappingValues.some(mv => String(mv).trim() === part) || module.module_key === part) {
              const displayName = isZhCN.value ? module.name_zh : module.name_en
              matchedParts.push(displayName || module.module_key)
              found = true
              break
            }
          }
          if (!found) {
            unmatchedParts.push(part)
          }
        }
        if (matchedParts.length > 0) {
          const allParts = [...matchedParts, ...unmatchedParts]
          return {
            displayName: allParts.join(', '),
            hasMapping: unmatchedParts.length === 0,
            originalValue: moduleStr
          }
        }
      } else {
        // 单个模块值
        for (const module of faultCaseModules.value) {
          if (!module.is_active) continue
          const mappingValues = module.mapping_values || []
          const matched = mappingValues.some(mv => String(mv).trim() === moduleStr) || module.module_key === moduleStr
          if (matched) {
            const displayName = isZhCN.value ? module.name_zh : module.name_en
            return {
              displayName: displayName || module.module_key,
              hasMapping: true,
              originalValue: moduleStr,
              moduleKey: module.module_key
            }
          }
        }
      }
      
      // 如果没有找到匹配的映射，返回原始值
      return {
        displayName: moduleStr,
        hasMapping: false,
        originalValue: moduleStr
      }
    }
    
    // 向后兼容：只返回显示名称
    const getModuleDisplayName = (moduleValue) => {
      return getModuleDisplayInfo(moduleValue).displayName
    }
    
    // 获取状态显示文本（用于查询页面）
    // 主显示 name 字段，无映射则显示 raw 值
    const getStatusDisplayText = (statusValue, source) => {
      const info = getStatusDisplayInfo(statusValue)
      if (!statusValue) return '-'
      if (info.hasMapping) {
        return info.displayName
      } else {
        // 无映射则返回 raw 值（星号在模板中单独显示）
        return info.originalValue || statusValue
      }
    }
    
    // 获取状态是否有映射（用于添加星号标记）
    const getStatusHasMapping = (statusValue) => {
      const info = getStatusDisplayInfo(statusValue)
      return info.hasMapping
    }
    
    // 获取状态提示内容（hover 显示 JIRA 原值）
    const getStatusTooltipContent = (row) => {
      if (!row || !row.status) return ''
      const info = getStatusDisplayInfo(row.status)
      // 如果有原值且与显示名称不同，显示原值
      if (info.originalValue && info.originalValue !== info.displayName) {
        return row.source === 'jira' ? `JIRA 原值: ${info.originalValue}` : `原值: ${info.originalValue}`
      }
      // 如果是 JIRA 来源，显示原始状态值
      if (row.source === 'jira') {
        return `JIRA 原值: ${row.status}`
      }
      // 如果是 MongoDB 来源且找到了映射，显示原 status_key
      if (row.source !== 'jira' && info.hasMapping && info.statusKey && info.statusKey !== info.displayName) {
        return `状态键: ${info.statusKey}`
      }
      // 如果没有映射，显示原始值作为提示
      if (!info.hasMapping && row.status) {
        return `原值: ${row.status}（未配置映射）`
      }
      return ''
    }
    
    // 获取模块显示文本（用于查询页面）
    // 主显示 name 字段，无映射则显示 raw 值
    const getModuleDisplayText = (moduleValue, source) => {
      const info = getModuleDisplayInfo(moduleValue)
      if (!moduleValue) return '-'
      if (info.hasMapping) {
        return info.displayName
      } else {
        // 无映射则返回 raw 值（星号在模板中单独显示）
        return info.originalValue || moduleValue
      }
    }
    
    // 获取模块是否有映射（用于添加星号标记）
    const getModuleHasMapping = (moduleValue) => {
      const info = getModuleDisplayInfo(moduleValue)
      return info.hasMapping
    }
    
    // 获取模块提示内容（hover 显示 JIRA 原值）
    const getModuleTooltipContent = (row) => {
      if (!row || !row.module) return ''
      const info = getModuleDisplayInfo(row.module)
      // 如果有原值且与显示名称不同，显示原值
      if (info.originalValue && info.originalValue !== info.displayName) {
        return row.source === 'jira' ? `JIRA 原值: ${info.originalValue}` : `原值: ${info.originalValue}`
      }
      // 如果是 JIRA 来源，显示原始模块值
      if (row.source === 'jira') {
        return `JIRA 原值: ${row.module}`
      }
      // 如果是 MongoDB 来源且找到了映射，显示原 module_key
      if (row.source !== 'jira' && info.hasMapping && info.moduleKey && info.moduleKey !== info.displayName) {
        return `模块键: ${info.moduleKey}`
      }
      // 如果没有映射，显示原始值作为提示
      if (!info.hasMapping && row.module) {
        return `原值: ${row.module}（未配置映射）`
      }
      return ''
    }
    
    // 保留原有的availableStatuses用于表格筛选（从jiraRows中提取）
    const availableStatuses = computed(() => {
      const statuses = new Set()
      jiraRows.value.forEach((row) => {
        if (row?.status) statuses.add(String(row.status))
      })
      return Array.from(statuses).map((s) => s.trim()).filter(Boolean).sort()
    })

    // Module and status filters for Jira (legacy table filters)
    const moduleFilterValues = computed(() => {
      const modules = new Set()
      jiraRows.value.forEach((row) => {
        const comps = Array.isArray(row?.components) ? row.components : []
        if (comps.length > 0) {
          comps.forEach((c) => { if (c) modules.add(String(c)) })
        } else if (row?.module) {
          modules.add(String(row.module))
        }
      })
      return Array.from(modules).map((m) => m.trim()).filter(Boolean).sort()
    })

    const moduleFilters = computed(() => {
      const values = moduleFilterValues.value
      if (!values.length) return []
      return [
        { text: t('faultCases.jira.filters.selectAll'), value: FILTER_ALL },
        ...values.map((m) => {
          // 根据模块值获取映射后的显示名称（仅标准字典项）
          const info = getModuleDisplayInfo(m)
          const displayName = info.hasMapping ? info.displayName : m
          return { text: displayName || m, value: m }
        })
      ]
    })

    const statusFilterValues = computed(() => {
      const statuses = new Set()
      jiraRows.value.forEach((row) => {
        if (row?.status) statuses.add(String(row.status))
      })
      return Array.from(statuses).map((s) => s.trim()).filter(Boolean).sort()
    })

    const statusFilters = computed(() => {
      const values = statusFilterValues.value
      if (!values.length) return []
      return [
        { text: t('faultCases.jira.filters.selectAll'), value: FILTER_ALL },
        ...values.map((s) => {
          // 根据 JIRA 状态值获取映射后的显示名称
          const displayName = getStatusDisplayName(s)
          return { text: displayName || s, value: s }
        })
      ]
    })

    const filteredModuleValues = computed(() => {
      if (activeFilters.modules.length === 0 && hasFilteredModules.value && moduleFilterValues.value.length > 0) {
        return [FILTER_ALL, ...moduleFilterValues.value]
      }
      if (activeFilters.modules.length > 0) {
        return activeFilters.modules
      }
      return []
    })

    const filteredStatusValues = computed(() => {
      if (activeFilters.statuses.length === 0 && hasFilteredStatuses.value && statusFilterValues.value.length > 0) {
        return [FILTER_ALL, ...statusFilterValues.value]
      }
      if (activeFilters.statuses.length > 0) {
        return activeFilters.statuses
      }
      return []
    })

    const noFilter = () => true

    // Jira search functions
    const fetchJiraPage = async () => {
      const q = (jiraQuery.q || '').trim()
      if (!q) {
        jiraRows.value = []
        jiraPager.total = 0
        hasSearched.value = false // 清空搜索关键词时，重置搜索标记
        return
      }

      hasSearched.value = true // 标记已执行搜索
      jiraLoading.value = true
      jiraState.ok = true
      jiraState.message = ''
      try {
        const params = {
          q,
          page: jiraPager.page,
          limit: jiraPager.limit
        }

        // Apply filters
        if (filters.source) {
          params.source = filters.source
        }
        if (filters.moduleKeys && filters.moduleKeys.length > 0) {
          params.moduleKeys = filters.moduleKeys
        }
        if (filters.statusKeys && filters.statusKeys.length > 0) {
          params.statusKeys = filters.statusKeys
        }
        if (filters.dateRange && Array.isArray(filters.dateRange) && filters.dateRange.length === 2) {
          const [startDate, endDate] = filters.dateRange
          if (startDate) {
            params.updatedFrom = new Date(startDate + ' 00:00:00').toISOString()
          }
          if (endDate) {
            params.updatedTo = new Date(endDate + ' 23:59:59').toISOString()
          }
        }
        
        // Mixed list: Jira + Mongo fault cases (backend pagination + updated desc)
        const resp = await api.jira.searchMixed(params)
        const d = resp.data || {}
        jiraState.enabled = d.enabled !== false
        jiraState.ok = d.ok !== false
        jiraState.message = d.message || ''
        jiraRows.value = Array.isArray(d.items) ? d.items : (Array.isArray(d.issues) ? d.issues : [])
        jiraPager.total = Number.isFinite(Number(d.total)) ? Number(d.total) : jiraRows.value.length
        jiraPager.page = Number.isFinite(Number(d.page)) ? Number(d.page) : jiraPager.page
        jiraPager.limit = Number.isFinite(Number(d.limit)) ? Number(d.limit) : jiraPager.limit
      } catch (e) {
        jiraState.ok = false
        jiraState.message = e.response?.data?.message || t('shared.requestFailed')
        ElMessage.error(jiraState.message)
      } finally {
        jiraLoading.value = false
      }
    }

    const handleJiraSearch = async (resetPage) => {
      if (resetPage) jiraPager.page = 1
      await fetchJiraPage()
    }

    const handleTableFilterChange = async (filters) => {
      if (Object.prototype.hasOwnProperty.call(filters, 'module')) {
        const selected = Array.isArray(filters.module) ? filters.module : (filters.module ? [filters.module] : [])
        hasFilteredModules.value = true
        if (selected.includes(FILTER_ALL)) {
          activeFilters.modules = []
        } else {
          activeFilters.modules = selected.filter(v => v !== FILTER_ALL)
        }
      } else {
        activeFilters.modules = []
        hasFilteredModules.value = false
      }
      
      if (Object.prototype.hasOwnProperty.call(filters, 'status')) {
        const selected = Array.isArray(filters.status) ? filters.status : (filters.status ? [filters.status] : [])
        hasFilteredStatuses.value = true
        if (selected.includes(FILTER_ALL)) {
          activeFilters.statuses = []
        } else {
          activeFilters.statuses = selected.filter(v => v !== FILTER_ALL)
        }
      } else {
        activeFilters.statuses = []
        hasFilteredStatuses.value = false
      }
      
      await nextTick()
      await handleJiraSearch(true)
    }

    const resetFilters = async () => {
      jiraQuery.q = ''
      filters.source = ''
      filters.dateRange = null
      filters.statusKeys = []
      filters.moduleKeys = []
      jiraRows.value = []
      jiraPager.page = 1
      jiraPager.total = 0
      hasSearched.value = false
      jiraState.ok = true
      jiraState.message = ''
    }

    const handleFilterChange = () => {
      // Trigger search when filters change
      if (jiraQuery.q.trim() || filters.source || filters.dateRange) {
        handleJiraSearch(true)
      }
    }

    const resetJira = async () => {
      jiraQuery.q = ''
      dateRange.value = null
      activeFilters.modules = []
      activeFilters.statuses = []
      hasFilteredModules.value = false
      hasFilteredStatuses.value = false
      jiraRows.value = []
      jiraPager.page = 1
      jiraPager.total = 0
      hasSearched.value = false // 重置时清除搜索标记
      jiraState.ok = true
      jiraState.message = ''
    }

    const refresh = async () => {
      await fetchJiraPage()
    }


    const openCreate = () => {
      const routeData = router.resolve('/dashboard/fault-cases/new')
      window.open(routeData.href, '_blank')
    }

    const addToFaultCases = async (row) => {
      if (!canCreate.value) {
        ElMessage.error(t('auth.insufficientPermissions'))
        return
      }
      const key = row?.key
      if (!key) return
      const routeData = router.resolve({
        path: '/dashboard/fault-cases/new',
        query: {
          source: 'jira',
          jira_key: key
        }
      })
      window.open(routeData.href, '_blank')
    }

    const openUrl = (url) => {
      if (!url) return
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    const openJiraOrPreview = async (row) => {
      const source = row?.source || 'jira'
      const key = String(row?.jira_key || row?.key || '').trim()
      const url = row?.url || ''

      // If user prefers preview mode, never redirect for Jira issues
      if (preferJiraPreview.value && source === 'jira') {
        // If Jira backend is not ok/enabled, prefer preview (meets "no VPN show summary" behavior)
        if (jiraState.enabled === false || jiraState.ok === false) {
          jiraPreview.visible = true
          jiraPreview.loading = false
          jiraPreview.key = key
          jiraPreview.title = key
          jiraPreview.summary = row?.summary || ''
          jiraPreview.description = ''
          jiraPreview.status = row?.status || ''
          jiraPreview.updated = row?.updated || null
          jiraPreview.url = url
          jiraPreview.module = row?.module || ''
          jiraPreview.projectName = row?.projectName || ''
          jiraPreview.projectKey = row?.projectKey || ''
          jiraPreview.components = row?.components || []
          jiraPreview.attachments = row?.attachments || []
          jiraPreview.resolution = row?.resolution || null
          // 重置自定义字段
          jiraPreview.customfield_10705 = ''
          jiraPreview.customfield_10600 = ''
          jiraPreview.customfield_12213 = ''
          jiraPreview.customfield_12284 = ''
          jiraPreview.customfield_12233 = ''
          jiraPreview.customfield_12239 = ''
          return
        }

        // Best-effort: fetch more detail, but still stay in-app
        return previewJiraIssue(key, row)
      }

      // If Jira backend is not ok/enabled, prefer preview (meets "no VPN show summary" behavior)
      if (jiraState.enabled === false || jiraState.ok === false) {
        jiraPreview.visible = true
        jiraPreview.loading = false
        jiraPreview.key = key
        jiraPreview.title = key
        jiraPreview.summary = row?.summary || ''
        jiraPreview.description = ''
        jiraPreview.status = row?.status || ''
        jiraPreview.updated = row?.updated || null
        jiraPreview.url = url
        jiraPreview.module = row?.module || ''
        jiraPreview.projectName = row?.projectName || ''
        jiraPreview.projectKey = row?.projectKey || ''
        jiraPreview.components = row?.components || []
        jiraPreview.attachments = row?.attachments || []
        jiraPreview.resolution = row?.resolution || null
        // 重置自定义字段
        jiraPreview.customfield_10705 = ''
        jiraPreview.customfield_10600 = ''
        jiraPreview.customfield_12213 = ''
        jiraPreview.customfield_12284 = ''
        jiraPreview.customfield_12233 = ''
        jiraPreview.customfield_12239 = ''
        return
      }

      // For MongoDB cases (source !== 'jira'), always go to edit page
      // Even if they have jira_key (added from JIRA), they are now MongoDB cases with case_code
      if (source !== 'jira') {
        return openEditByMixedRow(row)
      }

      // For Jira cases only: open Jira url
      if (url) return openUrl(url)

      // Fallback: if url missing, try preview from backend
      return previewJiraIssue(key, row)
    }

    const previewJiraIssue = async (key, row) => {
      const k = String(key || '').trim()
      if (!k) return
      jiraPreview.visible = true
      jiraPreview.loading = true
      jiraPreview.key = k
      jiraPreview.title = k
      jiraPreview.summary = row?.summary || ''
      jiraPreview.description = ''
      jiraPreview.status = row?.status || ''
      jiraPreview.updated = row?.updated || null
      jiraPreview.url = row?.url || ''
      jiraPreview.module = row?.module || ''
      jiraPreview.projectName = row?.projectName || ''
      jiraPreview.projectKey = row?.projectKey || ''
      jiraPreview.components = row?.components || []
      jiraPreview.attachments = row?.attachments || []
      jiraPreview.resolution = row?.resolution || null
      // 重置自定义字段
      jiraPreview.customfield_10705 = ''
      jiraPreview.customfield_10600 = ''
      jiraPreview.customfield_12213 = ''
      jiraPreview.customfield_12284 = ''
      jiraPreview.customfield_12233 = ''
      jiraPreview.customfield_12239 = ''
      try {
        const resp = await api.jira.getIssue(k)
        const issue = resp.data?.issue
        if (issue) {
          jiraPreview.summary = issue.summary || jiraPreview.summary
          jiraPreview.description = issue.description || ''
          jiraPreview.status = issue.status || jiraPreview.status
          jiraPreview.updated = issue.updated || jiraPreview.updated
          jiraPreview.url = issue.url || jiraPreview.url
          jiraPreview.module = issue.module || jiraPreview.module
          jiraPreview.projectName = issue.projectName || jiraPreview.projectName
          jiraPreview.projectKey = issue.projectKey || jiraPreview.projectKey
          jiraPreview.components = Array.isArray(issue.components) ? issue.components : (jiraPreview.components || [])
          jiraPreview.attachments = issue.attachments || jiraPreview.attachments
          jiraPreview.resolution = issue.resolution || jiraPreview.resolution
          // 提取自定义字段
          jiraPreview.customfield_10705 = issue.customfield_10705 || ''
          jiraPreview.customfield_10600 = issue.customfield_10600 || ''
          jiraPreview.customfield_12213 = issue.customfield_12213 || ''
          jiraPreview.customfield_12284 = issue.customfield_12284 || ''
          jiraPreview.customfield_12233 = issue.customfield_12233 || ''
          jiraPreview.customfield_12239 = issue.customfield_12239 || ''
        }
        // NOTE:
        // - 图片预览：走后端“实时代理(流式转发)”（getImageSrc）
        // - 其他附件：保持 Jira 原始链接，点击后直接跳转/打开
      } catch (_) {
        // keep best-effort from row
      } finally {
        jiraPreview.loading = false
      }
    }

    const goDetailByMixedRow = (row) => {
      const id = row?.fault_case_id || row?._id
      if (!id) return
      router.push(`/dashboard/fault-cases/${id}`)
    }

    const goDetail = (row) => {
      router.push(`/dashboard/fault-cases/${row._id}`)
    }

    const openEditByMixedRow = async (row) => {
      const id = row?.fault_case_id || row?._id
      if (!id) return
      const routeData = router.resolve(`/dashboard/fault-cases/${id}/edit`)
      window.open(routeData.href, '_blank')
    }

    // 使用删除确认 composable pattern
    const { confirmDelete: confirmDeleteAction } = useDeleteConfirm()

    const handleDelete = async (row) => {
      try {
        const id = row?.fault_case_id || row?._id
        if (!id) return

        const confirmed = await confirmDeleteAction({ _id: id }, {
          message: t('shared.messages.confirmDelete'),
          title: t('shared.messages.deleteConfirmTitle')
        })

        if (!confirmed) return

        await api.faultCases.delete(id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        await handleJiraSearch(false)
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Delete error:', error)
          ElMessage.error(t('shared.messages.deleteFailed'))
        }
      }
    }


    onMounted(() => {
      fetchFaultCaseStatuses()
      fetchFaultCaseModules()
    })

    return {
      t,
      jiraQuery,
      filters,
      availableModules,
      availableStatuses,
      availableStatusKeys,
      availableModuleKeys,
      hasConfigManagePermission,
      isZhCN,
      jiraLoading,
      jiraRows,
      jiraState,
      jiraPager,
      jiraPreview,
      canCreate,
      canUpdate,
      canDelete,
      formatDate,
      formatDateOnly,
      formatSize,
      moduleFilters,
      statusFilters,
      filteredModuleValues,
      filteredStatusValues,
      noFilter,
      handleJiraSearch,
      handleFilterChange,
      handleTableFilterChange,
      resetFilters,
      resetJira,
      refresh,
      openCreate,
      addToFaultCases,
      openUrl,
      openJiraOrPreview,
      previewJiraIssue,
      preferJiraPreview,
      goDetailByMixedRow,
      openEditByMixedRow,
      goDetail,
      handleDelete,
      formatFileSize,
      imageAttachments,
      fileAttachments,
      imagePreviewUrls,
      getImageIndex,
      downloadFile,
      getImageSrc,
      getAttachmentProxyUrl,
      imagePreview,
      downloadImage,
      tableHeight,
      isComplaintProject,
      loadingStatuses,
      getStatusDisplayName,
      getStatusDisplayInfo,
      getModuleDisplayName,
      getModuleDisplayInfo,
      getStatusDisplayText,
      getStatusHasMapping,
      getStatusTooltipContent,
      getModuleDisplayText,
      getModuleHasMapping,
      getModuleTooltipContent
    }
  }
}
</script>

<style scoped>
.fault-cases-container {
  height: 100%;
  background: var(--black-white-white);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px; /* 底部 padding 减少到 4px */
}

/* Search and Actions Section */
.search-actions-section {
  margin-bottom: 2px;
  flex-shrink: 0;
}

.search-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
}

.search-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 600px;
}

.search-input {
  flex: 1;
  min-width: 300px;
}

.search-btn,
.reset-btn {
  white-space: nowrap;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.jira-preview-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid rgb(var(--border));
  border-radius: var(--radius-md);
  background: rgb(var(--bg-secondary));
}

.toggle-label {
  font-size: 12px;
  color: rgb(var(--text-secondary));
  white-space: nowrap;
}

.help-icon {
  color: rgb(var(--text-secondary));
  cursor: help;
}

.create-btn {
  white-space: nowrap;
}

/* Search Info */
/* Filters Row */
.filters-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid rgb(var(--border));
  flex-shrink: 0;
}

.filters-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgb(var(--text-secondary));
  font-size: 14px;
  white-space: nowrap;
}

.filters-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  flex-wrap: wrap;
}

.filter-select {
  width: 140px;
}

/* 模块筛选器加长 */
.filter-select-module {
  width: 200px;
}

/* 状态筛选器加长 */
.filter-select-status {
  width: 200px;
}

/* 时间筛选器缩短 */
.filter-date-picker {
  width: 180px;
}

.filter-results {
  margin-left: auto;
  color: rgb(var(--text-secondary));
  font-size: 14px;
  white-space: nowrap;
}


/* 表格容器 - 固定表头 */
.table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.table-container :deep(.el-table) {
  flex: 1;
}

.table-container :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

.inline-filter {
  display: flex;
  align-items: center;
}

.fault-case-filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 12px 0;
}
.pager {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 0 12px 0; /* 上8px， 下12px */
  margin-top: auto;
  border-top: 1px solid var(--gray-200);
  background: var(--black-white-white);
}
.keywords-input-wrapper {
  width: 100%;
}
.keywords-tags {
  margin-bottom: 8px;
  min-height: 32px;
}
.summary-cell {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: rgb(var(--text-secondary));
  font-size: 12px;
}

/* 图片预览样式 */
.image-preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  max-height: 80vh;
}

.preview-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
}

.image-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgb(var(--text-error-primary));
  text-align: center;
}

.image-error p {
  margin: 8px 0;
}

.error-desc {
  font-size: 14px;
  color: rgb(var(--text-secondary));
}

.image-preview-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* JIRA 附件图片样式 */
.jira-attachment-images {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.jira-image-thumbnail {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgb(var(--border));
  background: rgb(var(--bg-secondary));
  transition: all 0.3s;
}

.jira-image-thumbnail:hover {
  border-color: rgb(var(--sidebar-primary));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.jira-attachment-image {
  width: 100%;
  height: 100%;
}

.jira-image-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none; /* 让点击事件穿透到 el-image */
}

.jira-image-thumbnail:hover .jira-image-overlay {
  opacity: 1;
}

.jira-image-overlay i {
  color: rgb(var(--text-white));
  font-size: 24px;
}

.jira-image-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  color: rgb(var(--text-white));
  font-size: 11px;
  padding: 4px 6px;
}

/* JIRA Preview Dialog Styles */
:deep(.jira-preview-dialog .el-dialog__header) {
  padding: 20px 24px 0;
  margin: 0;
}

:deep(.jira-preview-dialog .el-dialog__headerbtn) {
  top: 2px;
  right: 2px;
  color: rgb(var(--text-tertiary));
  transition: all 0.3s;
}

:deep(.jira-preview-dialog .el-dialog__headerbtn:hover) {
  background-color: rgb(var(--bg-primary-hover));
  color: rgb(var(--text-secondary));
}

:deep(.jira-preview-dialog .el-dialog__body) {
  padding: 0;
}

:deep(.jira-preview-dialog .el-dialog__footer) {
  padding: 16px 24px;
  border-top: 1px solid rgb(var(--border-primary));
}

/* 无映射状态的星号样式：红色星号 */
.asterisk {
  color: var(--el-color-danger);
  font-weight: bold;
  margin-left: 2px;
}

/* 表格单元格内容样式：单行显示，溢出显示省略号 */
.table-cell-content {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jira-preview-content {
  padding: 0 24px 24px;
}

.jira-preview-header {
  margin-bottom: 24px;
}

.jira-preview-key-project {
  font-size: 13px;
  color: rgb(var(--text-tertiary));
  margin-bottom: 8px;
  font-weight: 400;
}

.jira-preview-title {
  font-size: 18px;
  font-weight: 600;
  color: rgb(var(--text-primary));
  line-height: 1.5;
}

.jira-key-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgb(var(--border-primary));
}

.jira-key-info-left,
.jira-key-info-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.jira-info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.jira-info-label {
  font-size: 11px;
  font-weight: 600;
  color: rgb(var(--text-tertiary));
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.jira-info-value {
  font-size: 14px;
  color: rgb(var(--text-secondary));
  display: flex;
  align-items: center;
}

.jira-info-empty {
  font-size: 14px;
  color: rgb(var(--text-disabled));
}

.jira-status-tag {
  display: inline-block;
  width: fit-content;
}

.jira-components {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.jira-component-tag {
  background-color: rgb(var(--bg-secondary));
  color: rgb(var(--text-secondary));
  border: none;
}

.jira-content-section {
  margin-bottom: 20px;
}

.jira-content-label {
  font-size: 11px;
  font-weight: 600;
  color: rgb(var(--text-tertiary));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.jira-content-box {
  background-color: rgb(var(--bg-secondary));
  border: 1px solid rgb(var(--border-primary));
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: 14px;
  color: rgb(var(--text-secondary));
  line-height: 1.6;
  white-space: pre-wrap;
  min-height: 40px;
}

.jira-content-two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.jira-attachments-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgb(var(--border-primary));
}

.jira-image-attachments,
.jira-file-attachments {
  margin-bottom: 16px;
}

.jira-attachment-label {
  font-size: 13px;
  color: rgb(var(--text-secondary));
  margin-bottom: 8px;
  font-weight: 500;
}

.jira-attachment-item {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.jira-attachment-item i {
  margin-right: 4px;
}

.jira-attachment-size {
  color: rgb(var(--text-tertiary));
  font-size: 12px;
}

.jira-dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.jira-footer-right {
  display: flex;
  gap: 12px;
}

.jira-footer-right i {
  margin-right: 6px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-actions-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 12px 0;
  }

  .search-section {
    padding: 0;
  }

  .search-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .search-left {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .search-right {
    justify-content: flex-start;
    gap: 8px;
  }

  .inline-filter {
    display: flex;
    align-items: center;
  }

  .fault-case-filters {
    gap: 8px;
  }

  /* 对话框响应式 */
  :deep(.el-dialog) {
    width: 95% !important;
    max-width: 95% !important;
    margin: 5vh auto;
  }

  /* 表格在小屏幕上的处理 */
  :deep(.el-table) {
    font-size: 12px;
  }

  :deep(.el-table th),
  :deep(.el-table td) {
    padding: 8px 4px;
  }

  /* 关键字列按钮左对齐 */
  :deep(.el-table__body-wrapper .el-table__body tr td:first-child .el-button--text) {
    margin-left: 0;
    padding-left: 0;
  }

  /* 操作按钮组 */
  .operation-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .operation-buttons button {
    padding: 4px 8px;
    font-size: 12px;
  }
}
</style>
