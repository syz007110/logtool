<template>
  <div class="batch-analysis-container">
    <!-- 主要内容 -->
    <div class="analysis-card-wrapper">
      <el-card class="analysis-card">
      <div class="card-header" :style="{ borderBottom: 'none' }">
        <div class="header-left">
          <span class="title">{{ $t('batchAnalysis.title') }}</span>
          <div class="header-tag-block" v-if="batchCount > 0 && selectedLogsCount > 0">
            <span class="header-tag-label">{{ $t('batchAnalysis.deviceId') }}：</span>
            <span class="header-tag-value">{{ selectedLogs[0]?.device_id || $t('shared.unknown') }}</span>
          </div>
          <el-tooltip placement="bottom" effect="light" transition="el-fade-in-linear" popper-class="selected-files-popper" :disabled="selectedLogsCount === 0">
            <template #content>
              <div class="selected-files-tooltip">
                <el-tag v-for="log in selectedLogs" :key="log.id" size="small" style="margin: 2px 4px 2px 0;">
                  {{ log.original_name }}
                </el-tag>
              </div>
            </template>
            <div class="header-tag-block">
              <span class="header-tag-value">{{ $t('batchAnalysis.selectedFiles', { count: selectedLogsCount }) }}</span>
            </div>
          </el-tooltip>
        </div>
        <div class="header-right">
          <el-button 
            v-if="!loading && batchCount > 0" 
            type="primary"
            size="small"
            @click="exportToCSV"
          >
            <el-icon><Download /></el-icon>
            {{ $t('batchAnalysis.exportCSV') }}
          </el-button>
          <el-button 
            v-if="!loading && batchCount > 0" 
            type="default"
            size="small"
            @click="showClipboard"
          >
            <el-icon><DocumentCopy /></el-icon>
            {{ $t('batchAnalysis.clipboard') }}
          </el-button>
          <el-button 
            v-if="!loading && selectedLogsCount > 0 && batchCount > 0" 
            type="default"
            size="small"
            @click="showSurgeryStatistics"
          >
            <el-icon><DataAnalysis /></el-icon>
            {{ $t('batchAnalysis.surgeryStatistics') }}
          </el-button>
        </div>
      </div>

      <!-- 手术统计结果（列表）：弹窗内做加载效果，分析结束后展示结果 -->
      <el-dialog v-model="showSurgeryStatsDialog" :title="$t('batchAnalysis.surgeryStatistics')" width="900px" append-to-body>
        <div v-if="surgeryStatsLoading" style="padding: 24px 0;">
          <el-empty :description="$t('batchAnalysis.analyzing')" />
        </div>
        <el-table v-else :data="surgeryStats" style="width:100%">
            <el-table-column prop="surgery_id" :label="$t('logs.surgeryId')" width="220" />
            <!-- 手术术式列已隐藏 -->
            <!-- <el-table-column label="手术术式" min-width="200">
              <template #default="{ row }">
                {{ row?.postgresql_structure?.surgery_stats?.procedure || row?.surgery_stats?.procedure || '-' }}
              </template>
            </el-table-column> -->
            <el-table-column :label="$t('logs.surgeryStartTime')" width="180">
              <template #default="{ row }">{{ formatTimestampWithTimezone(row.surgery_start_time || row.start_time, displayTimezoneOffsetMinutes) || formatTimestamp(row.surgery_start_time || row.start_time) }}</template>
            </el-table-column>
            <el-table-column :label="$t('logs.surgeryEndTime')" width="180">
              <template #default="{ row }">{{ formatTimestampWithTimezone(row.surgery_end_time || row.end_time, displayTimezoneOffsetMinutes) || formatTimestamp(row.surgery_end_time || row.end_time) }}</template>
            </el-table-column>
            <el-table-column :label="$t('shared.operation')" width="320" :fixed="surgeryStats.length > 0 ? 'right' : false" align="left">
              <template #default="{ row }">
                <div class="operation-buttons">
                  <el-button text @click="visualizeSurgeryStat(row)">{{ $t('batchAnalysis.visualize') }}</el-button>
                  <el-button text @click="previewSurgeryData(row)">{{ $t('batchAnalysis.viewData') }}</el-button>
                  <el-button 
                    v-if="hasExportPermission"
                    text 
                    :loading="exportingRow[row.id]===true"
                    @click="exportSurgeryRow(row)"
                  >{{ $t('batchAnalysis.export') }}</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        <template #footer>
          <el-button class="btn-secondary" @click="showSurgeryStatsDialog=false">{{ $t('batchAnalysis.close') }}</el-button>
        </template>
      </el-dialog>

      <!-- 查看数据弹窗 -->
      <el-dialog v-model="surgeryJsonDialogVisible" :title="$t('batchAnalysis.surgeryDataPostgresFormat')" width="760px" append-to-body>
        <div style="margin-bottom: 8px; color: #666; font-size: 12px;">
          {{ $t('batchAnalysis.postgresFormatDescription') }}
        </div>
        <el-input type="textarea" :rows="18" v-model="surgeryJsonText" readonly />
        <template #footer>
          <el-button @click="surgeryJsonDialogVisible=false">{{ $t('batchAnalysis.close') }}</el-button>
        </template>
      </el-dialog>

      <!-- 搜索和筛选 -->
      <div class="search-section" :style="{ marginTop: '8px' }">
        <div class="compact-toolbar">
          <!-- 第一行：高级选项、时间范围、关键词搜索 -->
          <div class="toolbar-row-1">
            <el-button 
              size="small" 
              @click="filterDrawerVisible = !filterDrawerVisible"
              class="btn-secondary btn-sm filter-toggle-btn"
            >
              <el-icon><Filter /></el-icon>
              {{ $t('batchAnalysis.advancedFilter') }}
            </el-button>
            <el-date-picker
              v-model="timeRangeDisplay"
              type="datetimerange"
              :range-separator="$t('logs.to')"
              :start-placeholder="$t('logs.startTime')"
              :end-placeholder="$t('logs.endTime')"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
              class="time-range-toolbar"
              size="small"
              :default-value="defaultPickerRange"
              :disabled-date="disableOutOfRangeDates"
              @change="handleTimeRangeChange"
            />
            <el-input
              v-model="searchKeyword"
              :placeholder="$t('batchAnalysis.searchPlaceholder')"
              class="search-input-compact"
              clearable
              @input="handleSearch"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd"
              size="small"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
          <!-- 第二行：分析等级、搜索表达式摘要，清除所有条件按钮 -->
          <div class="toolbar-row-2">
            <div class="filter-summary-horizontal" v-if="analysisLevelLabel !== $t('batchAnalysis.analysisLevelNotSelected') || searchExpression">
              <div class="summary-block" v-if="analysisLevelLabel !== $t('batchAnalysis.analysisLevelNotSelected')">
                <span class="summary-block-label">{{ $t('batchAnalysis.analysisLevel') }}：</span>
                <span class="summary-block-value">{{ analysisLevelLabel }}</span>
              </div>
              <div class="summary-block summary-block-expr" v-if="searchExpression">
                <span class="summary-block-label">{{ $t('batchAnalysis.searchExpression') }}：</span>
                <span class="summary-block-expr-value" :title="searchExpression">{{ searchExpression }}</span>
              </div>
            </div>
            <el-button
              size="small"
              type="danger"
              plain
              :disabled="!hasActiveFilters"
              @click="clearFilters"
              class="clear-filters-toolbar-btn"
            >
              <el-icon><Delete /></el-icon>
              {{ $t('batchAnalysis.clearAllConditions') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 筛选抽屉改为侧边栏 -->
      <div class="main-content-layout">
        <div class="filter-sidebar" :class="{ 'sidebar-hidden': !filterDrawerVisible }">
          <div class="filter-sidebar-content">
            <div class="filter-sidebar-header">
              <el-radio-group v-model="filterSidebarActiveTab" class="el-segmented-control" size="small">
                <el-radio-button label="level">{{ $t('batchAnalysis.logLevelTab') }}</el-radio-button>
                <el-radio-button label="search">{{ $t('batchAnalysis.searchTab') }}</el-radio-button>
                <el-radio-button label="settings">{{ $t('batchAnalysis.settingsTab') }}</el-radio-button>
              </el-radio-group>
            </div>

            <div class="filter-sidebar-body" ref="filterSidebarBodyRef">
              <!-- Log Level -->
              <div v-show="filterSidebarActiveTab === 'level'" class="drawer-section analysis-level-tab">
                <!-- 预设等级：与「自定义」同级。卡片文字在 i18n 中修改：batchAnalysis.fullLogs/fullLogsDesc、detailedLogs/detailedLogsDesc、keyLogs/keyLogsDesc -->
                <div class="level-tab-section">
                  <div class="section-title drawer-section-title">{{ $t('batchAnalysis.presetLevels') }}</div>
                  <div class="level-cards">
                    <div class="level-card" :class="{ active: pendingLevelPresetKey === 'ALL' }" @click="onSelectLevelCard('ALL')">
                      <div class="level-card-title">{{ $t('batchAnalysis.fullLogs') }}</div>
                      <div class="level-card-desc">{{ $t('batchAnalysis.fullLogsDesc') }}</div>
                    </div>
                    <div class="level-card" :class="{ active: pendingLevelPresetKey === 'FINE' }" @click="onSelectLevelCard('FINE')">
                      <div class="level-card-title">{{ $t('batchAnalysis.detailedLogs') }}</div>
                      <div class="level-card-desc">{{ $t('batchAnalysis.detailedLogsDesc') }}</div>
                    </div>
                    <div class="level-card" :class="{ active: pendingLevelPresetKey === 'KEY' }" @click="onSelectLevelCard('KEY')">
                      <div class="level-card-title">{{ $t('batchAnalysis.keyLogs') }}</div>
                      <div class="level-card-desc">{{ $t('batchAnalysis.keyLogsDesc') }}</div>
                    </div>
                  </div>
                </div>

                <!-- 自定义：与「预设等级」同级，内容左右留白与预设一致；启用时自动滚动到视口中心 -->
                <div class="level-tab-section" ref="customSectionRef">
                  <div class="level-tab-section-header">
                    <div class="section-title drawer-section-title">{{ $t('batchAnalysis.customSubsystemFilter') }}</div>
                    <el-switch v-model="customSubsystemActive" size="small" :active-text="$t('batchAnalysis.active')" />
                  </div>
                  <div class="category-section-content">
                    <el-input
                      v-model="categorySearchKeyword"
                      :placeholder="$t('batchAnalysis.subsystemSearchPlaceholder')"
                      clearable
                      size="small"
                      class="category-search-input"
                      :disabled="!customSubsystemActive"
                    >
                      <template #prefix>
                        <el-icon><Search /></el-icon>
                      </template>
                    </el-input>

                    <div class="subsystem-meta">
                      <span class="subsystem-count">{{ $t('batchAnalysis.itemsFound', { n: filteredCategoriesForLevel.length }) }}</span>
                      <div class="subsystem-actions">
                        <el-button link size="small" :disabled="!customSubsystemActive" @click="selectAllCategories">{{ $t('batchAnalysis.selectAll') }}</el-button>
                        <el-button link size="small" :disabled="!customSubsystemActive" @click="clearCategorySelection">{{ $t('batchAnalysis.none') }}</el-button>
                      </div>
                    </div>

                    <div class="category-chips-wrap" :class="{ 'chips-disabled': !customSubsystemActive }">
                      <div
                        v-for="c in filteredCategoriesForLevel"
                        :key="c.id"
                        class="category-chip"
                        :class="{ active: pendingSelectedAnalysisCategoryIds.includes(c.id) }"
                        @click="customSubsystemActive && toggleCategoryChip(c)"
                      >
                        {{ getCategoryDisplayName(c) }}
                      </div>
                      <div v-if="filteredCategoriesForLevel.length === 0" class="category-list-empty">{{ $t('batchAnalysis.categoryNoMatch') }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Search：分为 3 部分：自然语言搜索、常用搜索表达式、导入搜索表达式；隐藏筛选条件 -->
              <div v-show="filterSidebarActiveTab === 'search'" class="drawer-section advanced-filter-inline">
                <!-- 1. 自然语言搜索：追问时显示对话形式 + 单行输入 -->
                <div class="search-tab-section">
                  <div class="section-title drawer-section-title">{{ $t('batchAnalysis.naturalLanguageSearch') }}</div>
                  <template v-if="nlSpec && nlSpec.meta && nlSpec.meta.status === 'need_clarification'">
                    <div class="nl-conversation">
                      <div class="nl-messages">
                        <div
                          v-for="(msg, i) in nlConversationMessages"
                          :key="i"
                          :class="['nl-msg', 'nl-msg-' + msg.role]"
                        >
                          <span class="nl-msg-label">{{ msg.role === 'assistant' ? $t('batchAnalysis.nlAssistant') : $t('batchAnalysis.nlYou') }}</span>
                          <div class="nl-msg-content">{{ msg.content }}</div>
                        </div>
                      </div>
                      <div class="nl-reply-row">
                        <el-input
                          v-model="nlInputLine"
                          type="text"
                          :placeholder="$t('batchAnalysis.nlReplyPlaceholder')"
                          class="nl-input-line"
                          clearable
                          @keyup.enter="submitNlReply"
                        />
                        <el-button type="primary" size="small" class="nl-send-reply-btn" :loading="nlGenerating" :disabled="!nlInputLine.trim()" @click="submitNlReply">
                          {{ $t('batchAnalysis.nlSendReply') }}
                        </el-button>
                      </div>
                      <div v-if="nlQuestionOptions.length" class="nl-options-row">
                        <el-button
                          v-for="(opt, oi) in nlQuestionOptions"
                          :key="`${opt}-${oi}`"
                          size="small"
                          class="nl-option-btn"
                          @click="nlInputLine = String(opt || '')"
                        >
                          {{ opt }}
                        </el-button>
                      </div>
                      <el-button size="small" class="nl-cancel-clarification" @click="cancelNlClarification">
                        {{ $t('batchAnalysis.nlCancelClarification') }}
                      </el-button>
                    </div>
                  </template>
                  <div v-else class="nl-card">
                    <el-input
                      v-model="nlQuery"
                      type="textarea"
                      :autosize="{ minRows: 3, maxRows: 6 }"
                      :placeholder="$t('batchAnalysis.naturalLanguagePlaceholder')"
                      class="nl-textarea"
                    />
                    <el-button type="primary" size="small" class="nl-generate-btn" :loading="nlGenerating" :disabled="!nlQuery.trim()" @click="generateFilterExpression">
                      {{ $t('batchAnalysis.generateFilterExpression') }}
                    </el-button>
                  </div>
                </div>

                <!-- 2. 常用搜索表达式：标签使用 filter-chip 样式，仅显示名称 -->
                <div class="search-tab-section" v-if="templates && templates.length">
                  <div class="section-title drawer-section-title">{{ $t('batchAnalysis.commonSearchExpressions') }}</div>
                  <div class="saved-expr-chips-wrap">
                    <div
                      v-for="tpl in templates"
                      :key="tpl.name"
                      class="saved-expr-chip filter-chip-style"
                      :class="{ active: selectedTemplateName === tpl.name }"
                      @click="selectTemplateCard(tpl.name)"
                    >
                      {{ tpl.name }}
                    </div>
                  </div>
                </div>

                <!-- 3. 导入搜索表达式 -->
                <div class="search-tab-section">
                  <div class="section-title drawer-section-title">{{ $t('batchAnalysis.importSearchExpression') }}</div>
                  <el-upload :show-file-list="false" accept="application/json" :before-upload="beforeImportTemplates" class="import-upload-inline">
                    <el-button size="small" class="btn-secondary btn-sm">{{ $t('batchAnalysis.importJsonExpressionFile') }}</el-button>
                  </el-upload>
                </div>

                <!-- 自然语言 stats 动作：统计展示（置于表达式预览上方） -->
                <div v-if="nlStatsCounts && nlStatsCounts.length" class="search-tab-stats">
                  <div class="search-tab-stats-label">{{ $t('batchAnalysis.nlStatsLabel') }}：</div>
                  <div class="search-tab-stats-list">
                    <div v-for="(s, i) in nlStatsCounts" :key="i" class="search-tab-stats-item">
                      <span class="search-tab-stats-field">{{ s.field === 'error_code' ? $t('batchAnalysis.errorCode') : s.field }} {{ s.value }}：</span>
                      <span class="search-tab-stats-count">{{ s.count }}</span>
                      <span class="search-tab-stats-unit">{{ $t('batchAnalysis.nlStatsUnit') }}</span>
                    </div>
                  </div>
                </div>
                <!-- 底部：搜索表达式预览（自然语言/常用表达式/导入选中后显示） -->
                <div class="search-tab-preview" v-if="searchTabPreviewExpression">
                  <span class="search-tab-preview-label">{{ $t('batchAnalysis.expressionPreview') }}：</span>
                  <span class="search-tab-preview-expr" :title="searchTabPreviewExpression">{{ searchTabPreviewExpression }}</span>
                </div>
              </div>

              <!-- Settings -->
              <div v-show="filterSidebarActiveTab === 'settings'" class="drawer-section">
                <div class="section-title drawer-section-title">{{ $t('batchAnalysis.timezoneConversion') }}</div>
                <el-select
                  v-model="pendingDisplayTimezoneOffsetMinutes"
                  :placeholder="$t('batchAnalysis.timezoneConversion')"
                  class="timezone-select-full"
                  size="small"
                >
                  <el-option
                    v-for="opt in timezoneOptions"
                    :key="opt.value"
                    :label="$t(opt.labelKey)"
                    :value="opt.value"
                  />
                </el-select>
              </div>
            </div>

            <div class="drawer-footer">
              <el-button size="small" @click="resetSidebarFilters" class="btn-secondary btn-sm drawer-footer-reset">
                {{ $t('batchAnalysis.resetSidebarFilters') }}
              </el-button>
              <el-button size="small" type="primary" @click="applySidebarFilters" class="drawer-footer-apply">
                {{ $t('batchAnalysis.applyChanges') }}
              </el-button>
            </div>
          </div>
        </div>

        <div class="main-content-area">
          <!-- 点击遮罩关闭侧边栏 -->
          <div
            v-show="filterDrawerVisible"
            class="sidebar-backdrop"
            @click="filterDrawerVisible = false"
          />
        <!-- 日志条目表格 -->
        <div class="entries-section">
          <div class="section-header">
            <h3>{{ $t('batchAnalysis.logEntries') }} ({{ filteredCount }})</h3>
          </div>

          <!-- 加载状态 -->
          <div v-if="loading" class="loading-section">
            <el-empty :description="$t('batchAnalysis.loadingLogData')" />
          </div>

          <!-- 数据表格：仅此表格使用紧凑样式，不影响其他页面的表格 -->
          <div v-else class="table-container compact-log-entries-table">
            <el-table 
              :data="paginatedEntries" 
              style="width: 100%"
              v-loading="loading"
              height="100%"
              :stripe="false"
              table-layout="fixed"
              row-key="id"
              :row-class-name="getRowClassName"
              :row-style="getRowStyle"
              :cell-class-name="getCellClassName"
              @current-change="forceRelayout"
              @selection-change="forceRelayout"
              @sort-change="forceRelayout"
              @filter-change="forceRelayout"
              @expand-change="forceRelayout"
            >
            <!-- 标记颜色列 -->
            <el-table-column
              prop="color_mark"
              width="4%"
              class-name="color-mark-body-cell"
              label-class-name="color-mark-header-cell"
            >
              <template #header>
                <div class="col-header header-color-mark">
                  <el-popover
                    placement="bottom-start"
                    :width="200"
                    trigger="manual"
                    v-model:visible="headerColorPopoverVisible"
                    popper-class="color-picker-popover"
                  >
                    <template #reference>
                      <div
                        class="header-color-indicator"
                        :title="$t('batchAnalysis.markAllWithColorHint')"
                        @click.stop="headerColorPopoverVisible = !headerColorPopoverVisible"
                      />
                    </template>
                    <div class="color-picker-menu header-color-picker-menu">
                      <div
                        v-for="color in colorOptions"
                        :key="color.value || 'none'"
                        class="color-option"
                        :class="{ 'no-color': color.value === null }"
                        :style="color.value ? { backgroundColor: color.value } : {}"
                        @click="applyColorToAllFilteredRows(color.value)"
                      />
                    </div>
                  </el-popover>
                </div>
              </template>
              <template #default="{ row }">
                <div class="color-mark-cell">
                  <el-popover
                    v-if="activeColorPopoverRowId === row.id"
                    placement="bottom-start"
                    :width="200"
                    trigger="manual"
                    :visible="true"
                    popper-class="color-picker-popover"
                  >
                    <template #reference>
                      <div 
                        class="color-indicator"
                        :class="{ 'has-color': row.color_mark }"
                        :style="row.color_mark ? { backgroundColor: row.color_mark } : {}"
                        @click.stop="toggleColorPopover(row)"
                      ></div>
                    </template>
                    <div class="color-picker-menu">
                      <div 
                        v-for="color in colorOptions"
                        :key="color.value || 'none'"
                        class="color-option"
                        :class="{ 
                          active: row.color_mark === color.value,
                          'no-color': color.value === null
                        }"
                        :style="color.value ? { backgroundColor: color.value } : {}"
                        @click="selectColor(row, color.value)"
                      >
                        <div v-if="row.color_mark === color.value" class="checkmark">✓</div>
                      </div>
                    </div>
                  </el-popover>
                  <div 
                    v-else
                    class="color-indicator"
                    :class="{ 'has-color': row.color_mark }"
                    :style="row.color_mark ? { backgroundColor: row.color_mark } : {}"
                    @click.stop="toggleColorPopover(row)"
                  ></div>
                </div>
              </template>
            </el-table-column>
            
            <!-- 文件名/时间戳列 -->
            <el-table-column prop="file_info" width="11%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.timestampWithFilename') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="file-info-cell">
                  <el-tooltip
                    :content="getTimestampFileInfoTooltip(row)"
                    placement="top"
                    effect="dark"
                    :show-after="500"
                    :disabled="!getTimestampFileInfoTooltip(row)"
                  >
                    <span class="timestamp-cell-ellipsis">{{ formatTimestampWithTimezone(row.timestamp, displayTimezoneOffsetMinutes) || row.timestamp_text }}</span>
                  </el-tooltip>
                </div>
              </template>
            </el-table-column>
            
            <!-- 故障码列 -->
            <el-table-column prop="error_code" width="6%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.errorCode') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="error-code-cell" @click="toggleErrorCodeStatistics(row.error_code)">
                  {{ row.error_code }}
                  <span v-if="row.is_ungraded" class="ungraded-mark">*</span>
                  <span 
                    v-if="showStatisticsForErrorCode === row.error_code && getErrorCodeCountDisplay(row.error_code)" 
                    class="error-code-badge"
                    :title="getErrorCodeStatisticsTooltip(row.error_code)"
                  >
                    {{ getErrorCodeCountDisplay(row.error_code) }}
                  </span>
                </div>
              </template>
            </el-table-column>
            
            <!-- 释义列 -->
            <el-table-column prop="explanation" width="56%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.explanation') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <el-tooltip
                  :content="row.explanation || ''"
                  placement="top"
                  effect="dark"
                  :show-after="500"
                  :disabled="!row.explanation"
                >
                  <div class="explanation-cell">
                    <ExplanationCell :text="row.explanation" :show-title="false" />
                  </div>
                </el-tooltip>
              </template>
            </el-table-column>
            
            <!-- 参数列 -->
            <el-table-column prop="parameters" width="15%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.parameters') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="parameters-cell">
                  <div class="param-content">
                    <span v-for="(param, index) in row.display_params" :key="index" class="param-item">{{ param }}</span>
                  </div>
                  <div class="param-actions">
                    <el-popover
                      v-if="activeParamPopoverRowId === row.id"
                      :visible="true"
                      trigger="manual"
                      placement="bottom"
                      width="260px"
                      :teleported="true"
                      popper-class="param-popover"
                    >
                      <div class="parameter-popover">
                        <div class="popover-title" style="margin-bottom:8px;">{{ $t('batchAnalysis.selectVisualizationParam') }}</div>
                        <div v-if="paramNamesLoading" class="param-loading">{{ $t('batchAnalysis.loadingParamMeanings') }}</div>
                        <el-radio-group 
                          v-else
                          v-model="selectedParameter"
                          class="param-radio-group"
                        >
                          <el-radio
                            v-for="idx in 4"
                            :key="idx"
                            :label="idx"
                            :disabled="paramNamesLoading || !isParameterAvailable(idx)"
                          >
                            {{ paramNames[idx - 1] || $t('batchAnalysis.parameterDefault', { index: idx }) }}
                          </el-radio>
                        </el-radio-group>
                        <div class="popover-actions" style="margin-top:8px;text-align:right;">
                          <el-button size="small" class="btn-secondary btn-sm" @click="activeParamPopoverRowId = null">{{ $t('shared.cancel') }}</el-button>
                          <el-button size="small" class="btn-primary btn-sm" @click="confirmVisualization">{{ $t('shared.confirm') }}</el-button>
                        </div>
                      </div>
                      <template #reference>
                      <el-button 
                        text
                        @click.stop="handleVisualization(row)"
                        class="visualization-btn"
                        :disabled="chartThumbnails.length >= 5"
                        :title="chartThumbnails.length >= 5 ? $t('batchAnalysis.visualizationMaxChartsTooltip') : ''"
                      >
                        <el-icon><DataAnalysis /></el-icon>
                      </el-button>
                      </template>
                    </el-popover>
                    <el-button 
                      v-else
                      text
                      @click.stop="handleVisualization(row)"
                      class="visualization-btn"
                      :disabled="chartThumbnails.length >= 5"
                      :title="chartThumbnails.length >= 5 ? '已有5张可视化数据表' : ''"
                    >
                      <el-icon><DataAnalysis /></el-icon>
                    </el-button>
                  </div>
                </div>
              </template>
            </el-table-column>
            
            
            <!-- 操作列：固定 8%，始终显示图标按钮（高级选项已为侧边栏悬浮，无需根据侧边栏切换） -->
            <el-table-column prop="operations" width="8%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.operations') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="operations-cell">
                  <el-button text @click="handleContextAnalysis(row)" class="operation-btn operation-btn-context">
                    <el-icon><View /></el-icon>
                  </el-button>
                  <el-button text @click="handleLogCapture(row)" class="operation-btn operation-btn-capture">
                    <el-icon><DocumentCopy /></el-icon>
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 分页 -->
        <div class="pagination-wrapper" v-if="filteredCount > 0">
          <el-pagination
            :current-page="currentPage"
            :page-size="pageSize"
            :page-sizes="[50, 100, 200, 500]"
            :total="totalCount"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>

        </div>

        <!-- 上下文分析对话框 -->
        <el-dialog
          v-model="contextAnalysisVisible"
          :title="$t('batchAnalysis.contextAnalysisTitle')"
          width="800px"
          :close-on-click-modal="false"
        >
          <div class="context-analysis-form">
            <div class="context-intro">{{ $t('batchAnalysis.contextAnalysisIntro') }}</div>
            <div class="time-range-inputs" style="display:flex; align-items:center; justify-content:center; gap: 8px;">
              <div class="input-group">
                <label>{{ $t('batchAnalysis.contextAnalysisBefore') }}</label>
                <el-input-number
                  v-model="beforeMinutes"
                  :min="0"
                  :max="60"
                  controls-position="right"
                  style="width: 80px;"
                />
                <span class="unit-label">{{ $t('batchAnalysis.contextAnalysisMinutes') }}</span>
                <el-input-number
                  v-model="beforeSeconds"
                  :min="0"
                  :max="60"
                  controls-position="right"
                  style="width: 80px; margin-left: 4px;"
                />
                <span class="unit-label">{{ $t('batchAnalysis.contextAnalysisSeconds') }}</span>
              </div>
              <span>，</span>
              <div class="input-group">
                <label>{{ $t('batchAnalysis.contextAnalysisAfter') }}</label>
                <el-input-number
                  v-model="afterMinutes"
                  :min="0"
                  :max="60"
                  controls-position="right"
                  style="width: 80px;"
                />
                <span class="unit-label">{{ $t('batchAnalysis.contextAnalysisMinutes') }}</span>
                <el-input-number
                  v-model="afterSeconds"
                  :min="0"
                  :max="60"
                  controls-position="right"
                  style="width: 80px; margin-left: 4px;"
                />
                <span class="unit-label">{{ $t('batchAnalysis.contextAnalysisSeconds') }}</span>
              </div>
            </div>
          </div>
          
          <template #footer>
            <div class="dialog-footer">
              <el-button class="btn-primary" @click="executeContextAnalysis">{{ $t('shared.confirm') }}</el-button>
            </div>
          </template>
        </el-dialog>

        <!-- 右侧侧边栏（日志摘取 / 可视化） -->
        <el-drawer
          v-model="clipboardVisible"
          direction="rtl"
          size="340px"
          :with-header="false"
        >
          <div class="sidebar-tabs">
            <el-tabs v-model="sidebarActiveTab" stretch>
              <el-tab-pane :label="`${$t('batchAnalysis.logExtraction')} (${clipboardCount})`" name="logs">
                <div class="logs-clipboard">
                  <div v-if="(clipboardEntries.length>0) || clipboardContent">
                    <div class="clipboard-thumbnail" @click="clipboardDetailVisible = true">
                      <div class="thumb-row">
                        <el-icon><DocumentCopy /></el-icon>
                        <span class="thumb-label">{{ $t('batchAnalysis.logClipboard') }}</span>
                      </div>
                      <div class="fill-bar">
                        <div class="fill-bar-inner" :style="{ width: fillPercent + '%' }"></div>
                        <div class="fill-bar-text">{{ clipboardCount }}/{{ maxClipboardEntries }}</div>
                      </div>
                      <el-button class="delete-btn" text circle @click.stop="clearClipboard">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </div>
                  <el-empty v-else :description="$t('batchAnalysis.noClipboardLogs')" />
                </div>
              </el-tab-pane>
              <el-tab-pane :label="`${$t('batchAnalysis.visualization')} (${chartThumbnails.length})`" name="charts">
            <div class="chart-thumbnails" v-if="chartThumbnails.length > 0">
              <div class="thumbnail-list">
                <div 
                  v-for="chart in chartThumbnails" 
                  :key="chart.id"
                  class="chart-thumbnail-item"
                  @click="showChartDetail(chart)"
                >
                  <div class="thumbnail-title">{{ chart.title }}</div>
                  <div class="thumbnail-chart" :id="`chart-thumb-${chart.id}`"></div>
                  <div class="thumbnail-info">
                    <div class="thumbnail-time">{{ formatTimestampWithTimezone(chart.timestamp, displayTimezoneOffsetMinutes) || formatTimestamp(chart.timestamp) }}</div>
                  </div>
                  <el-button 
                    size="small" 
                    text
                    circle 
                    class="thumbnail-delete-btn"
                    @click.stop="deleteChartThumbnail(chart.id)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
                <el-empty v-else :description="$t('shared.noData')" />
              </el-tab-pane>
            </el-tabs>
          </div>
        </el-drawer>

        <el-dialog v-model="clipboardDetailVisible" :title="$t('batchAnalysis.logClipboard')" width="700px">
          <div class="clipboard-detail">
            <el-input
              type="textarea"
              v-model="clipboardContent"
              :autosize="{ minRows: 12, maxRows: 24 }"
              class="clipboard-textarea"
              :placeholder="$t('batchAnalysis.editClipboardPlaceholder')"
            />
          </div>
          <template #footer>
            <div class="dialog-footer">
              <el-button class="btn-secondary" @click="clearClipboard" :disabled="!clipboardContent">{{ $t('shared.clear') }}</el-button>
              <el-button class="btn-primary" @click="exportClipboardToTxt" :disabled="!clipboardContent">{{ $t('shared.export') }}TXT</el-button>
            </div>
          </template>
        </el-dialog>

        

        

        <!-- 图表详情弹窗 -->
        <el-dialog
          v-model="chartDetailVisible"
          :title="$t('batchAnalysis.visualizationChartTitle')"
          width="56%"
          class="chart-detail-dialog"
          :close-on-click-modal="true"
          @opened="onChartDialogOpened"
        >
          <div class="chart-detail">
            <div class="dialog-subtitle">{{ chartTitle }}</div>
            <div class="chart-container" ref="chartContainer">
              <TimeSeriesChart
                v-if="currentChartData && Array.isArray(currentChartData.data) && currentChartData.data.length > 0"
                :series-data="currentChartData.data"
                :series-name="currentChartData.parameterValue || $t('batchAnalysis.visualizationDataDefault')"
                :height="chartDetailHeight"
                :show-range-labels="false"
                :timezone-offset-minutes="displayTimezoneOffsetMinutes"
              />
              <div v-else class="chart-no-data">{{ $t('batchAnalysis.visualizationNoDataText') }}</div>
            </div>
          </div>
        </el-dialog>
        </div>
      </div>
      </el-card>
    </div>

    <!-- 手术数据比对对话框 -->
    <SurgeryDataCompare
      v-model="showCompareDialog"
      :surgery-id="compareData.surgeryId"
      :existing-data="compareData.existingData"
      :new-data="compareData.newData"
      :differences="compareData.differences"
      :text-diff="compareData.textDiff || ''"
      :surgery-data="compareData.surgeryData"
      :allow-keep-existing="Number(compareData.pendingExportId || 0) > 0"
      :pending-export-id="compareData.pendingExportId || null"
      :full-data-included="compareData.fullDataIncluded === true"
      @confirmed="showCompareDialog = false"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, h, resolveComponent, watch } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Download, ArrowLeft, DataAnalysis, Warning, DocumentCopy, View, Edit, Delete, InfoFilled, TrendCharts, Filter, Operation } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import TimeSeriesChart from '@/components/TimeSeriesChart.vue'
