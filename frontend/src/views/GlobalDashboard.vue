<template>
  <div class="global-dashboard">
    <el-card class="main-card">
      <template #header>
        <div class="card-header">
          <span>{{ $t('globalDashboard.title') }}</span>
        </div>
      </template>
      <el-row :gutter="24">
        <el-col :span="8">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon" style="color: var(--blue-500);">
                <el-icon :size="32"><List /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-title">{{ $t('globalDashboard.errorCodesCount') }}</div>
                <div class="stat-value" style="color: var(--blue-500);">
                  <el-skeleton v-if="loading" :rows="1" animated />
                  <span v-else>{{ displayStats.errorCodesCount }}</span>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="8">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon" style="color: var(--green-500);">
                <el-icon :size="32"><Document /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-title">{{ $t('globalDashboard.devicesCount') }}</div>
                <div class="stat-value" style="color: var(--green-500);">
                  <el-skeleton v-if="loading" :rows="1" animated />
                  <span v-else>{{ displayStats.devicesCount }}</span>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-content">
              <div class="stat-icon" style="color: var(--purple-500);">
                <el-icon :size="32"><User /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-title">{{ $t('globalDashboard.usersCount') }}</div>
                <div class="stat-value" style="color: var(--purple-500);">
                  <el-skeleton v-if="loading" :rows="1" animated />
                  <span v-else>{{ displayStats.usersCount }}</span>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
      
      <el-divider />
      
      <el-row>
        <el-col :span="24">
          <el-card :title="$t('globalDashboard.systemOverview')" shadow="never">
            <template #header>
              <div class="card-header">
                <span>{{ $t('globalDashboard.systemOverview') }}</span>
                <el-tag size="small" class="version-tag">v{{ appVersion }}</el-tag>
              </div>
            </template>
            <div v-if="changelogCurrent" class="system-overview-content">
              <div class="release-notes-label">{{ $t('globalDashboard.releaseNotes') }}</div>
              <pre class="changelog-text">{{ changelogCurrent }}</pre>
            </div>
            <p v-else class="system-overview-text">{{ $t('globalDashboard.systemOverview') }}</p>
          </el-card>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script>
import { ref, onMounted, reactive, watch, onBeforeUnmount } from 'vue'
import { List, Document, User } from '@element-plus/icons-vue'
import api from '../api'

export default {
  name: 'GlobalDashboard',
  components: {
    List,
    Document,
    User
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

    /* eslint-disable no-undef */
    const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '-'
    const changelogCurrent = typeof __APP_CHANGELOG_CURRENT__ !== 'undefined' ? __APP_CHANGELOG_CURRENT__ : ''
    /* eslint-enable no-undef */

    return {
      loading,
      stats,
      displayStats,
      loadStats,
      appVersion,
      changelogCurrent
    }
  }
}
</script>

<style scoped>
.global-dashboard {
  height: 100%;
  background: var(--black-white-white);
  padding: 24px;
  overflow: auto;
}

.main-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
}

.main-card :deep(.el-card__body) {
  padding: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
  color: var(--gray-900);
  font-size: 16px;
}

.stat-card {
  height: 100%;
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  transition: all 0.3s;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.stat-card :deep(.el-card__body) {
  padding: 24px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  background: var(--gray-50);
}

.stat-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-title {
  font-size: 14px;
  color: var(--gray-600);
  font-weight: 500;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
}

.version-tag {
  margin-left: 0;
}

.system-overview-content {
  color: var(--gray-700);
  font-size: 14px;
  overflow: visible;
  min-height: 0;
}

.release-notes-label {
  font-weight: 600;
  color: var(--gray-900);
  margin-bottom: 8px;
}

.changelog-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--gray-600);
  max-height: 280px;
  overflow-y: auto;
}

.system-overview-text {
  color: var(--gray-600);
  font-size: 14px;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .global-dashboard {
    padding: 16px;
  }
  
  .stat-content {
    flex-direction: column;
    text-align: center;
  }
  
  .stat-value {
    font-size: 24px;
  }
}
</style>
