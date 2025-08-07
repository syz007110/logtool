<template>
  <el-container class="dashboard-container">
    <!-- 顶部导航 -->
    <el-header class="header">
      <div class="title">手术统计</div>
      <div class="subtitle">查看和分析各场手术的详细统计数据</div>
      <div class="toolbar">
        <el-button type="primary" icon="el-icon-download">导出PDF</el-button>
        <el-button icon="el-icon-refresh">刷新</el-button>
      </div>
    </el-header>

    <!-- 手术tab切换 -->
    <el-main>
      <el-tabs v-model="activeTab" type="card" class="surgery-tabs" @tab-click="handleTabClick">
        <el-tab-pane
          v-for="surgery in surgeries"
          :key="surgery.operationId"
          :label="formatTabLabel(surgery)"
          :name="surgery.operationId"
        >
          <!-- 手术信息区域 -->
          <el-card class="info-card">
            <div class="info-header">
              <div class="time">{{ formatSurgeryTime(surgery) }}</div>
              <div class="badges">
                <el-badge v-if="surgery.types.includes('remote')" value="远程" class="badge-remote" />
                <el-badge v-if="surgery.types.includes('fault')" value="故障" class="badge-fault" />
              </div>
            </div>

            <!-- 开关机时间线 -->
            <el-timeline>
              <el-timeline-item
                v-for="(event, index) in surgery.powerEvents"
                :key="index"
                :timestamp="formatTime(event.time)"
                :color="event.type === 'powerOn' ? 'green' : 'red'"
              >
                {{ event.type === 'powerOn' ? '开机' : '关机' }} {{ Math.floor(index / 2) + 1 }}
              </el-timeline-item>
            </el-timeline>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </el-main>
  </el-container>
</template>

<script>
export default {
  data() {
    return {
      activeTab: 'OP-20230515-001',
      surgeries: [
        {
          operationId: 'OP-20230515-001',
          startTime: '2023-05-15T09:30:00',
          endTime: '2023-05-15T13:15:00',
          types: ['remote', 'fault'],
          powerEvents: [
            { type: 'powerOn', time: '2023-05-15T09:20:15' },
            { type: 'powerOff', time: '2023-05-15T10:45:30' },
            { type: 'powerOn', time: '2023-05-15T11:05:22' },
            { type: 'powerOff', time: '2023-05-15T13:20:18' },
          ],
        },
        // 可添加更多手术数据
      ],
    };
  },
  methods: {
    formatTabLabel(surgery) {
      const date = new Date(surgery.startTime).toLocaleDateString();
      return `${surgery.operationId}（${date}）`;
    },
    formatSurgeryTime(surgery) {
      const start = new Date(surgery.startTime).toLocaleString();
      const end = new Date(surgery.endTime).toLocaleString();
      return `${start} ~ ${end}`;
    },
    formatTime(timeStr) {
      return new Date(timeStr).toLocaleTimeString();
    },
    handleTabClick(tab) {
      this.activeTab = tab.name;
    },
  },
};
</script>

<style scoped>
.dashboard-container {
  background: #f2f3f5;
  height: 100vh;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #ffffff;
  border-bottom: 1px solid #dcdfe6;
}
.title {
  font-size: 20px;
  font-weight: 600;
  color: #165dff;
}
.subtitle {
  font-size: 14px;
  color: #4e5969;
}
.toolbar {
  display: flex;
  gap: 10px;
}
.surgery-tabs {
  margin-top: 20px;
}
.info-card {
  margin-top: 20px;
  background: #ffffff;
  border-radius: 8px;
}
.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.time {
  font-size: 16px;
  font-weight: 500;
  color: #1d2129;
}
.badges .el-badge {
  margin-left: 10px;
}
.badge-remote .el-badge__content {
  background-color: #86b8ff;
}
.badge-fault .el-badge__content {
  background-color: #f53f3f;
}
</style>