import SurgeryDataCompare from '@/components/SurgeryDataCompare.vue'
import api from '@/api'
import { visualizeSurgery as visualizeSurgeryData } from '@/utils/visualizationHelper'
import { formatTime, formatTimeShort, loadServerTimezone } from '../utils/timeFormatter'
import { useI18n } from 'vue-i18n'

export default {
  name: 'BatchAnalysis',
  components: {
    Search,
    Download,
    ArrowLeft,
    DataAnalysis,
    Warning,
    TrendCharts,
    Filter,
    Operation,
    TimeSeriesChart,
    SurgeryDataCompare,
    ExplanationCell: {
      name: 'ExplanationCell',
      props: {
        text: { type: String, default: '' },
        showTitle: { type: Boolean, default: true } // 由外层 el-tooltip 提供提示时传 false，避免双 tooltip
      },
      setup(props) {
        return () => h('span', {
          class: 'explanation-ellipsis',
          title: props.showTitle ? props.text : undefined,
          style: 'display:inline-block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;color:var(--slate-600);'
        }, props.text)
      }
    },
    ConditionGroup: {
      name: 'ConditionGroup',
      props: {
        group: { type: Object, required: true },
        getOperatorOptions: { type: Function, required: true },
        onFieldChange: { type: Function, required: true },
        onOperatorChange: { type: Function, required: true },
        addConditionToGroup: { type: Function, required: true },
        addGroupToGroup: { type: Function, required: true },
        removeNodeAt: { type: Function, required: true },
        isRoot: { type: Boolean, default: false }
      },
      setup(props) {
        const { t } = useI18n()
        const ElSelect = resolveComponent('el-select')
        const ElOption = resolveComponent('el-option')
        const ElInput = resolveComponent('el-input')
        const ElButton = resolveComponent('el-button')
        const ElRadioGroup = resolveComponent('el-radio-group')
        const ElRadioButton = resolveComponent('el-radio-button')
        const Self = resolveComponent('ConditionGroup')

        const renderCondition = (node, idx, parent) => {
          return h('div', { class: 'condition', key: idx }, [
            h(ElSelect, {
              modelValue: node.field,
              style: 'width: 140px;',
              placeholder: t('batchAnalysis.field'),
              'onUpdate:modelValue': (v) => { 
                // 确保node是一个对象，而不是原始类型
                if (typeof node === 'object' && node !== null) {
                  node.field = v; 
                  props.onFieldChange(node)
                } else {
                  // 如果node是原始类型，需要重新创建对象
                  Object.assign(node, { field: v })
                  props.onFieldChange(node)
                }
              }
            }, {
              default: () => [
                h(ElOption, { label: t('batchAnalysis.timestamp'), value: 'timestamp' }),
                h(ElOption, { label: t('batchAnalysis.errorCode'), value: 'error_code' }),
                h(ElOption, { label: t('batchAnalysis.param1'), value: 'param1' }),
                h(ElOption, { label: t('batchAnalysis.param2'), value: 'param2' }),
                h(ElOption, { label: t('batchAnalysis.param3'), value: 'param3' }),
                h(ElOption, { label: t('batchAnalysis.param4'), value: 'param4' }),
                h(ElOption, { label: t('batchAnalysis.explanation'), value: 'explanation' })
              ]
            }),
            h(ElSelect, {
              modelValue: node.operator,
              style: 'width: 150px; margin-left: 8px;',
              placeholder: t('batchAnalysis.operator'),
              'onUpdate:modelValue': (v) => { 
                // 确保node是一个对象，而不是原始类型
                if (typeof node === 'object' && node !== null) {
                  node.operator = v; 
                  props.onOperatorChange(node)
                } else {
                  // 如果node是原始类型，需要重新创建对象
                  Object.assign(node, { operator: v })
                  props.onOperatorChange(node)
                }
              }
            }, {
              default: () => (props.getOperatorOptions(node.field) || []).map(op => h(ElOption, { label: op.label, value: op.value, key: op.value }))
            }),
            node.operator === 'between'
              ? [
                  h(ElInput, {
                    modelValue: Array.isArray(node.value) ? node.value[0] : '',
                    placeholder: '起',
                    style: 'width: 140px; margin-left:8px;',
                    'onUpdate:modelValue': (v) => { 
                      const arr = Array.isArray(node.value) ? node.value.slice(0,2) : ['', '']; 
                      arr[0] = v; 
                      node.value = arr 
                    }
                  }),
                  h(ElInput, {
                    modelValue: Array.isArray(node.value) ? node.value[1] : '',
                    placeholder: '止',
                    style: 'width: 140px; margin-left:8px;',
                    'onUpdate:modelValue': (v) => { 
                      const arr = Array.isArray(node.value) ? node.value.slice(0,2) : ['', '']; 
                      arr[1] = v; 
                      node.value = arr 
                    }
                  })
                ]
              : h(ElInput, {
                  modelValue: Array.isArray(node.value) ? node.value.join(',') : (node.value ?? ''),
                  placeholder: t('batchAnalysis.value'),
                  style: 'width: 300px; margin-left:8px;',
                  'onUpdate:modelValue': (v) => { 
                    // 确保node.value是一个对象，而不是原始类型
                    if (typeof node.value === 'object' && node.value !== null) {
                      node.value = v
                    } else {
                      // 如果node.value是原始类型，需要重新创建对象
                      Object.assign(node, { value: v })
                    }
                  }
                }),
            h(ElButton, { text: true, size: 'small', class: 'btn-danger-text', style: 'margin-left:8px;', onClick: () => props.removeNodeAt(parent, idx) }, { default: () => t('shared.delete') })
          ])
        }

        const renderGroup = (group, parent, depth = 0) => {
          const children = Array.isArray(group.conditions) ? group.conditions : []
          const style = depth > 0 ? `margin-left: ${depth * 12}px;` : ''
          return h('div', { class: 'group-box', style }, [
            ...children.map((node, idx) => {
              if (node && node.field) {
                return renderCondition(node, idx, group)
              }
              return h('div', { class: 'group-box', key: idx, style: `margin-left: ${(depth + 1) * 12}px;` }, [
                h('div', { class: 'group-header nested' }, [
                  h('span', null, t('batchAnalysis.groupLogic') + '：'),
                  h(ElRadioGroup, {
                    modelValue: node.logic || 'AND',
                    'onUpdate:modelValue': (v) => { 
                      // 确保node是一个对象，而不是原始类型
                      if (typeof node === 'object' && node !== null) {
                        node.logic = v
                      } else {
                        // 如果node是原始类型，需要重新创建对象
                        Object.assign(node, { logic: v })
                      }
                    }
                  }, {
                    default: () => [
                      h(ElRadioButton, { label: 'AND' }, { default: () => 'AND' }),
                      h(ElRadioButton, { label: 'OR' }, { default: () => 'OR' })
                    ]
                  }),
                  h('div', { class: 'group-actions' }, [
                    h(ElButton, { size: 'small', class: 'btn-secondary btn-sm', onClick: () => props.addConditionToGroup(node) }, { default: () => t('batchAnalysis.addCondition') }),
                    h(ElButton, { size: 'small', class: 'btn-secondary btn-sm', onClick: () => props.addGroupToGroup(node) }, { default: () => t('batchAnalysis.addGroup') }),
                    h(ElButton, { text: true, size: 'small', class: 'btn-danger-text', onClick: () => props.removeNodeAt(group, idx) }, { default: () => t('batchAnalysis.deleteGroup') })
                  ])
                ]),
                h(Self, {
                  group: node,
                  getOperatorOptions: props.getOperatorOptions,
                  onFieldChange: props.onFieldChange,
                  onOperatorChange: props.onOperatorChange,
                  addConditionToGroup: props.addConditionToGroup,
                  addGroupToGroup: props.addGroupToGroup,
                  removeNodeAt: props.removeNodeAt
                , depth: (depth + 1) })
              ])
            }),
            h('div', { class: 'group-actions' }, [
              h(ElButton, { size: 'small', class: 'btn-secondary btn-sm', onClick: () => props.addConditionToGroup(group) }, { default: () => t('batchAnalysis.addCondition') }),
              h(ElButton, { size: 'small', class: 'btn-secondary btn-sm', onClick: () => props.addGroupToGroup(group) }, { default: () => t('batchAnalysis.addGroup') })
            ])
          ])
        }

        return () => renderGroup(props.group, props.group, 0)
      }
    }
  },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    const { t, locale } = useI18n()
    
    const loading = ref(false)
    const filterDrawerVisible = ref(false)
    const filterSidebarActiveTab = ref('level')
    const selectedLogs = ref([])
    const batchLogEntries = ref([])
    const searchKeyword = ref('')
    const timeRange = ref(null)
    // 时区显示：日志按原时区存储，检索时使用转换前的时间；此处选中的时区仅影响前端显示
    const displayTimezoneOffsetMinutes = ref(480) // 480 = 与当前默认原时区一致，无转换
    const timezoneOptions = [
      840, 780, 720, 765, 660, 630, 600, 570, 540, 525, 480, 420, 390, 360, 345, 330, 300, 270, 240, 210, 180, 120, 60, 0, -60, -120, -180, -210, -240, -300, -360, -420, -480, -540, -570, -600, -660, -720
    ].map((value) => ({
      value,
      labelKey: `batchAnalysis.timezoneOptions.${value}`
    }))
    const currentPage = ref(1)
    const pageSize = ref(50)
    const totalCount = ref(0)
    const totalPages = ref(0)
    // 全量时间范围（来自后端聚合），用于限制时间选择器
    const globalMinTs = ref(null)
    const globalMaxTs = ref(null)
    const advancedMode = ref(false)
    // 已移除虚拟化表格，使用后端分页
    
    // 上下文分析相关
    const contextAnalysisVisible = ref(false)
    const contextAnalysisRow = ref(null)
    const beforeMinutes = ref(5)
    const afterMinutes = ref(5)
    const beforeSeconds = ref(0)
    const afterSeconds = ref(0)

    // 日志摘取相关
    const clipboardVisible = ref(false)
    const clipboardEntries = ref([])
    const maxClipboardEntries = 50
    const clipboardContent = ref('')
    const clipboardDetailVisible = ref(false)
    const sidebarActiveTab = ref('logs')
    const clipboardCount = computed(() => {
      if (clipboardEntries.value.length > 0) return clipboardEntries.value.length
      if (!clipboardContent.value) return 0
      return clipboardContent.value.split(/\r?\n/).filter(line => line.trim().length > 0).length
    })
    const fillPercent = computed(() => {
      const cnt = clipboardCount.value
      const pct = (cnt / maxClipboardEntries) * 100
      return Math.max(0, Math.min(100, Math.round(pct)))
    })

    // 可视化相关
    const parameterSelectVisible = ref(false)
    const activeColorPopoverRowId = ref(null)
    const headerColorPopoverVisible = ref(false)
    const activeNotesPopoverRowId = ref(null)
    const hoveredNameRowId = ref(null)
    const activeParamPopoverRowId = ref(null)
    const selectedParameter = ref(null)
    const paramNamesLoading = ref(false)
    const availableParameters = ref([])
    const paramAvailability = ref([false, false, false, false])
    const paramNames = ref(['参数1', '参数2', '参数3', '参数4'])
    const selectKey = ref(0)
    const currentVisualizationRow = ref(null)
    const chartDetailVisible = ref(false)
    const chartTitle = ref('')
    const chartContainer = ref(null)
    const chartDetailHeight = ref(450)
    const chartInstance = ref(null)
    const chartThumbnails = ref([])
    const currentChartData = ref(null)
    
    // 计数功能相关
    const logCounts = ref({}) // 存储日志出现次数
    const errorCodeCounts = ref({}) // 存储故障码出现次数
    // 分析等级（预置维度）
    const analysisCategories = ref([])
    const analysisPresets = ref({ ALL: [], FINE: [], KEY: [] })
    const selectedAnalysisCategoryIds = ref([])
    const categorySearchKeyword = ref('')
    
    // 根据搜索关键词过滤分析分类（用于列表展示与“全选”范围）
    const filteredCategoriesForLevel = computed(() => {
      const list = analysisCategories.value || []
      const kw = (categorySearchKeyword.value || '').trim().toLowerCase()
      if (!kw) return list
      return list.filter(c => {
        const name = (getCategoryDisplayName(c) || '').toLowerCase()
        return name.includes(kw)
      })
    })
    
    // 计算当前语言
    const currentLocale = computed(() => locale.value || 'zh-CN')
    
    // 根据当前语言获取分析分类的显示名称
    const getCategoryDisplayName = (cat) => {
      if (!cat) return ''
      return currentLocale.value === 'zh-CN' ? (cat.name_zh || cat.name_en) : (cat.name_en || cat.name_zh)
    }
    
    const sameSet = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b)) return false
      if (a.length !== b.length) return false
      const sa = new Set(a)
      for (const x of b) if (!sa.has(x)) return false
      return true
    }
    const analysisLevelLabel = computed(() => {
      const ids = selectedAnalysisCategoryIds.value
      if (!ids || ids.length === 0) return t('batchAnalysis.analysisLevelNotSelected')
      const allEq = sameSet(ids, analysisPresets.value.ALL)
      const fineEq = sameSet(ids, analysisPresets.value.FINE)
      const keyEq = sameSet(ids, analysisPresets.value.KEY)
      if (allEq) return t('batchAnalysis.fullLogs')
      if (fineEq) return t('batchAnalysis.detailedLogs')
      if (keyEq) return t('batchAnalysis.keyLogs')
      return t('batchAnalysis.custom')
    })

    const loadAnalysisPresets = async () => {
      const [cats, presetsRes] = await Promise.all([
        api.analysisCategories.getList({ is_active: true }),
        api.analysisCategories.getPresets()
      ])
      analysisCategories.value = cats.data.categories || []
      const presets = (presetsRes.data?.presets) || { ALL: [], FINE: [], KEY: [] }
      analysisPresets.value = presets
      // 默认显示全量日志，不再根据用户/角色映射
      const presetKey = 'ALL'
      if (presets[presetKey] && presets[presetKey].length >= 0) {
        selectedAnalysisCategoryIds.value = [...(presets[presetKey] || [])]
      } else {
        selectedAnalysisCategoryIds.value = [...(presets.ALL || [])]
      }
    }

    const isPresetActive = (key) => {
      if (!analysisPresets.value[key]) return false
      return sameSet(selectedAnalysisCategoryIds.value, analysisPresets.value[key])
    }
    // 当前为“自定义”等级（已选分类且不等于任一预设）
    const isCustomLevel = computed(() => {
      const ids = selectedAnalysisCategoryIds.value
      if (!ids || ids.length === 0) return false
      return !isPresetActive('ALL') && !isPresetActive('FINE') && !isPresetActive('KEY')
    })

    const applyPreset = (key) => {
      if (!analysisPresets.value[key]) return
      selectedAnalysisCategoryIds.value = [...analysisPresets.value[key]]
      onAnalysisCategoriesChange()
    }

    const levelChipOptions = computed(() => [
      { key: 'ALL', label: t('batchAnalysis.fullLogs') },
      { key: 'FINE', label: t('batchAnalysis.detailedLogs') },
      { key: 'KEY', label: t('batchAnalysis.keyLogs') },
      { key: 'CUSTOM', label: t('batchAnalysis.custom') }
    ])
    // 当前选中的预设 key（与 Logs.vue quick-range 一致，用于 el-radio-group）
    const levelPresetKey = computed({
      get () {
        if (isPresetActive('ALL')) return 'ALL'
        if (isPresetActive('FINE')) return 'FINE'
        if (isPresetActive('KEY')) return 'KEY'
        return 'CUSTOM'
      },
      set (key) {
        if (key !== 'CUSTOM') applyPreset(key)
      }
    })
    const onLevelPresetChange = (key) => {
      if (key !== 'CUSTOM') applyPreset(key)
    }

    // 侧边栏待提交：等级预设（仅改 pending，不请求）
    const isPresetActivePending = (key) => {
      if (!analysisPresets.value[key]) return false
      return sameSet(pendingSelectedAnalysisCategoryIds.value, analysisPresets.value[key])
    }
    const pendingLevelPresetKey = computed(() => {
      if (isPresetActivePending('ALL')) return 'ALL'
      if (isPresetActivePending('FINE')) return 'FINE'
      if (isPresetActivePending('KEY')) return 'KEY'
      return 'CUSTOM'
    })
    const applyPresetPending = (key) => {
      if (!analysisPresets.value[key]) return
      pendingSelectedAnalysisCategoryIds.value = [...(analysisPresets.value[key] || [])]
    }

    // UI: 自定义子系统筛选开关（仅影响侧边栏交互，不改变检索格式）
    const customSubsystemActive = ref(false)
    const filterSidebarBodyRef = ref(null)
    const customSectionRef = ref(null)
    const scrollCustomSectionToCenter = () => {
      const container = filterSidebarBodyRef.value
      const target = customSectionRef.value
      if (!container || !target) return
      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const targetCenterInView = targetRect.top - containerRect.top + targetRect.height / 2
      const containerCenter = container.clientHeight / 2
      const delta = targetCenterInView - containerCenter
      container.scrollTop = Math.max(0, container.scrollTop + delta)
    }
    watch(customSubsystemActive, (val) => {
      if (val) nextTick(scrollCustomSectionToCenter)
    })
    const onSelectLevelCard = (key) => {
      customSubsystemActive.value = false
      applyPresetPending(key)
    }
    // 全选：将当前筛选出的分类全部选中（仅改 pending）
    const selectAllCategories = () => {
      const list = filteredCategoriesForLevel.value
      if (list.length === 0) return
      pendingSelectedAnalysisCategoryIds.value = list.map(c => c.id)
    }
    // 清空选择（仅改 pending）
    const clearCategorySelection = () => {
      pendingSelectedAnalysisCategoryIds.value = []
    }
    // Chip 点击：切换该分类的选中状态（仅改 pending）
    const toggleCategoryChip = (c) => {
      const ids = pendingSelectedAnalysisCategoryIds.value
      const has = ids.includes(c.id)
      if (has) {
        pendingSelectedAnalysisCategoryIds.value = ids.filter(id => id !== c.id)
      } else {
        pendingSelectedAnalysisCategoryIds.value = [...ids, c.id]
      }
    }

    const onAnalysisCategoriesChange = () => {
      loadBatchLogEntries(1, true)
    }
    const globalErrorCodeCounts = ref({}) // 存储全局故障码统计（无筛选条件）
    const filteredErrorCodeCounts = ref({}) // 存储筛选条件下的故障码统计
    const statisticsCache = ref({}) // 统计缓存，避免重复请求
    // 基于当前筛选条件构建统计缓存键，确保显示与当前条件一致的统计
    const currentStatisticsKey = computed(() => {
      const logIds = selectedLogs.value.map(l => l.id).join(',')
      const params = { log_ids: logIds }
      if (advancedMode.value && leafConditionCount.value > 0) {
        const filtersPayload = buildFiltersPayload()
        if (filtersPayload) params.filters = JSON.stringify(filtersPayload)
      }
      if (timeRange.value && timeRange.value.length === 2) {
        params.start_time = timeRange.value[0]
        params.end_time = timeRange.value[1]
      }
      if (searchKeyword.value) {
        params.search = searchKeyword.value
      }
      try {
        return JSON.stringify(params)
      } catch (_) {
        return ''
      }
    })
    const showStatisticsForErrorCode = ref(null) // 控制显示哪个故障码的统计
    
    // 从后端获取全局统计信息（无筛选条件）
    const fetchGlobalStatistics = async () => {
      try {
        const params = {
          log_ids: selectedLogs.value.map(l => l.id).join(',')
        }

        // 重要：统计查询必须带时间范围，否则 ClickHouse 需要扫全分区/冷数据，容易触发 OOM/连接重置
        if (timeRange.value && timeRange.value.length === 2) {
          params.start_time = timeRange.value[0]
          params.end_time = timeRange.value[1]
        } else {
          // timeRange 尚未初始化（通常会由明细接口返回的 min/max 自动回填），这里先跳过
          return
        }
        
        console.log('获取全局统计信息，参数:', params)
        const response = await api.logs.getStatistics(params)
        
        if (response.data.success) {
          globalErrorCodeCounts.value = response.data.errorCodeCounts || {}
          
          // 存储到sessionStorage
          try {
            sessionStorage.setItem('globalErrorCodeCounts', JSON.stringify(globalErrorCodeCounts.value))
            sessionStorage.setItem('globalStatisticsTimestamp', Date.now().toString())
          } catch (error) {
            console.warn('存储全局统计信息失败:', error)
          }
          
          console.log('全局统计信息获取成功:', {
            globalErrorCodeCounts: Object.keys(globalErrorCodeCounts.value).length,
            sample: Object.keys(globalErrorCodeCounts.value).slice(0, 3)
          })
        } else {
          console.warn('全局统计API返回失败:', response.data)
        }
      } catch (error) {
        console.error('获取全局统计信息失败:', error)
        globalErrorCodeCounts.value = {}
      }
    }

    // 从后端获取筛选条件下的统计信息
    const fetchFilteredStatistics = async () => {
      try {
        // 构建查询参数，与loadBatchLogEntries完全一致
        const logIds = selectedLogs.value.map(l => l.id).join(',')
        const params = {
          log_ids: logIds
        }
        
        // 添加高级筛选条件（与loadBatchLogEntries保持一致）
        if (advancedMode.value && leafConditionCount.value > 0) {
          const filtersPayload = buildFiltersPayload()
          if (filtersPayload) {
            params.filters = JSON.stringify(filtersPayload)
          }
        }
        
        // 添加时间范围筛选（与loadBatchLogEntries保持一致）
        if (timeRange.value && timeRange.value.length === 2) {
          params.start_time = timeRange.value[0]
          params.end_time = timeRange.value[1]
        }
        
        // 添加关键词搜索（与loadBatchLogEntries保持一致）
        if (searchKeyword.value) {
          params.search = searchKeyword.value
        }
        
        // 生成缓存键
        const cacheKey = JSON.stringify(params)
        
        // 检查缓存
        if (statisticsCache.value[cacheKey]) {
          filteredErrorCodeCounts.value = statisticsCache.value[cacheKey]
          return
        }
        
        
        const response = await api.logs.getStatistics(params)
        
        if (response.data.success) {
          const newFilteredCounts = response.data.errorCodeCounts || {}
          filteredErrorCodeCounts.value = newFilteredCounts
          
          // 更新缓存
          statisticsCache.value[cacheKey] = newFilteredCounts
          
          // 存储到sessionStorage
          try {
            sessionStorage.setItem('filteredErrorCodeCounts', JSON.stringify(newFilteredCounts))
            sessionStorage.setItem('filteredStatisticsTimestamp', Date.now().toString())
            sessionStorage.setItem('statisticsCache', JSON.stringify(statisticsCache.value))
            sessionStorage.setItem('currentStatisticsKey', cacheKey)
          } catch (error) {
            console.warn('存储筛选统计信息失败:', error)
          }
          
          
          
        } else {
          console.warn('筛选统计API返回失败:', response.data)
        }
      } catch (error) {
        console.error('获取筛选统计信息失败:', error)
        filteredErrorCodeCounts.value = {}
      }
    }

    // 兼容性函数：保持原有接口
    const fetchStatisticsFromBackend = async () => {
      await fetchFilteredStatistics()
      // 为了兼容性，同时更新原有的变量
      errorCodeCounts.value = filteredErrorCodeCounts.value
      logCounts.value = filteredErrorCodeCounts.value
    }
    
    
    
    // 获取故障码出现次数（支持全局和筛选条件统计）
    const getErrorCodeCount = (errorCode, useGlobal = false) => {
      if (useGlobal) {
        return globalErrorCodeCounts.value[errorCode] || 0
      }
      // 当存在筛选条件时，优先使用与当前条件匹配的缓存项，避免显示过期/全局统计
      const key = currentStatisticsKey.value
      const source = (key && statisticsCache.value[key])
        ? statisticsCache.value[key]
        : filteredErrorCodeCounts.value
      return (source && source[errorCode]) ? source[errorCode] : 0
    }
    

    // 获取故障码统计显示文本
    const getErrorCodeCountDisplay = (errorCode) => {
      const globalCount = getErrorCodeCount(errorCode, true)
      const filteredCount = getErrorCodeCount(errorCode, false)
      
      // 如果没有筛选条件，显示全局统计
      if (!hasActiveFilters.value) {
        return globalCount > 0 ? globalCount.toString() : ''
      }
      
      // 有筛选条件时，显示筛选条件下的统计
      return filteredCount > 0 ? filteredCount.toString() : ''
    }

    // 检查是否有活跃的筛选条件
    const hasActiveFilters = computed(() => {
      const hasSearch = !!searchKeyword.value
      const hasAdvancedConditions = leafConditionCount.value > 0
      
      // 检查时间范围是否是用户主动设置的（而不是系统自动设置的完整范围）
      const hasUserTimeRange = !!(timeRange.value && timeRange.value.length === 2 && 
        timeRangeLimit.value && 
        (timeRange.value[0] !== getStorageTimeString(timeRangeLimit.value[0]) || 
         timeRange.value[1] !== getStorageTimeString(timeRangeLimit.value[1])))
      
      return !!(hasSearch || hasUserTimeRange || hasAdvancedConditions)
    })
    
    // 从sessionStorage加载计数数据
    const loadCountsFromStorage = () => {
      try {
        // 加载全局统计
        const globalErrorCodeCountsData = sessionStorage.getItem('globalErrorCodeCounts')
        if (globalErrorCodeCountsData) {
          globalErrorCodeCounts.value = JSON.parse(globalErrorCodeCountsData)
        }
        
        // 加载统计缓存
        const statisticsCacheData = sessionStorage.getItem('statisticsCache')
        if (statisticsCacheData) {
          statisticsCache.value = JSON.parse(statisticsCacheData)
        }
        // 仅当缓存键与当前筛选键一致时，才回填筛选统计，避免显示错误的（例如全局）结果
        const storedKey = sessionStorage.getItem('currentStatisticsKey')
        if (storedKey && storedKey === currentStatisticsKey.value) {
          const filteredErrorCodeCountsData = sessionStorage.getItem('filteredErrorCodeCounts')
          if (filteredErrorCodeCountsData) {
            filteredErrorCodeCounts.value = JSON.parse(filteredErrorCodeCountsData)
          }
        } else {
          filteredErrorCodeCounts.value = {}
        }
        
        // 兼容性：加载原有数据
        const logCountsData = sessionStorage.getItem('logCounts')
        if (logCountsData) {
          logCounts.value = JSON.parse(logCountsData)
        }
        
        const errorCodeCountsData = sessionStorage.getItem('errorCodeCounts')
        if (errorCodeCountsData) {
          errorCodeCounts.value = JSON.parse(errorCodeCountsData)
        }
        
        console.log('从sessionStorage加载统计数据成功:', {
          globalCount: Object.keys(globalErrorCodeCounts.value).length,
          filteredCount: Object.keys(filteredErrorCodeCounts.value).length,
          cacheCount: Object.keys(statisticsCache.value).length
        })
      } catch (error) {
        console.warn('加载计数数据失败:', error)
      }
    }
    
    

    // 切换故障码统计显示
    const toggleErrorCodeStatistics = async (errorCode) => {
      if (showStatisticsForErrorCode.value === errorCode) {
        // 如果点击的是当前显示的故障码，则隐藏
        showStatisticsForErrorCode.value = null
      } else {
        // 显示新的故障码统计
        showStatisticsForErrorCode.value = errorCode
        
        // 如果有筛选条件，确保使用最新的筛选统计
        if (hasActiveFilters.value) {
          console.log('有筛选条件，重新获取筛选统计...')
          await fetchFilteredStatistics()
        }
      }
    }

    // 显示故障码统计信息（用于消息提示）
    const showErrorCodeStatistics = (errorCode) => {
      const globalCount = getErrorCodeCount(errorCode, true)
      const filteredCount = getErrorCodeCount(errorCode, false)
      
      let message = `故障码 ${errorCode} 统计信息：\n`
      message += `全局出现次数：${globalCount}\n`
      
      if (hasActiveFilters.value) {
        message += `筛选条件下出现次数：${filteredCount}`
      } else {
        message += `当前无筛选条件，显示全局统计`
      }
      
      ElMessage.info({
        message: message,
        duration: 3000,
        showClose: true
      })
    }

    // 获取故障码统计提示信息
    const getErrorCodeStatisticsTooltip = (errorCode) => {
      const globalCount = getErrorCodeCount(errorCode, true)
      const filteredCount = getErrorCodeCount(errorCode, false)
      
      if (hasActiveFilters.value) {
        return `全局：${globalCount} 次，筛选后：${filteredCount} 次`
      } else {
        return `全局出现 ${globalCount} 次`
      }
    }
    
    // 颜色选项：红、黄、蓝、绿（各加深一档）
    const colorOptions = ref([
      { value: '#C39BD3', label: '红色' },
      { value: '#A8E6CF', label: '黄色' },
      { value: '#F9E79F', label: '蓝色' },
      { value: '#AED6F1', label: '绿色' },
      { value: null, label: '无' }
    ])
    // 表格列配置（仅用于传统表格）
    const tableColumns = ref([
      { prop: 'color_mark', label: '标记' },
      { prop: 'file_info', label: '时间戳/文件名' },
      { prop: 'error_code', label: '故障码' },
      { prop: 'explanation', label: '释义' },
      { prop: 'parameters', label: '参数(1~4)' },
      { prop: 'operations', label: '操作' }
    ])

    // 高级筛选条件
    const filtersRoot = ref({ logic: 'AND', conditions: [] })

    // 侧边栏待提交状态：仅点「应用」后才写入 applied 并请求列表
    const deepCloneFilters = (node) => {
      if (!node) return null
      if (node.field && node.operator) {
        const val = node.value
        const out = {
          field: node.field,
          operator: node.operator,
          value: Array.isArray(val) ? [...val] : val
        }
        if (node.negate !== undefined) out.negate = !!node.negate
        return out
      }
      if (Array.isArray(node.conditions)) {
        return {
          logic: node.logic || 'AND',
          conditions: node.conditions.map(deepCloneFilters).filter(Boolean)
        }
      }
      return { logic: 'AND', conditions: [] }
    }

    // 完整故障码：7 位十六进制，首位 [1-9A]，后 6 位 [0-9A-F]
    const isCompleteErrorCode = (v) => {
      const s = (v != null ? String(v).trim() : '').toUpperCase()
      return s.length === 7 && /^[1-9A][0-9A-F]{6}$/.test(s)
    }

    // 递归规范化 error_code：等于/包含 → 完整码用 eq、非完整用 contains；排除 → 完整码用 !=、非完整用 notcontains（不包含）
    const normalizeErrorCodeOperatorInFilters = (root) => {
      if (!root) return
      if (root.field === 'error_code' && root.operator !== undefined) {
        const op = String(root.operator).toLowerCase()
        const complete = isCompleteErrorCode(root.value)
        if (op === '!=' || op === '<>') {
          root.operator = complete ? '!=' : 'notcontains'
          return
        }
        if (op === 'notcontains') return
        root.operator = complete ? '=' : 'contains'
        return
      }
      if (Array.isArray(root.conditions)) {
        root.conditions.forEach(normalizeErrorCodeOperatorInFilters)
      }
    }
    const pendingFiltersRoot = ref({ logic: 'AND', conditions: [] })
    const pendingSelectedAnalysisCategoryIds = ref([])
    const pendingDisplayTimezoneOffsetMinutes = ref(480)
    
    // 手术统计相关
    const surgeryStatisticsVisible = ref(false)
    const surgeryData = ref(null)
    const analyzing = ref(false)
    const templates = ref([])
    const selectedTemplateName = ref('')
    const importExpressionText = ref('')

    // Saved expressions preview (compact text)
    const templatePreviewMap = computed(() => {
      const map = {}
      const list = Array.isArray(templates.value) ? templates.value : []
      for (const tpl of list) {
        const node = tpl?.filters || null
        map[tpl.name] = node ? groupToString(node, displayTimezoneOffsetMinutes.value) : ''
      }
      return map
    })

    const selectTemplateCard = (name) => {
      const v = String(name || '').trim()
      if (!v) return
      selectedTemplateName.value = v
      applySelectedTemplate()
    }

    // Natural language → (search/filters/start_time/end_time)；追问时对话形式 + 单行输入
    const nlQuery = ref('')
    const nlGenerating = ref(false)
    const nlSpec = ref(null)
    const nlConversationMessages = ref([])
    const nlInputLine = ref('')
    const nlAnswers = ref([])
    const nlAppliedActions = ref([])
    const pendingNlActions = ref([])
    const nlPreviewCleared = ref(false)

    // 与颜色标记功能同源：仅使用 colorOptions 中的颜色，默认第一个（紫色）
    const markColorOptions = computed(() => (colorOptions.value || []).filter((c) => c && c.value != null))
    const defaultMarkColor = computed(() => markColorOptions.value[0]?.value ?? '#C39BD3')
    // NL 1.1.0 颜色名映射到现有四种选项的 hex（与 colorOptions 的 value 一致：红/黄/蓝/绿），保证标色与前端打勾一致
    const NL_COLOR_NAME_MAP = { yellow: '#A8E6CF', purple: '#C39BD3', green: '#AED6F1', blue: '#F9E79F', red: '#C39BD3' }
    const resolveMarkColor = (mark) => {
      if (!mark) return defaultMarkColor.value
      const raw = mark.color != null ? String(mark.color).trim().toLowerCase() : ''
      if (!raw) return defaultMarkColor.value
      if (raw.startsWith('#')) {
        const found = markColorOptions.value.find((c) => c.value && c.value.toLowerCase() === raw.toLowerCase())
        return found ? found.value : defaultMarkColor.value
      }
      const mappedHex = NL_COLOR_NAME_MAP[raw]
      if (mappedHex) {
        const found = markColorOptions.value.find((c) => c.value && c.value.toLowerCase() === mappedHex.toLowerCase())
        return found ? found.value : defaultMarkColor.value
      }
      const hex = '#' + raw
      const found = markColorOptions.value.find((c) => c.value && c.value.toLowerCase() === hex.toLowerCase())
      return found ? found.value : defaultMarkColor.value
    }
    // 多 mark 支持：每个 mark 可有 field/value 限定范围，按顺序第一个匹配生效
    const nlMarkActions = computed(() => {
      const marks = (nlAppliedActions.value || []).filter((a) => a && a.type === 'mark')
      return marks.map((m) => {
        const scope = (m.field != null && m.value != null && String(m.value).trim())
          ? { field: String(m.field).trim() || 'error_code', value: String(m.value).trim() }
          : null
        return { colorHex: resolveMarkColor(m), scope }
      })
    })
    const rowMatchesMarkScope = (scope, row) => {
      if (!scope) return true
      const v = row[scope.field] != null ? String(row[scope.field]).trim() : ''
      return v.toLowerCase().includes(scope.value.toLowerCase()) || scope.value.toLowerCase().includes(v.toLowerCase())
    }
    // 统一使用 row.color_mark（手动 + NL mark 均写入此处）
    const getColorForRow = (row) => row.color_mark || null
    const nlHighlightTerms = computed(() => {
      const terms = []
      ;(nlAppliedActions.value || []).filter((a) => a && a.type === 'highlight').forEach((a) => {
        if (Array.isArray(a.terms)) terms.push(...a.terms)
      })
      return [...new Set(terms)]
    })
    // stats 只支持故障码，使用现有故障码统计（getErrorCodeCount / 后端筛选统计）
    const nlStatsActions = computed(() => {
      return (nlAppliedActions.value || []).filter((a) => a && a.type === 'stats' && (String(a.field || 'error_code').toLowerCase() === 'error_code'))
    })
    const nlStatsCounts = computed(() => {
      return nlStatsActions.value.map((s) => {
        const value = s.value != null ? String(s.value).trim() : ''
        let count = 0
        if (value) {
          count = getErrorCodeCount(value, false)
          if (count === 0) {
            const source = (currentStatisticsKey.value && statisticsCache.value[currentStatisticsKey.value])
              ? statisticsCache.value[currentStatisticsKey.value]
              : filteredErrorCodeCounts.value
            const vUpper = value.toUpperCase()
            if (source && typeof source === 'object') {
              count = Object.entries(source).reduce((sum, [k, c]) => {
                const kStr = String(k || '').toUpperCase()
                return sum + (kStr.includes(vUpper) || vUpper.includes(kStr) ? (Number(c) || 0) : 0)
              }, 0)
            }
          }
        }
        return { field: 'error_code', value: s.value, count }
      })
    })

    // 兼容后端返回：1) 数组 [ { field, op, value }, ... ]；2) NL 1.1.0 AST (type/group/children、type/condition、type/preset_ref)，规范为 { logic, conditions } 且保留 negate
    const normalizeNlResultFilters = (result, presetTemplates = null) => {
      if (!result || typeof result !== 'object') return
      const f = result.filters
      if (!f) return
      const mapNlOpToLegacy = (op) => {
        const v = String(op || '').toLowerCase()
        if (!v) return v
        if (v === 'eq') return '='
        if (v === 'gte') return '>='
        if (v === 'lte') return '<='
        return v
      }
      const list = presetTemplates && Array.isArray(presetTemplates) ? presetTemplates : []
      const astNodeToLegacy = (node) => {
        if (!node || typeof node !== 'object') return null
        if (node.type === 'group' && Array.isArray(node.children)) {
          const conditions = node.children.map(astNodeToLegacy).filter(Boolean)
          if (conditions.length === 0) return null
          return { logic: (node.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND', conditions }
        }
        if (node.type === 'condition' && node.field != null) {
          const op = mapNlOpToLegacy(node.op ?? node.operator)
          if (op == null) return null
          const out = { field: node.field, operator: op, value: node.value }
          if (node.negate !== undefined) out.negate = !!node.negate
          return out
        }
        if (node.type === 'preset_ref' && node.name) {
          const tpl = list.find((t) => t && t.name === node.name)
          const root = tpl?.filters
          if (!root) return null
          if (root.type === 'group' && Array.isArray(root.children)) return astNodeToLegacy(root)
          if (root.type === 'condition') return astNodeToLegacy(root)
          if (root.logic && Array.isArray(root.conditions)) return { logic: root.logic, conditions: root.conditions.map(astNodeToLegacy).filter(Boolean) }
          return null
        }
        if (node.field != null && node.operator != null) {
          const out = { field: node.field, operator: mapNlOpToLegacy(node.operator), value: node.value }
          if (node.negate !== undefined) out.negate = !!node.negate
          return out
        }
        if (Array.isArray(node.conditions) && node.logic) {
          const conditions = node.conditions.map(astNodeToLegacy).filter(Boolean)
          if (conditions.length === 0) return null
          return { logic: (node.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND', conditions }
        }
        return null
      }
      if (Array.isArray(f) && f.length > 0) {
        const conditions = f.map(astNodeToLegacy).filter(Boolean)
        if (conditions.length > 0) {
          result.filters = { logic: 'AND', conditions }
        }
        return
      }
      if (f.type === 'group' && Array.isArray(f.children)) {
        const converted = astNodeToLegacy(f)
        if (converted) result.filters = converted
        return
      }
      if (f.type === 'condition' && f.field != null) {
        const one = astNodeToLegacy(f)
        if (one) result.filters = { logic: 'AND', conditions: [one] }
        return
      }
      if (f.type === 'preset_ref' && f.name) {
        const one = astNodeToLegacy(f)
        if (one) result.filters = one.logic ? one : { logic: 'AND', conditions: [one] }
      }
    }

    const applyNlResult = (result) => {
      normalizeNlResultFilters(result, templates.value)
      const hasSearch = typeof result.search === 'string' && result.search.trim()
      const hasTime = !!(result.start_time && result.end_time)
      const hasFilters = !!(result.filters && (result.filters.conditions?.length > 0 || (result.filters.logic && result.filters.conditions)))

      if (hasSearch) searchKeyword.value = result.search.trim()
      if (hasTime) timeRange.value = [String(result.start_time), String(result.end_time)]
      if (result.filters && typeof result.filters === 'object') {
        pendingFiltersRoot.value = deepCloneFilters(result.filters)
        normalizeErrorCodeOperatorInFilters(pendingFiltersRoot.value)
      }
      // 仅当本次 NL 返回了 actions 时才覆盖；纯筛选（无 actions）时保留已有的 mark/highlight/stats
      if (Array.isArray(result.actions) && result.actions.length > 0) {
        pendingNlActions.value = [...result.actions]
      }
      nlPreviewCleared.value = false
      filterSidebarActiveTab.value = 'search'
      ElMessage.success(t('batchAnalysis.nlApplied'))
    }

    const cancelNlClarification = () => {
      nlSpec.value = null
      nlConversationMessages.value = []
      nlInputLine.value = ''
      nlAnswers.value = []
    }

    const clearNlAppliedActions = () => {
      nlAppliedActions.value = []
      pendingNlActions.value = []
    }

    const generateFilterExpression = async () => {
      const text = String(nlQuery.value || '').trim()
      if (!text) return
      nlGenerating.value = true
      nlPreviewCleared.value = true
      cancelNlClarification()
      try {
        const presetNames = (templates.value || []).map((t) => t && t.name).filter(Boolean)
        const limit = timeRangeLimit.value
        let logTimeRange = (limit && limit.length === 2 && getStorageTimeString(limit[0]) && getStorageTimeString(limit[1]))
          ? `${getStorageTimeString(limit[0])} ~ ${getStorageTimeString(limit[1])}`
          : ''
        if (!logTimeRange && timeRange.value && timeRange.value.length === 2) {
          const s0 = getStorageTimeString(timeRange.value[0])
          const s1 = getStorageTimeString(timeRange.value[1])
          if (s0 && s1) logTimeRange = `${s0} ~ ${s1}`
        }
        const resp = await api.logs.nlToBatchFilters({
          text,
          presetNames,
          context: logTimeRange ? { logTimeRange } : undefined
        })
        const result = resp?.data?.result || {}
        normalizeNlResultFilters(result, templates.value)
        const meta = result.meta || {}
        const status = meta.status || 'ok'

        const hasSearch = typeof result.search === 'string' && result.search.trim()
        const hasTime = !!(result.start_time && result.end_time)
        const hasFilters = !!(result.filters && (result.filters.conditions?.length > 0 || (result.filters.logic && result.filters.conditions)))
        const hasActions = Array.isArray(result.actions) && result.actions.length > 0

        if (status === 'need_clarification') {
          nlSpec.value = result
          nlConversationMessages.value = [
            { role: 'user', content: text },
            { role: 'assistant', content: (meta.explain || '') + (meta.questions?.length ? '\n\n' + meta.questions.map((q) => q.question).join('\n') : '') }
          ]
          nlInputLine.value = meta.questions?.[0]?.default || ''
          return
        }

        if (!hasSearch && !hasTime && !hasFilters && !hasActions) {
          ElMessage.warning(t('batchAnalysis.nlNoResult'))
          return
        }
        applyNlResult(result)
      } catch (e) {
        const status = e?.response?.status
        if (status === 503) {
          ElMessage.warning(t('batchAnalysis.llmUnavailable'))
        } else {
          ElMessage.error(t('batchAnalysis.nlFailed'))
        }
      } finally {
        nlGenerating.value = false
      }
    }

    const submitNlReply = async () => {
      const reply = String(nlInputLine.value || '').trim()
      if (!reply || !nlSpec.value) return
      const firstMessage = String(nlQuery.value || '').trim()
      const questions = nlSpec.value.meta?.questions || []
      const slot = questions[0]?.slot || 'time_range'
      const newAnswers = [...nlAnswers.value, { slot, value: reply }]

      nlGenerating.value = true
      try {
        const presetNames = (templates.value || []).map((t) => t && t.name).filter(Boolean)
        const limit = timeRangeLimit.value
        let logTimeRange = (limit && limit.length === 2 && getStorageTimeString(limit[0]) && getStorageTimeString(limit[1]))
          ? `${getStorageTimeString(limit[0])} ~ ${getStorageTimeString(limit[1])}`
          : ''
        if (!logTimeRange && timeRange.value && timeRange.value.length === 2) {
          const s0 = getStorageTimeString(timeRange.value[0])
          const s1 = getStorageTimeString(timeRange.value[1])
          if (s0 && s1) logTimeRange = `${s0} ~ ${s1}`
        }
        const resp = await api.logs.nlToBatchFilters({
          text: reply,
          presetNames,
          context: {
            firstMessage,
            previousResult: nlSpec.value,
            answers: newAnswers,
            ...(logTimeRange ? { logTimeRange } : {})
          }
        })
        const result = resp?.data?.result || {}
        normalizeNlResultFilters(result, templates.value)
        const meta = result.meta || {}
        const status = meta.status || 'ok'

        nlConversationMessages.value = [
          ...nlConversationMessages.value,
          { role: 'user', content: reply },
          { role: 'assistant', content: (meta.explain || '') + (meta.questions?.length ? '\n\n' + meta.questions.map((q) => q.question).join('\n') : '') }
        ]
        nlInputLine.value = meta.questions?.[0]?.default || ''
        nlAnswers.value = newAnswers
        nlSpec.value = result

        if (status !== 'need_clarification') {
          const hasSearch = typeof result.search === 'string' && result.search.trim()
          const hasTime = !!(result.start_time && result.end_time)
          const hasFilters = !!(result.filters && (result.filters.conditions?.length > 0 || (result.filters.logic && result.filters.conditions)))
          const hasActions = Array.isArray(result.actions) && result.actions.length > 0
          if (hasSearch || hasTime || hasFilters || hasActions) {
            applyNlResult(result)
          } else {
            ElMessage.warning(t('batchAnalysis.nlNoResult'))
          }
          cancelNlClarification()
        }
      } catch (e) {
        const status = e?.response?.status
        if (status === 503) {
          ElMessage.warning(t('batchAnalysis.llmUnavailable'))
        } else {
          ElMessage.error(t('batchAnalysis.nlFailed'))
        }
      } finally {
        nlGenerating.value = false
      }
    }

    // 搜索表达式（显示在搜索卡片中）；timestamp 条件值按显示时区展示
    const groupToString = (node, displayOffset = null) => {
      if (!node) return ''
      if (node.field && node.operator) {
        let val = Array.isArray(node.value) ? node.value.join(',') : (node.value ?? '')
        if (node.field === 'timestamp' && displayOffset != null) {
          if (Array.isArray(node.value) && node.value.length >= 2) {
            val = [convertStorageToDisplay(node.value[0], displayOffset), convertStorageToDisplay(node.value[1], displayOffset)].join(' ~ ')
          } else if (node.value != null && node.value !== '') {
            val = convertStorageToDisplay(String(node.value), displayOffset)
          }
        }
        const expr = `${node.field} ${node.operator} ${val}`
        return node.negate ? `NOT (${expr})` : expr
      }
      if (Array.isArray(node.conditions)) {
        const logic = node.logic || 'AND'
        const inner = node.conditions
          .map(child => groupToString(child, displayOffset))
          .filter(Boolean)
          .join(` ${logic} `)
        if (!inner) return ''
        if (node === filtersRoot.value) return `(${inner})`
        return `(${inner})`
      }
      return ''
    }
    const formatNlActionsSummary = (actions) => {
      const arr = Array.isArray(actions) ? actions : []
      const parts = []
      arr.filter((a) => a && a.type === 'mark').forEach((mark) => {
        const colorStr = mark.color != null ? String(mark.color) : ''
        const scopeStr = (mark.field != null && mark.value != null) ? `${mark.field}=${mark.value}` : ''
        const inner = [colorStr, scopeStr].filter(Boolean).join(' ')
        parts.push(`${t('batchAnalysis.nlActionMark')}(${inner || '—'})`)
      })
      arr.filter((a) => a && a.type === 'highlight').forEach((a) => {
        if (Array.isArray(a.terms) && a.terms.length) parts.push(`${t('batchAnalysis.nlActionHighlight')}(${a.terms.join(',')})`)
      })
      arr.filter((a) => a && a.type === 'stats').forEach((a) => {
        if (a.field != null && a.value != null) parts.push(`${t('batchAnalysis.nlActionStats')}(${a.field}=${a.value})`)
      })
      return parts.join('、')
    }
    const nlAppliedActionsSummary = computed(() => formatNlActionsSummary(nlAppliedActions.value))
    const pendingNlActionsSummary = computed(() => formatNlActionsSummary(pendingNlActions.value))
    const nlQuestionOptions = computed(() => {
      const options = nlSpec.value?.meta?.questions?.[0]?.options
      return Array.isArray(options) ? options.filter((o) => o != null && String(o).trim() !== '') : []
    })
    const searchExpression = computed(() => {
      const segments = []
      if (timeRange.value && timeRange.value.length === 2) {
        const startDisplay = convertStorageToDisplay(timeRange.value[0], displayTimezoneOffsetMinutes.value)
        const endDisplay = convertStorageToDisplay(timeRange.value[1], displayTimezoneOffsetMinutes.value)
        segments.push(`${t('batchAnalysis.searchExpressionTime')}: ${startDisplay} ~ ${endDisplay}`)
      }
      if (searchKeyword.value) {
        segments.push(`${t('batchAnalysis.searchExpressionKeywordAll')}: ${searchKeyword.value}`)
      }
      const adv = groupToString(filtersRoot.value, displayTimezoneOffsetMinutes.value)
      if (adv) segments.push(`${adv}`)
      return segments.join(t('batchAnalysis.searchExpressionAnd'))
    })

    // 仅用于高级筛选弹窗内部的表达式展示，不在这里加"时间/关键字"前缀
    const advancedExpression = computed(() => {
      const adv = groupToString(filtersRoot.value, displayTimezoneOffsetMinutes.value)
      return adv || ''
    })
    // 侧边栏内表达式预览（待提交状态）
    const pendingAdvancedExpression = computed(() => {
      const adv = groupToString(pendingFiltersRoot.value, pendingDisplayTimezoneOffsetMinutes.value)
      return adv || ''
    })
    // 搜索标签页底部：当前选中/待应用的搜索表达式预览（自然语言、常用表达式、导入后均会更新），含待应用动作
    const searchTabPreviewExpression = computed(() => {
      if (nlPreviewCleared.value) return ''
      const segments = []
      if (timeRange.value && timeRange.value.length === 2) {
        const startDisplay = convertStorageToDisplay(timeRange.value[0], pendingDisplayTimezoneOffsetMinutes.value)
        const endDisplay = convertStorageToDisplay(timeRange.value[1], pendingDisplayTimezoneOffsetMinutes.value)
        segments.push(`${t('batchAnalysis.searchExpressionTime')}: ${startDisplay} ~ ${endDisplay}`)
      }
      if (searchKeyword.value) {
        segments.push(`${t('batchAnalysis.searchExpressionKeywordAll')}: ${searchKeyword.value}`)
      }
      if (pendingAdvancedExpression.value) segments.push(pendingAdvancedExpression.value)
      if (pendingNlActionsSummary.value) segments.push(`${t('batchAnalysis.nlActionsPreview')}：${pendingNlActionsSummary.value}`)
      return segments.join(t('batchAnalysis.searchExpressionAnd'))
    })

    const countLeafConditions = (node) => {
      if (!node) return 0
      if (node.field && node.operator) return 1
      if (Array.isArray(node.conditions)) return node.conditions.reduce((acc, n) => acc + countLeafConditions(n), 0)
      return 0
    }
    const leafConditionCount = computed(() => countLeafConditions(filtersRoot.value))
    const pendingLeafConditionCount = computed(() => countLeafConditions(pendingFiltersRoot.value))

    // 过滤后的条目（仅服务端筛选，无本地二次过滤）
    const filteredEntries = computed(() => {
      return Array.isArray(batchLogEntries.value) ? batchLogEntries.value : []
    })

    const batchCount = computed(() => Array.isArray(batchLogEntries.value) ? batchLogEntries.value.length : 0)
    const selectedLogsCount = computed(() => Array.isArray(selectedLogs.value) ? selectedLogs.value.length : 0)
    const filteredCount = computed(() => totalCount.value)

    // 计算时间范围限制（取已加载条目中的最早与最晚）
    const timeRangeLimit = computed(() => {
      // 优先使用后端聚合范围
      if (globalMinTs.value && globalMaxTs.value) {
        const min = new Date(globalMinTs.value)
        const max = new Date(globalMaxTs.value)
        if (!Number.isNaN(min.getTime()) && !Number.isNaN(max.getTime())) {
          return [min, max]
        }
      }
      // 回退：使用当前已加载页的条目范围
      const entries = batchLogEntries.value
      if (!entries || entries.length === 0) return null
      const times = entries
        .map(e => new Date(e.timestamp))
        .filter(d => !isNaN(d))
      if (times.length === 0) return null
      const min = new Date(Math.min(...times))
      const max = new Date(Math.max(...times))
      return [min, max]
    })

    // 分页后的条目（后端分页，直接使用当前页数据）
    const paginatedEntries = computed(() => {
      return filteredEntries.value
    })

    // 从路由参数获取选中的日志
    const loadSelectedLogs = async () => {
      // 支持多种来源：params.logIds / query.logIds / params.id / query.id
      const fromParamsLogIds = route.params?.logIds
      const fromQueryLogIds = route.query?.logIds
      const singleIdParam = route.params?.id
      const singleIdQuery = route.query?.id

      let idsStr = fromParamsLogIds || fromQueryLogIds || singleIdParam || singleIdQuery
      if (!idsStr) return

      const ids = String(idsStr)
        .split(',')
        .map(id => parseInt(id))
        .filter(n => !Number.isNaN(n))

      if (ids.length === 0) return

      try {
        // 直接通过 log_ids 参数查询指定的日志，避免 1000 条限制问题
        // 此时已经知道要查询的日志ID（来自路由参数），直接查询这些日志
        const response = await store.dispatch('logs/fetchLogs', { 
          log_ids: ids.join(','),
          page: 1,
          limit: ids.length // 设置为 ID 数量，确保返回所有匹配的日志
        })
        // 后端已经通过 WHERE id IN (...) 过滤，直接使用返回的结果
        selectedLogs.value = response.data.logs || []
        
        // 如果查询结果数量与期望不一致，给出警告（可能某些日志不存在或已被删除）
        if (selectedLogs.value.length !== ids.length) {
          const foundIds = selectedLogs.value.map(log => log.id)
          const missingIds = ids.filter(id => !foundIds.includes(id))
          console.warn(`[loadSelectedLogs] 期望找到 ${ids.length} 个日志，实际找到 ${selectedLogs.value.length} 个。缺失的ID:`, missingIds)
        }
      } catch (error) {
        console.error('获取日志信息失败:', error)
        ElMessage.error('获取日志信息失败')
        selectedLogs.value = []
      }
    }

    // 加载批量日志条目（后端分页）
    const loadBatchLogEntries = async (page = 1, resetData = false, signal = null) => {
      // 如果没有选中的日志，直接返回
      if (selectedLogs.value.length === 0) {
        return
      }
      
      try {
        loading.value = true
        
        // 重置数据或初始化
        if (resetData) {
          batchLogEntries.value = []
          currentPage.value = page
        }
        
        // 构建查询参数
        const logIds = selectedLogs.value.map(l => l.id).join(',')
        const baseParams = {
          log_ids: logIds,
          page,
          limit: pageSize.value,
          include_ungraded: true
        }
        
        // 添加高级筛选条件
        if (advancedMode.value && leafConditionCount.value > 0) {
          const filtersPayload = buildFiltersPayload()
          if (filtersPayload) {
            baseParams.filters = JSON.stringify(filtersPayload)
          }
        }
        
        // 添加时间范围筛选
        if (timeRange.value && timeRange.value.length === 2) {
          baseParams.start_time = timeRange.value[0]
          baseParams.end_time = timeRange.value[1]
        }
        
        // 添加关键词搜索
        if (searchKeyword.value) {
          baseParams.search = searchKeyword.value
        }
        
        // 调用后端分页接口，支持请求取消
        if (selectedAnalysisCategoryIds.value?.length) {
          baseParams.analysis_category_ids = selectedAnalysisCategoryIds.value.join(',')
        }
        console.log('[NL] loadBatchLogEntries.baseParams', baseParams)
        if (baseParams.filters) {
          try {
            console.log('[NL] loadBatchLogEntries.filters', JSON.parse(baseParams.filters))
          } catch (e) {
            console.warn('[NL] loadBatchLogEntries.filters parse failed', e)
          }
        }
        const response = await store.dispatch('logs/fetchBatchLogEntries', baseParams, signal)
        const { entries, total, totalPages: serverTotalPages, page: serverPage, minTimestamp, maxTimestamp } = response.data

        // 先用后端聚合出的整体时间范围回填 timeRange（避免后续统计请求无时间范围导致 ClickHouse 扫全表）
        if (minTimestamp && maxTimestamp) {
          const min = new Date(minTimestamp)
          const max = new Date(maxTimestamp)
          if (!Number.isNaN(min.getTime()) && !Number.isNaN(max.getTime())) {
            globalMinTs.value = min
            globalMaxTs.value = max
            const needInit = !timeRange.value || timeRange.value.length !== 2
            const [curStart, curEnd] = needInit ? [null, null] : timeRange.value
            const curStartDate = curStart ? new Date(parseStorageTimeToUtcMs(curStart)) : null
            const curEndDate = curEnd ? new Date(parseStorageTimeToUtcMs(curEnd)) : null
            const minMs = min.getTime(); const maxMs = max.getTime()
            const outOfRange = !curStartDate || !curEndDate || curStartDate.getTime() < minMs || curEndDate.getTime() > maxMs
            if (needInit || outOfRange) {
              timeRange.value = [getStorageTimeString(minTimestamp), getStorageTimeString(maxTimestamp)]
            }
          }
        }
        
        // 在首次加载或重置数据时，获取统计信息
        if (resetData && page === 1) {
          // 并行获取全局统计和筛选统计
          const statsPromises = []
          
          // 获取全局统计（仅在首次加载时）
          if (Object.keys(globalErrorCodeCounts.value).length === 0) {
            statsPromises.push(fetchGlobalStatistics())
          }
          
          // 获取筛选统计
          statsPromises.push(fetchFilteredStatistics())
          
          // 等待统计完成（不阻塞数据加载）
          Promise.all(statsPromises).catch(error => {
            console.warn('获取统计信息失败:', error)
          })
        }
        
        // 处理返回的数据
        const idToName = new Map(selectedLogs.value.map(l => [l.id, l.original_name]))
        const processedEntries = entries.map(entry => {
          const tsText = formatTimestamp(entry.timestamp)
          const displayParams = [entry.param1, entry.param2, entry.param3, entry.param4].filter(p => p)
          // 为前端交互生成稳定且唯一的行ID（跨多日志、多版本）
          const syntheticId = `${entry.log_id || 'log'}-${entry.version || 1}-${entry.row_index ?? 0}`
          return {
            ...entry,
            id: syntheticId,
            log_name: idToName.get(entry.log_id) || '',
            color_mark: entry.color_mark || null,
            remarks: entry.remarks || '',
            timestamp_text: tsText,
            display_params: displayParams
          }
        })
        
        // 更新数据
        if (resetData) {
          batchLogEntries.value = processedEntries
        } else {
          // 追加数据（用于虚拟滚动）
          batchLogEntries.value.push(...processedEntries)
        }
        
        // 加载保存的颜色标记
        loadColorMarksFromStorage()
        materializeNlMarksToStorage()
        // 加载备注
        loadRemarksFromStorage()
        
        // 更新分页信息
        totalCount.value = total
        totalPages.value = serverTotalPages
        if (typeof serverPage === 'number' && !Number.isNaN(serverPage)) {
          currentPage.value = serverPage
        }

        // 更新时间范围限制：已在上方优先回填，这里保留空分隔（避免重复计算）
        
        // 翻页/加载完成时不显示全量数量提示，避免频繁打扰
        
      } catch (error) {
        ElMessage.error('批量分析失败: ' + (error.response?.data?.message || error.message))
      } finally {
        loading.value = false
        // 获取统计信息（优先使用后端，失败时使用前端计算）
        if (batchLogEntries.value.length > 0) {
          await fetchStatisticsFromBackend()
        }
      }
    }

    // 搜索输入状态：中文输入法组合中不触发
    const isComposing = ref(false)
    const onCompositionStart = () => { isComposing.value = true }
    const onCompositionEnd = () => { 
      isComposing.value = false 
      // 组合结束后再触发一次
      debouncedSearch()
    }

    // 增强的防抖机制
    let searchTimer = null
    let searchAbortController = null
    
    const debouncedSearch = () => {
      if (isComposing.value) return
      
      // 取消之前的请求
      if (searchAbortController) {
        searchAbortController.abort()
      }
      
      // 清除之前的定时器
      if (searchTimer) {
        clearTimeout(searchTimer)
      }
      
      // 创建新的 AbortController
      searchAbortController = new AbortController()
      
      // 智能防抖：根据搜索复杂度调整延迟时间
      const delay = calculateSearchDelay()
      
      searchTimer = setTimeout(async () => {
        if (!isComposing.value) {
          currentPage.value = 1
          await loadBatchLogEntries(1, true, searchAbortController.signal)
          // 更新筛选条件下的统计信息
          await fetchFilteredStatistics()
        }
      }, delay)
    }
    
    // 计算搜索延迟时间
    const calculateSearchDelay = () => {
      let baseDelay = 300 // 基础延迟300ms
      
      // 根据搜索条件复杂度调整延迟
      if (advancedMode.value && leafConditionCount.value > 0) {
        baseDelay += leafConditionCount.value * 100 // 每个高级条件增加100ms
      }
      
      if (timeRange.value && timeRange.value.length === 2) {
        baseDelay += 200 // 时间范围筛选增加200ms
      }
      
      if (searchKeyword.value && searchKeyword.value.length > 10) {
        baseDelay += 150 // 长关键词增加150ms
      }
      
      // 最大延迟不超过1秒
      return Math.min(baseDelay, 1000)
    }

    // 供输入框 @input 调用
    const handleSearch = () => {
      debouncedSearch()
    }

    const handleQuery = async () => {
      // 取消之前的请求
      if (searchAbortController) {
        searchAbortController.abort()
      }
      
      currentPage.value = 1
      await loadBatchLogEntries(1, true)
      // 更新筛选条件下的统计信息
      await fetchFilteredStatistics()
    }

    // 时间范围变化处理（timeRange 存原时区，越界纠正按原时区比较）
    const handleTimeRangeChange = async () => {
      if (timeRangeLimit.value && timeRange.value && timeRange.value.length === 2) {
        const limitStart = getStorageTimeString(timeRangeLimit.value[0])
        const limitEnd = getStorageTimeString(timeRangeLimit.value[1])
        if (limitStart && limitEnd) {
          let [start, end] = timeRange.value
          const startMs = parseStorageTimeToUtcMs(start)
          const endMs = parseStorageTimeToUtcMs(end)
          const minMs = parseStorageTimeToUtcMs(limitStart)
          const maxMs = parseStorageTimeToUtcMs(limitEnd)
          let changed = false
          if (!Number.isNaN(startMs) && !Number.isNaN(minMs) && startMs < minMs) { start = limitStart; changed = true }
          if (!Number.isNaN(endMs) && !Number.isNaN(maxMs) && endMs > maxMs) { end = limitEnd; changed = true }
          if (changed) timeRange.value = [start, end]
        }
      }
      
      // 取消之前的请求
      if (searchAbortController) {
        searchAbortController.abort()
      }
      
      currentPage.value = 1
      await loadBatchLogEntries(1, true)
      
      // 获取筛选统计
      await fetchFilteredStatistics()
    }

    // 清除筛选
    const clearFilters = async () => {
      // 取消之前的请求
      if (searchAbortController) {
        searchAbortController.abort()
      }
      
      searchKeyword.value = ''
      timeRange.value = null
      filtersRoot.value = { logic: 'AND', conditions: [] }
      advancedMode.value = false
      currentPage.value = 1
      // 立即重新加载，显示全部条目
      await loadBatchLogEntries(1, true)
      // 清除筛选后，重新获取全局统计
      await fetchGlobalStatistics()
    }

    // 仅清空高级条件（待提交状态），点「应用」后生效
    const clearAllConditionsOnly = () => {
      pendingFiltersRoot.value = { logic: 'AND', conditions: [] }
    }

    // 禁用超出范围的日期
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    const disableOutOfRangeDates = (date) => {
      if (!timeRangeLimit.value || !date) return false
      const [min, max] = timeRangeLimit.value
      return date < startOfDay(new Date(min)) || date > endOfDay(new Date(max))
    }

    // 打开面板时默认展示的页（左右两侧月份/日期依据最小、最大值）
    const defaultPickerRange = computed(() => {
      if (!timeRangeLimit.value) return null
      return [timeRangeLimit.value[0], timeRangeLimit.value[1]]
    })

    // 导出CSV（异步队列模式）
    const exportToCSV = async () => {
      try {
        const logIds = selectedLogs.value.map(l => l.id).join(',')
        const params = {}
        if (logIds) params.log_ids = logIds
        if (advancedMode.value && leafConditionCount.value > 0) {
          const filtersPayload = buildFiltersPayload()
          if (filtersPayload) params.filters = JSON.stringify(filtersPayload)
        }
        if (timeRange.value && timeRange.value.length === 2) {
          params.start_time = timeRange.value[0]
          params.end_time = timeRange.value[1]
        }
        if (searchKeyword.value) params.search = searchKeyword.value
        params.display_timezone_offset_minutes = displayTimezoneOffsetMinutes.value
        
        // 创建任务
        const { data } = await api.logs.exportBatchEntries(params)
        const taskId = data?.taskId
        if (!taskId) throw new Error('未返回 taskId')
        
        ElMessage.info('CSV导出任务已创建，正在处理...')
        
        // 轮询任务状态
        const pollInterval = setInterval(async () => {
          try {
            const resp = await api.logs.getExportCsvTaskStatus(taskId)
            const st = resp.data?.data
            const state = st?.status
            
            if (state === 'completed') {
              clearInterval(pollInterval)
              if (timeoutId) clearTimeout(timeoutId)
              // 下载结果文件
              try {
                const downloadResp = await api.logs.downloadExportCsvResult(taskId)
                const csvName = st?.result?.csvFileName || `batch_log_entries_${Date.now()}.csv`
                const blob = new Blob([downloadResp.data], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = csvName
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                setTimeout(() => URL.revokeObjectURL(url), 100)
                ElMessage.success('CSV导出成功')
              } catch (downloadErr) {
                ElMessage.error(downloadErr?.response?.data?.message || '下载结果文件失败')
              }
            } else if (state === 'failed') {
              clearInterval(pollInterval)
              if (timeoutId) clearTimeout(timeoutId)
              ElMessage.error(st?.error || 'CSV导出任务失败')
            }
            // waiting/active 状态继续轮询
          } catch (pollErr) {
            clearInterval(pollInterval)
            if (timeoutId) clearTimeout(timeoutId)
            ElMessage.error('查询任务状态失败')
          }
        }, 2000) // 每2秒轮询一次
        
        // 超时保护（10分钟）
        const timeoutId = setTimeout(() => {
          clearInterval(pollInterval)
          ElMessage.warning('CSV导出任务超时，请稍后重试')
        }, 600000)
      } catch (error) {
        console.error('导出CSV失败:', error)
        ElMessage.error('导出CSV失败: ' + (error?.response?.data?.message || error?.message || '未知错误'))
      }
    }

    // 分页处理
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadBatchLogEntries(1, true)
    }

    const handleCurrentChange = async (page) => {
      currentPage.value = page
      // 手动分页不自动累加，直接替换为当前页数据
      await loadBatchLogEntries(page, true)
    }
    
    // 虚拟滚动加载更多数据
    const handleLoadMore = async () => {
      if (!allowAutoLoad.value) return
      // 如果还有更多数据，加载下一页
      if (currentPage.value < totalPages.value && !loading.value) {
        currentPage.value++
        await loadBatchLogEntries(currentPage.value, false)
      }
    }

    // 表格分页/排序等交互后，强制触发一次重测量以保证 tooltip 判断正确
    const forceRelayout = () => {
      // 通过下一个 tick 触发组件中的 ResizeObserver/测量逻辑生效
      // 这里不直接操作 DOM，由子组件在 mouseenter 与 observer 中测量
    }

    // 格式化时间戳
    const formatTimestamp = (timestamp) => {
      if (!timestamp) return '-'
      // 如果是原始时间格式字符串（YYYY-MM-DD HH:mm:ss），直接返回
      if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
        return timestamp
      }
      // 否则，按原始时间解析（不做时区转换）
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return '-'
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }

    // 时区转换显示：将原时区存储的时间戳按选中时区显示，仅影响前端
    const formatTimestampWithTimezone = (timestamp, offsetMinutes) => {
      if (timestamp == null || timestamp === '') return ''
      if (offsetMinutes == null || offsetMinutes === 480) return '' // 与原时区一致(默认480)时用原样显示
      let utcMs
      const str = String(timestamp).trim()
      const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/)
      if (match) {
        const [, y, M, d, h, m, s, ms] = match
        // 按原时区解析为 UTC 毫秒
        utcMs = Date.UTC(
          parseInt(y, 10),
          parseInt(M, 10) - 1,
          parseInt(d, 10),
          parseInt(h, 10) - 8,
          parseInt(m, 10),
          parseInt(s, 10) || 0,
          parseInt((ms || '0').padEnd(3, '0'), 10) || 0
        )
      } else {
        const date = new Date(timestamp)
        if (isNaN(date.getTime())) return ''
        utcMs = date.getTime()
      }
      // 目标时区本地时间 = UTC + offsetMinutes
      const displayMs = utcMs + (offsetMinutes * 60 * 1000)
      const disp = new Date(displayMs)
      const yy = disp.getUTCFullYear()
      const mm = String(disp.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(disp.getUTCDate()).padStart(2, '0')
      const hh = String(disp.getUTCHours()).padStart(2, '0')
      const mi = String(disp.getUTCMinutes()).padStart(2, '0')
      const ss = String(disp.getUTCSeconds()).padStart(2, '0')
      return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`
    }

    // 时间戳（文件名）列悬浮提示：完整时间戳 + 文件名
    const getTimestampFileInfoTooltip = (row) => {
      const text = formatTimestampWithTimezone(row.timestamp, displayTimezoneOffsetMinutes.value) || row.timestamp_text || ''
      const name = row.log_name ? String(row.log_name).trim() : ''
      if (!text && !name) return ''
      return name ? `${text} / ${name}` : text
    }

    const onTimezoneChange = () => { /* 仅依赖 displayTimezoneOffsetMinutes 触发重渲染 */ }

    // 原时区/存储时区 ↔ 显示时区：检索时转化为原时区（转换前的时间），界面显示用选中时区。原时区不一定是北京，此处默认 480（UTC+8）
    const STORAGE_OFFSET_MINUTES = 480
    const parseStorageTimeToUtcMs = (storageStr) => {
      if (!storageStr || typeof storageStr !== 'string') return NaN
      const m = String(storageStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/)
      if (m) {
        const h = parseInt(m[4], 10) - (STORAGE_OFFSET_MINUTES / 60)
        return Date.UTC(
          parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
          h, parseInt(m[5], 10), parseInt(m[6], 10) || 0,
          parseInt((m[7] || '0').padEnd(3, '0'), 10) || 0
        )
      }
      return new Date(storageStr).getTime()
    }
    const formatUtcMsToStorageTime = (utcMs) => {
      if (utcMs == null || Number.isNaN(utcMs)) return ''
      const d = new Date(utcMs + STORAGE_OFFSET_MINUTES * 60 * 1000)
      const yy = d.getUTCFullYear()
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mi = String(d.getUTCMinutes()).padStart(2, '0')
      const ss = String(d.getUTCSeconds()).padStart(2, '0')
      return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`
    }
    const convertStorageToDisplay = (storageStr, displayOffsetMinutes) => {
      if (!storageStr) return ''
      if (displayOffsetMinutes == null || displayOffsetMinutes === STORAGE_OFFSET_MINUTES) return storageStr
      const utcMs = parseStorageTimeToUtcMs(storageStr)
      if (Number.isNaN(utcMs)) return storageStr
      const displayMs = utcMs + (displayOffsetMinutes * 60 * 1000)
      const d = new Date(displayMs)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`
    }
    const convertDisplayToStorage = (displayStr, displayOffsetMinutes) => {
      if (!displayStr) return ''
      if (displayOffsetMinutes == null || displayOffsetMinutes === STORAGE_OFFSET_MINUTES) return displayStr
      const m = String(displayStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/)
      if (!m) return displayStr
      const utcMs = Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10) || 0, parseInt((m[7] || '0').padEnd(3, '0'), 10) || 0) - (displayOffsetMinutes * 60 * 1000)
      return formatUtcMsToStorageTime(utcMs)
    }
    const getStorageTimeString = (ts) => {
      if (ts == null) return ''
      if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/.test(ts)) return ts
      const date = new Date(ts)
      if (Number.isNaN(date.getTime())) return ''
      return formatUtcMsToStorageTime(date.getTime())
    }

    // 时间筛选器：内部存原时区(检索用)，界面显示用选中时区
    const timeRangeDisplay = computed({
      get () {
        if (!timeRange.value || timeRange.value.length !== 2) return null
        return [
          convertStorageToDisplay(timeRange.value[0], displayTimezoneOffsetMinutes.value),
          convertStorageToDisplay(timeRange.value[1], displayTimezoneOffsetMinutes.value)
        ]
      },
      set (v) {
        if (v && v.length === 2) {
          timeRange.value = [
            convertDisplayToStorage(v[0], displayTimezoneOffsetMinutes.value),
            convertDisplayToStorage(v[1], displayTimezoneOffsetMinutes.value)
          ]
        } else {
          timeRange.value = v
        }
      }
    })

    // 读取服务端时区偏移（分钟），统一前端显示
    const serverOffsetMinutes = ref(null)
    const loadServerTimezone = async () => {
      try {
        const resp = await fetch('/api/timezone')
        const json = await resp.json()
        if (typeof json.offsetMinutes === 'number') serverOffsetMinutes.value = json.offsetMinutes
      } catch (_) {
        serverOffsetMinutes.value = null
      }
    }

    // 智能时间戳格式化函数
    const getSmartTimeFormatter = (data) => {
      if (!data || data.length < 2) return formatTimestamp
      
      const startTime = new Date(data[0][0])
      const endTime = new Date(data[data.length - 1][0])
      const timeSpan = endTime.getTime() - startTime.getTime()
      
      // 跨度 < 1 分钟时，显示 HH:mm:ss
      if (timeSpan < 60 * 1000) {
        return (timestamp) => {
          const date = new Date(timestamp)
          const hours = String(date.getHours()).padStart(2, '0')
          const minutes = String(date.getMinutes()).padStart(2, '0')
          const seconds = String(date.getSeconds()).padStart(2, '0')
          return `${hours}:${minutes}:${seconds}`
        }
      }
      // 跨度 > 1 天时，显示 MM-dd
      else if (timeSpan > 24 * 60 * 60 * 1000) {
        return (timestamp) => {
          const date = new Date(timestamp)
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${month}-${day}`
        }
      }
      // 跨度 > 1 小时时，显示 HH:mm 或 MM-dd HH:mm
      else if (timeSpan > 60 * 60 * 1000) {
        return (timestamp) => {
          const date = new Date(timestamp)
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          const hours = String(date.getHours()).padStart(2, '0')
          const minutes = String(date.getMinutes()).padStart(2, '0')
          return `${month}-${day} ${hours}:${minutes}`
        }
      }
      // 默认显示完整时间戳
      else {
        return formatTimestamp
      }
    }

    // 格式化文件大小
    const formatFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    // 无

    // 手术数据分析（与手术数据页一致：analyzeByLogIds + 轮询 task 状态）；仅本页霸屏等待，分析结束后再打开弹窗展示结果列表
    const showSurgeryStatistics = async () => {
      if (!store.getters['auth/hasPermission']?.('surgery:read')) {
        ElMessage.warning(t('batchAnalysis.insufficientPermissions'))
        return
      }
      if (batchLogEntries.value.length === 0) {
        ElMessage.warning(t('batchAnalysis.loadLogEntriesFirst'))
        return
      }

      try {
        surgeryStatsPollingCancelled.value = false
        showSurgeryStatsDialog.value = true
        surgeryStatsLoading.value = true
        const logIds = selectedLogs.value.map(log => log.id)
        const resp = await api.surgeryStatistics.analyzeByLogIds(
          logIds,
          true,
          displayTimezoneOffsetMinutes.value,
          { autoImport: true }
        )

        if (resp.data?.taskId) {
          const taskId = resp.data.taskId
          let attempts = 0
          const maxAttempts = 30
          while (attempts < maxAttempts) {
            if (surgeryStatsPollingCancelled.value) break
            try {
              const status = await api.surgeryStatistics.getAnalysisTaskStatus(taskId)
              const result = status.data?.data?.result
              if (Array.isArray(result)) {
                surgeryStats.value = result
                break
              }
            } catch (_) {}
            await new Promise(r => setTimeout(r, 1000))
            attempts++
          }
          if (!surgeryStatsPollingCancelled.value && (!Array.isArray(surgeryStats.value) || surgeryStats.value.length === 0)) {
            ElMessage.warning('未获取到手术统计结果，请稍后重试')
          }
        } else {
          surgeryStats.value = resp.data?.data || []
        }
      } catch (e) {
        if (!surgeryStatsPollingCancelled.value) ElMessage.error('手术统计失败')
      } finally {
        surgeryStatsLoading.value = false
      }
    }

    // 模板相关
    const loadTemplates = async () => {
      try {
        const res = await api.logs.getSearchTemplates()
        templates.value = res.data.templates || []
      } catch {}
    }

    // 手术统计（仅列表显示）；关闭弹窗时停止轮询，避免任务卡住且「进行中」数量不更新
    const showSurgeryStatsDialog = ref(false)
    const surgeryStatsLoading = ref(false)
    const surgeryStatsPollingCancelled = ref(false)
    const surgeryStats = ref([])
    const exportingRow = ref({})
    const surgeryJsonDialogVisible = ref(false)
    const surgeryJsonText = ref('')
    const showCompareDialog = ref(false)
    const compareData = ref({})

    // 权限检查
    const hasExportPermission = computed(() => store.getters['auth/hasPermission']?.('surgery:export'))

    // 关闭手术统计弹窗且正在加载时，停止轮询，避免「进行中」卡住（后端会在 /tasks/active 时刷新状态）
    watch(showSurgeryStatsDialog, (visible) => {
      if (!visible && surgeryStatsLoading.value) surgeryStatsPollingCancelled.value = true
    })

    const visualizeSurgeryStat = (row) => {
      // 优先使用准备写入数据库的结构（与手术数据页一致）
      const data = row?.postgresql_row_preview || row
      visualizeSurgeryData(data)
    }

    const previewSurgeryData = (row) => {
      // 显示准备写入PostgreSQL的格式数据
      // 优先使用 postgresql_row_preview，如果没有则使用当前行的数据（已经是PostgreSQL格式）
      const data = row?.postgresql_row_preview || row
      surgeryJsonText.value = JSON.stringify(data, null, 2)
      surgeryJsonDialogVisible.value = true
    }

    const exportSurgeryRow = async (row) => {
      if (!store.getters['auth/hasPermission']?.('surgery:export')) return
      try {
        exportingRow.value[row.id] = true
        
        // 直接传递完整的手术数据到后端
        const response = await api.surgeryStatistics.exportSingleSurgeryData(row)
        
        if (response.data.success) {
          ElMessage.success('手术数据已成功导出到PostgreSQL数据库')
        } else if (response.data.needsConfirmation) {
          // 检查是否有差异
          const hasDifferences = response.data.differences && response.data.differences.length > 0
          
          if (!hasDifferences) {
            // 没有差异，只显示提示信息
            ElMessage.info(`已存在手术ID为 ${response.data.surgery_id} 的手术数据`)
          } else {
            // 有差异，需要用户确认覆盖
            showCompareDialog.value = true
            compareData.value = {
              surgeryId: response.data.surgery_id,
              existingData: response.data.existingData,
              newData: response.data.newData,
              differences: response.data.differences,
              textDiff: response.data.textDiff || '',
              surgeryData: row,
              pendingExportId: response.data.pending_export_id || null,
              fullDataIncluded: true
            }
          }
        } else {
          ElMessage.warning(response.data.message || '导出完成，但可能未存储到数据库')
        }
      } catch (e) {
        console.error('导出到PostgreSQL失败:', e)
        ElMessage.error('导出到PostgreSQL数据库失败: ' + (e.response?.data?.message || e.message))
      } finally {
        exportingRow.value[row.id] = false
      }
    }

    const applyTemplateByName = (name) => {
      const tpl = templates.value.find(t => t.name === name)
      if (!tpl) return
      // 覆盖当前高级条件
      filtersRoot.value = {
        logic: tpl.filters?.logic || 'AND',
        conditions: Array.isArray(tpl.filters?.conditions) ? [...tpl.filters.conditions] : []
      }
      // 不立即执行，用户可继续编辑
    }

    const beforeImportTemplates = async (file) => {
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        // 不保存为常用模板，仅解析并填充到"添加条件"区域
        let logic = 'AND'
        let conditions = []
        if (json && (Array.isArray(json.conditions) || Array.isArray(json.filters?.conditions))) {
          logic = json.logic || json.filters?.logic || 'AND'
          conditions = Array.isArray(json.conditions) ? json.conditions : (json.filters?.conditions || [])
        } else if (Array.isArray(json.templates) && json.templates.length > 0) {
          const first = json.templates[0]
          logic = first?.filters?.logic || 'AND'
          conditions = Array.isArray(first?.filters?.conditions) ? first.filters.conditions : []
        }
        if (conditions.length > 0) {
          pendingFiltersRoot.value = { logic, conditions: [...conditions] }
          clearNlAppliedActions()
          ElMessage.success('已从文件填充到高级条件')
        } else {
          ElMessage.warning('未识别到可用的表达式内容')
        }
      } catch (e) {
        ElMessage.error('解析失败：' + e.message)
      }
      return false
    }

    // AntD CheckableTag 单选模板处理
    const onTemplateSingleSelect = (name, checked) => {
      selectedTemplateName.value = checked ? name : ''
    }

    const numericFields = new Set(['param1', 'param2', 'param3', 'param4'])
    const normalizeValue = (field, operator, value) => {
      const op = String(operator || '').toLowerCase()
      const isNumeric = numericFields.has(field)
      
      // 处理空值
      if (value === undefined || value === null || value === '') {
        return null
      }
      
      if (op === 'between' || op === 'notbetween') {
        const arr = Array.isArray(value) ? value : String(value).split(',')
        if (arr.length < 2) return null
        
        const a = (arr[0] ?? '').toString().trim()
        const b = (arr[1] ?? '').toString().trim()
        
        if (isNumeric) {
          const numA = Number(a)
          const numB = Number(b)
          if (Number.isNaN(numA) || Number.isNaN(numB)) return null
          return [numA, numB]
        }
        return [a, b]
      }
      
      if (op === 'in' || op === 'notin') {
        // 不支持：过滤掉
        return null
      }
      
      if (isNumeric) {
        const n = Number(value)
        return Number.isNaN(n) ? value : n
      }
      
      return value
    }

    // 本地执行高级筛选
    const getFieldValue = (entry, field) => {
      if (field === 'timestamp') return new Date(entry.timestamp)
      return entry[field]
    }

    const toNumber = (val) => {
      const n = Number(val)
      return Number.isNaN(n) ? null : n
    }

    const evalCondition = (field, operator, value, entry) => {
      const op = String(operator || '').toLowerCase()
      const raw = getFieldValue(entry, field)
      if (raw === undefined || raw === null) return false

      const isNumeric = numericFields.has(field)
      const isTimestamp = field === 'timestamp'

      if (op === 'between' || op === 'notbetween') {
        const arr = Array.isArray(value) ? value : String(value ?? '').split(',')
        if (arr.length < 2) return false
        if (isNumeric) {
          const a = toNumber(arr[0]); const b = toNumber(arr[1]);
          if (a === null || b === null) return false
          const n = toNumber(raw)
          if (n === null) return false
          const ok = n >= Math.min(a,b) && n <= Math.max(a,b)
          return op === 'between' ? ok : !ok
        }
        if (isTimestamp) {
          const a = new Date(arr[0]); const b = new Date(arr[1])
          const t = new Date(raw)
          const ok = t >= (a < b ? a : b) && t <= (a < b ? b : a)
          return op === 'between' ? ok : !ok
        }
        const s = String(raw)
        const ok = s >= String(arr[0]) && s <= String(arr[1])
        return op === 'between' ? ok : !ok
      }

      if (op === 'in' || op === 'notin') {
        // 不支持：直接判false
        return false
      }

      if (op === 'regex') {
        // 限制：仅 error_code 可用；explanation 不允许 regex
        if (field === 'explanation') return false
        try {
          const re = new RegExp(String(value))
          return re.test(String(raw))
        } catch { return false }
      }

      if (op === 'contains' || op === 'like') {
        // 仅 explanation 允许 contains，其它字段退化为 false
        if (field !== 'explanation') return false
        return String(raw).toLowerCase().includes(String(value ?? '').toLowerCase())
      }
      if (op === 'notcontains' || op === 'startswith' || op === 'endswith') {
        // 前端禁用；兜底返回 false
        return false
      }

      if (isNumeric) {
        const n = toNumber(raw); const v = toNumber(value)
        if (n === null || v === null) return false
        switch (op) {
          case '=': return n === v
          case '!=': case '<>': return n !== v
          case '>': return n > v
          case '>=': return n >= v
          case '<': return n < v
          case '<=': return n <= v
          default: return false
        }
      }
      if (isTimestamp) {
        const t = new Date(raw).getTime(); const v = new Date(value).getTime()
        switch (op) {
          case '=': return t === v
          case '!=': case '<>': return t !== v
          case '>': return t > v
          case '>=': return t >= v
          case '<': return t < v
          case '<=': return t <= v
          default: return false
        }
      }
      const s = String(raw); const v = String(value ?? '')
      switch (op) {
        case '=': return s === v
        case '!=': case '<>': return s !== v
        case '>': return s > v
        case '>=': return s >= v
        case '<': return s < v
        case '<=': return s <= v
        default: return false
      }
    }

    const evaluateNode = (node, entry) => {
      if (!node) return true
      if (node.field && node.operator) {
        const ret = evalCondition(node.field, node.operator, node.value, entry)
        return node.negate ? !ret : ret
      }
      if (Array.isArray(node.conditions)) {
        const logic = node.logic || 'AND'
        const results = node.conditions.map(child => evaluateNode(child, entry))
        return logic === 'OR' ? results.some(Boolean) : results.every(Boolean)
      }
      return true
    }

    const evaluateAdvanced = (entry) => evaluateNode(filtersRoot.value, entry)

    const exprPreviewRef = ref(null)

    const applyExpressionJSON = async () => {
      if (!importExpressionText.value) return
      try {
        const obj = JSON.parse(importExpressionText.value)
        if (obj && (Array.isArray(obj.conditions) || Array.isArray(obj.filters?.conditions))) {
          const logic = obj.logic || obj.filters?.logic || 'AND'
          const conds = Array.isArray(obj.conditions) ? obj.conditions : obj.filters?.conditions
          filtersRoot.value = { logic, conditions: Array.isArray(conds) ? [...conds] : [] }
          // 仅填充，不立即执行；等待点击"应用"
          ElMessage.success('表达式已填充，请点击"应用"执行搜索')
          filterDrawerVisible.value = true
          filterSidebarActiveTab.value = 'advanced'
          await nextTick()
          if (exprPreviewRef.value && exprPreviewRef.value.scrollIntoView) {
            exprPreviewRef.value.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
        } else {
          ElMessage.error('JSON格式不正确，缺少 conditions')
        }
      } catch (e) {
        ElMessage.error('解析失败：' + e.message)
      }
    }

    const applyExpressionSmart = async () => {
      if (!importExpressionText.value) return
      // 仅支持 JSON 导入
      try {
        const obj = JSON.parse(importExpressionText.value)
        if (obj && (Array.isArray(obj.conditions) || Array.isArray(obj.filters?.conditions))) {
          const logic = obj.logic || obj.filters?.logic || 'AND'
          const conds = Array.isArray(obj.conditions) ? obj.conditions : obj.filters?.conditions
          filtersRoot.value = { logic, conditions: Array.isArray(conds) ? [...conds] : [] }
          ElMessage.success('表达式已填充，请点击"应用"执行搜索')
          return
        }
        ElMessage.warning('未识别到可用的表达式内容')
      } catch (_) {
        ElMessage.error('仅支持 JSON 格式的表达式导入')
      }
    }

    

    // 分析手术数据（批量分析）
    const analyzeSurgeryData = async () => {
      analyzing.value = true
      try {
        // 使用统一的接口，一次性分析所有选中的日志
        const logIds = selectedLogs.value.map(log => log.id)
        const response = await api.surgeryStatistics.analyzeByLogIds(
          logIds,
          true,
          displayTimezoneOffsetMinutes.value,
          { autoImport: true }
        )
        
        if (response.data.success) {
          ElMessage.success(response.data.message || `成功分析出 ${response.data.data?.length || 0} 场手术`)
        } else {
          ElMessage.error(response.data.message || '批量分析手术数据失败')
        }
      } catch (error) {
        ElMessage.error('批量分析手术数据失败: ' + (error.response?.data?.message || error.message))
      } finally {
        analyzing.value = false
      }
    }

    // 构建filters payload（检索用转换前时间：timeRange 与高级条件中 timestamp 均为原时区）
    const buildFiltersPayload = () => {
      const normalizeNode = (node) => {
        if (!node) return null
        if (node.field && node.operator) {
          if (node.value === undefined || node.value === null || node.value === '') return null
          
          const normalizedValue = normalizeValue(node.field, node.operator, node.value)
          if (normalizedValue === null) return null
          
          const out = {
            field: node.field,
            operator: node.operator,
            value: normalizedValue
          }
          if (node.negate) out.negate = true
          return out
        }
        if (Array.isArray(node.conditions)) {
          const children = node.conditions.map(normalizeNode).filter(Boolean)
          if (children.length === 0) return null
          return { logic: node.logic || 'AND', conditions: children }
        }
        return null
      }
      const normalized = normalizeNode(filtersRoot.value)
      return normalized
    }

    // 不同字段对应的可选操作符
    const operatorOptionsByField = computed(() => ({
      timestamp: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: t('batchAnalysis.between'), value: 'between' }
      ],
      error_code: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: t('batchAnalysis.contains'), value: 'contains' },
        { label: t('batchAnalysis.notContains'), value: 'notcontains' },
        { label: t('batchAnalysis.regex'), value: 'regex' },
        { label: t('batchAnalysis.startsWith'), value: 'startsWith' },
        { label: t('batchAnalysis.endsWith'), value: 'endsWith' }
      ],
      param1: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: t('batchAnalysis.between'), value: 'between' }
      ],
      param2: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: t('batchAnalysis.between'), value: 'between' }
      ],
      param3: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: t('batchAnalysis.between'), value: 'between' }
      ],
      param4: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: t('batchAnalysis.between'), value: 'between' }
      ],
      explanation: [
        { label: t('batchAnalysis.contains'), value: 'contains' }
      ]
    }))

    const defaultOperatorOptions = [
      { label: '=', value: '=' },
      { label: '!=', value: '!=' }
    ]

    const getOperatorOptions = (field) => {
      if (!field) return defaultOperatorOptions
      return operatorOptionsByField.value[field] || defaultOperatorOptions
    }

    const onFieldChange = (cond) => {
      if (!cond) return
      const options = getOperatorOptions(cond.field)
      // 若当前操作符不在可选集合内，重置为第一个
      if (!options.some(o => o.value === cond.operator)) {
        cond.operator = options[0]?.value
      }
      // 值类型重置
      if (String(cond.operator).toLowerCase() === 'between') {
        cond.value = Array.isArray(cond.value) ? cond.value.slice(0, 2) : ['', '']
      } else {
        cond.value = Array.isArray(cond.value) ? cond.value.join(',') : (cond.value ?? '')
      }
    }

    const addConditionToGroup = (group) => {
      if (!group.conditions) group.conditions = []
      group.conditions.push({ field: 'error_code', operator: 'contains', value: '' })
    }
    const addGroupToGroup = (group) => {
      if (!group.conditions) group.conditions = []
      group.conditions.push({ logic: 'AND', conditions: [] })
    }
    const removeNodeAt = (group, idx) => {
      if (Array.isArray(group.conditions) && idx >= 0 && idx < group.conditions.length) {
        group.conditions.splice(idx, 1)
      }
    }
    // 侧边栏打开时：同步已应用状态到待提交（表单显示当前生效的配置）
    const syncAppliedToPending = () => {
      pendingSelectedAnalysisCategoryIds.value = [...(selectedAnalysisCategoryIds.value || [])]
      pendingFiltersRoot.value = deepCloneFilters(filtersRoot.value)
      pendingDisplayTimezoneOffsetMinutes.value = displayTimezoneOffsetMinutes.value
    }
    watch(filterDrawerVisible, (visible) => {
      if (visible) syncAppliedToPending()
    })

    // 时区变化后刷新可视化图表（轴刻度/tooltip 需要重新格式化）
    watch(displayTimezoneOffsetMinutes, () => {
      if (!chartDetailVisible.value || !currentChartData.value) return
      nextTick(() => {
        showChartDetail(currentChartData.value)
      })
    })

    // 应用：待提交 → 已应用，并请求列表
    const applySidebarFilters = async () => {
      selectedAnalysisCategoryIds.value = [...pendingSelectedAnalysisCategoryIds.value]
      filtersRoot.value = deepCloneFilters(pendingFiltersRoot.value)
      displayTimezoneOffsetMinutes.value = pendingDisplayTimezoneOffsetMinutes.value
      advancedMode.value = pendingLeafConditionCount.value > 0
      currentPage.value = 1
      await loadBatchLogEntries(1, true)
      await fetchFilteredStatistics()
      // action（高亮/标记/统计）在筛选生效后再应用
      nlAppliedActions.value = [...(pendingNlActions.value || [])]
      // NL mark 写入 row.color_mark + sessionStorage（与手动标记同一存储）
      materializeNlMarksToStorage()
      saveNlMarkActionsToStorage()
    }

    // 重置：已应用 → 待提交（丢弃未应用的修改）
    const resetSidebarFilters = () => {
      syncAppliedToPending()
      clearNlAppliedActions()
    }

    const applyAdvancedFilters = async () => {
      await applySidebarFilters()
    }

    // 保存颜色标记到 sessionStorage（与已有数据合并，避免翻页后只保存当前页导致其他页标记丢失）
    const saveColorMarksToStorage = () => {
      let colorMarks = {}
      try {
        const stored = sessionStorage.getItem('batchLogColorMarks')
        if (stored) colorMarks = JSON.parse(stored) || {}
      } catch (_) {}
      batchLogEntries.value.forEach(entry => {
        if (entry.color_mark) {
          colorMarks[entry.id] = entry.color_mark
        } else if (Object.prototype.hasOwnProperty.call(colorMarks, entry.id)) {
          delete colorMarks[entry.id]
        }
      })
      sessionStorage.setItem('batchLogColorMarks', JSON.stringify(colorMarks))
    }

    // 从sessionStorage加载颜色标记
    const loadColorMarksFromStorage = () => {
      try {
        const stored = sessionStorage.getItem('batchLogColorMarks')
        if (stored) {
          const colorMarks = JSON.parse(stored)
          batchLogEntries.value.forEach(entry => {
            if (colorMarks[entry.id]) {
              entry.color_mark = colorMarks[entry.id]
            }
          })
        }
      } catch (error) {
        console.error('加载颜色标记失败:', error)
      }
    }

    // 将 NL mark 结果写入 row.color_mark + sessionStorage（与手动标记同一存储）
    const materializeNlMarksToStorage = () => {
      const marks = nlMarkActions.value
      if (!marks.length) return
      let changed = false
      batchLogEntries.value.forEach(entry => {
        if (entry.color_mark) return
        for (const { colorHex, scope } of marks) {
          if (rowMatchesMarkScope(scope, entry)) {
            entry.color_mark = colorHex
            changed = true
            break
          }
        }
      })
      if (changed) saveColorMarksToStorage()
    }

    const BATCH_LOG_NL_MARK_KEY = 'batchLogNlMarkActions'
    const saveNlMarkActionsToStorage = () => {
      const marks = (nlAppliedActions.value || []).filter((a) => a && a.type === 'mark')
      if (marks.length > 0) {
        sessionStorage.setItem(BATCH_LOG_NL_MARK_KEY, JSON.stringify(marks))
      } else {
        sessionStorage.removeItem(BATCH_LOG_NL_MARK_KEY)
      }
    }
    const loadNlMarkActionsFromStorage = () => {
      try {
        const stored = sessionStorage.getItem(BATCH_LOG_NL_MARK_KEY)
        if (stored) {
          const marks = JSON.parse(stored)
          if (Array.isArray(marks) && marks.length > 0) {
            const rest = (nlAppliedActions.value || []).filter((a) => a && a.type !== 'mark')
            const pendRest = (pendingNlActions.value || []).filter((a) => a && a.type !== 'mark')
            nlAppliedActions.value = [...rest, ...marks]
            pendingNlActions.value = [...pendRest, ...marks]
          }
        }
      } catch (_) {}
    }

    // 处理颜色变化
    const selectColor = (row, colorValue) => {
      // 如果点击的是当前选中的颜色，则取消选择
      if (row.color_mark === colorValue) {
        row.color_mark = null
      } else {
        row.color_mark = colorValue
      }
      
      // 保存到sessionStorage
      saveColorMarksToStorage()
      // 强制触发响应式更新
      nextTick(() => {
        // 确保颜色变化能够触发行样式更新
      })
      // TODO: 保存颜色标记到后端
    }

    const hexToRgba = (hex, alpha = 0.2) => {
      if (!hex || typeof hex !== 'string') return ''
      const h = hex.replace(/^#/, '')
      if (h.length !== 6) return ''
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }

    // 根据颜色标记设置行的样式类（手动 + NL mark 均存入 row.color_mark）
    const getRowClassName = ({ row }) => {
      const color = getColorForRow(row)
      if (color) {
        switch (color) {
          case '#ff0000': return 'row-marked-red'
          case '#ffff00': return 'row-marked-yellow'
          case '#0000ff': return 'row-marked-blue'
          case '#00ff00': return 'row-marked-green'
          case '#800080': return 'row-marked-purple'
          default: return ''
        }
      }
      return ''
    }

    // 根据颜色标记设置行的内联样式
    const getRowStyle = ({ row }) => {
      const color = getColorForRow(row)
      if (color) {
        return { backgroundColor: hexToRgba(color, 0.2) }
      }
      return {}
    }

    // 自然语言 highlight 动作：对指定列加高亮 class
    const getCellClassName = ({ column }) => {
      const terms = nlHighlightTerms.value || []
      if (!terms.length) return ''
      const prop = column?.property || ''
      if (prop === 'error_code' && terms.includes('error_code')) return 'nl-highlight-cell'
      if (prop === 'explanation' && terms.includes('explanation')) return 'nl-highlight-cell'
      if (prop === 'parameters' && ['param1', 'param2', 'param3', 'param4'].some((p) => terms.includes(p))) return 'nl-highlight-cell'
      if ((prop === 'file_info' || prop === 'timestamp') && terms.includes('timestamp')) return 'nl-highlight-cell'
      return ''
    }

    // 操作按钮处理方法

    const handleContextAnalysis = (row) => {
      console.log('上下文分析:', row)
      contextAnalysisRow.value = row
      contextAnalysisVisible.value = true
    }

    const handleLogCapture = (row) => {
      console.log('日志摘取:', row)
      
      // 检查是否已达到最大数量
      if (clipboardEntries.value.length >= maxClipboardEntries) {
        ElMessage.warning(t('batchAnalysis.clipboardMaxEntries', { max: maxClipboardEntries }))
        return
      }
      
      // 允许重复添加（不再与参数绑定）
      clipboardEntries.value.push({
        id: row.id,
        timestamp: row.timestamp,
        error_code: row.error_code,
        explanation: row.explanation
      })
      
      // 直接将纯文本附加到摘取板（不包含参数），时间戳按当前时区显示
      const timestamp = formatTimestampWithTimezone(row.timestamp, displayTimezoneOffsetMinutes.value) || formatTimestamp(row.timestamp)
      const line = `${timestamp} ${row.error_code} ${row.explanation}`.trim()
      clipboardContent.value = (clipboardContent.value ? clipboardContent.value + '\n' : '') + line
      
      // 切换到"日志摘取"选项卡并显示侧边栏
      sidebarActiveTab.value = 'logs'
      clipboardVisible.value = true
      
      ElMessage.success(t('batchAnalysis.clipboardAdded', { current: clipboardEntries.value.length, max: maxClipboardEntries }))
    }

    // 更新剪贴板内容
    const updateClipboardContent = () => {
      // 保留函数以兼容旧逻辑，但不再覆盖用户编辑内容
      // 如需从条目重建文本，可在此处实现
    }

    // 清空剪贴板
    const clearClipboard = () => {
      clipboardEntries.value = []
      clipboardContent.value = ''
      ElMessage.success(t('batchAnalysis.clipboardCleared'))
    }

    const removeFromClipboard = (id) => {
      const idx = clipboardEntries.value.findIndex(e => e.id === id)
      if (idx > -1) {
        clipboardEntries.value.splice(idx, 1)
        updateClipboardContent()
      }
    }


    // 导出剪贴板内容为txt文件
    const exportClipboardToTxt = () => {
      if (!clipboardContent.value) {
        ElMessage.warning(t('batchAnalysis.clipboardEmpty'))
        return
      }
      
      const blob = new Blob([clipboardContent.value], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${t('batchAnalysis.clipboardExportFileName')}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      ElMessage.success(t('batchAnalysis.clipboardExported'))
    }

    // 保存剪贴板编辑内容
    const saveClipboardContent = () => {
      try {
      sessionStorage.setItem('clipboardContent', clipboardContent.value)
        ElMessage.success(t('batchAnalysis.clipboardSaved'))
      } catch (error) {
        console.error('保存剪贴板内容失败:', error)
        ElMessage.error(t('batchAnalysis.clipboardSaveFailed'))
      }
    }

    // 加载保存的剪贴板内容
    const loadClipboardContent = () => {
      try {
        const saved = sessionStorage.getItem('clipboardContent')
        if (saved !== null) {
          clipboardContent.value = saved
        }
      } catch (error) {
        console.error('加载剪贴板内容失败:', error)
      }
    }

    // 显示剪贴板
    const showClipboard = () => {
      clipboardVisible.value = true
    }

    // 可视化功能
    const handleVisualization = async (row) => {
      // 记录各参数是否可用（同步，保证快速响应）
      const params = [row.param1, row.param2, row.param3, row.param4]
      paramAvailability.value = params.map(p => !!(p && String(p).trim()))
      if (!paramAvailability.value.some(v => v)) {
        ElMessage.warning(t('batchAnalysis.noAvailableParams'))
        return
      }
      
      // 先以默认名称和当前值即时展示
      availableParameters.value = params.map(p => (p && String(p).trim()) ? String(p).trim() : '')
      paramNames.value = [t('batchAnalysis.param1'), t('batchAnalysis.param2'), t('batchAnalysis.param3'), t('batchAnalysis.param4')]
      currentVisualizationRow.value = row
      selectedParameter.value = null
      selectKey.value++
      nextTick(() => { activeParamPopoverRowId.value = row.id })
      // 点击外部区域关闭：注册一次性 document 点击监听
      const closeOnOutsideClick = (e) => {
        // 如果已经关闭，移除监听
        if (activeParamPopoverRowId.value !== row.id) {
          document.removeEventListener('click', closeOnOutsideClick, true)
          return
        }
        // 点击在参数按钮或 Popover 内部则忽略
        const target = e.target
        const btn = target && target.closest && target.closest('.visualization-btn')
        const pop = target && target.closest && target.closest('.el-popover')
        if (btn || pop) return
        // 关闭并移除监听
        activeParamPopoverRowId.value = null
        document.removeEventListener('click', closeOnOutsideClick, true)
      }
      // 捕获阶段监听，优先于内部处理
      document.addEventListener('click', closeOnOutsideClick, true)

      // 后台异步获取更精准的参数名称，返回后再更新；加载完成前不渲染单选项
      paramNamesLoading.value = true
      try {
        const fullErrorCode = row.error_code?.toUpperCase?.() || ''
        let errorCodeToQuery = fullErrorCode
        let subsystemToQuery = 1
        if (fullErrorCode.length === 7 && /^[1-9A][0-9A-F]{6}$/.test(fullErrorCode)) {
          subsystemToQuery = fullErrorCode.charAt(0)
          const faultCodePart = fullErrorCode.substring(3)
          errorCodeToQuery = `0X${faultCodePart}`
        } else if (fullErrorCode.length >= 6 && /^[1-9A]0X[0-9A-F]{3}[ABCDE]$/.test(fullErrorCode)) {
          subsystemToQuery = fullErrorCode.charAt(0)
          errorCodeToQuery = fullErrorCode.substring(1)
        } else if (/^0X[0-9A-F]{3}[ABCDE]$/.test(fullErrorCode)) {
          errorCodeToQuery = fullErrorCode
        }
        const resp = await api.errorCodes.getByCodeAndSubsystem(errorCodeToQuery, subsystemToQuery)
        const info = resp?.data?.errorCode
        if (info) {
          paramNames.value = [
            info.param1 || '参数1',
            info.param2 || '参数2',
            info.param3 || '参数3',
            info.param4 || '参数4'
          ]
        }
      } catch (e) {
        console.warn('获取故障码参数名称失败，继续使用默认名称')
      } finally {
        // 仅当仍是当前行的弹出层，才结束loading
        if (activeParamPopoverRowId.value === row.id) {
          paramNamesLoading.value = false
        }
      }
    }

    const isParameterAvailable = (idx) => {
      // idx 为 1-4
      return !!paramAvailability.value[idx - 1]
    }

    const confirmVisualization = () => {
      if (!selectedParameter.value) {
        ElMessage.warning(t('batchAnalysis.visualizationSelectParameter'))
        return
      }
      
      activeParamPopoverRowId.value = null
      generateChart()
    }

    const generateChart = async () => {
      if (!currentVisualizationRow.value) return
      const row = currentVisualizationRow.value
      // 先打开弹窗，再异步获取数据供子组件渲染
        chartDetailVisible.value = true
        await createChart(row)
    }

    const createChart = async (row) => {
      try {
        ElMessage.info(t('batchAnalysis.visualizationLoading'))
        const logIds = selectedLogs.value.map(l => l.id).join(',')
        const paramIndex = selectedParameter.value
        const fullErrorCode = row.error_code.toUpperCase()
        let subsystemToQuery = 1
        if (fullErrorCode.length === 7 && /^[1-9A][0-9A-F]{6}$/.test(fullErrorCode)) {
          subsystemToQuery = fullErrorCode.charAt(0)
        } else if (fullErrorCode.length >= 6 && /^[1-9A]0X[0-9A-F]{3}[ABCDE]$/.test(fullErrorCode)) {
          subsystemToQuery = fullErrorCode.charAt(0)
        }
        const visualizationParams = {
          log_ids: logIds,
          error_code: row.error_code,
          parameter_index: paramIndex,
          subsystem: subsystemToQuery,
          display_timezone_offset_minutes: displayTimezoneOffsetMinutes.value
        }
        // 加入当前筛选条件（与列表加载保持一致）
        if (advancedMode.value && leafConditionCount.value > 0) {
          const filtersPayload = buildFiltersPayload()
          if (filtersPayload) {
            visualizationParams.filters = JSON.stringify(filtersPayload)
          }
        }
        if (timeRange.value && Array.isArray(timeRange.value)) {
          visualizationParams.start_time = timeRange.value[0]
          visualizationParams.end_time = timeRange.value[1]
        }
        if (searchKeyword.value) {
          visualizationParams.search = searchKeyword.value
        }
        const response = await api.logs.getVisualizationData(visualizationParams)
        const {
          chartData,
          chartTitle: apiChartTitle,
          paramName,
          timezoneApplied,
          displayTimezoneOffsetMinutes: responseDisplayOffset
        } = response.data.data
        if (!Array.isArray(chartData) || chartData.length === 0) {
          ElMessage.warning(t('batchAnalysis.visualizationNoData'))
          return
        }
        chartTitle.value = apiChartTitle
        const validData = chartData
        currentChartData.value = {
            id: `chart_${Date.now()}`,
            title: apiChartTitle,
            timestamp: new Date().toISOString(),
            parameter: selectedParameter.value,
            parameterValue: paramName,
            data: validData,
          errorCode: row.error_code,
          timezoneApplied: !!timezoneApplied,
          displayTimezoneOffsetMinutes: responseDisplayOffset ?? null
          }
          addChartToSidebar()
        ElMessage.success(t('batchAnalysis.visualizationDataRetrieved', { count: chartData.length }))
        } catch (error) {
        ElMessage.error(t('batchAnalysis.visualizationDataFailed', { message: error?.response?.data?.message || error.message }))
      }
    }

    const addChartToSidebar = () => {
      if (!currentChartData.value) return
      
      // 检查是否已达到最大数量限制
      if (chartThumbnails.value.length >= 5) {
        ElMessage.warning(t('batchAnalysis.visualizationMaxCharts'))
        return
      }
      
      // 为图表添加序号
      const chartNumber = chartThumbnails.value.length + 1
      const chartWithNumber = { ...currentChartData.value, title: currentChartData.value.title }
      
      // 将图表添加到缩略图列表
      chartThumbnails.value.push(chartWithNumber)
      
      // 切换到"可视化"选项卡并显示剪贴板
      sidebarActiveTab.value = 'charts'
      clipboardVisible.value = true
      
      // 使用双重nextTick确保DOM完全渲染
      nextTick(() => {
        nextTick(() => {
          // 添加延迟确保DOM元素完全准备好
          setTimeout(() => {
            createChartThumbnail(chartWithNumber)
          }, 100)
        })
      })
      
      ElMessage.success(t('batchAnalysis.visualizationChartAdded'))
    }

    const createChartThumbnail = (chartData) => {
      try {
        const thumbnailElement = document.getElementById(`chart-thumb-${chartData.id}`)
        if (!thumbnailElement) {
          console.warn(`缩略图元素未找到: chart-thumb-${chartData.id}`)
          return
        }
        
        // 检查元素是否有尺寸
        if (thumbnailElement.offsetWidth === 0 || thumbnailElement.offsetHeight === 0) {
          console.warn(`缩略图元素尺寸为0: ${thumbnailElement.offsetWidth}x${thumbnailElement.offsetHeight}`)
          // 延迟重试
          setTimeout(() => createChartThumbnail(chartData), 200)
          return
        }
        
        // 销毁已存在的实例
        const existingInstance = echarts.getInstanceByDom(thumbnailElement)
        if (existingInstance) {
          existingInstance.dispose()
        }
        
        const thumbnailInstance = echarts.init(thumbnailElement)
        
        // 创建缩略图配置 - 更饱满的布局
        const minX = Math.min(...chartData.data.map(d => d[0]))
        const maxX = Math.max(...chartData.data.map(d => d[0]))
        const thumbnailOption = {
          grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: false },
          title: undefined,
          tooltip: { show: false },
          xAxis: {
            type: 'time',
            boundaryGap: false,
            axisLabel: { show: false },
            axisLine: { show: false },
            axisTick: { show: false },
            min: minX,
            max: maxX
          },
          yAxis: {
            type: 'value',
            boundaryGap: [0, '5%'],
            axisLabel: { show: false },
            axisLine: { show: false },
            axisTick: { show: false },
            min: 'dataMin',
            max: 'dataMax',
            scale: true
          },
          series: [{
            name: `${chartData.parameterValue}`,
            type: 'line',
            symbol: 'circle',
            symbolSize: 2,
            sampling: false,
            lineStyle: { width: 1.5, color: '#409EFF' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(64,158,255,0.22)' },
                { offset: 1, color: 'rgba(64,158,255,0.04)' }
              ])
            },
            data: chartData.data
          }]
        }
        
        thumbnailInstance.setOption(thumbnailOption)
        
        // 监听窗口大小变化
        const resizeHandler = () => {
          if (thumbnailInstance && !thumbnailInstance.isDisposed()) {
            thumbnailInstance.resize()
          }
        }
        
        window.addEventListener('resize', resizeHandler)
        
        // 存储实例引用以便后续清理
        thumbnailElement._echartsInstance = thumbnailInstance
        thumbnailElement._resizeHandler = resizeHandler
        
      } catch (error) {
        console.error('创建缩略图失败:', error)
      }
    }

    const showChartDetail = (chartData) => {
      // 设置全局错误处理来捕获 ECharts 内部错误
      const originalConsoleError = console.error
      const originalError = window.onerror
      
      console.error = function(...args) {
        const errorMessage = args.join(' ')
        if (errorMessage.includes('dataSample') || 
            errorMessage.includes('Cannot read properties of undefined') ||
            errorMessage.includes('reading \'type\'')) {
          // 静默处理ECharts内部错误
          return
        }
        originalConsoleError.apply(console, args)
      }
      
      window.onerror = function(msg, url, line, col, error) {
        if (msg && msg.includes && msg.includes('Cannot read properties of undefined') && 
            msg.includes('reading \'type\'')) {
          // 静默处理ECharts内部错误
          return true
        }
        if (originalError) {
          return originalError(msg, url, line, col, error)
        }
        return false
      }
      
      // 设置当前图表数据
      currentChartData.value = chartData
      chartTitle.value = chartData.title
      
      // 显示图表详情弹窗
      chartDetailVisible.value = true
      
      // 等待对话框完全打开后再初始化图表，避免容器为 0x0
      nextTick(() => {
        setTimeout(() => {
        if (chartInstance.value) {
          chartInstance.value.dispose()
          chartInstance.value = null
        }
        const chartElement = document.getElementById('visualizationChart')
          if (!chartElement) return
          if (chartElement.offsetWidth === 0 || chartElement.offsetHeight === 0) {
            // 再等一帧
            setTimeout(() => createChart(chartData), 50)
            return
          }
          chartInstance.value = echarts.init(chartElement)
          
          // 验证图表数据
          if (!chartData.data || !Array.isArray(chartData.data) || chartData.data.length === 0) {
            ElMessage.error('图表数据无效')
            return
          }
          
          // 验证数据格式
          const validData = chartData.data.filter(item => 
            Array.isArray(item) && 
            item.length >= 2 && 
            typeof item[0] === 'number' && 
            typeof item[1] === 'number' &&
            !isNaN(item[0]) && 
            !isNaN(item[1]) &&
            isFinite(item[0]) && 
            isFinite(item[1])
          )
          
          if (validData.length === 0) {
            ElMessage.error('没有有效的图表数据')
            return
          }
          
          // 统一将时间值归一化为毫秒（后端如返回秒级时间戳，也能正确绘图/标注）
          const toMs = (v) => {
            if (v == null) return NaN
            if (v instanceof Date) return v.getTime()
            if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
            return Number(new Date(v))
          }
          const validDataMs = validData
            .map(d => [toMs(d[0]), d[1]])
            .filter(d => Array.isArray(d) && d.length >= 2 && Number.isFinite(d[0]) && Number.isFinite(d[1]))

          if (validDataMs.length === 0) {
            ElMessage.error('没有有效的图表数据')
            return
          }
          // 图表时间格式化：统一按当前显示时区输出（不复用 formatTimestampWithTimezone 的 “offset=480 返回空串” 规则）
          // 存储时区约定：数据库存的是无时区的"字面时间"，默认约定为UTC+8
          // 当displayTimezoneOffsetMinutes=480时，显示原始时间（不转换）
          // 当displayTimezoneOffsetMinutes=其他值时，做相对于存储时区(480)的转换
          const STORAGE_OFFSET_MINUTES = 480
          // 用户期望显示的时区相对于存储时区的偏移
          const displayRelativeOffset = displayTimezoneOffsetMinutes.value - STORAGE_OFFSET_MINUTES

          // 图表时间格式化（用于tooltip和axisLabel）
          // 使用 type:'value' 的x轴，ECharts不做时区转换，完全由formatter控制显示
          const chartTimeLabel = (value) => {
            const ms = toMs(value)
            if (!Number.isFinite(ms)) return ''
            // offset=480时显示原始时间，其他值时做相对转换
            const displayMs = ms + displayRelativeOffset * 60 * 1000
            const d = new Date(displayMs)
            const yy = d.getUTCFullYear()
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
            const dd = String(d.getUTCDate()).padStart(2, '0')
            const hh = String(d.getUTCHours()).padStart(2, '0')
            const mi = String(d.getUTCMinutes()).padStart(2, '0')
            const ss = String(d.getUTCSeconds()).padStart(2, '0')
            return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`
          }
          
          // 重新创建完整图表 - 完全匹配 ECharts 官方时间轴面积图示例
          const option = {
            title: undefined,
            tooltip: {
              trigger: 'axis',
              position: function (pt) {
                return [pt[0], '10%'];
              },
              formatter: (params) => {
                if (!Array.isArray(params) || params.length === 0) return ''
                const t = params[0].axisValue
                const timeStr = chartTimeLabel(t)
                const seriesLines = params.map(p => {
                  const v = Array.isArray(p.value) ? p.value[1] : p.value
                  return p.marker + ' ' + (p.seriesName || '') + ': ' + v
                })
                return timeStr + '<br/>' + seriesLines.join('<br/>')
              }
            },
            legend: undefined,
            toolbox: {
              feature: {
                dataZoom: {
                  yAxisIndex: 'none'
                },
                restore: {},
                saveAsImage: {}
              }
            },
            xAxis: {
              type: 'value',  // 使用value类型，避免ECharts的时区转换
              boundaryGap: false,
              min: Math.min(...validDataMs.map(d => d[0])),
              max: Math.max(...validDataMs.map(d => d[0])),
              axisLabel: {
                formatter: chartTimeLabel
              }
            },
            yAxis: {
              type: 'value',
              boundaryGap: [0, '100%']
            },
            dataZoom: [
              {
                type: 'inside',
                start: 0,
                end: 100,
                realtime: true,
                throttle: 100,
                zoomLock: false,
                xAxisIndex: 0,
                filterMode: 'filter',
                preventDefaultMouseMove: true
              },
              {
                type: 'slider',
                start: 0,
                end: 100,
                realtime: true,
                throttle: 100,
                zoomLock: false,
                showDetail: true,
                showDataShadow: true,
                xAxisIndex: 0,
                bottom: 10,
                filterMode: 'filter',
                moveHandleSize: 8,
                preventDefaultMouseMove: true,
                dataBackground: {
                  lineStyle: {
                    color: '#ddd'
                  },
                  areaStyle: {
                    color: '#f0f0f0'
                  }
                },
                selectedDataBackground: {
                  lineStyle: {
                    color: '#409EFF'
                  },
                  areaStyle: {
                    color: '#E6F7FF'
                  }
                }
              }
            ],
            series: [
              {
                name: chartData.parameterValue || '数据',
                type: 'line',
                symbol: 'circle',
                symbolSize: 2,
                sampling: false,
                itemStyle: {
                  color: 'rgb(255, 70, 131)'
                },
                areaStyle: {
                  color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [{
                      offset: 0, color: 'rgb(255, 158, 68)'
                    }, {
                      offset: 1, color: 'rgb(255, 70, 131)'
                    }],
                    global: false
                  }
                },
                data: validDataMs
              }
            ]
          }
          
          // 设置全局错误处理
          const originalError = window.onerror
          window.onerror = function(msg, url, line, col, error) {
            if (msg && msg.includes && msg.includes('Cannot read properties of undefined') && 
                msg.includes('reading \'type\'')) {
              // 静默处理ECharts内部错误
              return true
            }
            if (originalError) {
              return originalError(msg, url, line, col, error)
            }
            return false
          }
          
          try {
            // 安全初始化流程
            nextTick(() => {
              try {
                // 确保图表实例存在且未销毁
                if (!chartInstance.value || chartInstance.value.isDisposed()) {
                  console.error('图表实例无效')
                  return
                }
                
                // 清除之前的配置
                chartInstance.value.clear()
                
                // 设置新配置
                chartInstance.value.setOption(option, true)
                
                // 强制刷新图表以确保 dataZoom 正常工作
                setTimeout(() => {
                  try {
                    if (chartInstance.value && !chartInstance.value.isDisposed()) {
                      // 检查图表组件是否正确初始化
                      const model = chartInstance.value.getModel()
                      if (model && model.getComponent('series', 0)) {
                        chartInstance.value.resize()
                        
                        // 强制触发 dataZoom 更新
                        setTimeout(() => {
                          if (chartInstance.value && !chartInstance.value.isDisposed()) {
                            chartInstance.value.dispatchAction({
                              type: 'dataZoom',
                              start: 0,
                              end: 100
                            })
                          }
                        }, 50)
                      } else {
                        console.warn('图表详情组件初始化不完整')
                      }
                    }
                  } catch (resizeError) {
                    console.warn('图表详情调整大小失败:', resizeError)
                  }
                }, 100)
                
              } catch (error) {
                console.warn('图表详情初始化警告:', error)
                // 使用最简单的配置重试
                try {
                  const simpleOption = {
                    xAxis: { type: 'time' },
                    yAxis: { type: 'value' },
                    series: [{ 
                      name: '数据',
                      type: 'line', 
                      data: validData,
                      sampling: false
                    }],
                    animation: false
                  }
                  chartInstance.value.clear()
                  chartInstance.value.setOption(simpleOption, true)
                } catch (simpleError) {
                  console.error('图表详情初始化失败:', simpleError)
                  ElMessage.error('图表详情初始化失败，请重试')
                }
              }
            })
          } finally {
            // 恢复原始的 window.onerror
            setTimeout(() => {
              window.onerror = originalError
            }, 1000)
          }
      }, 50)
      })
      
      // 恢复原始的 console.error 和 window.onerror
      setTimeout(() => {
        console.error = originalConsoleError
        window.onerror = originalError
      }, 2000)
    }

    const deleteChartThumbnail = (chartId) => {
      const index = chartThumbnails.value.findIndex(chart => chart.id === chartId)
      if (index > -1) {
        // 清理ECharts实例
        const thumbnailElement = document.getElementById(`chart-thumb-${chartId}`)
        if (thumbnailElement) {
          // 清理事件监听器
          if (thumbnailElement._resizeHandler) {
            window.removeEventListener('resize', thumbnailElement._resizeHandler)
          }
          
          // 销毁ECharts实例
          if (thumbnailElement._echartsInstance) {
            thumbnailElement._echartsInstance.dispose()
          }
        }
        
        chartThumbnails.value.splice(index, 1)
        
        // 重新编号剩余的图表
        chartThumbnails.value.forEach((chart) => {
          chart.title = chart.title.replace(/^\d+\.\s*/, '')
        })
        
        ElMessage.success(t('batchAnalysis.chartDeleted'))
      }
    }

    const deleteCurrentChart = () => {
      if (currentChartData.value) {
        deleteChartThumbnail(currentChartData.value.id)
        chartDetailVisible.value = false
        if (chartInstance.value) {
          chartInstance.value.dispose()
          chartInstance.value = null
        }
      }
    }

    const onChartDialogOpened = () => {
      nextTick(() => {
        const updateChartHeight = () => {
          if (chartContainer.value) {
            const h = chartContainer.value.offsetHeight
            if (h > 0) chartDetailHeight.value = h
          }
        }
        updateChartHeight()
        setTimeout(updateChartHeight, 50)
        const chartElement = document.getElementById('visualizationChart')
        if (!chartElement) return
        if (chartElement.offsetWidth === 0 || chartElement.offsetHeight === 0) {
          setTimeout(onChartDialogOpened, 50)
          return
        }
        if (chartInstance.value) {
          chartInstance.value.dispose()
          chartInstance.value = null
        }
        chartInstance.value = echarts.init(chartElement)
        if (currentChartData.value && Array.isArray(currentChartData.value.data)) {
          const validData = currentChartData.value.data.filter(item => 
            Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number'
          )
          if (validData.length === 0) return
          const option = {
            title: undefined,
            tooltip: { trigger: 'axis', position: (pt) => [pt[0], '10%'] },
            legend: undefined,
            toolbox: { feature: { dataZoom: { yAxisIndex: 'none' }, restore: {}, saveAsImage: {} } },
            xAxis: { type: 'time', boundaryGap: false, min: Math.min(...validData.map(d => d[0])), max: Math.max(...validData.map(d => d[0])) },
            yAxis: { type: 'value', boundaryGap: [0, '100%'] },
            dataZoom: [
              { type: 'inside', start: 0, end: 100, realtime: true, throttle: 100, zoomLock: false, xAxisIndex: 0, filterMode: 'filter', preventDefaultMouseMove: true },
              { type: 'slider', start: 0, end: 100, realtime: true, throttle: 100, zoomLock: false, showDetail: true, showDataShadow: true, xAxisIndex: 0, bottom: 10, filterMode: 'filter', moveHandleSize: 8, preventDefaultMouseMove: true }
            ],
            series: [ { name: '数据', type: 'line', symbol: 'circle', symbolSize: 2, sampling: false, data: validData } ]
          }
          chartInstance.value.setOption(option, true)
          setTimeout(() => {
            try {
            if (chartInstance.value && !chartInstance.value.isDisposed()) {
                const model2 = chartInstance.value.getModel && chartInstance.value.getModel()
                if (model2 && model2.getComponent && model2.getComponent('dataZoom', 0)) {
              chartInstance.value.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
                }
              }
            } catch (e) {
              console.warn('图表详情 dataZoom 动作失败:', e)
            }
          }, 50)
        }
      })
    }

    const exportChartAsImage = () => {
      if (!chartInstance.value) {
        ElMessage.error('图表实例未找到')
        return
      }
      
      try {
        // 使用ECharts的getDataURL方法导出图片
        const dataURL = chartInstance.value.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#fff'
        })
        
        // 创建下载链接
        const link = document.createElement('a')
        link.download = `chart_${new Date().getTime()}.png`
        link.href = dataURL
        link.click()
        
        ElMessage.success('图表已导出为图片')
      } catch (error) {
        console.error('导出图表失败:', error)
        ElMessage.error('导出图表失败')
      }
    }



    // 备注功能已下线：保留占位注释以便后续需要时恢复
    const toggleColorPopover = (row) => {
      activeColorPopoverRowId.value = activeColorPopoverRowId.value === row.id ? null : row.id
      const currentId = row.id
      const closeOnOutsideClick = (e) => {
        if (activeColorPopoverRowId.value !== currentId) {
          document.removeEventListener('click', closeOnOutsideClick, true)
          return
        }
        const target = e.target
        const refEl = target && target.closest && target.closest('.color-indicator')
        const pop = target && target.closest && target.closest('.el-popover')
        if (refEl || pop) return
        activeColorPopoverRowId.value = null
        document.removeEventListener('click', closeOnOutsideClick, true)
      }
      document.addEventListener('click', closeOnOutsideClick, true)
    }

    // 生成与 loadBatchLogEntries 一致的请求参数（用于按页拉取）
    const buildBatchFetchParams = (page) => {
      const logIds = selectedLogs.value.map(l => l.id).join(',')
      const baseParams = { log_ids: logIds, page, limit: pageSize.value, include_ungraded: true }
      if (advancedMode.value && leafConditionCount.value > 0) {
        const filtersPayload = buildFiltersPayload()
        if (filtersPayload) baseParams.filters = JSON.stringify(filtersPayload)
      }
      if (timeRange.value && timeRange.value.length === 2) {
        baseParams.start_time = timeRange.value[0]
        baseParams.end_time = timeRange.value[1]
      }
      if (searchKeyword.value) baseParams.search = searchKeyword.value
      if (selectedAnalysisCategoryIds.value?.length) {
        baseParams.analysis_category_ids = selectedAnalysisCategoryIds.value.join(',')
      }
      return baseParams
    }

    const MAX_PAGES_FOR_MARK_ALL = 20
    const MARK_ALL_PAGE_DELAY_MS = 400

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    const mergeColorMarksForIds = (allIdsToMark, colorValue) => {
      let colorMarks = {}
      try {
        const stored = sessionStorage.getItem('batchLogColorMarks')
        if (stored) colorMarks = JSON.parse(stored) || {}
      } catch (_) {}
      const val = colorValue ?? null
      allIdsToMark.forEach(id => {
        if (val) colorMarks[id] = val
        else delete colorMarks[id]
      })
      sessionStorage.setItem('batchLogColorMarks', JSON.stringify(colorMarks))
      batchLogEntries.value.forEach(entry => {
        entry.color_mark = colorValue ?? null
      })
    }

    // 表头「全部标记」：优先使用后端 ids_only 单次请求；失败时回退为逐页请求+延迟
    const clearNlMarkActions = () => {
      const marks = (nlAppliedActions.value || []).filter((a) => a && a.type !== 'mark')
      const pendMarks = (pendingNlActions.value || []).filter((a) => a && a.type !== 'mark')
      nlAppliedActions.value = marks
      pendingNlActions.value = pendMarks
      sessionStorage.removeItem(BATCH_LOG_NL_MARK_KEY)
    }

    const applyColorToAllFilteredRows = async (colorValue) => {
      const total = totalPages.value
      if (!total || total < 1) {
        const entries = batchLogEntries.value
        if (Array.isArray(entries) && entries.length > 0) {
          entries.forEach(entry => { entry.color_mark = colorValue ?? null })
          saveColorMarksToStorage()
        }
        if (colorValue == null) clearNlMarkActions()
        headerColorPopoverVisible.value = false
        return
      }
      const loadingMsg = ElMessage({ type: 'info', message: t('batchAnalysis.markAllLoading'), duration: 0 })
      try {
        let allIdsToMark = []
        const params = buildBatchFetchParams(1)
        delete params.page
        try {
          const res = await api.logs.getBatchEntryIds(params)
          const ids = res?.data?.ids
          if (Array.isArray(ids) && ids.length > 0) {
            allIdsToMark = ids.map((r) => `${r.log_id || 'log'}-${r.version || 1}-${r.row_index ?? 0}`)
            if (res.data.truncated) {
              ElMessage.warning(t('batchAnalysis.markAllIdsTruncated', { n: 50000 }))
            } else {
              ElMessage.success(t('batchAnalysis.markAllFilteredDone'))
            }
          }
        } catch (_) {
          allIdsToMark = []
        }
        if (allIdsToMark.length === 0) {
          const pagesToFetch = Math.min(total, MAX_PAGES_FOR_MARK_ALL)
          for (let p = 1; p <= pagesToFetch; p++) {
            if (p > 1) await delay(MARK_ALL_PAGE_DELAY_MS)
            const res = await store.dispatch('logs/fetchBatchLogEntries', buildBatchFetchParams(p))
            const entries = res?.data?.entries || []
            entries.forEach(entry => {
              allIdsToMark.push(`${entry.log_id || 'log'}-${entry.version || 1}-${entry.row_index ?? 0}`)
            })
          }
          if (pagesToFetch < total) {
            ElMessage.warning(t('batchAnalysis.markAllPagesLimited', { n: pagesToFetch, total }))
          } else {
            ElMessage.success(t('batchAnalysis.markAllFilteredDone'))
          }
        }
        loadingMsg.close()
        if (allIdsToMark.length > 0) {
          mergeColorMarksForIds(allIdsToMark, colorValue)
        }
      } catch (e) {
        loadingMsg.close()
        ElMessage.error(t('batchAnalysis.markAllFilteredFailed') || (e?.message || 'Mark all failed'))
      }
      if (colorValue == null) clearNlMarkActions()
      headerColorPopoverVisible.value = false
    }

    watch(headerColorPopoverVisible, (visible) => {
      if (!visible) return
      const closeOnOutsideClick = (e) => {
        const target = e.target
        const inTrigger = target && target.closest && target.closest('.header-color-indicator')
        const inPopover = target && target.closest && target.closest('.el-popover')
        if (inTrigger || inPopover) return
        headerColorPopoverVisible.value = false
        document.removeEventListener('click', closeOnOutsideClick, true)
      }
      nextTick(() => document.addEventListener('click', closeOnOutsideClick, true))
    })

    // 提示：formatTimeForDisplay 在备注功能中使用，已不再对外暴露

    // 保存备注到sessionStorage
    const saveRemarksToStorage = () => {
      const remarks = {}
      batchLogEntries.value.forEach(entry => {
        if (entry.remarks) {
          remarks[entry.id] = entry.remarks
        }
      })
      sessionStorage.setItem('batchLogRemarks', JSON.stringify(remarks))
    }

    // 从sessionStorage加载备注
    const loadRemarksFromStorage = () => {
      try {
        const stored = sessionStorage.getItem('batchLogRemarks')
        if (stored) {
          const remarks = JSON.parse(stored)
          batchLogEntries.value.forEach(entry => {
            if (remarks[entry.id]) {
              entry.remarks = remarks[entry.id]
            }
          })
        }
      } catch (error) {
        console.error('加载备注失败:', error)
      }
    }

    // 执行上下文分析
    const executeContextAnalysis = async () => {
      if (!contextAnalysisRow.value) return
      
      try {
        const baseTimestamp = new Date(contextAnalysisRow.value.timestamp)
        const beforeMs = (beforeMinutes.value * 60 + beforeSeconds.value) * 1000
        const afterMs = (afterMinutes.value * 60 + afterSeconds.value) * 1000
        if (beforeMs === 0 && afterMs === 0) {
          ElMessage.warning('时间范围不能为 0，请输入分钟或秒')
          return
        }
        const beforeTime = new Date(baseTimestamp.getTime() - beforeMs)
        const afterTime = new Date(baseTimestamp.getTime() + afterMs)
        
        console.log('上下文分析参数:', {
          baseRow: contextAnalysisRow.value,
          beforeMinutes: beforeMinutes.value,
          beforeSeconds: beforeSeconds.value,
          afterMinutes: afterMinutes.value,
          afterSeconds: afterSeconds.value,
          timeRange: {
            before: beforeTime.toISOString(),
            after: afterTime.toISOString()
          }
        })
        
        // 构建时间范围筛选条件
        const timeFilter = {
          field: 'timestamp',
          operator: 'between',
          value: [formatTimestamp(beforeTime), formatTimestamp(afterTime)]
        }
        
        // 清空当前筛选器并应用时间范围筛选
        filtersRoot.value = { logic: 'AND', conditions: [timeFilter] }
        advancedMode.value = true
        currentPage.value = 1
        
        // 重新加载数据
        await loadBatchLogEntries(1, true)
        
        // 关闭对话框
        contextAnalysisVisible.value = false
        
        const beforeText = `${beforeMinutes.value}分${beforeSeconds.value}秒`
        const afterText = `${afterMinutes.value}分${afterSeconds.value}秒`
        ElMessage.success(`已筛选出 ${beforeText}前到${afterText}后的日志`)
        
      } catch (error) {
        console.error('上下文分析失败:', error)
        ElMessage.error('上下文分析失败，请重试')
      }
    }


    const applySelectedTemplate = () => {
      if (!selectedTemplateName.value) return
      const tpl = templates.value.find(t => t.name === selectedTemplateName.value)
      if (!tpl) return
      pendingFiltersRoot.value = deepCloneFilters(tpl.filters || { logic: 'AND', conditions: [] })
      clearNlAppliedActions()
    }

    const onOperatorChange = (cond) => {
      if (!cond) return
      const op = String(cond.operator || '').toLowerCase()
      if (op === 'between') {
        if (!Array.isArray(cond.value)) {
          cond.value = ['', '']
        } else if (cond.value.length < 2) {
          cond.value = [cond.value[0] || '', cond.value[1] || '']
        }
      } else {
        if (Array.isArray(cond.value)) {
          cond.value = cond.value.join(',')
        }
      }
    }

    const closeSidebarOnEscape = (e) => {
      if (e.key === 'Escape' && filterDrawerVisible.value) {
        filterDrawerVisible.value = false
      }
    }
    onMounted(() => {
      document.addEventListener('keydown', closeSidebarOnEscape)
    })

    onMounted(async () => {
      // 首屏显示加载状态，避免先显示 no data
      loading.value = true
      
      try {
        // 并行加载不依赖数据的初始化
        const initPromises = [
          loadServerTimezone(),
          loadAnalysisPresets(),
          loadTemplates()
        ]
        
        // 等待所有初始化完成
        await Promise.all(initPromises)
        
        // 加载选中的日志
        await loadSelectedLogs()
        
        // 加载计数数据
        loadCountsFromStorage()
        // 恢复 NL mark 动作（用于 materialize）
        loadNlMarkActionsFromStorage()
        
        // 如果有选中的日志，获取全局统计
        if (selectedLogs.value.length > 0) {
          await fetchGlobalStatistics()
        }
        
        // 支持从路由 query 传入时间范围（用于外部页面一键打开批量查看）
        const qStart = route.query?.start_time
        const qEnd = route.query?.end_time
        const hasQueryTimeRange = !!(qStart && qEnd)
        if (hasQueryTimeRange) {
          timeRange.value = [String(qStart), String(qEnd)]
        } else {
          // 默认选择全部时间范围（最早至最晚）
          if (timeRangeLimit.value) {
            timeRange.value = [
              formatTimestamp(timeRangeLimit.value[0]),
              formatTimestamp(timeRangeLimit.value[1])
            ]
          }
        }
        
        // 初始化加载数据（loadBatchLogEntries 内部会控制 loading 状态）
        await loadBatchLogEntries(1, true)
        
        // 加载保存的剪贴板内容
        loadClipboardContent()
      } catch (error) {
        console.error('初始化失败:', error)
        ElMessage.error(t('batchAnalysis.initializationFailed'))
        loading.value = false
      }
    })

    // 组件销毁时清理ECharts实例
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', closeSidebarOnEscape)
      if (chartInstance.value) {
        chartInstance.value.dispose()
        chartInstance.value = null
      }
      
      // 清理所有缩略图实例
      chartThumbnails.value.forEach(chart => {
        const thumbnailElement = document.getElementById(`chart-thumb-${chart.id}`)
        if (thumbnailElement) {
          if (thumbnailElement._resizeHandler) {
            window.removeEventListener('resize', thumbnailElement._resizeHandler)
          }
          if (thumbnailElement._echartsInstance) {
            thumbnailElement._echartsInstance.dispose()
          }
        }
      })
    })

    watch(clipboardContent, (val) => {
      try { sessionStorage.setItem('clipboardContent', val || '') } catch(_){}
    })

    return {
      activeColorPopoverRowId,
      headerColorPopoverVisible,
      applyColorToAllFilteredRows,
      activeNotesPopoverRowId,
      hoveredNameRowId,
      toggleColorPopover,
      filterDrawerVisible,
      filterSidebarActiveTab,
      filterSidebarBodyRef,
      customSectionRef,
      customSubsystemActive,
      onSelectLevelCard,
      loading,
      selectedLogs,
      batchLogEntries,
      searchKeyword,
      timeRange,
      timeRangeDisplay,
      displayTimezoneOffsetMinutes,
      timezoneOptions,
      formatTimestampWithTimezone,
      getTimestampFileInfoTooltip,
      onTimezoneChange,
      currentPage,
      pageSize,
      totalCount,
      totalPages,
      advancedMode,
      tableColumns,
      filtersRoot,
      filteredEntries,
      paginatedEntries,
      searchExpression,
      advancedExpression,
      // counts for template conditions
      batchCount,
      selectedLogsCount,
      filteredCount,
      leafConditionCount,
      // 分析等级相关
      analysisCategories,
      analysisPresets,
      selectedAnalysisCategoryIds,
      categorySearchKeyword,
      filteredCategoriesForLevel,
      selectAllCategories,
      clearCategorySelection,
      toggleCategoryChip,
      analysisLevelLabel,
      isPresetActive,
      isCustomLevel,
      levelChipOptions,
      levelPresetKey,
      onLevelPresetChange,
      applyPreset,
      onAnalysisCategoriesChange,
      pendingLevelPresetKey,
      pendingSelectedAnalysisCategoryIds,
      pendingFiltersRoot,
      pendingDisplayTimezoneOffsetMinutes,
      pendingAdvancedExpression,
      searchTabPreviewExpression,
      resetSidebarFilters,
      applySidebarFilters,
      getCategoryDisplayName,
      loadSelectedLogs,
      loadBatchLogEntries,
      handleSearch,
      handleQuery,
      handleTimeRangeChange,
      clearFilters,
      exportToCSV,
      handleSizeChange,
      handleCurrentChange,
      handleLoadMore,
      forceRelayout,
      formatTimestamp,
      formatFileSize,
      getSmartTimeFormatter,
      showSurgeryStatistics,
      showSurgeryStatsDialog,
      surgeryStatsLoading,
      surgeryStats,
      exportingRow,
      surgeryJsonDialogVisible,
      surgeryJsonText,
      hasExportPermission,
      visualizeSurgeryStat,
      previewSurgeryData,
      exportSurgeryRow,
      analyzeSurgeryData,
      surgeryStatisticsVisible,
      surgeryData,
      analyzing,
      timeRangeLimit,
      defaultPickerRange,
      disableOutOfRangeDates,
      templates,
      templatePreviewMap,
      applyTemplateByName,
      beforeImportTemplates,
      selectedTemplateName,
      onTemplateSingleSelect,
      applySelectedTemplate,
      selectTemplateCard,
      importExpressionText,
      nlQuery,
      nlGenerating,
      nlSpec,
      nlConversationMessages,
      nlInputLine,
      nlQuestionOptions,
      generateFilterExpression,
      submitNlReply,
      cancelNlClarification,
      
      applyExpressionJSON,
      applyExpressionSmart,
      addConditionToGroup,
      addGroupToGroup,
      removeNodeAt,
      exprPreviewRef,
      applyAdvancedFilters,
      clearAllConditionsOnly,
      // expose helpers for operator dropdowns
      getOperatorOptions,
      onFieldChange,
      onOperatorChange,
      // 新增的变量和方法
      colorOptions,
      selectColor,
      getRowClassName,
      getRowStyle,
      getCellClassName,
      nlStatsCounts,
      saveColorMarksToStorage,
      loadColorMarksFromStorage,
      handleContextAnalysis,
      handleLogCapture,
      // 上下文分析相关
      contextAnalysisVisible,
      contextAnalysisRow,
      beforeMinutes,
      afterMinutes,
      beforeSeconds,
      afterSeconds,
      executeContextAnalysis,
      // 日志摘取相关
      clipboardVisible,
      clipboardEntries,
      clipboardContent,
      updateClipboardContent,
      clearClipboard,
      exportClipboardToTxt,
      saveClipboardContent,
      loadClipboardContent,
      showClipboard,
      clipboardDetailVisible,
      clipboardCount,
      fillPercent,
      maxClipboardEntries,
      // 可视化相关
      parameterSelectVisible,
      sidebarActiveTab,
      selectedParameter,
      availableParameters,
      paramNames,
      selectKey,
      isParameterAvailable,
      // 供输入框处理中文输入法组合态
      onCompositionStart,
      onCompositionEnd,
      // Popover 显隐
      activeParamPopoverRowId,
      paramNamesLoading,
      chartDetailVisible,
      chartTitle,
      chartContainer,
      chartInstance,
      chartThumbnails,
      currentChartData,
      handleVisualization,
      confirmVisualization,
      exportChartAsImage,
      showChartDetail,
      deleteChartThumbnail,
      deleteCurrentChart,
      onChartDialogOpened,
      // 计数功能相关
      logCounts,
      errorCodeCounts,
      globalErrorCodeCounts,
      filteredErrorCodeCounts,
      statisticsCache,
      getErrorCodeCount,
      getErrorCodeCountDisplay,
      getErrorCodeStatisticsTooltip,
      hasActiveFilters,
      showStatisticsForErrorCode,
      toggleErrorCodeStatistics,
      fetchStatisticsFromBackend,
      fetchGlobalStatistics,
      fetchFilteredStatistics,
      loadCountsFromStorage,
      showErrorCodeStatistics,
      // 数据比对相关
      showCompareDialog,
      compareData,
    }
  }
}
</script>

<style scoped>
.batch-analysis-container {
  padding: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--slate-100);
  box-sizing: border-box;
  overflow: hidden;
}

.analysis-card-wrapper {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.analysis-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  overflow: hidden;
  margin: 0;
}

:deep(.analysis-card .el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  min-height: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background-color: white;
  border-bottom: 1px solid var(--slate-200);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  min-width: 0;
}
.card-header .header-tag-block {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 4px 8px;
}

.card-header .title {
  font-size: 16px;
  font-weight: 600;
  color: var(--slate-900);
  margin: 0;
  flex-shrink: 0;
}

/* 摘要/信息块：设备编号、分析等级、搜索表达式（使用 design token） */
.header-tag-block,
.summary-block {
  font-size: var(--summary-block-font-size);
  color: var(--summary-block-label-color);
  padding: var(--summary-block-padding);
  background: var(--summary-block-bg);
  border: 1px solid var(--summary-block-border);
  border-radius: var(--summary-block-radius);
  flex-shrink: 0;
}

.header-tag-block .header-tag-label,
.summary-block .summary-block-label {
  color: var(--summary-block-label-color);
  margin-right: 4px;
}

.header-tag-block .header-tag-value,
.summary-block .summary-block-value {
  color: var(--summary-block-value-color);
}

.summary-block-expr {
  flex: 1;
  min-width: 0;
}

.summary-block-expr-value {
  color: var(--summary-block-value-color);
  font-family: monospace;
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.search-section {
  padding: 8px 16px;
  background-color: white;
  border-bottom: 1px solid var(--slate-200);
  flex-shrink: 0;
}

.compact-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-row-1 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 50%;
}
.toolbar-row-1 .filter-toggle-btn {
  flex-shrink: 0;
}
.toolbar-row-1 .search-input-compact {
  flex-shrink: 0;
}

.toolbar-row-2 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-row-2 .filter-summary-horizontal {
  flex: 1;
  min-width: 0;
}

.toolbar-row-2 .clear-filters-toolbar-btn {
  margin-left: auto;
}

.filter-toggle-btn {
  background-color: var(--sky-50);
  border-color: var(--sky-300);
  color: var(--sky-600);
}

.filter-toggle-btn:hover {
  background-color: var(--sky-500);
  border-color: var(--sky-500);
  color: var(--black-white-white);
}

.time-range-toolbar {
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.search-input-compact {
  width: 220px;
}

.clear-filters-toolbar-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.filter-summary-horizontal {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--slate-600);
  white-space: nowrap;
  background: var(--slate-100);
  padding: 4px 8px;
  border-radius: var(--radius-xs);
}

.summary-item-expr {
  flex: 1;
  min-width: 0;
  white-space: normal;
  word-break: break-all;
}

.summary-item .expr {
  color: var(--el-color-info);
  font-family: monospace;
  font-size: 12px;
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
}

/* 抽屉样式 */
.filter-drawer-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
}

.main-content-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.main-content-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.sidebar-backdrop {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: opacity 0.2s ease;
}

/* 侧边栏悬浮：盖在列表上，不挤占宽度，选项仅点「应用」后生效 */
.filter-sidebar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 320px;
  z-index: 20;
  min-height: 0;
  background-color: var(--black-white-white);
  border-right: 1px solid var(--slate-200);
  transform: translateX(0);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.filter-sidebar.sidebar-hidden {
  transform: translateX(-100%);
  pointer-events: none;
}

.filter-sidebar-content {
  width: 320px; /* 保持固定宽度以防缩放时抖动 */
  padding: 10px 8px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.filter-sidebar-header {
  flex-shrink: 0;
  padding: 0 0 8px 0;
}
.filter-sidebar-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--slate-900);
  line-height: 1.2;
}
.filter-sidebar-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: var(--slate-500);
}
/* 侧边栏分段使用 design-tokens.css 中的 .el-segmented-control */
.filter-sidebar-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

/* 分析等级内「预设等级」「自定义」同级区块 */
.level-tab-section {
  margin-bottom: 24px;
}
.level-tab-section:last-child {
  margin-bottom: 0;
}
.level-tab-section .section-title.drawer-section-title {
  margin-bottom: 12px;
}
.level-tab-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 6px;
  padding-right: 6px;
}
/* 自定义区块：与预设等级一致的左右留白，不贴满侧边栏 */
.category-section-content {
  margin-left: 6px;
  margin-right: 6px;
}
.level-tab-section .category-search-input {
  margin-bottom: 12px;
}
.level-tab-section .subsystem-meta {
  margin-bottom: 12px;
}
.level-tab-section .category-list-wrap {
  margin-top: 4px;
}

.level-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-left: 6px;
  margin-right: 6px;
}
.level-card {
  border: 1px solid var(--slate-200);
  background: var(--black-white-white);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.level-card:hover {
  border-color: var(--slate-300);
  background: var(--slate-50);
}
.level-card.active {
  border-color: var(--slate-300);
  background: var(--slate-100);
}
/* 卡片标题：修改 design-tokens.css 中 --level-card-title-* 或本类 */
.level-card-title {
  font-size: var(--level-card-title-font-size);
  font-weight: var(--level-card-title-font-weight);
  color: var(--level-card-title-color);
}
/* 卡片描述：修改 design-tokens.css 中 --level-card-desc-* 或本类 */
.level-card-desc {
  margin-top: var(--level-card-desc-margin-top);
  font-size: var(--level-card-desc-font-size);
  color: var(--level-card-desc-color);
  line-height: var(--level-card-desc-line-height);
}

.subsystem-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--slate-500);
}
.subsystem-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 搜索标签页：3 部分区块 */
.search-tab-section {
  margin-bottom: 14px;
}
.search-tab-section .drawer-section-title {
  margin-bottom: 8px;
}

.nl-card {
  background: #eef4ff;
  border: 1px solid #d9e6ff;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.nl-generate-btn {
  width: 100%;
}

/* 自然语言追问：对话形式 + 单行输入 */
.nl-conversation {
  background: #eef4ff;
  border: 1px solid #d9e6ff;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.nl-messages {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nl-msg { display: flex; flex-direction: column; gap: 2px; }
.nl-msg-label { font-size: 11px; color: var(--el-text-color-secondary); font-weight: 600; }
.nl-msg-user .nl-msg-label { color: var(--el-color-primary); }
.nl-msg-content { font-size: 13px; white-space: pre-wrap; word-break: break-word; }
.nl-reply-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.nl-input-line { flex: 1; }
.nl-send-reply-btn { flex-shrink: 0; }
.nl-options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.nl-option-btn {
  padding: 0 10px;
}
.nl-cancel-clarification { margin-top: 4px; }

.search-tab-stats {
  margin-top: 14px;
  margin-bottom: 0;
  padding: 10px 12px;
  font-size: 12px;
  background: linear-gradient(135deg, #eef4ff 0%, #e8f5e9 100%);
  border: 1px solid rgba(64, 158, 255, 0.25);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
}
.search-tab-stats-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}
.search-tab-stats-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.search-tab-stats-item {
  display: inline-flex;
  align-items: baseline;
}
.search-tab-stats-field {
  color: var(--el-text-color-regular);
}
.search-tab-stats-count {
  font-weight: 700;
  font-size: 15px;
  color: var(--el-color-primary);
  margin: 0 2px;
}
.search-tab-stats-unit {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

/* 自然语言 highlight 动作：列单元格高亮 */
.compact-log-entries-table .nl-highlight-cell {
  background-color: rgba(255, 235, 59, 0.35) !important;
}

/* 常用搜索表达式：标签使用 --filter-chip- 样式，仅显示名称 */
.saved-expr-chips-wrap {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: var(--filter-chips-gap);
}
.saved-expr-chip.filter-chip-style {
  display: inline-flex;
  align-items: center;
  padding: var(--filter-chip-padding-y) var(--filter-chip-padding-x);
  font-size: var(--filter-chip-font-size);
  line-height: var(--filter-chip-line-height);
  color: var(--filter-chip-color);
  background: var(--filter-chip-bg);
  border: 1px solid var(--filter-chip-border);
  border-radius: var(--filter-chip-radius);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.saved-expr-chip.filter-chip-style:hover {
  background: var(--filter-chip-hover-bg);
  border-color: var(--filter-chip-hover-border);
}
.saved-expr-chip.filter-chip-style.active {
  background: var(--filter-chip-active-bg);
  border-color: var(--filter-chip-active-border);
  color: var(--filter-chip-active-color);
}

/* 包裹层带 data-v，使下方 :deep 选择器能命中 el-tabs 内部节点 */
.filter-sidebar-tabs-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.filter-sidebar-tabs-wrap :deep(.el-tabs) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.filter-sidebar-tabs-wrap :deep(.el-tabs__header) {
  margin: 0 0 12px 0;
}
/* 与 Logs.vue detail-status-tabs 一致的标签栏样式：分析等级、高级筛选、时区转换 */
.filter-sidebar-tabs-wrap :deep(.el-tabs__nav-wrap) {
  justify-content: flex-start !important;
}
.filter-sidebar-tabs-wrap :deep(.el-tabs__nav-scroll) {
  display: flex !important;
  align-items: center !important;
}

.filter-sidebar-tabs-wrap :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.filter-sidebar-tabs-wrap :deep(.el-tabs__content .el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.filter-sidebar-tabs-wrap :deep(.el-tabs__item) {
  font-size: 13px;
}

.filter-sidebar-tabs-wrap :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drawer-section .section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--slate-600);
  border-left: 3px solid var(--el-color-info);
  padding-left: 8px;
}

/* 日志分析等级：快捷选项并排，分级列表撑满侧边栏并滚动 */
.drawer-section.analysis-level-tab {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preset-buttons {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

/* 与 Logs.vue 一致的快捷选项组样式 */
.quick-range-group {
  flex-shrink: 0;
}
.level-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.level-chip {
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
}
.level-chip:hover {
  opacity: 0.9;
}

.drawer-section-title {
  flex-shrink: 0;
}

.section-title-row.category-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.category-selected-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.category-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.category-toolbar .category-search-input {
  width: 100%;
}
.category-toolbar .category-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.category-list-empty {
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--slate-50);
  border-radius: var(--radius-xs);
}

/* 自定义分类：Chip 使用 design-tokens.css 中 --filter-chip-*，圆角适中 */
.category-chips-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: var(--filter-chips-gap);
}
.category-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--filter-chip-padding-y) var(--filter-chip-padding-x);
  font-size: var(--filter-chip-font-size);
  line-height: var(--filter-chip-line-height);
  color: var(--filter-chip-color);
  background: var(--filter-chip-bg);
  border: 1px solid var(--filter-chip-border);
  border-radius: var(--filter-chip-radius);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.category-chip:hover {
  background: var(--filter-chip-hover-bg);
  border-color: var(--filter-chip-hover-border);
}
.category-chip.active {
  background: var(--filter-chip-active-bg);
  border-color: var(--filter-chip-active-border);
  color: var(--filter-chip-active-color);
}
.category-chips-wrap.chips-disabled .category-chip {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}

.category-list-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}
.category-list-wrap .category-list {
  min-height: 0;
}

/* 兼容旧类名 */
.analysis-level-list-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.analysis-level-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.level-list-item {
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-size: 13px;
  line-height: 1.35;
  color: var(--slate-700);
  background: var(--slate-50);
  border: 1px solid transparent;
  transition: all 0.2s;
}

.level-list-item:hover {
  background: var(--slate-100);
}

.level-list-item.active {
  background: var(--el-color-info-light-9);
  color: var(--el-color-info);
  border-color: var(--el-color-info-light-5);
}

.level-list-item.checkbox-item {
  cursor: default;
}

.level-list-item.checkbox-item .el-checkbox {
  width: 100%;
  margin: 0;
  min-height: 0;
  align-items: center;
}
.level-list-item.checkbox-item .el-checkbox .el-checkbox__label {
  line-height: 1.35;
  padding-left: 8px;
}
.level-list-item.checkbox-item :deep(.el-checkbox__input) {
  height: 14px;
}
.level-list-item.checkbox-item :deep(.el-checkbox__inner) {
  width: 14px;
  height: 14px;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 高级筛选内联 - 侧边栏内直接展示 */
.advanced-filter-inline {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.advanced-filter-inline .advanced-filter {
  padding: 0;
}

.advanced-filter-inline .advanced-filter .section {
  margin-bottom: 12px;
}

.advanced-filter-inline .group-root {
  margin-top: 8px;
}

.advanced-filter-apply {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--slate-200);
}

.time-range-full, .timezone-select-full {
  width: 100% !important;
}

.advanced-actions-drawer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-footer {
  margin-top: auto;
  padding: 20px 8px 0;
  border-top: 1px solid var(--slate-200);
  display: flex;
  gap: 8px;
  align-items: center;
}
.drawer-footer .drawer-footer-reset {
  flex: 0 0 auto;
}
.drawer-footer .drawer-footer-apply {
  flex: 1;
  min-width: 0;
}
.drawer-footer .el-button {
  margin-bottom: 4px;
}

/* 表格紧凑化 */
.entries-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.section-header {
  padding: 4px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.section-header h3 {
  margin: 0;
  font-size: 13px;
  color: var(--slate-600);
}

.table-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 仅对批量日志查看页的日志条目表格应用紧凑样式，不影响项目中其他表格 */
.compact-log-entries-table :deep(.el-table) {
  --el-table-row-hover-bg-color: var(--slate-100);
}

.compact-log-entries-table :deep(.el-table .el-table__row) {
  height: 24px !important;
}

.compact-log-entries-table :deep(.el-table .el-table__cell) {
  padding: 0px 4px !important;
  font-size: 12px;
  height: 24px !important;
}

.compact-log-entries-table :deep(.el-table .cell) {
  padding: 0 4px !important;
  line-height: 24px !important;
  white-space: nowrap;
}

.compact-log-entries-table :deep(.el-table__header .el-table__cell) {
  font-weight: 600;
  color: var(--slate-600);
  padding: 4px 4px !important;
  height: 32px !important;
}

.pagination-wrapper {
  padding: 8px 16px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
  color: var(--slate-600);
  padding: 6px 8px;
  background: #f9fafb;
  border: 1px dashed #e4e7ed;
  border-radius: 6px;
  display: flex;
/* 高级筛选弹窗结构化分区 */
.advanced-filter .section {
  margin-bottom: 16px;
  background: #fff;
}
.advanced-filter .section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--slate-600);
}
.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.logic-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.advanced-filter .conditions .condition + .condition {
  margin-top: 2px;
}

/* 高级搜索组逻辑：根据层级缩进显示 */
.advanced-filter .group-box {
  border-left: 2px dashed #e4e7ed;
  margin-left: 10px;
  padding-left: 10px;
}
.advanced-filter .group-header.nested {
  margin-left: 8px;
}
.advanced-filter .group-root {
  margin-top: 10px;
}

/* Radio Button 样式覆盖 - 使用设计Token */
/* 通过 :deep() 选择器覆盖 Element Plus 内部样式 */
/* 使用柔和的银灰色作为选中状态，更符合高级搜索的视觉风格 */
:deep(.group-header .el-radio-group),
:deep(.group-root .el-radio-group) {
  --el-radio-button-checked-bg-color: var(--slate-400) !important; /* 银灰色背景 */
  --el-radio-button-checked-border-color: var(--slate-400) !important; /* 银灰色边框 */
  --el-radio-button-checked-text-color: var(--text-white) !important; /* 白色文字 */
  --el-radio-button-bg-color: var(--btn-secondary-bg) !important;
  --el-radio-button-border-color: var(--btn-secondary-border) !important;
  --el-radio-button-text-color: var(--btn-secondary-text) !important;
}

/* 未选中状态 */
:deep(.group-header .el-radio-button__inner),
:deep(.group-root .el-radio-button__inner) {
  background-color: var(--btn-secondary-bg) !important;
  border-color: var(--btn-secondary-border) !important;
  color: var(--btn-secondary-text) !important;
}

:deep(.group-header .el-radio-button__inner:hover),
:deep(.group-root .el-radio-button__inner:hover) {
  background-color: var(--btn-secondary-bg-hover) !important;
  border-color: var(--btn-secondary-border-hover) !important;
  color: var(--btn-secondary-text-hover) !important;
}

/* 选中状态 - 使用柔和的银灰色 */
:deep(.group-header .el-radio-button.is-active .el-radio-button__inner),
:deep(.group-header .el-radio-button.is-active .el-radio-button__original-radio:not(:disabled) + .el-radio-button__inner),
:deep(.group-root .el-radio-button.is-active .el-radio-button__inner),
:deep(.group-root .el-radio-button.is-active .el-radio-button__original-radio:not(:disabled) + .el-radio-button__inner) {
  background-color: var(--slate-400) !important; /* 银灰色 #94a3b8 */
  border-color: var(--slate-400) !important;
  color: var(--text-white) !important;
  box-shadow: -1px 0 0 0 var(--slate-400) !important;
}

:deep(.group-header .el-radio-button.is-active .el-radio-button__inner:hover),
:deep(.group-header .el-radio-button.is-active .el-radio-button__original-radio:not(:disabled) + .el-radio-button__inner:hover),
:deep(.group-root .el-radio-button.is-active .el-radio-button__inner:hover),
:deep(.group-root .el-radio-button.is-active .el-radio-button__original-radio:not(:disabled) + .el-radio-button__inner:hover) {
  background-color: var(--slate-500) !important; /* 悬停时稍深一点的灰色 #64748b */
  border-color: var(--slate-500) !important;
  color: var(--text-white) !important;
}
.template-tags, .tags-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tags-ops {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.tags-ops .hint {
  font-size: 12px;
  color: var(--slate-500);
}
.ops-right {
  display: flex;
  gap: 8px;
}
/* 搜索标签页底部：搜索表达式预览 */
.search-tab-preview {
  margin-top: 14px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--slate-600);
  background: var(--slate-50);
  border-radius: var(--radius-xs);
  border: 1px solid var(--slate-200);
}
.search-tab-preview-label {
  color: var(--slate-500);
  margin-right: 6px;
}
.search-tab-preview-expr {
  word-break: break-all;
  display: inline;
}

.expr-preview {
  margin: 6px 0 10px 0;
  font-size: 12px;
  color: var(--slate-600);
  padding: 6px 8px;
  background: #f9fafb;
  border: 1px dashed #e4e7ed;
  border-radius: 6px;
}
.expr-preview .label {
  color: var(--slate-500);
  margin-right: 6px;
}
.antd-tags .tpl-tag {
  margin: 4px 6px 0 0;
}
.antd-tags .tpl-tag.bordered {
  border: 1px solid #d9d9d9;
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #fafafa;
}
.antd-tags.single-select .tpl-tag.ant-tag-checkable-checked {
  border-color: #1677ff;
  color: #1677ff;
  background: #e6f4ff;
}
.import-text {
  margin-top: 8px;
}
.import-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.entries-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: visible;
  margin: 0 10px 5px 10px;
  padding: 10px;
}

.table-container {
  flex: 1;
  overflow: visible;
  padding: 0 0 4px 0;
  width: 100%;
}

/* 颜色标记行样式 - 仅批量日志条目表格 */
.compact-log-entries-table .el-table .el-table__row.row-marked-red,
.compact-log-entries-table .el-table__body tr.row-marked-red {
  background-color: rgba(255, 0, 0, 0.2) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-red:hover {
  background-color: rgba(255, 0, 0, 0.3) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-yellow,
.compact-log-entries-table .el-table__body tr.row-marked-yellow {
  background-color: rgba(255, 255, 0, 0.2) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-yellow:hover {
  background-color: rgba(255, 255, 0, 0.3) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-blue,
.compact-log-entries-table .el-table__body tr.row-marked-blue {
  background-color: rgba(0, 0, 255, 0.2) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-blue:hover {
  background-color: rgba(0, 0, 255, 0.3) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-green,
.compact-log-entries-table .el-table__body tr.row-marked-green {
  background-color: rgba(0, 255, 0, 0.2) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-green:hover {
  background-color: rgba(0, 255, 0, 0.3) !important;
}

.compact-log-entries-table .el-table .el-table__row.row-marked-purple,
.compact-log-entries-table .el-table__body tr.row-marked-purple {
  background-color: rgba(128, 0, 128, 0.2) !important;
}
.compact-log-entries-table .el-table .el-table__row.row-marked-purple:hover {
  background-color: rgba(128, 0, 128, 0.3) !important;
}

.color-radio {
  width: 12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  border: 2px solid #ddd !important;
  position: relative;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.color-radio.active {
  border-color: var(--el-color-info) !important;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2) !important;
}

.color-radio.active::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: white;
  border: 1px solid var(--el-color-info);
}

/* 列头样式，与 Logs.vue 保持一致 */
.col-header {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 8px;
  text-align: left;
}

/* 表头颜色列：与行内一致，水平垂直居中 */
.batch-analysis-container .compact-log-entries-table :deep(.color-mark-header-cell .cell) {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}
.header-color-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.header-color-mark .header-color-indicator {
  width: 10px;
  height: 10px;
  border: 2px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;
  flex-shrink: 0;
}
.header-color-mark .header-color-indicator:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

/* 表头颜色选择弹层内选项居中（与行内弹层一致：水平+垂直居中） */
.color-picker-popover .header-color-picker-menu {
  justify-content: center;
  align-items: center;
  min-height: 44px;
}
.header-color-picker-menu {
  justify-content: center;
  align-items: center;
}

/* 故障码列的特殊列头样式 */
.col-header:has(.header-hint) {
  flex-direction: column;
  gap: 2px;
}

.header-hint {
  font-size: 10px;
  color: var(--slate-500);
  font-weight: normal;
  font-style: italic;
}

/* 让释义列的 tooltip 在表格外也能显示 */
.explanation-tooltip {
  max-width: 60vw;
  white-space: normal;
}


.el-popper.explanation-tooltip {
  overflow: visible;
}

.explanation-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 22px;
  padding: 0px 0;
}

.explanation-ellipsis {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--slate-600) !important;
  line-height: 22px;
}

/* 黑色背景的暗色气泡 */
.explanation-tooltip.dark {
  background: rgba(0,0,0,0.85);
  color: #fff;
  border: none;
}
.explanation-tooltip.dark .el-tooltip__popper {
  background: rgba(0,0,0,0.85);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 5px 10px 0 20px;
}

.section-header h3 {
  margin: 0;
  color: var(--slate-900);
  font-size: 12px;
}

.loading-section {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  margin: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin: 10px 20px;
  padding: 8px 0;
}

/* 时间戳/文件名单元格样式 */
.file-info-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
  min-height: 22px;
  font-size: 13px;
  font-weight: 500;
}

.timestamp-cell-ellipsis {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--slate-900);
  font-weight: 500;
  font-size: 13px;
  text-align: left;
}

.timestamp {
  color: var(--slate-900);
  font-weight: 500;
  font-size: 13px;
  text-align: left;
}

.parameters-cell {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 0;
  max-height: 22px;
  width: 100%;
  color: var(--slate-600);
  word-break: break-all;
  font-size: 13px;
  font-weight: 500;
  line-height: 22px;
  padding: 0;
}

.parameters-cell .param-item {
  flex: 1;
  min-width: 0;
  margin: 0;
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--slate-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.param-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-right: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--slate-600);
  min-width: 0;
}

.param-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.visualization-btn {
  font-size: 14px;
  padding: 0;
  height: 20px;
  width: 20px;
  min-width: 20px;
  min-height: 20px;
  border-radius: 3px;
  color: var(--el-color-info);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.visualization-btn .el-icon {
  font-size: 14px;
}

.visualization-btn:hover {
  color: #66b1ff;
  transform: scale(1.05);
}

.visualization-btn:disabled {
  color: #c0c4cc;
  background-color: transparent;
}

/* 参数选择 Popover 单列排版 */
.parameter-popover {
  text-align: left;
}
.parameter-popover .param-radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.parameter-popover .param-radio-group .el-radio {
  display: block;
  margin: 1px 0 !important;
}

/* 提升弹层内 radio 的样式优先级，避免被全局样式覆盖 */
.param-popover .el-radio,
.param-popover .el-radio__label,
.param-popover .el-radio-group .el-radio {
  margin: 1px 0 !important;
}

.parameter-select-dialog {
  padding: 20px 0;
}

.parameter-select-dialog p {
  margin-bottom: 16px;
  color: var(--slate-600);
}

.dialog-actions {
  margin-top: 20px;
  text-align: right;
}

.dialog-actions .el-button {
  margin-left: 8px;
}

/* 图表详情弹窗撑满：弹窗内容区固定高度 + 图表区域 flex 填充 */
.chart-detail-dialog.el-dialog .el-dialog__body {
  display: flex;
  flex-direction: column;
  height: 70vh;
  min-height: 450px;
  padding: 16px;
  overflow: hidden;
}

.chart-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.chart-detail-header {
  display: none;
}

.chart-actions {
  display: flex;
  gap: 8px;
}

.chart-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: transparent;
  border-radius: 4px;
  padding: 0;
  text-align: center;
}

.chart-no-data {
  width: 100%;
  height: 100%;
  min-height: 450px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--slate-500);
}

.dialog-subtitle {
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: var(--slate-900);
  margin: 0 0 8px 0;
}

.operations-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 0;
  max-height: 22px;
  padding: 0;
  gap: 1px;
}

.error-code-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  min-height: 22px;
  cursor: pointer;
  padding: 0px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  box-sizing: border-box;
  font-weight: 500;
  font-size: 13px;
  position: relative;
  margin: 0;
}

.error-code-cell:hover {
  background-color: var(--slate-100);
  border-color: #e4e7ed;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}



.error-code-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #f56c6c;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 8px;
  min-width: 16px;
  height: 16px;
  line-height: 12px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(245, 108, 108, 0.4);
  z-index: 1000;
  transform: scale(1);
  transition: all 0.3s ease;
  animation: badgeAppear 0.3s ease-out;
  white-space: nowrap;
  pointer-events: none;
}

.error-code-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 3px 8px rgba(245, 108, 108, 0.6);
}

@keyframes badgeAppear {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}


.error-code-count-popup {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #e6a23c;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 10;
  white-space: nowrap;
}

.operations-cell .operation-btn {
  font-size: 14px;
  font-weight: 500;
  padding: 0;
  height: 20px;
  width: 20px;
  min-width: 20px;
  min-height: 20px;
  border-radius: 3px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.operations-cell .operation-btn .el-icon {
  font-size: 14px;
}

/* 上下文分析按钮 - 绿色 */
.operations-cell .operation-btn-context {
  color: #67c23a;
}
.operations-cell .operation-btn-context:hover {
  color: #85ce61;
  transform: scale(1.05);
}

/* 日志摘取按钮 - 橙色 */
.operations-cell .operation-btn-capture {
  color: #e6a23c;
}
.operations-cell .operation-btn-capture:hover {
  color: #ebb563;
  transform: scale(1.05);
}

/* 更多下拉触发按钮 - 适配 22px 行高 */
.operations-cell .operations-dropdown {
  display: inline-flex;
  align-items: center;
}
.operations-cell .operation-more-btn {
  padding: 0 4px;
  height: 20px;
  min-height: 20px;
  font-size: 12px;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.operations-cell .operation-more-btn .el-icon--right {
  margin-left: 0;
  font-size: 12px;
}

/* 颜色指示器样式 - 默认小圆点 */
.color-indicator {
  width: 10px;
  height: 10px;
  border: 2px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;
  box-shadow: 0 0 0 2px white;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.color-indicator:hover {
  border-color: var(--el-color-info);
  transform: scale(1.1);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2), 0 0 0 1px white;
}

.color-indicator.has-color {
  border-color: transparent;
  box-shadow: 0 0 0 1px white;
}

.color-mark-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 22px;
  padding: 0px 0;
}

/* 标记列样式 */
.batch-analysis-container .compact-log-entries-table .el-table-column[prop="color_mark"] .cell {
  padding: 0px 0px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 22px !important;
  overflow: visible !important;
}

/* 故障码列特殊样式 - 确保统计角标完全显示 */
.batch-analysis-container .compact-log-entries-table .el-table-column[prop="error_code"] .cell {
  padding: 0px 0px !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 1 !important;
  min-height: 22px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  margin: 0px !important;
  border: none !important;
}

.ungraded-mark {
  margin-left: 2px;
  color: var(--el-color-warning);
  font-weight: 700;
}

/* 确保表格行有极简的高度 */
.batch-analysis-container .compact-log-entries-table .el-table .el-table__row {
  height: 22px !important;
  min-height: 22px !important;
  overflow: visible !important;
}

/* 确保表格容器不会裁剪悬浮元素，但保持滚动功能 */
.batch-analysis-container .compact-log-entries-table .el-table {
  overflow: visible !important;
  width: 100% !important;
  table-layout: fixed !important;
  min-width: 100% !important;
}

/* 表格单元格基础样式 */
.batch-analysis-container .compact-log-entries-table .el-table .el-table__cell {
  height: 22px !important;
  min-height: 22px !important;
  max-height: none !important;
  padding: 0px 4px !important;
  overflow: visible !important;
  vertical-align: middle !important;
  border-right: 1px solid #ebeef5 !important;
}

/* 表格单元格内容样式 */
.batch-analysis-container .compact-log-entries-table .el-table--default .cell {
  height: 22px !important;
  min-height: 22px !important;
  max-height: none !important;
  padding: 0px 4px !important;
  line-height: 22px !important;
  overflow: visible !important;
}

.batch-analysis-container .compact-log-entries-table .el-table .el-table__cell:last-child {
  border-right: none !important;
}

/* 表头单元格样式 */
.batch-analysis-container .compact-log-entries-table .el-table__header .el-table__cell {
  box-sizing: border-box !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__header-wrapper {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__header {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__body-wrapper {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__body {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__body-wrapper {
  overflow-x: auto !important;
  overflow-y: visible !important;
}

/* 强制确保故障码角标不被裁剪 */
.batch-analysis-container .compact-log-entries-table .el-table-column[prop="error_code"] {
  overflow: visible !important;
}

.batch-analysis-container .compact-log-entries-table .el-table-column[prop="error_code"] .cell > div {
  overflow: visible !important;
  position: relative !important;
}



/* 颜色选择器弹窗样式 */
.color-picker-popover {
  padding: 8px !important;
}

.color-picker-menu {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}

/* 颜色选择器选项样式 */
.color-option {
  width: 20px;
  height: 20px;
  border: 2px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 10;
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.color-option.active {
  border-color: var(--el-color-info);
  border-width: 3px;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-option.no-color {
  background-color: #f5f5f5;
  border-color: #ccc;
}

.color-option.no-color:hover {
  border-color: var(--el-color-info);
  background-color: #f0f8ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.color-option.no-color.active {
  border-color: var(--el-color-info);
  background-color: #e6f3ff;
  border-width: 3px;
}

.checkmark {
  color: white;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  line-height: 1;
}


/* 上下文分析对话框样式 */
.context-analysis-form {
  padding: 10px 0;
}

.context-intro {
  margin-bottom: 6px;
  text-align: left;
  color: var(--slate-600);
}

.time-range-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-start;
}

.time-range-inputs .input-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.time-range-inputs .input-group label {
  font-weight: 500;
  color: var(--slate-600);
}

.time-range-inputs .unit-label {
  white-space: nowrap;
  display: inline-block;
}

/* 日志摘取侧边栏样式 */
.clipboard-container {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.clipboard-header {
  margin-bottom: 16px;
}

.clipboard-thumbnail {
  position: relative;
  width: 100%;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background-color: #fafafa;
  padding: 16px 16px;
  min-height: 120px; /* 高度增至约3倍 */
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
}
.clipboard-thumbnail:hover {
  border-color: #409EFF;
  background-color: #f0f9ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.clipboard-thumbnail .thumb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--slate-600);
}

.clipboard-thumbnail .thumb-row .el-icon {
  font-size: 18px;
}

.clipboard-thumbnail .thumb-label {
  font-size: 13px;
  font-weight: 600;
}

.clipboard-thumbnail .fill-bar {
  position: relative;
  width: 100%;
  height: 10px;
  background-color: #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}

.clipboard-thumbnail .fill-bar-inner {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #a0cfff 0%, #409EFF 100%);
}

.clipboard-thumbnail .fill-bar-text {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--slate-900);
}

.clipboard-thumbnail .delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.clipboard-thumbnail:hover .delete-btn {
  opacity: 1;
}

/* 图表缩略图样式 */
.chart-thumbnails {
  margin-top: 16px;
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
}

.thumbnails-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--slate-900);
  margin-bottom: 12px;
}

.thumbnail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart-thumbnail-item {
  position: relative;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: #fafafa;
}

.chart-thumbnail-item:hover {
  border-color: var(--el-color-info);
  background-color: #f0f9ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.thumbnail-chart {
  width: 100%;
  height: 104px;
  margin-bottom: 8px;
}

.thumbnail-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thumbnail-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--slate-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thumbnail-time {
  font-size: 10px;
  color: var(--slate-500);
}

.thumbnail-delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  min-width: 20px;
  padding: 0;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  color: var(--slate-500);
  border-color: #dcdfe6;
  background-color: transparent;
}

.thumbnail-delete-btn:hover {
  background-color: #2d3c60; /* Element Plus gray-100 */
  border-color: #2d3c60;
  color: #000000;
}

.chart-thumbnail-item:hover .thumbnail-delete-btn {
  opacity: 1;
}

/* 日志摘取详情弹窗样式 */
.clipboard-detail {
  padding: 16px 0;
}

.clipboard-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.detail-actions {
  display: flex;
  gap: 8px;
}

.clipboard-content {
  margin-bottom: 20px;
}

.clipboard-textarea {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
}

.clipboard-entries {
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
}

.entries-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--slate-900);
  margin-bottom: 12px;
}

.entries-list {
  max-height: 300px;
  overflow-y: auto;
}

.entry-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 4px;
  background-color: var(--slate-100);
  border-radius: 4px;
  border: 1px solid #ebeef5;
}

.entry-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.entry-index {
  font-weight: 500;
  color: var(--slate-600);
  min-width: 20px;
}

.entry-timestamp {
  font-size: 12px;
  color: var(--slate-500);
  font-family: 'Courier New', monospace;
}

.entry-error-code {
  font-weight: 500;
  color: #e6a23c;
  background-color: #fdf6ec;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}


</style>

<style>
/* 侧边栏 tabs 与 Logs.vue 一致：无 scoped，避免被 Element 默认样式覆盖 */
.filter-sidebar-content .el-tabs__nav-wrap {
  justify-content: flex-start !important;
}
.filter-sidebar-content .el-tabs__nav-scroll {
  display: flex !important;
  align-items: center !important;
}
</style>

<style>
/* tooltip 悬浮效果（仅阴影与圆角，无缩放生长动效） */
.selected-files-popper {
  box-shadow: var(--el-box-shadow-light, 0 8px 24px rgba(0, 0, 0, 0.12));
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 6px 8px;
}

.selected-files-tooltip {
  max-width: 480px;
  max-height: 240px;
  overflow: auto;
  display: flex;
  flex-wrap: wrap;
}

/* 新增的表格单元格样式 */
.file-info-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
  min-height: 22px;
  font-size: 13px;
  font-weight: 500;
}

.timestamp {
  color: var(--slate-900);
  font-weight: 500;
  font-size: 13px;
  text-align: left;
}

.parameters-cell {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 0;
  max-height: 22px;
  width: 100%;
  color: var(--slate-600);
  word-break: break-all;
  font-size: 13px;
  font-weight: 500;
  line-height: 22px;
  padding: 0;
}

.parameters-cell .param-item {
  flex: 1;
  min-width: 0;
  margin: 0;
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--slate-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.param-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-right: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--slate-600);
  min-width: 0;
}

.param-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.visualization-btn {
  font-size: 14px;
  padding: 0;
  height: 20px;
  width: 20px;
  min-width: 20px;
  min-height: 20px;
  border-radius: 3px;
  color: var(--el-color-info);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.visualization-btn .el-icon {
  font-size: 14px;
}

.visualization-btn:hover {
  color: #66b1ff;
  transform: scale(1.05);
}

.visualization-btn:disabled {
  color: #c0c4cc;
  background-color: transparent;
}

/* 参数选择 Popover 单列排版 */
.parameter-popover {
  text-align: left;
}
.parameter-popover .param-radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.parameter-popover .param-radio-group .el-radio {
  display: block;
  margin: 1px 0 !important;
}

/* 提升弹层内 radio 的样式优先级，避免被全局样式覆盖 */
.param-popover .el-radio,
.param-popover .el-radio__label,
.param-popover .el-radio-group .el-radio {
  margin: 1px 0 !important;
}

.parameter-select-dialog {
  padding: 20px 0;
}

.parameter-select-dialog p {
  margin-bottom: 16px;
  color: var(--slate-600);
}

.dialog-actions {
  margin-top: 20px;
  text-align: right;
}

.dialog-actions .el-button {
  margin-left: 8px;
}

.chart-detail-header {
  display: none;
}

.chart-actions {
  display: flex;
  gap: 8px;
}

.dialog-subtitle {
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: var(--slate-900);
  margin: 0 0 8px 0;
}

.operations-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 0;
  max-height: 22px;
  padding: 0;
  gap: 1px;
}


.error-code-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  min-height: 22px;
  cursor: pointer;
  padding: 0px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  box-sizing: border-box;
  font-weight: 500;
  font-size: 13px;
  position: relative;
  margin: 0;
}

.error-code-cell:hover {
  background-color: var(--slate-100);
  border-color: #e4e7ed;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}



.error-code-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #f56c6c;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 8px;
  min-width: 16px;
  height: 16px;
  line-height: 12px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(245, 108, 108, 0.4);
  z-index: 1000;
  transform: scale(1);
  transition: all 0.3s ease;
  animation: badgeAppear 0.3s ease-out;
  white-space: nowrap;
  pointer-events: none;
}

.error-code-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 3px 8px rgba(245, 108, 108, 0.6);
}

@keyframes badgeAppear {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}


.error-code-count-popup {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #e6a23c;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 10;
  white-space: nowrap;
}

.operations-cell .operation-btn {
  font-size: 14px;
  font-weight: 500;
  padding: 0;
  height: 20px;
  width: 20px;
  min-width: 20px;
  min-height: 20px;
  border-radius: 3px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.operations-cell .operation-btn .el-icon {
  font-size: 14px;
}

.operations-cell .operation-btn-context {
  color: #67c23a;
}
.operations-cell .operation-btn-context:hover {
  color: #85ce61;
  transform: scale(1.05);
}

.operations-cell .operation-btn-capture {
  color: #e6a23c;
}
.operations-cell .operation-btn-capture:hover {
  color: #ebb563;
  transform: scale(1.05);
}

.operations-cell .operations-dropdown {
  display: inline-flex;
  align-items: center;
}
.operations-cell .operation-more-btn {
  padding: 0 4px;
  height: 20px;
  min-height: 20px;
  font-size: 12px;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.operations-cell .operation-more-btn .el-icon--right {
  margin-left: 0;
  font-size: 12px;
}

/* 颜色指示器样式 - 默认小圆点 */
.color-indicator {
  width: 10px;
  height: 10px;
  border: 2px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;
  box-shadow: 0 0 0 2px white;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.color-indicator:hover {
  border-color: var(--el-color-info);
  transform: scale(1.1);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2), 0 0 0 1px white;
}

.color-indicator.has-color {
  border-color: transparent;
  box-shadow: 0 0 0 1px white;
}

.color-mark-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 22px;
  padding: 0px 0;
}

/* 标记列样式 */
.batch-analysis-container .compact-log-entries-table .el-table-column[prop="color_mark"] .cell {
  padding: 0px 0px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 22px !important;
  overflow: visible !important;
}

/* 故障码列特殊样式 - 确保统计角标完全显示 */
.batch-analysis-container .compact-log-entries-table .el-table-column[prop="error_code"] .cell {
  padding: 0px 0px !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 1 !important;
  min-height: 22px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  margin: 0px !important;
  border: none !important;
}

/* 确保表格行有极简的高度 */
.batch-analysis-container .compact-log-entries-table .el-table .el-table__row {
  height: 22px !important;
  min-height: 22px !important;
  overflow: visible !important;
}

/* 确保表格容器不会裁剪悬浮元素，但保持滚动功能 */
.batch-analysis-container .compact-log-entries-table .el-table {
  overflow: visible !important;
  width: 100% !important;
  table-layout: fixed !important;
  min-width: 100% !important;
}

/* 表格单元格基础样式 */
.batch-analysis-container .compact-log-entries-table .el-table .el-table__cell {
  height: 22px !important;
  min-height: 22px !important;
  max-height: none !important;
  padding: 0px 4px !important;
  overflow: visible !important;
  vertical-align: middle !important;
  border-right: 1px solid #ebeef5 !important;
}

/* 表格单元格内容样式 */
.batch-analysis-container .compact-log-entries-table .el-table--default .cell {
  height: 22px !important;
  min-height: 22px !important;
  max-height: none !important;
  padding: 0px 4px !important;
  line-height: 22px !important;
  overflow: visible !important;
}

.batch-analysis-container .compact-log-entries-table .el-table .el-table__cell:last-child {
  border-right: none !important;
}

/* 表头单元格样式 */
.batch-analysis-container .compact-log-entries-table .el-table__header .el-table__cell {
  box-sizing: border-box !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__header-wrapper {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__header {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__body-wrapper {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__body {
  width: 100% !important;
}

.batch-analysis-container .compact-log-entries-table .el-table__body-wrapper {
  overflow-x: auto !important;
  overflow-y: visible !important;
}

/* 强制确保故障码角标不被裁剪 */
.batch-analysis-container .compact-log-entries-table .el-table-column[prop="error_code"] {
  overflow: visible !important;
}

.batch-analysis-container .compact-log-entries-table .el-table-column[prop="error_code"] .cell > div {
  overflow: visible !important;
  position: relative !important;
}



/* 颜色选择器弹窗样式 */
.color-picker-popover {
  padding: 8px !important;
}

.color-picker-menu {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}

/* 颜色选择器选项样式 */
.color-option {
  width: 20px;
  height: 20px;
  border: 2px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 10;
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.color-option.active {
  border-color: var(--el-color-info);
  border-width: 3px;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-option.no-color {
  background-color: #f5f5f5;
  border-color: #ccc;
}

.color-option.no-color:hover {
  border-color: var(--el-color-info);
  background-color: #f0f8ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.color-option.no-color.active {
  border-color: var(--el-color-info);
  background-color: #e6f3ff;
  border-width: 3px;
}

.checkmark {
  color: white;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  line-height: 1;
}


/* 上下文分析对话框样式 */
.context-analysis-form {
  padding: 10px 0;
}

.time-range-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.time-range-inputs .input-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.time-range-inputs .input-group label {
  font-weight: 500;
  color: var(--slate-600);
}

/* 日志摘取侧边栏样式 */
.clipboard-container {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.clipboard-header {
  margin-bottom: 16px;
}

.clipboard-thumbnail {
  position: relative;
  width: 100%;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background-color: #fafafa;
  padding: 16px 16px;
  min-height: 180px; /* 高度增至约3倍 */
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.clipboard-thumbnail .thumb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--slate-600);
}

.clipboard-thumbnail .thumb-row .el-icon {
  font-size: 18px;
}

.clipboard-thumbnail .thumb-label {
  font-size: 13px;
  font-weight: 600;
}

.clipboard-thumbnail .delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.clipboard-thumbnail:hover .delete-btn {
  opacity: 1;
}

/* 图表缩略图样式 */
.chart-thumbnails {
  margin-top: 16px;
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
}

.thumbnails-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--slate-900);
  margin-bottom: 12px;
}

.thumbnail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart-thumbnail-item {
  position: relative;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: #fafafa;
}

.chart-thumbnail-item:hover {
  border-color: var(--el-color-info);
  background-color: #f0f9ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.thumbnail-chart {
  width: 100%;
  height: 104px;
  margin-bottom: 8px;
}

.thumbnail-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thumbnail-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--slate-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thumbnail-time {
  font-size: 10px;
  color: var(--slate-500);
}

.thumbnail-delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  min-width: 20px;
  padding: 0;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  color: var(--slate-500);
  border-color: #dcdfe6;
  background-color: transparent;
}

.thumbnail-delete-btn:hover {
  background-color: #2d3c60; /* Element Plus gray-100 */
  border-color: #2d3c60;
  color: #000000;
}

.chart-thumbnail-item:hover .thumbnail-delete-btn {
  opacity: 1;
}

/* 日志摘取详情弹窗样式 */
.clipboard-detail {
  padding: 16px 0;
}

.clipboard-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.detail-actions {
  display: flex;
  gap: 8px;
}

.clipboard-content {
  margin-bottom: 20px;
}

.clipboard-textarea {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
}

.clipboard-entries {
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
}

.entries-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--slate-900);
  margin-bottom: 12px;
}

.entries-list {
  max-height: 300px;
  overflow-y: auto;
}

.entry-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 4px;
  background-color: var(--slate-100);
  border-radius: 4px;
  border: 1px solid #ebeef5;
}

.entry-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.entry-index {
  font-weight: 500;
  color: var(--slate-600);
  min-width: 20px;
}

.entry-timestamp {
  font-size: 12px;
  color: var(--slate-500);
  font-family: 'Courier New', monospace;
}

.entry-error-code {
  font-weight: 500;
  color: #e6a23c;
  background-color: #fdf6ec;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}


</style>

<style>
/* Notes popover styles */
:deep(.notes-popover) {
  max-height: 400px;
  overflow-y: auto;
}
.notes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-weight: 600;
}
.notes-list .note-item { padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
.notes-list .note-item:last-child { border-bottom: none; }
.note-meta { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--slate-500); }
.note-user.role-admin { color: #f56c6c; }
.note-user.role-expert { color: var(--el-color-info); }
.note-user.role-user { color: var(--slate-500); }
.note-time { margin-left: auto; }
.note-actions { margin-left: 8px; }
.note-content { margin-top: 4px; font-size: 13px; color: var(--slate-600); white-space: pre-wrap; }
.note-edit-actions { margin-top: 6px; text-align: right; }
.notes-pagination { margin-top: 6px; text-align: right; }
.notes-editor { margin-top: 8px; }
.notes-editor-actions { margin-top: 6px; text-align: right; }
</style>
