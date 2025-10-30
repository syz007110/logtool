<template>
  <div class="page">
    <van-nav-bar :title="$t('mobile.titles.surgeries')" fixed safe-area-inset-top />
    <div class="content">
      <van-search v-model="keyword" :placeholder="$t('logs.keywordSearchPlaceholder')" />
      <van-list :finished="finished" :loading="loading" @load="onLoad">
        <van-cell v-for="item in items" :key="item.deviceId"
                  is-link
                  :title="`${item.deviceId} | ${item.hospital}`"
                  :label="$t('logs.totalSurgeries') + ' ' + (item.count ?? 0)"
                  :to="{ name: 'MDeviceSurgeries', params: { deviceId: item.deviceId } }"/>
      </van-list>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'
import { List as VanList, Cell as VanCell, Search as VanSearch, NavBar as VanNavBar } from 'vant'
import api from '@/api'

export default {
  name: 'MSurgeriesDevices',
  components: {
    'van-list': VanList,
    'van-cell': VanCell,
    'van-search': VanSearch,
    'van-nav-bar': VanNavBar
  },
  setup() {
    const keyword = ref('')
    const items = ref([])
    const loading = ref(false)
    const finished = ref(false)
    const grouped = ref([])
    const prepared = ref(false)

    const prepareGroups = async () => {
      const surgeriesResp = await api.surgeries.list({ limit: 10000 })
      const all = surgeriesResp?.data?.data || []
      const map = new Map()
      all.forEach(s => {
        const deviceIds = s.device_ids || []
        const hospital = (Array.isArray(s.hospital_names) && s.hospital_names[0]) || s.hospital_name || '-'
        deviceIds.forEach(did => {
          if (!map.has(did)) map.set(did, { deviceId: did, hospital, count: 0 })
          map.get(did).count++
        })
      })
      grouped.value = Array.from(map.values()).sort((a,b)=>b.count-a.count)
      prepared.value = true
    }

    const page = ref(1)
    const pageSize = 20
    const onLoad = async () => {
      if (finished.value) return
      loading.value = true
      try {
        if (!prepared.value) await prepareGroups()
        const kw = (keyword.value || '').toLowerCase().trim()
        const source = kw
          ? grouped.value.filter(x => x.deviceId?.toLowerCase().includes(kw) || x.hospital?.toLowerCase().includes(kw))
          : grouped.value
        const start = (page.value - 1) * pageSize
        const next = source.slice(start, start + pageSize)
        items.value.push(...next)
        if (items.value.length >= source.length || next.length < pageSize) {
          finished.value = true
        } else {
          page.value += 1
        }
      } finally {
        loading.value = false
      }
    }
    return { keyword, items, loading, finished, onLoad }
  }
}
</script>

<style scoped>
.page { padding-top: 46px; }
.content { padding: 12px; }
</style>


