<template>
  <div class="config-management-container">
    <el-card class="main-card">
      <el-tabs v-model="activeTab" class="config-tabs">
      <el-tab-pane :label="$t('configManagement.tabs.logLevels')" name="loglevels">
        <AnalysisCategories />
      </el-tab-pane>
      <el-tab-pane :label="$t('configManagement.tabs.faultCaseStatuses')" name="statuses">
        <FaultCaseStatuses />
      </el-tab-pane>
      <el-tab-pane :label="$t('configManagement.tabs.faultCaseModules')" name="modules">
        <FaultCaseModules />
      </el-tab-pane>
    </el-tabs>
    </el-card>
  </div>
</template>

<script>
import { ref } from 'vue'
import AnalysisCategories from './AnalysisCategories.vue'
import FaultCaseStatuses from './config/FaultCaseStatuses.vue'
import FaultCaseModules from './config/FaultCaseModules.vue'

export default {
  name: 'ConfigManagement',
  components: { AnalysisCategories, FaultCaseStatuses, FaultCaseModules },
  setup() {
    const activeTab = ref('loglevels')
    return { activeTab }
  }
}
</script>

<style scoped>
.config-management-container {
  height: calc(100vh - 64px);
  background: var(--black-white-white);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px; /* 底部 padding 减少到 4px */
}

.config-tabs {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.config-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 嵌套的 AnalysisCategories 自带 padding，这里避免双重外边距过大 */
.config-management-container :deep(.analysis-categories-container) {
  padding: 0;
}
</style>


