<template>
  <div class="page-shell" :style="{ '--detail-header-height': headerHeight + 'px' }">
    <div class="mobile-header" ref="headerRef">
      <div class="header-container">
        <van-icon name="arrow-left" class="back-icon" @click="goBack" />
        <div class="header-content">
          <div class="header-row">
            <div class="header-title">{{ deviceId }}</div>
            <div v-if="currentHospital" class="header-hospital-content">{{ currentHospital }}</div>
            <div class="header-logs">
              <span class="info-text">{{ currentCountLabel }}：<span class="info-value-primary">{{ currentCount }}</span></span>
            </div>
          </div>
          <div class="tab-section">
            <div class="tab-row">
              <button
                v-for="tab in tabs"
                :key="tab.key"
                class="tab-button"
                :class="{ active: activeTab === tab.key }"
                type="button"
                @click="switchTab(tab.key)"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-content" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <div v-if="showSkeleton" class="skeleton-wrap" aria-hidden="true">
        <div class="skeleton-card" v-for="i in 3" :key="i">
          <van-skeleton title :row="3" :loading="true" />
        </div>
      </div>

      <template v-else>
        <section class="tab-pane" v-if="activeTab === 'logs'">
          <DeviceLogs v-if="mountedTabs.logs" ref="logsViewRef" />
        </section>
        <section class="tab-pane" v-else-if="activeTab === 'surgeries'">
          <DeviceSurgeries v-if="mountedTabs.surgeries" ref="surgeriesViewRef" />
        </section>
      </template>
    </div>

    <div v-if="activeTab === 'surgeries' && mountedTabs.surgeries" class="search-fab-container">
      <button class="search-fab" :class="{ 'has-filters': surgeriesSearchActive }" type="button" @click="toggleSurgeriesSearch">
        <van-icon name="search" />
      </button>
    </div>
  </div>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon as VanIcon } from 'vant'
import api from '@/api'
import DeviceLogs from './DeviceLogs.vue'
import DeviceSurgeries from './DeviceSurgeries.vue'

const ROUTE_TAB_MAP = {
  MDeviceLogs: 'logs',
  MDeviceSurgeries: 'surgeries',
  MDeviceMotions: 'logs'
}

export default {
  name: 'MDeviceDetailTabs',
  components: {
    'van-icon': VanIcon,
    DeviceLogs,
    DeviceSurgeries
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const translateOr = (key, fallback) => {
      const result = t(key)
      return result === key ? fallback : result
    }

    const headerRef = ref(null)
    const headerHeight = ref(0)
    const logsViewRef = ref(null)
    const surgeriesViewRef = ref(null)
    const entering = ref(true)
    const touchStartX = ref(0)
    const hospitalFallback = ref('')

    const deviceId = computed(() => String(route.params?.deviceId || ''))

    const resolveTabByRoute = () => ROUTE_TAB_MAP[route.name] || 'logs'
    const activeTab = ref(resolveTabByRoute())
    const mountedTabs = ref({ logs: false, surgeries: false })
    mountedTabs.value[activeTab.value] = true

    const tabs = computed(() => ([
      { key: 'logs', label: translateOr('mobile.devices.logData', '日志数据') },
      { key: 'surgeries', label: translateOr('mobile.devices.surgeryData', '手术数据') }
    ]))

    const tabIndexMap = { logs: 0, surgeries: 1 }
    const tabKeyByIndex = ['logs', 'surgeries']


    const currentHospital = computed(() => {
      const values = [
        logsViewRef.value?.deviceInfo?.hospital,
        surgeriesViewRef.value?.deviceInfo?.hospital,
        hospitalFallback.value
      ]
      return values.find(v => v && v !== '-') || ''
    })

    const currentCount = computed(() => {
      if (activeTab.value === 'surgeries') return Number(surgeriesViewRef.value?.totalSurgeries || 0)
      return Number(logsViewRef.value?.totalLogs || 0)
    })

    const currentCountLabel = computed(() => {
      if (activeTab.value === 'surgeries') return translateOr('logs.totalSurgeries', '手术总数')
      return translateOr('logs.logCount', '日志总数')
    })

    const measureHeader = () => {
      nextTick(() => {
        const rect = headerRef.value?.getBoundingClientRect?.()
        if (rect?.height) {
          headerHeight.value = rect.height
        }
      })
    }

    const fetchHospitalFallback = async () => {
      try {
        const [logRes, surgeryRes] = await Promise.all([
          api.logs.getList({ device_id: deviceId.value, page: 1, limit: 1 }),
          api.surgeries.list({ device_id: deviceId.value, page: 1, limit: 1 })
        ])
        const logHospital = logRes?.data?.logs?.[0]?.hospital_name
        const surgeryHospital = surgeryRes?.data?.data?.[0]?.hospital_name
        hospitalFallback.value = logHospital || surgeryHospital || ''
      } catch (_) {}
    }

    const switchTab = (tabKey) => {
      if (activeTab.value === tabKey) return
      activeTab.value = tabKey
      mountedTabs.value[tabKey] = true
      measureHeader()
    }

    const onTouchStart = (e) => {
      touchStartX.value = e?.changedTouches?.[0]?.clientX || 0
    }

    const onTouchEnd = (e) => {
      const endX = e?.changedTouches?.[0]?.clientX || 0
      const delta = endX - touchStartX.value
      if (Math.abs(delta) < 56) return
      const idx = tabIndexMap[activeTab.value] ?? 0
      const next = delta < 0 ? Math.min(1, idx + 1) : Math.max(0, idx - 1)
      const tabKey = tabKeyByIndex[next]
      if (tabKey) switchTab(tabKey)
    }

    const goBack = () => {
      router.push({ name: 'MDevices' })
    }

    const surgeriesSearchActive = computed(() => Boolean(surgeriesViewRef.value?.showSearch))

    const showSkeleton = computed(() => false)

    const toggleSurgeriesSearch = () => {
      surgeriesViewRef.value?.toggleSearch?.()
    }

    watch(() => route.name, () => {
      const targetTab = resolveTabByRoute()
      if (targetTab !== activeTab.value) {
        activeTab.value = targetTab
      }
      mountedTabs.value[targetTab] = true
      measureHeader()
    })

    watch(() => route.params?.deviceId, () => {
      entering.value = true
      hospitalFallback.value = ''
      fetchHospitalFallback()
      setTimeout(() => { entering.value = false }, 420)
    })

    onMounted(() => {
      measureHeader()
      fetchHospitalFallback()
      setTimeout(() => { entering.value = false }, 420)
      window.addEventListener('resize', measureHeader)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', measureHeader)
    })

    return {
      headerRef,
      headerHeight,
      deviceId,
      tabs,
      activeTab,
      mountedTabs,
      logsViewRef,
      surgeriesViewRef,
      currentHospital,
      currentCount,
      currentCountLabel,
      showSkeleton,
      switchTab,
      onTouchStart,
      onTouchEnd,
      goBack,
      surgeriesSearchActive,
      toggleSurgeriesSearch
    }
  }
}
</script>

