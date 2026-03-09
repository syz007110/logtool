<template>
  <div class="page">
    <div class="fixed-header-section">
      <div class="header">
        <h1 class="page-title">{{ $t('mobile.titles.devices') }}</h1>
      </div>

      <div class="search-container">
        <div class="search-box">
          <van-icon name="search" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="search-input"
            :placeholder="$t('mobile.devices.searchPlaceholder')"
            @input="handleSearchInput"
          />
        </div>
      </div>
    </div>

    <div class="content">
      <van-list :finished="finished" :loading="loading" :offset="100" @load="onLoad">
        <div class="device-list">
          <button
            v-for="item in items"
            :key="item.deviceId"
            class="device-card"
            type="button"
            @click="openDevice(item.deviceId)"
          >
            <div class="card-row-top">
              <div class="device-id">{{ item.deviceId }}</div>
              <div class="hospital-name">{{ getHospitalDisplayName(item.hospitalName) }}</div>
            </div>

            <div class="card-row-tags">
              <span class="data-tag data-tag--log">{{ $t('mobile.devices.logData') }} {{ item.logCount ?? 0 }}</span>
              <span class="data-tag data-tag--surgery">{{ $t('mobile.devices.surgeryData') }} {{ item.surgeryCount ?? 0 }}</span>
              <span class="data-tag data-tag--runtime">{{ $t('mobile.devices.runtimeData') || '运行数据' }} {{ item.motionCount ?? 0 }}</span>
            </div>
          </button>
        </div>
      </van-list>

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
import { useRouter } from 'vue-router'
import api from '@/api'
import { maskHospitalName } from '@/utils/maskSensitiveData'

