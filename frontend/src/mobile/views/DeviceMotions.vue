<template>
  <div class="page" :style="{ paddingTop: pagePaddingTop + 'px' }">
    <div class="mobile-header" ref="headerRef">
      <div class="header-container">
        <van-icon name="arrow-left" class="back-icon" @click="$router.back()" />
        <div class="header-content">
          <div class="header-row">
            <div class="header-title">{{ deviceId }}</div>
            <div v-if="deviceInfo" class="header-hospital">
              <span class="info-text">{{ $t('mobile.deviceLogs.hospitalName') || '医院名称' }}：{{ deviceInfo.hospital || '-' }}</span>
            </div>
            <div class="header-logs">
              <span class="info-text">{{ $t('mobile.devices.runtimeData') || '运行数据' }}：<span class="info-value-primary">{{ totalMotion }}</span></span>
            </div>
          </div>
          <div class="tab-bar">
            <button class="tab-button" type="button" @click="$router.push({ name: 'MDeviceLogs', params: { deviceId } })">{{ $t('mobile.devices.logData') }}</button>
            <button class="tab-button" type="button" @click="$router.push({ name: 'MDeviceSurgeries', params: { deviceId } })">{{ $t('mobile.devices.surgeryData') }}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="filter-section" :style="{ top: headerHeight + 'px' }">
      <div class="search-box">
        <van-icon name="search" class="search-icon" />
        <input
          v-model="keyword"
          type="text"
          class="search-input"
          :placeholder="$t('mobile.devices.runtimeData') || '运行数据'"
          @input="onSearch"
        />
      </div>
    </div>

    <div class="content">
      <van-list :loading="loading" :finished="finished" :offset="100" @load="onLoad">
        <div v-for="item in items" :key="item.id" class="item-card">
          <div class="item-title">{{ item.original_name || item.file_name || ('运行数据 #' + item.id) }}</div>
          <div class="item-sub">{{ formatDate(item.file_time || item.upload_time || item.created_at) }}</div>
        </div>
      </van-list>

      <van-empty v-if="!loading && items.length === 0 && finished" :description="$t('shared.noData')" class="empty-state" />
    </div>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { List as VanList, Empty as VanEmpty, Icon as VanIcon } from 'vant'
import api from '@/api'

export default {
  name: 'MDeviceMotions',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon
  },
  setup() {
    const route = useRoute()
    const deviceId = computed(() => String(route.params?.deviceId || ''))

    const headerRef = ref(null)
    const headerHeight = ref(68)
    const pagePaddingTop = computed(() => 0)

    const keyword = ref('')
    const items = ref([])
    const loading = ref(false)
    const finished = ref(false)
    const page = ref(1)
    const limit = 20
    const totalMotion = ref(0)
    const deviceInfo = ref(null)

    const measureHeader = () => {
      nextTick(() => {
        const rect = headerRef.value?.getBoundingClientRect?.()
        if (rect?.height) headerHeight.value = rect.height
      })
    }

    const loadDeviceMeta = async () => {
      try {
        const resp = await api.motionData.listFilesByDevice({ page: 1, limit: 200, device_filter: deviceId.value })
        const groups = resp?.data?.device_groups || []
        const hit = groups.find(g => String(g.device_id) === String(deviceId.value))
        if (hit) {
          deviceInfo.value = { hospital: hit.hospital_name || '-' }
          totalMotion.value = Number(hit.data_count || 0)
        }
      } catch (_) {}
    }

    const onLoad = async () => {
      if (loading.value || finished.value) return
      loading.value = true
      try {
        const resp = await api.motionData.listFiles({
          device_id: deviceId.value,
          page: page.value,
          limit,
          keyword: keyword.value?.trim() || undefined
        })
        const rows = Array.isArray(resp?.data?.data) ? resp.data.data : []
        const total = Number(resp?.data?.total || 0)
        totalMotion.value = total
        if (!deviceInfo.value && rows.length > 0) {
          deviceInfo.value = { hospital: rows[0].hospital_name || '-' }
        }
        items.value = items.value.concat(rows)
        finished.value = items.value.length >= total || rows.length < limit
        if (!finished.value) page.value += 1
      } catch (e) {
        console.error('load motion files failed', e)
        finished.value = true
      } finally {
        loading.value = false
      }
    }

    const onSearch = () => {
      items.value = []
      page.value = 1
      finished.value = false
      onLoad()
    }

    const formatDate = (v) => {
      if (!v) return '-'
      try { return new Date(v).toLocaleString('zh-CN') } catch (_) { return String(v) }
    }

    onMounted(() => {
      measureHeader()
      loadDeviceMeta()
    })

    return {
      deviceId,
      headerRef,
      headerHeight,
      pagePaddingTop,
      keyword,
      items,
      loading,
      finished,
      totalMotion,
      deviceInfo,
      onLoad,
      onSearch,
      formatDate
    }
  }
}
</script>

<style scoped>
.page { min-height: 100%; background: var(--m-color-bg); }
.mobile-header { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: var(--m-color-surface); box-shadow: var(--m-shadow-card); }
.header-container { display: flex; align-items: flex-start; padding: max(var(--m-space-3), calc(env(safe-area-inset-top) + 8px)) var(--m-space-3) var(--m-space-2); }
.back-icon { margin-top: 2px; font-size: 20px; color: var(--m-color-text); }
.header-content { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.header-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: space-between; }
.header-title { font-size: var(--m-font-size-lg); font-weight: 600; color: var(--m-color-text); flex-shrink: 0; }
.header-hospital { flex: 1; min-width: 0; display: inline-flex; align-items: center; }
.header-logs { flex-shrink: 0; margin-left: auto; }
.info-text { font-size: var(--m-font-size-sm); color: var(--m-color-text-secondary); line-height: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.info-value-primary { color: var(--m-color-brand); font-weight: 600; margin-right: 2px; }
.tab-bar { display: flex; gap: 2px; overflow: hidden; border-bottom: 1px solid var(--m-color-border); margin-top: var(--m-space-1); }
.tab-button { flex: 1 1 0; min-width: 0; border: none; background: transparent; font-size: 13px; color: var(--m-color-text-secondary); line-height: 18px; padding: 8px 2px 10px; font-weight: 500; border-bottom: 2px solid transparent; }
.tab-button.active { color: var(--m-color-brand); border-bottom-color: var(--m-color-brand); }
.filter-section { position: fixed; left: 0; right: 0; z-index: 90; padding: var(--m-space-2) var(--m-space-3); background: var(--m-color-bg); box-shadow: var(--m-shadow-card); }
.search-box { display: flex; align-items: center; background: var(--m-color-surface); border-radius: var(--m-radius-md); padding: 0 var(--m-space-3); height: 36px; border: 1px solid var(--m-color-border); }
.search-icon { font-size: var(--m-font-size-lg); color: var(--m-color-text-tertiary); margin-right: var(--m-space-2); }
.search-input { flex: 1; border: none; background: transparent; outline: none; color: var(--m-color-text); font-size: var(--m-font-size-sm); }
.content { padding: 164px var(--m-space-3) var(--m-space-4); }
.item-card { background: var(--m-color-surface); border-radius: var(--m-radius-md); box-shadow: var(--m-shadow-card); padding: var(--m-space-3); margin-bottom: var(--m-space-3); }
.item-title { font-size: var(--m-font-size-md); color: var(--m-color-text); }
.item-sub { margin-top: 4px; font-size: var(--m-font-size-xs); color: var(--m-color-text-secondary); }
.empty-state { margin-top: 40px; }
</style>
