<template>
  <div class="i18n-error-codes-container" v-if="isClient">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ $t('i18nErrorCodes.title') }}</span>
          <div class="header-actions">
            <el-button type="primary" @click="handleAdd" v-if="canCreate">
              <el-icon><Plus /></el-icon>
              {{ $t('i18nErrorCodes.addContent') }}
            </el-button>
            <el-button type="success" @click="handleBatchImport" v-if="canCreate">
              <el-icon><Upload /></el-icon>
              {{ $t('i18nErrorCodes.batchImport') }}
            </el-button>
            <el-button type="warning" @click="handleExport" v-if="canExport">
              <el-icon><Download /></el-icon>
              {{ $t('i18nErrorCodes.exportXML') }}
            </el-button>
          </div>
        </div>
      </template>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-form :inline="true" :model="searchForm">
          <el-form-item :label="$t('i18nErrorCodes.subsystem')" prop="subsystem">
              <el-select v-model="searchForm.subsystem" :placeholder="$t('i18nErrorCodes.selectSubsystem')" clearable style="width: 200px;">
                <el-option 
                  v-for="option in subsystemOptions" 
                  :key="option.value" 
                  :label="option.label" 
                  :value="option.value" 
                />
              </el-select>
          </el-form-item>
          <el-form-item :label="$t('i18nErrorCodes.errorCode')">
            <el-input 
              v-model="searchForm.code" 
              :placeholder="$t('i18nErrorCodes.inputErrorCode')" 
              clearable 
              @input="handleSearchInput"
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item :label="$t('i18nErrorCodes.language')">
            <el-select v-model="searchForm.lang" :placeholder="$t('i18nErrorCodes.selectLanguage')" clearable style="width: 180px;">
              <el-option :label="$t('i18nErrorCodes.all')" value="" />
              <el-option 
                v-for="lang in languageOptions" 
                :key="lang.value" 
                :label="lang.label" 
                :value="lang.value" 
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">{{ $t('i18nErrorCodes.search') }}</el-button>
            <el-button @click="resetSearch">{{ $t('i18nErrorCodes.reset') }}</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 多语言内容列表 -->
      <el-table :data="i18nErrorCodes" :loading="loading" style="width: 100%">
        <el-table-column :label="$t('i18nErrorCodes.subsystemNumber')" width="90">
          <template #default="{ row }">
            {{ (row && row.errorCode && row.errorCode.subsystem) ? row.errorCode.subsystem : 'N/A' }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('i18nErrorCodes.errorCode')" width="90">
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
        <el-table-column :label="$t('i18nErrorCodes.userHint')" min-width="220">
          <template #default="{ row }">
            <ExplanationCell :text="row.user_hint || 'N/A'" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('i18nErrorCodes.operation')" min-width="200">
          <template #default="{ row }">
            <ExplanationCell :text="row.operation || 'N/A'" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.operation')" width="150" v-if="canUpdate || canDelete">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleEdit(row)" v-if="canUpdate">
              {{ $t('i18nErrorCodes.edit') }}
            </el-button>
            <el-button type="danger" size="small" @click="handleDelete(row)" v-if="canDelete">
              {{ $t('i18nErrorCodes.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

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
            placeholder="格式：0X010A"
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
            placeholder="输入精简提示信息"
          />
        </el-form-item>
        <el-form-item :label="$t('i18nErrorCodes.userHint')" prop="user_hint">
          <el-input
            v-model="form.user_hint"
            type="textarea"
            :rows="2"
            placeholder="输入用户提示信息"
          />
        </el-form-item>
        <el-form-item :label="$t('i18nErrorCodes.operation')" prop="operation">
          <el-input
            v-model="form.operation"
            type="textarea"
            :rows="2"
            placeholder="输入操作信息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">{{ $t('common.save') }}</el-button>
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
        <el-tab-pane label="CSV导入" name="csv">
          <div class="csv-format-tip">
            <p><strong>CSV文件格式说明：</strong></p>
            <p>CSV文件应包含以下列（第一行为标题行）：</p>
            <p><strong>subsystem,code,lang,short_message,user_hint,operation</strong></p>
            <p><strong>示例内容：</strong></p>
            <pre>subsystem,code,lang,short_message,user_hint,operation
1,0X010A,zh,系统初始化失败,请检查系统配置并重启设备,重启设备并检查系统状态
1,0X010A,en,System initialization failed,Please check system configuration and restart device,Restart device and check system status</pre>
            <p><strong>支持的语言代码：</strong>zh(中文), en(英语), fr(法语), de(德语), es(西班牙语), it(意大利语), pt(葡萄牙语), nl(荷兰语), sk(斯洛伐克语), ro(罗马尼亚语), da(丹麦语)</p>
            <p><strong>⚠️ 数据验证规则：</strong></p>
            <p>• 每行数据必须包含6个字段</p>
            <p>• 必须满足以下条件之一：</p>
            <p style="margin-left: 20px;">1) user_hint 和 operation 至少一个不为空</p>
            <p style="margin-left: 20px;">2) short_message 和 operation 至少一个不为空</p>
            <p>• 故障码必须先在故障码管理中创建</p>
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
            <el-button type="primary">{{ $t('i18nErrorCodes.selectFile') }}</el-button>
            <template #tip>
              <div class="el-upload__tip">
                只能上传csv文件，且不超过10MB
              </div>
            </template>
          </el-upload>
        </el-tab-pane>
        <el-tab-pane label="手动输入" name="manual">
          <el-form :model="importForm" label-width="120px">
              <div class="csv-format-tip">
                <p><strong>CSV格式说明：</strong></p>
                <p>每行数据格式：子系统号,故障码,语言代码,精简提示,用户提示,操作信息</p>
                <p><strong>示例：</strong></p>
                <pre>1,0X010A,zh,系统初始化失败,请检查系统配置并重启设备,重启设备并检查系统状态
1,0X010A,en,System initialization failed,Please check system configuration and restart device,Restart device and check system status</pre>
                <p><strong>支持的语言代码：</strong>zh(中文), en(英语), fr(法语), de(德语), es(西班牙语), it(意大利语), pt(葡萄牙语), nl(荷兰语), sk(斯洛伐克语), ro(罗马尼亚语), da(丹麦语)</p>
                <p><strong>⚠️ 数据验证规则：</strong></p>
                <p>• 每行数据必须包含6个字段</p>
                <p>• 必须满足以下条件之一：</p>
                <p style="margin-left: 20px;">1) user_hint 和 user_hoperationint 至少一个不为空</p>
                <p style="margin-left: 20px;">2) short_message 和 operation 至少一个不为空</p>
                <p>• 故障码必须先在故障码管理中创建</p>
              </div>
              <el-input
                v-model="importForm.data"
                type="textarea"
                :rows="10"
                placeholder="请输入CSV格式的数据，第一行为标题行（可选），从第二行开始为数据行"
              />
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="() => { showImportDialog = false; clearImportForm(); }">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleImport" :loading="importing">{{ $t('i18nErrorCodes.uploadImport') }}</el-button>
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
        <el-button @click="showExportDialog = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleExportConfirm" :loading="exporting">{{ $t('common.export') }}</el-button>
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
import { Plus, Upload, Download } from '@element-plus/icons-vue'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import api from '../api'
import JSZip from 'jszip'

