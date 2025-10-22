<template>
  <div class="error-codes-container">
    <!-- 搜索和操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          placeholder="搜索故障码..."
          style="width: 300px"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
      
             <div class="action-section">
        <el-button 
          type="success" 
          @click="openQueryDialog"
        >
          故障码查询
        </el-button>
        
        <el-button 
          v-if="canCreate"
          type="primary" 
          @click="handleAdd"
        >
          <el-icon><Plus /></el-icon>
          添加故障码
        </el-button>
        

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
        <el-table-column prop="subsystem" label="子系统" width="80" />
        <el-table-column prop="code" label="故障码" width="120" />
        <el-table-column label="提示信息" min-width="140">
          <template #default="{ row }">
            <ExplanationCell :text="[row.user_hint, row.operation].filter(Boolean).join(', ')" />
          </template>
        </el-table-column>
        <el-table-column prop="param1" label="参数1" min-width="100">
          <template #default="{ row }">
            <ExplanationCell :text="String(row.param1 ?? '')" :always="true" />
          </template>
        </el-table-column>
        <el-table-column prop="param2" label="参数2" min-width="100">
          <template #default="{ row }">
            <ExplanationCell :text="String(row.param2 ?? '')" :always="true" />
          </template>
        </el-table-column>
        <el-table-column prop="param3" label="参数3" min-width="100">
          <template #default="{ row }">
            <ExplanationCell :text="String(row.param3 ?? '')" :always="true" />
          </template>
        </el-table-column>
        <el-table-column prop="param4" label="参数4" min-width="100">
          <template #default="{ row }">
            <ExplanationCell :text="String(row.param4 ?? '')" :always="true" />
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column label="操作" width="180" v-if="canUpdate || canDelete">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              @click="handleEdit(row)"
              v-if="canUpdate"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              size="small"
              @click="handleDelete(row)"
              v-if="canDelete"
            >
              删除
            </el-button>
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
            <el-form-item label="子系统" prop="subsystem">
              <el-select v-model="errorCodeForm.subsystem" placeholder="请选择子系统" @change="handleSubsystemChange">
                <el-option label="01：运动控制软件" value="1" />
                <el-option label="02：人机交互软件" value="2" />
                <el-option label="03：医生控制台软件" value="3" />
                <el-option label="04：手术台车软件" value="4" />
                <el-option label="05：驱动器软件" value="5" />
                <el-option label="06：图像软件" value="6" />
                <el-option label="07：工具工厂软件" value="7" />
                <el-option label="08：远程运动控制软件" value="8" />
                <el-option label="09：远程医生控制台软件" value="9" />
                <el-option label="0A：远程驱动器软件" value="A" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="故障码" prop="code">
              <el-input 
                v-model="errorCodeForm.code" 
                placeholder="格式：0X010A" 
                @input="handleCodeChange"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 同步选项 -->
        <el-row v-if="showSyncOption">
          <el-col :span="24">
            <el-form-item label="同步选项">
              <el-checkbox v-model="syncToRemote" v-if="isLocalSubsystem">
                同步到远程端 ({{ getRemoteSubsystemLabel() }})
              </el-checkbox>
              <el-checkbox v-model="syncToLocal" v-if="isRemoteSubsystem">
                同步到本地端 ({{ getLocalSubsystemLabel() }})
              </el-checkbox>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="选项设置">
          <el-checkbox-group v-model="booleanOptions" @change="handleBooleanOptionsChange" class="boolean-options-group">
            <el-checkbox label="is_axis_error">是否轴错误</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="is_arm_error">是否臂错误</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="for_expert">专家模式</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="for_novice">初学者模式</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="related_log">相关日志</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
        <el-form-item label="精简提示信息(中文)" prop="short_message">
          <el-input v-model="errorCodeForm.short_message" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
        <el-form-item label="精简提示信息(英文)" prop="short_message_en">
          <el-input v-model="errorCodeForm.short_message_en" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
        <el-form-item label="给用户的提示信息(中文)" prop="user_hint">
          <el-input v-model="errorCodeForm.user_hint" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
          <el-col :span="12">
        <el-form-item label="给用户的提示信息(英文)" prop="user_hint_en">
          <el-input v-model="errorCodeForm.user_hint_en" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
        <el-form-item label="操作信息(中文)" prop="operation">
          <el-input v-model="errorCodeForm.operation" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
          <el-col :span="12">
        <el-form-item label="操作信息(英文)" prop="operation_en">
          <el-input v-model="errorCodeForm.operation_en" type="textarea" :rows="2" />
        </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="参数1" prop="param1">
              <el-input v-model="errorCodeForm.param1" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="参数2" prop="param2">
              <el-input v-model="errorCodeForm.param2" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="参数3" prop="param3">
              <el-input v-model="errorCodeForm.param3" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="参数4" prop="param4">
              <el-input v-model="errorCodeForm.param4" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="故障分类" prop="category">
              <el-select v-model="errorCodeForm.category" placeholder="请选择分类">
                <el-option label="软件" value="软件" />
                <el-option label="硬件" value="硬件" />
                <el-option label="日志记录" value="日志记录" />
                <el-option label="操作提示" value="操作提示" />
                <el-option label="安全保护" value="安全保护" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="故障等级" prop="level">
              <el-input v-model="errorCodeForm.level" readonly placeholder="根据故障码自动判断" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="日志分析分类" prop="analysisCategories">
              <el-select 
                v-model="errorCodeForm.analysisCategories" 
                multiple 
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="3"
                popper-class="analysis-categories-tooltip"
                placeholder="请选择日志分析分类（可多选）"
                style="width: 100%"
              >
                <el-option 
                  v-for="cat in analysisCategories" 
                  :key="cat.id" 
                  :label="cat.name_zh" 
                  :value="cat.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="处理措施" prop="solution">
              <el-input 
                :value="getSolutionDisplay(errorCodeForm.solution)" 
                readonly 
                placeholder="根据故障码自动判断" 
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="详细信息" prop="detail">
          <el-input v-model="errorCodeForm.detail" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item label="检测方法" prop="method">
          <el-input v-model="errorCodeForm.method" type="textarea" :rows="3" />
            </el-form-item>

        <el-form-item label="技术排查方案" prop="tech_solution">
          <el-input v-model="errorCodeForm.tech_solution" type="textarea" :rows="3" />
            </el-form-item>

        <el-form-item label="解释" prop="explanation">
          <el-input v-model="errorCodeForm.explanation" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button type="primary" @click="handleSave" :loading="saving">
            {{ getSaveButtonText() }}
          </el-button>
        </span>
      </template>
    </el-dialog>
    <!-- 故障码查询弹窗 -->
    <el-dialog
      v-model="showQueryDialog"
      title="故障码查询"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="queryForm" label-width="140px">
        <el-form-item label="完整故障码">
          <el-input 
            v-model="queryForm.fullCode" 
            placeholder="例如 141010A 或 0X010A（可含子系统前缀）" 
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="queryLoading" @click="handleQuery">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>

      <el-card v-if="queryResult" class="mt-2">
        <el-descriptions :column="1" border title="结果信息">
          <el-descriptions-item label="解释">
            {{ buildPrefixedExplanation(queryResult, foundRecord) }}
          </el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <el-descriptions :column="1" border title="参数含义">
          <el-descriptions-item label="参数1">{{ foundRecord?.param1 || '-' }}</el-descriptions-item>
          <el-descriptions-item label="参数2">{{ foundRecord?.param2 || '-' }}</el-descriptions-item>
          <el-descriptions-item label="参数3">{{ foundRecord?.param3 || '-' }}</el-descriptions-item>
          <el-descriptions-item label="参数4">{{ foundRecord?.param4 || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <el-descriptions :column="1" border title="更多信息">
          <el-descriptions-item label="详细信息">{{ foundRecord?.detail || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检查方法">{{ foundRecord?.method || '-' }}</el-descriptions-item>
          <el-descriptions-item label="技术排查方案">{{ foundRecord?.tech_solution || '-' }}</el-descriptions-item>
          <el-descriptions-item label="故障分类">{{ foundRecord?.category || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showQueryDialog = false">关闭</el-button>
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
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    const showAddDialog = ref(false)
    const showQueryDialog = ref(false)
    const editingErrorCode = ref(null)
    const searchQuery = ref('')
    const currentPage = ref(1)
    const pageSize = ref(10)
    const errorCodeFormRef = ref(null)
    const queryLoading = ref(false)
    const queryForm = reactive({ fullCode: '' })
    const queryResult = ref(null)
    const foundRecord = ref(null)
    const analysisCategories = ref([])
    const booleanOptions = ref([])
    
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
          { required: true, message: '请选择子系统', trigger: 'change' }
        ],
        code: [
          { required: true, message: '请输入故障码', trigger: 'blur' },
          { pattern: /^0X[0-9A-F]{3}[ABCDE]$/, message: '故障码格式不正确，必须以0X开头+16进制的故障码（最后一位表示等级分类）', trigger: 'blur' }
        ],
        detail: [
          { required: true, message: '请输入详细信息', trigger: 'blur' }
        ],
        method: [
          { required: true, message: '请输入检测方法', trigger: 'blur' }
        ],
        param1: [
          { required: true, message: '请输入参数1', trigger: 'blur' }
        ],
        param2: [
          { required: true, message: '请输入参数2', trigger: 'blur' }
        ],
        param3: [
          { required: true, message: '请输入参数3', trigger: 'blur' }
        ],
        param4: [
          { required: true, message: '请输入参数4', trigger: 'blur' }
        ],
        category: [
          { required: true, message: '请选择故障分类', trigger: 'change' }
        ]
      };

      // 动态验证中文字段
      const hasOperation = errorCodeForm.operation && errorCodeForm.operation.trim() !== '';
      
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
          required: !(errorCodeForm.short_message && errorCodeForm.short_message.trim() !== '') && 
                    !(errorCodeForm.user_hint && errorCodeForm.user_hint.trim() !== ''), 
          message: '精简提示信息、用户提示信息和操作信息至少需要填写两项', 
          trigger: 'blur' 
        }
      ];

      // 动态验证英文字段
      const hasOperationEn = errorCodeForm.operation_en && errorCodeForm.operation_en.trim() !== '';
      
      baseRules.short_message_en = [
        { 
          required: !hasOperationEn, 
          message: '英文精简提示信息和英文操作信息不能都为空', 
          trigger: 'blur' 
        }
      ];
      
      baseRules.user_hint_en = [
        { 
          required: !hasOperationEn, 
          message: '英文用户提示信息和英文操作信息不能都为空', 
          trigger: 'blur' 
        }
      ];
      
      baseRules.operation_en = [
        { 
          required: !(errorCodeForm.short_message_en && errorCodeForm.short_message_en.trim() !== '') && 
                    !(errorCodeForm.user_hint_en && errorCodeForm.user_hint_en.trim() !== ''), 
          message: '英文精简提示信息、英文用户提示信息和英文操作信息至少需要填写两项', 
          trigger: 'blur' 
        }
      ];

      return baseRules;
    });
    
    // 根据故障码自动判断故障等级和处理措施
    const analyzeErrorCode = (code) => {
      if (!code) return { level: '无', solution: 'tips' };
      
      // 解析故障码：0X + 3位16进制数字 + A/B/C/D/E
      const match = code.match(/^0X([0-9A-F]{3})([ABCDE])$/);
      if (!match) return { level: '无', solution: 'tips' };
      
      const [, hexPart, severity] = match;
      
      // 根据故障码末尾字母判断等级
      let level = '无';
      switch (severity) {
        case 'A': // A类故障：高级
          level = '高级';
          break;
        case 'B': // B类故障：中级
          level = '中级';
          break;
        case 'C': // C类故障：低级
          level = '低级';
          break;
        default: // D、E类故障：无
          level = '无';
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
      
      return { level, solution };
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
        'recoverable': '可恢复故障',
        'unrecoverable': '不可恢复故障',
        'ignorable': '可忽略故障',
        'tips': '提示信息',
        'log': '日志记录'
      };
      return solutionMap[solution] || solution;
    };
    
    // 计算属性
    const errorCodes = computed(() => store.getters['errorCodes/errorCodesList'])
    const total = computed(() => store.getters['errorCodes/totalCount'])
    const canCreate = computed(() => store.getters['auth/userRole'] === 'admin' || store.getters['auth/userRole'] === 'expert')
    const canUpdate = computed(() => store.getters['auth/userRole'] === 'admin' || store.getters['auth/userRole'] === 'expert')
    const canDelete = computed(() => store.getters['auth/userRole'] === 'admin' || store.getters['auth/userRole'] === 'expert')
    
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
        console.error('加载分析分类失败:', error)
        ElMessage.error('加载分析分类失败')
      }
    }
    
    // 设置默认的"未分类"选项
    const setDefaultNullCategory = () => {
      // 查找"未分类"（Null）分类
      const nullCategory = analysisCategories.value.find(cat => 
        cat.category_key === 'Null' || cat.name_zh === '未分类'
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
          keyword: searchQuery.value
        })
      } catch (error) {
        ElMessage.error('加载故障码失败')
      } finally {
        loading.value = false
      }
    }
    
    const handleSearch = () => {
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
          `确定要删除故障码 "${row.code}" 吗？`,
          '删除确认',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning',
          }
        )
        
        await store.dispatch('errorCodes/deleteErrorCode', row.id)
        ElMessage.success('删除成功')
        loadErrorCodes()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
      }
    }
    
    // 获取弹窗标题
    const getDialogTitle = () => {
      if (!editingErrorCode.value) {
        // 添加模式
        if (isLocalSubsystem.value) {
          return '创建本地故障码'
        } else if (isRemoteSubsystem.value) {
          return '创建远程故障码'
        } else {
          return '添加故障码'
        }
      } else {
        // 编辑模式
        if (isLocalSubsystem.value) {
          return '更新本地故障码'
        } else if (isRemoteSubsystem.value) {
          return '更新远程故障码'
        } else {
          return '编辑故障码'
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
        ElMessage.warning('请输入完整故障码')
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
        ElMessage.error(e?.response?.data?.message || '查询失败')
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
      const subsystemMap = {
        '1': '08：远程运动控制软件',
        '3': '09：远程医生控制台软件',
        '5': '0A：远程驱动器软件'
      }
      return subsystemMap[errorCodeForm.subsystem] || ''
    }
    
    // 获取本地子系统标签
    const getLocalSubsystemLabel = () => {
      const subsystemMap = {
        '8': '01：运动控制软件',
        '9': '03：医生控制台软件',
        'A': '05：驱动器软件'
      }
      return subsystemMap[errorCodeForm.subsystem] || ''
    }
    
    // 获取保存按钮文本
    const getSaveButtonText = () => {
      return editingErrorCode.value ? '更新' : '创建'
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
        
        const action = editingErrorCode.value ? '更新' : '创建'
        ElMessage.success(`${action}成功`)
        
        showAddDialog.value = false
        resetForm()
        loadErrorCodes()
      } catch (error) {
        if (error.response && error.response.data && error.response.data.errors) {
          ElMessage.error(error.response.data.errors.join(', '))
        } else {
          ElMessage.error('保存失败')
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
       booleanOptions,
       // 同步相关变量
       syncToRemote,
       syncToLocal,
       showSyncOption,
       isLocalSubsystem,
       isRemoteSubsystem,
       handleSearch,
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
  padding: 20px;
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