export default {
  name: 'MDevices',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon
  },
  setup() {
    const router = useRouter()
    const store = useStore()

    const keyword = ref('')
    const loading = ref(false)
    const finished = ref(false)
    const prepared = ref(false)
    const groupedDevices = ref([])
    const items = ref([])
    const page = ref(1)
    const pageSize = 20
    const searchTimer = ref(null)

    const hasDeviceReadPermission = computed(() =>
      store.getters['auth/hasPermission']?.('device:read')
    )

    const parseTs = (value) => {
      if (!value) return 0
      const parsed = Date.parse(value)
      return Number.isNaN(parsed) ? 0 : parsed
    }

    const collectPagedGroups = async (fetcher) => {
      const result = []
      let currentPage = 1
      let hasNext = true
      const limit = 200
      const maxPages = 80

      while (hasNext && currentPage <= maxPages) {
        const resp = await fetcher({ page: currentPage, limit })
        const groups = resp?.data?.device_groups || []
        result.push(...groups)

        const pagination = resp?.data?.pagination || {}
        if (typeof pagination.has_next === 'boolean') {
          hasNext = pagination.has_next
        } else {
          hasNext = groups.length === limit
        }

        currentPage += 1
      }

      return result
    }

    const prepareGroups = async () => {
      const kw = keyword.value?.trim() || ''
      const mergedMap = new Map()

      const upsertDevice = (deviceId, updater) => {
        const key = String(deviceId || '').trim() || '未知设备'
        if (!mergedMap.has(key)) {
          mergedMap.set(key, {
            deviceId: key,
            hospitalName: '',
            logCount: 0,
            surgeryCount: 0,
            motionCount: 0,
            latestTs: 0
          })
        }
        const target = mergedMap.get(key)
        updater(target)
      }

      const [logGroups, surgeryGroups, motionGroups] = await Promise.all([
        collectPagedGroups((params) => store.dispatch('logs/fetchLogsByDevice', {
          ...params,
          device_filter: kw || undefined
        })),
        collectPagedGroups((params) => api.surgeries.getByDevice({
          ...params,
          keyword: kw || undefined
        })),
        collectPagedGroups((params) => api.motionData.listFilesByDevice({
          ...params,
          device_filter: kw || undefined
        }))
      ])

      logGroups.forEach((group) => {
        upsertDevice(group.device_id, (target) => {
          target.logCount = Number(group.log_count || 0)
          target.hospitalName = target.hospitalName || group.hospital_name || ''
          target.latestTs = Math.max(target.latestTs, parseTs(group.latest_update_time))
        })
      })

      surgeryGroups.forEach((group) => {
        upsertDevice(group.device_id, (target) => {
          target.surgeryCount = Number(group.surgery_count || 0)
          target.hospitalName = target.hospitalName || group.hospital_name || ''
          target.latestTs = Math.max(target.latestTs, parseTs(group.latest_surgery_time))
        })
      })

      motionGroups.forEach((group) => {
        upsertDevice(group.device_id, (target) => {
          target.motionCount = Number(group.data_count || 0)
          target.hospitalName = target.hospitalName || group.hospital_name || ''
          target.latestTs = Math.max(target.latestTs, parseTs(group.latest_upload_time))
        })
      })

      groupedDevices.value = Array.from(mergedMap.values()).sort((a, b) => {
        const timeDiff = (b.latestTs || 0) - (a.latestTs || 0)
        if (timeDiff !== 0) return timeDiff
        return String(a.deviceId).localeCompare(String(b.deviceId))
      })
      prepared.value = true
    }

    const onLoad = async () => {
      if (loading.value || finished.value) return
      loading.value = true
      try {
        if (!prepared.value) {
          await prepareGroups()
        }

        const start = (page.value - 1) * pageSize
        const next = groupedDevices.value.slice(start, start + pageSize)

        if (page.value === 1) {
          items.value = [...next]
        } else {
          items.value = items.value.concat(next)
        }

        if (items.value.length >= groupedDevices.value.length || next.length < pageSize) {
          finished.value = true
        } else {
          page.value += 1
        }
      } catch (error) {
        console.error('Failed to load devices page:', error)
        finished.value = true
      } finally {
        loading.value = false
      }
    }

    const resetAndReload = () => {
      page.value = 1
      items.value = []
      prepared.value = false
      finished.value = false
      onLoad()
    }

    const handleSearchInput = () => {
      if (searchTimer.value) {
        clearTimeout(searchTimer.value)
      }
      searchTimer.value = setTimeout(() => {
        resetAndReload()
      }, 260)
    }

    const openDevice = (deviceId) => {
      router.push({ name: 'MDeviceLogs', params: { deviceId } })
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
      getHospitalDisplayName,
      openDevice
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100%;
  background-color: var(--m-color-bg);
  box-sizing: border-box;
}

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
  font-weight: var(--m-font-weight-semibold);
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
  display: flex;
  align-items: center;
  background-color: var(--m-color-bg);
  border-radius: var(--m-radius-md);
  padding: 0 var(--m-space-3);
  height: 36px;
}

.search-icon {
  font-size: var(--m-font-size-lg);
  color: var(--m-color-text-tertiary);
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
  color: var(--m-color-text-tertiary);
}

.content {
  padding: var(--m-space-3) var(--m-space-4);
  margin-top: calc(max(16px, calc(env(safe-area-inset-top) + 8px)) + 40px + 60px);
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
}

.device-card {
  width: 100%;
  border: none;
  background-color: var(--m-color-surface);
  border-radius: var(--m-radius-md);
  box-shadow: var(--m-shadow-card);
  padding: var(--m-space-3);
  text-align: left;
}

.device-card:active {
  transform: scale(0.99);
  background-color: var(--m-color-surface-soft);
}

.card-row-top {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin-bottom: var(--m-space-2);
}

.device-id {
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--m-font-size-lg);
  font-weight: var(--m-font-weight-semibold);
  color: var(--m-color-text);
}

.hospital-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
}

.hospital-name::before {
  content: '|';
  margin-right: var(--m-space-2);
  color: var(--m-color-border-strong);
}

.card-row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2);
}

.data-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--m-space-2);
  border-radius: var(--m-radius-pill);
  font-size: var(--m-font-size-xs);
  line-height: 18px;
}

.data-tag--log {
  background: var(--m-color-info-bg);
  color: var(--m-color-info-text);
}

.data-tag--surgery {
  background: var(--m-color-success-bg);
  color: var(--m-color-success-text);
}

.data-tag--runtime {
  background: var(--m-color-warning-bg);
  color: var(--m-color-warning-text);
}

.empty-state {
  margin-top: 40px;
}
</style>
