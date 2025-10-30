<template>
  <div class="page">
    <van-nav-bar :title="$t('mobile.titles.logs')" fixed safe-area-inset-top />
    <div class="content">
      <van-search v-model="keyword" :placeholder="$t('logs.keywordSearchPlaceholder')" />
      <van-list :finished="finished" :loading="loading" @load="onLoad">
        <van-cell v-for="item in items" :key="item.deviceId"
                  is-link
                  :title="`${item.deviceId} | ${item.hospital}`"
                  :label="$t('logs.logCount') + ' ' + (item.count ?? 0)"
                  :to="{ name: 'MDeviceLogs', params: { deviceId: item.deviceId } }"/>
      </van-list>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'
import { List as VanList, Cell as VanCell, Search as VanSearch, NavBar as VanNavBar } from 'vant'
import { useStore } from 'vuex'

export default {
  name: 'MLogDevices',
  components: {
    'van-list': VanList,
    'van-cell': VanCell,
    'van-search': VanSearch,
    'van-nav-bar': VanNavBar
  },
  setup() {
    const store = useStore()
    const keyword = ref('')
    const items = ref([])
    const loading = ref(false)
    const finished = ref(false)
    const page = ref(1)
    const pageSize = 20
    const fetchPage = async () => {
      const resp = await store.dispatch('logs/fetchLogsByDevice', {
        page: page.value,
        limit: pageSize,
        device_filter: keyword.value?.trim() || undefined
      })
      const groups = resp?.data?.device_groups || []
      const mapped = groups.map(g => ({
        deviceId: g.device_id,
        hospital: g.hospital_name || '-',
        count: g.log_count || 0
      }))
      items.value.push(...mapped)
      const total = resp?.data?.pagination?.total || 0
      if (items.value.length >= total || mapped.length < pageSize) {
        finished.value = true
      } else {
        page.value += 1
      }
    }
    const onLoad = async () => {
      if (finished.value) return
      loading.value = true
      try { await fetchPage() } finally { loading.value = false }
    }
    return { keyword, items, loading, finished, onLoad }
  }
}
</script>

<style scoped>
.page { padding-top: 46px; }
.content { padding: 12px; }
</style>


