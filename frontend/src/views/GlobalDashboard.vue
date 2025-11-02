<template>
  <div class="global-dashboard">
    <a-card :title="$t('globalDashboard.title')" :bordered="false">
      <a-row :gutter="24">

        <a-col :span="8">
          <a-card class="stat-card">
            <a-statistic
              :title="$t('globalDashboard.errorCodesCount')"
              :value="displayStats.errorCodesCount"
              :loading="loading"
              value-style="{ color: '#1890ff' }"
            >
              <template #prefix>
                <OrderedListOutlined style="color: #1890ff" />
              </template>
            </a-statistic>
          </a-card>
        </a-col>
        
        <a-col :span="8">
          <a-card class="stat-card">
            <a-statistic
              :title="$t('globalDashboard.devicesCount')"
              :value="displayStats.devicesCount"
              :loading="loading"
              value-style="{ color: '#3f8600' }"
            >
              <template #prefix>
                <FileTextOutlined style="color: #3cb371" />
              </template>
            </a-statistic>
          </a-card>
        </a-col>
        

        <a-col :span="8">
          <a-card class="stat-card">
            <a-statistic
              :title="$t('globalDashboard.usersCount')"
              :value="displayStats.usersCount"
              :loading="loading"
              value-style="{ color: '#722ed1' }"
            >
              <template #prefix>
                <TeamOutlined style="color: #722ed1" />
              </template>
            </a-statistic>
          </a-card>
        </a-col>
      </a-row>
      
      <a-divider />
      
      <a-row>
        <a-col :span="24">
          <a-card :title="$t('globalDashboard.systemOverview')" size="small">
            <p class="min-w-0 one-line-ellipsis" :title="$t('globalDashboard.systemOverview')"></p>
          </a-card>
        </a-col>
      </a-row>
    </a-card>
  </div>
</template>

<script>
import { ref, onMounted, reactive, watch, onBeforeUnmount } from 'vue'
import { BugOutlined, DatabaseOutlined, TeamOutlined ,FileTextOutlined ,OrderedListOutlined} from '@ant-design/icons-vue'
import api from '../api'

export default {
  name: 'GlobalDashboard',
  components: {
    BugOutlined,
    DatabaseOutlined,
    TeamOutlined,
    FileTextOutlined,
    OrderedListOutlined
  },
  setup() {
    const loading = ref(false)
    const stats = ref({
      usersCount: 0,
      errorCodesCount: 0,
      devicesCount: 0
    })

    // 展示用的动态数值，带增长动画
    const displayStats = reactive({
      errorCodesCount: 0,
      devicesCount: 0,
      usersCount: 0
    })

    // 记录每个属性的动画帧，便于更新时取消旧动画
    const animationFrameIds = new Map()

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

    const animatePropertyTo = (propKey, toValue, duration = 1200) => {
      // 取消之前的动画
      const prevId = animationFrameIds.get(propKey)
      if (prevId) {
        cancelAnimationFrame(prevId)
      }

      const fromValue = Number(displayStats[propKey] || 0)
      const targetValue = Math.max(0, Number(toValue || 0))
      if (fromValue === targetValue) return

      const startTime = performance.now()

      const step = (now) => {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = easeOutCubic(progress)
        const current = Math.round(fromValue + (targetValue - fromValue) * eased)
        displayStats[propKey] = current
        if (progress < 1) {
          const id = requestAnimationFrame(step)
          animationFrameIds.set(propKey, id)
        }
      }

      const id = requestAnimationFrame(step)
      animationFrameIds.set(propKey, id)
    }

    const loadStats = async () => {
      try {
        loading.value = true
        const response = await api.dashboard.getStats()
        if (response.data.success) {
          stats.value = response.data.data
        }
      } catch (error) {
        console.error('加载统计数据失败:', error)
      } finally {
        loading.value = false
      }
    }

    // 当统计数据发生变化时，触发动画到目标值
    watch(stats, (newStats) => {
      if (!newStats) return
      const keys = ['errorCodesCount', 'devicesCount', 'usersCount']
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(newStats, key)) {
          animatePropertyTo(key, newStats[key])
        }
      })
    })

    onBeforeUnmount(() => {
      // 清理动画帧
      animationFrameIds.forEach((id) => cancelAnimationFrame(id))
      animationFrameIds.clear()
    })

    onMounted(() => {
      loadStats()
    })

    return {
      loading,
      stats,
      displayStats,
      loadStats
    }
  }
}
</script>

<style scoped>
.global-dashboard {
  padding: 20px;
}

.stat-card {
  text-align: center;
  height: 100%;
}

.stat-description {
  margin-top: 8px;
  color: #666;
  font-size: 12px;
}

.ant-statistic-title {
  font-size: 16px;
  font-weight: 500;
}

.ant-statistic-content {
  font-size: 24px;
  font-weight: bold;
}

/* 自定义图标样式 */
.custom-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 8px;
}

.custom-icon img {
  width: 100%;
  height: 100%;
  filter: brightness(0) saturate(100%) invert(48%) sepia(79%) saturate(2476%) hue-rotate(86deg) brightness(118%) contrast(119%);
}
</style>
