<template>
  <div class="batch-analysis-container">
    <!-- 主要内容 -->
    <div class="analysis-card-wrapper">
      <el-card class="analysis-card">
      <div class="card-header" :style="{ borderBottom: 'none' }">
        <div class="header-left">
          <span class="title">{{ $t('batchAnalysis.title') }}</span>
          <el-tag v-if="batchCount > 0 && selectedLogsCount > 0" type="info" size="small">
              {{ $t('batchAnalysis.deviceId') }}：{{ selectedLogs[0]?.device_id || $t('shared.unknown') }}
            </el-tag>
          <el-tooltip placement="bottom" effect="light" transition="el-fade-in-linear" popper-class="selected-files-popper" :disabled="selectedLogsCount === 0">
            <template #content>
              <div class="selected-files-tooltip">
                <el-tag v-for="log in selectedLogs" :key="log.id" size="small" style="margin: 2px 4px 2px 0;">
                  {{ log.original_name }}
                </el-tag>
              </div>
            </template>       
            <el-tag type="info" size="small">
              {{ $t('batchAnalysis.selectedFiles', { count: selectedLogsCount }) }}
            </el-tag>
          </el-tooltip>
        </div>
        <div class="header-right">
          <el-button 
            v-if="!loading && batchCount > 0" 
            type="primary"
            @click="exportToCSV"
          >
            <el-icon><Download /></el-icon>
            {{ $t('batchAnalysis.exportCSV') }}
          </el-button>
          <el-button 
            v-if="!loading && batchCount > 0" 
            type="default"
            @click="showClipboard"
          >
            <el-icon><DocumentCopy /></el-icon>
            {{ $t('batchAnalysis.clipboard') }}
          </el-button>
          <el-button 
            v-if="!loading && selectedLogsCount > 0 && batchCount > 0" 
            type="default"
            @click="showSurgeryStatistics"
          >
            <el-icon><DataAnalysis /></el-icon>
            {{ $t('batchAnalysis.surgeryStatistics') }}
          </el-button>
        </div>
      </div>

      <!-- 手术统计结果（列表） -->
      <el-dialog v-model="showSurgeryStatsDialog" :title="$t('batchAnalysis.surgeryStatistics')" width="900px" append-to-body>
        <div v-if="surgeryStatsLoading" style="padding: 24px 0;">
          <el-empty :description="$t('batchAnalysis.analyzing')" />
        </div>
        <div v-else>
          <el-table :data="surgeryStats" style="width:100%">
            <el-table-column prop="surgery_id" :label="$t('logs.surgeryId')" width="220" />
            <!-- 手术术式列已隐藏 -->
            <!-- <el-table-column label="手术术式" min-width="200">
              <template #default="{ row }">
                {{ row?.postgresql_structure?.surgery_stats?.procedure || row?.surgery_stats?.procedure || '-' }}
              </template>
            </el-table-column> -->
            <el-table-column :label="$t('logs.surgeryStartTime')" width="180">
              <template #default="{ row }">{{ formatTimestamp(row.surgery_start_time || row.start_time) }}</template>
            </el-table-column>
            <el-table-column :label="$t('logs.surgeryEndTime')" width="180">
              <template #default="{ row }">{{ formatTimestamp(row.surgery_end_time || row.end_time) }}</template>
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
        </div>
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
        <div class="search-grid">
          <!-- 1/5 分析等级（预置维度，独立于高级搜索） -->
          <div class="grid-item">
            <div class="item-title">{{ $t('batchAnalysis.analysisLevel') }}</div>
            <el-popover placement="bottom-start" trigger="click" width="460" popper-class="analysis-level-popover">
              <template #reference>
                <el-button size="small" class="btn-primary btn-sm" style="width: 100%;">
                  <span>{{ analysisLevelLabel }}</span>
                </el-button>
              </template>
              <div class="analysis-level-content">
                <div class="preset-buttons">
                  <el-button 
                    size="small" 
                    :class="isPresetActive('ALL') ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'"
                    @click="applyPreset('ALL')"
                  >{{ $t('batchAnalysis.fullLogs') }}</el-button>
                  <el-button 
                    size="small" 
                    :class="isPresetActive('FINE') ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'"
                    @click="applyPreset('FINE')"
                  >{{ $t('batchAnalysis.detailedLogs') }}</el-button>
                  <el-button 
                    size="small" 
                    :class="isPresetActive('KEY') ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'"
                    @click="applyPreset('KEY')"
                  >{{ $t('batchAnalysis.keyLogs') }}</el-button>
                </div>
                <el-divider style="margin: 12px 0;" />
                <div class="category-checkboxes">
                  <el-checkbox-group v-model="selectedAnalysisCategoryIds" @change="onAnalysisCategoriesChange">
                    <el-checkbox 
                      v-for="c in analysisCategories" 
                      :key="c.id" 
                      :label="c.id"
                    >{{ getCategoryDisplayName(c) }}</el-checkbox>
                  </el-checkbox-group>
                </div>
              </div>
            </el-popover>
          </div>

          <!-- 2/5 时间搜索框 -->
          <div class="grid-item">
            <div class="item-title">{{ $t('batchAnalysis.timeRange') }}</div>
            <el-date-picker
              v-model="timeRange"
              type="datetimerange"
              :range-separator="$t('logs.to')"
              :start-placeholder="$t('logs.startTime')"
              :end-placeholder="$t('logs.endTime')"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
              class="time-range"
              size="small"
               :default-value="defaultPickerRange"
              :disabled-date="disableOutOfRangeDates"
              @change="handleTimeRangeChange"
            />
          </div>
          
          <!-- 3/5 简单搜索框 -->
          <div class="grid-item">
            <div class="item-title">{{ $t('batchAnalysis.keyword') }}</div>
            <el-input
              v-model="searchKeyword"
              :placeholder="$t('batchAnalysis.searchPlaceholder')"
              class="search-input"
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

          <!-- 4/5 高级搜索入口 -->
          <div class="grid-item">
            <div class="item-title">{{ $t('batchAnalysis.advancedFilter') }}</div>
            <div class="advanced-actions">
              <el-button size="small" class="btn-primary btn-sm" plain @click="showAdvancedFilter = true">{{ $t('batchAnalysis.advancedFilter') }}</el-button>
              <div class="advanced-summary" v-if="leafConditionCount > 0">
                {{ $t('batchAnalysis.conditionsAdded', { count: leafConditionCount, logic: filtersRoot.logic }) }}
              </div>
            </div>
          </div>

          <!-- 5/5 清除搜索 -->
          <div class="grid-item">
            <div class="item-title">{{ $t('batchAnalysis.clearSearch') }}</div>
            <el-button size="small" @click="clearFilters">{{ $t('batchAnalysis.clearAllConditions') }}</el-button>
          </div>
        </div>

        <!-- 搜索表达式展示（分析等级独立显示） -->
        <div class="filter-summary" v-if="analysisLevelLabel !== $t('batchAnalysis.analysisLevelNotSelected') || searchExpression">
          <div class="filter-item" v-if="analysisLevelLabel !== $t('batchAnalysis.analysisLevelNotSelected')">
            <span class="label">{{ $t('batchAnalysis.analysisLevel') }}：</span>
            <el-tag size="small" type="info">{{ analysisLevelLabel }}</el-tag>
          </div>
          <div class="filter-item" v-if="searchExpression">
          <span class="label">{{ $t('batchAnalysis.searchExpression') }}：</span>
          <span class="expr">{{ searchExpression }}</span>
          </div>
        </div>
      </div>

      <!-- 日志条目表格 -->
      <div class="entries-section">
        <div class="section-header">
          <h3>{{ $t('batchAnalysis.logEntries') }} ({{ filteredCount }})</h3>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-section">
          <el-empty :description="$t('batchAnalysis.loadingLogData')" />
        </div>

        <!-- 数据表格 -->
        <div v-else class="table-container">
          <!-- 数据表格 -->
          <el-table 
            :data="paginatedEntries" 
            style="width: 100%"
            v-loading="loading"
            height="60vh"
            :stripe="false"
            table-layout="fixed"
            row-key="id"
            :row-class-name="getRowClassName"
            :row-style="getRowStyle"
            @current-change="forceRelayout"
            @selection-change="forceRelayout"
            @sort-change="forceRelayout"
            @filter-change="forceRelayout"
            @expand-change="forceRelayout"
          >
            <!-- 标记颜色列 -->
            <el-table-column prop="color_mark" width="4%">
              <template #header>
                <div class="col-header">
                  <span></span>
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
            <el-table-column prop="file_info" width="15%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.timestampWithFilename') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="file-info-cell">
                    <div class="timestamp" :title="row.log_name">{{ row.timestamp_text }}</div>
                </div>
              </template>
            </el-table-column>
            
            <!-- 故障码列 -->
            <el-table-column prop="error_code" width="12%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.errorCode') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="error-code-cell" @click="toggleErrorCodeStatistics(row.error_code)">
                  {{ row.error_code }}
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
            <el-table-column prop="explanation" width="45%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.explanation') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="explanation-cell">
                  <ExplanationCell :text="row.explanation" />
                </div>
              </template>
            </el-table-column>
            
            <!-- 参数列 -->
            <el-table-column prop="parameters" width="20%">
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
            
            
            <!-- 操作列（备注功能已移除，仅保留上下文分析与日志摘取） -->
            <el-table-column prop="operations" width="10%">
              <template #header>
                <div class="col-header">
                  <span>{{ $t('batchAnalysis.operations') }}</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="operations-cell">
                  <!-- 操作图标按钮 -->
                  <el-button 
                    text
                    @click="handleContextAnalysis(row)"
                    class="operation-btn"
                  >
                    <el-icon><View /></el-icon>
                  </el-button>
                  <el-button 
                    text
                    @click="handleLogCapture(row)"
                    class="operation-btn"
                  >
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
                    <div class="thumbnail-time">{{ formatTimestamp(chart.timestamp) }}</div>
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
                :height="450"
                :show-range-labels="false"
              />
              <div v-else style="width:100%;height:450px;display:flex;align-items:center;justify-content:center;color:#909399;">{{ $t('batchAnalysis.visualizationNoDataText') }}</div>
            </div>
          </div>
        </el-dialog>
      </div>
      </el-card>
    </div>

    <!-- 高级筛选弹窗 -->
    <el-dialog v-model="showAdvancedFilter" :title="$t('batchAnalysis.advancedFilter')" width="880px">
      <div class="advanced-filter">
        <!-- 1. 条件组（支持嵌套） -->
        <div class="section">
          <div class="section-title-row">
            <div class="section-title">{{ $t('batchAnalysis.conditionGroupWithNesting') }}</div>
            <div class="ops-right">
              <el-switch
                v-model="useLocalAdvanced"
                size="small"
                :active-text="$t('batchAnalysis.local')"
                :inactive-text="$t('batchAnalysis.server')"
                inline-prompt
              />
              <el-button 
                text
                size="small" 
                class="btn-danger-text"
                @click="clearAllConditionsOnly" 
                :disabled="!filtersRoot.conditions || filtersRoot.conditions.length === 0"
              >{{ $t('batchAnalysis.clearAllConditions') }}</el-button>
            </div>
          </div>
          <div class="expr-preview" v-if="advancedExpression" ref="exprPreviewRef">
            <span class="label">{{ $t('batchAnalysis.expressionPreview') }}：</span>
            <span class="expr">{{ advancedExpression }}</span>
          </div>
          <!-- 常用搜索表达式（内嵌于条件组下，位于表达式预览下侧） -->
          <div class="common-templates" v-if="templates && templates.length">
            <div class="section-title">{{ $t('batchAnalysis.commonSearchExpressions') }}</div>
            <div class="tags-ops">
              <el-button type="primary" size="small" @click="applySelectedTemplate" :disabled="!selectedTemplateName">{{ $t('batchAnalysis.apply') }}</el-button>
              <span class="hint">{{ $t('batchAnalysis.templateHint') }}</span>
            </div>
            <div class="tags-wrap antd-tags single-select">
              <a-checkable-tag
                v-for="tpl in templates"
                :key="tpl.name"
                :checked="selectedTemplateName === tpl.name"
                @change="(checked) => onTemplateSingleSelect(tpl.name, checked)"
                class="tpl-tag bordered"
              >
                {{ tpl.name }}
              </a-checkable-tag>
            </div>
          </div>
          <div class="group-root">
            <div class="group-header">
              <span>{{ $t('batchAnalysis.rootGroupLogic') }}：</span>
              <el-radio-group v-model="filtersRoot.logic" style="margin-left: 8px;">
            <el-radio-button label="AND">AND</el-radio-button>
            <el-radio-button label="OR">OR</el-radio-button>
          </el-radio-group>
              <div class="group-actions" style="margin-left: 24px;">
                <el-button size="small" class="btn-secondary btn-sm" @click="addConditionToGroup(filtersRoot)" style="margin-right: 12px;">{{ $t('batchAnalysis.addCondition') }}</el-button>
                <el-button size="small" class="btn-secondary btn-sm" @click="addGroupToGroup(filtersRoot)">{{ $t('batchAnalysis.addGroup') }}</el-button>
        </div>
            </div>
            <ConditionGroup
              :group="filtersRoot"
              :get-operator-options="getOperatorOptions"
              :on-field-change="onFieldChange"
              :on-operator-change="onOperatorChange"
              :add-condition-to-group="addConditionToGroup"
              :add-group-to-group="addGroupToGroup"
              :remove-node-at="removeNodeAt"
              :is-root="true"
            />
          </div>
        </div>

        <!-- 2. 导入表达式 -->
        <div class="section">
          <div class="section-title">{{ $t('batchAnalysis.importExpression') }}</div>
        <div class="import-row">
          <el-upload 
            :show-file-list="false" 
            accept="application/json"
            :before-upload="beforeImportTemplates"
          >
              <el-button size="small" class="btn-secondary btn-sm">{{ $t('batchAnalysis.importTemplates') }}</el-button>
          </el-upload>
        </div>
        </div>

        
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button class="btn-secondary" @click="showAdvancedFilter = false">{{ $t('shared.cancel') }}</el-button>
          <el-button type="primary" @click="applyAdvancedFilters">{{ $t('batchAnalysis.apply') }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 手术数据比对对话框 -->
    <SurgeryDataCompare
      v-model="showCompareDialog"
      :surgery-id="compareData.surgeryId"
      :existing-data="compareData.existingData"
      :new-data="compareData.newData"
      :differences="compareData.differences"
      :surgery-data="compareData.surgeryData"
      @confirmed="showCompareDialog = false"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, h, resolveComponent, watch } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Download, ArrowLeft, DataAnalysis, Warning, DocumentCopy, Close, View, Edit, Delete, InfoFilled, TrendCharts } from '@element-plus/icons-vue'
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
    TimeSeriesChart,
    SurgeryDataCompare,
    ExplanationCell: {
      name: 'ExplanationCell',
      props: { text: { type: String, default: '' } },
      setup(props) {
        // 简化：无需观察器，使用原生 title 提示，避免每格测量
        return () => h('span', {
          class: 'explanation-ellipsis',
          title: props.text,
          style: 'display:inline-block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;color:#606266;'
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
    const selectedLogs = ref([])
    const batchLogEntries = ref([])
    const searchKeyword = ref('')
    const timeRange = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(50)
    const totalCount = ref(0)
    const totalPages = ref(0)
    // 全量时间范围（来自后端聚合），用于限制时间选择器
    const globalMinTs = ref(null)
    const globalMaxTs = ref(null)
    const advancedMode = ref(false)
    const useLocalAdvanced = ref(false)
    
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
      // 根据后端提供的 rolePreset 进行默认选择
      const rolePresetMap = presetsRes.data?.rolePreset || {}
      const roleId = String(store.state.auth?.user?.role_id || '')
      const presetKey = rolePresetMap[roleId] || rolePresetMap.default || 'KEY'
      if (presets[presetKey]) {
        selectedAnalysisCategoryIds.value = [...presets[presetKey]]
      } else {
        selectedAnalysisCategoryIds.value = [...(presets.KEY || [])]
      }
    }

    const isPresetActive = (key) => {
      if (!analysisPresets.value[key]) return false
      return sameSet(selectedAnalysisCategoryIds.value, analysisPresets.value[key])
    }

    const applyPreset = (key) => {
      if (!analysisPresets.value[key]) return
      selectedAnalysisCategoryIds.value = [...analysisPresets.value[key]]
      onAnalysisCategoriesChange()
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
        (timeRange.value[0] !== formatTimestamp(timeRangeLimit.value[0]) || 
         timeRange.value[1] !== formatTimestamp(timeRangeLimit.value[1])))
      
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
    
    // 颜色选项：红、黄、蓝、绿
    const colorOptions = ref([
      { value: '#D7BDE2', label: '红色' },
      { value: '#D1F2EB', label: '黄色' },
      { value: '#FCF3CF', label: '蓝色' },
      { value: '#d6eaf8', label: '绿色' },
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

    // 高级筛选弹窗与条件
    const showAdvancedFilter = ref(false)
    const filtersRoot = ref({ logic: 'AND', conditions: [] })
    
    // 手术统计相关
    const surgeryStatisticsVisible = ref(false)
    const surgeryData = ref(null)
    const analyzing = ref(false)
    const templates = ref([])
    const selectedTemplateName = ref('')
    const importExpressionText = ref('')

    // 搜索表达式（显示在搜索卡片中）
    const groupToString = (node) => {
      if (!node) return ''
      // 叶子条件
      if (node.field && node.operator) {
        const val = Array.isArray(node.value) ? node.value.join(',') : (node.value ?? '')
        return `${node.field} ${node.operator} ${val}`
      }
      // 分组：始终使用括号包裹，不再在前缀标注逻辑 [AND]/[OR]
      if (Array.isArray(node.conditions)) {
        const logic = node.logic || 'AND'
        const inner = node.conditions
          .map(child => groupToString(child))
          .filter(Boolean)
          .join(` ${logic} `)
        if (!inner) return ''
        // 根组与子组均仅使用括号包裹，逻辑通过括号内部的连接词体现
        if (node === filtersRoot.value) {
          return `(${inner})`
        }
        return `(${inner})`
      }
      return ''
    }
    const searchExpression = computed(() => {
      const segments = []
      if (timeRange.value && timeRange.value.length === 2) {
        const [start, end] = timeRange.value
        segments.push(`${t('batchAnalysis.searchExpressionTime')}: ${formatTimestamp(start)} ~ ${formatTimestamp(end)}`)
      }
      if (searchKeyword.value) {
        segments.push(`${t('batchAnalysis.searchExpressionKeywordAll')}: ${searchKeyword.value}`)
      }
      const adv = groupToString(filtersRoot.value)
      if (adv) segments.push(`${adv}`)
      return segments.join(t('batchAnalysis.searchExpressionAnd'))
    })

    // 仅用于高级筛选弹窗内部的表达式展示，不在这里加"时间/关键字"前缀
    const advancedExpression = computed(() => {
      const adv = groupToString(filtersRoot.value)
      return adv || ''
    })

    const countLeafConditions = (node) => {
      if (!node) return 0
      if (node.field && node.operator) return 1
      if (Array.isArray(node.conditions)) return node.conditions.reduce((acc, n) => acc + countLeafConditions(n), 0)
      return 0
    }
    const leafConditionCount = computed(() => countLeafConditions(filtersRoot.value))

    // 过滤后的条目（后端分页，前端只做简单过滤）
    const filteredEntries = computed(() => {
      const list = Array.isArray(batchLogEntries.value) ? batchLogEntries.value : []
      let entries = list

      // 本地高级筛选（仅在本地模式下）
      if (advancedMode.value && useLocalAdvanced.value && leafConditionCount.value > 0) {
        entries = entries.filter(e => evaluateAdvanced(e))
      }

      return entries
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
          limit: pageSize.value
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
            const curStartDate = curStart ? new Date(curStart) : null
            const curEndDate = curEnd ? new Date(curEnd) : null
            const outOfRange = !curStartDate || !curEndDate || curStartDate < min || curEndDate > max
            if (needInit || outOfRange) {
              timeRange.value = [formatTimestamp(min), formatTimestamp(max)]
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

    // 时间范围变化处理
    const handleTimeRangeChange = async () => {
      // 越界纠正
      if (timeRangeLimit.value && timeRange.value && timeRange.value.length === 2) {
        const [min, max] = timeRangeLimit.value
        let [start, end] = timeRange.value
        const s = new Date(start)
        const e = new Date(end)
        let changed = false
        if (s < min) { start = min; changed = true }
        if (e > max) { end = max; changed = true }
        if (changed) timeRange.value = [formatTimestamp(start), formatTimestamp(end)]
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

    // 仅清空高级条件，不影响其他筛选（供弹窗内一键清空使用）
    const clearAllConditionsOnly = () => {
      filtersRoot.value = { logic: 'AND', conditions: [] }
      // 清空后自动重新搜索
      debouncedSearch()
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

    // 跳转到手术统计页面
    const showSurgeryStatistics = async () => {
      // 需要具备手术分析权限（管理员、专家）
      if (!store.getters['auth/hasPermission']?.('surgery:read')) {
        ElMessage.warning(t('batchAnalysis.insufficientPermissions'))
        return
      }
      // 确保有已排序的日志条目数据
      if (batchLogEntries.value.length === 0) {
        ElMessage.warning(t('batchAnalysis.loadLogEntriesFirst'))
        return
      }
      
      try {
        showSurgeryStatsDialog.value = true
        surgeryStatsLoading.value = true
      const logIds = selectedLogs.value.map(log => log.id)
        const resp = await api.surgeryStatistics.analyzeByLogIds(logIds, true)

        if (resp.data?.taskId) {
          const taskId = resp.data.taskId
          let attempts = 0
          const maxAttempts = 30 // 最多轮询30秒
          while (attempts < maxAttempts) {
            try {
              const status = await api.surgeryStatistics.getAnalysisTaskStatus(taskId)
              const result = status.data?.data?.result
              if (Array.isArray(result)) {
                surgeryStats.value = result
                break
              }
            } catch (_) {
              // 忽略单次失败继续轮询
            }
            await new Promise(r => setTimeout(r, 1000))
            attempts++
          }
          if (!Array.isArray(surgeryStats.value) || surgeryStats.value.length === 0) {
            ElMessage.warning('未获取到手术统计结果，请稍后重试')
          }
        } else {
          // 兼容旧版直接返回数据的情况
          surgeryStats.value = resp.data?.data || []
        }
      } catch (e) {
        ElMessage.error('手术统计失败')
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

    // 手术统计（仅列表显示）
    const showSurgeryStatsDialog = ref(false)
    const surgeryStatsLoading = ref(false)
    const surgeryStats = ref([])
    const exportingRow = ref({})
    const surgeryJsonDialogVisible = ref(false)
    const surgeryJsonText = ref('')
    const showCompareDialog = ref(false)
    const compareData = ref({})

    // 权限检查
    const hasExportPermission = computed(() => store.getters['auth/hasPermission']?.('surgery:export'))

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
              surgeryData: row
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
          filtersRoot.value = { logic, conditions: [...conditions] }
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
        return evalCondition(node.field, node.operator, node.value, entry)
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
          showAdvancedFilter.value = true
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
        const response = await api.surgeryStatistics.analyzeByLogIds(logIds, true)
        
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

    // 构建filters payload
    const buildFiltersPayload = () => {
      const normalizeNode = (node) => {
        if (!node) return null
        if (node.field && node.operator) {
          if (node.value === undefined || node.value === null || node.value === '') return null
          
          const normalizedValue = normalizeValue(node.field, node.operator, node.value)
          if (normalizedValue === null) return null
          
          return {
            field: node.field,
            operator: node.operator,
            value: normalizedValue
          }
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
    const applyAdvancedFilters = async () => {
      // 直接根据当前条件构建 payload 并执行
      showAdvancedFilter.value = false
      advancedMode.value = true
      currentPage.value = 1
      await loadBatchLogEntries(1, true)
      
      // 获取筛选统计
      await fetchFilteredStatistics()
    }

    // 保存颜色标记到sessionStorage
    const saveColorMarksToStorage = () => {
      const colorMarks = {}
      batchLogEntries.value.forEach(entry => {
        if (entry.color_mark) {
          colorMarks[entry.id] = entry.color_mark
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

    // 根据颜色标记设置行的样式类
    const getRowClassName = ({ row }) => {
      if (row.color_mark) {
        // 根据颜色值返回对应的CSS类名
        let className = ''
        switch (row.color_mark) {
          case '#ff0000': className = 'row-marked-red'; break
          case '#ffff00': className = 'row-marked-yellow'; break
          case '#0000ff': className = 'row-marked-blue'; break
          case '#00ff00': className = 'row-marked-green'; break
          default: className = ''
        }
        console.log('行样式类名:', className, '颜色值:', row.color_mark, '行数据:', row)
        return className
      }
      return ''
    }

    // 根据颜色标记设置行的内联样式
    const getRowStyle = ({ row }) => {
      if (row.color_mark) {
        // 将十六进制颜色转换为rgba格式
        const hexToRgba = (hex, alpha = 0.2) => {
          const r = parseInt(hex.slice(1, 3), 16)
          const g = parseInt(hex.slice(3, 5), 16)
          const b = parseInt(hex.slice(5, 7), 16)
          return `rgba(${r}, ${g}, ${b}, ${alpha})`
        }
        
        const backgroundColor = hexToRgba(row.color_mark, 0.2)
        console.log('行内联样式:', backgroundColor, '颜色值:', row.color_mark)
        return {
          backgroundColor: backgroundColor
        }
      }
      return {}
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
      
      // 直接将纯文本附加到摘取板（不包含参数）
      const timestamp = formatTimestamp(row.timestamp)
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
        const visualizationParams = { log_ids: logIds, error_code: row.error_code, parameter_index: paramIndex, subsystem: subsystemToQuery }
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
        const { chartData, chartTitle: apiChartTitle, paramName } = response.data.data
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
            errorCode: row.error_code
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
            symbol: 'none',
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
          
          // 获取智能时间格式化函数
          const smartTimeFormatter = getSmartTimeFormatter(validData)
          
          // 重新创建完整图表 - 完全匹配 ECharts 官方时间轴面积图示例
          const option = {
            title: undefined,
            tooltip: {
              trigger: 'axis',
              position: function (pt) {
                return [pt[0], '10%'];
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
              type: 'time',
              boundaryGap: false,
              min: Math.min(...validData.map(d => d[0])),
              max: Math.max(...validData.map(d => d[0]))
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
                symbol: 'none',
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
                data: validData
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
            series: [ { name: '数据', type: 'line', symbol: 'none', sampling: false, data: validData } ]
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
      filtersRoot.value = {
        logic: tpl.filters?.logic || 'AND',
        conditions: Array.isArray(tpl.filters?.conditions) ? [...tpl.filters.conditions] : []
      }
      // 不立即执行搜索，用户可继续增删条件
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
      activeNotesPopoverRowId,
      hoveredNameRowId,
      toggleColorPopover,
      loading,
      selectedLogs,
      batchLogEntries,
      searchKeyword,
      timeRange,
      currentPage,
      pageSize,
      totalCount,
      totalPages,
      advancedMode,
      useLocalAdvanced,
      tableColumns,
      showAdvancedFilter,
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
      analysisLevelLabel,
      isPresetActive,
      applyPreset,
      onAnalysisCategoriesChange,
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
      applyTemplateByName,
      beforeImportTemplates,
      selectedTemplateName,
      onTemplateSingleSelect,
      applySelectedTemplate,
      importExpressionText,
      
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
  overflow: auto;
  background-color: #f5f7fa;
  box-sizing: border-box;
}

.analysis-card {
  /* 使用外层 wrapper 控制留白，卡片高度自适应 */
  height: auto;
  display: flex;
  flex-direction: column;
  row-gap: 16px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  overflow: visible;
}

.analysis-card-wrapper {
  padding: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: white;
  border-bottom: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: bold;
}

.log-info {
  margin: 10px 20px;
}

.log-info .el-descriptions {
  font-size: 12px;
}

.log-info .el-descriptions__label {
  font-size: 11px;
  font-weight: 600;
}

.log-info .el-descriptions__label,
.log-info .el-descriptions__content {
  white-space: normal;
  word-break: break-word;
}

/* 自定义列宽样式 */
.log-info .el-descriptions__body {
  width: 100%;
}

.log-info .el-descriptions__table {
  width: 100%;
  table-layout: fixed;
}

.log-info .el-descriptions__cell {
  padding: 8px 12px;
  vertical-align: top;
}

/* 文件名列 - 较宽 */
.log-info .el-descriptions__cell:nth-child(1) {
  width: 50%;
}

/* 设备编号列 - 较窄 */
.log-info .el-descriptions__cell:nth-child(2) {
  width: 15%;
}

/* 文件大小列 - 较窄 */
.log-info .el-descriptions__cell:nth-child(3) {
  width: 20%;
}

/* 上传用户ID列 - 较宽 */
.log-info .el-descriptions__cell:nth-child(4) {
  width: 15%;
}

.logs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.search-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 10px 5px 10px;
  padding: 16px;
  background-color: white;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.search-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  align-items: start;
}

.grid-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-title {
  font-size: 12px;
  color: #909399;
}

.search-input {
  width: 100%;
}

.keyword-field-select {
  width: 110px;
}

.time-range {
  width: 100%;
}

.advanced-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.advanced-summary {
  font-size: 12px;
  color: #606266;
}

/* 分析等级 Popover 样式 */
.analysis-level-content {
  padding: 8px;
}

.preset-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.category-checkboxes .el-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.category-checkboxes .el-checkbox {
  margin: 0 !important;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.category-checkboxes .el-checkbox:hover {
  background-color: #f5f7fa;
}

/* 筛选条件摘要样式（分析等级独立显示） */
.filter-summary {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-item {
  font-size: 12px;
  color: #606266;
  padding: 6px 8px;
  background: #f9fafb;
  border: 1px dashed #e4e7ed;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-item .label {
  font-weight: 500;
  color: #303133;
}

.search-expression {
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
  padding: 6px 8px;
  background: #f9fafb;
  border: 1px dashed #e4e7ed;
  border-radius: 6px;
}

.search-expression .label {
  color: #909399;
  margin-right: 6px;
}

/* 高级筛选弹窗结构化分区 */
.advanced-filter .section {
  margin-bottom: 16px;
  background: #fff;
}
.advanced-filter .section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #606266;
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
  color: #909399;
}
.ops-right {
  display: flex;
  gap: 8px;
}
.expr-preview {
  margin: 6px 0 10px 0;
  font-size: 12px;
  color: #606266;
  padding: 6px 8px;
  background: #f9fafb;
  border: 1px dashed #e4e7ed;
  border-radius: 6px;
}
.expr-preview .label {
  color: #909399;
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
  background-color: white;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.table-container {
  flex: 1;
  overflow: visible;
  padding: 0 0 4px 0;
  width: 100%;
}

/* 使用 Element Plus 默认表格样式 */

/* 颜色标记行样式 - 四种颜色 */
.el-table .el-table__row.row-marked-red,
.el-table__body tr.row-marked-red {
  background-color: rgba(255, 0, 0, 0.2) !important;
}

.el-table .el-table__row.row-marked-red:hover {
  background-color: rgba(255, 0, 0, 0.3) !important;
}

.el-table .el-table__row.row-marked-yellow,
.el-table__body tr.row-marked-yellow {
  background-color: rgba(255, 255, 0, 0.2) !important;
}

.el-table .el-table__row.row-marked-yellow:hover {
  background-color: rgba(255, 255, 0, 0.3) !important;
}

.el-table .el-table__row.row-marked-blue,
.el-table__body tr.row-marked-blue {
  background-color: rgba(0, 0, 255, 0.2) !important;
}

.el-table .el-table__row.row-marked-blue:hover {
  background-color: rgba(0, 0, 255, 0.3) !important;
}

.el-table .el-table__row.row-marked-green,
.el-table__body tr.row-marked-green {
  background-color: rgba(0, 255, 0, 0.2) !important;
}

.el-table .el-table__row.row-marked-green:hover {
  background-color: rgba(0, 255, 0, 0.3) !important;
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
  border-color: #409eff !important;
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
  border: 1px solid #409eff;
}

/* 列头样式，与 Logs.vue 保持一致 */
.col-header {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 8px;
  text-align: left;
}

/* 故障码列的特殊列头样式 */
.col-header:has(.header-hint) {
  flex-direction: column;
  gap: 2px;
}

.header-hint {
  font-size: 10px;
  color: #909399;
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
  min-height: 32px;
  padding: 2px 0;
}

.explanation-ellipsis {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px !important;
  font-weight: 500 !important;
  color: #606266 !important;
  line-height: 1.4;
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
  color: #303133;
  font-size: 12px;
}

.loading-section {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  background-color: #fafafa;
  border-radius: 8px;
  margin: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin: 10px 20px;
  padding: 8px 0;
  background-color: white;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

/* 时间戳/文件名单元格样式 */
.file-info-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
  min-height: 32px;
  font-size: 14px;
  font-weight: 500;
}

.timestamp {
  color: #303133;
  font-weight: 500;
  font-size: 14px;
  text-align: left;
}

.parameters-cell {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 40px;
  width: 100%;
  color: #606266;
  word-break: break-all;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  padding: 2px 0;
}

.parameters-cell .param-item {
  margin-right: 12px;
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.parameters-cell .param-item:last-child {
  margin-right: 0;
}

.param-content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-right: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.param-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.visualization-btn {
  font-size: 20px;
  padding: 1px;
  height: 28px;
  width: 28px;
  min-width: 24px;
  min-height: 24px;
  border-radius: 3px;
  color: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
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
  color: #606266;
}

.dialog-actions {
  margin-top: 20px;
  text-align: right;
}

.dialog-actions .el-button {
  margin-left: 8px;
}

.chart-detail {
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
  background: transparent;
  border-radius: 4px;
  padding: 5px 5px 5px 5px;
  text-align: center;
}

.dialog-subtitle {
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px 0;
}

.operations-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 32px;
  padding: 1px;
  gap: 1px;
}


.error-code-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  min-height: 20px;
  cursor: pointer;
  padding: 0px 10px;
  border-radius: 4px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  box-sizing: border-box;
  font-weight: 500;
  font-size: 14px;
  position: relative;
  margin: 0;
}

.error-code-cell:hover {
  background-color: #f5f7fa;
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
  font-size: 20px;
  font-weight: 500;
  padding: 1px;
  height: 28px;
  width: 28px;
  min-width: 24px;
  min-height: 24px;
  border-radius: 3px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 查看上下文按钮 - 绿色 */
.operations-cell .operation-btn:nth-child(2) {
  color: #67c23a;
}

.operations-cell .operation-btn:nth-child(2):hover {
  color: #85ce61;
  transform: scale(1.05);
}

/* 日志摘取按钮 - 橙色 */
.operations-cell .operation-btn:nth-child(3) {
  color: #e6a23c;
}

.operations-cell .operation-btn:nth-child(3):hover {
  color: #ebb563;
  transform: scale(1.05);
}

/* 备注按钮 - 蓝色 */
.operations-cell .operation-btn:nth-child(4) {
  color: #409eff;
  cursor: pointer;
}

.operations-cell .operation-btn:nth-child(4):hover {
  color: #66b1ff;
  transform: scale(1.05);
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
  border-color: #409eff;
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
  min-height: 28px;
  padding: 0px 0;
}

/* 标记列样式 */
.el-table-column[prop="color_mark"] .cell {
  padding: 0px 0px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 28px !important;
  overflow: visible !important;
}

/* 故障码列特殊样式 - 确保统计角标完全显示 */
.el-table-column[prop="error_code"] .cell {
  padding: 0px 0px !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 1 !important;
  min-height: 28px !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  margin: 0px !important;
  border: none !important;
}

/* 确保表格行有足够的高度 */
.el-table .el-table__row {
  min-height: 28px !important;
  overflow: visible !important;
}

/* 确保表格容器不会裁剪悬浮元素，但保持滚动功能 */
.el-table {
  overflow: visible !important;
  width: 100% !important;
  table-layout: fixed !important;
  min-width: 100% !important;
}

/* 表格单元格基础样式 */
.el-table .el-table__cell {
  height: auto !important;
  min-height: 20px !important;
  max-height: none !important;
  padding: 2px 6px !important;
  overflow: visible !important;
  vertical-align: middle !important;
}

/* 表格单元格内容样式 */
.el-table--default .cell {
  height: auto !important;
  min-height: 20px !important;
  max-height: none !important;
  padding: 2px 6px !important;
  overflow: visible !important;
}

/* 表格列分割线样式 */
.el-table .el-table__cell {
  border-right: 1px solid #ebeef5 !important;
}

.el-table .el-table__cell:last-child {
  border-right: none !important;
}

/* 表头单元格样式 */
.el-table__header .el-table__cell {
  box-sizing: border-box !important;
}


/* 确保表格头部正确显示 */
.el-table__header-wrapper {
  width: 100% !important;
}

.el-table__header {
  width: 100% !important;
}

/* 确保表格体正确显示 */
.el-table__body-wrapper {
  width: 100% !important;
}

.el-table__body {
  width: 100% !important;
}

.el-table__body-wrapper {
  overflow-x: auto !important;
  overflow-y: visible !important;
}

/* 强制确保故障码角标不被裁剪 */
.el-table-column[prop="error_code"] {
  overflow: visible !important;
}

.el-table-column[prop="error_code"] .cell > div {
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
  border-color: #409eff;
  border-width: 3px;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-option.no-color {
  background-color: #f5f5f5;
  border-color: #ccc;
}

.color-option.no-color:hover {
  border-color: #409eff;
  background-color: #f0f8ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.color-option.no-color.active {
  border-color: #409eff;
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
  color: #606266;
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
  color: #606266;
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
  color: #606266;
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
  color: #303133;
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
  color: #303133;
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
  border-color: #409eff;
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
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thumbnail-time {
  font-size: 10px;
  color: #909399;
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
  color: #909399;
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
  color: #303133;
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
  background-color: #f5f7fa;
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
  color: #606266;
  min-width: 20px;
}

.entry-timestamp {
  font-size: 12px;
  color: #909399;
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
  min-height: 32px;
  font-size: 14px;
  font-weight: 500;
}

.timestamp {
  color: #303133;
  font-weight: 500;
  font-size: 14px;
  text-align: left;
}

.parameters-cell {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 40px;
  width: 100%;
  color: #606266;
  word-break: break-all;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  padding: 2px 0;
}

.parameters-cell .param-item {
  margin-right: 12px;
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.parameters-cell .param-item:last-child {
  margin-right: 0;
}

.param-content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-right: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.param-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.visualization-btn {
  font-size: 20px;
  padding: 1px;
  height: 28px;
  width: 28px;
  min-width: 24px;
  min-height: 24px;
  border-radius: 3px;
  color: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
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
  color: #606266;
}

.dialog-actions {
  margin-top: 20px;
  text-align: right;
}

.dialog-actions .el-button {
  margin-left: 8px;
}

.chart-detail {
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
  background: transparent;
  border-radius: 4px;
  padding: 10px 10px 20px 10px;
  text-align: center;
}

.dialog-subtitle {
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px 0;
}

.operations-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 32px;
  padding: 1px;
  gap: 1px;
}


.error-code-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  min-height: 20px;
  cursor: pointer;
  padding: 0px 10px;
  border-radius: 4px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  box-sizing: border-box;
  font-weight: 500;
  font-size: 14px;
  position: relative;
  margin: 0;
}

.error-code-cell:hover {
  background-color: #f5f7fa;
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
  font-size: 20px;
  font-weight: 500;
  padding: 1px;
  height: 28px;
  width: 28px;
  min-width: 24px;
  min-height: 24px;
  border-radius: 3px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 查看上下文按钮 - 绿色 */
.operations-cell .operation-btn:nth-child(2) {
  color: #67c23a;
}

.operations-cell .operation-btn:nth-child(2):hover {
  color: #85ce61;
  transform: scale(1.05);
}

/* 日志摘取按钮 - 橙色 */
.operations-cell .operation-btn:nth-child(3) {
  color: #e6a23c;
}

.operations-cell .operation-btn:nth-child(3):hover {
  color: #ebb563;
  transform: scale(1.05);
}

/* 备注按钮 - 灰色（禁用状态） */
.operations-cell .operation-btn:nth-child(4) {
  color: #c0c4cc;
  cursor: not-allowed;
}

.operations-cell .operation-btn:nth-child(4):hover {
  color: #c0c4cc;
  transform: none;
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
  border-color: #409eff;
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
  min-height: 28px;
  padding: 0px 0;
}

/* 标记列样式 */
.el-table-column[prop="color_mark"] .cell {
  padding: 0px 0px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 28px !important;
  overflow: visible !important;
}

/* 故障码列特殊样式 - 确保统计角标完全显示 */
.el-table-column[prop="error_code"] .cell {
  padding: 0px 0px !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 1 !important;
  min-height: 28px !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  margin: 0px !important;
  border: none !important;
}

/* 确保表格行有足够的高度 */
.el-table .el-table__row {
  min-height: 28px !important;
  overflow: visible !important;
}

/* 确保表格容器不会裁剪悬浮元素，但保持滚动功能 */
.el-table {
  overflow: visible !important;
  width: 100% !important;
  table-layout: fixed !important;
  min-width: 100% !important;
}

/* 表格单元格基础样式 */
.el-table .el-table__cell {
  height: auto !important;
  min-height: 20px !important;
  max-height: none !important;
  padding: 2px 6px !important;
  overflow: visible !important;
  vertical-align: middle !important;
}

/* 表格单元格内容样式 */
.el-table--default .cell {
  height: auto !important;
  min-height: 20px !important;
  max-height: none !important;
  padding: 2px 6px !important;
  overflow: visible !important;
}

/* 表格列分割线样式 */
.el-table .el-table__cell {
  border-right: 1px solid #ebeef5 !important;
}

.el-table .el-table__cell:last-child {
  border-right: none !important;
}

/* 表头单元格样式 */
.el-table__header .el-table__cell {
  box-sizing: border-box !important;
}


/* 确保表格头部正确显示 */
.el-table__header-wrapper {
  width: 100% !important;
}

.el-table__header {
  width: 100% !important;
}

/* 确保表格体正确显示 */
.el-table__body-wrapper {
  width: 100% !important;
}

.el-table__body {
  width: 100% !important;
}

.el-table__body-wrapper {
  overflow-x: auto !important;
  overflow-y: visible !important;
}

/* 强制确保故障码角标不被裁剪 */
.el-table-column[prop="error_code"] {
  overflow: visible !important;
}

.el-table-column[prop="error_code"] .cell > div {
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
  border-color: #409eff;
  border-width: 3px;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-option.no-color {
  background-color: #f5f5f5;
  border-color: #ccc;
}

.color-option.no-color:hover {
  border-color: #409eff;
  background-color: #f0f8ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.color-option.no-color.active {
  border-color: #409eff;
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
  color: #606266;
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
  color: #606266;
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
  color: #303133;
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
  border-color: #409eff;
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
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thumbnail-time {
  font-size: 10px;
  color: #909399;
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
  color: #909399;
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
  color: #303133;
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
  background-color: #f5f7fa;
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
  color: #606266;
  min-width: 20px;
}

.entry-timestamp {
  font-size: 12px;
  color: #909399;
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
.note-meta { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #909399; }
.note-user.role-admin { color: #f56c6c; }
.note-user.role-expert { color: #409eff; }
.note-user.role-user { color: #909399; }
.note-time { margin-left: auto; }
.note-actions { margin-left: 8px; }
.note-content { margin-top: 4px; font-size: 13px; color: #606266; white-space: pre-wrap; }
.note-edit-actions { margin-top: 6px; text-align: right; }
.notes-pagination { margin-top: 6px; text-align: right; }
.notes-editor { margin-top: 8px; }
.notes-editor-actions { margin-top: 6px; text-align: right; }
</style>