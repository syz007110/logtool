<template>
  <el-dialog
    v-model="visible"
    title="手术数据比对"
    width="1200px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="compare-container">
      <!-- 头部信息 -->
      <div class="compare-header">
        <el-alert
          type="warning"
          :title="`数据库中已存在手术ID为 ${surgeryId} 的手术数据，检测到 ${differences.length} 处差异`"
          show-icon
          :closable="false"
          style="margin-bottom: 20px"
        />
        
        <div class="action-buttons">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="confirmOverride" :loading="confirming">
            确认覆盖
          </el-button>
        </div>
      </div>

      <!-- 差异列表 -->
      <div class="differences-section">
        <h3>数据差异详情</h3>
        <el-table :data="differences" style="width: 100%" max-height="500">
          <el-table-column prop="fieldName" label="字段名称" width="200" />
           <el-table-column label="原有数据" min-width="250">
             <template #default="{ row }">
               <div class="value-cell old-value">
                 <pre>{{ formatValue(row.oldValue, row.fieldName, 'old') }}</pre>
               </div>
             </template>
           </el-table-column>
           <el-table-column label="新数据" min-width="250">
             <template #default="{ row }">
               <div class="value-cell new-value">
                 <pre>{{ formatValue(row.newValue, row.fieldName, 'new') }}</pre>
               </div>
             </template>
           </el-table-column>
          <el-table-column prop="type" label="类型" width="120">
            <template #default="{ row }">
              <el-tag :type="getTypeColor(row.type)">
                {{ getTypeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 详细比对 -->
      <div v-if="showDetailedCompare" class="detailed-compare-section">
        <h3>详细数据比对</h3>
        <el-tabs v-model="activeTab">
           <el-tab-pane label="基础信息" name="basic">
             <div class="compare-grid">
               <div class="compare-column">
                 <h4>数据库中的数据</h4>
                 <pre class="json-display">{{ formatJSONForDisplay(existingData) }}</pre>
               </div>
               <div class="compare-column">
                 <h4>新分析的数据</h4>
                 <pre class="json-display">{{ formatJSONForDisplay(newData) }}</pre>
               </div>
             </div>
           </el-tab-pane>
           
           <el-tab-pane label="结构化数据" name="structured">
             <div class="compare-grid">
               <div class="compare-column">
                 <h4>数据库中的结构化数据</h4>
                 <pre class="json-display">{{ formatJSONForDisplay(existingData.structured_data) }}</pre>
               </div>
               <div class="compare-column">
                 <h4>新分析的结构化数据</h4>
                 <pre class="json-display">{{ formatJSONForDisplay(newData.structured_data) }}</pre>
               </div>
             </div>
           </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 切换详细比对按钮 -->
      <div class="toggle-section">
        <el-button 
          type="text" 
          @click="showDetailedCompare = !showDetailedCompare"
          :icon="showDetailedCompare ? 'ArrowUp' : 'ArrowDown'"
        >
          {{ showDetailedCompare ? '隐藏' : '显示' }}详细比对
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { loadServerTimezone, formatTime } from '@/utils/timeFormatter'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  surgeryId: {
    type: String,
    required: true
  },
  existingData: {
    type: Object,
    required: true
  },
  newData: {
    type: Object,
    required: true
  },
  differences: {
    type: Array,
    required: true
  },
  surgeryData: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'confirmed'])

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const confirming = ref(false)
const showDetailedCompare = ref(false)
const activeTab = ref('basic')

// 组件挂载时加载服务器时区信息
onMounted(async () => {
  await loadServerTimezone()
})

// 用于记录已打印的字段，避免重复打印
const printedFields = new Set()

