<template>
  <div class="data-analysis-page">
    <!-- 本地视频选择器：点击视频板块触发 -->
    <input
      ref="videoFileInput"
      class="da-hidden-file-input"
      type="file"
      accept="video/*"
      @change="onVideoFileChange"
    />
    <!-- 主内容区：空态允许滚动避免底部被裁剪，分析态 overflow hidden 以等高布局 -->
    <div class="da-content" :class="{ 'da-content-empty': !hasData }">
      <!-- 空态（Figma） -->
      <div v-if="!hasData" class="da-empty">
        <div class="da-empty-grid">
          <div class="da-empty-card da-card-video" @click="triggerLocalVideoPicker">
            <div class="da-card-icon">
              <el-icon><VideoPlay /></el-icon>
            </div>
            <div class="da-card-title">{{ $t('dataAnalysis.surgeryVideo') || 'Surgery Video' }}</div>
            <div class="da-card-subtitle">{{ $t('dataAnalysis.clickToSelectDataSource') || 'Click to select data source' }}</div>
          </div>

          <div class="da-empty-card da-card-logs" @click="openSelectionDialog('logs')">
            <div class="da-card-icon">
              <el-icon><Document /></el-icon>
            </div>
            <div class="da-card-title">{{ $t('dataAnalysis.surgeryLogs') || 'Surgery Logs' }}</div>
            <div class="da-card-subtitle">
              {{ $t('dataAnalysis.selectLogToSync') || 'Select a log file to automatically load linked video and sensor data' }}
            </div>
          </div>

          <div class="da-empty-card da-card-motion" @click="openMotionSelectionDialog()">
            <div class="da-card-icon">
              <el-icon><TrendCharts /></el-icon>
            </div>
            <div class="da-card-title">{{ $t('dataAnalysis.operationalData') || 'Operational Data' }}</div>
            <div class="da-card-subtitle">{{ $t('dataAnalysis.visualizationOfDeviceParameters') || 'Visualization of device parameters' }}</div>
          </div>
        </div>
      </div>

      <!-- 分析态：左侧视频/时间轴/运行数据，右侧日志列表 -->
      <div v-else class="analysis-view">
        <div class="left-panel">
          <!-- 视频区域：可折叠，折叠后运行数据占满左侧 -->
          <div class="video-section" :class="{ 'is-collapsed': videoCollapsed }">
            <div class="video-section-bar">
              <span class="video-section-bar-title">{{ $t('dataAnalysis.surgeryVideo') || 'Surgery Video' }}</span>
              <div class="video-section-bar-actions">
                <template v-if="!videoCollapsed">
                  <el-button v-if="videoSource && (hasLogsData || hasMotionData)" size="small" @click="showVideoTimeConfigDialog = true">
                    <el-icon><Clock /></el-icon>
                    {{ $t('dataAnalysis.configTimeline') || '配置时间轴' }}
                  </el-button>
                  <el-button v-if="videoSource" size="small" @click="clearVideo">
                    <el-icon><Delete /></el-icon>
                    {{ $t('shared.clear') || '清空' }}
                  </el-button>
                  <el-button size="small" text @click="videoCollapsed = true">
                    <el-icon><Fold /></el-icon>
                    {{ $t('shared.collapse') || '折叠' }}
                  </el-button>
                </template>
                <el-button v-else size="small" text @click="videoCollapsed = false">
                  <el-icon><Expand /></el-icon>
                  {{ $t('shared.expand') || '展开' }}
                </el-button>
              </div>
            </div>
            <div v-show="!videoCollapsed" class="video-section-content">
              <div v-if="!videoSource" class="video-placeholder" @click="triggerLocalVideoPicker">
                <el-icon><VideoPlay /></el-icon>
                <span>{{ $t('dataAnalysis.addVideo') || '添加视频' }}</span>
              </div>
              <template v-else>
                <video
                  ref="videoPlayer"
                  :src="videoSource"
                  controls
                  controlsList="nodownload"
                  class="video-player"
                  @loadedmetadata="onVideoLoaded"
                  @timeupdate="onVideoTimeUpdate"
                />
              </template>
            </div>
          </div>

          <!-- 运行数据图表：可折叠；有日志无运行数据且未找到时收起到窄栏（方案2） -->
          <div
            class="motion-section"
            :class="{
              'motion-section-empty': !hasMotionData && !(hasLogsData && motionMatchNotFound),
              'motion-section-not-found': hasLogsData && !hasMotionData && motionMatchNotFound,
              'is-collapsed': hasMotionData && motionCollapsed
            }"
          >
            <!-- 有日志、无运行数据、已标记未找到：收起到一条窄栏，不占大块空间 -->
            <div
              v-if="hasLogsData && !hasMotionData && motionMatchNotFound"
              class="motion-bar-not-found"
            >
              <span class="motion-bar-not-found-title">{{ $t('dataAnalysis.operationalData') || '运行数据' }}</span>
              <span class="motion-bar-not-found-hint">
                {{ $t('dataAnalysis.motionNotFoundShortHint') || '未找到对应时间段，无法手动添加' }}
              </span>
            </div>
            <!-- 未添加运行数据且非“未找到”态：大卡片，可点击添加 -->
            <div
              v-else-if="!hasMotionData"
              class="motion-card-empty"
              :class="{ 'is-disabled': !canAddMotion }"
              @click="canAddMotion ? openMotionSelectionDialog() : null"
            >
              <div class="da-card-icon">
                <el-icon><TrendCharts /></el-icon>
              </div>
              <div class="da-card-title">{{ $t('dataAnalysis.operationalData') || 'Operational Data' }}</div>
              <div class="da-card-subtitle">{{ $t('dataAnalysis.visualizationOfDeviceParameters') || 'Visualization of device parameters' }}</div>
            </div>
            <!-- 已添加运行数据时显示图表区域 -->
            <template v-else>
              <div class="motion-header">
                <div class="motion-title">
                  {{ $t('dataAnalysis.operationalData') || '运行数据' }}
                  <span v-if="selectedMotionFile" class="motion-subtitle">
                    {{ motionSelectedLabel }}
                  </span>
                </div>
                <div class="motion-header-actions">
                  <template v-if="!motionCollapsed">
                    <el-button size="small" @click="clearMotion">
                      <el-icon><Delete /></el-icon>
                      {{ $t('shared.clear') || '清空' }}
                    </el-button>
                    <el-button size="small" text @click="motionCollapsed = true">
                      <el-icon><Fold /></el-icon>
                      {{ $t('shared.collapse') || '折叠' }}
                    </el-button>
                  </template>
                  <el-button v-else size="small" text @click="motionCollapsed = false">
                    <el-icon><Expand /></el-icon>
                    {{ $t('shared.expand') || '展开' }}
                  </el-button>
                </div>
              </div>

              <div v-show="!motionCollapsed" class="motion-content">
                <!-- 先固定 1x2 两个图位：选完运行数据后也不会自动显示，需要用户逐个配置 -->
                <div class="motion-grid">
                  <div v-for="(slot, idx) in motionSlots" :key="slot.id" class="motion-slot">
                    <div class="motion-slot-toolbar">
                      <el-button size="small" @click.stop="openMotionSlotConfig(idx)">{{ $t('dataAnalysis.configure') || '配置' }}</el-button>
                      <el-button size="small" type="danger" plain @click.stop="clearMotionSlot(idx)">{{ $t('shared.clear') || '清空' }}</el-button>
                    </div>
                    <div class="motion-slot-body">
                      <div
                        v-if="!slot.series || slot.series.length === 0"
                        class="motion-slot-empty"
                        @click="openMotionSlotConfig(idx)"
                      >
                        <template v-if="!motionRawRows.length">
                          + {{ $t('dataAnalysis.addMotionData') || '添加运行数据' }}
                        </template>
                        <template v-else>
                          + {{ $t('dataAnalysis.addChart') || '添加曲线图' }}
                        </template>
                      </div>
                      <MotionTimeSeriesChart
                        v-else
                        :series-data="slot.series"
                        height="100%"
                        :enable-slider="false"
                        :cursor-ms="cursorAbsMs"
                        class="motion-slot-chart"
                        @range-change="onMotionRangeChange"
                        @cursor-change="onMotionCursorChange"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 右侧日志列表 -->
        <div class="right-panel" :class="{ 'right-panel-empty': !hasLogsData }">
          <!-- 未添加日志时显示卡片样式 -->
          <div
            v-if="!hasLogsData"
            class="logs-card-empty"
            :class="{ 'is-disabled': !canAddLog }"
            @click="canAddLog ? openSelectionDialog('logs') : null"
          >
            <div class="da-card-icon">
              <el-icon><Document /></el-icon>
            </div>
            <div class="da-card-title">{{ $t('dataAnalysis.surgeryLogs') || 'Surgery Logs' }}</div>
            <div v-if="!(hasMotionData && logMatchNotFound)" class="da-card-subtitle">
              {{ $t('dataAnalysis.selectLogToSync') }}
            </div>
            <el-alert
              v-if="hasMotionData && logMatchNotFound && logMatchNotFoundRangeMs?.startMs != null && logMatchNotFoundRangeMs?.endMs != null"
              :title="$t('dataAnalysis.logNotFoundMessage', { start: formatYmdHms(new Date(logMatchNotFoundRangeMs.startMs)), end: formatYmdHms(new Date(logMatchNotFoundRangeMs.endMs)) })"
              type="warning"
              show-icon
              :closable="false"
              class="da-match-hint"
            />
          </div>
          <!-- 已添加日志时显示日志列表 -->
          <template v-else>
            <div class="logs-header">
              <div class="logs-header-title-row">
                <h3>{{ $t('dataAnalysis.logs') }}</h3>
                <el-button size="small" @click="clearLogs">
                  <el-icon><Delete /></el-icon>
                  {{ $t('shared.clear') || '清空' }}
                </el-button>
              </div>
              <div class="logs-header-actions">
                <el-input
                  v-model="logFilter"
                  :placeholder="$t('dataAnalysis.searchFaultCode') || '搜索故障码'"
                  clearable
                  class="log-filter-input"
                >
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
              </div>
            </div>
            <div v-if="displayLogTimeRange?.first != null && displayLogTimeRange?.last != null" class="log-time-range">
              <el-icon><Clock /></el-icon>
              <span class="time-range-text">
                {{ formatYmdHms(new Date(displayLogTimeRange.first)) }} 至 {{ formatYmdHms(new Date(displayLogTimeRange.last)) }}
              </span>
            </div>
            <div class="logs-content" ref="logsContainer">
              <div
                v-if="filteredLogEntries.length === 0"
                class="logs-empty"
                :class="{ 'is-disabled': !canAddLog }"
                @click="canAddLog ? openSelectionDialog('logs') : null"
              >
                <el-icon><Document /></el-icon>
                <span>+ {{ $t('dataAnalysis.addLogs') || '添加日志' }}</span>
              </div>
            <VirtualTable
              v-else
              ref="logVirtualTableRef"
              class="log-virtual-table"
              :data="filteredLogEntries"
              :columns="logVirtualColumns"
              :item-height="76"
              :show-header="true"
              item-key="id"
              :row-class-name="logRowClassName"
              @row-click="onLogRowClick"
              @scroll="onLogVirtualScroll"
              @load-more="onLogVirtualLoadMore"
            >
              <template #timestamp="{ row }">
                <div class="timestamp-cell">{{ formatTimestamp(row.timestamp) }}</div>
              </template>
              <template #error_code="{ row }">
                <div class="error-code-cell">
                  <div class="error-code-line">
                    <span class="error-code">{{ row.error_code || '-' }}</span>
                    <span v-if="row.param1" class="param">({{ row.param1 }}</span>
                    <span v-if="row.param2" class="param">, {{ row.param2 }}</span>
                    <span v-if="row.param3" class="param">, {{ row.param3 }}</span>
                    <span v-if="row.param4" class="param">, {{ row.param4 }}</span>
                    <span v-if="row.param1" class="param">)</span>
                  </div>
                  <div class="explanation-line virtual-log-message">{{ row.explanation || '-' }}</div>
                </div>
              </template>
            </VirtualTable>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 选择数据弹窗 - 左右分栏 -->
    <el-dialog
      v-model="showSelectionDialog"
      width="80%"
      class="da-select-dialog"
      @close="onSelectionDialogClose"
    >
      <div class="log-selection-layout">
        <!-- 左侧：设备分组列表 -->
        <div class="selection-left-panel">
          <div class="panel-header">
            <h4>{{ $t('dataAnalysis.deviceList') || '设备列表' }}</h4>
            <!-- 设备编号筛选器 -->
            <div class="filter-input-wrapper">
              <el-input
                v-model="deviceFilterValue"
                :placeholder="$t('logs.deviceIdFilterPlaceholder')"
                clearable
                size="small"
                class="device-filter-input"
                @keyup.enter="applyDeviceFilter"
                @clear="applyDeviceFilter"
              >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            </div>
          </div>
          <div class="panel-content">
            <div class="table-container">
              <el-table
                ref="logDeviceTableRef"
                :data="deviceGroups"
                :loading="deviceGroupsLoading"
                height="100%"
                highlight-current-row
                @current-change="onDeviceRowClick"
                @row-click="onDeviceRowClick"
              >
              <el-table-column prop="device_id" :label="$t('logs.deviceId') || '设备编号'" min-width="200">
                <template #default="{ row }">
                  <div class="min-w-0">
                    <span class="one-line-ellipsis" :title="row.device_id">{{ row.device_id }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="log_count" :label="$t('logs.logCount') || '日志数量'" width="120" align="center">
                <template #default="{ row }">
                  <el-tag type="info" size="small">{{ row.log_count }}</el-tag>
                </template>
              </el-table-column>
              </el-table>
            </div>
            <!-- 设备列表分页 -->
            <div class="pagination-wrapper">
              <el-pagination
                :current-page="deviceCurrentPage"
                :page-size="devicePageSize"
                :page-sizes="[10, 20, 50, 100]"
                :total="deviceTotal"
                layout="total, sizes, prev, pager, next"
                @size-change="handleDeviceSizeChange"
                @current-change="handleDeviceCurrentChange"
                small
              />
            </div>
          </div>
        </div>

        <!-- 右侧：日志文件列表 -->
        <div class="selection-right-panel">
          <div class="panel-header">
            <h4>{{ $t('dataAnalysis.logFileList') || '日志文件列表' }}</h4>
            <!-- 时间筛选器 -->
            <div class="time-filter-bar" :class="{ 'filter-placeholder': !selectedDeviceForLogs }">
              <template v-if="selectedDeviceForLogs">
              <div class="quick-range-group">
                <el-radio-group
                  v-model="logQuickRange"
                  size="small"
                  @change="handleLogQuickRangeChange"
                >
                  <el-radio-button
                    v-for="option in logQuickRangeOptions"
                    :key="option.value"
                    :label="option.value"
                  >
                    {{ option.label }}
                  </el-radio-button>
                </el-radio-group>
              </div>
              <div class="custom-range-selects">
                <el-select
                  v-model="logSelectedYear"
                  size="small"
                  class="time-select"
                  @change="handleLogYearChange"
                >
                  <el-option
                    v-for="option in logYearOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="logSelectedMonth"
                  size="small"
                  class="time-select"
                  @change="handleLogMonthChange"
                >
                  <el-option
                    v-for="option in logMonthOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="logSelectedDay"
                  size="small"
                  class="time-select"
                  @change="handleLogDayChange"
                >
                  <el-option
                    v-for="option in logDayOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
              </template>
              <div v-else class="filter-placeholder-content"></div>
            </div>
          </div>
          <div class="panel-content">
            <div v-if="!selectedDeviceForLogs" class="empty-hint">
              <el-empty :description="$t('dataAnalysis.selectDeviceFirst') || '请先选择设备'" />
            </div>
            <div v-else class="log-file-table-container">
              <el-table
                ref="logFileTableRef"
                :data="logFileList"
                :loading="logFileLoading"
                height="100%"
                @selection-change="handleLogSelectionChange"
                row-key="id"
              >
                <el-table-column type="selection" width="55" :selectable="checkLogSelectable" />
                <el-table-column prop="original_name" :label="$t('logs.logFilename') || '日志文件名'" min-width="240">
                  <template #default="{ row }">
                    <span class="one-line-ellipsis" :title="row.original_name || row.filename">{{ row.original_name || row.filename }}</span>
                  </template>
                </el-table-column>
                <el-table-column :label="$t('shared.status')" width="160" align="center">
                  <template #default="{ row }">
                    <el-tag :type="getLogStatusType(row)" size="small">
                      {{ getLogStatusText(row) }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <!-- 日志文件列表分页 -->
              <div class="pagination-wrapper">
                <el-pagination
                  :current-page="logFileCurrentPage"
                  :page-size="logFilePageSize"
                  :page-sizes="[10, 20, 50, 100]"
                  :total="logFileTotal"
                  layout="total, sizes, prev, pager, next"
                  @size-change="handleLogFileSizeChange"
                  @current-change="handleLogFileCurrentChange"
                  small
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 已选择信息 -->
      <div v-if="selectedLogFiles.length > 0" class="selected-info">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            <div class="selected-info-content">
              <span class="info-value">{{ selectedLogFiles.length }} / 2</span>
              <el-tag
                v-for="log in selectedLogFiles"
                :key="log.id"
                size="small"
                class="selected-log-tag"
              >
                {{ log.original_name || log.filename }}
              </el-tag>
            </div>
          </template>
        </el-alert>
      </div>

      <template #footer>
        <el-button @click="showSelectionDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="handleLoadLogData"
          :loading="loading"
          :disabled="selectedLogFiles.length === 0"
        >
          {{ $t('dataAnalysis.loadData') || '加载数据' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 自动匹配：同一小时多个运行数据文件时让用户选择 -->
    <el-dialog
      v-model="showAutoMotionPickDialog"
      width="680px"
      class="da-auto-motion-pick-dialog"
    >
      <template #header>
        <div class="dialog-title">{{ $t('dataAnalysis.motionPickTitle') || '发现多个运行数据文件，请选择（最多5个）' }}</div>
      </template>
      <div class="auto-pick-body">
        <el-table
          :ref="setAutoMotionTableRef"
          :data="autoMotionCandidates"
          height="360"
          row-key="id"
          @selection-change="onAutoMotionSelectionChange"
        >
          <el-table-column type="selection" width="55" :selectable="checkMotionSelectable" :reserve-selection="true" />
          <el-table-column prop="original_name" :label="$t('dataReplay.fileName') || '运行数据文件名'" min-width="240">
            <template #default="{ row }">
              <span class="one-line-ellipsis" :title="row.original_name || row.filename">{{ row.original_name || row.filename }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="$t('shared.status')" width="160" align="center">
            <template #default="{ row }">
              <el-tag :type="getMotionStatusType(row)" size="small">
                {{ getMotionStatusText(row) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="autoMotionPickedIds.length > 0" class="auto-pick-count">
          {{ $t('dataAnalysis.selectedCount') || '已选择' }}: {{ autoMotionPickedIds.length }} / 5
        </div>
      </div>
      <template #footer>
        <el-button @click="showAutoMotionPickDialog = false" :disabled="loading">{{ $t('shared.cancel') || '取消' }}</el-button>
        <el-button
          type="primary"
          :loading="loading"
          :disabled="autoMotionPickedIds.length === 0"
          @click="confirmAutoMotionPick"
        >
          {{ $t('dataAnalysis.loadData') || '加载数据' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 选择运行数据弹窗 - 左右分栏（按设备分组 + 运行数据文件列表） -->
    <el-dialog
      v-model="showMotionSelectionDialog"
      width="80%"
      class="da-motion-select-dialog"
      @close="onMotionSelectionDialogClose"
    >
      <div class="log-selection-layout">
        <!-- 左侧：设备分组列表 -->
        <div class="selection-left-panel">
          <div class="panel-header">
            <h4>{{ $t('dataAnalysis.deviceList') || '设备列表' }}</h4>
            <!-- 设备编号筛选器 -->
            <div class="filter-input-wrapper">
              <el-input
                v-model="motionDeviceFilterValue"
                :placeholder="$t('logs.deviceIdFilterPlaceholder')"
                clearable
                size="small"
                class="device-filter-input"
                @keyup.enter="applyMotionDeviceFilter"
                @clear="applyMotionDeviceFilter"
              >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            </div>
          </div>
          <div class="panel-content">
            <div class="table-container">
              <el-table
                ref="motionDeviceTableRef"
                :data="motionDeviceGroups"
                :loading="motionDeviceGroupsLoading"
                height="100%"
                highlight-current-row
                @current-change="onMotionDeviceRowClick"
                @row-click="onMotionDeviceRowClick"
              >
              <el-table-column prop="device_id" :label="$t('logs.deviceId') || '设备编号'" min-width="200">
                <template #default="{ row }">
                  <div class="min-w-0">
                    <span class="one-line-ellipsis" :title="row.device_id">{{ row.device_id }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="data_count" :label="$t('dataReplay.dataCount') || '数据数量'" width="120" align="center">
                <template #default="{ row }">
                  <el-tag type="info" size="small">{{ row.data_count }}</el-tag>
                </template>
              </el-table-column>
              </el-table>
            </div>
            <!-- 设备列表分页 -->
            <div class="pagination-wrapper">
              <el-pagination
                :current-page="motionDeviceCurrentPage"
                :page-size="motionDevicePageSize"
                :page-sizes="[10, 20, 50, 100]"
                :total="motionDeviceTotal"
                layout="total, sizes, prev, pager, next"
                @size-change="handleMotionDeviceSizeChange"
                @current-change="handleMotionDeviceCurrentChange"
                small
              />
            </div>
          </div>
        </div>

        <!-- 右侧：运行数据文件列表 -->
        <div class="selection-right-panel">
          <div class="panel-header">
            <h4>{{ $t('dataAnalysis.motionFileList') || '运行数据文件列表' }}</h4>
            <!-- 时间筛选器（参考运行数据管理页的设备详细列表） -->
            <div class="time-filter-bar" :class="{ 'filter-placeholder': !selectedDeviceForMotion }">
              <template v-if="selectedDeviceForMotion">
              <div class="quick-range-group">
                <el-radio-group
                  v-model="motionQuickRange"
                  size="small"
                  @change="handleMotionQuickRangeChange"
                >
                  <el-radio-button
                    v-for="option in motionQuickRangeOptions"
                    :key="option.value"
                    :label="option.value"
                  >
                    {{ option.label }}
                  </el-radio-button>
                </el-radio-group>
              </div>
              <div class="custom-range-selects">
                <el-select
                  v-model="motionSelectedYear"
                  size="small"
                  class="time-select"
                  @change="handleMotionYearChange"
                >
                  <el-option
                    v-for="option in motionYearOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="motionSelectedMonth"
                  size="small"
                  class="time-select"
                  @change="handleMotionMonthChange"
                >
                  <el-option
                    v-for="option in motionMonthOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="motionSelectedDay"
                  size="small"
                  class="time-select"
                  @change="handleMotionDayChange"
                >
                  <el-option
                    v-for="option in motionDayOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
              </template>
              <div v-else class="filter-placeholder-content"></div>
            </div>
          </div>
          <div class="panel-content">
            <div v-if="!selectedDeviceForMotion" class="empty-hint">
              <el-empty :description="$t('dataAnalysis.selectDeviceFirst') || '请先选择设备'" />
            </div>
            <div v-else class="log-file-table-container">
              <el-table
                ref="motionFileTableRef"
                :data="motionFileList"
                :loading="motionFileLoading"
                height="100%"
                @selection-change="handleMotionSelectionChange"
                row-key="id"
              >
                <el-table-column type="selection" width="55" :selectable="checkMotionSelectable" :reserve-selection="true" />
                <el-table-column prop="original_name" :label="$t('dataReplay.fileName') || '运行数据文件名'" min-width="240">
                  <template #default="{ row }">
                    <span class="one-line-ellipsis" :title="row.original_name || row.filename">{{ row.original_name || row.filename }}</span>
                  </template>
                </el-table-column>
                <el-table-column :label="$t('shared.status')" width="160" align="center">
                  <template #default="{ row }">
                    <el-tag :type="getMotionStatusType(row)" size="small">
                      {{ getMotionStatusText(row) }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <!-- 运行数据文件列表分页 -->
              <div class="pagination-wrapper">
                <el-pagination
                  :current-page="motionFileCurrentPage"
                  :page-size="motionFilePageSize"
                  :page-sizes="[10, 20, 50, 100]"
                  :total="motionFileTotal"
                  layout="total, sizes, prev, pager, next"
                  @size-change="handleMotionFileSizeChange"
                  @current-change="handleMotionFileCurrentChange"
                  small
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 已选择信息 -->
      <div v-if="motionDialogSelectedFiles.length > 0" class="selected-info">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            <div class="selected-info-content">
              <span class="info-value">{{ motionDialogSelectedFiles.length }} / 5</span>
              <el-tag
                v-for="f in motionDialogSelectedFiles"
                :key="f.id"
                size="small"
                class="selected-log-tag"
              >
                {{ f.original_name || f.filename }}
              </el-tag>
            </div>
          </template>
        </el-alert>
      </div>

      <template #footer>
        <el-button @click="showMotionSelectionDialog = false">{{ $t('shared.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="handleLoadMotionDataFromDialog"
          :loading="loading"
          :disabled="motionDialogSelectedFiles.length === 0"
        >
          {{ $t('dataAnalysis.loadData') || '加载数据' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 运行数据曲线配置弹窗（分步向导） -->
    <el-dialog
      v-model="showMotionConfigDrawer"
      width="49%"
      :title="$t('dataAnalysis.configure') || '配置曲线图'"
      class="da-motion-config-dialog"
      @close="onMotionConfigDialogClose"
    >
      <div class="motion-config-dialog-content">
        <div class="motion-config-header">
          <span class="motion-config-slot">图 {{ activeMotionSlotIndex + 1 }}</span>
        </div>

        <!-- 分步向导 -->
        <el-steps :active="motionConfigStep" finish-status="success" class="motion-config-steps">
          <el-step :title="step1Title" />
          <el-step :title="step2Title" />
          <el-step :title="step3Title" />
        </el-steps>

        <!-- 步骤内容 -->
        <div class="motion-config-step-content">
          <!-- 步骤1：选择对象 -->
          <div v-if="motionConfigStep === 0" class="step-panel">
            <div class="step-title">请选择对象</div>
            <div class="step-hint">选择要配置的对象（如左手、右手、工具臂等）</div>
            <div class="motion-subject-grid">
              <div
                v-for="subject in motionClassifiedSubjects"
                :key="subject"
                class="motion-subject-card"
                :class="{ active: motionPickSubject === subject }"
                @click="motionPickSubject = subject"
              >
                <div class="subject-name">{{ subject }}</div>
                <div class="subject-count">{{ getSubjectCategoryCount(subject) }} 种数据类型</div>
              </div>
            </div>
          </div>

          <!-- 步骤2：选择数据类型 -->
          <div v-if="motionConfigStep === 1" class="step-panel">
            <div class="step-title">请选择数据类型</div>
            <div class="step-hint">选择要显示的数据类型（如关节位置、速度、力矩等）</div>
            <div class="motion-category-grid">
              <div
                v-for="category in motionClassifiedCategories"
                :key="category"
                class="motion-category-card"
                :class="{ active: motionPickCategory === category }"
                @click="motionPickCategory = category"
              >
                <div class="category-name">{{ category }}</div>
                <div class="category-count">{{ getCategoryVariableCount(motionPickSubject, category) }} 个变量</div>
              </div>
            </div>
          </div>

          <!-- 步骤3：选择变量 -->
          <div v-if="motionConfigStep === 2" class="step-panel">
            <div class="step-title">请选择变量（可多选）</div>
            <div class="step-hint">选择要显示的变量，支持多选</div>
            <div class="motion-variable-list">
              <div v-if="motionClassifiedVariables.length === 0" class="motion-field-empty">
                {{ $t('shared.noData') || '暂无数据' }}
              </div>
              <el-checkbox-group v-else v-model="motionPickFieldIndexes" class="motion-variable-checkbox-group">
                <el-checkbox
                  v-for="v in motionClassifiedVariables"
                  :key="v.index"
                  :label="v.index"
                  class="motion-variable-checkbox"
                >
                  <span class="variable-name">{{ v.name }}</span>
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="motion-config-footer">
          <el-button @click="showMotionConfigDrawer = false">{{ $t('shared.cancel') || '取消' }}</el-button>
          <el-button v-if="motionConfigStep > 0" @click="motionConfigStep--">{{ $t('shared.prev') || '上一步' }}</el-button>
          <el-button
            v-if="motionConfigStep < 2"
            type="primary"
            :disabled="!canGoNextStep"
            @click="handleMotionConfigNext"
          >
            {{ $t('shared.next') || '下一步' }}
          </el-button>
          <el-button
            v-if="motionConfigStep === 2"
            type="primary"
            :loading="motionConfigLoading"
            :disabled="!motionPickFieldIndexes.length"
            @click="applyMotionSlotConfig"
          >
            {{ $t('dataAnalysis.loadData') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 配置视频时间轴弹窗：以当前进度条位置为锚点，填写该画面对应的实际时间 -->
    <el-dialog
      v-model="showVideoTimeConfigDialog"
      width="500px"
      :title="$t('dataAnalysis.configTimeline') || '配置时间轴'"
      @close="onVideoTimeConfigDialogClose"
    >
      <div class="video-time-config-content">
        <el-form :model="videoTimeConfigForm" label-width="180px">
          <el-form-item :label="$t('dataAnalysis.currentVideoProgress') || '当前视频进度'">
            <div class="current-time-display">
              {{ formatConfigDialogVideoProgress(configDialogVideoCurrentTime) }}
            </div>
          </el-form-item>
          <el-form-item :label="$t('dataAnalysis.currentFrameTime') || '当前画面对应的实际时间'">
            <template v-if="videoConfigTimeRange">
              <el-select
                v-if="videoConfigIsCrossDay"
                v-model="videoTimeConfigForm.selectedDate"
                :placeholder="$t('dataAnalysis.selectDate') || '选择日期'"
                style="width: 100%; margin-bottom: 8px"
              >
                <el-option
                  v-for="opt in videoConfigDateOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <div v-else class="video-config-date-hint">
                {{ formatYmd(new Date(videoConfigTimeRange.first)) }}
              </div>
            </template>
            <el-time-picker
              v-model="videoTimeConfigForm.startTime"
              format="HH:mm:ss"
              value-format="HH:mm:ss"
              :placeholder="$t('dataAnalysis.selectStartTime') || '选择该时刻'"
              :disabled-hours="videoConfigDisabledHours"
              :disabled-minutes="videoConfigDisabledMinutes"
              :disabled-seconds="videoConfigDisabledSeconds"
              style="width: 100%"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="showVideoTimeConfigDialog = false">{{ $t('shared.cancel') || '取消' }}</el-button>
        <el-button type="primary" @click="applyVideoTimeConfig">
          {{ $t('shared.confirm') || '确定' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay, TrendCharts, Document, Search, Monitor, Filter, Clock, Delete, Fold, Expand, Close } from '@element-plus/icons-vue'
import MotionTimeSeriesChart from '@/components/MotionTimeSeriesChart.vue'
import VirtualTable from '@/components/VirtualTable.vue'
import api from '@/api'

export default {
  name: 'DataAnalysisPage',
  components: {
    MotionTimeSeriesChart,
    VirtualTable,
    VideoPlay,
    TrendCharts,
    Document,
    Search,
    Monitor,
    Filter,
    Clock,
    Delete,
    Fold,
    Expand
  },
  setup() {
    const { t } = useI18n()
    const route = useRoute()
    const router = useRouter()
    const store = useStore()

    // 状态管理
    const showSelectionDialog = ref(false)
    const loading = ref(false)
    const videoPlayer = ref(null)
    const videoFileInput = ref(null)
    const logsContainer = ref(null)
    const logVirtualTableRef = ref(null)
    const selectedDate = ref(new Date())

    // 选择表单
    const selectionForm = ref({
      deviceId: '',
      logId: '',
      startTime: ''
    })

    // 数据
    const devices = ref([])
    const deviceGroups = ref([]) // 设备分组数据（来自 fetchLogsByDevice）
    const availableLogs = ref([])
    const logEntries = ref([])
    const motionRawRows = ref([])
    const selectedMotionFile = ref(null)
    const selectedMotionFiles = ref([]) // 运行数据选择：最多选择5个
    const motionDialogSelectedFiles = ref([]) // 运行数据弹窗内选择
    const motionFormatColumns = ref([])
    const motionSlots = ref([
      { id: 'slot-1', title: '', series: [] },
      { id: 'slot-2', title: '', series: [] }
    ])
    const showMotionConfigDrawer = ref(false)
    const activeMotionSlotIndex = ref(0)
    const motionConfigStep = ref(0) // 分步向导当前步骤：0=对象, 1=数据类型, 2=变量
    const motionPickSubject = ref('') // 选中的对象（如"左手"）
    const motionPickCategory = ref('') // 选中的数据类型（如"关节实际位置"）
    const motionPickFieldIndexes = ref([]) // 选中的变量索引列表
    const motionFieldFilter = ref('')
    const motionConfigLoading = ref(false) // 添加数据图确认按钮加载状态
    const motionClassifiedData = ref({}) // motionFormatClassified.json 的完整数据
    // 兼容旧代码（保留用于热力图等）
    const motionPickTheme = ref('left_hand')
    const videoSource = ref(null)
    const videoStartTime = ref(null) // 旧逻辑：视频 0 秒对应绝对时间（未配置锚点时 fallback 用）
    const videoAnchorLogMs = ref(null) // Tlogn：配置时「当前画面对应的实际时间」绝对时间戳（ms）
    const videoAnchorVideoMs = ref(null) // Tvideon：配置时当前视频进度（ms）
    const showVideoTimeConfigDialog = ref(false) // 配置视频时间轴弹窗
    const configDialogVideoCurrentTime = ref(0) // 打开弹窗时当前视频进度（秒），用于「当前画面对应的实际时间」反推 videoStartTime
    const configDialogVideoDuration = ref(0) // 打开弹窗时视频总时长（秒），用于推断视频结束时间
    const videoTimeConfigForm = ref({
      startTime: null, // HH:mm:ss
      selectedDate: null // YYYY-MM-DD，仅跨天/跨月时使用
    })
    const resetVideoAnchor = () => {
      videoStartTime.value = null
      videoAnchorLogMs.value = null
      videoAnchorVideoMs.value = null
    }
    const logTimeLimit = ref({ min: null, max: null })
    const videoObjectUrl = ref(null)

    // 左侧视频/运行数据折叠：任一侧可单独占满左侧
    const videoCollapsed = ref(false)
    const motionCollapsed = ref(false)

    // 方案A：图表高度使用容器 100% 自适应（由 MotionTimeSeriesChart 支持 height='100%'）

    // 树形选择器（保留用于兼容）
    const logTreeRef = ref(null)
    const logTreeFilterText = ref('')
    const logTreeData = ref([])
    const logTreeProps = {
      children: 'children',
      label: 'label'
    }
    const deviceLogsMap = ref(new Map()) // 设备ID -> 日志列表的映射
    const lastDeviceGroupsLoadAt = ref(0) // 节流控制

    // 左侧设备分组相关
    const deviceFilterValue = ref('')
    const deviceCurrentPage = ref(1)
    const devicePageSize = ref(10)
    const deviceTotal = ref(0)
    const deviceGroupsLoading = ref(false)
    const selectedDeviceForLogs = ref(null)
    const logDeviceTableRef = ref(null) // 日志设备表格 ref

    // 右侧日志文件列表相关
    const logFileTableRef = ref(null)
    const logFileList = ref([])
    const logFileLoading = ref(false)
    const logFileCurrentPage = ref(1)
    const logFilePageSize = ref(10)
    const logFileTotal = ref(0)
    const selectedLogFiles = ref([]) // 最多选择2个

    // 自动关联（日志 <-> 运行数据）
    const suppressAutoMotionFromLog = ref(false)
    const suppressAutoLogFromMotion = ref(false)
    const showAutoMotionPickDialog = ref(false)
    const autoMotionCandidates = ref([])
    const autoMotionPickedIds = ref([]) // 改为数组，支持多选
    const autoMotionTableRef = ref(null) // 自动匹配运行数据表格 ref
    const autoMotionPendingKeep = ref(null) // 待回选的行（ref 可用时应用）
    const setAutoMotionTableRef = (el) => {
      autoMotionTableRef.value = el || null
    }
    // 找不到对应时间段的数据提示（用于空态卡片）
    const motionMatchNotFound = ref(false)
    const motionMatchNotFoundRangeMs = ref({ startMs: null, endMs: null })
    const logMatchNotFound = ref(false)
    const logMatchNotFoundRangeMs = ref({ startMs: null, endMs: null })

    // 运行数据选择弹窗（按设备分组 + 文件列表）
    const showMotionSelectionDialog = ref(false)
    const motionDeviceGroups = ref([])
    const motionDeviceFilterValue = ref('')
    const motionDeviceCurrentPage = ref(1)
    const motionDevicePageSize = ref(10)
    const motionDeviceTotal = ref(0)
    const motionDeviceGroupsLoading = ref(false)
    const selectedDeviceForMotion = ref(null)
    const motionDeviceTableRef = ref(null) // 运行数据设备表格 ref

    const motionFileTableRef = ref(null)
    const motionFileList = ref([])
    const motionFileLoading = ref(false)
    const motionFileCurrentPage = ref(1)
    const motionFilePageSize = ref(10)
    const motionFileTotal = ref(0)

    const motionQuickRange = ref('all')
    const motionSelectedYear = ref('all')
    const motionSelectedMonth = ref('all')
    const motionSelectedDay = ref('all')
    const motionAvailableYears = ref([])
    const motionAvailableMonths = ref({})
    const motionAvailableDays = ref({})

    // 时间筛选器相关
    const logQuickRange = ref('all')
    const logSelectedYear = ref('all')
    const logSelectedMonth = ref('all')
    const logSelectedDay = ref('all')
    const logAvailableYears = ref([])
    const logAvailableMonths = ref({})
    const logAvailableDays = ref({})
    const currentYear = new Date().getFullYear()

    // 时间轴
    const cursorMs = ref(0) // 当前光标位置（相对时间，毫秒）
    const maxTime = ref(0) // 最大时间（毫秒）
    const playbackSpeed = ref(1)
    const timeBase = ref(null) // 时间基准（第一个日志条目的绝对时间戳）

    const resetTimeline = () => {
      timeBase.value = null
      cursorMs.value = 0
      maxTime.value = 0
    }

    // 日志过滤
    const logFilter = ref('')

    // 计算属性：已选择的日志名称
    const selectedLogName = computed(() => {
      if (!selectionForm.value.logId || !selectionForm.value.deviceId) return ''
      const logs = deviceLogsMap.value.get(selectionForm.value.deviceId) || []
      const log = logs.find(l => l.id === selectionForm.value.logId)
      return log ? (log.original_name || log.filename) : ''
    })

    // 计算属性：是否有数据（三种数据类型独立判断）
    // 注意：基于实际加载的数据，而不是弹窗中的选择状态
    const hasData = computed(() => {
      const hasVideo = !!videoSource.value
      const hasLogs = (logEntries.value || []).length > 0
      const hasMotion = selectedMotionFiles.value.length > 0
      return hasVideo || hasLogs || hasMotion
    })

    // 计算属性：是否有日志数据
    const hasLogsData = computed(() => (selectedLogFiles.value.length > 0) || ((logEntries.value || []).length > 0))

    // 计算属性：是否有运行数据
    const hasMotionData = computed(() => selectedMotionFiles.value.length > 0)

    // 未检索到对应数据时禁止手动添加：仅当未标记「未找到」时才允许添加另一类数据
    const canAddMotion = computed(() => !(hasLogsData.value && motionMatchNotFound.value))
    const canAddLog = computed(() => !(hasMotionData.value && logMatchNotFound.value))

    // 有日志、无运行数据且已标记未找到时，自动展开视频区，把空间留给视频+时间轴
    watch(
      () => hasLogsData.value && !hasMotionData.value && motionMatchNotFound.value,
      (isMotionNotFound) => {
        if (isMotionNotFound) videoCollapsed.value = false
      }
    )

    // 计算属性
    const filteredLogEntries = computed(() => {
      if (!logFilter.value) {
        return logEntries.value || []
      }
      const filter = logFilter.value.toLowerCase()
      return (logEntries.value || []).filter(entry => {
        // 搜索多个字段：故障码、参数、说明等
        const searchText = [
          entry.error_code,
          entry.param1,
          entry.param2,
          entry.param3,
          entry.param4,
          entry.explanation,
          entry.log_name
        ].filter(Boolean).join(' ').toLowerCase()
        return searchText.includes(filter)
      })
    })

    // 虚拟日志表格列定义
    const logVirtualColumns = computed(() => ([
      { prop: 'timestamp', label: t('batchAnalysis.timestamp') || '时间戳', width: '180px' },
      { prop: 'error_code', label: t('batchAnalysis.errorCode') || '故障码（参数1-4）', width: 'auto', minWidth: '260px' }
    ]))

    // 日志窗口化加载：滑动窗口（避免一次性加载）
    const logWindowSizeMs = 20 * 60 * 1000
    const logWindowStepMs = 5 * 60 * 1000
    const logWindowStartMs = ref(null)
    const logWindowEndMs = ref(null)
    const logAllowedStartMs = ref(null) // 可选：由运行数据范围限制
    const logAllowedEndMs = ref(null)
    const logWindowLoading = ref(false)
    const logWindowDirectionLock = ref(null) // 'prev' | 'next'
    // 整个日志文件的总时间范围（用于显示）
    const logFileTotalTimeRange = ref({ min: null, max: null })

    const clampToAllowedRange = (startMs, endMs) => {
      let s = startMs
      let e = endMs
      // 保证窗口始终落在允许范围内；避免 abs 超界时把窗口夹成 (start==end==超界时间)
      if (logAllowedStartMs.value != null) {
        s = Math.max(s, logAllowedStartMs.value)
        e = Math.max(e, logAllowedStartMs.value)
      }
      if (logAllowedEndMs.value != null) {
        s = Math.min(s, logAllowedEndMs.value)
        e = Math.min(e, logAllowedEndMs.value)
      }
      if (e < s) e = s
      return { startMs: s, endMs: e }
    }

    const mapLogEntries = (entries) => (entries || []).map((entry, index) => {
      // 生成唯一ID：优先使用后端提供的ID，否则使用组合ID
      const id = entry.id || 
                 (entry.log_id && entry.row_index ? `${entry.log_id}-${entry.version || 1}-${entry.row_index}` : null) ||
                 entry.row_index ||
                 entry.timestamp ||
                 entry.ts ||
                 `entry-${index}`
      
      return {
        id: String(id),
        timestamp: entry.timestamp || entry.ts,
        error_code: entry.error_code || entry.e,
        param1: entry.param1 || entry.p1,
        param2: entry.param2 || entry.p2,
        param3: entry.param3 || entry.p3,
        param4: entry.param4 || entry.p4,
        explanation: entry.explanation || entry.exp || entry.message || entry.msg || '-',
        log_name: entry.log_name || entry.filename || '-'
      }
    })

    const fetchLogWindow = async (startMs, endMs) => {
      if (!selectedLogFiles.value.length) return []
      const logIds = selectedLogFiles.value.map((l) => l.id).join(',')
      const startStr = formatYmdHms(new Date(startMs))
      const endStr = formatYmdHms(new Date(endMs))
      // 与后端 BATCH_ENTRIES 上限一致；单窗口页数上限兼顾“取完本窗口”与内存/CPU（每条约数百字节，50 页≈50k 条≈15–20MB + sort/map 主线程耗时）
      const pageSize = 1000
      const maxPagesSafety = 50

      const all = []
      for (let page = 1; page <= maxPagesSafety; page++) {
        const resp = await api.logs.getBatchEntries({
          log_ids: logIds,
          start_time: startStr,
          end_time: endStr,
          page,
          limit: pageSize
        })
        const entries = resp?.data?.entries || resp?.entries || resp?.data || []
        if (!Array.isArray(entries)) {
          console.warn('[fetchLogWindow] 返回数据不是数组:', resp)
          break
        }
        if (entries.length === 0) break
        all.push(...entries)
        if (entries.length < pageSize) break
      }

      console.log('[fetchLogWindow] 加载的原始数据条数:', all.length)
      const mapped = mapLogEntries(all)
      console.log('[fetchLogWindow] 映射后的数据条数:', mapped.length)
      
      // 安全排序：只对有效时间戳进行排序
      mapped.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
        if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
          return 0
        }
        return timeA - timeB
      })
      
      return mapped
    }

    const replaceLogWindow = async (startMs, endMs) => {
      if (logWindowLoading.value) return
      const clamped = clampToAllowedRange(startMs, endMs)
      // 夹紧后窗口与当前完全一致时，不做重复请求（同时释放 directionLock，避免上层卡死）
      if (
        logWindowStartMs.value === clamped.startMs &&
        logWindowEndMs.value === clamped.endMs &&
        (logEntries.value?.length || 0) > 0
      ) {
        logWindowDirectionLock.value = null
        return
      }
      logWindowLoading.value = true
      try {
        logWindowStartMs.value = clamped.startMs
        logWindowEndMs.value = clamped.endMs
        const fetched = await fetchLogWindow(clamped.startMs, clamped.endMs)
        logEntries.value = fetched
        console.log('[replaceLogWindow] 设置 logEntries.value 条数:', fetched.length)
        console.log('[replaceLogWindow] filteredLogEntries 条数:', filteredLogEntries.value.length)
        
        // 确保 VirtualTable 在数据更新后重新计算高度（非关键操作，失败不影响主流程）
        try {
          await nextTick()
          if (logVirtualTableRef.value && typeof logVirtualTableRef.value.updateContainerHeight === 'function') {
            logVirtualTableRef.value.updateContainerHeight()
          }
        } catch (e) {
          console.warn('[replaceLogWindow] 更新 VirtualTable 高度失败（不影响数据加载）:', e)
        }
      } finally {
        logWindowLoading.value = false
        logWindowDirectionLock.value = null
      }
    }

    const ensureLogWindowContains = async (absMs) => {
      if (!Number.isFinite(absMs)) return
      if (logWindowStartMs.value == null || logWindowEndMs.value == null) {
        const half = Math.floor(logWindowSizeMs / 2)
        await replaceLogWindow(absMs - half, absMs + half)
        return
      }
      const margin = 5 * 1000
      if (absMs < logWindowStartMs.value + margin || absMs > logWindowEndMs.value - margin) {
        const half = Math.floor(logWindowSizeMs / 2)
        await replaceLogWindow(absMs - half, absMs + half)
      }
    }

    // 当前游标的绝对时间（ms），用于和运行数据图表对齐
    const cursorAbsMs = computed(() => {
      if (timeBase.value == null) return null
      const v = Number(timeBase.value) + Number(cursorMs.value || 0)
      return Number.isFinite(v) ? v : null
    })

    // 预计算过滤后日志时间戳数组（用于二分定位 & 避免频繁全量扫描）
    const filteredLogEntryTs = ref([])
    const lastAutoScrollIndex = ref(-1)
    watch(filteredLogEntries, (list) => {
      const arr = Array.isArray(list) ? list : []
      filteredLogEntryTs.value = arr.map((e) => {
        const ts = e?.timestamp ? new Date(e.timestamp).getTime() : NaN
        return Number.isFinite(ts) ? ts : NaN
      })
      lastAutoScrollIndex.value = -1
    }, { deep: false })

    // 过滤后日志数据的时间边界（用于视频超出范围时“钉住”到最后一条日志）
    const getFiniteFirstLast = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return { first: null, last: null }
      let first = null
      let last = null
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i]
        if (Number.isFinite(v)) {
          first = v
          break
        }
      }
      for (let i = arr.length - 1; i >= 0; i--) {
        const v = arr[i]
        if (Number.isFinite(v)) {
          last = v
          break
        }
      }
      return { first, last }
    }
    // 日志数据的时间范围：优先显示整个日志文件的总时间范围，如果没有则显示当前加载的部分
    const logDataRangeAbsMs = computed(() => {
      const total = logFileTotalTimeRange.value
      if (total.min != null && total.max != null) {
        return { first: total.min, last: total.max }
      }
      // 如果没有总时间范围，回退到当前加载的部分
      return getFiniteFirstLast(filteredLogEntryTs.value)
    })

    // 视频配置/联动用的时间范围：优先日志最早～最晚；无日志则用运行数据；两者都没有为 null
    const videoConfigTimeRange = computed(() => {
      const logR = logDataRangeAbsMs.value
      if (logR?.first != null && logR?.last != null && Number.isFinite(logR.first) && Number.isFinite(logR.last)) {
        return { first: logR.first, last: logR.last }
      }
      const motionR = getMotionRangeFromRows(motionRawRows.value)
      if (motionR?.startMs != null && motionR?.endMs != null && Number.isFinite(motionR.startMs) && Number.isFinite(motionR.endMs)) {
        return { first: motionR.startMs, last: motionR.endMs }
      }
      return null
    })

    // 配置时间轴：是否跨天/跨月（多天则需选择日期）
    const videoConfigIsCrossDay = computed(() => {
      const range = videoConfigTimeRange.value
      if (!range || range.first == null || range.last == null) return false
      const firstD = dayjs(range.first)
      const lastD = dayjs(range.last)
      return firstD.startOf('day').valueOf() !== lastD.startOf('day').valueOf()
    })

    // 配置时间轴：跨天时供选择的日期列表（起止日两个日期）
    const videoConfigDateOptions = computed(() => {
      const range = videoConfigTimeRange.value
      if (!range || range.first == null || range.last == null || !videoConfigIsCrossDay.value) return []
      const options = []
      options.push({ value: formatYmd(new Date(range.first)), label: formatYmd(new Date(range.first)) })
      options.push({ value: formatYmd(new Date(range.last)), label: formatYmd(new Date(range.last)) })
      return options
    })

    // 配置时间轴：当前选中日期对应的有效时间范围（用于 disabled-hours/minutes/seconds）
    const videoConfigSelectedDayRange = computed(() => {
      const range = videoConfigTimeRange.value
      if (!range || range.first == null || range.last == null) return null
      if (!videoConfigIsCrossDay.value) {
        return { first: range.first, last: range.last }
      }
      const selDate = videoTimeConfigForm.value.selectedDate
      if (!selDate) return null
      const selDayStart = dayjs(selDate).startOf('day').valueOf()
      const selDayEnd = selDayStart + 24 * 60 * 60 * 1000 - 1
      const firstD = dayjs(range.first)
      const lastD = dayjs(range.last)
      const firstDayStart = firstD.startOf('day').valueOf()
      const lastDayStart = lastD.startOf('day').valueOf()
      if (selDayStart === firstDayStart) {
        return { first: range.first, last: Math.min(range.last, selDayEnd) }
      }
      if (selDayStart === lastDayStart) {
        return { first: Math.max(range.first, selDayStart), last: range.last }
      }
      return { first: selDayStart, last: selDayEnd }
    })

    // 日志板块上方显示的时间跨度：有统一时间轴时显示 timeBase ~ timeBase+maxTime，否则显示 logDataRangeAbsMs
    const displayLogTimeRange = computed(() => {
      const tb = timeBase.value
      const mt = maxTime.value
      if (tb != null && Number.isFinite(tb) && mt != null && Number.isFinite(mt) && mt >= 0) {
        return { first: tb, last: tb + mt }
      }
      return logDataRangeAbsMs.value
    })

    // 运行数据：仅在用户配置了至少一个图之后，再显示热力图（避免“选完就显示”造成误解）

    // 方法
    const formatTime = (ms) => {
      const totalSeconds = Math.floor(ms / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    const formatYmd = (date) => {
      const d = date instanceof Date ? date : new Date(date)
      if (Number.isNaN(d.getTime())) return ''
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }

    const formatYmdHms = (date) => {
      const d = date instanceof Date ? date : new Date(date)
      if (Number.isNaN(d.getTime())) return ''
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
    }

    const computedEndTime = computed(() => {
      const startStr = selectionForm.value.startTime
      if (!startStr) return ''
      const start = new Date(startStr)
      if (Number.isNaN(start.getTime())) return ''
      const fiveMinLater = new Date(start.getTime() + 5 * 60 * 1000)
      const max = logTimeLimit.value.max ? new Date(logTimeLimit.value.max) : null
      const end = max && !Number.isNaN(max.getTime()) && fiveMinLater > max ? max : fiveMinLater
      return formatYmdHms(end)
    })

    const formatTimestamp = (timestamp) => {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    // ===== 自动关联（日志 <-> 运行数据）辅助方法 =====
    const pad2 = (n) => String(Number(n) || 0).padStart(2, '0')
    const pad4 = (n) => String(Number(n) || 0).padStart(4, '0')

    const extractYmdhFromDigits = (digits) => {
      const s = String(digits || '').trim()
      if (!/^\d{10,12}$/.test(s)) return null
      return {
        year: Number(s.slice(0, 4)),
        month: Number(s.slice(4, 6)),
        day: Number(s.slice(6, 8)),
        hour: Number(s.slice(8, 10))
      }
    }

    const getLogHourParts = (log) => {
      const y = Number(log?.file_year)
      const m = Number(log?.file_month)
      const d = Number(log?.file_day)
      const h = Number(log?.file_hour)
      if ([y, m, d, h].every((n) => Number.isFinite(n) && n > 0)) {
        return { year: y, month: m, day: d, hour: h }
      }
      // fallback: file_time_token(YYYYMMDDhhmm) or filename prefix
      const token = String(log?.file_time_token || '').trim()
      const fromToken = extractYmdhFromDigits(token.slice(0, 10))
      if (fromToken) return fromToken
      const name = String(log?.original_name || log?.filename || '')
      const m2 = name.match(/^(\d{10,12})_/)
      return m2 ? extractYmdhFromDigits(m2[1]) : null
    }

    const hourPartsToToken = (parts) => {
      if (!parts) return ''
      return `${pad4(parts.year)}${pad2(parts.month)}${pad2(parts.day)}${pad2(parts.hour)}`
    }

    const dateToHourToken = (date) => {
      if (!date || Number.isNaN(date.getTime())) return ''
      return hourPartsToToken({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours()
      })
    }

    const getMotionRangeFromRows = (rows) => {
      const arr = Array.isArray(rows) ? rows : []
      if (!arr.length) return null
      const firstMs = toEpochMs(arr[0]?.ulint_data)
      const lastMs = toEpochMs(arr[arr.length - 1]?.ulint_data)
      if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return null
      return { startMs: Math.min(firstMs, lastMs), endMs: Math.max(firstMs, lastMs) }
    }

    const getLogRangeAbsMs = () => {
      const total = logFileTotalTimeRange.value
      const totalMin = total?.min
      const totalMax = total?.max
      if (Number.isFinite(totalMin) && Number.isFinite(totalMax)) {
        return { startMs: Math.min(totalMin, totalMax), endMs: Math.max(totalMin, totalMax) }
      }

      const r = logDataRangeAbsMs.value
      const start = r?.first
      const end = r?.last
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null
      return { startMs: Math.min(start, end), endMs: Math.max(start, end) }
    }

    const applyTimelineRange = async (startMs, endMs, { preserveCursorAbs = true } = {}) => {
      const s = Number(startMs)
      const e = Number(endMs)
      if (!Number.isFinite(s) || !Number.isFinite(e)) return
      const newStart = Math.min(s, e)
      const newEnd = Math.max(s, e)
      const span = Math.max(0, newEnd - newStart)

      const prevAbs = preserveCursorAbs ? cursorAbsMs.value : null
      timeBase.value = newStart
      maxTime.value = span

      if (Number.isFinite(prevAbs)) {
        const rel = Number(prevAbs) - newStart
        cursorMs.value = Math.max(0, Math.min(span, rel))
      } else {
        cursorMs.value = 0
      }

      // 日志窗口化：仅在“日志文件列表模式”（selectedLogFiles）下移动窗口
      if (selectedLogFiles.value.length > 0) {
        const abs = cursorAbsMs.value ?? newStart
        if (Number.isFinite(abs)) {
          await ensureLogWindowContains(abs)
        }
      }
    }

    // 统一时间跨度：两者都有取交集；只有一种就用该数据跨度；清空则复位
    const syncTimelineRangeByLoadedData = async ({ preserveCursorAbs = true, skipReplaceLogWindow = false } = {}) => {
      const logRange = getLogRangeAbsMs()
      const motionRange = getMotionRangeFromRows(motionRawRows.value)

      // 同步日志允许范围（用于窗口化 clamp）
      const setAllowed = (s, e) => {
        logAllowedStartMs.value = Number.isFinite(s) ? s : null
        logAllowedEndMs.value = Number.isFinite(e) ? e : null
      }

      const forceReplaceLogWindow = async (startMs, endMs) => {
        if (skipReplaceLogWindow) return
        if (selectedLogFiles.value.length > 0 && Number.isFinite(startMs) && Number.isFinite(endMs)) {
          await replaceLogWindow(startMs, endMs)
        }
      }

      if (logRange && motionRange) {
        const overlapStart = Math.max(logRange.startMs, motionRange.startMs)
        const overlapEnd = Math.min(logRange.endMs, motionRange.endMs)
        // 理论上不应出现 overlapEnd < overlapStart（自动匹配下），这里做安全兜底
        const s = overlapEnd < overlapStart ? overlapStart : overlapStart
        const e = overlapEnd < overlapStart ? overlapStart : overlapEnd
        setAllowed(s, e)
        await applyTimelineRange(s, e, { preserveCursorAbs })
        await forceReplaceLogWindow(s, e)
        return
      }

      if (logRange) {
        setAllowed(logRange.startMs, logRange.endMs)
        await applyTimelineRange(logRange.startMs, logRange.endMs, { preserveCursorAbs })
        await forceReplaceLogWindow(logRange.startMs, logRange.endMs)
        return
      }

      if (motionRange) {
        // 允许范围也同步到 motion 范围，便于后续自动拉日志时直接落在该跨度内
        setAllowed(motionRange.startMs, motionRange.endMs)
        await applyTimelineRange(motionRange.startMs, motionRange.endMs, { preserveCursorAbs })
        await forceReplaceLogWindow(motionRange.startMs, motionRange.endMs)
        return
      }

      setAllowed(null, null)
      resetTimeline()
    }

    const MOTION_SERIES_MAX_POINTS = 3000
    const MOTION_SERIES_PREVIEW_POINTS = 400

    // 简单节流：降低 timeupdate/拖动导致的高频 DOM/请求压力
    const throttle = (fn, waitMs) => {
      let last = 0
      let timer = null
      let lastArgs = null
      return (...args) => {
        const now = Date.now()
        lastArgs = args
        const remain = waitMs - (now - last)
        if (remain <= 0) {
          if (timer) { clearTimeout(timer); timer = null }
          last = now
          const callArgs = lastArgs
          lastArgs = null
          fn(...callArgs)
          return
        }
        if (timer) return
        timer = setTimeout(() => {
          timer = null
          last = Date.now()
          const callArgs = lastArgs
          lastArgs = null
          if (callArgs) fn(...callArgs)
        }, remain)
      }
    }

    // 运行数据拉取：缓存 + 取消旧请求（Abort） + 忽略过期结果
    const motionSeriesCache = new Map() // key -> rows
    const motionSeriesInFlight = new Map() // key -> Promise<rows>
    const MOTION_SERIES_CACHE_MAX = 8
    const motionSeriesAbortRef = ref(null) // AbortController
    let motionSeriesSeq = 0

    const buildMotionSeriesKey = ({ fileIds, startMs, endMs, maxPoints }) => {
      const ids = (fileIds || []).map(String).sort().join(',')
      return `${ids}|${Math.floor(startMs)}|${Math.ceil(endMs)}|${maxPoints}`
    }
    const setMotionSeriesCache = (key, rows) => {
      if (!key) return
      if (motionSeriesCache.has(key)) motionSeriesCache.delete(key)
      motionSeriesCache.set(key, rows)
      while (motionSeriesCache.size > MOTION_SERIES_CACHE_MAX) {
        const firstKey = motionSeriesCache.keys().next().value
        motionSeriesCache.delete(firstKey)
      }
    }

    const fetchMotionSeriesByRangeAndPoints = async ({ files, startMs, endMs, maxPoints, controller, seq }) => {
      const start = Math.floor(startMs)
      const end = Math.ceil(endMs)
      const fileIds = (files || []).map((f) => f?.id).filter((v) => v != null)
      const key = buildMotionSeriesKey({ fileIds, startMs: start, endMs: end, maxPoints })

      const cached = motionSeriesCache.get(key)
      if (cached) return { key, rows: cached, cached: true }

      const inFlight = motionSeriesInFlight.get(key)
      if (inFlight) {
        const rows = await inFlight
        return { key, rows, cached: false }
      }

      const p = Promise.all(
        files.map((f) =>
          api.motionData.getSeries(
            f.id,
            { start_ms: start, end_ms: end, max_points: maxPoints },
            controller?.signal
          ).then((r) => r.data?.rows || []).catch(() => [])
        )
      ).then((results) => {
        const merged = results.flat()
        merged.sort((a, b) => toEpochMs(a?.ulint_data) - toEpochMs(b?.ulint_data))
        return merged
      })

      motionSeriesInFlight.set(key, p)
      try {
        const rows = await p
        motionSeriesInFlight.delete(key)
        if (seq != null && seq !== motionSeriesSeq) return { key, rows: null, cached: false }
        if (controller?.signal?.aborted) return { key, rows: null, cached: false }
        setMotionSeriesCache(key, rows)
        return { key, rows, cached: false }
      } catch (e) {
        motionSeriesInFlight.delete(key)
        if (controller?.signal?.aborted) return { key, rows: null, cached: false }
        throw e
      }
    }

    // 两段式：先预览点数快速出图，再后台拉满点数替换
    const fetchMotionSeriesInRangeTwoStage = async () => {
      const startMs = timeBase.value
      const endMs = timeBase.value != null && Number.isFinite(maxTime.value) ? Number(timeBase.value) + Number(maxTime.value) : null
      const files = selectedMotionFiles.value || []
      if (startMs == null || endMs == null || !files.length) return

      // 取消之前的请求（用户拖动时间轴/切换文件时）
      try { motionSeriesAbortRef.value?.abort?.() } catch (e) {}
      const controller = new AbortController()
      motionSeriesAbortRef.value = controller
      const seq = ++motionSeriesSeq

      try {
        // 先尝试满量缓存（若命中就不再走预览）
        const fullFirst = await fetchMotionSeriesByRangeAndPoints({
          files,
          startMs,
          endMs,
          maxPoints: MOTION_SERIES_MAX_POINTS,
          controller,
          seq
        })
        if (fullFirst?.rows?.length) {
          motionRawRows.value = fullFirst.rows
          return { previewRows: fullFirst.rows, fullPromise: Promise.resolve(fullFirst.rows), seq }
        }

        // 预览：点数更小，期望后端更快返回
        const previewRes = await fetchMotionSeriesByRangeAndPoints({
          files,
          startMs,
          endMs,
          maxPoints: MOTION_SERIES_PREVIEW_POINTS,
          controller,
          seq
        })
        if (seq !== motionSeriesSeq || controller.signal.aborted) return
        if (previewRes?.rows) motionRawRows.value = previewRes.rows

        // 后台拉满量：完成后替换
        const fullPromise = fetchMotionSeriesByRangeAndPoints({
          files,
          startMs,
          endMs,
          maxPoints: MOTION_SERIES_MAX_POINTS,
          controller,
          seq
        }).then((res) => {
          if (seq !== motionSeriesSeq || controller.signal.aborted) return null
          if (res?.rows) motionRawRows.value = res.rows
          return res?.rows || null
        }).catch(() => null)

        return { previewRows: previewRes?.rows || null, fullPromise, seq }
      } catch (e) {
        if (controller.signal.aborted) return
        console.warn('按时间范围拉取运行数据失败（保留当前数据）:', e)
      }
    }

    const probeLogsByTimeRange = async (deviceId, startMs, endMs) => {
      const did = String(deviceId || '').trim()
      if (!did || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return false
      const startToken = dateToHourToken(new Date(startMs))
      const endToken = dateToHourToken(new Date(endMs))
      if (!startToken || !endToken) return false
      const resp = await api.logs.getList({
        device_id: did,
        time_range_start: startToken,
        time_range_end: endToken,
        status_filter: 'all',
        page: 1,
        limit: 1
      })
      const logs = resp.data?.logs || []
      return Array.isArray(logs) && logs.length > 0
    }

    const autoPickMotionByRange = async (deviceId, startMs, endMs) => {
      const did = String(deviceId || '').trim()
      if (!did || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return
      try {
        const resp = await api.motionData.listFiles({
          device_id: did,
          file_time_start: formatLocalDateTimeParam(new Date(startMs)),
          file_time_end: formatLocalDateTimeParam(new Date(endMs)),
          status_filter: 'completed',
          page: 1,
          limit: 20
        })
        const files = resp.data?.data || []
        if (!Array.isArray(files) || files.length === 0) {
          motionMatchNotFound.value = true
          motionMatchNotFoundRangeMs.value = { startMs, endMs }
          return
        }

        motionMatchNotFound.value = false
        motionMatchNotFoundRangeMs.value = { startMs: null, endMs: null }

        // 统一使用多选弹窗（1 个或多个文件都弹窗，由用户点击「加载数据」确认；不预选，避免误以为已勾选并加载）
        autoMotionCandidates.value = files
        // 统一使用 string id，避免 selectable/includes 发生类型不一致导致“已勾选但不可取消/不可再选”
        autoMotionPickedIds.value = []
        autoMotionPendingKeep.value = null
        showAutoMotionPickDialog.value = true
      } catch (e) {
        console.warn('自动匹配运行数据失败（不影响日志）:', e)
      }
    }

    const autoPickLogsByRange = async (deviceId, startMs, endMs) => {
      const did = String(deviceId || '').trim()
      if (!did || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return
      try {
        const startToken = dateToHourToken(new Date(startMs))
        const endToken = dateToHourToken(new Date(endMs))
        if (!startToken || !endToken) return

        const resp = await api.logs.getList({
          device_id: did,
          time_range_start: startToken,
          time_range_end: endToken,
          status_filter: 'completed',
          page: 1,
          limit: 20
        })
        const logs = resp.data?.logs || []
        if (!Array.isArray(logs) || logs.length === 0) {
          logMatchNotFound.value = true
          logMatchNotFoundRangeMs.value = { startMs, endMs }
          return
        }

        logMatchNotFound.value = false
        logMatchNotFoundRangeMs.value = { startMs: null, endMs: null }

        const limitedLogs = logs.slice(0, 2)
        const names = limitedLogs.map((l) => l?.original_name || l?.filename || l?.id).filter(Boolean)
        const fileNames = names.length ? names.join('\n') : ''

        try {
          await ElMessageBox.confirm(
            t('dataAnalysis.autoAddLogsConfirm', { fileNames }) ||
              `检测到该时间段有可用日志文件（最多自动添加2个）：\n${fileNames}\n是否自动加载？`,
            t('dataAnalysis.confirmTitle') || '确认',
            {
              confirmButtonText: t('shared.confirm') || '确定',
              cancelButtonText: t('shared.cancel') || '取消',
              type: 'info'
            }
          )
        } catch {
          return
        }

        selectedLogFiles.value = limitedLogs
        suppressAutoMotionFromLog.value = true
        await handleLoadLogData()
      } catch (e) {
        console.warn('自动匹配日志失败（不影响运行数据）:', e)
      } finally {
        suppressAutoMotionFromLog.value = false
      }
    }

    const probeMotionFilesByTimeRange = async (deviceId, startMs, endMs) => {
      const did = String(deviceId || '').trim()
      if (!did || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return false
      const resp = await api.motionData.listFiles({
        device_id: did,
        file_time_start: new Date(startMs).toISOString(),
        file_time_end: new Date(endMs).toISOString(),
        status_filter: 'completed',
        page: 1,
        limit: 1
      })
      const files = resp.data?.data || []
      return Array.isArray(files) && files.length > 0
    }

    const hourPartsToRange = (parts) => {
      if (!parts) return null
      const start = new Date(parts.year, parts.month - 1, parts.day, parts.hour, 0, 0, 0)
      // 该小时的最后一秒（不含毫秒），避免包含下一个整点
      const end = new Date(start.getTime() + 60 * 60 * 1000 - 1000)
      return { start, end }
    }

    const loadMotionSingleFile = async (file) => {
      if (!file?.id) return
      try {
        loading.value = true
        const previewResp = await api.motionData.preview(file.id, { offset: 0, limit: 5000 })
        const rows = previewResp.data?.rows || []
        rows.sort((a, b) => toEpochMs(a?.ulint_data) - toEpochMs(b?.ulint_data))
        motionRawRows.value = rows
        selectedMotionFile.value = file
        selectedMotionFiles.value = [file]
        motionSlots.value = motionSlots.value.map((s) => ({ ...s, title: '', series: [] }))
        motionMatchNotFound.value = false
        motionMatchNotFoundRangeMs.value = { startMs: null, endMs: null }
        // 此处日志窗口已在 replaceLogWindow 加载完成，避免 sync 内再次 replaceLogWindow 造成重复请求/限流
        await syncTimelineRangeByLoadedData({ preserveCursorAbs: true, skipReplaceLogWindow: true })
      } catch (e) {
        console.warn('自动加载运行数据失败（不影响日志）:', e)
      } finally {
        loading.value = false
      }
    }

    // 加载多个运行数据文件（最多5个）
    const loadMotionFilesData = async (files) => {
      if (!files || files.length === 0) return
      
      try {
        loading.value = true
        
        // 加载所有文件的数据
        const previews = await Promise.all(
          files.map((f) => api.motionData.preview(f.id, { offset: 0, limit: 5000 }))
        )
        
        // 合并数据并排序
        const merged = []
        previews.forEach((resp) => {
          const rows = resp.data?.rows || []
          if (Array.isArray(rows) && rows.length) merged.push(...rows)
        })
        merged.sort((a, b) => toEpochMs(a?.ulint_data) - toEpochMs(b?.ulint_data))
        
        motionRawRows.value = merged
        selectedMotionFile.value = files[0] || null
        selectedMotionFiles.value = files
        motionSlots.value = motionSlots.value.map((s) => ({ ...s, title: '', series: [] }))
        motionMatchNotFound.value = false
        motionMatchNotFoundRangeMs.value = { startMs: null, endMs: null }

        await syncTimelineRangeByLoadedData()
      } catch (e) {
        console.warn('加载运行数据失败:', e)
        ElMessage.error(t('dataAnalysis.loadFailed') || '加载数据失败')
      } finally {
        loading.value = false
      }
    }

    // 根据运行数据时间范围限定日志条目
    const limitLogEntriesByMotionTimeRange = async (motionStartTime, motionEndTime) => {
      if (!motionStartTime || !motionEndTime) return
      
      // 设定允许展示的日志范围（用于窗口化加载的 clamp）
      logAllowedStartMs.value = motionStartTime
      logAllowedEndMs.value = motionEndTime
      await syncTimelineRangeByLoadedData({ preserveCursorAbs: true })
    }

    const autoPickMotionByLogHour = async (logFile) => {
      try {
        const deviceId = String(logFile?.device_id || '').trim()
        const parts = getLogHourParts(logFile)
        const range = hourPartsToRange(parts)
        if (!deviceId || !range) return
        await autoPickMotionByRange(deviceId, range.start.getTime(), range.end.getTime())
      } catch (e) {
        console.warn('自动匹配运行数据失败（不影响日志）:', e)
      }
    }

    // 自动匹配运行数据选择变化（和运行数据列表一致；修正依赖 watcher 在 ref 可用时应用）
    const onAutoMotionSelectionChange = (selection) => {
      if (selection.length > 5) {
        ElMessage.warning(t('dataAnalysis.maxSelect5Motion') || '最多只能选择5个运行数据文件')
        const keep = selection.slice(0, 5)
        autoMotionPickedIds.value = keep.map(f => String(f?.id ?? '').trim()).filter(Boolean)
        autoMotionPendingKeep.value = keep
        const ref = autoMotionTableRef.value
        if (ref) {
          ref.clearSelection()
          keep.forEach((row) => ref.toggleRowSelection(row, true))
          autoMotionPendingKeep.value = null
        }
        return
      }
      autoMotionPendingKeep.value = null
      autoMotionPickedIds.value = selection.map(f => String(f?.id ?? '').trim()).filter(Boolean)
    }

    // ref 可用时：有待回选则应用；否则若弹窗已打开则清空勾选（避免 reserve-selection 恢复上次勾选）
    watch(
      autoMotionTableRef,
      (newRef) => {
        if (!newRef) return
        const pending = autoMotionPendingKeep.value
        if (pending?.length) {
          newRef.clearSelection()
          pending.forEach((row) => newRef.toggleRowSelection(row, true))
          autoMotionPendingKeep.value = null
          return
        }
        if (showAutoMotionPickDialog.value) {
          newRef.clearSelection()
        }
      },
      { immediate: true }
    )
    watch(showAutoMotionPickDialog, (open) => {
      if (!open) {
        autoMotionPendingKeep.value = null
        return
      }
      // 弹窗打开时清空勾选；若表格已挂载则立即清空，否则等 watch(autoMotionTableRef) 里清空
      nextTick(() => {
        const ref = autoMotionTableRef.value
        if (ref) ref.clearSelection()
      })
    })

    // 检查运行数据时间是否连续
    const checkMotionTimeContinuity = (files) => {
      if (files.length <= 1) return { continuous: true, gap: null }
      
      // 按时间排序
      const sorted = [...files].sort((a, b) => {
        const timeA = new Date(a.file_time || a.upload_time || 0).getTime()
        const timeB = new Date(b.file_time || b.upload_time || 0).getTime()
        return timeA - timeB
      })

      // 检查是否有时间间隔（假设每个文件约5分钟，间隔超过10分钟认为不连续）
      for (let i = 1; i < sorted.length; i++) {
        const prevTime = new Date(sorted[i - 1].file_time || sorted[i - 1].upload_time || 0).getTime()
        const currTime = new Date(sorted[i].file_time || sorted[i].upload_time || 0).getTime()
        const gap = currTime - prevTime
        
        // 如果间隔超过10分钟（600000毫秒），认为不连续
        if (gap > 10 * 60 * 1000) {
          return {
            continuous: false,
            gap: Math.round(gap / 1000 / 60), // 转换为分钟
            prevFile: sorted[i - 1].original_name || sorted[i - 1].filename,
            currFile: sorted[i].original_name || sorted[i].filename
          }
        }
      }
      
      return { continuous: true, gap: null }
    }

    const confirmAutoMotionPick = async () => {
      if (autoMotionPickedIds.value.length === 0) return
      
      const selectedFiles = autoMotionCandidates.value.filter(f => autoMotionPickedIds.value.includes(String(f?.id ?? '').trim()))
      
      // 检查时间连续性
      const continuity = checkMotionTimeContinuity(selectedFiles)
      if (!continuity.continuous) {
        // 提示用户二次确认
        try {
          await ElMessageBox.confirm(
            t('dataAnalysis.motionTimeGapWarning', {
              gap: continuity.gap,
              prevFile: continuity.prevFile,
              currFile: continuity.currFile
            }) || `检测到运行数据时间不连续，间隔约 ${continuity.gap} 分钟（${continuity.prevFile} 到 ${continuity.currFile}）。是否继续？`,
            t('dataAnalysis.confirmTitle') || '确认',
            {
              confirmButtonText: t('shared.confirm') || '确定',
              cancelButtonText: t('shared.cancel') || '取消',
              type: 'warning'
            }
          )
        } catch {
          // 用户取消
          return
        }
      }

      try {
        // 加载选中的运行数据文件（最多5个），loadMotionFilesData 内会设置 loading，完成后才关闭弹窗
        await loadMotionFilesData(selectedFiles)
        showAutoMotionPickDialog.value = false
        // 自动匹配日志（需要用户确认；不影响手动选择）
        if (!hasLogsData.value && !suppressAutoLogFromMotion.value) {
          const deviceId = String(selectedFiles?.[0]?.device_id || '').trim()
          const range = getMotionRangeFromRows(motionRawRows.value)
          if (deviceId && range) {
            await autoPickLogsByRange(deviceId, range.startMs, range.endMs)
          }
        }
      } catch (e) {
        console.warn('自动匹配确认后加载运行数据失败:', e)
        ElMessage.error(t('dataAnalysis.loadFailed') || '加载数据失败')
      }
    }

    const autoPickLogsByMotionHour = async (motionFile) => {
      try {
        const deviceId = String(motionFile?.device_id || '').trim()
        const ft = motionFile?.file_time || motionFile?.upload_time
        const dt = ft ? new Date(ft) : null
        if (!deviceId || !dt || Number.isNaN(dt.getTime())) return
        const startMs = dt.getTime()
        await autoPickLogsByRange(deviceId, startMs, startMs)
      } catch (e) {
        console.warn('自动匹配日志失败（不影响运行数据）:', e)
      }
    }

    const openSelectionDialog = async (type) => {
      if (hasMotionData.value && logMatchNotFound.value) {
        ElMessage.warning(t('dataAnalysis.cannotAddLogWhenNotFound') || '未检索到对应时间段的日志数据，无法手动添加。')
        return
      }
      showSelectionDialog.value = true
      // 打开弹窗时强制清空当前高亮行，避免“看似已选中但状态为 null”导致无法再次触发 current-change
      selectedDeviceForLogs.value = null
      await nextTick()
      logDeviceTableRef.value?.setCurrentRow?.(null)
      // 打开弹窗时重新加载数据（如果设备列表为空）
      if (deviceGroups.value.length === 0) {
        await loadDeviceGroups()
      }
    }

    // 兼容旧占位点击逻辑（分析态内仍在使用）
    const handlePlaceholderClick = (type) => {
      if (type === 'motion') {
        openMotionSelectionDialog()
        return
      }
      openSelectionDialog(type)
    }

    const triggerLocalVideoPicker = () => {
      videoFileInput.value?.click()
    }

    const clearVideo = () => {
      // 释放视频 URL，避免内存泄漏
      if (videoObjectUrl.value) {
        URL.revokeObjectURL(videoObjectUrl.value)
        videoObjectUrl.value = null
      }
      videoSource.value = null
      resetVideoAnchor()
      // 不重置 cursorMs / maxTime：时间轴由日志/运行数据决定，清空视频后再次添加不应改变日志范围
    }

    const clearLogs = () => {
      resetVideoAnchor()
      // 联动清空：清空日志时同时清空运行数据（保持一致性）
      clearLogsData()
      clearMotionData()
      resetTimeline()
      // 清空对话框内的设备选择状态（避免“清空后选不了设备”的残留状态）
      selectedDeviceForLogs.value = null
      selectedDeviceForMotion.value = null
      // 清除设备表格的当前行高亮
      nextTick(() => {
        if (logDeviceTableRef.value) {
          logDeviceTableRef.value.setCurrentRow(null)
        }
        if (motionDeviceTableRef.value) {
          motionDeviceTableRef.value.setCurrentRow(null)
        }
      })
    }

    const onVideoFileChange = (e) => {
      const input = e?.target
      const file = input?.files?.[0]
      if (!file) return

      // 释放旧 URL，避免内存泄漏
      if (videoObjectUrl.value) {
        URL.revokeObjectURL(videoObjectUrl.value)
        videoObjectUrl.value = null
      }

      const url = URL.createObjectURL(file)
      videoObjectUrl.value = url
      videoSource.value = url

      // 只选择视频也可进入分析态：右侧日志/运行数据保持占位
      cursorMs.value = 0
      // 不自动设置 videoStartTime，让用户手动配置
      // 如果用户之前已配置过，保持原有配置

      // 允许重复选择同一个文件
      input.value = ''
    }

    // 格式化视频起始时间显示
    const formatVideoStartTime = (timestamp) => {
      if (!timestamp && timestamp !== 0) return null
      const date = new Date(timestamp)
      if (Number.isNaN(date.getTime())) return null
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${hours}:${minutes}:${seconds}`
    }

    // 配置弹窗内「当前视频进度」显示为 MM:SS
    const formatConfigDialogVideoProgress = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
      const m = Math.floor(seconds / 60)
      const s = Math.floor(seconds % 60)
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    // 时间选择器：限制在选中日期的有效时间范围内（单日直接用 range，跨日用 selectedDayRange）
    const videoConfigDisabledHours = () => {
      const range = videoConfigSelectedDayRange.value
      if (range?.first == null || range?.last == null) return []
      const firstD = dayjs(range.first)
      const lastD = dayjs(range.last)
      const disabled = []
      for (let h = 0; h < firstD.hour(); h++) disabled.push(h)
      for (let h = lastD.hour() + 1; h < 24; h++) disabled.push(h)
      return disabled
    }
    const videoConfigDisabledMinutes = (hour) => {
      const range = videoConfigSelectedDayRange.value
      if (range?.first == null || range?.last == null) return []
      const firstD = dayjs(range.first)
      const lastD = dayjs(range.last)
      const disabled = []
      if (hour === firstD.hour()) {
        for (let m = 0; m < firstD.minute(); m++) disabled.push(m)
      }
      if (hour === lastD.hour()) {
        for (let m = lastD.minute() + 1; m < 60; m++) disabled.push(m)
      }
      return disabled
    }
    const videoConfigDisabledSeconds = (hour, minute) => {
      const range = videoConfigSelectedDayRange.value
      if (range?.first == null || range?.last == null) return []
      const firstD = dayjs(range.first)
      const lastD = dayjs(range.last)
      const disabled = []
      if (hour === firstD.hour() && minute === firstD.minute()) {
        for (let s = 0; s < firstD.second(); s++) disabled.push(s)
      }
      if (hour === lastD.hour() && minute === lastD.minute()) {
        for (let s = lastD.second() + 1; s < 60; s++) disabled.push(s)
      }
      return disabled
    }

    // 应用视频时间配置：Tvideon 对应 Tlogn；基准日期取日志范围起始日，仅选时/分/秒
    const applyVideoTimeConfig = () => {
      const timeStr = videoTimeConfigForm.value.startTime
      if (!timeStr || typeof timeStr !== 'string') {
        ElMessage.warning(t('dataAnalysis.pleaseSelectStartTime') || '请选择该时刻对应时间')
        return
      }
      const range = videoConfigTimeRange.value
      if (!range || range.first == null || range.last == null) {
        ElMessage.warning(t('dataAnalysis.noDataForVideoConfig') || '没有日志或运行数据，无需配置时间轴')
        return
      }
      if (videoConfigIsCrossDay.value && !videoTimeConfigForm.value.selectedDate) {
        ElMessage.warning(t('dataAnalysis.pleaseSelectDate') || '请先选择日期')
        return
      }
      const parts = timeStr.split(':').map(Number)
      if (parts.length < 3 || !parts.every(Number.isFinite)) {
        ElMessage.warning(t('dataAnalysis.pleaseSelectStartTime') || '请选择有效的时:分:秒')
        return
      }
      const [hours, minutes, seconds] = parts
      let baseDate
      if (videoConfigIsCrossDay.value && videoTimeConfigForm.value.selectedDate) {
        baseDate = new Date(videoTimeConfigForm.value.selectedDate)
      } else {
        baseDate = new Date(range.first)
      }
      baseDate.setHours(hours, minutes, seconds, 0)
      const tlogn = baseDate.getTime()
      if (!Number.isFinite(tlogn)) {
        ElMessage.warning(t('dataAnalysis.pleaseSelectStartTime') || '请选择有效的时:分:秒')
        return
      }
      if (!videoPlayer.value || !Number.isFinite(configDialogVideoCurrentTime.value)) {
        ElMessage.warning(t('dataAnalysis.videoNotReady') || '请先加载视频')
        return
      }
      if (tlogn < range.first || tlogn > range.last) {
        ElMessage.warning(t('dataAnalysis.selectTimeInLogRange') || '请选择日志时间范围内的时刻')
        return
      }
      const tvideon = Math.floor((configDialogVideoCurrentTime.value ?? 0) * 1000)
      const tb = timeBase.value
      const mt = maxTime.value
      if (tb == null || !Number.isFinite(mt) || mt <= 0) {
        ElMessage.warning(t('dataAnalysis.noDataForVideoConfig') || '请先加载日志或运行数据以确定联动轴')
        return
      }
      const tlogstart = tb
      const tlogend = tb + mt
      videoAnchorLogMs.value = tlogn
      videoAnchorVideoMs.value = tvideon
      videoStartTime.value = null

      const durationMs = (videoPlayer.value?.duration ?? 0) * 1000
      const videoStartLogMs = tlogn - tvideon
      const videoEndLogMs = videoStartLogMs + durationMs
      const startLogStr = formatYmdHms(new Date(videoStartLogMs))
      const endLogStr = formatYmdHms(new Date(videoEndLogMs))

      showVideoTimeConfigDialog.value = false
      ElMessage.success(
        t('dataAnalysis.videoTimeConfigSuccess') || '视频起始时间配置成功'
      )
      ElMessage.info({
        message: `${t('dataAnalysis.videoStartMapsToLog') || '视频0s →'} ${startLogStr}\n${t('dataAnalysis.videoEndMapsToLog') || '视频结束 →'} ${endLogStr}`,
        duration: 6000,
        showClose: true
      })
    }

    // 关闭视频时间配置弹窗时的处理
    const onVideoTimeConfigDialogClose = () => {
      // 关闭时不清空表单，下次打开由 watch 根据当前进度与 videoStartTime 回填
    }

    // 仅添加视频时：src 切换后强制进度为 0（不依赖 loadedmetadata 时机）
    watch(videoSource, (url) => {
      if (!url) return
      nextTick(() => {
        if (videoPlayer.value?.src && videoPlayer.value.src === url) {
          videoPlayer.value.currentTime = 0
        }
      })
    })

    // 打开配置弹窗时捕获当前视频进度，并回填「当前画面对应的实际时间」
    watch(showVideoTimeConfigDialog, (open) => {
      if (open) {
        nextTick(() => {
          const cur = videoPlayer.value?.currentTime ?? 0
          const dur = videoPlayer.value?.duration ?? 0
          configDialogVideoCurrentTime.value = cur
          configDialogVideoDuration.value = dur
          const range = videoConfigTimeRange.value
          if (range?.first == null || range?.last == null) {
            videoTimeConfigForm.value.startTime = null
            videoTimeConfigForm.value.selectedDate = null
          } else {
            let clamped
            if (videoAnchorLogMs.value != null && videoAnchorVideoMs.value != null && Number.isFinite(cur)) {
              const ms = videoAnchorLogMs.value + (cur * 1000 - videoAnchorVideoMs.value)
              clamped = Math.min(Math.max(ms, range.first), range.last)
            } else if (videoStartTime.value != null && Number.isFinite(cur)) {
              const ms = Number(videoStartTime.value) + cur * 1000
              clamped = Math.min(Math.max(ms, range.first), range.last)
            } else if (Number.isFinite(cur)) {
              const suggestedMs = range.first + cur * 1000
              clamped = Math.min(Math.max(suggestedMs, range.first), range.last)
            } else {
              clamped = range.first
            }
            videoTimeConfigForm.value.startTime = formatVideoStartTime(clamped)
            if (videoConfigIsCrossDay.value) {
              videoTimeConfigForm.value.selectedDate = formatYmd(new Date(clamped))
            } else {
              videoTimeConfigForm.value.selectedDate = null
            }
          }
        })
      }
    })

    // 根据「当前画面对应的实际时间」推断视频开始/结束时间（弹窗内展示用）
    const inferredVideoTimeRange = computed(() => {
      const dur = configDialogVideoDuration.value
      if (videoAnchorLogMs.value != null && videoAnchorVideoMs.value != null && Number.isFinite(dur) && dur >= 0) {
        const startMs = videoAnchorLogMs.value - videoAnchorVideoMs.value
        return { startMs, endMs: startMs + dur * 1000 }
      }
      const timeStr = videoTimeConfigForm.value.startTime
      const cur = configDialogVideoCurrentTime.value
      const range = videoConfigTimeRange.value
      if (!timeStr || !Number.isFinite(cur)) return null
      const parts = timeStr.split(':').map(Number)
      if (parts.length < 3 || !parts.every(Number.isFinite)) return null
      const [h, m, s] = parts
      let baseDate
      if (videoConfigIsCrossDay.value && videoTimeConfigForm.value.selectedDate) {
        baseDate = new Date(videoTimeConfigForm.value.selectedDate)
      } else {
        baseDate = range?.first != null ? new Date(range.first) : new Date()
      }
      baseDate.setHours(h, m, s, 0)
      const thatMs = baseDate.getTime()
      if (!Number.isFinite(thatMs)) return null
      const startMs = thatMs - cur * 1000
      const endMs = Number.isFinite(dur) && dur >= 0 ? startMs + dur * 1000 : null
      return { startMs, endMs }
    })

    // 构建树形数据
    const buildLogTreeData = () => {
      const tree = []
      // 使用 deviceGroups（来自 fetchLogsByDevice）而不是 devices
      for (const deviceGroup of deviceGroups.value) {
        const deviceId = deviceGroup.device_id
        const logs = deviceLogsMap.value.get(deviceId) || []
        const children = logs.map(log => ({
          id: `log-${log.id}`,
          label: log.original_name || log.filename || `Log ${log.id}`,
          isDevice: false,
          isLog: true,
          logId: log.id,
          deviceId: deviceId,
          uploadTime: log.upload_time || log.created_at
        }))
        tree.push({
          id: `device-${deviceId}`,
          label: deviceId,
          isDevice: true,
          isLog: false,
          deviceId: deviceId,
          logCount: deviceGroup.log_count || logs.length,
          children: children.length > 0 ? children : undefined
        })
      }
      logTreeData.value = tree
    }

    // 过滤树节点
    const filterLogTreeNode = (value, data) => {
      if (!value) return true
      const filter = value.toLowerCase()
      if (data.isDevice) {
        // 设备节点：匹配设备ID或子节点
        if (data.label.toLowerCase().includes(filter)) return true
        // 检查子节点是否匹配
        const logs = deviceLogsMap.value.get(data.deviceId) || []
        return logs.some(log => {
          const name = (log.original_name || log.filename || '').toLowerCase()
          return name.includes(filter)
        })
      } else {
        // 日志节点：匹配日志文件名
        return data.label.toLowerCase().includes(filter)
      }
    }

    // 监听搜索文本变化
    watch(logTreeFilterText, (val) => {
      if (logTreeRef.value) {
        logTreeRef.value.filter(val)
      }
    })

    // 树节点点击事件
    const onLogTreeNodeClick = async (data) => {
      if (data.isDevice) {
        // 点击设备节点：展开/折叠，不选择
        // 如果该设备的日志未加载，先加载
        if (!deviceLogsMap.value.has(data.deviceId)) {
          try {
            loading.value = true
            // 使用 getList 接口获取指定设备的日志列表（不是 getByDevice）
            const response = await api.logs.getList({
              device_id: data.deviceId,
              page: 1,
              limit: 100
            })
            const logs = response.data?.logs || []
            deviceLogsMap.value.set(data.deviceId, logs)
            // 重新构建树形数据，更新该设备的子节点
            buildLogTreeData()
            // 展开该设备节点
            if (logTreeRef.value) {
              const node = logTreeRef.value.getNode(data.id)
              if (node && !node.expanded) {
                node.expand()
              }
            }
          } catch (error) {
            console.error(`加载设备 ${data.deviceId} 的日志失败:`, error)
            ElMessage.error(t('dataAnalysis.fetchLogsFailed') || '获取日志列表失败')
          } finally {
            loading.value = false
          }
        }
        return
      }
      if (data.isLog) {
        // 点击日志节点：选择该日志
        selectionForm.value.deviceId = data.deviceId
        selectionForm.value.logId = data.logId
        await onLogChange()
      }
    }

    const onDeviceChange = async () => {
      if (!selectionForm.value.deviceId) {
        availableLogs.value = []
        selectionForm.value.logId = ''
        selectionForm.value.startTime = ''
        logTimeLimit.value = { min: null, max: null }
        return
      }
      try {
        loading.value = true
        // 使用 getList 接口获取指定设备的日志列表
        const response = await api.logs.getList({
          device_id: selectionForm.value.deviceId,
          page: 1,
          limit: 100
        })
        availableLogs.value = response.data?.logs || []
      } catch (error) {
        console.error('获取日志列表失败:', error)
        ElMessage.error(t('dataAnalysis.fetchLogsFailed') || '获取日志列表失败')
      } finally {
        loading.value = false
      }
    }

    const onLogChange = async () => {
      if (!selectionForm.value.logId) {
        selectionForm.value.startTime = ''
        logTimeLimit.value = { min: null, max: null }
        return
      }
      try {
        loading.value = true
        const resp = await api.logs.getBatchEntries({
          log_ids: String(selectionForm.value.logId),
          page: 1,
          limit: 1
        })
        const minTs = resp.data?.minTimestamp
        const maxTs = resp.data?.maxTimestamp
        logTimeLimit.value = { min: minTs || null, max: maxTs || null }
        if (minTs) {
          selectionForm.value.startTime = formatYmdHms(minTs)
          selectedDate.value = new Date(minTs)
        }
      } catch (error) {
        console.error('获取日志时间范围失败:', error)
      } finally {
        loading.value = false
      }
    }

    const disableStartTime = (date) => {
      if (!date) return false
      const min = logTimeLimit.value.min ? new Date(logTimeLimit.value.min) : null
      const max = logTimeLimit.value.max ? new Date(logTimeLimit.value.max) : null
      if (min && !Number.isNaN(min.getTime()) && date < min) return true
      if (max && !Number.isNaN(max.getTime()) && date > max) return true
      return false
    }

    const onStartTimeChange = () => {
      if (!selectionForm.value.startTime) return
      const start = new Date(selectionForm.value.startTime)
      if (Number.isNaN(start.getTime())) return
      const min = logTimeLimit.value.min ? new Date(logTimeLimit.value.min) : null
      const max = logTimeLimit.value.max ? new Date(logTimeLimit.value.max) : null
      if (min && !Number.isNaN(min.getTime()) && start < min) selectionForm.value.startTime = formatYmdHms(min)
      if (max && !Number.isNaN(max.getTime()) && start > max) selectionForm.value.startTime = formatYmdHms(max)
      selectedDate.value = new Date(selectionForm.value.startTime)
    }

    const handleLoadData = async () => {
      if (!selectionForm.value.logId) {
        ElMessage.warning(t('dataAnalysis.selectLogFirst') || '请先选择日志文件')
        return
      }

      try {
        loading.value = true
        // 选择日志后：清空“运行数据 -> 日志缺失”的提示（避免旧提示残留）
        logMatchNotFound.value = false
        logMatchNotFoundRangeMs.value = { startMs: null, endMs: null }

        // 1) 计算时间范围：默认从日志开始取 5 分钟
        const startStr = selectionForm.value.startTime || (logTimeLimit.value.min ? formatYmdHms(logTimeLimit.value.min) : '')
        if (!startStr) {
          ElMessage.warning(t('dataAnalysis.selectStartTime') || '请选择开始时间')
          return
        }
        const startDate = new Date(startStr)
        if (Number.isNaN(startDate.getTime())) {
          ElMessage.warning(t('dataAnalysis.selectStartTime') || '请选择开始时间')
          return
        }
        const endStr = computedEndTime.value
        const endDate = new Date(endStr)
        const startMs = startDate.getTime()
        const endMs = endDate.getTime()
        if (Number.isNaN(endMs) || endMs <= startMs) {
          ElMessage.warning(t('dataAnalysis.invalidTimeRange') || '时间范围不合法')
          return
        }

        // 2) 加载该时间窗口的日志条目（后端已支持时间过滤）
        const logResponse = await api.logs.getBatchEntries({
          log_ids: String(selectionForm.value.logId),
          start_time: startStr,
          end_time: endStr,
          page: 1,
          limit: 10000
        })
        const entries = logResponse.data?.entries || []
        if (!entries.length) {
          ElMessage.warning(t('dataAnalysis.noLogEntries') || '该时间范围内没有日志条目')
          return
        }
        logEntries.value = entries
        // 记录当前已加载日志窗口的时间范围（用于时间轴/对齐计算）
        logFileTotalTimeRange.value = { min: startMs, max: endMs }

        // 3) 自动加载对应设备对应时间的运行数据（不影响日志查看）
        if (selectionForm.value.deviceId) {
          await loadMotionData(selectionForm.value.deviceId, startMs, endMs)
        }
        await syncTimelineRangeByLoadedData({ preserveCursorAbs: false })

        // 4) 打开批量日志查看页（借鉴 Logs.vue），并传入时间范围
        const routeData = router.resolve({
          path: `/batch-analysis/${selectionForm.value.logId}`,
          query: { start_time: startStr, end_time: endStr }
        })
        window.open(routeData.href, '_blank')

        showSelectionDialog.value = false
        ElMessage.success(t('dataAnalysis.loadSuccess') || '数据加载成功')
      } catch (error) {
        console.error('加载数据失败:', error)
        ElMessage.error(t('dataAnalysis.loadFailed') || '加载数据失败')
      } finally {
        loading.value = false
      }
    }

    const onSelectionDialogClose = () => {
      // 关闭弹窗时重置搜索
      logTreeFilterText.value = ''
      if (logTreeRef.value) {
        logTreeRef.value.filter('')
      }
      // 重置选择状态
      selectedDeviceForLogs.value = null
      logFileList.value = []
      deviceFilterValue.value = ''
      logQuickRange.value = 'all'
      logSelectedYear.value = 'all'
      logSelectedMonth.value = 'all'
      logSelectedDay.value = 'all'
      // 清除设备表格的当前行高亮
      nextTick(() => {
        if (logDeviceTableRef.value) {
          logDeviceTableRef.value.setCurrentRow(null)
        }
      })
    }

    const motionSelectedLabel = computed(() => {
      if (!selectedMotionFiles.value.length) return ''
      if (selectedMotionFiles.value.length === 1) {
        const f = selectedMotionFiles.value[0]
        return f?.original_name || f?.file_time_token || f?.id || ''
      }
      return `已选择 ${selectedMotionFiles.value.length} 个文件`
    })

    const openMotionSelectionDialog = async () => {
      if (hasLogsData.value && motionMatchNotFound.value) {
        ElMessage.warning(t('dataAnalysis.cannotAddMotionWhenNotFound') || '未检索到对应时间段的运行数据，无法手动添加。')
        return
      }
      showMotionSelectionDialog.value = true
      // 打开弹窗时强制清空当前高亮行，避免“看似已选中但状态为 null”导致无法再次触发 current-change
      selectedDeviceForMotion.value = null
      await nextTick()
      motionDeviceTableRef.value?.setCurrentRow?.(null)
      if (motionDeviceGroups.value.length === 0) {
        await loadMotionDeviceGroups()
      }
    }

    const onMotionSelectionDialogClose = () => {
      selectedDeviceForMotion.value = null
      motionDialogSelectedFiles.value = []
      motionFileList.value = []
      motionDeviceFilterValue.value = ''
      motionQuickRange.value = 'all'
      motionSelectedYear.value = 'all'
      motionSelectedMonth.value = 'all'
      motionSelectedDay.value = 'all'
      // 清除设备表格的当前行高亮
      nextTick(() => {
        if (motionDeviceTableRef.value) {
          motionDeviceTableRef.value.setCurrentRow(null)
        }
      })
    }

    const applyMotionDeviceFilter = () => {
      motionDeviceCurrentPage.value = 1
      loadMotionDeviceGroups()
    }

    const handleMotionDeviceSizeChange = (size) => {
      motionDevicePageSize.value = size
      motionDeviceCurrentPage.value = 1
      loadMotionDeviceGroups()
    }

    const handleMotionDeviceCurrentChange = (page) => {
      motionDeviceCurrentPage.value = page
      loadMotionDeviceGroups()
    }

    const onMotionDeviceRowClick = (row) => {
      if (!row) return
      selectedDeviceForMotion.value = row
      motionFileCurrentPage.value = 1
      motionDialogSelectedFiles.value = []
      loadMotionTimeFilters()
      loadMotionFiles()
    }

    const loadMotionDeviceGroups = async () => {
      try {
        motionDeviceGroupsLoading.value = true
        const resp = await api.motionData.listFilesByDevice({
          page: motionDeviceCurrentPage.value,
          limit: motionDevicePageSize.value,
          device_filter: motionDeviceFilterValue.value.trim()
        })
        motionDeviceGroups.value = resp.data?.device_groups || []
        motionDeviceTotal.value = resp.data?.pagination?.total || 0
      } catch (e) {
        console.error('加载运行数据设备分组失败:', e)
        ElMessage.error(t('dataAnalysis.fetchDevicesFailed') || '加载设备列表失败')
      } finally {
        motionDeviceGroupsLoading.value = false
      }
    }

    const motionQuickRangeOptions = computed(() => ([
      { value: 'all', label: t('logs.surgeriesFilters.quickAll') || '全部' },
      { value: '1d', label: t('logs.surgeriesFilters.quick1d') || '最近1天' },
      { value: '7d', label: t('logs.surgeriesFilters.quick7d') || '最近7天' },
      { value: '30d', label: t('logs.surgeriesFilters.quick30d') || '最近30天' },
      { value: 'custom', label: t('logs.surgeriesFilters.quickCustom') || '自定义' }
    ]))

    const motionYearOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.yearSuffix') || '年'
      const yearsSource = Array.isArray(motionAvailableYears.value) ? motionAvailableYears.value : []
      const normalizedYears = yearsSource
        .map((year) => {
          const num = Number(year)
          if (Number.isNaN(num)) return null
          return String(num).padStart(4, '0')
        })
        .filter(Boolean)
      const years = normalizedYears.length ? normalizedYears.sort((a, b) => Number(b) - Number(a)) : [String(currentYear)]
      return [
        { value: 'all', label: t('logs.surgeriesFilters.yearAll') || '全部' },
        ...years.map((year) => ({ value: year, label: `${year}${suffix}` }))
      ]
    })

    const motionMonthOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.monthSuffix') || '月'
      if (motionSelectedYear.value === 'all') {
        return [{ value: 'all', label: t('logs.surgeriesFilters.monthAll') || '全部' }]
      }
      const months = motionAvailableMonths.value[motionSelectedYear.value] || []
      const normalizedMonths = months
        .map((m) => {
          const num = Number(m)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        })
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.monthAll') || '全部' },
        ...normalizedMonths.map((month) => ({ value: month, label: `${month}${suffix}` }))
      ]
    })

    const motionDayOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.daySuffix') || '日'
      if (motionSelectedYear.value === 'all' || motionSelectedMonth.value === 'all') {
        return [{ value: 'all', label: t('logs.surgeriesFilters.dayAll') || '全部' }]
      }
      const key = `${motionSelectedYear.value}-${motionSelectedMonth.value}`
      const days = motionAvailableDays.value[key] || []
      const normalizedDays = days
        .map((d) => {
          const num = Number(d)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        })
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.dayAll') || '全部' },
        ...normalizedDays.map((day) => ({ value: day, label: `${day}${suffix}` }))
      ]
    })

    const handleMotionQuickRangeChange = () => {
      if (motionQuickRange.value !== 'custom') {
        motionSelectedYear.value = 'all'
        motionSelectedMonth.value = 'all'
        motionSelectedDay.value = 'all'
      }
      motionFileCurrentPage.value = 1
      loadMotionFiles()
    }

    const handleMotionYearChange = () => {
      motionSelectedMonth.value = 'all'
      motionSelectedDay.value = 'all'
      motionFileCurrentPage.value = 1
      loadMotionFiles()
    }

    const handleMotionMonthChange = () => {
      motionSelectedDay.value = 'all'
      motionFileCurrentPage.value = 1
      loadMotionFiles()
    }

    const handleMotionDayChange = () => {
      motionFileCurrentPage.value = 1
      loadMotionFiles()
    }

    const handleMotionFileSizeChange = (size) => {
      motionFilePageSize.value = size
      motionFileCurrentPage.value = 1
      loadMotionFiles()
    }

    const handleMotionFileCurrentChange = (page) => {
      motionFileCurrentPage.value = page
      loadMotionFiles()
    }

    const loadMotionTimeFilters = async () => {
      if (!selectedDeviceForMotion.value?.device_id) return
      try {
        const resp = await api.motionData.getTimeFilters({ device_id: selectedDeviceForMotion.value.device_id })
        const data = resp.data?.data || {}

        const normalizeYear = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(4, '0')
        }
        const normalizeMonth = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        }
        const normalizeDay = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        }

        const yearsArray = Array.isArray(data.years) ? data.years : []
        const normalizedYears = yearsArray.map(normalizeYear).filter(Boolean)
        motionAvailableYears.value = Array.from(new Set(normalizedYears))

        const monthsResult = {}
        if (data.monthsByYear && typeof data.monthsByYear === 'object') {
          Object.entries(data.monthsByYear).forEach(([year, list]) => {
            const normalizedYear = normalizeYear(year)
            if (!normalizedYear) return
            const months = Array.isArray(list) ? list : []
            const normalizedMonths = months.map(normalizeMonth).filter(Boolean)
            if (normalizedMonths.length) {
              monthsResult[normalizedYear] = Array.from(new Set(normalizedMonths))
            }
          })
        }
        motionAvailableMonths.value = monthsResult

        const daysResult = {}
        if (data.daysByYearMonth && typeof data.daysByYearMonth === 'object') {
          Object.entries(data.daysByYearMonth).forEach(([key, list]) => {
            const [yearPart, monthPart] = String(key).split('-')
            const normalizedYear = normalizeYear(yearPart)
            const normalizedMonth = normalizeMonth(monthPart)
            if (!normalizedYear || !normalizedMonth) return
            const normalizedDays = (Array.isArray(list) ? list : []).map(normalizeDay).filter(Boolean)
            if (normalizedDays.length) {
              daysResult[`${normalizedYear}-${normalizedMonth}`] = Array.from(new Set(normalizedDays))
            }
          })
        }
        motionAvailableDays.value = daysResult
      } catch (e) {
        console.warn('loadMotionTimeFilters error:', e)
        motionAvailableYears.value = []
        motionAvailableMonths.value = {}
        motionAvailableDays.value = {}
      }
    }

    const formatLocalDateTimeParam = (date) => {
      if (!date) return ''
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const hh = String(date.getHours()).padStart(2, '0')
      const mm = String(date.getMinutes()).padStart(2, '0')
      const ss = String(date.getSeconds()).padStart(2, '0')
      return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
    }

    const buildMotionTimeParams = () => {
      const params = {}
      let startDate = null
      let endDate = null
      const now = new Date()

      if (motionQuickRange.value === '1d') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        endDate = now
      } else if (motionQuickRange.value === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        endDate = now
      } else if (motionQuickRange.value === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        endDate = now
      }

      if (
        motionQuickRange.value === 'custom' ||
        motionSelectedYear.value !== 'all' ||
        motionSelectedMonth.value !== 'all' ||
        motionSelectedDay.value !== 'all'
      ) {
        const year = motionSelectedYear.value === 'all' ? currentYear : Number(motionSelectedYear.value)
        const month = motionSelectedMonth.value === 'all' ? null : Number(motionSelectedMonth.value)
        const day = motionSelectedDay.value === 'all' ? null : Number(motionSelectedDay.value)
        if (year && !Number.isNaN(year)) {
          const start = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0)
          let end
          if (day) {
            end = new Date(year, (month || 1) - 1, day, 23, 59, 59, 999)
          } else if (month) {
            end = new Date(year, month, 0, 23, 59, 59, 999)
          } else {
            end = new Date(year, 11, 31, 23, 59, 59, 999)
          }
          startDate = start
          endDate = end
        }
      }

      if (startDate && endDate) {
        params.file_time_start = formatLocalDateTimeParam(startDate)
        params.file_time_end = formatLocalDateTimeParam(endDate)
      }
      return params
    }

    const loadMotionFiles = async () => {
      if (!selectedDeviceForMotion.value?.device_id) return
      try {
        motionFileLoading.value = true
        const timeParams = buildMotionTimeParams()
        const resp = await api.motionData.listFiles({
          device_id: selectedDeviceForMotion.value.device_id,
          page: motionFileCurrentPage.value,
          limit: motionFilePageSize.value,
          status_filter: 'all',
          ...timeParams
        })
        motionFileList.value = resp.data?.data || []
        motionFileTotal.value = resp.data?.total ?? 0
      } catch (e) {
        console.error('加载运行数据文件列表失败:', e)
        ElMessage.error(t('dataAnalysis.loadFailed') || '加载数据失败')
      } finally {
        motionFileLoading.value = false
      }
    }

    const checkMotionSelectable = (row) => {
      return String(row?.status || '').trim() === 'completed'
    }

    const handleMotionSelectionChange = (selection) => {
      if (selection.length > 5) {
        ElMessage.warning(t('dataAnalysis.maxSelect5Motion') || '最多只能选择5个运行数据文件')
        const keep = selection.slice(0, 5)
        motionDialogSelectedFiles.value = keep
        // 使用 nextTick + setTimeout 确保在 Element Plus 完成全选操作后再修正选择状态
        nextTick(() => {
          setTimeout(() => {
            if (motionFileTableRef.value) {
              motionFileTableRef.value.clearSelection()
              keep.forEach((r) => motionFileTableRef.value.toggleRowSelection(r, true))
            }
          }, 10)
        })
        return
      }
      motionDialogSelectedFiles.value = selection
    }

    const getMotionStatusType = (row) => {
      const s = String(row?.status || '').trim()
      if (s === 'completed') return 'success'
      if (s === 'parsing' || s === 'uploading') return 'warning'
      if (['file_error', 'parse_failed', 'processing_failed'].includes(s)) return 'danger'
      return 'info'
    }

    const getMotionStatusText = (row) => {
      const s = String(row?.status || '').trim()
      const map = {
        completed: t('logs.statusFilter.completed'),
        parsing: t('logs.statusText.parsing'),
        uploading: t('logs.statusText.uploading'),
        parse_failed: t('logs.statusText.parse_failed'),
        file_error: t('logs.statusText.file_error'),
        processing_failed: t('dataReplay.processingFailed')
      }
      return map[s] || s || '-'
    }

    const handleLoadMotionDataFromDialog = async () => {
      if (motionDialogSelectedFiles.value.length === 0) {
        ElMessage.warning(t('dataAnalysis.selectMotionFirst') || '请先选择运行数据文件')
        return
      }
      try {
        loading.value = true
        const files = motionDialogSelectedFiles.value.slice(0, 5)
        const previews = await Promise.all(
          files.map((f) => api.motionData.preview(f.id, { offset: 0, limit: 5000 }))
        )
        const merged = []
        previews.forEach((resp) => {
          const rows = resp.data?.rows || []
          if (Array.isArray(rows) && rows.length) merged.push(...rows)
        })
        merged.sort((a, b) => toEpochMs(a?.ulint_data) - toEpochMs(b?.ulint_data))
        motionRawRows.value = merged
        selectedMotionFile.value = files[0] || null
        selectedMotionFiles.value = files
        // 切换文件后默认清空图位，避免错读
        motionSlots.value = motionSlots.value.map((s) => ({ ...s, title: '', series: [] }))

        // 已手动加载运行数据：清空“日志 -> 运行数据缺失”的提示
        motionMatchNotFound.value = false
        motionMatchNotFoundRangeMs.value = { startMs: null, endMs: null }

        // 自动匹配日志（需要用户确认；不影响手动选择）
        if (!hasLogsData.value && !suppressAutoLogFromMotion.value) {
          const deviceId = String(files?.[0]?.device_id || selectedDeviceForMotion.value?.device_id || '').trim()
          const range = getMotionRangeFromRows(merged)
          if (deviceId && range) {
            await autoPickLogsByRange(deviceId, range.startMs, range.endMs)
          }
        }

        showMotionSelectionDialog.value = false
        ElMessage.success(t('dataAnalysis.loadSuccess') || '数据加载成功')
      } catch (e) {
        console.error('加载运行数据失败:', e)
        ElMessage.error(t('dataAnalysis.loadFailed') || '加载数据失败')
      } finally {
        loading.value = false
      }
    }

    // 设备筛选相关方法
    const applyDeviceFilter = () => {
      deviceCurrentPage.value = 1
      loadDeviceGroups()
    }

    const handleDeviceSizeChange = (size) => {
      devicePageSize.value = size
      deviceCurrentPage.value = 1
      loadDeviceGroups()
    }

    const handleDeviceCurrentChange = (page) => {
      deviceCurrentPage.value = page
      loadDeviceGroups()
    }

    // 设备行点击事件
    const onDeviceRowClick = (row) => {
      if (!row) return
      selectedDeviceForLogs.value = row
      logFileCurrentPage.value = 1
      selectedLogFiles.value = []
      loadLogTimeFilters()
      loadLogFiles()
    }

    // 加载设备分组（带筛选和分页）
    const loadDeviceGroups = async () => {
      try {
        deviceGroupsLoading.value = true
        const response = await store.dispatch('logs/fetchLogsByDevice', {
          page: deviceCurrentPage.value,
          limit: devicePageSize.value,
          device_filter: deviceFilterValue.value.trim()
        })
        deviceGroups.value = response.data?.device_groups || []
        deviceTotal.value = response.data?.pagination?.total || 0
      } catch (error) {
        console.error('加载设备分组失败:', error)
        ElMessage.error(t('dataAnalysis.fetchDevicesFailed') || '加载设备列表失败')
      } finally {
        deviceGroupsLoading.value = false
      }
    }

    // 加载日志文件列表
    const loadLogFiles = async () => {
      if (!selectedDeviceForLogs.value) return
      try {
        logFileLoading.value = true
        const timeParams = buildLogTimeParams()
        const response = await store.dispatch('logs/fetchLogs', {
          page: logFileCurrentPage.value,
          limit: logFilePageSize.value,
          device_id: selectedDeviceForLogs.value.device_id,
          status_filter: 'all',
          ...timeParams
        })
        logFileList.value = response?.data?.logs || []
        logFileTotal.value = response?.data?.total ?? 0
      } catch (error) {
        console.error('加载日志文件列表失败:', error)
        ElMessage.error(t('dataAnalysis.fetchLogsFailed') || '获取日志列表失败')
      } finally {
        logFileLoading.value = false
      }
    }

    // 日志文件选择变化
    const handleLogSelectionChange = (selection) => {
      // 限制最多选择2个
      if (selection.length > 2) {
        ElMessage.warning(t('dataAnalysis.maxSelect2Logs') || '最多只能选择2个日志文件')
        // 保留前2个选择，取消后面的选择
        const keepSelection = selection.slice(0, 2)
        selectedLogFiles.value = keepSelection
        // 使用 nextTick 确保 DOM 更新后再设置表格选择状态
        setTimeout(() => {
          if (logFileTableRef.value) {
            // 清除所有选择
            logFileTableRef.value.clearSelection()
            // 重新选择前2个
            keepSelection.forEach(row => {
              logFileTableRef.value.toggleRowSelection(row, true)
            })
          }
        }, 0)
        return
      }
      selectedLogFiles.value = selection
    }

    // 检查日志是否可选
    const checkLogSelectable = (row) => {
      // 只有已解析完成的日志才能选择
      return row.status === 'parsed'
    }

    // 获取日志状态类型
    const getLogStatusType = (row) => {
      if (row.status === 'parsed') return 'success'
      if (row.status === 'parsing') return 'warning'
      if (row.status === 'parse_failed' || row.status === 'decrypt_failed' || row.status === 'file_error') return 'danger'
      return 'info'
    }

    // 获取日志状态文本
    const getLogStatusText = (row) => {
      const statusMap = {
        parsed: t('logs.statusText.parsed'),
        parsing: t('logs.statusText.parsing'),
        parse_failed: t('logs.statusText.parse_failed'),
        decrypt_failed: t('logs.statusText.decrypt_failed'),
        file_error: t('logs.statusText.file_error'),
        queue_failed: t('logs.statusText.failed'),
        upload_failed: t('logs.statusText.failed'),
        uploading: t('logs.statusText.uploading'),
        queued: t('logs.statusText.queued')
      }
      return statusMap[row.status] || row.status || '-'
    }

    // 时间筛选器相关方法
    const logQuickRangeOptions = computed(() => ([
      { value: 'all', label: t('logs.surgeriesFilters.quickAll') || '全部' },
      { value: '1d', label: t('logs.surgeriesFilters.quick1d') || '最近1天' },
      { value: '7d', label: t('logs.surgeriesFilters.quick7d') || '最近7天' },
      { value: '30d', label: t('logs.surgeriesFilters.quick30d') || '最近30天' },
      { value: 'custom', label: t('logs.surgeriesFilters.quickCustom') || '自定义' }
    ]))

    const logYearOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.yearSuffix') || '年'
      const yearsSource = Array.isArray(logAvailableYears.value) ? logAvailableYears.value : []
      const normalizedYears = yearsSource
        .map(year => {
          const num = Number(year)
          if (Number.isNaN(num)) return null
          return String(num).padStart(4, '0')
        })
        .filter(Boolean)
      const years = normalizedYears.length ? normalizedYears.sort((a, b) => Number(b) - Number(a)) : [String(currentYear)]
      return [
        { value: 'all', label: t('logs.surgeriesFilters.yearAll') || '全部' },
        ...years.map(year => ({
          value: year,
          label: `${year}${suffix}`
        }))
      ]
    })

    const logMonthOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.monthSuffix') || '月'
      if (logSelectedYear.value === 'all') {
        return [{ value: 'all', label: t('logs.surgeriesFilters.monthAll') || '全部' }]
      }
      const months = logAvailableMonths.value[logSelectedYear.value] || []
      const normalizedMonths = months
        .map(m => {
          const num = Number(m)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        })
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.monthAll') || '全部' },
        ...normalizedMonths.map(month => ({
          value: month,
          label: `${month}${suffix}`
        }))
      ]
    })

    const logDayOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.daySuffix') || '日'
      if (logSelectedYear.value === 'all' || logSelectedMonth.value === 'all') {
        return [{ value: 'all', label: t('logs.surgeriesFilters.dayAll') || '全部' }]
      }
      const key = `${logSelectedYear.value}-${logSelectedMonth.value}`
      const days = logAvailableDays.value[key] || []
      const normalizedDays = days
        .map(d => {
          const num = Number(d)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        })
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.dayAll') || '全部' },
        ...normalizedDays.map(day => ({
          value: day,
          label: `${day}${suffix}`
        }))
      ]
    })

    const handleLogQuickRangeChange = () => {
      if (logQuickRange.value !== 'custom') {
        logSelectedYear.value = 'all'
        logSelectedMonth.value = 'all'
        logSelectedDay.value = 'all'
      }
      logFileCurrentPage.value = 1
      loadLogFiles()
    }

    const handleLogYearChange = () => {
      logSelectedMonth.value = 'all'
      logSelectedDay.value = 'all'
      logFileCurrentPage.value = 1
      loadLogFiles()
    }

    const handleLogMonthChange = () => {
      logSelectedDay.value = 'all'
      logFileCurrentPage.value = 1
      loadLogFiles()
    }

    const handleLogDayChange = () => {
      logFileCurrentPage.value = 1
      loadLogFiles()
    }

    const handleLogFileSizeChange = (size) => {
      logFilePageSize.value = size
      logFileCurrentPage.value = 1
      loadLogFiles()
    }

    const handleLogFileCurrentChange = (page) => {
      logFileCurrentPage.value = page
      loadLogFiles()
    }

    // 加载时间筛选器选项
    const loadLogTimeFilters = async () => {
      if (!selectedDeviceForLogs.value?.device_id) return
      try {
        const resp = await api.logs.getTimeFilters({ device_id: selectedDeviceForLogs.value.device_id })
        const data = resp.data?.data || {}

        const normalizeYear = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(4, '0')
        }
        const normalizeMonth = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        }
        const normalizeDay = (value) => {
          if (value == null) return null
          const num = Number(value)
          if (Number.isNaN(num)) return null
          return String(num).padStart(2, '0')
        }

        const yearsArray = Array.isArray(data.years) ? data.years : []
        const normalizedYears = yearsArray
          .map(normalizeYear)
          .filter(Boolean)
        logAvailableYears.value = Array.from(new Set(normalizedYears))

        const monthsResult = {}
        if (data.monthsByYear && typeof data.monthsByYear === 'object') {
          Object.entries(data.monthsByYear).forEach(([year, list]) => {
            const normalizedYear = normalizeYear(year)
            if (!normalizedYear) return
            const months = Array.isArray(list) ? list : []
            const normalizedMonths = months
              .map(normalizeMonth)
              .filter(Boolean)
            if (normalizedMonths.length) {
              monthsResult[normalizedYear] = Array.from(new Set(normalizedMonths))
            }
          })
        }
        logAvailableMonths.value = monthsResult

        const daysResult = {}
        if (data.daysByYearMonth && typeof data.daysByYearMonth === 'object') {
          Object.entries(data.daysByYearMonth).forEach(([key, list]) => {
            const [yearPart, monthPart] = key.split('-')
            const normalizedYear = normalizeYear(yearPart)
            const normalizedMonth = normalizeMonth(monthPart)
            if (!normalizedYear || !normalizedMonth) return
            const normalizedDays = (Array.isArray(list) ? list : [])
              .map(normalizeDay)
              .filter(Boolean)
            if (normalizedDays.length) {
              daysResult[`${normalizedYear}-${normalizedMonth}`] = Array.from(new Set(normalizedDays))
            }
          })
        }
        logAvailableDays.value = daysResult
      } catch (error) {
        console.warn('loadLogTimeFilters error:', error)
        logAvailableYears.value = []
        logAvailableMonths.value = {}
        logAvailableDays.value = {}
      }
    }

    // 构建时间筛选参数
    const buildLogTimeParams = () => {
      const params = {}

      let startDate = null
      let endDate = null
      const now = new Date()

      if (logQuickRange.value === '1d') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        endDate = now
      } else if (logQuickRange.value === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        endDate = now
      } else if (logQuickRange.value === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        endDate = now
      }

      if (
        logQuickRange.value === 'custom' ||
        logSelectedYear.value !== 'all' ||
        logSelectedMonth.value !== 'all' ||
        logSelectedDay.value !== 'all'
      ) {
        const year =
          logSelectedYear.value === 'all'
            ? currentYear
            : Number(logSelectedYear.value)
        const month =
          logSelectedMonth.value === 'all'
            ? null
            : Number(logSelectedMonth.value)
        const day =
          logSelectedDay.value === 'all'
            ? null
            : Number(logSelectedDay.value)

        if (year && !Number.isNaN(year)) {
          const start = new Date(
            year,
            (month || 1) - 1,
            day || 1,
            0,
            0,
            0,
            0
          )
          let end
          if (day) {
            end = new Date(year, (month || 1) - 1, day, 23, 59, 59, 999)
          } else if (month) {
            end = new Date(year, month, 0, 23, 59, 59, 999)
          } else {
            end = new Date(year, 11, 31, 23, 59, 59, 999)
          }
          startDate = start
          endDate = end
        }
      }

      if (startDate && endDate) {
        const formatTimePrefix = (date) => {
          const y = date.getFullYear()
          const m = String(date.getMonth() + 1).padStart(2, '0')
          const d = String(date.getDate()).padStart(2, '0')
          const h = String(date.getHours()).padStart(2, '0')
          return `${y}${m}${d}${h}`
        }
        params.time_range_start = formatTimePrefix(startDate)
        params.time_range_end = formatTimePrefix(endDate)
      }

      return params
    }

    // 加载日志数据
    const handleLoadLogData = async () => {
      if (selectedLogFiles.value.length === 0) {
        ElMessage.warning(t('dataAnalysis.selectLogFirst') || '请先选择日志文件')
        return
      }

      try {
        loading.value = true
        
        const logIds = selectedLogFiles.value.map((l) => l.id).join(',')
        let anchor = cursorAbsMs.value ?? timeBase.value
        
        // 如果没有锚点，先调用API获取日志的实际时间范围
        if (!anchor) {
          try {
            // 调用API获取日志的时间范围（不指定时间范围，获取所有日志的时间范围）
            const resp = await api.logs.getBatchEntries({
              log_ids: logIds,
              page: 1,
              limit: 1
            })
            
            // 使用API返回的时间范围
            const minTs = resp.data?.minTimestamp
            const maxTs = resp.data?.maxTimestamp
            if (minTs && maxTs) {
              const minDate = new Date(minTs)
              const maxDate = new Date(maxTs)
              if (!Number.isNaN(minDate.getTime()) && !Number.isNaN(maxDate.getTime())) {
                // 使用时间范围的中点作为锚点
                anchor = (minDate.getTime() + maxDate.getTime()) / 2
              }
            } else if (minTs) {
              anchor = new Date(minTs).getTime()
            } else if (maxTs) {
              anchor = new Date(maxTs).getTime()
            }
          } catch (e) {
            console.warn('获取日志时间范围失败，使用日志文件时间:', e)
          }
        }
        
        // 如果还是没有锚点，使用日志文件时间或当前时间
        if (!anchor) {
          const firstLog = selectedLogFiles.value[0]
          const logTime = firstLog?.file_time || firstLog?.upload_time
          if (logTime) {
            const logDate = new Date(logTime)
            if (!Number.isNaN(logDate.getTime())) {
              anchor = logDate.getTime()
            }
          }
          if (!anchor) {
            anchor = Date.now()
          }
        }
        
        // 获取整个日志文件的总时间范围（用于显示）
        try {
          const resp = await api.logs.getBatchEntries({
            log_ids: logIds,
            page: 1,
            limit: 1
          })
          const minTs = resp.data?.minTimestamp
          const maxTs = resp.data?.maxTimestamp
          if (minTs && maxTs) {
            const minDate = new Date(minTs)
            const maxDate = new Date(maxTs)
            if (!Number.isNaN(minDate.getTime()) && !Number.isNaN(maxDate.getTime())) {
              logFileTotalTimeRange.value = {
                min: minDate.getTime(),
                max: maxDate.getTime()
              }
            }
          }
        } catch (e) {
          console.warn('获取日志总时间范围失败:', e)
        }
        
        // 初始化：从最早的时间开始加载窗口（定位到最早的日志条目）
        const earliestTime = logFileTotalTimeRange.value.min ?? anchor
        const half = Math.floor(logWindowSizeMs / 2)
        await replaceLogWindow(earliestTime, earliestTime + logWindowSizeMs)

        // 探测：当前日志时间段是否存在运行数据文件（仅用于空态提示）
        try {
          if (!selectedMotionFiles.value.length) {
            const deviceId = String(selectedLogFiles.value?.[0]?.device_id || '').trim()
            const rangeStart = logFileTotalTimeRange.value.min ?? logWindowStartMs.value
            const rangeEnd = logFileTotalTimeRange.value.max ?? logWindowEndMs.value
            if (deviceId && Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
              const hasMotionFiles = await probeMotionFilesByTimeRange(deviceId, rangeStart, rangeEnd)
              if (!hasMotionFiles) {
                motionMatchNotFound.value = true
                motionMatchNotFoundRangeMs.value = { startMs: rangeStart, endMs: rangeEnd }
              } else {
                motionMatchNotFound.value = false
                motionMatchNotFoundRangeMs.value = { startMs: null, endMs: null }
              }
            }
          }
        } catch (_) {}

        // 检查数据是否成功加载
        const hasData = logEntries.value && logEntries.value.length > 0
        
        // 滚动到顶部（定位到最早的日志条目）
        if (hasData && logVirtualTableRef.value?.scrollToTop) {
          await nextTick()
          logVirtualTableRef.value.scrollToTop()
        }
        
        // 关闭弹窗
        showSelectionDialog.value = false

        // 自动匹配运行数据（需要用户确认；不影响手动选择）
        if (!suppressAutoMotionFromLog.value && !selectedMotionFiles.value.length) {
          const deviceId = String(selectedLogFiles.value?.[0]?.device_id || '').trim()
          const rangeStart = logFileTotalTimeRange.value.min ?? earliestTime
          const rangeEnd = logFileTotalTimeRange.value.max ?? (earliestTime + logWindowSizeMs)
          await autoPickMotionByRange(deviceId, rangeStart, rangeEnd)
        }

        await syncTimelineRangeByLoadedData()
        
        // 根据数据加载情况显示消息
        if (hasData) {
          ElMessage.success(t('dataAnalysis.loadSuccess') || '数据加载成功')
        } else {
          ElMessage.warning(t('dataAnalysis.noLogEntries') || '该时间范围内没有日志条目')
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        // 即使出错，如果已经有数据，也关闭弹窗
        if (logEntries.value && logEntries.value.length > 0) {
          showSelectionDialog.value = false
          ElMessage.warning(t('dataAnalysis.loadPartialSuccess') || '数据已部分加载，但可能不完整')
        } else {
          ElMessage.error(t('dataAnalysis.loadFailed') || '加载数据失败')
        }
      } finally {
        loading.value = false
      }
    }

    const suppressVideoTimeSync = ref(false)

    const syncVideoToCursorAbs = (absMs) => {
      if (!videoPlayer.value || !videoSource.value) return
      const durationMs = (videoPlayer.value.duration || 0) * 1000
      const tvideos = 0
      const tvideoe = durationMs

      if (videoAnchorLogMs.value != null && videoAnchorVideoMs.value != null) {
        const tb = timeBase.value
        const mt = maxTime.value
        if (tb == null || !Number.isFinite(mt) || mt <= 0) return
        const tlogstart = tb
        const tlogend = tb + mt
        const tlogn = videoAnchorLogMs.value
        const tvideon = videoAnchorVideoMs.value
        const tDeltaBase = tlogn - tlogstart
        const tnbase = tvideon - tDeltaBase
        const clampedAbs = Math.max(tlogstart, Math.min(tlogend, absMs))
        const timelinePos = clampedAbs - tlogstart
        let videoTimeMs
        if (tnbase > 0) {
          videoTimeMs = timelinePos + tnbase
        } else {
          if (timelinePos < -tnbase) videoTimeMs = tvideos
          else videoTimeMs = timelinePos + tnbase
        }
        videoTimeMs = Math.max(tvideos, Math.min(tvideoe, videoTimeMs))
        const tSec = videoTimeMs / 1000
        if (!Number.isFinite(tSec)) return
        suppressVideoTimeSync.value = true
        videoPlayer.value.currentTime = tSec
        setTimeout(() => { suppressVideoTimeSync.value = false }, 0)
        return
      }

      if (videoStartTime.value == null) {
        if (timeBase.value != null) videoStartTime.value = timeBase.value
        else return
      }
      const relMs = absMs - Number(videoStartTime.value)
      const tSec = relMs / 1000
      if (Number.isNaN(tSec) || tSec < 0 || tSec > (videoPlayer.value.duration || 0)) return
      suppressVideoTimeSync.value = true
      videoPlayer.value.currentTime = tSec
      setTimeout(() => { suppressVideoTimeSync.value = false }, 0)
    }

    const binarySearchNearestIndex = (sortedTs, targetTs) => {
      let lo = 0
      let hi = sortedTs.length - 1
      let best = -1
      let bestDiff = Infinity
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const v = sortedTs[mid]
        if (!Number.isFinite(v)) {
          // 跳过无效点：向两侧收缩
          hi = mid - 1
          continue
        }
        const diff = Math.abs(v - targetTs)
        if (diff < bestDiff) {
          bestDiff = diff
          best = mid
        }
        if (v === targetTs) return mid
        if (v < targetTs) lo = mid + 1
        else hi = mid - 1
      }
      return best
    }

    const scrollToLogEntryAbs = (absMs) => {
      const tsArr = filteredLogEntryTs.value || []
      if (!tsArr.length) return
      const idx = binarySearchNearestIndex(tsArr, absMs)
      if (idx < 0) return
      const prev = lastAutoScrollIndex.value
      lastAutoScrollIndex.value = idx
      // 仅当目标行变化时滚动，减少抖动；始终更新 lastAutoScrollIndex 以保证高亮正确
      if (logVirtualTableRef.value?.scrollTo && idx !== prev) {
        logVirtualTableRef.value.scrollTo(Math.max(0, idx - 3))
      }
    }

    const throttledScrollToLogEntryAbs = throttle(scrollToLogEntryAbs, 80)
    const throttledEnsureLogWindowContains = throttle((absMs) => {
      if (!logWindowLoading.value) ensureLogWindowContains(absMs)
    }, 200)

    const setCursorByAbsMs = (absMs, source = '') => {
      if (!Number.isFinite(absMs)) return
      if (timeBase.value == null) {
        timeBase.value = absMs
        cursorMs.value = 0
      } else {
        const rel = absMs - Number(timeBase.value)
        cursorMs.value = Math.max(0, Math.min(Number.isFinite(maxTime.value) && maxTime.value > 0 ? maxTime.value : rel, rel))
      }

      if (source !== 'video') {
        syncVideoToCursorAbs(absMs)
      }
      // 避免视频 timeupdate 过于频繁触发窗口重拉
      throttledEnsureLogWindowContains(absMs)
      throttledScrollToLogEntryAbs(absMs)
    }

    const throttledSyncVideoToCursorAbsForTimeline = throttle((absMs) => {
      syncVideoToCursorAbs(absMs)
    }, 33)

    const onTimelineChange = (value) => {
      cursorMs.value = value
      const abs = cursorAbsMs.value
      if (abs != null) {
        throttledSyncVideoToCursorAbsForTimeline(abs)
        throttledScrollToLogEntryAbs(abs)
      }
    }

    const onVideoLoaded = () => {
      if (!videoPlayer.value) return
      // 刚加载完成时强制进度条在 0，避免沿用旧 src 的 currentTime 或浏览器非零初始值
      videoPlayer.value.currentTime = 0
      const durationMs = Math.floor((videoPlayer.value.duration || 0) * 1000)
      if (durationMs > 0) {
        // 时间轴由日志/运行数据决定：已有 timeBase+maxTime 时不因视频缩短或拉长时间轴；仅在没有数据时用视频时长作为 maxTime
        if (timeBase.value == null || !Number.isFinite(maxTime.value) || maxTime.value <= 0) {
          maxTime.value = durationMs
        }
        cursorMs.value = Math.min(cursorMs.value, maxTime.value)
      }
      videoPlayer.value.playbackRate = playbackSpeed.value
    }

    const onVideoTimeUpdate = () => {
      if (!videoPlayer.value || !videoSource.value) return
      if (suppressVideoTimeSync.value) return
      const videoTimeMs = Math.floor(videoPlayer.value.currentTime * 1000)
      if (Number.isNaN(videoTimeMs)) return
      const durationMs = (videoPlayer.value.duration || 0) * 1000
      const tvideos = 0
      const tvideoe = durationMs

      if (videoAnchorLogMs.value != null && videoAnchorVideoMs.value != null) {
        const tb = timeBase.value
        const mt = maxTime.value
        if (tb == null || !Number.isFinite(mt) || mt <= 0) return
        const tlogstart = tb
        const tlogend = tb + mt
        const tlogn = videoAnchorLogMs.value
        const tvideon = videoAnchorVideoMs.value
        const tDeltaBase = tlogn - tlogstart
        const tnbase = tvideon - tDeltaBase
        let cursorAbs
        if (tnbase > 0) {
          if (videoTimeMs < tnbase) return
          cursorAbs = tlogstart + (videoTimeMs - tnbase)
        } else {
          if (videoTimeMs + tnbase < 0) return
          cursorAbs = tlogstart + (videoTimeMs + tnbase)
        }
        cursorAbs = Math.max(tlogstart, Math.min(tlogend, cursorAbs))
        if (!Number.isFinite(cursorAbs)) return
        setCursorByAbsMs(cursorAbs, 'video')
        return
      }

      if (videoStartTime.value != null && timeBase.value != null) {
        const abs = Number(videoStartTime.value) + videoTimeMs
        const { first, last } = logDataRangeAbsMs.value || {}
        if (Number.isFinite(last) && abs > last) { setCursorByAbsMs(last, 'video'); return }
        if (Number.isFinite(first) && abs < first) { setCursorByAbsMs(first, 'video'); return }
        setCursorByAbsMs(abs, 'video')
        return
      }
      cursorMs.value = Math.max(0, Math.min(maxTime.value, videoTimeMs))
      if (cursorAbsMs.value != null) scrollToLogEntryAbs(cursorAbsMs.value)
    }

    const onMotionRangeChange = (range) => {
      // 图表范围变化时的处理
    }

    const motionThemeOptions = [
      { value: 'left_hand', label: '左手' },
      { value: 'right_hand', label: '右手' },
      { value: 'left_tool_arm', label: '左手控制的工具臂' },
      { value: 'right_tool_arm', label: '右手控制的工具臂' },
      { value: 'camera_arm', label: '持镜臂' },
      { value: 'left_adjust_arm', label: '左手控制的调整臂' },
      { value: 'right_adjust_arm', label: '右手控制的调整臂' }
    ]

    const motionCategoryOptions = [
      { value: 'joint_position', label: '关节位置' },
      { value: 'joint_velocity', label: '关节速度' },
      { value: 'cart_position', label: '笛卡尔位置' },
      { value: 'pose', label: '姿态/位姿' },
      { value: 'cart_velocity', label: '笛卡尔速度' },
      { value: 'force_torque', label: '力/力矩' }
    ]

    const toEpochMs = (tsStr) => {
      try {
        const str = String(tsStr || '0').trim()
        if (!str) return 0

        // 检查是否是 YYYYMMDDHHmmssSSS 格式（17位数字）
        if (/^\d{17}$/.test(str)) {
          const year = parseInt(str.substring(0, 4), 10)
          const month = parseInt(str.substring(4, 6), 10) - 1 // 月份从0开始
          const day = parseInt(str.substring(6, 8), 10)
          const hours = parseInt(str.substring(8, 10), 10)
          const minutes = parseInt(str.substring(10, 12), 10)
          const seconds = parseInt(str.substring(12, 14), 10)
          const milliseconds = parseInt(str.substring(14, 17), 10)
          
          const date = new Date(year, month, day, hours, minutes, seconds, milliseconds)
          const ms = date.getTime()
          if (Number.isFinite(ms) && ms > 0) {
            return ms
          }
        }

        // 尝试作为 BigInt 处理（纳秒/微秒/毫秒）
        const bi = BigInt(str)
        // 经验阈值：毫秒(1e12~1e13), 微秒(~1e15), 纳秒(~1e18)
        if (bi > 100000000000000000n) return Number(bi / 1000000n) // ns -> ms
        if (bi > 100000000000000n) return Number(bi / 1000n) // us -> ms
        return Number(bi) // ms
      } catch {
        return Number(tsStr) || 0
      }
    }

    const buildMotionFieldMeta = (columns) => {
      const groupKeyToIndices = new Map()

      const normalizeTheme = (name) => {
        const s = String(name || '')
        if (s.startsWith('左手控制的工具臂')) return 'left_tool_arm'
        if (s.startsWith('右手控制的工具臂')) return 'right_tool_arm'
        if (s.startsWith('左手控制的调整臂')) return 'left_adjust_arm'
        if (s.startsWith('右手控制的调整臂')) return 'right_adjust_arm'
        if (s.startsWith('持镜')) return 'camera_arm'
        if (s.startsWith('左手')) return 'left_hand'
        if (s.startsWith('右手')) return 'right_hand'
        return 'other'
      }

      const normalizeCategory = (name) => {
        const s = String(name || '')
        if (s.includes('关节') && s.includes('速度')) return 'joint_velocity'
        if (s.includes('关节') && s.includes('位置')) return 'joint_position'
        if (s.includes('笛卡尔') && s.includes('位置') && !s.includes('速度')) return 'cart_position'
        if (s.includes('姿态') || s.includes('位姿')) return s.includes('速度') ? 'cart_velocity' : 'pose'
        if (s.includes('柔顺力') || s.includes('重力补偿') || s.includes('力矩') || s.includes('力')) return 'force_torque'
        return 'other'
      }

      const baseGroupKey = (name) => String(name || '').replace(/数据/g, '').trim()

      const metas = (columns || [])
        .filter((c) => c && c.index && c.name && String(c.index).startsWith('real_data_'))
        .map((c) => {
          const theme = normalizeTheme(c.name)
          const category = normalizeCategory(c.name)
          const key = `${theme}__${category}__${baseGroupKey(c.name)}`
          if (!groupKeyToIndices.has(key)) groupKeyToIndices.set(key, [])
          groupKeyToIndices.get(key).push(c.index)
          return {
            index: c.index,
            name: c.name,
            theme,
            category,
            groupKey: key
          }
        })

      const dimLabelForGroup = (groupKey, index) => {
        const indices = groupKeyToIndices.get(groupKey) || []
        const pos = indices.indexOf(index)
        const s = String(groupKey)
        if (s.includes('笛卡尔位置') && indices.length === 3) return ['X', 'Y', 'Z'][pos] || `D${pos + 1}`
        if (s.includes('姿态') && indices.length === 4) return ['qx', 'qy', 'qz', 'qw'][pos] || `D${pos + 1}`
        if ((s.includes('位姿') || s.includes('姿态')) && indices.length === 7) return ['X', 'Y', 'Z', 'qx', 'qy', 'qz', 'qw'][pos] || `D${pos + 1}`
        if (s.includes('速度') && indices.length === 6) return ['vx', 'vy', 'vz', 'wx', 'wy', 'wz'][pos] || `D${pos + 1}`
        if (indices.length === 2) return ['D1', 'D2'][pos] || `D${pos + 1}`
        return indices.length > 1 ? `D${pos + 1}` : ''
      }

      return metas.map((m) => {
        const dim = dimLabelForGroup(m.groupKey, m.index)
        const label = dim ? `${m.name} · ${dim}` : m.name
        return { ...m, label }
      })
    }

    const motionFieldMeta = computed(() => buildMotionFieldMeta(motionFormatColumns.value))

    // 兼容旧代码（保留用于热力图等）
    const allMotionFieldsForPick = computed(() => motionFieldMeta.value.filter((m) =>
      m.theme === motionPickTheme.value && m.category === motionPickCategory.value
    ))

    const filteredMotionFields = computed(() => {
      const q = String(motionFieldFilter.value || '').trim().toLowerCase()
      if (!q) return allMotionFieldsForPick.value
      return allMotionFieldsForPick.value.filter((f) => String(f.label || '').toLowerCase().includes(q))
    })

    // 新的分类数据结构相关计算属性
    const motionClassifiedSubjects = computed(() => {
      const data = motionClassifiedData.value || {}
      return Object.keys(data).sort()
    })

    const motionClassifiedCategories = computed(() => {
      if (!motionPickSubject.value) return []
      const data = motionClassifiedData.value || {}
      const subjectData = data[motionPickSubject.value] || {}
      return Object.keys(subjectData).sort()
    })

    const filteredMotionVariables = computed(() => {
      if (!motionPickSubject.value || !motionPickCategory.value) return []
      const data = motionClassifiedData.value || {}
      const subjectData = data[motionPickSubject.value] || {}
      const variables = subjectData[motionPickCategory.value] || []
      const q = String(motionFieldFilter.value || '').trim().toLowerCase()
      if (!q) return variables
      return variables.filter((v) => {
        const name = String(v?.name || '').toLowerCase()
        const index = String(v?.index || '').toLowerCase()
        return name.includes(q) || index.includes(q)
      })
    })

    // 变量列表（不使用搜索过滤，用于简化后的变量选择页面）
    const motionClassifiedVariables = computed(() => {
      if (!motionPickSubject.value || !motionPickCategory.value) return []
      const data = motionClassifiedData.value || {}
      const subjectData = data[motionPickSubject.value] || {}
      return subjectData[motionPickCategory.value] || []
    })

    // 步骤标题：显示选择的内容
    const step1Title = computed(() => {
      if (motionPickSubject.value) {
        return `选择对象：${motionPickSubject.value}`
      }
      return '选择对象'
    })

    const step2Title = computed(() => {
      if (motionPickCategory.value) {
        return `选择数据类型：${motionPickCategory.value}`
      }
      return '选择数据类型'
    })

    const step3Title = computed(() => {
      if (motionPickFieldIndexes.value.length > 0) {
        const selectedVars = motionClassifiedVariables.value
          .filter(v => motionPickFieldIndexes.value.includes(v.index))
          .map(v => v.name)
        if (selectedVars.length > 0) {
          const displayText = selectedVars.length > 2 
            ? `${selectedVars.slice(0, 2).join('、')}等${selectedVars.length}个`
            : selectedVars.join('、')
          return `选择变量：${displayText}`
        }
      }
      return '选择变量'
    })

    const getSubjectCategoryCount = (subject) => {
      const data = motionClassifiedData.value || {}
      const subjectData = data[subject] || {}
      return Object.keys(subjectData).length
    }

    const getCategoryVariableCount = (subject, category) => {
      const data = motionClassifiedData.value || {}
      const subjectData = data[subject] || {}
      const variables = subjectData[category] || []
      return variables.length
    }

    const canGoNextStep = computed(() => {
      if (motionConfigStep.value === 0) return !!motionPickSubject.value
      if (motionConfigStep.value === 1) return !!motionPickCategory.value
      return false
    })

    const handleMotionConfigNext = () => {
      if (motionConfigStep.value === 0 && motionPickSubject.value) {
        motionConfigStep.value = 1
        motionPickCategory.value = '' // 切换主体时清空数据类型
        motionPickFieldIndexes.value = []
      } else if (motionConfigStep.value === 1 && motionPickCategory.value) {
        motionConfigStep.value = 2
        motionPickFieldIndexes.value = [] // 切换数据类型时清空变量选择
        motionFieldFilter.value = ''
      }
    }


    const openMotionSlotConfig = (slotIdx) => {
      if (!motionRawRows.value.length) {
        ElMessage.info(t('dataAnalysis.addMotionData') || '请先添加运行数据')
        openMotionSelectionDialog()
        return
      }
      activeMotionSlotIndex.value = slotIdx
      // 重置配置状态
      motionConfigStep.value = 0
      motionPickSubject.value = ''
      motionPickCategory.value = ''
      motionPickFieldIndexes.value = []
      motionFieldFilter.value = ''
      // 如果该图位已有配置，尝试回填
      const slot = motionSlots.value[slotIdx]
      if (slot?.series?.length > 0 && slot.title) {
        // 尝试从标题解析主体和数据类型（可选，用于快速回填）
        // 这里先不实现，让用户重新选择更清晰
      }
      showMotionConfigDrawer.value = true
    }

    const onMotionConfigDialogClose = () => {
      motionConfigStep.value = 0
      motionPickSubject.value = ''
      motionPickCategory.value = ''
      motionPickFieldIndexes.value = []
      motionFieldFilter.value = ''
    }

    const clearMotionSlot = (slotIdx) => {
      motionSlots.value[slotIdx] = { ...motionSlots.value[slotIdx], title: '', series: [] }
    }

    // 内部清空运行数据的逻辑（避免循环调用）
    const clearMotionData = () => {
      selectedMotionFiles.value = []
      selectedMotionFile.value = null
      motionRawRows.value = []
      motionSlots.value = motionSlots.value.map((s) => ({ ...s, title: '', series: [] }))
      // 清空运行数据后：清理"运行数据 -> 日志缺失"的提示
      logMatchNotFound.value = false
      logMatchNotFoundRangeMs.value = { startMs: null, endMs: null }
    }

    // 内部清空日志数据的逻辑（避免循环调用）
    const clearLogsData = () => {
      logEntries.value = []
      selectedLogFiles.value = []
      logFilter.value = ''
      logWindowStartMs.value = null
      logWindowEndMs.value = null
      logAllowedStartMs.value = null
      logAllowedEndMs.value = null
      logFileTotalTimeRange.value = { min: null, max: null }
      // 清空日志后：清理“日志 -> 运行数据缺失”的提示
      motionMatchNotFound.value = false
      motionMatchNotFoundRangeMs.value = { startMs: null, endMs: null }
    }

    const clearMotion = () => {
      resetVideoAnchor()
      clearMotionData()
      // 联动清空：同时清空日志数据（保持数据一致性）
      clearLogsData()
      resetTimeline()
      // 清空对话框内的设备选择状态
      selectedDeviceForMotion.value = null
      selectedDeviceForLogs.value = null
      // 清除设备表格的当前行高亮
      nextTick(() => {
        if (motionDeviceTableRef.value) {
          motionDeviceTableRef.value.setCurrentRow(null)
        }
        if (logDeviceTableRef.value) {
          logDeviceTableRef.value.setCurrentRow(null)
        }
      })
    }

    // 从 motionClassifiedData 中根据 index 查找对应的 name
    const getNameFromClassifiedData = (index) => {
      const data = motionClassifiedData.value || {}
      const indexStr = String(index || '')
      
      // 遍历所有 subject 和 category 查找匹配的 index
      for (const subjectKey in data) {
        const subjectData = data[subjectKey]
        if (!subjectData || typeof subjectData !== 'object') continue
        
        for (const categoryKey in subjectData) {
          const variables = subjectData[categoryKey]
          if (!Array.isArray(variables)) continue
          
          const variable = variables.find(v => String(v?.index || '') === indexStr)
          if (variable && variable.name) {
            return variable.name
          }
        }
      }
      
      // 如果没找到，尝试从 motionFieldMeta 获取（兼容旧数据）
      const metaMap = new Map(motionFieldMeta.value.map((m) => [m.index, m]))
      const m = metaMap.get(index)
      return m?.label || m?.name || indexStr
    }

    const buildSeriesForFieldIndexes = (indexes) => {
      const rows = motionRawRows.value || []
      const series = []
      for (const idx of indexes) {
        const name = getNameFromClassifiedData(idx)
        const points = []
        for (const r of rows) {
          const x = toEpochMs(r.ulint_data)
          const y = Number(r[idx])
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue
          points.push([x, y])
        }
        series.push({ name: name, data: points })
      }
      return series
    }

    const applyMotionSlotConfig = async () => {
      const slotIdx = activeMotionSlotIndex.value
      if (!motionPickSubject.value || !motionPickCategory.value || !motionPickFieldIndexes.value.length) {
        ElMessage.warning(t('dataAnalysis.selectComplete') || '请完成所有步骤并选择至少一个变量')
        return
      }
      try {
        motionConfigLoading.value = true
        await nextTick()
        const varCount = motionPickFieldIndexes.value.length
        const title = `${motionPickSubject.value} / ${motionPickCategory.value}${varCount > 1 ? ` (${varCount}个变量)` : ''}`
        const pickedIndexes = [...motionPickFieldIndexes.value]

        // 两段式：先预览出图，再后台替换成满量数据
        const res = await fetchMotionSeriesInRangeTwoStage()
        const previewSeries = buildSeriesForFieldIndexes(pickedIndexes)
        motionSlots.value[slotIdx] = { ...motionSlots.value[slotIdx], title, series: previewSeries }
        showMotionConfigDrawer.value = false
        ElMessage.success(t('dataAnalysis.configSuccess') || '配置成功')

        // 后台拉满量：不阻塞弹窗关闭与 loading 结束
        res?.fullPromise?.then((fullRows) => {
          if (!fullRows || !Array.isArray(fullRows) || !fullRows.length) return
          const curSlot = motionSlots.value[slotIdx]
          if (!curSlot || curSlot.title !== title) return
          const series = buildSeriesForFieldIndexes(pickedIndexes)
          motionSlots.value[slotIdx] = { ...curSlot, series }
        })
      } catch (e) {
        console.warn('配置曲线图失败:', e)
        ElMessage.error(t('dataAnalysis.loadFailed') || '加载数据失败')
      } finally {
        motionConfigLoading.value = false
      }
    }

    const isEntryHighlighted = (entry, index) => {
      // 只高亮一条：当前时间轴对应的最近一条日志（scrollToLogEntryAbs 定位的那一行）
      return index != null && index === lastAutoScrollIndex.value
    }

    const onLogEntryClick = (entry) => {
      if (!entry?.timestamp) return
      const entryTime = new Date(entry.timestamp).getTime()
      if (!Number.isFinite(entryTime)) return
      setCursorByAbsMs(entryTime, 'log')
    }

    const onLogRowClick = (row) => {
      onLogEntryClick(row)
    }

    const logRowClassName = ({ row, index }) => {
      return isEntryHighlighted(row, index) ? 'log-row-highlight' : ''
    }

    const onLogVirtualScroll = (evt) => {
      const el = evt?.target
      if (!el) return
      if (el.scrollTop === 0) {
        if (logWindowDirectionLock.value) return
        // 已经到最早允许范围时不再向前翻
        if (logAllowedStartMs.value != null && logWindowStartMs.value != null && logWindowStartMs.value <= logAllowedStartMs.value) {
          return
        }
        logWindowDirectionLock.value = 'prev'
        // 如果窗口未初始化，使用当前时间创建一个窗口
        if (logWindowStartMs.value == null || logWindowEndMs.value == null) {
          const anchor = cursorAbsMs.value || Date.now()
          const half = Math.floor(logWindowSizeMs / 2)
          replaceLogWindow(anchor - half - logWindowStepMs, anchor + half - logWindowStepMs)
        } else {
          // 窗口已初始化，向前移动一个步长
          replaceLogWindow(logWindowStartMs.value - logWindowStepMs, logWindowEndMs.value - logWindowStepMs)
        }
      }
    }

    const onLogVirtualLoadMore = () => {
      if (logWindowDirectionLock.value) return
      // 已经到最晚允许范围时不再向后翻
      if (logAllowedEndMs.value != null && logWindowEndMs.value != null && logWindowEndMs.value >= logAllowedEndMs.value) {
        return
      }
      logWindowDirectionLock.value = 'next'
      // 如果窗口未初始化，使用当前时间创建一个窗口
      if (logWindowStartMs.value == null || logWindowEndMs.value == null) {
        const anchor = cursorAbsMs.value || Date.now()
        const half = Math.floor(logWindowSizeMs / 2)
        replaceLogWindow(anchor - half + logWindowStepMs, anchor + half + logWindowStepMs)
      } else {
        // 窗口已初始化，向后移动一个步长
        replaceLogWindow(logWindowStartMs.value + logWindowStepMs, logWindowEndMs.value + logWindowStepMs)
      }
    }

    const onMotionCursorChange = (absMs) => {
      setCursorByAbsMs(absMs, 'motion')
    }

    const scrollToLogEntry = (timeMs) => {
      // 兼容旧调用：timeMs 为相对时间（cursorMs）
      const abs = timeBase.value != null ? (Number(timeBase.value) + Number(timeMs || 0)) : null
      if (abs != null) scrollToLogEntryAbs(abs)
    }

    const setPlaybackSpeed = (speed) => {
      playbackSpeed.value = speed
      if (videoPlayer.value) {
        videoPlayer.value.playbackRate = speed
      }
    }

    // 加载运行数据
    const loadMotionData = async (deviceId, startTime, endTime) => {
      try {
        // 查找对应时间范围的运行数据文件
        const motionFilesResponse = await api.motionData.listFiles({
          device_id: deviceId,
          file_time_start: new Date(startTime).toISOString(),
          file_time_end: new Date(endTime).toISOString(),
          status_filter: 'completed',
          page: 1,
          limit: 10
        })

        const motionFiles = motionFilesResponse.data?.data || []
        if (motionFiles.length === 0) {
          console.warn('未找到对应时间范围的运行数据文件')
          selectedMotionFile.value = null
          selectedMotionFiles.value = []
          motionRawRows.value = []
          motionMatchNotFound.value = true
          motionMatchNotFoundRangeMs.value = { startMs: startTime, endMs: endTime }
          return
        }
        motionMatchNotFound.value = false
        motionMatchNotFoundRangeMs.value = { startMs: null, endMs: null }

        // 选一个最接近 startTime 的文件（file_time 越接近越好）
        const targetMs = Number(startTime) || 0
        const best = motionFiles
          .filter((f) => f && f.file_time)
          .map((f) => ({ f, diff: Math.abs(new Date(f.file_time).getTime() - targetMs) }))
          .sort((a, b) => a.diff - b.diff)[0]?.f || motionFiles[0]

        selectedMotionFile.value = best
        selectedMotionFiles.value = best ? [best] : []

        let rows = []
        try {
          const seriesResp = await api.motionData.getSeries(best.id, {
            start_ms: Math.floor(startTime),
            end_ms: Math.ceil(endTime),
            max_points: MOTION_SERIES_MAX_POINTS
          })
          rows = seriesResp.data?.rows || []
        } catch (seriesErr) {
          const previewResp = await api.motionData.preview(best.id, { offset: 0, limit: 5000 })
          rows = previewResp.data?.rows || []
        }
        rows.sort((a, b) => toEpochMs(a?.ulint_data) - toEpochMs(b?.ulint_data))
        motionRawRows.value = rows

        // 切换文件后默认清空图位，避免错读
        motionSlots.value = motionSlots.value.map((s) => ({ ...s, title: '', series: [] }))
        await syncTimelineRangeByLoadedData()
      } catch (error) {
        console.error('加载运行数据失败:', error)
        // 运行数据加载失败不影响日志数据显示
        selectedMotionFile.value = null
        selectedMotionFiles.value = []
        motionRawRows.value = []
        motionMatchNotFound.value = true
        motionMatchNotFoundRangeMs.value = { startMs: startTime, endMs: endTime }
      }
    }

    const loadMotionFormat = async () => {
      try {
        const resp = await api.motionData.getConfig()
        motionFormatColumns.value = resp.data?.columns || []
      } catch (e) {
        console.error('加载 motion format 失败:', e)
      }
    }

    const loadMotionFormatClassified = async () => {
      try {
        const resp = await api.motionData.getConfigClassified()
        const data = resp.data?.data || resp.data || {}
        if (Object.keys(data).length === 0) {
          console.warn('motion format classified 数据为空，将使用空配置')
        }
        motionClassifiedData.value = data
      } catch (e) {
        console.error('加载 motion format classified 失败:', e)
        const errorMsg = e?.response?.data?.message || e?.message || '未知错误'
        const status = e?.response?.status
        console.error('错误状态码:', status)
        console.error('错误详情:', e?.response?.data || errorMsg)
        
        // 如果是权限问题，给出更明确的提示
        if (status === 403) {
          ElMessage.warning(t('dataAnalysis.noPermission') || '无权限访问分类配置')
        } else if (status === 404) {
          ElMessage.warning(t('dataAnalysis.classifiedNotFound') || '分类配置文件不存在')
        } else {
          ElMessage.warning(t('dataAnalysis.loadClassifiedFailed') || `加载分类配置失败: ${errorMsg}`)
        }
        motionClassifiedData.value = {}
      }
    }

    // 加载设备分组数据（使用和 Logs.vue 相同的接口）
    const loadDevices = async (options = {}) => {
      // 兼容旧代码，调用新的 loadDeviceGroups
      await loadDeviceGroups()
    }

    // 格式化树节点时间显示
    const formatTreeNodeTime = (timeStr) => {
      if (!timeStr) return ''
      try {
        const date = new Date(timeStr)
        return date.toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return ''
      }
    }

    // 从 query 参数预填数据
    const initFromQuery = () => {
      const query = route.query
      if (query.logId) {
        selectionForm.value.logId = query.logId
        if (query.deviceId) {
          selectionForm.value.deviceId = query.deviceId
          onDeviceChange().then(() => {
            // 设备日志加载完成后，自动加载数据
            if (query.logId) {
              onLogChange().then(() => handleLoadData())
            }
          })
        }
      }
    }

    onMounted(() => {
      loadDeviceGroups()
      loadMotionFormat()
      loadMotionFormatClassified()
      initFromQuery()
    })

    onBeforeUnmount(() => {
      if (videoObjectUrl.value) {
        URL.revokeObjectURL(videoObjectUrl.value)
        videoObjectUrl.value = null
      }
    })

    return {
      showSelectionDialog,
      loading,
      hasData,
      hasLogsData,
      hasMotionData,
      canAddMotion,
      canAddLog,
      motionMatchNotFound,
      motionMatchNotFoundRangeMs,
      logMatchNotFound,
      logMatchNotFoundRangeMs,
      videoPlayer,
      videoFileInput,
      logsContainer,
      logVirtualTableRef,
      selectionForm,
      devices,
      availableLogs,
      logEntries,
      motionRawRows,
      selectedMotionFile,
      selectedMotionFiles,
      motionDialogSelectedFiles,
      motionSelectedLabel,
      motionSlots,
      showMotionConfigDrawer,
      activeMotionSlotIndex,
      motionConfigStep,
      motionPickSubject,
      motionPickCategory,
      motionPickFieldIndexes,
      motionFieldFilter,
      motionClassifiedData,
      motionClassifiedSubjects,
      motionClassifiedCategories,
      filteredMotionVariables,
      motionClassifiedVariables,
      getSubjectCategoryCount,
      getCategoryVariableCount,
      canGoNextStep,
      step1Title,
      step2Title,
      step3Title,
      handleMotionConfigNext,
      onMotionConfigDialogClose,
      motionPickTheme,
      motionThemeOptions,
      motionCategoryOptions,
      filteredMotionFields,
      openMotionSlotConfig,
      clearMotionSlot,
      clearMotion,
      motionConfigLoading,
      applyMotionSlotConfig,
      clearVideo,
      clearLogs,
      videoCollapsed,
      motionCollapsed,
      videoSource,
      videoStartTime,
      cursorMs,
      cursorAbsMs,
      maxTime,
      playbackSpeed,
      logFilter,
      filteredLogEntries,
      logDataRangeAbsMs,
      displayLogTimeRange,
      logVirtualColumns,
      formatTime,
      formatTimestamp,
      formatYmd,
      formatYmdHms,
      openSelectionDialog,
      openMotionSelectionDialog,
      handlePlaceholderClick,
      triggerLocalVideoPicker,
      onVideoFileChange,
      clearVideo,
      showVideoTimeConfigDialog,
      videoTimeConfigForm,
      videoConfigTimeRange,
      videoConfigIsCrossDay,
      videoConfigDateOptions,
      videoConfigDisabledHours,
      videoConfigDisabledMinutes,
      videoConfigDisabledSeconds,
      configDialogVideoCurrentTime,
      inferredVideoTimeRange,
      formatVideoStartTime,
      formatConfigDialogVideoProgress,
      applyVideoTimeConfig,
      onVideoTimeConfigDialogClose,
      onDeviceChange,
      logTreeRef,
      logTreeFilterText,
      logTreeData,
      logTreeProps,
      filterLogTreeNode,
      onLogTreeNodeClick,
      selectedLogName,
      formatTreeNodeTime,
      onLogChange,
      disableStartTime,
      onStartTimeChange,
      computedEndTime,
      handleLoadData,
      onSelectionDialogClose,
      onMotionSelectionDialogClose,
      onTimelineChange,
      onVideoLoaded,
      onVideoTimeUpdate,
      onMotionRangeChange,
      onMotionCursorChange,
      isEntryHighlighted,
      onLogEntryClick,
      onLogRowClick,
      logRowClassName,
      onLogVirtualScroll,
      onLogVirtualLoadMore,
      setPlaybackSpeed,
      // 新增的状态和方法
      deviceGroups,
      deviceFilterValue,
      deviceCurrentPage,
      devicePageSize,
      deviceTotal,
      deviceGroupsLoading,
      selectedDeviceForLogs,
      logFileTableRef,
      logFileList,
      logFileLoading,
      logFileCurrentPage,
      logFilePageSize,
      logFileTotal,
      selectedLogFiles,
      logQuickRange,
      logSelectedYear,
      logSelectedMonth,
      logSelectedDay,
      logQuickRangeOptions,
      logYearOptions,
      logMonthOptions,
      logDayOptions,
      applyDeviceFilter,
      handleDeviceSizeChange,
      handleDeviceCurrentChange,
      onDeviceRowClick,
      loadDeviceGroups,
      loadLogFiles,
      handleLogSelectionChange,
      checkLogSelectable,
      getLogStatusType,
      getLogStatusText,
      handleLogQuickRangeChange,
      handleLogYearChange,
      handleLogMonthChange,
      handleLogDayChange,
      handleLogFileSizeChange,
      handleLogFileCurrentChange,
      handleLoadLogData,

      // 自动匹配运行数据（同一小时多个时弹窗选择）
      showAutoMotionPickDialog,
      autoMotionCandidates,
      autoMotionPickedIds,
      setAutoMotionTableRef,
      onAutoMotionSelectionChange,
      confirmAutoMotionPick,

      // 运行数据选择弹窗相关
      showMotionSelectionDialog,
      motionDeviceGroups,
      motionDeviceFilterValue,
      motionDeviceCurrentPage,
      motionDevicePageSize,
      motionDeviceTotal,
      motionDeviceGroupsLoading,
      selectedDeviceForMotion,
      motionFileTableRef,
      motionFileList,
      motionFileLoading,
      motionFileCurrentPage,
      motionFilePageSize,
      motionFileTotal,
      motionQuickRange,
      motionSelectedYear,
      motionSelectedMonth,
      motionSelectedDay,
      motionQuickRangeOptions,
      motionYearOptions,
      motionMonthOptions,
      motionDayOptions,
      applyMotionDeviceFilter,
      handleMotionDeviceSizeChange,
      handleMotionDeviceCurrentChange,
      onMotionDeviceRowClick,
      loadMotionDeviceGroups,
      loadMotionFiles,
      handleMotionSelectionChange,
      checkMotionSelectable,
      getMotionStatusType,
      getMotionStatusText,
      handleMotionQuickRangeChange,
      handleMotionYearChange,
      handleMotionMonthChange,
      handleMotionDayChange,
      handleMotionFileSizeChange,
      handleMotionFileCurrentChange,
      handleLoadMotionDataFromDialog
    }
  }
}
</script>

<style scoped>
.data-analysis-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--slate-50);
}

.da-hidden-file-input {
  display: none;
}

.da-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  min-height: 0;
}

/* 分析态：不滚动，由内部面板各自滚动 */
.da-content:not(.da-content-empty) {
  overflow: hidden;
}

/* 空态：允许滚动避免三张卡片被裁剪 */
.da-content-empty {
  overflow-y: auto;
}

.da-empty {
  width: 100%;
}

.da-empty-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-areas:
    'video logs'
    'motion logs';
  gap: 24px;
}

.da-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--black-white-white);
  border: 1px solid var(--slate-300);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.3s;
}

.da-card-video {
  grid-area: video;
  min-height: 307px;
}

.da-card-motion {
  grid-area: motion;
  min-height: 307px;
}

.da-card-logs {
  grid-area: logs;
  min-height: 638px;
}

.da-empty-card:hover {
  box-shadow: 0 10px 24px var(--alpha-light-200);
  transform: translateY(-1px);
}

.da-card-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: var(--slate-100);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  color: var(--slate-700);
  font-size: 32px;
}

.da-card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--slate-700);
  margin-bottom: 8px;
}

.da-card-subtitle {
  font-size: 14px;
  color: var(--slate-500);
  text-align: center;
  max-width: 360px;
}

/* 分析态样式：随 .da-content 可用高度伸缩，使左右面板始终等高；未添加数据时允许滚动避免裁剪 */
.analysis-view {
  display: flex;
  align-items: stretch;
  gap: 24px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

.right-panel {
  width: 476px;
  flex-shrink: 0;
  align-self: stretch;
  height: 100%;
  background: var(--black-white-white);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--slate-300);
  min-height: 0;
}

.right-panel-empty {
  border: none;
  background: transparent;
  overflow: visible; /* 允许悬浮效果不被裁剪 */
  min-height: 328px; /* 避免日志空卡片被裁剪 */
}

.logs-card-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  flex: 1;
  background: var(--black-white-white);
  border: 1px solid var(--slate-300);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.3s;
}

.logs-card-empty:hover {
  box-shadow: 0 10px 24px var(--alpha-light-200);
  transform: translateY(-1px);
}

.logs-card-empty.is-disabled {
  cursor: not-allowed;
  opacity: 0.7;
  pointer-events: none;
}

.logs-card-empty.is-disabled:hover {
  box-shadow: none;
  transform: none;
}

.video-section {
  display: flex;
  flex-direction: column;
  background: var(--black-white-white);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--slate-300);
  min-height: 0;
}

.video-section:not(.is-collapsed) {
  flex: 1;
}

.video-section.is-collapsed {
  flex: 0 0 48px;
  min-height: 48px;
}

.video-section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 48px;
  min-height: 48px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--slate-200);
  background: var(--slate-50);
}

.video-section.is-collapsed .video-section-bar {
  border-bottom: none;
}

.video-section-bar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--slate-700);
}

.video-section-bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.video-section-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.video-section-content > .video-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--gray-400);
  cursor: pointer;
  padding: 48px;
  background: var(--black-white-black);
}

.video-section-content > .video-placeholder .el-icon {
  font-size: 64px;
}

.video-section-content > .video-player {
  flex: 1;
  width: 100%;
  min-height: 0;
  background: var(--black-white-black);
  object-fit: contain;
  display: block;
}

.motion-section {
  flex: 1;
  min-height: 0;
  background: var(--black-white-white);
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--slate-300);
  overflow: visible;
  display: flex;
  flex-direction: column;
}

.motion-section.is-collapsed {
  flex: 0 0 auto;
  min-height: 0;
  padding: 8px 16px 12px;
}

.motion-section.is-collapsed .motion-content {
  display: none;
}

.motion-section-empty {
  border: none;
  padding: 0;
  background: transparent;
  overflow: visible; /* 允许悬浮效果不被裁剪 */
  flex: 0 0 auto;
  min-height: 328px; /* 避免运行数据空卡片被裁剪 */
}

/* 有日志无运行数据且已标记未找到：收起到一条窄栏（方案2） */
.motion-section-not-found {
  flex: 0 0 auto;
  min-height: 0;
  padding: 0;
  border-radius: var(--radius-lg);
  border: 1px solid var(--slate-300);
  overflow: hidden;
  background: var(--slate-50);
}

.motion-bar-not-found {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  min-height: 48px;
}

.motion-bar-not-found-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--slate-700);
}

.motion-bar-not-found-hint {
  font-size: 12px;
  color: var(--slate-500);
}

.motion-card-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 300px;
  background: var(--black-white-white);
  border: 1px solid var(--slate-300);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.3s;
}

.motion-card-empty:hover {
  box-shadow: 0 10px 24px var(--alpha-light-200);
  transform: translateY(-1px);
}

.motion-card-empty.is-disabled {
  cursor: not-allowed;
  opacity: 0.7;
  pointer-events: none;
}

.motion-card-empty.is-disabled:hover {
  box-shadow: none;
  transform: none;
}

.motion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.motion-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-800);
  min-width: 0;
}

.motion-subtitle {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--gray-400);
}

.motion-actions {
  flex: none;
}

.motion-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0; /* 允许随窗口缩小，避免被父级裁剪 */
  overflow: visible;
}

.motion-energy {
  border: 1px solid var(--slate-200);
  border-radius: var(--radius-sm);
  padding: 8px;
  background: var(--slate-50);
}

.motion-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  align-content: stretch;
  gap: 12px;
  height: 100%;
  min-height: 0;
  flex: 1;
}

.motion-slot {
  border: 1px solid var(--slate-200);
  border-radius: var(--radius-sm);
  overflow: visible;
  background: var(--black-white-white);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  max-height: 100%;
}

/* 极简顶栏：仅放配置/清空，与图例分离不重叠 */
.motion-slot-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--slate-200);
  background: var(--slate-50);
  min-height: 32px;
}

.motion-slot-body {
  position: relative;
  padding: 8px;
  flex: 1;
  min-height: 0;
  overflow: visible;
  display: flex;
  flex-direction: column;
}

.motion-slot-body :deep(.time-series-chart),
.motion-slot-body :deep(.echarts-container),
.motion-slot-chart {
  width: 100% !important;
  max-width: 100%;
  min-height: 0; /* 随 slot 收缩，避免被 analysis-view 裁剪 */
  overflow: visible;
  box-sizing: border-box;
}

.motion-slot-chart :deep(> div) {
  width: 100% !important;
  height: 100% !important;
  max-height: 100%;
}

.motion-slot-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray-400);
  border: 1px dashed var(--slate-300);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
}

.motion-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--gray-400);
  cursor: pointer;
  gap: 16px;
}

.motion-placeholder .el-icon {
  font-size: 64px;
}

/* 运行数据配置弹窗 */
:deep(.da-motion-config-dialog) {
  .el-dialog__body {
    padding: 20px 24px;
  }
}

.motion-config-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 400px;
}

.motion-config-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.motion-config-slot {
  font-size: 14px;
  color: var(--gray-600);
  font-weight: 500;
}

.motion-config-steps {
  margin: 0;
  padding: 0 20px;
}

/* 确保步骤条水平布局 */
.motion-config-steps :deep(.el-steps) {
  display: flex;
  flex-direction: row;
  width: 100%;
}

/* 强制每个步骤宽度完全相等（3个步骤，每个33.33%） */
.motion-config-steps :deep(.el-step) {
  flex: 1 1 33.333%;
  min-width: 0;
  max-width: 33.333%;
  position: relative;
}

/* 重置步骤内部布局 - 保持 Element Plus 默认水平布局，但让节点和文字垂直排列 */
.motion-config-steps :deep(.el-step__head) {
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  width: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.motion-config-steps :deep(.el-step__main) {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 8px;
}

.motion-config-steps :deep(.el-step__title) {
  text-align: center;
  line-height: 1.5;
  margin-top: 0;
  white-space: normal;
  word-break: break-word;
  font-size: 14px;
  width: 100%;
  padding: 0 4px;
  box-sizing: border-box;
}

/* 使用 Element Plus 默认连接线样式，只确保等长 */
.motion-config-steps :deep(.el-step__line) {
  flex: 1;
  min-width: 0;
  display: block;
}

.motion-config-steps :deep(.el-step__line-inner) {
  width: 100%;
  display: block;
}

/* 重置 Element Plus 默认的 padding 和 margin，确保等分 */
.motion-config-steps :deep(.el-step.is-horizontal) {
  padding-right: 0;
  padding-left: 0;
}

.motion-config-steps :deep(.el-step.is-horizontal .el-step__head) {
  padding-right: 0;
}

/* Element Plus 默认会隐藏最后一个步骤的连接线，不需要手动隐藏 */

.motion-config-step-content {
  flex: 1;
  min-height: 300px;
  padding: 20px 0;
}

.step-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.step-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--slate-900);
}

.step-hint {
  font-size: 14px;
  color: var(--gray-500);
}

/* 步骤1：对象选择 */
.motion-subject-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  flex: 1;
  /* 确保多行显示 */
  grid-auto-rows: min-content;
}

.motion-subject-card {
  padding: 12px 16px;
  border: 2px solid var(--slate-200);
  border-radius: var(--radius-md);
  background: var(--black-white-white);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.motion-subject-card:hover {
  border-color: var(--blue-400);
  background: var(--blue-50);
}

.motion-subject-card.active {
  border-color: var(--blue-500);
  background: var(--blue-100);
}

.subject-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--slate-900);
  word-wrap: break-word;
  word-break: break-all;
  white-space: normal;
  line-height: 1.4;
}

.subject-count {
  font-size: 12px;
  color: var(--gray-500);
}

/* 步骤2：数据类型选择 */
.motion-category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  flex: 1;
  /* 确保多行显示 */
  grid-auto-rows: min-content;
}

.motion-category-card {
  padding: 12px 16px;
  border: 2px solid var(--slate-200);
  border-radius: var(--radius-md);
  background: var(--black-white-white);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.motion-category-card:hover {
  border-color: var(--blue-400);
  background: var(--blue-50);
}

.motion-category-card.active {
  border-color: var(--blue-500);
  background: var(--blue-100);
}

.category-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--slate-900);
  line-height: 1.4;
  word-wrap: break-word;
  word-break: break-all;
  white-space: normal;
}

.category-count {
  font-size: 12px;
  color: var(--gray-500);
}

/* 步骤3：变量选择 */
.motion-variable-list {
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
}

.motion-field-empty {
  padding: 40px;
  text-align: center;
  color: var(--gray-400);
}

.motion-variable-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.motion-variable-checkbox {
  padding: 6px 0;
  transition: all 0.2s;
}

.motion-variable-checkbox :deep(.el-checkbox__label) {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.variable-name {
  font-size: 14px;
  color: var(--slate-900);
  flex: 1;
  word-wrap: break-word;
  word-break: break-all;
  white-space: normal;
  line-height: 1.4;
}

.variable-index {
  font-size: 12px;
  color: var(--gray-500);
  font-family: monospace;
}

.motion-config-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.logs-header {
  padding: 16px;
  border-bottom: 1px solid var(--slate-200);
}

.logs-header-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.logs-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.logs-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-filter-input {
  flex: 1;
}

.log-time-range {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--slate-200);
  background-color: var(--slate-50);
  font-size: 13px;
  color: var(--gray-600);
}

.log-time-range .el-icon {
  font-size: 14px;
  color: var(--gray-500);
}

.log-time-range .time-range-text {
  flex: 1;
}

.logs-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.logs-content > .logs-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px;
  text-align: center;
  color: var(--gray-400);
  border: 1px dashed var(--slate-300);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}

.logs-content > .logs-empty:hover {
  color: var(--gray-500);
  border-color: var(--slate-400);
  background-color: var(--slate-50);
}

.logs-content > .logs-empty.is-disabled {
  cursor: not-allowed;
  opacity: 0.7;
  pointer-events: none;
}

.logs-content > .logs-empty.is-disabled:hover {
  color: var(--gray-400);
  border-color: var(--slate-300);
  background-color: transparent;
}

.logs-content > .logs-empty .el-icon {
  font-size: 24px;
}

.logs-content > .log-entries-table {
  flex: 1;
  min-height: 0;
}

.logs-empty {
  padding: 48px;
  text-align: center;
  color: var(--gray-400);
}

.log-entry {
  padding: 12px;
  margin-bottom: 8px;
  background: var(--slate-50);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all 0.2s;
}

.log-entry:hover {
  background: var(--slate-100);
}

.log-entry-highlight {
  background: var(--blue-50);
  border-left: 3px solid var(--blue-500);
}

.log-entry-time {
  font-size: 12px;
  color: var(--gray-400);
  margin-bottom: 4px;
}

.log-entry-content {
  font-size: 14px;
  color: var(--gray-800);
  word-break: break-word;
}

/* 选择数据弹窗 - 左右分栏布局 */
:deep(.da-select-dialog) {
  .el-dialog {
    width: 80%;
    max-width: 80%;
    margin: 5vh auto;
  }
  
  .el-dialog__header {
    display: none;
  }
  
  .el-dialog__body {
    padding: 16px;
    max-height: calc(85vh - 60px);
    height: calc(85vh - 60px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}

/* 选择运行数据弹窗 - 复用同一套布局 */
:deep(.da-motion-select-dialog) {
  .el-dialog {
    width: 80%;
    max-width: 80%;
    margin: 5vh auto;
  }
  
  .el-dialog__header {
    display: none;
  }
  
  .el-dialog__body {
    padding: 16px;
    max-height: calc(85vh - 60px);
    height: calc(85vh - 60px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}

.log-selection-layout {
  display: flex;
  gap: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.selection-left-panel,
.selection-right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.selection-left-panel {
  border-right: 1px solid var(--slate-200);
  padding-right: 16px;
}

.selection-right-panel {
  padding-left: 16px;
}

.panel-header {
  padding: 0 0 12px 0;
  margin-bottom: 12px;
  flex-shrink: 0;
  background: transparent;
  height: 116px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  position: relative;
  box-sizing: border-box;
}

.panel-header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--slate-200);
  z-index: 2;
  pointer-events: none;
}

.panel-header h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--slate-900);
  height: 24px;
  line-height: 24px;
  flex-shrink: 0;
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  padding: 0;
  height: 100%;
}

.panel-content > div:first-child,
.panel-content .table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

.panel-content .el-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.panel-content .el-table__body-wrapper {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.panel-content .el-table__header-wrapper {
  flex-shrink: 0;
}

.panel-content .el-table__inner-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 确保表格容器充满空间 */
.panel-content .el-table__body {
  flex: 1;
}

.pagination-wrapper {
  padding: 12px 0;
  border-top: 1px solid var(--slate-200);
  margin-top: 12px;
  flex-shrink: 0;
  background: transparent;
  height: 48px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}


.time-filter-bar {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  height: 72px;
  box-sizing: border-box;
  justify-content: flex-start;
}

.time-filter-bar.filter-placeholder {
  height: 72px;
}

.filter-placeholder-content {
  height: 72px;
  flex-shrink: 0;
}

.filter-input-wrapper {
  flex: 1;
  height: 72px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.quick-range-group {
  display: flex;
  gap: 8px;
}

.custom-range-selects {
  display: flex;
  gap: 8px;
}

.time-select {
  flex: 1;
}

.empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  min-height: 0;
}

.selected-info {
  margin-top: 12px;
  margin-bottom: 0;
}

.selected-info-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  line-height: 1.5;
}

.info-value {
  color: var(--slate-900);
  font-weight: 500;
  flex: 1;
}

.min-w-0 {
  min-width: 0;
}

.one-line-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 日志条目表格样式 */
.timestamp-cell {
  font-size: 13px;
  color: var(--slate-700);
}

.error-code-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.error-code-line {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.error-code {
  font-weight: 600;
  color: var(--slate-900);
  font-size: 14px;
}

.param {
  color: var(--slate-600);
  font-size: 13px;
}

.explanation-line {
  font-size: 12px;
  color: var(--slate-500);
  line-height: 1.5;
}

/* 表格样式 */
.log-entries-table {
  width: 100%;
}

/* 高亮行：VirtualTable 使用 div.virtual-table-row + div.virtual-table-cell，需 :deep 命中 */
.log-virtual-table :deep(.virtual-table-row.log-row-highlight),
.log-virtual-table :deep(.virtual-table-row.log-row-highlight .virtual-table-cell) {
  background: var(--blue-50) !important;
}
.log-virtual-table :deep(.virtual-table-row.log-row-highlight) {
  box-shadow: inset 3px 0 0 var(--blue-500);
}

.log-row-highlight td {
  background: var(--blue-50) !important;
  box-shadow: inset 3px 0 0 var(--blue-500);
}

.log-virtual-table {
  /* 作为 flex 子项占满 logs-content 的剩余高度 */
  flex: 1;
  min-height: 0;
  /* 保证滚动区域至少有高度，避免父级裁剪导致“看到的底部”不是真实底部、load-more 不触发 */
  min-height: 200px;
  border: none;
}

.log-virtual-table :deep(.virtual-table-header) {
  display: flex;
}

.log-virtual-table :deep(.virtual-table-row) {
  display: flex;
}

.log-virtual-table :deep(.virtual-table-cell) {
  white-space: normal;
  word-break: break-word;
}

.log-virtual-table :deep(.virtual-table-cell:first-child) {
  width: 180px;
  min-width: 180px;
  flex-shrink: 0;
}

.log-virtual-table :deep(.virtual-table-cell:last-child) {
  flex: 1;
  min-width: 260px;
}

.virtual-log-message {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
}

.log-row-highlight {
  background: var(--blue-50) !important;
  box-shadow: inset 3px 0 0 var(--blue-500);
}

.device-filter-input {
  width: 100%;
}

.log-file-table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.selected-log-tag {
  margin-right: 4px;
}

/* 视频时间配置弹窗样式 */
.video-time-config-content {
  padding: 8px 0;
}

.video-config-date-hint {
  font-size: 12px;
  color: var(--slate-500);
  margin-bottom: 8px;
}

.current-time-display {
  color: var(--slate-700);
  font-size: 14px;
}

.form-item-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--slate-500);
  line-height: 1.5;
}
</style>
