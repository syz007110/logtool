<template>
  <div class="operation-summary-table">
    <el-table :data="tableData" stripe class="summary-table">
      <el-table-column prop="operation" label="操作类型" align="left">
        <template #default="{ row }">
          <div class="operation-cell">
            <span class="operation-name">{{ row.operation }}</span>
          </div>
        </template>
      </el-table-column>
      
      <el-table-column prop="count" label="次数" width="200" align="right">
        <template #default="{ row }">
          <span class="count-value">{{ row.count }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { computed } from 'vue'

export default {
  name: 'OperationSummaryTable',
  props: {
    operationData: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props) {
    const tableData = computed(() => {
      const data = props.operationData || {}
      const operations = [
        { key: 'endoscope_pedal', name: '内窥镜脚踏触发' },
        { key: 'foot_clutch', name: '脚离合触发' },
        { key: 'left_hand_clutch', name: '左手离合触发' },
        { key: 'right_hand_clutch', name: '右手离合触发' },
        { key: 'arm_switch_count', name: '臂切换触发' }
      ]
      
      const counts = operations.map(op => data[op.key] || 0)
      const maxCount = Math.max(...counts, 1) // 至少为1，避免除零
      
      return operations.map(op => ({
        operation: op.name,
        count: data[op.key] || 0,
        maxCount: maxCount
      }))
    })
    
    return {
      tableData
    }
  }
}
</script>

<style scoped>
.operation-summary-table {
  width: 100%;
  overflow-x: hidden;
}

.summary-table {
  width: 100%;
  table-layout: fixed;
}

.operation-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start; /* 左对齐 */
}

.operation-name {
  font-weight: 500;
  color: #333;
}

.count-value {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  text-align: right; /* 右对齐 */
  display: block;
  width: 100%;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .operation-summary-table {
    font-size: 14px;
  }
  
  .operation-name {
    font-size: 13px;
  }
  
  .count-value {
    font-size: 14px;
  }
}

@media (max-width: 768px) {
  .operation-summary-table {
    font-size: 12px;
  }
  
  .operation-name {
    font-size: 12px;
    line-height: 1.2;
  }
  
  .count-value {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .operation-name {
    font-size: 11px;
  }
  
  .count-value {
    font-size: 12px;
  }
}
</style>