// 格式化显示值，特别处理时间字段
const formatValue = (value, fieldName, dataType = 'old') => {
  if (value === null || value === undefined) return '无'
  
  // 如果是时间相关字段，使用时间格式化
  if (fieldName && (fieldName.includes('时间') || fieldName.includes('time'))) {
    // 只记录原有数据的手术开始时间和结束时间，且只打印一次
    if (dataType === 'old' && (fieldName === '开始时间' || fieldName === '结束时间') && !printedFields.has(fieldName)) {
      console.log(`🔧 原有数据${fieldName}: ${value}`)
      printedFields.add(fieldName)
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const formatted = formatTime(value)
      if (dataType === 'old' && (fieldName === '开始时间' || fieldName === '结束时间') && printedFields.has(fieldName)) {
        console.log(`🔧 原有数据${fieldName}转换后: ${formatted}`)
        printedFields.delete(fieldName) // 打印后移除，避免重复
      }
      return formatted
    }
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

// 递归处理所有时间字段，将UTC时间转换为本地时间
const processAllTimeFields = (obj) => {
  if (obj === null || obj === undefined) return obj
  
  if (Array.isArray(obj)) {
    return obj.map(item => processAllTimeFields(item))
  }
  
  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      // 检查是否为时间字段
      const isTimeField = key.toLowerCase().includes('time') || 
                         key.toLowerCase().includes('timestamp') ||
                         key === 'start_time' || 
                         key === 'end_time' ||
                         key === 'on_time' || 
                         key === 'off_time' ||
                         key === 'created_at' ||
                         key === 'updated_at' ||
                         key === 'last_analyzed_at'
      
      if (isTimeField && value) {
        result[key] = formatTime(value)
      } else {
        result[key] = processAllTimeFields(value)
      }
    }
    return result
  }
  
  return obj
}

// 格式化JSON数据用于显示，特别处理时间字段
const formatJSONForDisplay = (data) => {
  if (!data) return '无'
  
  // 深拷贝数据以避免修改原始数据
  const processedData = JSON.parse(JSON.stringify(data))
  
  // 递归处理所有时间字段
  const result = processAllTimeFields(processedData)
  
  return JSON.stringify(result, null, 2)
}


// 获取类型颜色
const getTypeColor = (type) => {
  const colorMap = {
    'basic': 'primary',
    'structured': 'success',
    'arms': 'warning',
    'stats': 'info',
    'usage_count': 'danger',
    'fault_count': 'danger'
  }
  return colorMap[type] || 'default'
}

// 获取类型标签
const getTypeLabel = (type) => {
  const labelMap = {
    'basic': '基础字段',
    'structured': '结构化数据',
    'arms': '器械数据',
    'stats': '统计数据',
    'usage_count': '使用次数',
    'fault_count': '故障数量'
  }
  return labelMap[type] || type
}

// 确认覆盖
const confirmOverride = async () => {
  try {
    await ElMessageBox.confirm(
      '确认要覆盖数据库中的手术数据吗？此操作不可撤销。',
      '确认覆盖',
      {
        confirmButtonText: '确认覆盖',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    confirming.value = true
    
    const response = await api.surgeryStatistics.confirmOverrideSurgeryData(
      props.surgeryData, 
      true
    )
    
    if (response.data.success) {
      ElMessage.success('手术数据已成功覆盖到PostgreSQL数据库')
      emit('confirmed')
      visible.value = false
    } else {
      ElMessage.error(response.data.message || '覆盖失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('覆盖手术数据失败:', error)
      ElMessage.error('覆盖手术数据失败: ' + (error.response?.data?.message || error.message))
    }
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.compare-container {
  max-height: 80vh;
  overflow-y: auto;
}

.compare-header {
  margin-bottom: 20px;
}

.action-buttons {
  text-align: right;
  margin-top: 10px;
}

.differences-section {
  margin-bottom: 20px;
}

.differences-section h3 {
  margin-bottom: 15px;
  color: #303133;
}

.value-cell {
  padding: 8px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  max-height: 100px;
  overflow-y: auto;
}

.value-cell pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.old-value {
  background-color: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.new-value {
  background-color: #f0f9ff;
  border-left: 3px solid #409eff;
}

.detailed-compare-section {
  margin-bottom: 20px;
}

.detailed-compare-section h3 {
  margin-bottom: 15px;
  color: #303133;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 15px;
}

.compare-column h4 {
  margin-bottom: 10px;
  color: #606266;
  font-size: 14px;
}

.json-display {
  background-color: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 15px;
  font-size: 12px;
  line-height: 1.4;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.toggle-section {
  text-align: center;
  padding: 10px 0;
  border-top: 1px solid #e4e7ed;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .compare-grid {
    grid-template-columns: 1fr;
  }
}
</style>
