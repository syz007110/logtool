<template>
  <div class="i18n-error-codes-container" v-if="isClient">
    <!-- 统一卡片：包含搜索栏和列表 -->
    <el-card class="main-card">
      <!-- 搜索和操作栏 -->
      <div class="action-bar">
        <div class="search-section">
          <el-input
            v-model="searchForm.code"
            :placeholder="$t('i18nErrorCodes.inputErrorCode')"
            style="width: 160px"
            clearable
            @input="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>

          <el-select
            v-model="searchForm.subsystem"
            :placeholder="$t('i18nErrorCodes.selectSubsystem')"
            style="width: 220px; margin-left: 10px"
            clearable
            @change="handleSubsystemFilter"
          >
                  <el-option
                    v-for="option in subsystemOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>

          <el-select
            v-model="searchForm.lang"
            :placeholder="$t('i18nErrorCodes.selectLanguage')"
            style="width: 150px; margin-left: 10px"
                clearable
            @change="handleLanguageFilter"
          >
                <el-option :label="$t('i18nErrorCodes.all')" value="" />
                <el-option
                  v-for="lang in languageOptions"
                  :key="lang.value"
                  :label="lang.label"
                  :value="lang.value"
                />
              </el-select>
        </div>

        <div class="action-section">
          <button
            class="btn-primary"
            @click="handleAdd"
            v-if="canCreate"
            aria-label="$t('i18nErrorCodes.addContent')"
          >
            <i class="fas fa-plus"></i>
            {{ $t('i18nErrorCodes.addContent') }}
          </button>

          <button
            class="btn-secondary"
            @click="handleBatchImport"
            v-if="canCreate"
            aria-label="$t('i18nErrorCodes.batchImport')"
          >
            <i class="fas fa-upload"></i>
            {{ $t('i18nErrorCodes.batchImport') }}
          </button>

          <button
            class="btn-secondary"
            @click="handleExport"
            v-if="canExport"
            aria-label="$t('i18nErrorCodes.exportXML')"
          >
            <i class="fas fa-download"></i>
            {{ $t('i18nErrorCodes.exportXML') }}
          </button>
        </div>
      </div>

      <!-- 多语言内容列表 - 可滚动容器 -->
      <div class="table-container">
        <el-table :data="i18nErrorCodes" :loading="loading" :height="tableHeight" style="width: 100%" v-loading="loading">
        <el-table-column :label="$t('i18nErrorCodes.subsystemNumber')" width="90">
          <template #default="{ row }">
            {{ (row && row.errorCode && row.errorCode.subsystem) ? row.errorCode.subsystem : 'N/A' }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('i18nErrorCodes.errorCode')" width="100">
          <template #default="{ row }">
            {{ (row && row.errorCode && row.errorCode.code) ? row.errorCode.code : 'N/A' }}
          </template>
        </el-table-column>
        <el-table-column prop="lang" :label="$t('i18nErrorCodes.language')" width="110">
          <template #default="{ row }">
            <el-tag :type="getLangTagType(row.lang)">{{ getLangDisplayName(row.lang) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('i18nErrorCodes.shortMessage')" min-width="180">
          <template #default="{ row }">
            <ExplanationCell :text="row.short_message || 'N/A'" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('i18nErrorCodes.userHint')" min-width="240">
          <template #default="{ row }">
            <ExplanationCell :text="row.user_hint || 'N/A'" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('i18nErrorCodes.operation')" min-width="160" align="left">
          <template #default="{ row }">
              <ExplanationCell :text="row.operation || 'N/A'" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="180" align="center" fixed="right" v-if="canUpdate || canDelete">
          <template #default="{ row }">
            <div class="btn-group" style="justify-content: center;">
              <button
                class="btn-text"
                @click="handleEdit(row)"
                v-if="canUpdate"
                :aria-label="$t('shared.edit')"
                :title="$t('shared.edit')"
              >
                {{ $t('shared.edit') }}
              </button>
              <button
                class="btn-text-danger"
                @click="handleDelete(row)"
                v-if="canDelete"
                :aria-label="$t('shared.delete')"
                :title="$t('shared.delete')"
              >
                {{ $t('shared.delete') }}
              </button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="total > 0">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-if="showDialog"
      v-model="showDialog"
      :title="editingItem ? $t('i18nErrorCodes.editDialogTitle') : $t('i18nErrorCodes.addDialogTitle')"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
      >
        <el-form-item :label="$t('i18nErrorCodes.subsystem')" prop="subsystem">
          <el-select v-model="form.subsystem" :placeholder="$t('i18nErrorCodes.selectSubsystem')" style="width: 100%; min-width: 250px;">
            <el-option 
              v-for="option in subsystemOptions" 
              :key="option.value" 
              :label="option.label" 
              :value="option.value" 
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('i18nErrorCodes.errorCode')" prop="code">
          <el-input
            v-model="form.code"
            :placeholder="$t('i18nErrorCodes.formPlaceholders.errorCodeFormat')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="$t('i18nErrorCodes.language')" prop="lang">
          <el-select v-model="form.lang" :placeholder="$t('i18nErrorCodes.selectLanguage')" style="width: 100%; min-width: 200px;">
            <el-option 
              v-for="lang in languageOptions" 
              :key="lang.value" 
              :label="lang.label" 
              :value="lang.value" 
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('i18nErrorCodes.shortMessage')" prop="short_message">
          <el-input
            v-model="form.short_message"
            type="textarea"
            :rows="2"
            :placeholder="$t('i18nErrorCodes.formPlaceholders.shortMessageInput')"
          />
        </el-form-item>
        <el-form-item :label="$t('i18nErrorCodes.userHint')" prop="user_hint">
          <el-input
            v-model="form.user_hint"
            type="textarea"
            :rows="2"
            :placeholder="$t('i18nErrorCodes.formPlaceholders.userHintInput')"
          />
        </el-form-item>
        <el-form-item :label="$t('i18nErrorCodes.operation')" prop="operation">
          <el-input
            v-model="form.operation"
            type="textarea"
            :rows="2"
            :placeholder="$t('i18nErrorCodes.formPlaceholders.operationInput')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showDialog = false">{{ $t('shared.cancel') }}</button>
          <button class="btn-primary" :class="{ 'btn-loading': saving }" :disabled="saving" @click="handleSave">{{ $t('shared.save') }}</button>
        </span>
      </template>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-dialog
      v-if="showImportDialog"
      v-model="showImportDialog"
      :title="$t('i18nErrorCodes.batchImportTitle')"
      width="600px"
      :close-on-click-modal="false"
      @close="clearImportForm"
    >
      <el-tabs v-model="importForm.activeTab">
        <el-tab-pane :label="$t('i18nErrorCodes.import.csvTab')" name="csv">
          <div class="csv-format-tip">
            <p><strong>{{ $t('i18nErrorCodes.import.formatDescription') }}</strong></p>
            <p>{{ $t('i18nErrorCodes.import.formatColumns') }}</p>
            <p><strong>{{ $t('i18nErrorCodes.import.formatColumnsList') }}</strong></p>
            <p><strong>{{ $t('i18nErrorCodes.import.formatExample') }}</strong></p>
            <pre>subsystem,code,lang,short_message,user_hint,operation
1,0X010A,zh,系统初始化失败,请检查系统配置并重启设备,重启设备并检查系统状态
1,0X010A,en,System initialization failed,Please check system configuration and restart device,Restart device and check system status</pre>
            <p><strong>{{ $t('i18nErrorCodes.import.supportedLanguages') }}{{ $t('i18nErrorCodes.import.supportedLanguagesList') }}</strong></p>
            <p><strong>{{ $t('i18nErrorCodes.import.validationRules') }}</strong></p>
            <p>• {{ $t('i18nErrorCodes.import.rule1') }}</p>
            <p>• {{ $t('i18nErrorCodes.import.rule2') }}</p>
            <p style="margin-left: 20px;">{{ $t('i18nErrorCodes.import.rule2a') }}</p>
            <p style="margin-left: 20px;">{{ $t('i18nErrorCodes.import.rule2b') }}</p>
            <p>• {{ $t('i18nErrorCodes.import.rule3') }}</p>
          </div>
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :on-change="handleCSVChange"
            :before-upload="beforeCSVUpload"
            :file-list="importForm.csvFiles"
            accept=".csv"
            multiple
          >
            <button class="btn-primary">{{ $t('i18nErrorCodes.selectFile') }}</button>
            <template #tip>
              <div class="el-upload__tip">
                {{ $t('i18nErrorCodes.import.uploadTip') }}
              </div>
            </template>
          </el-upload>
        </el-tab-pane>
        <el-tab-pane :label="$t('i18nErrorCodes.import.manualTab')" name="manual">
          <el-form :model="importForm" label-width="120px">
              <div class="csv-format-tip">
                <p><strong>{{ $t('i18nErrorCodes.import.manualFormatDescription') }}</strong></p>
                <p>{{ $t('i18nErrorCodes.import.manualFormatExample') }}</p>
                <p><strong>{{ $t('i18nErrorCodes.import.manualFormatSample') }}</strong></p>
                <pre>1,0X010A,zh,系统初始化失败,请检查系统配置并重启设备,重启设备并检查系统状态
1,0X010A,en,System initialization failed,Please check system configuration and restart device,Restart device and check system status</pre>
                <p><strong>{{ $t('i18nErrorCodes.import.supportedLanguages') }}{{ $t('i18nErrorCodes.import.supportedLanguagesList') }}</strong></p>
                <p><strong>{{ $t('i18nErrorCodes.import.validationRules') }}</strong></p>
                <p>• {{ $t('i18nErrorCodes.import.rule1') }}</p>
                <p>• {{ $t('i18nErrorCodes.import.rule2') }}</p>
                <p style="margin-left: 20px;">{{ $t('i18nErrorCodes.import.rule2a') }}</p>
                <p style="margin-left: 20px;">{{ $t('i18nErrorCodes.import.rule2b') }}</p>
                <p>• {{ $t('i18nErrorCodes.import.rule3') }}</p>
              </div>
              <el-input
                v-model="importForm.data"
                type="textarea"
                :rows="10"
                :placeholder="$t('i18nErrorCodes.formPlaceholders.csvDataInput')"
              />
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="() => { showImportDialog = false; clearImportForm(); }">{{ $t('shared.cancel') }}</button>
          <button class="btn-primary" :class="{ 'btn-loading': importing }" :disabled="importing" @click="handleImport">{{ $t('i18nErrorCodes.uploadImport') }}</button>
        </span>
      </template>
    </el-dialog>

    <!-- 导出对话框 -->
    <el-dialog
      v-if="showExportDialog"
      v-model="showExportDialog"
      :title="$t('i18nErrorCodes.exportDialogTitle')"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="exportForm" label-width="120px">
        <el-form-item :label="$t('i18nErrorCodes.selectLanguages')" required>
          <div class="export-language-checkboxes" :style="{ '--lang-col-width': exportLangColWidth + 'px' }">
            <el-checkbox-group v-model="exportForm.languages">
              <el-checkbox 
                v-for="lang in exportLanguageOptions" 
                :key="lang.value" 
                :label="lang.value"
              >
                {{ lang.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showExportDialog = false">{{ $t('shared.cancel') }}</button>
          <button class="btn-primary" :class="{ 'btn-loading': exporting }" :disabled="exporting" @click="handleExportConfirm">{{ $t('shared.export') }}</button>
        </span>
      </template>
    </el-dialog>
  </div>
  <div v-else class="loading-container">
    <el-loading-component />
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed, watch, onBeforeUnmount, h, resolveComponent } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, Download, Search } from '@element-plus/icons-vue'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import { getTableHeight } from '@/utils/tableHeight'
import api from '../api'
import JSZip from 'jszip'

export default {
  name: 'I18nErrorCodes',
  components: {
    Search,
    ExplanationCell: {
      name: 'ExplanationCell',
      props: { 
        text: { type: String, default: '' },
        always: { type: Boolean, default: false }
      },
      setup(props) {
        const containerRef = ref(null)
        const needsTooltip = ref(false)
        let resizeObserver = null

        const measure = () => {
          const el = containerRef.value
          if (!el) return
          needsTooltip.value = (el.scrollWidth - el.clientWidth) > 1
        }

        const handleMouseEnter = () => {
          measure()
        }

        onMounted(() => {
          measure()
          if ('ResizeObserver' in window) {
            resizeObserver = new ResizeObserver(() => measure())
            if (containerRef.value) resizeObserver.observe(containerRef.value)
          } else {
            window.addEventListener('resize', measure)
          }
        })

        onBeforeUnmount(() => {
          if (resizeObserver && containerRef.value) resizeObserver.unobserve(containerRef.value)
          if (resizeObserver) resizeObserver.disconnect()
          resizeObserver = null
          window.removeEventListener('resize', measure)
        })

        return () => h(resolveComponent('el-tooltip'), {
          content: props.text,
          placement: 'top',
          effect: 'dark',
          popperClass: 'explanation-tooltip dark',
          teleported: true,
          showAfter: 120,
          disabled: ((props.text ?? '') === '') || (!props.always && !needsTooltip.value)
        }, {
          default: () => h('span', {
            ref: containerRef,
            class: 'explanation-ellipsis',
            style: 'display:inline-block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
            onMouseenter: handleMouseEnter
          }, props.text)
        })
      }
    }
  },
  setup() {
    const store = useStore()
    const { t } = useI18n()
    
    // 客户端检测
    const isClient = ref(false)
    
    const loading = ref(false)
    const saving = ref(false)
    const importing = ref(false)
    const exporting = ref(false)
    const errorCodesLoading = ref(false)
    const showDialog = ref(false)
    const showImportDialog = ref(false)
    const showExportDialog = ref(false)
    const editingItem = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const total = ref(0)
    const i18nErrorCodes = ref([])
    const errorCodesOptions = ref([])
    const subsystemOptions = ref([])
    const languageOptions = ref([])
    const formRef = ref(null)
    const uploadRef = ref(null)

    const searchForm = reactive({
      subsystem: '',
      code: '',
      lang: ''
    })

    const form = reactive({
      subsystem: '',
      code: '',
      lang: '',
      short_message: '',
      user_hint: '',
      operation: ''
    })

    const importForm = reactive({
      data: '',
      activeTab: 'csv',
      csvFiles: []
    })

    const exportForm = reactive({
      languages: ['zh']
    })

    const exportLanguageOptions = ref([])
    const exportLangColWidth = ref(140)
    
    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('basic')
    })

    // 动态验证规则
    const rules = computed(() => {
      const baseRules = {
        subsystem: [{ required: true, message: t('i18nErrorCodes.validation.subsystemRequired'), trigger: 'change' }],
        code: [
          { required: true, message: t('i18nErrorCodes.validation.errorCodeRequired'), trigger: 'blur' },
          { pattern: /^0X[0-9A-F]{3}[ABCDE]$/, message: t('i18nErrorCodes.validation.errorCodeFormat'), trigger: 'blur' }
        ],
        lang: [{ required: true, message: t('i18nErrorCodes.validation.languageRequired'), trigger: 'change' }]
      };

      // 动态验证字段：short_message和operation不都为空，user_hint和operation不都为空
      const hasOperation = form.operation && form.operation.trim() !== '';
      
      baseRules.short_message = [
        { 
          required: !hasOperation, 
          message: t('i18nErrorCodes.validation.shortMessageRequired'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.user_hint = [
        { 
          required: !hasOperation, 
          message: t('i18nErrorCodes.validation.userHintRequired'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.operation = [
        { 
          required: !(form.short_message && form.short_message.trim() !== '') && 
                    !(form.user_hint && form.user_hint.trim() !== ''), 
          message: t('i18nErrorCodes.validation.operationRequired'), 
          trigger: 'blur' 
        }
      ];

      return baseRules;
    });

    // 权限检查
    const canCreate = computed(() => {
      try {
        if (!store.getters['auth/isAuthenticated']) {
          return false
        }
        return store.getters['auth/hasPermission']('i18n:create')
      } catch (error) {
        console.error('Permission check error:', error)
        return false
      }
    })
    const canUpdate = computed(() => {
      try {
        if (!store.getters['auth/isAuthenticated']) {
          return false
        }
        return store.getters['auth/hasPermission']('i18n:update')
      } catch (error) {
        console.error('Permission check error:', error)
        return false
      }
    })
    const canDelete = computed(() => {
      try {
        if (!store.getters['auth/isAuthenticated']) {
          return false
        }
        return store.getters['auth/hasPermission']('i18n:delete')
      } catch (error) {
        console.error('Permission check error:', error)
        return false
      }
    })
    const canExport = computed(() => {
      try {
        if (!store.getters['auth/isAuthenticated']) {
          return false
        }
        return store.getters['auth/hasPermission']('error_code:export')
      } catch (error) {
        console.error('Permission check error:', error)
        return false
      }
    })

    // 加载子系统号列表
    const loadSubsystems = async () => {
      try {
        const response = await api.i18nErrorCodes.getSubsystems()
        subsystemOptions.value = response.data?.subsystems || []
      } catch (error) {
        console.error('Load subsystems error:', error)
        // 如果API调用失败，使用默认的子系统选项
        subsystemOptions.value = [
          { value: '1', label: t('shared.subsystemOptions.1') },
          { value: '2', label: t('shared.subsystemOptions.2') },
          { value: '3', label: t('shared.subsystemOptions.3') },
          { value: '4', label: t('shared.subsystemOptions.4') },
          { value: '5', label: t('shared.subsystemOptions.5') },
          { value: '6', label: t('shared.subsystemOptions.6') },
          { value: '7', label: t('shared.subsystemOptions.7') },
          { value: '8', label: t('shared.subsystemOptions.8') },
          { value: '9', label: t('shared.subsystemOptions.9') },
          { value: 'A', label: t('shared.subsystemOptions.A') }
        ]
      }
    }

    // 加载语言选项列表
    const loadLanguages = async () => {
      try {
        const response = await api.i18nErrorCodes.getLanguages()
        languageOptions.value = response.data?.languages || []
      } catch (error) {
        console.error('Load languages error:', error)
        // 如果API调用失败，使用默认的语言选项
        languageOptions.value = [
          { value: 'zh', label: t('shared.languageNames.zh') },
          { value: 'en', label: t('shared.languageNames.en') },
          { value: 'fr', label: t('shared.languageNames.fr') },
          { value: 'de', label: t('shared.languageNames.de') },
          { value: 'es', label: t('shared.languageNames.es') },
          { value: 'it', label: t('shared.languageNames.it') },
          { value: 'pt', label: t('shared.languageNames.pt') },
          { value: 'nl', label: t('shared.languageNames.nl') },
          { value: 'sk', label: t('shared.languageNames.sk') },
          { value: 'ro', label: t('shared.languageNames.ro') },
          { value: 'da', label: t('shared.languageNames.da') }
        ]
      }
    }

    // 加载导出语言选项列表
    const loadExportLanguages = async () => {
      try {
        const response = await api.i18nErrorCodes.getLanguages()
        exportLanguageOptions.value = response.data?.languages || []
        // 计算最长标签宽度，给每列一个统一的最小宽度，保证多列左对齐
        exportLangColWidth.value = calcLangColumnWidth(exportLanguageOptions.value)
      } catch (error) {
        console.error('Load export languages error:', error)
        // 如果API调用失败，使用默认的导出语言选项
        exportLanguageOptions.value = [
          { value: 'zh', label: t('shared.languageNames.zh') },
          { value: 'en', label: t('shared.languageNames.en') },
          { value: 'fr', label: t('shared.languageNames.fr') },
          { value: 'de', label: t('shared.languageNames.de') },
          { value: 'es', label: t('shared.languageNames.es') },
          { value: 'it', label: t('shared.languageNames.it') },
          { value: 'pt', label: t('shared.languageNames.pt') },
          { value: 'nl', label: t('shared.languageNames.nl') },
          { value: 'sk', label: t('shared.languageNames.sk') },
          { value: 'ro', label: t('shared.languageNames.ro') },
          { value: 'da', label: t('shared.languageNames.da') }
        ]
        exportLangColWidth.value = calcLangColumnWidth(exportLanguageOptions.value)
      }
    }

    const calcLangColumnWidth = (options) => {
      const basePadding = 28 // 复选框控件左右内边距与图标所占宽度
      const maxLabelLength = (options || []).reduce((max, o) => {
        const len = (o.label || '').length
        return Math.max(max, len)
      }, 0)
      // 粗略按每汉字/字符 14px 估算，再加上控件内边距，限制最小和最大范围
      const estimated = Math.min(Math.max(Math.ceil(maxLabelLength * 14) + basePadding, 120), 240)
      return estimated
    }

    // 加载多语言故障码列表
    const loadI18nErrorCodes = async () => {
      try {
        loading.value = true
        const params = {
          page: currentPage.value,
          limit: pageSize.value,
          ...searchForm
        }
        const response = await api.i18nErrorCodes.getList(params)
        i18nErrorCodes.value = response.data?.i18nErrorCodes || []
        total.value = response.data?.total || 0
      } catch (error) {
        console.error('Load i18n error codes error:', error)
        ElMessage.error(t('i18nErrorCodes.messages.loadFailed'))
      } finally {
        loading.value = false
      }
    }

    // 搜索
    const handleSearch = () => {
      currentPage.value = 1
      loadI18nErrorCodes()
    }

    // 子系统筛选
    const handleSubsystemFilter = () => {
      currentPage.value = 1
      loadI18nErrorCodes()
    }

    // 语言筛选
    const handleLanguageFilter = () => {
      currentPage.value = 1
      loadI18nErrorCodes()
    }

    // 分页大小改变
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadI18nErrorCodes()
    }

    // 当前页改变
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadI18nErrorCodes()
    }

    // 添加
    const handleAdd = () => {
      editingItem.value = null
      Object.assign(form, {
        subsystem: '',
        code: '',
        lang: '',
        short_message: '',
        user_hint: '',
        operation: ''
      })
      showDialog.value = true
    }

    // 编辑
    const handleEdit = (row) => {
      editingItem.value = row
      Object.assign(form, {
        subsystem: row.errorCode?.subsystem || '',
        code: row.errorCode?.code || '',
        lang: row.lang,
        short_message: row.short_message || '',
        user_hint: row.user_hint || '',
        operation: row.operation || ''
      })
      showDialog.value = true
    }

    // 保存
    const handleSave = async () => {
      try {
        await formRef.value.validate()
        saving.value = true
        
        const data = {
          subsystem: form.subsystem,
          code: form.code,
          lang: form.lang,
          short_message: form.short_message,
          user_hint: form.user_hint,
          operation: form.operation
        }
        
        await api.i18nErrorCodes.upsert(data)
        ElMessage.success(t('shared.messages.saveSuccess'))
        showDialog.value = false
        loadI18nErrorCodes()
      } catch (error) {
        console.error('Save error:', error)
        ElMessage.error(t('shared.messages.saveFailed'))
      } finally {
        saving.value = false
      }
    }

    // 删除
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm(
          t('i18nErrorCodes.deleteConfirmText'),
          t('shared.messages.confirmDelete'),
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        
        await api.i18nErrorCodes.delete(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadI18nErrorCodes()
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Delete error:', error)
          ElMessage.error(t('shared.messages.deleteFailed'))
        }
      }
    }

    // 批量导入
    const handleBatchImport = () => {
      showImportDialog.value = true
    }

    // CSV文件改变
    const handleCSVChange = (file, fileList) => {
      importForm.csvFiles = fileList
    }

    // CSV上传前检查
    const beforeCSVUpload = (file) => {
      const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv')
      const isLt10M = file.size / 1024 / 1024 < 10

      if (!isCSV) {
        ElMessage.error('只能上传CSV文件!')
        return false
      }
      if (!isLt10M) {
        ElMessage.error('文件大小不能超过10MB!')
        return false
      }
      return false // 阻止自动上传
    }

    // 清空导入表单
    const clearImportForm = () => {
      importForm.data = ''
      importForm.csvFiles = []
      importForm.activeTab = 'csv'
      // 清空上传组件的文件列表
      if (uploadRef.value) {
        uploadRef.value.clearFiles()
      }
    }

    // 导入
    const handleImport = async () => {
      try {
        importing.value = true
        
        if (importForm.activeTab === 'csv') {
          if (importForm.csvFiles.length === 0) {
            ElMessage.error(t('i18nErrorCodes.import.selectCsvFile'))
            return
          }

          // 只处理第一个文件
          const file = importForm.csvFiles[0]
          const formData = new FormData()
          formData.append('files', file.raw)
          
          const response = await api.i18nErrorCodes.uploadCSV(formData)
          
          // 检查响应中的错误信息
          if (response.data && response.data.errors && response.data.errors.length > 0) {
            const errorCount = response.data.errors.length
            const successCount = response.data.results ? response.data.results.length : 0
            
            if (successCount > 0) {
              ElMessage.warning(t('i18nErrorCodes.import.importPartialSuccess', { successCount, errorCount }))
              // 部分成功时也清空表单
              clearImportForm()
              showImportDialog.value = false
              loadI18nErrorCodes()
            } else {
              ElMessage.error(t('i18nErrorCodes.import.importFailed', { errorCount }))
            }
            
            // 显示前几个错误信息
            const errorMessages = response.data.errors.slice(0, 3).map(err => err.error || err.message).join('; ')
            if (errorMessages) {
              ElMessage.error(t('i18nErrorCodes.import.errorDetails', { errorMessages }))
            }
            
            return
          }
          
          // 完全成功的情况
          const successCount = response.data && response.data.results ? response.data.results.length : 0
          ElMessage.success(t('i18nErrorCodes.import.importSuccess', { successCount }))
          clearImportForm()
          showImportDialog.value = false
          loadI18nErrorCodes()
          
        } else {
          if (!importForm.data.trim()) {
            ElMessage.error(t('i18nErrorCodes.import.enterCsvData'))
            return
          }

          // 解析CSV文本数据
          const lines = importForm.data.trim().split('\n')
          const data = []
          const validationErrors = []
          
          // 跳过第一行（标题行）
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line) {
              const values = line.split(',').map(v => v.trim())
              if (values.length >= 6) {
                const item = {
                  subsystem: values[0],
                  code: values[1],
                  lang: values[2],
                  short_message: values[3],
                  user_hint: values[4],
                  operation: values[5]
                }
                
                // 客户端验证：检查内容字段
                const hasShortMessage = item.short_message && item.short_message.trim() !== ''
                const hasUserHint = item.user_hint && item.user_hint.trim() !== ''
                const hasOperation = item.operation && item.operation.trim() !== ''
                
                const condition1 = hasUserHint || hasOperation
                const condition2 = hasShortMessage || hasOperation
                
                if (!condition1 && !condition2) {
                  validationErrors.push(t('i18nErrorCodes.import.rowValidationError', { row: i + 1 }))
                }
                
                data.push(item)
              } else {
                validationErrors.push(t('i18nErrorCodes.import.rowFormatError', { row: i + 1 }))
              }
            }
          }

          if (data.length === 0) {
            ElMessage.error(t('i18nErrorCodes.import.noValidData'))
            return
          }
          
          // 如果有验证错误，显示错误信息
          if (validationErrors.length > 0) {
            ElMessage.error(t('i18nErrorCodes.import.validationFailed') + '\n' + validationErrors.slice(0, 3).join('\n') + (validationErrors.length > 3 ? '\n...' : ''))
            return
          }

          const response = await api.i18nErrorCodes.batchImport({ data })
          
          // 检查响应中的错误信息
          if (response.data && response.data.errors && response.data.errors.length > 0) {
            const errorCount = response.data.errors.length
            const successCount = response.data.results ? response.data.results.length : 0
            
            if (successCount > 0) {
              ElMessage.warning(t('i18nErrorCodes.import.importPartialSuccess', { successCount, errorCount }))
              // 部分成功时也清空表单
              clearImportForm()
              showImportDialog.value = false
              loadI18nErrorCodes()
            } else {
              ElMessage.error(t('i18nErrorCodes.import.importFailed', { errorCount }))
            }
            
            // 显示前几个错误信息
            const errorMessages = response.data.errors.slice(0, 3).map(err => err.error || err.message).join('; ')
            if (errorMessages) {
              ElMessage.error(t('i18nErrorCodes.import.errorDetails', { errorMessages }))
            }
            
            return
          }
          
          // 完全成功的情况
          const successCount = response.data && response.data.results ? response.data.results.length : 0
          ElMessage.success(t('i18nErrorCodes.import.importSuccess', { successCount }))
          clearImportForm()
          showImportDialog.value = false
          loadI18nErrorCodes()
        }
      } catch (error) {
        console.error('Import error:', error)
        if (error.response && error.response.data && error.response.data.message) {
          ElMessage.error(`导入失败：${error.response.data.message}`)
        } else {
          ElMessage.error(t('shared.messages.importFailed'))
        }
      } finally {
        importing.value = false
      }
    }

    // 导出
    const handleExport = () => {
      loadExportLanguages()
      showExportDialog.value = true
    }

    // 确认导出
    const handleExportConfirm = async () => {
      try {
        if (exportForm.languages.length === 0) {
          ElMessage.error(t('i18nErrorCodes.selectAtLeastOne'))
          return
        }

        exporting.value = true
        const languages = exportForm.languages.join(',')
        
        const response = await api.errorCodes.exportMultiXML(languages)
        
        // 检查响应数据
        if (!response.data || !response.data.xmlResults) {
          ElMessage.error(t('i18nErrorCodes.messages.exportDataEmpty'))
          return
        }
        
        // 创建ZIP文件
        const JSZip = (await import('jszip')).default
          const zip = new JSZip()
          
        // 为每种语言添加XML文件到ZIP
        for (const [language, xmlContent] of Object.entries(response.data.xmlResults)) {
          const langDisplayName = getLangfileName(language)
          zip.file(`FaultAnalysis_${langDisplayName}.xml`, xmlContent)
        }
        
        // 生成ZIP文件并下载
          const zipBlob = await zip.generateAsync({ type: 'blob' })
        const url = window.URL.createObjectURL(zipBlob)
          const link = document.createElement('a')
          link.href = url
        link.download = `i18n-error-codes-${new Date().toISOString().split('T')[0]}.zip`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
          
          ElMessage.success(t('i18nErrorCodes.multiLanguageExportSuccess'))
        showExportDialog.value = false
      } catch (error) {
        console.error('Export error:', error)
        ElMessage.error(t('shared.messages.exportFailed'))
      } finally {
        exporting.value = false
      }
    }

    // 语言显示名称
    const getLangDisplayName = (lang) => {
      return t(`shared.languageNames.${lang}`) || lang
    }

     // 导出文件名称后缀
     const getLangfileName = (lang) => {
      const langMap = {
        zh: 'Chinese',
        en: 'English',
        fr: 'French',
        de: 'German',
        es: 'Spanish',
        it: 'Italian',
        pt: 'Portugal',
        nl: 'Dutch',
        sk: 'Czechoslovakia',
        ro: 'Romania',
        da: 'Denmark'
      }
      return langMap[lang] || lang
    }

    // 语言标签类型
    const getLangTagType = (lang) => {
      const typeMap = {
        zh: 'success',
        en: 'primary',
        fr: 'warning',
        de: 'info',
        es: 'success',
        it: 'info',
        pt: 'warning',
        nl: 'info',
        sk: 'danger',
        ro: 'warning',
        da: 'info'
      }
      return typeMap[lang] || ''
    }

    // 监听字段变化，重新验证表单
    watch(
      [
        () => form.short_message,
        () => form.user_hint,
        () => form.operation
      ],
      () => {
        // 当相关字段变化时，重新验证表单
        if (formRef.value) {
          formRef.value.clearValidate([
            'short_message',
            'user_hint', 
            'operation'
          ])
        }
      }
    )
    
    onMounted(() => {
      // 确保在客户端环境下运行
      isClient.value = true
      
      try {
        if (!store.getters['auth/isAuthenticated']) {
          console.warn('User not authenticated, skipping data load')
          return
        }
        loadSubsystems()
        loadLanguages()
        loadI18nErrorCodes()
      } catch (error) {
        console.error('Component mount error:', error)
        ElMessage.error(t('i18nErrorCodes.messages.componentLoadFailed'))
      }
    })

    return {
      isClient,
      loading,
      saving,
      importing,
      exporting,
      errorCodesLoading,
      showDialog,
      showImportDialog,
      showExportDialog,
      editingItem,
      currentPage,
      pageSize,
      total,
      i18nErrorCodes,
      errorCodesOptions,
      subsystemOptions,
      languageOptions,
      exportLanguageOptions,
      searchForm,
      form,
      importForm,
      exportForm,
      formRef,
      rules,
      canCreate,
      canUpdate,
      canDelete,
      canExport,
      handleSearch,
      handleSubsystemFilter,
      handleLanguageFilter,
      handleSizeChange,
      handleCurrentChange,
      handleAdd,
      handleEdit,
      handleSave,
      handleDelete,
      handleBatchImport,
      handleImport,
      handleCSVChange,
      beforeCSVUpload,
      clearImportForm,
      handleExport,
      handleExportConfirm,
      getLangDisplayName,
      getLangfileName,
      getLangTagType,
      uploadRef,
      tableHeight
    }
  }
}
</script>

<style scoped>
.i18n-error-codes-container {
  height: calc(100vh - 64px);
  background: rgb(var(--background));
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
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

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.search-section {
  display: flex;
  align-items: center;
}

.action-section {
  display: flex;
  gap: 10px;
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

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-group {
  display: flex;
  gap: 8px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 0 12px 0; /* 上8px， 下12px */
  margin-top: auto;
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
}

.export-language-checkboxes {
  display: flex;
  flex-wrap: wrap;
}
.export-language-checkboxes .el-checkbox-group {
  display: grid;
  grid-template-columns: repeat(3, var(--lang-col-width));
  justify-content: start;
  column-gap: 12px;
  row-gap: 6px;
}
.export-language-checkboxes .el-checkbox {
  width: var(--lang-col-width, 140px);
  margin-right: 0;
  padding-right: 12px;
  box-sizing: border-box;
}

.csv-format-tip {
  background-color: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.csv-format-tip p {
  margin: 0 0 8px 0;
}

.csv-format-tip p:last-child {
  margin-bottom: 0;
}

.csv-format-tip pre {
  background-color: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  padding: 8px;
  margin: 8px 0;
  font-size: 12px;
  line-height: 1.4;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .i18n-error-codes-container {
    padding: 16px;
  }

  .action-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .search-section {
    flex-direction: column;
    gap: 12px;
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

  .action-section {
    justify-content: flex-start;
    gap: 8px;
  }

  /* 表格容器在小屏幕上的调整 */
  .table-container {
    max-height: calc(100vh - 320px); /* 小屏幕上留出更多空间 */
  }

  /* 对话框响应式 */
  :deep(.el-dialog) {
    width: 95% !important;
    max-width: 95% !important;
    margin: 5vh auto;
  }

  .export-language-checkboxes {
    grid-template-columns: 1fr !important;
  }

  .export-language-checkboxes .el-checkbox {
    width: 100% !important;
    margin-right: 0 !important;
    padding-right: 0 !important;
  }
}
</style> 
<style>
/* 统一悬停样式，避免被表格裁剪，并保持一致的暗色气泡 */
.explanation-tooltip {
  max-width: 60vw;
  white-space: normal;
  word-break: break-word;
  z-index: 3000;
}
.el-popper.explanation-tooltip {
  overflow: visible;
}
.explanation-ellipsis {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explanation-tooltip.dark {
  background: rgba(0,0,0,0.85);
  color: #fff;
  border: none;
}
</style>