<style scoped>
.page-shell {
  min-height: 100%;
  background: var(--m-color-bg);
}

.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 120;
  background: var(--m-color-surface);
  box-shadow: var(--m-shadow-card);
}

.header-container {
  display: flex;
  align-items: flex-start;
  padding: max(var(--m-space-4), calc(env(safe-area-inset-top) + var(--m-space-2))) var(--m-space-3) var(--m-space-2);
}

.back-icon {
  margin-top: 2px;
  font-size: 20px;
  color: var(--m-color-text);
}

.header-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  min-width: 0;
}

.header-title {
  font-size: var(--m-font-size-lg);
  font-weight: 600;
  color: var(--m-color-text);
  flex-shrink: 0;
}

.header-hospital-content {
  flex: 1;
  min-width: 0;
  color: var(--m-color-text-secondary);
  font-size: var(--m-font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-logs {
  flex-shrink: 0;
  margin-left: auto;
}

.info-text {
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-value-primary {
  color: var(--m-color-brand);
  font-weight: 600;
  margin-right: 2px;
}

.tab-section {
  display: flex;
  flex-direction: column;
  margin-top: var(--m-space-1);
}

.tab-row {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--m-color-border);
}

.tab-button {
  flex: 1;
  border: none;
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  color: var(--m-color-text-secondary);
  line-height: 18px;
  padding: 8px 2px 10px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
}

.tab-button.active {
  background-color: transparent;
  color: var(--m-color-brand);
  border-bottom-color: var(--m-color-brand);
  box-shadow: none;
}

.detail-content {
  min-height: 100vh;
  position: relative;
}

.tab-pane {
  min-height: 100vh;
}

.skeleton-wrap {
  padding: calc(var(--detail-header-height) + var(--m-space-3)) var(--m-space-3) var(--m-space-3);
  background: var(--m-color-bg);
}

.skeleton-card {
  background: var(--m-color-surface);
  border-radius: var(--m-radius-md);
  box-shadow: var(--m-shadow-card);
  padding: var(--m-space-3);
  margin-bottom: var(--m-space-3);
}

.search-fab-container {
  position: fixed;
  right: 16px;
  bottom: 80px;
  z-index: 220;
}

.search-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid var(--m-color-border);
  background: var(--m-color-surface);
  color: var(--m-color-text);
  box-shadow: var(--m-shadow-card);
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-fab.has-filters {
  background: var(--m-color-brand);
  border-color: var(--m-color-brand);
  color: var(--m-color-surface);
}

.search-fab :deep(.van-icon) {
  font-size: 24px;
}

.tab-pane :deep(.mobile-header) {
  display: none !important;
}

.tab-pane :deep(.page) {
  padding-top: var(--detail-header-height) !important;
}

.tab-pane :deep(.filter-section) {
  top: var(--detail-header-height) !important;
}

.tab-pane :deep(.top-stack-fixed) {
  top: var(--detail-header-height) !important;
}
</style>
