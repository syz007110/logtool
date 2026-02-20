<template>
  <div class="operation-summary-table">
    <el-table :data="tableData" stripe class="summary-table">
      <el-table-column prop="operation" :label="$t('surgeryVisualization.report.operationType')" align="left">
        <template #default="{ row }">
          <div class="operation-cell">
            <span class="operation-name">{{ row.operation }}</span>
          </div>
        </template>
      </el-table-column>
      
      <el-table-column prop="count" :label="$t('surgeryVisualization.report.count')" width="200" align="right">
        <template #default="{ row }">
          <span class="count-value">{{ row.count }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export default {
  name: 'OperationSummaryTable',
  props: {
    operationData: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props) {
    const { t } = useI18n()
    const tableData = computed(() => {
      const data = props.operationData || {}
      const operations = [
        { key: 'endoscope_pedal', i18nKey: 'surgeryVisualization.operationEndoscopePedal' },
        { key: 'foot_clutch', i18nKey: 'surgeryVisualization.operationFootClutch' },
        { key: 'left_hand_clutch', i18nKey: 'surgeryVisualization.operationLeftHandClutch' },
        { key: 'right_hand_clutch', i18nKey: 'surgeryVisualization.operationRightHandClutch' },
        { key: 'arm_switch_count', i18nKey: 'surgeryVisualization.operationArmSwitch' }
      ]
      
      const counts = operations.map(op => data[op.key] || 0)
      const maxCount = Math.max(...counts, 1) // 至少为1，避免除零
      
      return operations.map(op => ({
        operation: t(op.i18nKey),
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
