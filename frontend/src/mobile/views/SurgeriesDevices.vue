<template>
  <div class="page">
    <!-- 顶部标题栏 -->
    <div class="header">
      <h1 class="page-title">{{ $t('mobile.titles.surgeries') }}</h1>
    </div>
    
    <!-- 搜索框 -->
    <div class="search-container">
      <div class="search-box">
        <van-icon name="search" class="search-icon" />
        <input
          v-model="keyword"
          type="text"
          class="search-input"
          :placeholder="$t('mobile.surgeries.searchPlaceholder')"
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
            @click="$router.push({ name: 'MDeviceSurgeries', params: { deviceId: item.deviceId } })"
          >
            <div class="card-content">
              <!-- 左侧图标 -->
              <div class="device-icon">
                <van-icon name="orders-o" />
              </div>
              
              <!-- 中间信息 -->
              <div class="device-info">
                <div class="device-id">{{ item.deviceId }}</div>
                <div class="hospital-name">{{ item.hospital }}</div>
                <div class="surgery-badge">
                  <span class="badge-text">{{ item.count ?? 0 }}</span>
                  <span class="badge-label">{{ $t('mobile.surgeries.surgeriesUnit') }}</span>
                </div>
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
import api from '@/api'

export default {
  name: 'MSurgeriesDevices',
  components: {
    'van-list': VanList,
    'van-empty': VanEmpty,
    'van-icon': VanIcon
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
    
    const handleSearchInput = () => {
      // 重置状态并重新加载
      page.value = 1
      items.value = []
      finished.value = false
      onLoad()
    }
    
    return { keyword, items, loading, finished, onLoad, handleSearchInput }
  }
}
</script>

<style scoped>
.page {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  background-color: #f7f8fa;
  /* 底部留白由 App.vue 全局样式统一设置 */
  box-sizing: border-box;
}

.header {
  background-color: #fff;
  padding: 16px;
  /* 为顶部添加安全区域适配，防止被前置摄像头遮挡 */
  padding-top: max(16px, env(safe-area-inset-top) + 8px);
  border-bottom: 1px solid #ebedf0;
}

.page-title {
  font-size: 20px;
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
  display: flex;
  align-items: center;
  background-color: #f7f8fa;
  border-radius: 8px;
  padding: 8px 12px;
  position: relative;
}

.search-icon {
  color: #969799;
  font-size: 16px;
  margin-right: 8px;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #323233;
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
  padding: 16px;
}

.device-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #ecf5ff;
  border-radius: 8px;
  margin-right: 12px;
  flex-shrink: 0;
}

.device-icon .van-icon {
  font-size: 20px;
  color: #1989fa;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-id {
  font-size: 16px;
  font-weight: 500;
  color: #323233;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hospital-name {
  font-size: 14px;
  color: #646566;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.surgery-badge {
  display: inline-flex;
  align-items: center;
  background-color: #ecf5ff;
  border-radius: 12px;
  padding: 2px 8px;
  height: 22px;
}

.badge-text {
  font-size: 14px;
  font-weight: 500;
  color: #1989fa;
}

.badge-label {
  font-size: 12px;
  color: #1989fa;
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


