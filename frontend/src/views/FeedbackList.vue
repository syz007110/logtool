<template>
  <div class="card">
    <div class="toolbar">
      <el-select v-model="status" :placeholder="$t('feedback.allStatus')" clearable style="width: 180px" @change="fetchData(1)">
        <el-option :label="$t('feedback.all')" :value="''" />
        <el-option :label="$t('feedback.statusOpen')" value="open" />
        <el-option :label="$t('feedback.statusResolved')" value="resolved" />
      </el-select>
    </div>
    <el-table :data="items" style="width: 100%" :fit="false">
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
          <el-button link type="primary" @click="viewDetail(row.id)">{{ $t('feedback.viewDetail') }}</el-button>
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

    <div class="pager">
      <el-pagination
        background
        layout="prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="fetchData"
      />
    </div>
  </div>
</template>

<script>
import api from '../api'
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

export default {
  name: 'FeedbackList',
  emits: ['view'],
  setup(_, { emit }) {
    const { t: $t } = useI18n()
    const items = ref([])
    const total = ref(0)
    const page = ref(1)
    const pageSize = ref(10)
    const status = ref('')

    const fetchData = async (p = page.value) => {
      page.value = p
      try {
        const { data } = await api.feedback.getList({ page: page.value, pageSize: pageSize.value, status: status.value })
        items.value = data.items
        total.value = data.total
      } catch (e) {}
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
      } catch (e) {}
    }

    onMounted(() => fetchData(1))

    return { items, total, page, pageSize, status, fetchData, statusText, statusType, formatTime, viewDetail, changeStatus }
  }
}
</script>

<style scoped>
.card { background: #fff; padding: 20px; border-radius: 8px; }
.toolbar { margin-bottom: 12px; display: flex; gap: 8px; }
.explanation-ellipsis { display:inline-block; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.explanation-tooltip { max-width: 60vw; white-space: normal; z-index: 3000; }
.el-popper.explanation-tooltip { overflow: visible; }
.explanation-tooltip.dark { background: rgba(0,0,0,0.85); color: #fff; }
.thumbs { display: flex; gap: 8px; }
.thumbs .el-image { width: 60px; height: 60px; border-radius: 4px; }
.pager { margin-top: 12px; display: flex; justify-content: flex-end; }
</style>


