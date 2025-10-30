<template>
  <div class="error-codes-container">
    <!-- 搜索和操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('errorCodes.searchPlaceholder')"
          style="width: 180px"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-select
          v-model="selectedSubsystem"
          :placeholder="$t('errorCodes.selectSubsystem')"
          style="width: 180px; margin-left: 10px"
          clearable
          @change="handleSubsystemFilter"
        >
          <el-option
            v-for="subsystem in subsystemOptions"
            :key="subsystem.value"
            :label="subsystem.label"
            :value="subsystem.value"
          />
        </el-select>
      </div>
      
      <div class="action-section">
        <button 
          class="btn-primary"
          @click="openQueryDialog"
          aria-label="$t('errorCodes.queryCode')"
        >
          <i class="fas fa-search"></i>
          {{ $t('errorCodes.queryCode') }}
        </button>
        
        <button 
          v-if="canCreate"
          class="btn-secondary"
          @click="handleAdd"
          aria-label="$t('errorCodes.addErrorCode')"
        >
          <i class="fas fa-plus"></i>
          {{ $t('errorCodes.addErrorCode') }}
        </button>

        <button
          v-if="$store.getters['auth/hasPermission']('error_code:export')"
          class="btn-secondary"
          :class="{ 'btn-loading': exportLoading }"
          :disabled="exportLoading"
          @click="openExportDialog"
          aria-label="$t('errorCodes.exportCSV')"
        >
          <i class="fas fa-file-export"></i>
          {{ $t('errorCodes.exportCSV') }}
        </button>
      </div>
    </div>
    
    <!-- 故障码列表 -->
    <el-card class="list-card">
      <el-table
        :data="errorCodes"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="subsystem" :label="$t('errorCodes.subsystem')" width="100" />
        <el-table-column prop="code" :label="$t('errorCodes.code')" width="100" />
        <el-table-column :label="$t('i18nErrorCodes.userHint')" min-width="200">
          <template #default="{ row }">
            <div class="min-w-0">
              <ExplanationCell :text="[row.user_hint, row.operation].filter(Boolean).join(', ')" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="param1" :label="$t('errorCodes.formLabels.param1')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param1 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param1 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="param2" :label="$t('errorCodes.formLabels.param2')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param2 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param2 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="param3" :label="$t('errorCodes.formLabels.param3')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param3 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param3 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="param4" :label="$t('errorCodes.formLabels.param4')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param4 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param4 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="220" align="center" v-if="canUpdate || canDelete">
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
      
      <!-- 分页 -->
      <div class="pagination-wrapper">
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
    
    <!-- 导出CSV 弹窗 -->
    <el-dialog
      v-model="showExportDialog"
      :title="$t('errorCodes.exportCSVDialogTitle')"
      width="680px"
      :close-on-click-modal="false"
    >
      <el-form label-width="140px">
        <el-form-item :label="$t('errorCodes.exportFormat')">
          <el-radio-group v-model="exportFormat">
            <el-radio label="csv">{{ $t('errorCodes.csvFormat') }}</el-radio>
            <el-radio label="tsv">{{ $t('errorCodes.tsvFormat') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="$t('errorCodes.multilangColumnsOptional')">
          <el-select
            v-model="selectedExportLangs"
            multiple
            collapse-tags
            :max-collapse-tags="4"
            :placeholder="$t('errorCodes.selectLanguages')"
            style="width: 100%"
          >
            <el-option
              v-for="opt in languageOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showExportDialog = false">{{ $t('shared.cancel') }}</button>
          <button class="btn-primary" :class="{ 'btn-loading': exportLoading }" :disabled="exportLoading" @click="handleExportCSV">{{ $t('shared.export') }}</button>
        </span>
      </template>
    </el-dialog>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="getDialogTitle()"
      width="1000px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="errorCodeFormRef"
        :model="errorCodeForm"
        :rules="rules"
        label-width="140px"
        class="error-code-form"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.subsystem')" prop="subsystem">
              <el-select v-model="errorCodeForm.subsystem" :placeholder="$t('errorCodes.selectSubsystem')" @change="handleSubsystemChange">
                <el-option v-for="option in subsystemOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.code')" prop="code">
              <el-input 
                v-model="errorCodeForm.code" 
                :placeholder="$t('errorCodes.formLabels.codePlaceholder')" 
                @input="handleCodeChange"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 同步选项 -->
        <el-row v-if="showSyncOption">
          <el-col :span="24">
            <el-form-item :label="$t('errorCodes.formLabels.syncOption')">
              <el-checkbox v-model="syncToRemote" v-if="isLocalSubsystem">
                {{ $t('errorCodes.formLabels.syncToRemote') }} ({{ getRemoteSubsystemLabel() }})
              </el-checkbox>
              <el-checkbox v-model="syncToLocal" v-if="isRemoteSubsystem">
                {{ $t('errorCodes.formLabels.syncToLocal') }} ({{ getLocalSubsystemLabel() }})
              </el-checkbox>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item :label="$t('errorCodes.formLabels.optionSettings')">
          <el-checkbox-group v-model="booleanOptions" @change="handleBooleanOptionsChange" class="boolean-options-group">
            <el-checkbox label="is_axis_error">{{ $t('errorCodes.checkboxLabels.isAxisError') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="is_arm_error">{{ $t('errorCodes.checkboxLabels.isArmError') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="for_expert">{{ $t('errorCodes.checkboxLabels.forExpert') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="for_novice">{{ $t('errorCodes.checkboxLabels.forNovice') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="related_log">{{ $t('errorCodes.checkboxLabels.relatedLog') }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
        <el-form-item :label="$t('errorCodes.formLabels.shortMessageZh')" prop="short_message">
          <el-input v-model="errorCodeForm.short_message" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
        <el-form-item :label="$t('errorCodes.formLabels.shortMessageEn')" prop="short_message_en">
          <el-input v-model="errorCodeForm.short_message_en" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
        <el-form-item :label="$t('errorCodes.formLabels.userHintZh')" prop="user_hint">
          <el-input v-model="errorCodeForm.user_hint" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
          <el-col :span="12">
        <el-form-item :label="$t('errorCodes.formLabels.userHintEn')" prop="user_hint_en">
          <el-input v-model="errorCodeForm.user_hint_en" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
        <el-form-item :label="$t('errorCodes.formLabels.operationZh')" prop="operation">
          <el-input v-model="errorCodeForm.operation" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
          <el-col :span="12">
        <el-form-item :label="$t('errorCodes.formLabels.operationEn')" prop="operation_en">
          <el-input v-model="errorCodeForm.operation_en" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param1')" prop="param1">
              <el-input v-model="errorCodeForm.param1" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param2')" prop="param2">
              <el-input v-model="errorCodeForm.param2" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param3')" prop="param3">
              <el-input v-model="errorCodeForm.param3" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param4')" prop="param4">
              <el-input v-model="errorCodeForm.param4" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.category')" prop="category">
              <el-select v-model="errorCodeForm.category" :placeholder="$t('errorCodes.validation.categoryRequired')">
                <el-option :label="$t('errorCodes.categoryOptions.software')" value="software" />
                <el-option :label="$t('errorCodes.categoryOptions.hardware')" value="hardware" />
                <el-option :label="$t('errorCodes.categoryOptions.logRecord')" value="logRecord" />
                <el-option :label="$t('errorCodes.categoryOptions.operationTip')" value="operationTip" />
                <el-option :label="$t('errorCodes.categoryOptions.safetyProtection')" value="safetyProtection" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.level')" prop="level">
              <el-input v-model="errorCodeForm.level" readonly :placeholder="$t('errorCodes.formLabels.levelPlaceholder')" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.analysisCategories')" prop="analysisCategories">
              <el-select 
                v-model="errorCodeForm.analysisCategories" 
                multiple 
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="3"
                popper-class="analysis-categories-tooltip"
                :placeholder="$t('errorCodes.formLabels.analysisCategoriesPlaceholder')"
                style="width: 100%"
              >
                <el-option 
                  v-for="cat in analysisCategoryOptions" 
                  :key="cat.id" 
                  :label="cat.displayName" 
                  :value="cat.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.solution')" prop="solution">
              <el-input 
                :value="getSolutionDisplay(errorCodeForm.solution)" 
                readonly 
                :placeholder="$t('errorCodes.formLabels.solutionPlaceholder')" 
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item :label="$t('errorCodes.formLabels.detail')" prop="detail">
          <el-input v-model="errorCodeForm.detail" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item :label="$t('errorCodes.formLabels.method')" prop="method">
          <el-input v-model="errorCodeForm.method" type="textarea" :rows="3" />
            </el-form-item>

        <el-form-item :label="$t('errorCodes.formLabels.techSolution')" prop="tech_solution">
          <el-input v-model="errorCodeForm.tech_solution" type="textarea" :rows="3" />
            </el-form-item>

        <el-form-item :label="$t('errorCodes.formLabels.explanation')" prop="explanation">
          <el-input v-model="errorCodeForm.explanation" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showAddDialog = false">{{ $t('errorCodes.buttonTexts.cancel') }}</button>
          <button class="btn-primary" :class="{ 'btn-loading': saving }" :disabled="saving" @click="handleSave">
            {{ getSaveButtonText() }}
          </button>
        </span>
      </template>
    </el-dialog>
    <!-- 故障码查询弹窗 -->
    <el-dialog
      v-model="showQueryDialog"
      :title="$t('errorCodes.queryCode')"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="queryForm" label-width="140px">
        <el-form-item :label="$t('errorCodes.fullCode')">
          <el-input 
            v-model="queryForm.fullCode" 
            :placeholder="$t('errorCodes.fullCodePlaceholder')" 
            clearable
          />
        </el-form-item>
        <el-form-item>
          <div class="query-buttons">
            <button type="button" class="btn-primary" :class="{ 'btn-loading': queryLoading }" :disabled="queryLoading" @click="handleQuery">{{ $t('shared.search') }}</button>
            <button type="button" class="btn-secondary" @click="resetQuery">{{ $t('shared.reset') }}</button>
          </div>
        </el-form-item>
      </el-form>

      <el-card v-if="queryResult" class="mt-2">
        <el-descriptions :column="1" border :title="$t('errorCodes.queryResult.resultInfo')" label-width="140px">
          <el-descriptions-item :label="$t('errorCodes.queryResult.explanation')">
            {{ buildPrefixedExplanation(queryResult, foundRecord) }}
          </el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <el-descriptions :column="1" border :title="$t('errorCodes.queryResult.paramMeanings')" label-width="140px">
          <el-descriptions-item :label="$t('errorCodes.formLabels.param1')">{{ foundRecord?.param1 || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('errorCodes.formLabels.param2')">{{ foundRecord?.param2 || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('errorCodes.formLabels.param3')">{{ foundRecord?.param3 || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('errorCodes.formLabels.param4')">{{ foundRecord?.param4 || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <el-descriptions :column="1" border :title="$t('errorCodes.queryResult.moreInfo')" label-width="140px">
          <el-descriptions-item :label="$t('errorCodes.queryResult.detail')">{{ foundRecord?.detail || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('errorCodes.queryResult.method')">{{ foundRecord?.method || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('errorCodes.queryResult.techSolution')">{{ foundRecord?.tech_solution || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('errorCodes.queryResult.category')">{{ foundRecord?.category || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showQueryDialog = false">{{ $t('shared.cancel') }}</button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, watch, onBeforeUnmount, h, resolveComponent } from 'vue'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../api'

export default {
  name: 'ErrorCodes',
  components: {
    Search,
    Plus,
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
    const { t, locale } = useI18n()
    
    // 响应式数据
    const loading = ref(false)
    const exportLoading = ref(false)
    const showExportDialog = ref(false)
    const saving = ref(false)
    const showAddDialog = ref(false)
    const showQueryDialog = ref(false)
    const editingErrorCode = ref(null)
    const searchQuery = ref('')
    const selectedSubsystem = ref('')
    const currentPage = ref(1)
    const pageSize = ref(10)
    const errorCodeFormRef = ref(null)
    const queryLoading = ref(false)
    const queryForm = reactive({ fullCode: '' })
    const queryResult = ref(null)
    const foundRecord = ref(null)
    const analysisCategories = ref([])
    const booleanOptions = ref([])
    const selectedExportLangs = ref([])
    const exportFormat = ref('csv')
    
    // 计算当前语言
    const currentLocale = computed(() => locale.value || 'zh-CN')
    
    // 根据当前语言获取分析分类的显示名称
    const getCategoryDisplayName = (cat) => {
      if (!cat) return ''
      return currentLocale.value === 'zh-CN' ? (cat.name_zh || cat.name_en) : (cat.name_en || cat.name_zh)
    }
    
    // 计算属性：生成带有多语言名称的分析分类选项
    const analysisCategoryOptions = computed(() => {
      return analysisCategories.value.map(cat => ({
        ...cat,
        displayName: getCategoryDisplayName(cat)
      }))
    })
    const languageOptions = [
      { label: t('shared.languageOptions.zh'), value: 'zh' },
      { label: t('shared.languageOptions.en'), value: 'en' },
      { label: t('shared.languageOptions.fr'), value: 'fr' },
      { label: t('shared.languageOptions.de'), value: 'de' },
      { label: t('shared.languageOptions.es'), value: 'es' },
      { label: t('shared.languageOptions.it'), value: 'it' },
      { label: t('shared.languageOptions.pt'), value: 'pt' },
      { label: t('shared.languageOptions.nl'), value: 'nl' },
      { label: t('shared.languageOptions.sk'), value: 'sk' },
      { label: t('shared.languageOptions.ro'), value: 'ro' },
      { label: t('shared.languageOptions.da'), value: 'da' }
    ]
    
    const subsystemOptions = computed(() => [
      { label: t('shared.subsystemOptions.1'), value: '1' },
      { label: t('shared.subsystemOptions.2'), value: '2' },
      { label: t('shared.subsystemOptions.3'), value: '3' },
      { label: t('shared.subsystemOptions.4'), value: '4' },
      { label: t('shared.subsystemOptions.5'), value: '5' },
      { label: t('shared.subsystemOptions.6'), value: '6' },
      { label: t('shared.subsystemOptions.7'), value: '7' },
      { label: t('shared.subsystemOptions.8'), value: '8' },
      { label: t('shared.subsystemOptions.9'), value: '9' },
      { label: t('shared.subsystemOptions.A'), value: 'A' }
    ])
    
    // 同步相关变量
    const syncToRemote = ref(false)
    const syncToLocal = ref(false)
    
         const errorCodeForm = reactive({
       subsystem: '',
       code: '',
       is_axis_error: false,
       is_arm_error: false,
       short_message: '',
       short_message_en: '',
       user_hint: '',
       user_hint_en: '',
       operation: '',
       operation_en: '',
       detail: '',
       method: '',
       param1: '',
       param2: '',
       param3: '',
       param4: '',
       solution: '',
       for_expert: true,
       for_novice: true,
       related_log: false,
       stop_report: '',
       level: '',
       tech_solution: '',
       explanation: '',
      category: '',
      analysisCategories: []
     })
    
    // 动态验证规则
    const rules = computed(() => {
      const baseRules = {
        subsystem: [
          { required: true, message: t('errorCodes.validation.subsystemRequired'), trigger: 'change' }
        ],
        code: [
          { required: true, message: t('errorCodes.validation.codeRequired'), trigger: 'blur' },
          { pattern: /^0X[0-9A-F]{3}[ABCDE]$/, message: t('errorCodes.validation.codeFormat'), trigger: 'blur' }
        ],
        detail: [
          { required: true, message: t('errorCodes.validation.detailRequired'), trigger: 'blur' }
        ],
        method: [
          { required: true, message: t('errorCodes.validation.methodRequired'), trigger: 'blur' }
        ],
        param1: [
          { required: true, message: t('errorCodes.validation.param1Required'), trigger: 'blur' }
        ],
        param2: [
          { required: true, message: t('errorCodes.validation.param2Required'), trigger: 'blur' }
        ],
        param3: [
          { required: true, message: t('errorCodes.validation.param3Required'), trigger: 'blur' }
        ],
        param4: [
          { required: true, message: t('errorCodes.validation.param4Required'), trigger: 'blur' }
        ],
        category: [
          { required: true, message: t('errorCodes.validation.categoryRequired'), trigger: 'change' }
        ]
      };

      // 动态验证中文字段
      const hasOperation = errorCodeForm.operation && errorCodeForm.operation.trim() !== '';
      
      baseRules.short_message = [
        { 
          required: !hasOperation, 
          message: t('errorCodes.validation.shortMessageCannotBothEmpty'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.user_hint = [
        { 
          required: !hasOperation, 
          message: t('errorCodes.validation.userHintCannotBothEmpty'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.operation = [
        { 
          required: !(errorCodeForm.short_message && errorCodeForm.short_message.trim() !== '') && 
                    !(errorCodeForm.user_hint && errorCodeForm.user_hint.trim() !== ''), 
          message: t('errorCodes.validation.atLeastTwoRequired'), 
          trigger: 'blur' 
        }
      ];

      // 动态验证英文字段
      const hasOperationEn = errorCodeForm.operation_en && errorCodeForm.operation_en.trim() !== '';
      
      baseRules.short_message_en = [
        { 
          required: !hasOperationEn, 
          message: t('errorCodes.validation.shortMessageEnCannotBothEmpty'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.user_hint_en = [
        { 
          required: !hasOperationEn, 
          message: t('errorCodes.validation.userHintEnCannotBothEmpty'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.operation_en = [
        { 
          required: !(errorCodeForm.short_message_en && errorCodeForm.short_message_en.trim() !== '') && 
                    !(errorCodeForm.user_hint_en && errorCodeForm.user_hint_en.trim() !== ''), 
          message: t('errorCodes.validation.atLeastTwoEnRequired'), 
          trigger: 'blur' 
        }
      ];

      return baseRules;
    });
    
    // 根据故障码自动判断故障等级和处理措施
    const analyzeErrorCode = (code) => {
      if (!code) return { level: t('errorCodes.levelTypes.none'), solution: 'tips' };
      
      // 解析故障码：0X + 3位16进制数字 + A/B/C/D/E
      const match = code.match(/^0X([0-9A-F]{3})([ABCDE])$/);
      if (!match) return { level: t('errorCodes.levelTypes.none'), solution: 'tips' };
      
      const [, hexPart, severity] = match;
      
      // 根据故障码末尾字母判断等级
      let levelKey = 'none';
      switch (severity) {
        case 'A': // A类故障：高级
          levelKey = 'high';
          break;
        case 'B': // B类故障：中级
          levelKey = 'medium';
          break;
        case 'C': // C类故障：低级
          levelKey = 'low';
          break;
        default: // D、E类故障：无
          levelKey = 'none';
          break;
      }
      
      // 根据故障码末尾字母判断处理措施
      let solution = 'tips';
      switch (severity) {
        case 'A': // A类故障：recoverable 可恢复故障
          solution = 'recoverable';
          break;
        case 'B': // B类故障：recoverable 可恢复故障
          solution = 'recoverable';
          break;
        case 'C': // C类故障：ignorable 可忽略故障
          solution = 'ignorable';
          break;
        case 'D': // D类故障：tips 提示信息
          solution = 'tips';
          break;
        case 'E': // E类故障：log 日志记录
          solution = 'log';
          break;
      }
      
      return { level: t(`errorCodes.levelTypes.${levelKey}`), solution };
    };
    
    // 故障码输入时自动计算等级和处理措施
    const handleCodeChange = () => {
      const { level, solution } = analyzeErrorCode(errorCodeForm.code);
      errorCodeForm.level = level;
      errorCodeForm.solution = solution;
    };
    
    // 获取处理措施的中文显示
    const getSolutionDisplay = (solution) => {
      const solutionMap = {
        'recoverable': t('errorCodes.solutionTypes.recoverable'),
        'unrecoverable': t('errorCodes.solutionTypes.unrecoverable'),
        'ignorable': t('errorCodes.solutionTypes.ignorable'),
        'tips': t('errorCodes.solutionTypes.tips'),
        'log': t('errorCodes.solutionTypes.log')
      };
      return solutionMap[solution] || solution;
    };
    
    // 计算属性
    const errorCodes = computed(() => store.getters['errorCodes/errorCodesList'])
    const total = computed(() => store.getters['errorCodes/totalCount'])
    const canCreate = computed(() => store.getters['auth/hasPermission']('error_code:create'))
    const canUpdate = computed(() => store.getters['auth/hasPermission']('error_code:update'))
    const canDelete = computed(() => store.getters['auth/hasPermission']('error_code:delete'))
    
    // 同步相关计算属性
    const showSyncOption = computed(() => {
      const subsystem = errorCodeForm.subsystem
      return subsystem === '1' || subsystem === '8' || 
             subsystem === '3' || subsystem === '9' || 
             subsystem === '5' || subsystem === 'A'
    })
    
    const isLocalSubsystem = computed(() => {
      const subsystem = errorCodeForm.subsystem
      return subsystem === '1' || subsystem === '3' || subsystem === '5'
    })
    
    const isRemoteSubsystem = computed(() => {
      const subsystem = errorCodeForm.subsystem
      return subsystem === '8' || subsystem === '9' || subsystem === 'A'
    })
    
    
    
    // 加载分析分类
    const loadAnalysisCategories = async () => {
      try {
        const response = await api.analysisCategories.getList({
          is_active: true
        })
        if (response.data.success) {
          analysisCategories.value = response.data.categories || []
          // 设置默认的"未分类"选项
          setDefaultNullCategory()
        }
      } catch (error) {
        console.error('Failed to load analysis categories:', error)
        ElMessage.error(t('errorCodes.message.loadAnalysisCategoriesFailed'))
      }
    }
    
    // 设置默认的"未分类"选项
    const setDefaultNullCategory = () => {
      // 查找"未分类"（Null）分类
      const nullCategory = analysisCategories.value.find(cat => 
        cat.category_key === 'Null' || cat.name_zh === t('errorCodes.defaultCategoryName')
      )
      
      // 如果找到且当前表单的分析分类为空，则设置为默认值
      if (nullCategory && (!errorCodeForm.analysisCategories || errorCodeForm.analysisCategories.length === 0)) {
        errorCodeForm.analysisCategories = [nullCategory.id]
      }
    }
    
    // 处理布尔选项变化
    const handleBooleanOptionsChange = (values) => {
      // 根据checkbox的选中状态更新表单值
      errorCodeForm.is_axis_error = values.includes('is_axis_error')
      errorCodeForm.is_arm_error = values.includes('is_arm_error')
      errorCodeForm.for_expert = values.includes('for_expert')
      errorCodeForm.for_novice = values.includes('for_novice')
      errorCodeForm.related_log = values.includes('related_log')
    }
    
    // 从表单值初始化布尔选项
    const initBooleanOptions = () => {
      const options = []
      if (errorCodeForm.is_axis_error) options.push('is_axis_error')
      if (errorCodeForm.is_arm_error) options.push('is_arm_error')
      if (errorCodeForm.for_expert) options.push('for_expert')
      if (errorCodeForm.for_novice) options.push('for_novice')
      if (errorCodeForm.related_log) options.push('related_log')
      booleanOptions.value = options
    }
    
    // 方法
    const loadErrorCodes = async () => {
      try {
        loading.value = true
        await store.dispatch('errorCodes/fetchErrorCodes', {
          page: currentPage.value,
          limit: pageSize.value,
          keyword: searchQuery.value,
          subsystem: selectedSubsystem.value
        })
      } catch (error) {
        ElMessage.error(t('errorCodes.message.loadFailed'))
      } finally {
        loading.value = false
      }
    }
    
    const handleSearch = () => {
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleSubsystemFilter = () => {
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadErrorCodes()
    }

    const parseFilename = (contentDisposition) => {
      try {
        if (!contentDisposition) return ''
        const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/)
        const raw = decodeURIComponent(match?.[1] || match?.[2] || '')
        return raw || ''
      } catch { return '' }
    }

    const openExportDialog = () => {
      showExportDialog.value = true
    }

    const handleExportCSV = async () => {
      try {
        exportLoading.value = true
        const languages = selectedExportLangs.value.join(',')
        const resp = await api.errorCodes.exportCSV(languages, exportFormat.value)
        const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const serverName = parseFilename(resp.headers?.['content-disposition'])
        a.download = serverName || 'error_codes.csv'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        ElMessage.success(t('errorCodes.message.exportSuccess'))
        showExportDialog.value = false
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || t('errorCodes.message.exportFailed'))
      } finally {
        exportLoading.value = false
      }
    }
    
         const resetForm = () => {
       Object.keys(errorCodeForm).forEach(key => {
         if (typeof errorCodeForm[key] === 'boolean') {
           // 专家模式和初学者模式默认为true，其他布尔值默认为false
           if (key === 'for_expert' || key === 'for_novice') {
             errorCodeForm[key] = true
           } else {
             errorCodeForm[key] = false
           }
        } else if (key === 'analysisCategories') {
          errorCodeForm[key] = []
         } else {
           errorCodeForm[key] = ''
         }
       })
       editingErrorCode.value = null
       // 重置同步选项
       syncToRemote.value = false
       syncToLocal.value = false
       if (errorCodeFormRef.value) {
         errorCodeFormRef.value.clearValidate()
       }
     }
    
    const handleAdd = () => {
      resetForm()
      initBooleanOptions()
      setDefaultNullCategory()
      showAddDialog.value = true
    }
    const openQueryDialog = () => {
      showQueryDialog.value = true
    }
    
    const handleEdit = (row) => {
      editingErrorCode.value = row
      
      // 从 i18nContents 中提取英文内容
      const enContent = row.i18nContents?.find(i18n => i18n.lang === 'en')
      
      Object.keys(errorCodeForm).forEach(key => {
        if (key === 'analysisCategories') {
          // 从关联的分析分类中提取 ID 数组
          errorCodeForm[key] = row.analysisCategories?.map(cat => cat.id) || []
        } else if (key === 'short_message_en') {
          // 从 i18n 表提取英文精简提示
          errorCodeForm[key] = enContent?.short_message || ''
        } else if (key === 'user_hint_en') {
          // 从 i18n 表提取英文用户提示
          errorCodeForm[key] = enContent?.user_hint || ''
        } else if (key === 'operation_en') {
          // 从 i18n 表提取英文操作信息
          errorCodeForm[key] = enContent?.operation || ''
        } else if (row[key] !== undefined) {
          errorCodeForm[key] = row[key]
        }
      })
      // 重置同步选项
      syncToRemote.value = false
      syncToLocal.value = false
      // 初始化布尔选项
      initBooleanOptions()
      showAddDialog.value = true
    }
    
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm(
          t('errorCodes.message.deleteConfirm', { code: row.code }),
          t('shared.messages.deleteConfirmTitle'),
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        
        await store.dispatch('errorCodes/deleteErrorCode', row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadErrorCodes()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error(t('shared.messages.deleteFailed'))
        }
      }
    }
    
    // 获取弹窗标题
    const getDialogTitle = () => {
      if (!editingErrorCode.value) {
        // 添加模式
        if (isLocalSubsystem.value) {
          return t('errorCodes.dialogTitles.createLocal')
        } else if (isRemoteSubsystem.value) {
          return t('errorCodes.dialogTitles.createRemote')
        } else {
          return t('errorCodes.dialogTitles.createGeneral')
        }
      } else {
        // 编辑模式
        if (isLocalSubsystem.value) {
          return t('errorCodes.dialogTitles.updateLocal')
        } else if (isRemoteSubsystem.value) {
          return t('errorCodes.dialogTitles.updateRemote')
        } else {
          return t('errorCodes.dialogTitles.updateGeneral')
        }
      }
    }
    // 归一化故障码：支持 141010A / 1010A / 0X010A
    const normalizeFullCode = (input) => {
      if (!input) return ''
      const raw = String(input).trim().toUpperCase()
      if (raw.length >= 5) {
        const tail4 = raw.slice(-4)
        if (/^[0-9A-F]{3}[A-E]$/.test(tail4)) {
          return '0X' + tail4
        }
      }
      if (!raw.startsWith('0X') && /^[0-9A-F]{3}[A-E]$/.test(raw)) {
        return '0X' + raw
      }
      return raw
    }
    const handleQuery = async () => {
      const full = queryForm.fullCode?.trim()
      if (!full) {
        ElMessage.warning(t('errorCodes.message.queryWarning'))
        return
      }
      queryLoading.value = true
      queryResult.value = null
      foundRecord.value = null
      try {
        const payload = { code: full }
        const previewResp = await api.explanations.preview(payload)
        queryResult.value = previewResp.data
        let subsystem = queryResult.value?.subsystem || null
        if (!subsystem && full.length >= 5) {
          const s = full.charAt(0)
          if (/^[1-9A]$/.test(s)) subsystem = s
        }
        const codeOnly = normalizeFullCode(full)
        if (subsystem) {
          try {
            const recResp = await api.errorCodes.getByCodeAndSubsystem(codeOnly, subsystem)
            foundRecord.value = recResp?.data?.errorCode || null
          } catch (_) {
            foundRecord.value = null
          }
        }
      } catch (e) {
        // 404错误已经在API拦截器中处理，这里只处理其他错误
        if (e?.response?.status !== 404) {
          ElMessage.error(e?.response?.data?.message || t('errorCodes.message.queryFailed'))
        }
      } finally {
        queryLoading.value = false
      }
    }
    const resetQuery = () => {
      queryForm.fullCode = ''
      queryResult.value = null
      foundRecord.value = null
    }

    // 构造与释义相同前缀的“解释”文本：前缀 + 用户提示/操作信息
    const buildPrefixedExplanation = (preview, record) => {
      if (!preview) return '-'
      const backendPrefix = preview?.prefix || ''
      const main = [record?.user_hint, record?.operation].filter(Boolean).join(' ')
      const text = main || '-'
      if (backendPrefix) return `${backendPrefix} ${text}`
      return text
    }
    
    // 获取远程子系统标签
    const getRemoteSubsystemLabel = () => {
      return t(`errorCodes.remoteSubsystemLabels.${errorCodeForm.subsystem}`) || ''
    }
    
    // 获取本地子系统标签
    const getLocalSubsystemLabel = () => {
      return t(`errorCodes.localSubsystemLabels.${errorCodeForm.subsystem}`) || ''
    }
    
    // 获取保存按钮文本
    const getSaveButtonText = () => {
      return editingErrorCode.value ? t('errorCodes.buttonTexts.update') : t('errorCodes.buttonTexts.create')
    }
    
    // 处理子系统变化
    const handleSubsystemChange = () => {
      // 重置同步选项
      syncToRemote.value = false
      syncToLocal.value = false
    }
    
    // 获取对应的子系统值
    const getCorrespondingSubsystem = (currentSubsystem) => {
      const subsystemMap = {
        '1': '8', // 本地运动控制 -> 远程运动控制
        '8': '1', // 远程运动控制 -> 本地运动控制
        '3': '9', // 本地医生控制台 -> 远程医生控制台
        '9': '3', // 远程医生控制台 -> 本地医生控制台
        '5': 'A', // 本地驱动器 -> 远程驱动器
        'A': '5'  // 远程驱动器 -> 本地驱动器
      }
      return subsystemMap[currentSubsystem]
    }
    
    const handleSave = async () => {
      try {
        await errorCodeFormRef.value.validate()
        saving.value = true
        
        const savePromises = []
        
        // 主故障码保存
        if (editingErrorCode.value) {
          savePromises.push(
            store.dispatch('errorCodes/updateErrorCode', {
              id: editingErrorCode.value.id,
              data: errorCodeForm
            })
          )
        } else {
          savePromises.push(
            store.dispatch('errorCodes/createErrorCode', errorCodeForm)
          )
        }
        
        // 同步保存
        if (syncToRemote.value && isLocalSubsystem.value) {
          const remoteSubsystem = getCorrespondingSubsystem(errorCodeForm.subsystem)
          const remoteData = { ...errorCodeForm, subsystem: remoteSubsystem }
          
          if (editingErrorCode.value) {
            // 编辑模式：查找并更新对应的远程故障码
            savePromises.push(
              store.dispatch('errorCodes/updateErrorCodeByCode', {
                code: errorCodeForm.code,
                subsystem: remoteSubsystem,
                data: remoteData
              })
            )
          } else {
            // 添加模式：创建远程故障码
            savePromises.push(
              store.dispatch('errorCodes/createErrorCode', remoteData)
            )
          }
        }
        
        if (syncToLocal.value && isRemoteSubsystem.value) {
          const localSubsystem = getCorrespondingSubsystem(errorCodeForm.subsystem)
          const localData = { ...errorCodeForm, subsystem: localSubsystem }
          
          if (editingErrorCode.value) {
            // 编辑模式：查找并更新对应的本地故障码
            savePromises.push(
              store.dispatch('errorCodes/updateErrorCodeByCode', {
                code: errorCodeForm.code,
                subsystem: localSubsystem,
                data: localData
              })
            )
          } else {
            // 添加模式：创建本地故障码
            savePromises.push(
              store.dispatch('errorCodes/createErrorCode', localData)
            )
          }
        }
        
        await Promise.all(savePromises)
        
        const action = editingErrorCode.value ? t('errorCodes.message.updateSuccess') : t('errorCodes.message.createSuccess')
        ElMessage.success(action)
        
        showAddDialog.value = false
        resetForm()
        loadErrorCodes()
      } catch (error) {
        if (error.response && error.response.data && error.response.data.errors) {
          ElMessage.error(error.response.data.errors.join(', '))
        } else {
          ElMessage.error(t('errorCodes.message.saveFailed'))
        }
      } finally {
        saving.value = false
      }
    }
    
    // 监听字段变化，重新验证表单
    watch(
      [
        () => errorCodeForm.short_message,
        () => errorCodeForm.user_hint,
        () => errorCodeForm.operation,
        () => errorCodeForm.short_message_en,
        () => errorCodeForm.user_hint_en,
        () => errorCodeForm.operation_en
      ],
      () => {
        // 当相关字段变化时，重新验证表单
        if (errorCodeFormRef.value) {
          errorCodeFormRef.value.clearValidate([
            'short_message',
            'user_hint', 
            'operation',
            'short_message_en',
            'user_hint_en',
            'operation_en'
          ])
        }
      }
    )
    
    // 生命周期
    onMounted(() => {
      loadErrorCodes()
      loadAnalysisCategories()
    })
    
    return {
       loading,
       saving,
       showAddDialog,
       showQueryDialog,
       editingErrorCode,
       searchQuery,
       selectedSubsystem,
       subsystemOptions,
       currentPage,
       pageSize,
       errorCodeFormRef,
       queryLoading,
       queryForm,
       queryResult,
       foundRecord,
       errorCodeForm,
       rules,
       errorCodes,
       total,
       canCreate,
       canUpdate,
       canDelete,
       analysisCategories,
       analysisCategoryOptions,
       booleanOptions,
      exportLoading,
      showExportDialog,
      selectedExportLangs,
      exportFormat,
      languageOptions,
      openExportDialog,
      handleExportCSV,
       // 同步相关变量
       syncToRemote,
       syncToLocal,
       showSyncOption,
       isLocalSubsystem,
       isRemoteSubsystem,
       handleSearch,
       handleSubsystemFilter,
       handleSizeChange,
       handleCurrentChange,
       handleAdd,
       openQueryDialog,
       handleEdit,
       handleDelete,
       handleSave,
       handleCodeChange,
       getSolutionDisplay,
       buildPrefixedExplanation,
       getCategoryDisplayName,
       handleQuery,
       resetQuery,
       handleBooleanOptionsChange,
       // 同步相关方法
       getDialogTitle,
       getRemoteSubsystemLabel,
       getLocalSubsystemLabel,
       handleSubsystemChange,
       getSaveButtonText
     }
  }
}
</script>

<style scoped>
.error-codes-container {
  padding: 5px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.action-section {
  display: flex;
  gap: 10px;
}

.list-card {
  border-radius: 8px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.error-code-form {
  max-height: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.query-buttons {
  display: flex;
  gap: 12px;
}

/* 避免弹窗出现横向滚动条，保留右侧安全间距 */
:deep(.el-dialog__body) {
  overflow-x: hidden;
}

/* 确保输入控件不会超出容器宽度 */
:deep(.error-code-form .el-input),
:deep(.error-code-form .el-textarea__inner),
:deep(.error-code-form .el-select),
:deep(.error-code-form .el-radio-group) {
  box-sizing: border-box;
  max-width: 100%;
}

/* 让提示信息列的 tooltip 在表格外也能显示，沿用批量分析样式 */
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

/* 布尔选项的checkbox样式 */
.boolean-options-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

:deep(.boolean-options-group .el-checkbox) {
  margin-right: 0;
}

/* checkbox之间的分割线 */
.checkbox-divider {
  display: inline-block;
  width: 1px;
  height: 16px;
  background-color: #dcdfe6;
  margin: 0 16px;
  vertical-align: middle;
}

/* 日志分析分类tooltip多行显示 */
.analysis-categories-tooltip {
  max-width: 500px !important;
}

.analysis-categories-tooltip .el-select__tags-text {
  display: inline-block;
  max-width: none !important;
}

.analysis-categories-tooltip .el-tooltip__popper {
  max-width: 500px !important;
}
</style>

<style>
/* 全局样式：分析分类tooltip */
.analysis-categories-tooltip.el-popper {
  max-width: 500px !important;
}

.analysis-categories-tooltip .el-tag {
  margin: 2px 4px !important;
}
</style>