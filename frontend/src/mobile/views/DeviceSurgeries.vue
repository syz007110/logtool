<template>
  <div class="page">
    <van-nav-bar :title="title" left-arrow @click-left="$router.back()" fixed safe-area-inset-top />
    <div class="content">
      <van-list :finished="finished" :loading="loading" @load="onLoad">
        <van-cell v-for="row in rows" :key="row.id"
                  :title="row.id"
                  :label="formatRange(row.start_time, row.end_time)">
          <template #right-icon>
            <van-button size="small" type="primary">{{ $t('logs.view') }}</van-button>
          </template>
        </van-cell>
      </van-list>
    </div>
  </div>
</template>

<script>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { List as VanList, Cell as VanCell, NavBar as VanNavBar, Button as VanButton } from 'vant'
import api from '@/api'

export default {
  name: 'MDeviceSurgeries',
  components: {
    'van-list': VanList,
    'van-cell': VanCell,
    'van-nav-bar': VanNavBar,
    'van-button': VanButton
  },
  setup() {
    const route = useRoute()
    const { t } = useI18n()
    const deviceId = route.params?.deviceId || ''
    const title = computed(() => `${deviceId} - ${t('surgeryStatistics.title')}`)
    const rows = ref([])
    const loading = ref(false)
    const finished = ref(false)
    const page = ref(1)
    const pageSize = 20
    const fetchPage = async () => {
      const resp = await api.surgeries.list({ device_id: deviceId, page: page.value, limit: pageSize })
      const list = resp?.data?.data || []
      rows.value.push(...list)
      const total = resp?.data?.total || 0
      if (rows.value.length >= total || list.length < pageSize) {
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
    const formatRange = (s, e) => {
      return `${s || '-'} ~ ${e || '-'}`
    }
    return { title, rows, loading, finished, onLoad, formatRange }
  }
}
</script>

<style scoped>
.page { padding-top: 46px; }
.content { padding: 12px; }
</style>


