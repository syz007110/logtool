<template>
  <div class="page">
    <!-- 固定顶部区域（标题栏 + 搜索框） -->
    <div class="fixed-header-section">
      <!-- 顶部标题栏 -->
      <div class="header">
        <h1 class="page-title">{{ $t('mobile.titles.logs') }}</h1>
      </div>
      
      <!-- 搜索框 -->
      <div class="search-container">
        <div class="search-box">
          <van-icon name="search" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="search-input"
            :placeholder="$t('mobile.logs.searchPlaceholder')"
            @input="handleSearchInput"
          />
        </div>
      </div>
    </div>

    <!-- 设备列表 -->
    <div class="content">
      <van-list :finished="finished" :loading="loading" :offset="100" @load="onLoad">
        <div class="device-list">
          <div
            v-for="item in items"
            :key="item.deviceId"
            class="device-card"
            @click="$router.push({ name: 'MDeviceLogs', params: { deviceId: item.deviceId } })"
          >
            <div class="card-content">
              <!-- 中间信息 -->
              <div class="device-info">
                <div class="device-id-row">
                  <div class="device-id">{{ item.deviceId }}</div>
                  <div class="log-badge">
                    <span class="badge-text">{{ item.logCount ?? 0 }}</span>
                    <span class="badge-label">{{ $t('mobile.logs.logFilesUnit') }}</span>
                  </div>
                </div>
                <div class="hospital-name">{{ getHospitalDisplayName(item.hospitalName) }}</div>
              </div>
              
              <!-- 右侧箭头 -->
              <div class="arrow-icon">
                <van-icon name="arrow" />
              </div>
            </div>
          </div>
        </div>
      </van-list>
      
      <!-- 空状态 -->
      <van-empty
        v-if="!loading && items.length === 0 && finished"
        :description="$t('shared.noData')"
        class="empty-state"
      />
    </div>
  </div>
</template>

<script>
import { computed, ref } from 'vue'
import { List as VanList, Empty as VanEmpty, Icon as VanIcon } from 'vant'
import { useStore } from 'vuex'
import { maskHospitalName } from '@/utils/maskSensitiveData'

export default {
  name: 'MLogDevices',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon
  },
  setup() {
    const store = useStore()
    const keyword = ref('')
    const items = ref([])
    const loading = ref(false)
    const finished = ref(false)
    const page = ref(1)
    const pageSize = 20
    const total = ref(0)
    const hasDeviceReadPermission = computed(() =>
      store.getters['auth/hasPermission']?.('device:read')
    )

    const fetchPage = async () => {
      try {
        const resp = await store.dispatch('logs/fetchLogsByDevice', {
          page: page.value,
          limit: pageSize,
          device_filter: keyword.value?.trim() || undefined
        })
        const groups = resp?.data?.device_groups || []
        const pagination = resp?.data?.pagination || {}
        total.value = pagination.total || total.value || 0

        const mapped = groups.map(g => ({
          deviceId: g.device_id,
          hospitalName: g.hospital_name || '',
          logCount: g.log_count || 0
        }))

        if (page.value === 1) {
          items.value = mapped
        } else {
          items.value = items.value.concat(mapped)
        }

        // 结束条件：返回数量小于页大小，或当前数量已达到总数
        if (mapped.length < pageSize || items.value.length >= total.value) {
          finished.value = true
        } else {
          finished.value = false
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error)
        finished.value = true
      }
    }

    const onLoad = async () => {
      if (finished.value || loading.value) return
      loading.value = true
      try {
        await fetchPage()
        if (!finished.value) {
          page.value += 1
        }
      } finally {
        loading.value = false
      }
    }

    const handleSearchInput = () => {
      // 重置状态并重新加载（使用后端分页）
      items.value = []
      total.value = 0
      finished.value = false
      page.value = 1
      onLoad()
    }

    const getHospitalDisplayName = (hospitalName) => {
      if (!hospitalName || hospitalName === '-' || (typeof hospitalName === 'string' && hospitalName.trim() === '')) {
        return '-'
      }
      const masked = maskHospitalName(hospitalName, hasDeviceReadPermission.value)
      return masked || '-'
    }

    return {
      keyword,
      items,
      loading,
      finished,
      onLoad,
      handleSearchInput,
      getHospitalDisplayName
    }
  }
}
</script>

<style scoped>
.page {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  background-color: var(--m-color-bg);
  /* 底部留白由 App.vue 全局样式统一设置 */
  box-sizing: border-box;
}

/* 固定顶部区域容器 */
.fixed-header-section {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: var(--m-color-surface);
  box-shadow: var(--m-shadow-card);
}

.header {
  padding: var(--m-space-4);
  padding-top: max(var(--m-space-4), calc(env(safe-area-inset-top) + var(--m-space-2)));
  border-bottom: 1px solid var(--m-color-border);
}

.page-title {
  font-size: var(--m-font-size-xl);
  font-weight: 600;
  color: var(--m-color-text);
  margin: 0;
  line-height: 24px;
}

.search-container {
  padding: var(--m-space-3) var(--m-space-4);
  border-bottom: 1px solid var(--m-color-border);
  background-color: var(--m-color-surface);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: var(--m-color-bg);
  border-radius: var(--m-radius-md);
  padding: 0 var(--m-space-3);
  height: 36px;
}

.search-icon {
  font-size: var(--m-font-size-lg);
  color: var(--gray-400);
  margin-right: var(--m-space-2);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--m-font-size-md);
  color: var(--m-color-text);
  outline: none;
}

.search-input::placeholder {
  color: var(--gray-400);
}

.content {
  padding: 12px 16px;
  /* fixed-header-section 高度 = header (含安全区域)  + search-container (60px) */
  margin-top: calc(max(16px, calc(env(safe-area-inset-top) + 8px)) + 40px + 60px);
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.device-card {
  background-color: var(--m-color-surface);
  border-radius: var(--m-radius-md);
  overflow: hidden;
  box-shadow: var(--m-shadow-card);
  transition: all 0.3s ease;
}

.device-card:active {
  background-color: var(--m-color-bg);
  transform: scale(0.98);
}

.card-content {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  min-height: 52px;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.device-id {
  font-size: var(--m-font-size-lg);
  font-weight: 500;
  color: var(--m-color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.hospital-name {
  font-size: var(--m-font-size-md);
  color: var(--gray-500);
  margin-bottom: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-badge {
  display: inline-flex;
  align-items: center;
  background-color: var(--gray-200);
  border-radius: var(--m-radius-lg);
  padding: 2px var(--m-space-2);
  height: 22px;
  flex-shrink: 0;
  margin-left: var(--m-space-3);
}

.badge-text {
  font-size: var(--m-font-size-md);
  font-weight: 500;
  color: var(--gray-500);
}

.badge-label {
  font-size: var(--m-font-size-sm);
  color: var(--gray-500);
  margin-left: 2px;
}

.arrow-icon {
  margin-left: var(--m-space-3);
  flex-shrink: 0;
}

.arrow-icon .van-icon {
  font-size: var(--m-font-size-lg);
  color: var(--gray-400);
}

.empty-state {
  margin-top: 60px;
}

/* 加载状态优化 */
:deep(.van-list__loading) {
  padding: var(--m-space-5) 0;
  text-align: center;
  color: var(--gray-400);
  font-size: var(--m-font-size-md);
}

:deep(.van-list__finished) {
  padding: var(--m-space-5) 0;
  text-align: center;
  color: var(--gray-400);
  font-size: var(--m-font-size-md);
}
</style>
