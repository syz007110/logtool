<template>
  <div class="page">
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

    <!-- 设备列表 -->
    <div class="content">
      <van-list :finished="finished" :loading="loading" @load="onLoad">
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
                    <span class="badge-text">{{ item.count ?? 0 }}</span>
                    <span class="badge-label">{{ $t('mobile.logs.logFilesUnit') }}</span>
                  </div>
                </div>
                <div class="hospital-name">{{ item.hospital }}</div>
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
import { ref } from 'vue'
import { List as VanList, Empty as VanEmpty, Icon as VanIcon } from 'vant'
import { useStore } from 'vuex'

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
    const allItems = ref([])
    const page = ref(1)
    const pageSize = 20

    const fetchPage = async () => {
      try {
        const resp = await store.dispatch('logs/fetchLogsByDevice', {
          page: page.value,
          limit: 10000, // 获取所有数据进行前端筛选
          device_filter: undefined // 不在API层面筛选，由前端处理
        })
        const groups = resp?.data?.device_groups || []
        const mapped = groups.map(g => ({
          deviceId: g.device_id,
          hospital: g.hospital_name || '-',
          count: g.log_count || 0
        }))
        allItems.value = mapped
        filterAndDisplayItems()
        finished.value = true
      } catch (error) {
        console.error('Failed to fetch logs:', error)
        finished.value = true
      }
    }

    const filterAndDisplayItems = () => {
      const kw = (keyword.value || '').toLowerCase().trim()
      const filtered = kw
        ? allItems.value.filter(x => 
            x.deviceId?.toLowerCase().includes(kw) || 
            x.hospital?.toLowerCase().includes(kw)
          )
        : allItems.value
      
      // 重置并分页显示
      items.value = []
      page.value = 1
      const start = (page.value - 1) * pageSize
      items.value = filtered.slice(start, start + pageSize)
      finished.value = items.value.length >= filtered.length
    }

    const onLoad = async () => {
      if (finished.value) return
      loading.value = true
      try {
        if (allItems.value.length === 0) {
          await fetchPage()
        } else {
          // 继续加载更多
          const kw = (keyword.value || '').toLowerCase().trim()
          const filtered = kw
            ? allItems.value.filter(x => 
                x.deviceId?.toLowerCase().includes(kw) || 
                x.hospital?.toLowerCase().includes(kw)
              )
            : allItems.value
          const start = items.value.length
          const next = filtered.slice(start, start + pageSize)
          items.value.push(...next)
          if (items.value.length >= filtered.length || next.length < pageSize) {
            finished.value = true
          } else {
            page.value += 1
          }
        }
      } finally {
        loading.value = false
      }
    }

    const handleSearchInput = () => {
      // 重置状态并重新加载
      items.value = []
      finished.value = false
      page.value = 1
      onLoad()
    }

    return { keyword, items, loading, finished, onLoad, handleSearchInput }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-bottom: 20px;
}

.header {
  background-color: #fff;
  padding: 16px;
  border-bottom: 1px solid #ebedf0;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #323233;
  margin: 0;
}

.search-container {
  background-color: #fff;
  padding: 12px;
  border-bottom: 1px solid #ebedf0;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: #f7f8fa;
  border-radius: 8px;
  padding: 0 12px;
  height: 36px;
}

.search-icon {
  font-size: 16px;
  color: #969799;
  margin-right: 8px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #323233;
  outline: none;
}

.search-input::placeholder {
  color: #969799;
}

.content {
  padding: 12px;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.device-card {
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.device-card:active {
  background-color: #f7f8fa;
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
  gap: 8px;
  margin-bottom: 2px;
}

.device-id {
  font-size: 16px;
  font-weight: 500;
  color: #323233;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.hospital-name {
  font-size: 14px;
  color: #646566;
  margin-bottom: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-badge {
  display: inline-flex;
  align-items: center;
  background-color: #f0f0f0;
  border-radius: 12px;
  padding: 2px 8px;
  height: 22px;
  flex-shrink: 0;
}

.badge-text {
  font-size: 14px;
  font-weight: 500;
  color: #646566;
}

.badge-label {
  font-size: 12px;
  color: #646566;
  margin-left: 2px;
}

.arrow-icon {
  margin-left: 12px;
  flex-shrink: 0;
}

.arrow-icon .van-icon {
  font-size: 16px;
  color: #969799;
}

.empty-state {
  margin-top: 60px;
}

/* 加载状态优化 */
:deep(.van-list__loading) {
  padding: 20px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}

:deep(.van-list__finished) {
  padding: 20px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}
</style>
