<template>
  <div class="page">
    <div class="header">
      <div class="header-top">
        <van-icon name="arrow-left" class="back-icon" @click="$router.back()" />
        <div class="header-title">{{ deviceId }}</div>
      </div>
      <div class="header-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="content">
      <div v-if="activeTab === 'logs'" class="toolbar">
        <input v-model="logKeyword" class="toolbar-input" type="text" placeholder="搜索日志文件名" @input="applyFilters" />
        <select v-model="logStatusFilter" class="toolbar-select" @change="reloadCurrentTab">
          <option value="all">全部状态</option>
          <option value="completed">已完成</option>
          <option value="incomplete">未完成</option>
        </select>
      </div>

      <div v-else-if="activeTab === 'surgeries'" class="toolbar">
        <input v-model="surgeryKeyword" class="toolbar-input" type="text" placeholder="搜索手术编号/名称" @input="applyFilters" />
      </div>

      <van-list :loading="loading" :finished="finished" :offset="100" @load="onLoad">
        <template v-if="activeTab === 'logs'">
          <button
            v-for="item in filteredLogs"
            :key="item.id"
            type="button"
            class="item-card"
            @click="openLog(item)"
          >
            <div class="item-title">{{ item.original_name || item.name || ('日志 #' + item.id) }}</div>
            <div class="item-sub">{{ formatDate(item.upload_time || item.updated_at || item.created_at) }}</div>
          </button>
        </template>

        <template v-else-if="activeTab === 'surgeries'">
          <button
            v-for="item in filteredSurgeries"
            :key="item.id || item.surgery_id"
            type="button"
            class="item-card"
            @click="openSurgery(item)"
          >
            <div class="item-title">{{ item.surgery_id || item.id || '-' }}</div>
            <div class="item-sub">{{ formatDate(item.start_time || item.created_at) }}</div>
          </button>
        </template>

        <template v-else>
          <div
            v-for="item in motions"
            :key="item.id"
            class="item-card"
          >
            <div class="item-title">{{ item.original_name || item.file_name || ('运行数据 #' + item.id) }}</div>
            <div class="item-sub">{{ formatDate(item.file_time || item.upload_time || item.created_at) }}</div>
          </div>
        </template>
      </van-list>

      <van-empty
        v-if="!loading && currentList.length === 0 && finished"
        :description="$t('shared.noData')"
        class="empty-state"
      />
    </div>
  </div>
</template>

<script>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { List as VanList, Empty as VanEmpty, Icon as VanIcon } from 'vant'
import api from '@/api'

