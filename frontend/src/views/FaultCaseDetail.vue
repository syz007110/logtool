<template>
  <div class="fault-case-detail">
    <el-card :loading="loading">
      <template #header>
        <div class="card-header">
          <div class="title-wrap">
            <span class="title">{{ faultCase?.title || '-' }}</span>
            <el-tag v-if="faultCase" :type="faultCase.is_published === true ? 'success' : 'info'">
              {{ faultCase.is_published === true ? $t('faultCases.statusPublished') : $t('faultCases.statusDraft') }}
            </el-tag>
          </div>
          <div class="actions">
            <el-button @click="goBack">{{ $t('shared.back') || 'Back' }}</el-button>
            <el-button v-if="canUpdate" type="primary" @click="goEdit">{{ $t('shared.edit') }}</el-button>
            <el-button v-if="canDelete" type="danger" @click="handleDelete">{{ $t('shared.delete') }}</el-button>
          </div>
        </div>
      </template>

      <el-descriptions v-if="faultCase" :column="2" border>
        <el-descriptions-item :label="$t('faultCases.fields.source')">
          {{ faultCase.source || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.jira_key')">
          {{ faultCase.jira_key || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.module')">
          {{ faultCase.module || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.equipment_model')">
          <template v-if="Array.isArray(faultCase.equipment_model) && faultCase.equipment_model.length > 0">
            <el-tag v-for="(model, idx) in faultCase.equipment_model" :key="idx" size="small" style="margin-right: 8px;">{{ model }}</el-tag>
          </template>
          <span v-else-if="faultCase.equipment_model">{{ faultCase.equipment_model }}</span>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.updated_at_user')">
          {{ formatDate(faultCase.updated_at_user || faultCase.updatedAt || faultCase.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.related_error_code_ids')" :span="2">
          <span v-if="Array.isArray(faultCase.related_error_code_ids) && faultCase.related_error_code_ids.length">
            {{ faultCase.related_error_code_ids.join(', ') }}
          </span>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.keywords')" :span="2">
          <span v-if="Array.isArray(faultCase.keywords) && faultCase.keywords.length">
            {{ faultCase.keywords.join(', ') }}
          </span>
          <span v-else>-</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />
      <div class="section">
        <div class="section-title">{{ $t('faultCases.fields.symptom') }}</div>
        <div class="section-body pre">{{ faultCase?.symptom || '-' }}</div>
      </div>
      <div class="section">
        <div class="section-title">{{ $t('faultCases.fields.possible_causes') }}</div>
        <div class="section-body pre">{{ faultCase?.possible_causes || '-' }}</div>
      </div>
      <div class="section">
        <div class="section-title">{{ $t('faultCases.fields.troubleshooting_steps') }}</div>
        <div class="section-body pre">{{ faultCase?.solution || faultCase?.troubleshooting_steps || '-' }}</div>
      </div>
      <div class="section">
        <div class="section-title">{{ $t('faultCases.fields.experience') }}</div>
        <div class="section-body pre">{{ faultCase?.remark || faultCase?.experience || '-' }}</div>
      </div>

      <el-divider />
      <div class="section">
        <div class="section-title">{{ $t('faultCases.fields.attachments') }}</div>
        <div class="section-body">
          <el-empty v-if="!faultCase?.attachments?.length" :description="$t('shared.noData')" />
          <el-table v-else :data="faultCase.attachments" style="width: 100%">
            <el-table-column prop="original_name" :label="$t('faultCases.columns.attachment')" min-width="240">
              <template #default="{ row }">
                <a :href="row.url" target="_blank" rel="noopener noreferrer">
                  {{ row.original_name || row.filename || row.url }}
                </a>
              </template>
            </el-table-column>
            <el-table-column prop="mime_type" :label="$t('faultCases.columns.mime')" width="200" show-overflow-tooltip />
            <el-table-column :label="$t('faultCases.columns.size')" width="120">
              <template #default="{ row }">{{ formatSize(row.size_bytes) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </div>

    </el-card>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import api from '../api'

export default {
  name: 'FaultCaseDetail',
  setup () {
    const route = useRoute()
    const router = useRouter()
    const store = useStore()
    const { t } = useI18n()
    const id = computed(() => route.params.id)

    const loading = ref(false)
    const faultCase = ref(null)

    const canUpdate = computed(() => store.getters['auth/hasPermission']?.('fault_case:update'))
    const canDelete = computed(() => store.getters['auth/hasPermission']?.('fault_case:delete'))

    const formatDate = (d) => {
      if (!d) return '-'
      try { return new Date(d).toLocaleString() } catch { return String(d) }
    }

    const formatSize = (n) => {
      const num = Number(n)
      if (!Number.isFinite(num) || num <= 0) return '-'
      const units = ['B', 'KB', 'MB', 'GB']
      let v = num
      let i = 0
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
      return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
    }

    const load = async () => {
      loading.value = true
      try {
        const resp = await api.faultCases.get(id.value)
        faultCase.value = resp.data.faultCase
      } catch (e) {
        ElMessage.error(e.response?.data?.message || 'Load failed')
      } finally {
        loading.value = false
      }
    }

    const goBack = () => {
      router.push('/dashboard/fault-cases')
    }

    const goEdit = () => {
      router.push(`/dashboard/fault-cases/${id.value}/edit`)
    }

    const handleDelete = async () => {
      try {
        await ElMessageBox.confirm(t('shared.messages.confirmDelete'), t('shared.messages.deleteConfirmTitle'), { type: 'warning' })
        await api.faultCases.delete(id.value)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        goBack()
      } catch (_) {}
    }

    onMounted(load)

    return {
      loading,
      faultCase,
      canUpdate,
      canDelete,
      formatDate,
      formatSize,
      goBack,
      goEdit,
      handleDelete
    }
  }
}
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title {
  font-weight: 600;
  font-size: 16px;
}
.actions {
  display: flex;
  gap: 8px;
}
.section {
  margin: 10px 0;
}
.section-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.section-body.pre {
  white-space: pre-wrap;
  line-height: 1.6;
  color: #303133;
}
.review-box {
  margin-top: 8px;
}
.review-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.review-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>


