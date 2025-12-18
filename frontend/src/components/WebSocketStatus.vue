<template>
  <div class="websocket-status">
    <el-tag 
      :type="statusType" 
      size="small"
      :class="{ 'status-indicator': true }"
    >
      <el-icon class="status-icon">
        <component :is="statusIcon" />
      </el-icon>
      {{ statusText }}
    </el-tag>
    
    <!-- 连接详情 -->
    <el-popover
      placement="bottom-end"
      width="300"
      trigger="hover"
      popper-class="websocket-status-popover"
    >
      <template #reference>
        <el-button 
          type="text" 
          size="small"
          class="status-details-btn"
        >
          <el-icon><InfoFilled /></el-icon>
        </el-button>
      </template>
      
      <div class="websocket-status-details">
        <h4>WebSocket 连接状态</h4>
        <div class="status-item">
          <span class="label">连接状态:</span>
          <span :class="['value', `status-${connectionStatus}`]">
            {{ getStatusText(connectionStatus) }}
          </span>
        </div>
        <div class="status-item">
          <span class="label">订阅设备:</span>
          <span class="value">{{ subscribedDevices.length }} 个</span>
        </div>
        <div v-if="subscribedDevices.length > 0" class="device-list">
          <div class="device-item" v-for="deviceId in subscribedDevices" :key="deviceId">
            {{ deviceId }}
          </div>
        </div>
        <div class="status-item">
          <span class="label">重连次数:</span>
          <span class="value">{{ reconnectAttempts }}</span>
        </div>
        <div class="actions">
          <el-button 
            size="small" 
            @click="reconnect"
            :disabled="connectionStatus === 'connected'"
          >
            重新连接
          </el-button>
          <el-button 
            size="small" 
            type="danger" 
            @click="disconnect"
            :disabled="connectionStatus !== 'connected'"
          >
            断开连接
          </el-button>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  Connection, 
  Warning, 
  CircleCheck, 
  InfoFilled 
} from '@element-plus/icons-vue'
import websocketClient from '@/services/websocketClient'

export default {
  name: 'WebSocketStatus',
  components: {
    Connection,
    Warning,
    CircleCheck,
    InfoFilled
  },
  setup() {
    const connectionStatus = ref('disconnected')
    const subscribedDevices = ref([])
    const reconnectAttempts = ref(0)

    // 状态类型
    const statusType = computed(() => {
      switch (connectionStatus.value) {
        case 'connected':
          return 'success'
        case 'connecting':
          return 'warning'
        case 'disconnected':
          return 'danger'
        default:
          return 'info'
      }
    })

    // 状态文本
    const statusText = computed(() => {
      switch (connectionStatus.value) {
        case 'connected':
          return '实时连接'
        case 'connecting':
          return '连接中'
        case 'disconnected':
          return '未连接'
        default:
          return '未知状态'
      }
    })

    // 状态图标
    const statusIcon = computed(() => {
      switch (connectionStatus.value) {
        case 'connected':
          return CircleCheck
        case 'connecting':
          return Connection
        case 'disconnected':
          return Warning
        default:
          return Connection
      }
    })

    // 获取状态文本
    const getStatusText = (status) => {
      switch (status) {
        case 'connected':
          return '已连接'
        case 'connecting':
          return '连接中'
        case 'disconnected':
          return '未连接'
        default:
          return '未知'
      }
    }

    // 重新连接
    const reconnect = () => {
      websocketClient.connect()
    }

    // 断开连接
    const disconnect = () => {
      websocketClient.disconnect()
    }

    // 更新状态
    const updateStatus = () => {
      connectionStatus.value = websocketClient.getConnectionStatus()
      subscribedDevices.value = websocketClient.getSubscribedDevices()
    }

    // 状态更新定时器
    let statusTimer = null

    onMounted(() => {
      // 初始状态
      updateStatus()
      
      // 定期更新状态
      statusTimer = setInterval(updateStatus, 1000)
      
      // 监听状态变化事件
      websocketClient.on('logStatusChange', updateStatus)
      websocketClient.on('batchStatusChange', updateStatus)
    })

    onUnmounted(() => {
      if (statusTimer) {
        clearInterval(statusTimer)
      }
      
      // 移除事件监听器
      websocketClient.off('logStatusChange', updateStatus)
      websocketClient.off('batchStatusChange', updateStatus)
    })

    return {
      connectionStatus,
      subscribedDevices,
      reconnectAttempts,
      statusType,
      statusText,
      statusIcon,
      getStatusText,
      reconnect,
      disconnect
    }
  }
}
</script>

<style scoped>
.websocket-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.status-icon {
  font-size: 14px;
}

.status-details-btn {
  padding: 2px;
  color: #909399;
}

.status-details-btn:hover {
  color: #409eff;
}

.websocket-status-details {
  padding: 8px 0;
}

.websocket-status-details h4 {
  margin: 0 0 12px 0;
  color: #303133;
  font-size: 14px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.status-item .label {
  color: #606266;
  font-weight: 500;
}

.status-item .value {
  color: #303133;
}

.status-connected {
  color: #67c23a;
}

.status-connecting {
  color: #e6a23c;
}

.status-disconnected {
  color: #f56c6c;
}

.device-list {
  margin: 8px 0;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  max-height: 100px;
  overflow-y: auto;
}

.device-item {
  padding: 2px 0;
  font-size: 11px;
  color: #606266;
  font-family: monospace;
}

.actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.actions .el-button {
  flex: 1;
}
</style>