export default {
  name: 'MDeviceData',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const deviceId = computed(() => String(route.params?.deviceId || ''))

    const activeTab = ref('logs')
    const loading = ref(false)
    const finished = ref(false)
    const page = ref(1)
    const pageSize = 20

    const logs = ref([])
    const surgeries = ref([])
    const motions = ref([])

    const logKeyword = ref('')
    const logStatusFilter = ref('all')
    const surgeryKeyword = ref('')

    const tabs = computed(() => ([
      { key: 'logs', label: '日志数据' },
      { key: 'surgeries', label: '手术数据' },
      { key: 'motions', label: '运行数据' }
    ]))

    const filteredLogs = computed(() => {
      const kw = logKeyword.value.trim().toLowerCase()
      return logs.value.filter((item) => {
        const name = String(item?.original_name || item?.name || '').toLowerCase()
        return !kw || name.includes(kw)
      })
    })

    const filteredSurgeries = computed(() => {
      const kw = surgeryKeyword.value.trim().toLowerCase()
      return surgeries.value.filter((item) => {
        const sid = String(item?.surgery_id || item?.id || '').toLowerCase()
        const proc = String(item?.procedure || item?.surgery_name || '').toLowerCase()
        return !kw || sid.includes(kw) || proc.includes(kw)
      })
    })

    const currentList = computed(() => {
      if (activeTab.value === 'logs') return filteredLogs.value
      if (activeTab.value === 'surgeries') return filteredSurgeries.value
      return motions.value
    })

    const formatDate = (v) => {
      if (!v) return '-'
      try {
        return new Date(v).toLocaleString('zh-CN')
      } catch (_) {
        return String(v)
      }
    }

    const reset = () => {
      page.value = 1
      finished.value = false
      if (activeTab.value === 'logs') logs.value = []
      if (activeTab.value === 'surgeries') surgeries.value = []
      if (activeTab.value === 'motions') motions.value = []
    }

    const onLoad = async () => {
      if (loading.value || finished.value) return
      loading.value = true
      try {
        if (activeTab.value === 'logs') {
          const resp = await api.logs.getList({
            device_id: deviceId.value,
            page: page.value,
            limit: pageSize,
            status_filter: logStatusFilter.value
          })
          const rows = Array.isArray(resp?.data?.logs) ? resp.data.logs : []
          logs.value = logs.value.concat(rows)
          const total = Number(resp?.data?.total || 0)
          finished.value = logs.value.length >= total || rows.length < pageSize
        } else if (activeTab.value === 'surgeries') {
          const resp = await api.surgeries.list({ device_id: deviceId.value, page: page.value, limit: pageSize })
          const rows = Array.isArray(resp?.data?.data) ? resp.data.data : []
          surgeries.value = surgeries.value.concat(rows)
          const total = Number(resp?.data?.total || 0)
          finished.value = surgeries.value.length >= total || rows.length < pageSize
        } else {
          const resp = await api.motionData.listFiles({ device_id: deviceId.value, page: page.value, limit: pageSize })
          const rows = Array.isArray(resp?.data?.data) ? resp.data.data : []
          motions.value = motions.value.concat(rows)
          const total = Number(resp?.data?.total || 0)
          finished.value = motions.value.length >= total || rows.length < pageSize
        }

        if (!finished.value) page.value += 1
      } catch (error) {
        console.error('Failed to load device tab data:', error)
        finished.value = true
      } finally {
        loading.value = false
      }
    }

    const switchTab = (tabKey) => {
      if (activeTab.value === tabKey) return
      activeTab.value = tabKey
      reset()
      onLoad()
    }

    const reloadCurrentTab = () => {
      reset()
      onLoad()
    }

    const applyFilters = () => {
      // 本地搜索过滤，不触发远程重载
    }

    const openLog = (item) => {
      const logId = item?.id
      if (!logId) return
      router.push({ name: 'MLogView', params: { logId } })
    }

    const openSurgery = (item) => {
      const surgeryId = item?.surgery_id || item?.id
      if (!surgeryId) return
      router.push({ name: 'MSurgeryVisualization', params: { surgeryId } })
    }

    return {
      deviceId,
      tabs,
      activeTab,
      loading,
      finished,
      logs,
      surgeries,
      motions,
      logKeyword,
      logStatusFilter,
      surgeryKeyword,
      filteredLogs,
      filteredSurgeries,
      currentList,
      formatDate,
      switchTab,
      reloadCurrentTab,
      applyFilters,
      onLoad,
      openLog,
      openSurgery
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100%;
  background: var(--m-color-bg);
}

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--m-color-surface);
  border-bottom: 1px solid var(--m-color-border);
  box-shadow: var(--m-shadow-sm);
  padding-top: max(var(--m-space-3), env(safe-area-inset-top));
}

.header-top {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  padding: var(--m-space-3) var(--m-space-4);
}

.back-icon {
  font-size: 20px;
  color: var(--m-color-text);
}

.header-title {
  font-size: var(--m-font-size-lg);
  color: var(--m-color-text);
  font-weight: var(--m-font-weight-semibold);
}

.header-tabs {
  display: flex;
  gap: var(--m-space-2);
  padding: 0 var(--m-space-4) var(--m-space-3);
}

.tab-btn {
  flex: 1;
  border: 1px solid var(--m-color-border);
  border-radius: var(--m-radius-pill);
  background: var(--m-color-surface);
  color: var(--m-color-text-secondary);
  font-size: var(--m-font-size-sm);
  padding: 6px var(--m-space-2);
}

.tab-btn.active {
  border-color: var(--m-color-brand);
  background: var(--m-color-brand-soft);
  color: var(--m-color-brand);
  font-weight: var(--m-font-weight-semibold);
}

.content {
  padding: var(--m-space-3) var(--m-space-4);
}

.toolbar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-3);
}

.toolbar-input,
.toolbar-select {
  height: 36px;
  border: 1px solid var(--m-color-border);
  border-radius: var(--m-radius-md);
  background: var(--m-color-surface);
  color: var(--m-color-text);
  font-size: var(--m-font-size-sm);
  padding: 0 var(--m-space-2);
  outline: none;
}

.toolbar-input::placeholder {
  color: var(--m-color-text-tertiary);
}

.item-card {
  width: 100%;
  border: 0;
  text-align: left;
  background: var(--m-color-surface);
  border-radius: var(--m-radius-md);
  box-shadow: var(--m-shadow-card);
  padding: var(--m-space-3);
  margin-bottom: var(--m-space-3);
}

.item-title {
  font-size: var(--m-font-size-md);
  color: var(--m-color-text);
  font-weight: var(--m-font-weight-medium);
  line-height: 1.4;
  word-break: break-word;
}

.item-sub {
  margin-top: 4px;
  font-size: var(--m-font-size-xs);
  color: var(--m-color-text-secondary);
}

.empty-state {
  margin-top: 40px;
}
</style>