export default {
  name: 'I18nErrorCodes',
  components: {
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
    const pageSize = ref(10)
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

    // 动态验证规则
    const rules = computed(() => {
      const baseRules = {
        subsystem: [{ required: true, message: '请选择子系统', trigger: 'change' }],
        code: [
          { required: true, message: '请输入故障码', trigger: 'blur' },
          { pattern: /^0X[0-9A-F]{3}[ABCDE]$/, message: '故障码格式不正确，应为0X加3位16进制数字加A、B、C、D、E中的一个字母', trigger: 'blur' }
        ],
        lang: [{ required: true, message: '请选择语言', trigger: 'change' }]
      };

      // 动态验证字段：short_message和operation不都为空，user_hint和operation不都为空
      const hasOperation = form.operation && form.operation.trim() !== '';
      
      baseRules.short_message = [
        { 
          required: !hasOperation, 
          message: '精简提示信息和操作信息不能都为空', 
          trigger: 'blur' 
        }
      ];
      
      baseRules.user_hint = [
        { 
          required: !hasOperation, 
          message: '用户提示信息和操作信息不能都为空', 
          trigger: 'blur' 
        }
      ];
      
      baseRules.operation = [
        { 
          required: !(form.short_message && form.short_message.trim() !== '') && 
                    !(form.user_hint && form.user_hint.trim() !== ''), 
          message: '精简提示信息、用户提示信息和操作信息至少需要填写两项', 
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
          { value: '1', label: '01：运动控制软件' },
          { value: '2', label: '02：人机交互软件' },
          { value: '3', label: '03：医生控制台软件' },
          { value: '4', label: '04：手术台车软件' },
          { value: '5', label: '05：驱动器软件' },
          { value: '6', label: '06：图像软件' },
          { value: '7', label: '07：工具工厂软件' },
          { value: '8', label: '08：远程运动控制软件' },
          { value: '9', label: '09：远程医生控制台软件' },
          { value: 'A', label: '0A：远程驱动器软件' }
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
          { value: 'zh', label: '中文' },
          { value: 'en', label: '英语' },
          { value: 'fr', label: '法语' },
          { value: 'de', label: '德语' },
          { value: 'es', label: '西班牙语' },
          { value: 'it', label: '意大利语' },
          { value: 'pt', label: '葡萄牙语' },
          { value: 'nl', label: '荷兰语' },
          { value: 'sk', label: '斯洛伐克语' },
          { value: 'ro', label: '罗马尼亚语' },
          { value: 'da', label: '丹麦语' }
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
          { value: 'zh', label: '中文' },
          { value: 'en', label: '英语' },
          { value: 'fr', label: '法语' },
          { value: 'de', label: '德语' },
          { value: 'es', label: '西班牙语' },
          { value: 'it', label: '意大利语' },
          { value: 'pt', label: '葡萄牙语' },
          { value: 'nl', label: '荷兰语' },
          { value: 'sk', label: '斯洛伐克语' },
          { value: 'ro', label: '罗马尼亚语' },
          { value: 'da', label: '丹麦语' }
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
        ElMessage.error('加载失败')
      } finally {
        loading.value = false
      }
    }

    // 搜索
    const handleSearch = () => {
      currentPage.value = 1
      loadI18nErrorCodes()
    }

    // 搜索输入
    const handleSearchInput = () => {
      // 可以在这里添加防抖逻辑
    }

    // 重置搜索
    const resetSearch = () => {
      Object.assign(searchForm, {
        subsystem: '',
        code: '',
        lang: ''
      })
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
        ElMessage.success(editingItem.value ? t('i18nErrorCodes.saveSuccess') : t('i18nErrorCodes.saveSuccess'))
        showDialog.value = false
        loadI18nErrorCodes()
      } catch (error) {
        console.error('Save error:', error)
        ElMessage.error(editingItem.value ? t('i18nErrorCodes.saveFailed') : t('i18nErrorCodes.saveFailed'))
      } finally {
        saving.value = false
      }
    }

    // 删除
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm(
          t('i18nErrorCodes.deleteConfirmText'),
          t('i18nErrorCodes.confirmDelete'),
          {
            confirmButtonText: t('common.confirm'),
            cancelButtonText: t('common.cancel'),
          type: 'warning'
          }
        )
        
        await api.i18nErrorCodes.delete(row.id)
        ElMessage.success(t('i18nErrorCodes.deleteSuccess'))
        loadI18nErrorCodes()
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Delete error:', error)
          ElMessage.error(t('i18nErrorCodes.deleteFailed'))
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
            ElMessage.error('请选择CSV文件')
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
              ElMessage.warning(`导入部分成功：成功 ${successCount} 条，失败 ${errorCount} 条。请检查失败的数据。`)
              // 部分成功时也清空表单
              clearImportForm()
              showImportDialog.value = false
              loadI18nErrorCodes()
            } else {
              ElMessage.error(`导入失败：${errorCount} 条数据有错误。请检查数据格式。`)
            }
            
            // 显示前几个错误信息
            const errorMessages = response.data.errors.slice(0, 3).map(err => err.error || err.message).join('; ')
            if (errorMessages) {
              ElMessage.error(`错误详情：${errorMessages}`)
            }
            
            return
          }
          
          // 完全成功的情况
          const successCount = response.data && response.data.results ? response.data.results.length : 0
          ElMessage.success(`导入成功：共导入 ${successCount} 条数据`)
          clearImportForm()
          showImportDialog.value = false
          loadI18nErrorCodes()
          
        } else {
          if (!importForm.data.trim()) {
            ElMessage.error('请输入CSV数据')
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
                  validationErrors.push(`第${i + 1}行：需要满足以下条件之一：1) user_hint和operation至少一个不为空，或2) short_message和operation至少一个不为空`)
                }
                
                data.push(item)
              } else {
                validationErrors.push(`第${i + 1}行：数据格式不正确，需要6个字段`)
              }
            }
          }

          if (data.length === 0) {
            ElMessage.error('没有有效的CSV数据')
            return
          }
          
          // 如果有验证错误，显示错误信息
          if (validationErrors.length > 0) {
            ElMessage.error(`数据验证失败：\n${validationErrors.slice(0, 3).join('\n')}${validationErrors.length > 3 ? '\n...' : ''}`)
            return
          }

          const response = await api.i18nErrorCodes.batchImport({ data })
          
          // 检查响应中的错误信息
          if (response.data && response.data.errors && response.data.errors.length > 0) {
            const errorCount = response.data.errors.length
            const successCount = response.data.results ? response.data.results.length : 0
            
            if (successCount > 0) {
              ElMessage.warning(`导入部分成功：成功 ${successCount} 条，失败 ${errorCount} 条。请检查失败的数据。`)
              // 部分成功时也清空表单
              clearImportForm()
              showImportDialog.value = false
              loadI18nErrorCodes()
            } else {
              ElMessage.error(`导入失败：${errorCount} 条数据有错误。请检查数据格式。`)
            }
            
            // 显示前几个错误信息
            const errorMessages = response.data.errors.slice(0, 3).map(err => err.error || err.message).join('; ')
            if (errorMessages) {
              ElMessage.error(`错误详情：${errorMessages}`)
            }
            
            return
          }
          
          // 完全成功的情况
          const successCount = response.data && response.data.results ? response.data.results.length : 0
          ElMessage.success(`导入成功：共导入 ${successCount} 条数据`)
          clearImportForm()
          showImportDialog.value = false
          loadI18nErrorCodes()
        }
      } catch (error) {
        console.error('Import error:', error)
        if (error.response && error.response.data && error.response.data.message) {
          ElMessage.error(`导入失败：${error.response.data.message}`)
        } else {
          ElMessage.error(t('i18nErrorCodes.importFailed'))
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
          ElMessage.error('导出数据为空')
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
        ElMessage.error(t('i18nErrorCodes.exportFailed'))
      } finally {
        exporting.value = false
      }
    }

    // 语言显示名称
    const getLangDisplayName = (lang) => {
      const langMap = {
        zh: '中文',
        en: '英语',
        fr: '法语',
        de: '德语',
        es: '西班牙语',
        it: '意大利语',
        pt: '葡萄牙语',
        nl: '荷兰语',
        sk: '斯洛伐克语',
        ro: '罗马尼亚语',
        da: '丹麦语'
      }
      return langMap[lang] || lang
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
        ElMessage.error('组件加载失败')
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
      handleSearchInput,
      resetSearch,
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
      uploadRef
    }
  }
}
</script>

<style scoped>
.i18n-error-codes-container {
  padding: 20px;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.search-bar {
  margin-bottom: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
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