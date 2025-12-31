<template>
  <div class="fault-cases-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ $t('faultCases.title') }}</span>
          <div class="header-actions">
            <el-button @click="refresh">{{ $t('shared.refresh') }}</el-button>
          </div>
        </div>
      </template>

      <div class="filters">
        <el-input
          v-model="query.q"
          :placeholder="$t('faultCases.jira.searchPlaceholder')"
          clearable
          style="width: 360px"
          @keyup.enter="handleSearch(true)"
        />
        <el-date-picker
          v-model="dateRange"
          type="monthrange"
          :range-separator="$t('logs.to')"
          :start-placeholder="$t('faultCases.jira.startMonth')"
          :end-placeholder="$t('faultCases.jira.endMonth')"
          format="YYYY-MM"
          value-format="YYYY-MM"
          style="width: 300px"
          clearable
        />
        <el-button type="primary" @click="handleSearch(true)">{{ $t('shared.search') }}</el-button>
        <el-button @click="reset">{{ $t('shared.reset') }}</el-button>
      </div>

      <el-alert
        v-if="state.enabled === false"
        :title="$t('faultCases.jira.notEnabledHint')"
        type="info"
        show-icon
        :closable="false"
        style="margin: 10px 0"
      />

      <el-alert
        v-else-if="state.ok === false && state.message"
        :title="state.message"
        type="warning"
        show-icon
        :closable="false"
        style="margin: 10px 0"
      />

      <el-table :data="rows" :loading="loading" style="width: 100%" @filter-change="handleFilterChange">
        <el-table-column :label="$t('faultCases.jira.columns.key')" width="140">
          <template #default="{ row }">
            <a :href="row.url" target="_blank" rel="noopener noreferrer" style="color: #409EFF; text-decoration: none;">{{ row.key }}</a>
          </template>
        </el-table-column>
        <el-table-column
          prop="module"
          column-key="module"
          :label="$t('faultCases.jira.columns.module')"
          width="180"
          show-overflow-tooltip
          :filters="moduleFilters"
          :filter-method="noFilter"
          :filter-multiple="true"
          :filtered-value="filteredModuleValues"
          filter-placement="bottom-end"
        />
        <el-table-column :label="$t('faultCases.jira.columns.summary')" min-width="260">
          <template #default="{ row }">
            <el-tooltip
              :content="row.summary || ''"
              placement="top"
              effect="dark"
              :disabled="!row.summary"
            >
              <span class="summary-cell">{{ row.summary }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          prop="status"
          column-key="status"
          :label="$t('faultCases.jira.columns.status')"
          width="140"
          show-overflow-tooltip
          :filters="statusFilters"
          :filter-method="noFilter"
          :filter-multiple="true"
          :filtered-value="filteredStatusValues"
          filter-placement="bottom-end"
        />
        <el-table-column :label="$t('faultCases.jira.columns.updated')" width="190">
          <template #default="{ row }">
            {{ formatDate(row.updated) }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="text" size="small" disabled>{{ $t('faultCases.jira.addToFaultCases') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="pager.page"
          v-model:page-size="pager.limit"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pager.total"
          @size-change="handleSearch(true)"
          @current-change="handleSearch(false)"
        />
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../api'

export default {
  name: 'JiraFaultCases',
  setup () {
    const { t } = useI18n()

    const FILTER_ALL = '__all__'

    const query = reactive({ q: '' })
    const dateRange = ref(null)
    const loading = ref(false)
    const rows = ref([])
    
    // 筛选条件（用于后端查询：空数组表示不过滤，有值表示筛选）
    const activeFilters = reactive({
      modules: [],
      statuses: []
    })
    
    // 标记是否已经进行过筛选操作（用于区分初始状态和"全选"状态）
    const hasFilteredModules = ref(false)
    const hasFilteredStatuses = ref(false)
    
    // UI显示用的筛选值（用于 :filtered-value 绑定）
    // 当用户选择了"全选"时，activeFilters 为空数组，但 hasFiltered 为 true，此时显示所有选项为选中
    const filteredModuleValues = computed(() => {
      // 如果 activeFilters 为空数组且已经进行过筛选操作（用户选择了"全选"），返回所有选项
      if (activeFilters.modules.length === 0 && hasFilteredModules.value && moduleFilterValues.value.length > 0) {
        return [FILTER_ALL, ...moduleFilterValues.value]
      }
      // 如果有筛选条件，返回实际选中的值
      if (activeFilters.modules.length > 0) {
        return activeFilters.modules
      }
      // 初始状态（未进行筛选），返回空数组
      return []
    })
    
    const filteredStatusValues = computed(() => {
      // 如果 activeFilters 为空数组且已经进行过筛选操作（用户选择了"全选"），返回所有选项
      if (activeFilters.statuses.length === 0 && hasFilteredStatuses.value && statusFilterValues.value.length > 0) {
        return [FILTER_ALL, ...statusFilterValues.value]
      }
      // 如果有筛选条件，返回实际选中的值
      if (activeFilters.statuses.length > 0) {
        return activeFilters.statuses
      }
      // 初始状态（未进行筛选），返回空数组
      return []
    })

    const state = reactive({
      enabled: true,
      ok: true,
      message: ''
    })

    const pager = reactive({
      page: 1,
      limit: 20,
      total: 0
    })

    const formatDate = (d) => {
      if (!d) return '-'
      try {
        return new Date(d).toLocaleString()
      } catch {
        return String(d)
      }
    }

    // 从当前数据中提取可用的模块和状态选项（用于筛选器）
    const moduleFilterValues = computed(() => {
      const modules = new Set()
      rows.value.forEach((row) => {
        const comps = Array.isArray(row?.components) ? row.components : []
        if (comps.length > 0) {
          comps.forEach((c) => { if (c) modules.add(String(c)) })
        } else if (row?.module) {
          modules.add(String(row.module))
        }
      })
      return Array.from(modules).map((m) => m.trim()).filter(Boolean).sort()
    })

    const moduleFilters = computed(() => {
      const values = moduleFilterValues.value
      if (!values.length) return []
      return [
        { text: t('faultCases.jira.filters.selectAll'), value: FILTER_ALL },
        ...values.map((m) => ({ text: m, value: m }))
      ]
    })

    const statusFilterValues = computed(() => {
      const statuses = new Set()
      rows.value.forEach((row) => {
        if (row?.status) statuses.add(String(row.status))
      })
      return Array.from(statuses).map((s) => s.trim()).filter(Boolean).sort()
    })

    const statusFilters = computed(() => {
      const values = statusFilterValues.value
      if (!values.length) return []
      return [
        { text: t('faultCases.jira.filters.selectAll'), value: FILTER_ALL },
        ...values.map((s) => ({ text: s, value: s }))
      ]
    })

    // 空的筛选方法：禁用前端筛选，改为后端筛选
    // 注意：这个方法总是返回 true，因为筛选由后端处理
    const noFilter = () => true

    const fetchPage = async () => {
      const q = (query.q || '').trim()
      if (!q) {
        rows.value = []
        pager.total = 0
        return
      }

      loading.value = true
      state.ok = true
      state.message = ''
      try {
        const params = {
          q,
          page: pager.page,
          limit: pager.limit
        }
        
        // 添加日期范围筛选（将年月转换为日期范围：月初00:00:00到月末23:59:59）
        if (dateRange.value && Array.isArray(dateRange.value) && dateRange.value.length === 2) {
          const [startMonth, endMonth] = dateRange.value
          // 开始月份：YYYY-MM -> YYYY-MM-01T00:00:00.000Z
          if (startMonth) {
            const [year, month] = startMonth.split('-')
            params.updatedFrom = new Date(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0, 0).toISOString()
          }
          // 结束月份：YYYY-MM -> YYYY-MM-最后一天T23:59:59.999Z
          if (endMonth) {
            const [year, month] = endMonth.split('-')
            // 获取该月的最后一天
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
            params.updatedTo = new Date(parseInt(year), parseInt(month) - 1, lastDay, 23, 59, 59, 999).toISOString()
          }
        }
        
        // 添加模块和状态筛选
        if (activeFilters.modules && activeFilters.modules.length > 0) {
          params.modules = activeFilters.modules
        }
        if (activeFilters.statuses && activeFilters.statuses.length > 0) {
          params.statuses = activeFilters.statuses
        }
        
        console.log('[JiraFaultCases] fetchPage params:', params)
        const resp = await api.jira.search(params)
        const d = resp.data || {}
        state.enabled = d.enabled !== false
        state.ok = d.ok !== false
        state.message = d.message || ''
        rows.value = Array.isArray(d.items) ? d.items : (Array.isArray(d.issues) ? d.issues : [])
        pager.total = Number.isFinite(Number(d.total)) ? Number(d.total) : rows.value.length
        pager.page = Number.isFinite(Number(d.page)) ? Number(d.page) : pager.page
        pager.limit = Number.isFinite(Number(d.limit)) ? Number(d.limit) : pager.limit
      } catch (e) {
        // 后端尽量返回200，但这里还是做兜底
        state.ok = false
        state.message = e.response?.data?.message || t('shared.requestFailed')
        ElMessage.error(state.message)
      } finally {
        loading.value = false
      }
    }

    const handleSearch = async (resetPage) => {
      if (resetPage) pager.page = 1
      await fetchPage()
    }

    const handleFilterChange = async (filters) => {
      // 仅在用户点击"确认/重置"后触发，这里把筛选条件用于后端查询（分页场景不能用前端过滤）
      // filters: { [prop]: selectedValues[] }
      console.log('[JiraFaultCases] filter-change event:', filters)
      
      if (Object.prototype.hasOwnProperty.call(filters, 'module')) {
        const selected = Array.isArray(filters.module) ? filters.module : (filters.module ? [filters.module] : [])
        console.log('[JiraFaultCases] module filter selected:', selected)
        // 标记已经进行过筛选操作
        hasFilteredModules.value = true
        // 如果包含"全选"，则视为不加过滤（等价于选择全部）
        if (selected.includes(FILTER_ALL)) {
          activeFilters.modules = []
        } else {
          // 过滤掉"全选"选项（如果有），保留实际选中的值
          activeFilters.modules = selected.filter(v => v !== FILTER_ALL)
        }
      } else {
        // 如果没有 module 键，说明筛选被清空（用户点击了"重置"）
        activeFilters.modules = []
        hasFilteredModules.value = false
      }
      
      if (Object.prototype.hasOwnProperty.call(filters, 'status')) {
        const selected = Array.isArray(filters.status) ? filters.status : (filters.status ? [filters.status] : [])
        console.log('[JiraFaultCases] status filter selected:', selected)
        // 标记已经进行过筛选操作
        hasFilteredStatuses.value = true
        if (selected.includes(FILTER_ALL)) {
          activeFilters.statuses = []
        } else {
          activeFilters.statuses = selected.filter(v => v !== FILTER_ALL)
        }
      } else {
        activeFilters.statuses = []
        hasFilteredStatuses.value = false
      }
      
      console.log('[JiraFaultCases] activeFilters after update:', { modules: activeFilters.modules, statuses: activeFilters.statuses })
      
      // 等待 Vue 响应式系统更新 computed 属性
      await nextTick()
      
      // 重新搜索（会带着筛选条件调用后端）
      await handleSearch(true)
    }

    const reset = async () => {
      query.q = ''
      dateRange.value = null
      activeFilters.modules = []
      activeFilters.statuses = []
      hasFilteredModules.value = false
      hasFilteredStatuses.value = false
      rows.value = []
      pager.page = 1
      pager.total = 0
      state.ok = true
      state.message = ''
      // 清除表格筛选器状态
      // 注意：Element Plus 没有直接清除筛选器的方法，这里通过重新渲染表格来实现
    }

    const refresh = async () => {
      await fetchPage()
    }

    return {
      t,
      query,
      dateRange,
      loading,
      rows,
      state,
      pager,
      activeFilters,
      filteredModuleValues,
      filteredStatusValues,
      moduleFilters,
      statusFilters,
      noFilter,
      formatDate,
      handleFilterChange,
      handleSearch,
      reset,
      refresh
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
.header-actions {
  display: flex;
  gap: 8px;
}
.filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.summary-cell {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>


