<template>
  <div class="fault-case-detail">
    <el-card :loading="loading">
      <template #header>
        <div class="card-header">
          <div class="title-wrap">
            <span class="title">{{ faultCase?.title || '-' }}</span>
            <span v-if="faultCase && faultCase.status && String(faultCase.status).trim()" class="status-text">
              {{ getStatusDisplayName(faultCase.status) }}
            </span>
          </div>
          <div class="actions">
            <el-button @click="goBack">{{ $t('shared.back') || 'Back' }}</el-button>
            <el-button v-if="canUpdate" type="primary" @click="goEdit">{{ $t('shared.edit') }}</el-button>
            <el-button v-if="canDelete" type="danger" @click="handleDelete">{{ $t('shared.delete') }}</el-button>
          </div>
        </div>
      </template>

      <el-descriptions v-if="faultCase" :column="2" border label-width="100px">
        <el-descriptions-item :label="$t('faultCases.fields.title')" :span="2">
          {{ faultCase.title || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.module')">
          <div>
            <div>{{ getModuleDisplayName(faultCase.module) }}</div>
            <div v-if="getModuleReference(faultCase)" class="reference-hint">
              参考：{{ getModuleReference(faultCase) }}
            </div>
          </div>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.status')">
          <div>
            <div>{{ getStatusDisplayName(faultCase.status) }}</div>
            <div v-if="getStatusReference(faultCase)" class="reference-hint">
              参考：{{ getStatusReference(faultCase) }}
            </div>
          </div>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.jira_key')">
          {{ faultCase.jira_key || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('faultCases.fields.equipment_model')">
          <template v-if="Array.isArray(faultCase.equipment_model) && faultCase.equipment_model.length > 0">
            <span>{{ faultCase.equipment_model.join(', ') }}</span>
          </template>
          <span v-else-if="faultCase.equipment_model">{{ faultCase.equipment_model }}</span>
          <span v-else>-</span>
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
        <el-descriptions-item :label="$t('faultCases.fields.updated_at_user')" :span="2">
          {{ formatDate(faultCase.updated_at_user || faultCase.updatedAt || faultCase.createdAt) }}
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
        <div class="section-title">{{ $t('faultCases.fields.solution') }}</div>
        <div class="section-body pre">{{ faultCase?.solution || '-' }}</div>
      </div>
      <div class="section">
        <div class="section-title">{{ $t('faultCases.fields.remark') }}</div>
        <div class="section-body pre">{{ faultCase?.remark || '-' }}</div>
      </div>

      <el-divider />
      <div class="section">
        <div class="section-title">{{ $t('faultCases.fields.attachments') }}</div>
        <div class="section-body">
          <el-empty v-if="!faultCase?.attachments?.length" :description="$t('shared.noData')" />
          <el-table v-else :data="faultCase.attachments" style="width: 100%">
            <el-table-column prop="original_name" :label="$t('faultCases.columns.attachment')" min-width="240">
              <template #default="{ row }">
                <div class="attachment-cell">
                  <el-image
                    v-if="isImageAttachment(row) && row.url"
                    :src="row.url"
                    :preview-src-list="attachmentImagePreviewUrls"
                    :initial-index="getAttachmentImageIndex(row)"
                    :preview-teleported="true"
                    fit="cover"
                    class="attachment-thumb"
                  />
                  <a :href="row.url" target="_blank" rel="noopener noreferrer">
                    {{ row.original_name || row.filename || row.url }}
                  </a>
                </div>
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
    const { t, locale } = useI18n()
    const id = computed(() => route.params.id)

    const loading = ref(false)
    const faultCase = ref(null)
    const statusList = ref([])
    const moduleList = ref([])
    // JIRA 原始数据（用于显示参考值）
    const jiraOriginalData = ref(null)

    const canUpdate = computed(() => store.getters['auth/hasPermission']?.('fault_case:update'))
    const canDelete = computed(() => store.getters['auth/hasPermission']?.('fault_case:delete'))
    
    const isZhCN = computed(() => {
      const currentLocale = locale.value || 'zh-CN'
      return currentLocale === 'zh-CN'
    })
    
    // 获取状态显示名称（仅标准字典项）
    const getStatusDisplayName = (statusKey) => {
      if (!statusKey) return t('faultCases.statusDraft') || '草稿'
      const status = statusList.value.find(s => s.is_active && s.status_key === statusKey)
      if (status) {
        return isZhCN.value ? status.name_zh : status.name_en
      }
      // 如果没有找到匹配的状态，返回原始值
      return statusKey
    }
    
    // 获取状态参考值（JIRA 原值）
    // 根据需求：字段下方显示"参考：JIRA 原值"（如果来源是 JIRA 且能找到原值）
    const getStatusReference = (faultCaseData) => {
      if (!faultCaseData || faultCaseData.source !== 'jira') return ''
      
      // 如果有 JIRA 原始数据，使用原始数据中的状态值
      if (jiraOriginalData.value && jiraOriginalData.value.status) {
        return jiraOriginalData.value.status
      }
      
      // 如果没有原始数据，尝试通过映射反向查找
      // 如果当前 status 是 status_key，查找对应的映射值
      if (faultCaseData.status) {
        const status = statusList.value.find(s => s.is_active && s.status_key === faultCaseData.status)
        if (status && status.mapping_values && status.mapping_values.length > 0) {
          // 如果有映射值，显示第一个映射值作为 JIRA 原值参考
          return status.mapping_values[0]
        }
      }
      
      // 如果没有映射值，不显示参考值
      return ''
    }
    
    // 获取模块显示名称（仅标准字典项）
    const getModuleDisplayName = (moduleValue) => {
      if (!moduleValue) return '-'
      const moduleStr = String(moduleValue).trim()
      if (!moduleStr) return '-'
      
      // 首先尝试通过 module_key 直接匹配（MongoDB 存储的是 module_key）
      const directMatch = moduleList.value.find(m => m.is_active && m.module_key === moduleStr)
      if (directMatch) {
        return isZhCN.value ? directMatch.name_zh : directMatch.name_en
      }
      
      // 如果不是直接匹配，尝试通过 mapping_values 反向查找（JIRA 原值）
      // 注意：模块可能是逗号分隔的多个值
      const moduleParts = moduleStr.split(',').map(p => p.trim()).filter(Boolean)
      if (moduleParts.length > 1) {
        // 多个模块值，尝试分别查找
        const matchedParts = []
        const unmatchedParts = []
        for (const part of moduleParts) {
          let found = false
          for (const module of moduleList.value) {
            if (!module.is_active) continue
            const mappingValues = module.mapping_values || []
            if (mappingValues.some(mv => String(mv).trim() === part) || module.module_key === part) {
              const displayName = isZhCN.value ? module.name_zh : module.name_en
              matchedParts.push(displayName || module.module_key)
              found = true
              break
            }
          }
          if (!found) {
            unmatchedParts.push(part)
          }
        }
        if (matchedParts.length > 0) {
          // 如果有匹配的，返回匹配的名称和未匹配的原值
          return [...matchedParts, ...unmatchedParts].join(', ')
        }
        // 如果都没有匹配，返回原始值
        return moduleStr
      } else {
        // 单个模块值
        for (const module of moduleList.value) {
          if (!module.is_active) continue
          const mappingValues = module.mapping_values || []
          const matched = mappingValues.some(mv => String(mv).trim() === moduleStr) || module.module_key === moduleStr
          if (matched) {
            return isZhCN.value ? module.name_zh : module.name_en
          }
        }
      }
      
      // 如果没有找到匹配的映射，返回原始值
      return moduleStr
    }
    
    // 获取模块参考值（JIRA 原值）
    // 根据需求：字段下方显示"参考：JIRA 原值"（如果来源是 JIRA 且能找到原值）
    const getModuleReference = (faultCaseData) => {
      if (!faultCaseData || faultCaseData.source !== 'jira') return ''
      
      // 如果有 JIRA 原始数据，使用原始数据中的模块值
      if (jiraOriginalData.value && jiraOriginalData.value.module) {
        return jiraOriginalData.value.module
      }
      
      // 如果没有原始数据，尝试通过映射反向查找
      if (!faultCaseData.module) return ''
      
      const moduleStr = String(faultCaseData.module).trim()
      if (!moduleStr) return ''
      
      // 如果来源是 JIRA，查找模块映射值作为参考
      // 首先尝试通过 module_key 匹配找到对应的模块
      const matchedModule = moduleList.value.find(m => {
        if (!m.is_active) return false
        // 检查是否是 module_key 匹配
        if (m.module_key === moduleStr) {
          return true
        }
        // 检查是否有映射值匹配
        const mappingValues = m.mapping_values || []
        return mappingValues.some(mv => String(mv).trim() === moduleStr)
      })
      
      if (matchedModule && matchedModule.mapping_values && matchedModule.mapping_values.length > 0) {
        // 如果找到匹配的模块且有映射值，检查当前值是否在映射值中
        // 如果当前值就是映射值之一，返回该映射值作为参考
        const matchedMapping = matchedModule.mapping_values.find(mv => String(mv).trim() === moduleStr)
        if (matchedMapping) {
          return matchedMapping
        }
        // 如果当前值是 module_key，返回第一个映射值作为参考
        if (matchedModule.module_key === moduleStr) {
          return matchedModule.mapping_values[0]
        }
      }
      
      // 如果没有找到映射，不显示参考值（避免显示错误信息）
      return ''
    }

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

    const isImageAttachment = (a) => {
      if (!a) return false
      const mime = String(a.mime_type || a.mimeType || '').toLowerCase()
      if (mime.startsWith('image/')) return true
      const name = String(a.original_name || a.filename || '').toLowerCase()
      return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(name)
    }

    const attachmentImagePreviewUrls = computed(() => {
      const list = faultCase.value?.attachments || []
      return list
        .filter(isImageAttachment)
        .map(a => a?.url)
        .filter(Boolean)
    })

    const getAttachmentImageIndex = (row) => {
      const url = row?.url
      if (!url) return 0
      const idx = attachmentImagePreviewUrls.value.findIndex(u => u === url)
      return idx >= 0 ? idx : 0
    }

    const loadStatuses = async () => {
      try {
        const resp = await api.faultCaseStatuses.getList({ is_active: true })
        if (resp.data?.success) {
          statusList.value = resp.data.statuses || []
        }
      } catch (e) {
        console.error('Failed to load statuses:', e)
      }
    }
    
    const loadModules = async () => {
      try {
        const resp = await api.faultCaseModules.getList({ is_active: true })
        if (resp.data?.success) {
          moduleList.value = resp.data.modules || []
        }
      } catch (e) {
        console.error('Failed to load modules:', e)
      }
    }

    const load = async () => {
      loading.value = true
      try {
        const resp = await api.faultCases.get(id.value)
        faultCase.value = resp.data.faultCase
        
        // 如果来源是 JIRA 且有 jira_key，从 JIRA API 获取原始数据用于显示参考值
        if (faultCase.value?.source === 'jira' && faultCase.value?.jira_key) {
          try {
            const jiraResp = await api.jira.getIssue(faultCase.value.jira_key)
            if (jiraResp.data?.issue) {
              jiraOriginalData.value = {
                status: jiraResp.data.issue.status || '',
                module: jiraResp.data.issue.module || (Array.isArray(jiraResp.data.issue.components) ? jiraResp.data.issue.components.join(', ') : '')
              }
            }
          } catch (e) {
            // 如果获取 JIRA 原始数据失败，不影响主流程，只记录错误
            console.warn('获取 JIRA 原始数据失败（不影响显示）:', e)
            jiraOriginalData.value = null
          }
        } else {
          jiraOriginalData.value = null
        }
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

    onMounted(async () => {
      // 先加载状态和模块列表，然后再加载故障案例详情，确保映射可以正常工作
      await Promise.all([
        loadStatuses(),
        loadModules()
      ])
      await load()
    })

    return {
      loading,
      faultCase,
      canUpdate,
      canDelete,
      formatDate,
      formatSize,
      isImageAttachment,
      attachmentImagePreviewUrls,
      getAttachmentImageIndex,
      goBack,
      goEdit,
      handleDelete,
      getStatusDisplayName,
      getStatusReference,
      getModuleDisplayName,
      getModuleReference
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
.status-text {
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-left: 8px;
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

.reference-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  font-style: italic;
}

.attachment-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.attachment-thumb {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  flex: 0 0 auto;
}
</style>


