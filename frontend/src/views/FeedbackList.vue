<template>
  <div class="feedback-list-container">
    <!-- 操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-select v-model="status" :placeholder="$t('feedback.allStatus')" clearable style="width: 180px" @change="fetchData(1)">
          <el-option :label="$t('feedback.all')" :value="''" />
          <el-option :label="$t('feedback.statusOpen')" value="open" />
          <el-option :label="$t('feedback.statusResolved')" value="resolved" />
        </el-select>
      </div>
    </div>

    <!-- 表格容器 -->
    <div class="table-container">
      <el-table 
        :data="items" 
        :loading="loading"
        :height="tableHeight"
        style="width: 100%" 
        v-loading="loading"
      >
        <el-table-column prop="title" :label="$t('feedback.issueTitle')" min-width="450">
          <template #default="{ row }">
            <el-tooltip 
              :content="row.title" 
              placement="top" 
              effect="dark" 
              popper-class="explanation-tooltip dark" 
              :show-after="120" 
              :teleported="true"
            >
              <span class="explanation-ellipsis">{{ row.title }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column :label="$t('feedback.statusLabel')" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" :label="$t('feedback.submitTime')" width="180">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="$t('feedback.viewDetail')" width="120">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row.id)" class="detail-link-button">
              {{ $t('feedback.viewDetail') }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column :label="$t('feedback.statusChange')" width="160">
          <template #default="{ row }">
            <el-select :model-value="row.status" size="small" style="width: 120px" @change="val => changeStatus(row.id, val)">
              <el-option :label="$t('feedback.statusOpen')" value="open" />
              <el-option :label="$t('feedback.statusResolved')" value="resolved" />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页器 -->
    <div class="pagination-wrapper">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, jumper"
        @current-change="fetchData"
      />
    </div>
  </div>
</template>

<script>
import api from '../api'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useTableHeight } from '@/utils/tableHeight'

export default {
  name: 'FeedbackList',
  emits: ['view'],
  expose: ['fetchData'], // 暴露 fetchData 方法供父组件调用
  setup(_, { emit }) {
    const { t: $t } = useI18n()
    const items = ref([])
    const total = ref(0)
    const page = ref(1)
    const pageSize = ref(10)
    const status = ref('')
    const loading = ref(false)

    // 表格高度计算
    const calculateTableHeight = useTableHeight('basic')
    const tableHeight = ref(calculateTableHeight())

    const fetchData = async (p = page.value) => {
      page.value = p
      loading.value = true
      try {
        const { data } = await api.feedback.getList({ page: page.value, pageSize: pageSize.value, status: status.value })
        items.value = data.items
        total.value = data.total
      } catch (e) {
        // 错误统一由拦截器处理
      } finally {
        loading.value = false
      }
    }

    const statusText = (s) => ({ open: $t('feedback.statusOpen'), in_progress: $t('feedback.statusInProgress'), resolved: $t('feedback.statusResolved') }[s] || s)
    const statusType = (s) => ({ open: 'danger', in_progress: 'warning', resolved: 'success' }[s] || 'info')
    const formatTime = (t) => new Date(t).toLocaleString()

    const viewDetail = (id) => {
      emit('view', id)
    }

    const changeStatus = async (id, s) => {
      try {
        await api.feedback.updateStatus(id, s)
        ElMessage.success($t('feedback.statusUpdated'))
        fetchData()
      } catch (e) {
        // 错误统一由拦截器处理
      }
    }

    const handleResize = () => {
      tableHeight.value = calculateTableHeight()
    }

    onMounted(() => {
      fetchData(1)
      window.addEventListener('resize', handleResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize)
    })

    return { 
      items, 
      total, 
      page, 
      pageSize, 
      status, 
      loading,
      tableHeight,
      fetchData, 
      statusText, 
      statusType, 
      formatTime, 
      viewDetail, 
      changeStatus 
    }
  }
}
</script>

<style scoped>
.feedback-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
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

.pagination-wrapper {
  display: flex;
  justify-content: center;
  padding: 8px 0 12px 0;
}

.explanation-ellipsis {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.explanation-tooltip {
  max-width: 60vw;
  white-space: normal;
  z-index: 3000;
}

.el-popper.explanation-tooltip {
  overflow: visible;
}

.explanation-tooltip.dark {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
}

.detail-link-button {
  padding: 0;
  font-weight: 500;
  color: rgb(var(--primary));
}
</style>
