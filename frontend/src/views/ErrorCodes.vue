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
          v-if="canCreate"
          type="primary" 
          @click="showAddDialog = true"
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
        <el-table-column prop="subsystem" label="子系统" width="80" show-overflow-tooltip />
        <el-table-column prop="code" label="故障码" width="120" show-overflow-tooltip />
        <el-table-column label="提示信息" show-overflow-tooltip>
          <template #default="{ row }">
            {{ [row.user_hint, row.operation].filter(Boolean).join(', ') }}
          </template>
        </el-table-column>
        <el-table-column prop="param1" label="参数1" show-overflow-tooltip />
        <el-table-column prop="param2" label="参数2" show-overflow-tooltip />
        <el-table-column prop="param3" label="参数3" show-overflow-tooltip />
        <el-table-column prop="param4" label="参数4" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="100" show-overflow-tooltip />
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
      :title="editingErrorCode ? '编辑故障码' : '添加故障码'"
      width="800px"
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
              <el-select v-model="errorCodeForm.subsystem" placeholder="请选择子系统">
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

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="是否轴错误" prop="is_axis_error">
              <el-radio-group v-model="errorCodeForm.is_axis_error">
                <el-radio :label="true">TRUE</el-radio>
                <el-radio :label="false">FALSE</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否臂错误" prop="is_arm_error">
              <el-radio-group v-model="errorCodeForm.is_arm_error">
                <el-radio :label="true">TRUE</el-radio>
                <el-radio :label="false">FALSE</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="精简提示信息(中文)" prop="short_message">
          <el-input v-model="errorCodeForm.short_message" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="精简提示信息(英文)" prop="short_message_en">
          <el-input v-model="errorCodeForm.short_message_en" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="给用户的提示信息(中文)" prop="user_hint">
          <el-input v-model="errorCodeForm.user_hint" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="给用户的提示信息(英文)" prop="user_hint_en">
          <el-input v-model="errorCodeForm.user_hint_en" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="操作信息(中文)" prop="operation">
          <el-input v-model="errorCodeForm.operation" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="操作信息(英文)" prop="operation_en">
          <el-input v-model="errorCodeForm.operation_en" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="详细信息" prop="detail">
          <el-input v-model="errorCodeForm.detail" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item label="检测方法" prop="method">
          <el-input v-model="errorCodeForm.method" type="textarea" :rows="3" />
        </el-form-item>

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
            <el-form-item label="处理措施" prop="solution">
              <el-input 
                :value="getSolutionDisplay(errorCodeForm.solution)" 
                readonly 
                placeholder="根据故障码自动判断" 
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="技术排查方案" prop="tech_solution">
              <el-input v-model="errorCodeForm.tech_solution" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="解释" prop="explanation">
          <el-input v-model="errorCodeForm.explanation" type="textarea" :rows="3" />
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="专家模式" prop="for_expert">
              <el-radio-group v-model="errorCodeForm.for_expert">
                <el-radio :label="true">TRUE</el-radio>
                <el-radio :label="false">FALSE</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="初学者模式" prop="for_novice">
              <el-radio-group v-model="errorCodeForm.for_novice">
                <el-radio :label="true">TRUE</el-radio>
                <el-radio :label="false">FALSE</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="相关日志" prop="related_log">
              <el-radio-group v-model="errorCodeForm.related_log">
                <el-radio :label="true">TRUE</el-radio>
                <el-radio :label="false">FALSE</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="停止上报方法" prop="stop_report">
          <el-input v-model="errorCodeForm.stop_report" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button type="primary" @click="handleSave" :loading="saving">
            {{ editingErrorCode ? '更新' : '创建' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import api from '../api'

export default {
  name: 'ErrorCodes',
  components: {
    Search,
    Plus
  },
  setup() {
    const store = useStore()
    
    // 响应式数据
    const loading = ref(false)
    const saving = ref(false)
    const showAddDialog = ref(false)
    const editingErrorCode = ref(null)
    const searchQuery = ref('')
    const currentPage = ref(1)
    const pageSize = ref(10)
    const errorCodeFormRef = ref(null)
    
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
       category: ''
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
         } else {
           errorCodeForm[key] = ''
         }
       })
       editingErrorCode.value = null
       if (errorCodeFormRef.value) {
         errorCodeFormRef.value.clearValidate()
       }
     }
    
    const handleAdd = () => {
      resetForm()
      showAddDialog.value = true
    }
    
    const handleEdit = (row) => {
      editingErrorCode.value = row
      Object.keys(errorCodeForm).forEach(key => {
        if (row[key] !== undefined) {
          errorCodeForm[key] = row[key]
        }
      })
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
    
    const handleSave = async () => {
      try {
        await errorCodeFormRef.value.validate()
        saving.value = true
        
        if (editingErrorCode.value) {
          await store.dispatch('errorCodes/updateErrorCode', {
            id: editingErrorCode.value.id,
            data: errorCodeForm
          })
          ElMessage.success('更新成功')
        } else {
          await store.dispatch('errorCodes/createErrorCode', errorCodeForm)
          ElMessage.success('创建成功')
        }
        
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
    })
    
    return {
       loading,
       saving,
       showAddDialog,
       editingErrorCode,
       searchQuery,
       currentPage,
       pageSize,
       errorCodeFormRef,
       errorCodeForm,
       rules,
       errorCodes,
       total,
       canCreate,
       canUpdate,
       canDelete,
       handleSearch,
       handleSizeChange,
       handleCurrentChange,
       handleAdd,
       handleEdit,
       handleDelete,
       handleSave,
       handleCodeChange,
       getSolutionDisplay
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
  max-height: 600px;
  overflow-y: auto;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>