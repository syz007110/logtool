<template>
  <div class="page">
    <van-nav-bar :title="title" left-arrow @click-left="$router.back()" fixed safe-area-inset-top />
    <div class="content">
      <van-list :finished="finished" :loading="loading" @load="onLoad">
        <van-skeleton v-if="loading" title :row="3" />
        <van-cell v-for="log in logs" :key="log.id"
                  :title="log.original_name || '-'"
                  :label="(log.uploader_id ? ('ID:' + log.uploader_id + ' ') : '') + (log.status || '')">
          <template #right-icon>
            <van-dropdown-menu>
              <van-dropdown-item :options="actions" @change="(val)=>handleAction(log, val.action)" />
            </van-dropdown-menu>
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
import { List as VanList, Cell as VanCell, NavBar as VanNavBar, Skeleton as VanSkeleton, DropdownMenu, DropdownItem } from 'vant'
import api from '@/api'
import { useRouter } from 'vue-router'

export default {
  name: 'MDeviceLogs',
  components: {
    'van-list': VanList,
    'van-cell': VanCell,
    'van-nav-bar': VanNavBar,
    'van-skeleton': VanSkeleton,
    'van-dropdown-menu': DropdownMenu,
    'van-dropdown-item': DropdownItem
  },
  setup() {
    const route = useRoute()
    const { t } = useI18n()
    const router = useRouter()
    const deviceId = route.params?.deviceId || ''
    const title = computed(() => `${deviceId} - ${t('logs.title')}`)
    const logs = ref([])
    const loading = ref(false)
    const finished = ref(false)
    const page = ref(1)
    const pageSize = 20
    const actions = [
      { text: t('logs.view') || 'View', action: 'view' },
      { text: t('logs.reparse') || 'Reparse', action: 'reparse' },
      { text: t('shared.delete') || 'Delete', action: 'delete' }
    ]
    const selectedAction = ref(null)

    const fetchPage = async () => {
      const resp = await api.logs.getList({ page: page.value, limit: pageSize, device_id: deviceId })
      const list = resp?.data?.logs || []
      logs.value.push(...list)
      const total = resp?.data?.total || 0
      if (logs.value.length >= total || list.length < pageSize) {
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

    const handleAction = async (log, action) => {
      switch (action) {
        case 'view':
          router.push({ name: 'BatchAnalysisStandalone', params: { logIds: log.id } })
          break
        case 'reparse':
          try { await api.logs.reparse(log.id); page.value = 1; logs.value = []; finished.value = false; await fetchPage() } catch (_) {}
          break
        case 'delete':
          try { await api.logs.delete(log.id); page.value = 1; logs.value = []; finished.value = false; await fetchPage() } catch (_) {}
          break
      }
    }

    return { title, logs, loading, finished, onLoad, actions, selectedAction, handleAction }
  }
}
</script>

<style scoped>
.page { padding-top: 46px; }
.content { padding: 12px; }
</style>


