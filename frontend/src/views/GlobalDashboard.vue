<template>
  <div class="global-dashboard">
    <a-card title="全局看板" :bordered="false">
      <a-row :gutter="24">

        <a-col :span="8">
          <a-card class="stat-card">
            <a-statistic
              title="故障码总数"
              :value="stats.errorCodesCount"
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
              title="日志总数"
              :value="stats.logEntriesCount"
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
              title="用户数量"
              :value="stats.usersCount"
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
          <a-card title="系统概览" size="small">
            <p></p>
          </a-card>
        </a-col>
      </a-row>
    </a-card>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
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
      logEntriesCount: 0,
      logsCount: 0,
      usersCount: 0
    })

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

    onMounted(() => {
      loadStats()
    })

    return {
      loading,
      stats,
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
