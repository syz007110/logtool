<template>
  <div class="batch-analysis-container">
    <!-- 主要内容 -->
    <div class="analysis-card-wrapper">
      <el-card class="analysis-card">
      <div class="card-header" :style="{ borderBottom: 'none' }">
        <div class="header-left">
          <span class="title">批量日志查看</span>
          <el-tag v-if="batchCount > 0 && selectedLogsCount > 0" type="info" size="small">
              设备编号：{{ selectedLogs[0]?.device_id || '未知' }}
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
              已选择 {{ selectedLogsCount }} 个日志文件
            </el-tag>
          </el-tooltip>
        </div>
        <div class="header-right">
          <el-button 
            v-if="!loading && batchCount > 0" 
            @click="showClipboard" 
            type="info" 
            size="small"
          >
            <el-icon><DocumentCopy /></el-icon>
            剪贴板
          </el-button>
          <el-button 
            v-if="!loading && batchCount > 0" 
            @click="exportToCSV" 
            type="success" 
            size="small"
          >
            <el-icon><Download /></el-icon>
            导出CSV
          </el-button>
          <el-button 
            v-if="!loading && selectedLogsCount > 0 && batchCount > 0" 
            @click="showSurgeryStatistics" 
            type="primary" 
            size="small" 
            style="margin-left: 10px;"
          >
            <el-icon><DataAnalysis /></el-icon>
            手术统计
          </el-button>
        </div>
      </div>

      <!-- 搜索和筛选 -->
      <div class="search-section" :style="{ marginTop: '8px' }">
        <div class="search-grid">
          <!-- 1/4 时间搜索框 -->
          <div class="grid-item">
            <div class="item-title">时间范围</div>
            <el-date-picker
              v-model="timeRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
              class="time-range"
              size="small"
               :default-value="defaultPickerRange"
              :disabled-date="disableOutOfRangeDates"
              @change="handleTimeRangeChange"
            />
          </div>
          
          <!-- 2/4 简单搜索框 -->
          <div class="grid-item">
            <div class="item-title">关键字</div>
            <el-input
              v-model="searchKeyword"
              placeholder="搜索释义内容或故障码"
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

          <!-- 3/4 高级搜索入口 -->
          <div class="grid-item">
            <div class="item-title">高级搜索</div>
            <div class="advanced-actions">
              <el-button size="small" type="primary" plain @click="showAdvancedFilter = true">打开高级筛选</el-button>
              <div class="advanced-summary" v-if="leafConditionCount > 0">
                已添加 {{ leafConditionCount }} 个条件（逻辑：{{ filtersRoot.logic }}）
              </div>
            </div>
          </div>

          <!-- 4/4 清除搜索 -->
          <div class="grid-item">
            <div class="item-title">清除搜索</div>
            <el-button size="small" @click="clearFilters">清除所有条件</el-button>
          </div>
        </div>

        <!-- 搜索表达式展示 -->
        <div class="search-expression" v-if="searchExpression">
          <span class="label">搜索表达式：</span>
          <span class="expr">{{ searchExpression }}</span>
        </div>
      </div>

      <!-- 日志条目表格 -->
      <div class="entries-section">
        <div class="section-header">
          <h3>日志条目 ({{ filteredCount }})</h3>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-section">
          <el-empty description="正在加载日志数据..." />
        </div>

        <!-- 数据表格 -->
        <div v-else class="table-container">
          <!-- 虚拟滚动表格 -->
          <VirtualTable
            v-if="useVirtualScroll"
            ref="virtualTableRef"
            :data="paginatedEntries"
            :columns="tableColumns"
            :item-height="60"
            :buffer="10"
            :row-class-name="getRowClassName"
            style="height: 60vh;"
            @load-more="handleLoadMore"
          >
                          <template #color_mark="{ row }">
                <el-popover
                  placement="bottom-start"
                  :width="200"
                  trigger="click"
                  popper-class="color-picker-popover"
                >
                  <template #reference>
                    <div 
                      class="color-indicator"
                      :class="{ 'has-color': row.color_mark }"
                      :style="row.color_mark ? { backgroundColor: row.color_mark } : {}"
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
              </template>
            <template #file_info="{ row }">
              <div class="file-info-cell">
                <div class="timestamp">{{ formatTimestamp(row.timestamp) }}</div>
                <div class="file-name">{{ row.log_name }}</div>
              </div>
            </template>
            <template #explanation="{ row }">
              <ExplanationCell :text="row.explanation" />
            </template>
            <template #parameters="{ row }">
              <div class="parameters-cell">
                <div class="param-content">
                  <span v-for="(param, index) in [row.param1, row.param2, row.param3, row.param4].filter(p => p)" :key="index" class="param-item">{{ param }}</span>
                </div>
                <div class="param-actions">
                  <el-button 
                    size="small" 
                    type="primary" 
                    @click="handleVisualization(row)"
                    class="visualization-btn"
                  >
                    可视化
                  </el-button>
                </div>
              </div>
            </template>
            <template #remarks="{ row }">
              <el-input 
                v-model="row.remarks" 
                placeholder="添加备注"
                size="small"
                type="textarea"
                :rows="1"
                resize="none"
              />
            </template>
            <template #operations="{ row }">
              <div class="operations-cell">
                <!-- 操作标签按钮 -->
                <el-tag 
                  size="small" 
                  type="success" 
                  class="operation-tag"
                  @click="handleContextAnalysis(row)"
                  style="cursor: pointer;"
                >
                  查看上下文
                </el-tag>
                <el-tag 
                  size="small" 
                  type="warning" 
                  class="operation-tag"
                  @click="handleLogCapture(row)"
                  style="cursor: pointer;"
                >
                  日志摘取
                </el-tag>
                <el-tag 
                  size="small" 
                  type="primary" 
                  class="operation-tag"
                  @click="handleRemarks(row)"
                  style="cursor: pointer;"
                >
                  备注
                </el-tag>
              </div>
            </template>
          </VirtualTable>
          
          <!-- 传统表格（备用） -->
          <el-table 
            v-else
            :data="paginatedEntries" 
            style="width: 100%"
            v-loading="loading"
            height="60vh"
            :stripe="false"
            table-layout="fixed"
            :row-class-name="getRowClassName"
            @current-change="forceRelayout"
            @selection-change="forceRelayout"
            @sort-change="forceRelayout"
            @filter-change="forceRelayout"
            @expand-change="forceRelayout"
          >
            <!-- 标记颜色列 -->
            <el-table-column prop="color_mark" align="center">
              <template #header>
                <div class="col-header">
                  <span>标记</span>
                </div>
              </template>
              <template #default="{ row }">
                  <el-popover
                    placement="bottom-start"
                    :width="200"
                    trigger="click"
                    popper-class="color-picker-popover"
                  >
                    <template #reference>
                      <div 
                        class="color-indicator"
                        :class="{ 'has-color': row.color_mark }"
                        :style="row.color_mark ? { backgroundColor: row.color_mark } : {}"
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
              </template>
            </el-table-column>
            
            <!-- 时间戳/文件名列 -->
            <el-table-column prop="file_info">
              <template #header>
                <div class="col-header">
                  <span>时间戳 / 文件名</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="file-info-cell">
                  <div class="timestamp">{{ formatTimestamp(row.timestamp) }}</div>
                  <div class="file-name">{{ row.log_name }}</div>
                </div>
              </template>
            </el-table-column>
            
            <!-- 故障码列 -->
            <el-table-column prop="error_code" sortable>
              <template #header>
                <div class="col-header">
                  <span>故障码</span>
                </div>
              </template>
            </el-table-column>
            
            <!-- 释义列 -->
            <el-table-column prop="explanation">
              <template #header>
                <div class="col-header">
                  <span>释义</span>
                </div>
              </template>
              <template #default="{ row }">
                <ExplanationCell :text="row.explanation" />
              </template>
            </el-table-column>
            
            <!-- 参数列 -->
            <el-table-column prop="parameters">
              <template #header>
                <div class="col-header">
                  <span>参数1 / 参数2 / 参数3 / 参数4</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="parameters-cell">
                  <div class="param-content">
                    <span v-for="(param, index) in [row.param1, row.param2, row.param3, row.param4].filter(p => p)" :key="index" class="param-item">{{ param }}</span>
                  </div>
                  <div class="param-actions">
                    <el-button 
                      size="small" 
                      type="primary" 
                      @click="handleVisualization(row)"
                      class="visualization-btn"
                    >
                      可视化
                    </el-button>
                  </div>
                </div>
              </template>
            </el-table-column>
            
            
            <!-- 操作列 -->
            <el-table-column prop="operations">
              <template #header>
                <div class="col-header">
                  <span>操作</span>
                </div>
              </template>
              <template #default="{ row }">
                <div class="operations-cell">
                  <!-- 操作标签按钮 -->
                  <el-tag 
                    size="small" 
                    type="success" 
                    class="operation-tag"
                    @click="handleContextAnalysis(row)"
                    style="cursor: pointer;"
                  >
                    查看上下文
                  </el-tag>
                  <el-tag 
                    size="small" 
                    type="warning" 
                    class="operation-tag"
                    @click="handleLogCapture(row)"
                    style="cursor: pointer;"
                  >
                    日志摘取
                  </el-tag>
                  <el-tag 
                    size="small" 
                    type="primary" 
                    class="operation-tag"
                    @click="handleRemarks(row)"
                    style="cursor: pointer;"
                  >
                    备注
                  </el-tag>
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
          title="上下文分析"
          width="500px"
          :close-on-click-modal="false"
        >
          <div class="context-analysis-form">
            <div class="time-range-inputs">
              <span>将以选中的日志条目为基点</span>
              <div class="input-group">
                <label>前</label>
                <el-input-number
                  v-model="beforeMinutes"
                  :min="1"
                  :max="60"
                  controls-position="right"
                  style="width: 80px;"
                />
                <span>分钟</span>
              </div>
              <span>，</span>
              <div class="input-group">
                <label>后</label>
                <el-input-number
                  v-model="afterMinutes"
                  :min="1"
                  :max="60"
                  controls-position="right"
                  style="width: 80px;"
                />
                <span>分钟</span>
              </div>
            </div>
          </div>
          
          <template #footer>
            <div class="dialog-footer">
              <el-button type="primary" @click="executeContextAnalysis">确认分析</el-button>
            </div>
          </template>
        </el-dialog>

        <!-- 日志摘取侧边栏 -->
        <el-drawer
          v-model="clipboardVisible"
          title="剪贴板"
          direction="rtl"
          size="300px"
          :with-header="true"
        >
          <div class="clipboard-container">
            <div class="clipboard-header">
              <div class="clipboard-thumbnail" @click="clipboardDetailVisible = true">
                <div class="clipboard-icon">
                  <el-icon size="20"><DocumentCopy /></el-icon>
                </div>
                <div class="clipboard-text">
                  <div class="clipboard-title">日志摘取板</div>
                  <div class="clipboard-count">{{ clipboardEntries.length }} 条日志</div>
                </div>
                <el-button 
                  v-if="clipboardEntries.length > 0"
                  size="small" 
                  type="danger" 
                  circle 
                  class="delete-btn"
                  @click.stop="clearClipboard"
                >
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </el-drawer>

        <!-- 参数选择对话框 -->
        <el-dialog
          v-model="parameterSelectVisible"
          title="选择可视化参数"
          width="400px"
          :close-on-click-modal="false"
        >
          <div class="parameter-select-dialog">
            <p>请选择要作为Y轴显示的参数：</p>
            <el-select 
              v-model="selectedParameter" 
              placeholder="选择参数"
              style="width: 100%"
            >
              <el-option 
                v-for="(param, index) in availableParameters" 
                :key="index"
                :label="`参数${index + 1}: ${param}`"
                :value="index + 1"
              />
            </el-select>
            <div class="dialog-actions">
              <el-button @click="parameterSelectVisible = false">取消</el-button>
              <el-button type="primary" @click="confirmVisualization">确认</el-button>
            </div>
          </div>
        </el-dialog>

        <!-- 剪贴板详情弹窗 -->
        <el-dialog
          v-model="clipboardDetailVisible"
          title="剪贴板详情"
          width="60%"
          :close-on-click-modal="false"
        >
          <div class="clipboard-detail">
            <div class="clipboard-detail-header">
              <span>共 {{ clipboardEntries.length }} 条日志</span>
              <div class="detail-actions">
                <el-button size="small" type="primary" @click="saveClipboardContent">
                  保存编辑
                </el-button>
                <el-button size="small" type="success" @click="exportClipboardToTxt">
                  导出TXT文件
                </el-button>
                <el-button size="small" type="danger" @click="clearClipboard">
                  清空剪贴板
                </el-button>
              </div>
            </div>
            
            <div class="clipboard-content">
              <el-input
                v-model="clipboardContent"
                type="textarea"
                :rows="5"
                placeholder="剪贴板内容将显示在这里，支持直接编辑..."
                class="clipboard-textarea"
              />
            </div>
            
          </div>
        </el-dialog>

        <!-- 图表详情弹窗 -->
        <el-dialog
          v-model="chartDetailVisible"
          title="数据可视化图表"
          width="80%"
          :close-on-click-modal="false"
        >
          <div class="chart-detail">
            <div class="chart-detail-header">
              <span>{{ chartTitle }}</span>
              <div class="chart-actions">
                <el-button size="small" type="success" @click="exportChartAsImage">
                  另存为图片
                </el-button>
              </div>
            </div>
            <div class="chart-container" ref="chartContainer">
              <div id="visualizationChart" style="width: 100%; height: 400px;"></div>
            </div>
          </div>
        </el-dialog>
      </div>
      </el-card>
    </div>

    <!-- 高级筛选弹窗 -->
    <el-dialog v-model="showAdvancedFilter" title="高级筛选" width="880px">
      <div class="advanced-filter">
        <!-- 1. 条件组（支持嵌套） -->
        <div class="section">
          <div class="section-title-row">
            <div class="section-title">1. 条件组（支持嵌套）</div>
            <div class="ops-right">
              <el-switch
                v-model="useLocalAdvanced"
                size="small"
                active-text="本地"
                inactive-text="服务端"
                inline-prompt
              />
              <el-button 
                size="small" 
                type="danger" 
                text 
                @click="clearAllConditionsOnly" 
                :disabled="!filtersRoot.conditions || filtersRoot.conditions.length === 0"
              >清空所有条件</el-button>
            </div>
          </div>
          <div class="expr-preview" v-if="advancedExpression" ref="exprPreviewRef">
            <span class="label">表达式预览：</span>
            <span class="expr">{{ advancedExpression }}</span>
          </div>
          <!-- 常用搜索表达式（内嵌于条件组下，位于表达式预览下侧） -->
          <div class="common-templates" v-if="templates && templates.length">
            <div class="section-title">常用搜索表达式</div>
            <div class="tags-ops">
              <el-button size="small" type="primary" plain @click="applySelectedTemplate" :disabled="!selectedTemplateName">应用选择表达式</el-button>
              <span class="hint">选择表达式并应用，条件会自动填充进"添加条件"区域</span>
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
              <span>根组逻辑：</span>
              <el-radio-group v-model="filtersRoot.logic">
            <el-radio-button label="AND">AND</el-radio-button>
            <el-radio-button label="OR">OR</el-radio-button>
          </el-radio-group>
              <div class="group-actions">
                <el-button size="small" type="primary" @click="addConditionToGroup(filtersRoot)">添加条件</el-button>
                <el-button size="small" @click="addGroupToGroup(filtersRoot)">添加子组</el-button>
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
          <div class="section-title">2. 导入表达式</div>
        <div class="import-row">
          <el-upload 
            :show-file-list="false" 
            accept="application/json"
            :before-upload="beforeImportTemplates"
          >
              <el-button size="small">从文件导入(JSON)</el-button>
          </el-upload>
        </div>
        </div>

        
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAdvancedFilter = false">取消</el-button>
          <el-button type="primary" @click="applyAdvancedFilters">应用</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, h, resolveComponent } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Download, ArrowLeft, DataAnalysis, Warning, DocumentCopy, Close } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import api from '@/api'
import VirtualTable from '@/components/VirtualTable.vue'

export default {
  name: 'BatchAnalysis',
  components: {
    Search,
    Download,
    ArrowLeft,
    DataAnalysis,
    Warning,
    VirtualTable,
    ExplanationCell: {
      name: 'ExplanationCell',
      props: { text: { type: String, default: '' } },
      setup(props) {
        const containerRef = ref(null)
        const needsTooltip = ref(false)
        let resizeObserver = null

        const measure = () => {
          const el = containerRef.value
          if (!el) return
          // 使用 > 而非 >=，并允许 1px 阈值容错
          needsTooltip.value = (el.scrollWidth - el.clientWidth) > 1
        }

        const handleMouseEnter = () => {
          // 悬停时再即时测量，保证分页切换后也能正确判断
          measure()
        }

        onMounted(async () => {
          await nextTick()
          measure()
          if ('ResizeObserver' in window) {
            resizeObserver = new ResizeObserver(() => measure())
            if (containerRef.value) resizeObserver.observe(containerRef.value)
          } else {
            window.addEventListener('resize', measure)
          }
        })

        onBeforeUnmount(() => {
          if (resizeObserver && containerRef.value) resizeObserver.unobserve(containerRef.value)
          if (resizeObserver) resizeObserver.disconnect()
          resizeObserver = null
          window.removeEventListener('resize', measure)
        })

        return () => h(resolveComponent('el-tooltip'), {
          content: props.text,
          placement: 'top',
          effect: 'dark',
          popperClass: 'explanation-tooltip dark',
          teleported: true,
          showAfter: 120,
          disabled: !needsTooltip.value
        }, {
          default: () => h('span', {
            ref: containerRef,
            class: 'explanation-ellipsis',
            style: 'display:inline-block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
            onMouseenter: handleMouseEnter
          }, props.text)
        })
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
              placeholder: '字段',
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
                h(ElOption, { label: '时间戳', value: 'timestamp' }),
                h(ElOption, { label: '故障码', value: 'error_code' }),
                h(ElOption, { label: '参数1', value: 'param1' }),
                h(ElOption, { label: '参数2', value: 'param2' }),
                h(ElOption, { label: '参数3', value: 'param3' }),
                h(ElOption, { label: '参数4', value: 'param4' }),
                h(ElOption, { label: '释义', value: 'explanation' })
              ]
            }),
            h(ElSelect, {
              modelValue: node.operator,
              style: 'width: 150px; margin-left: 8px;',
              placeholder: '操作符',
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
                  placeholder: '值',
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
            h(ElButton, { type: 'danger', text: true, style: 'margin-left:8px;', onClick: () => props.removeNodeAt(parent, idx) }, { default: () => '删除' })
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
                  h('span', null, '组逻辑：'),
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
                    h(ElButton, { size: 'small', type: 'primary', onClick: () => props.addConditionToGroup(node) }, { default: () => '添加条件' }),
                    h(ElButton, { size: 'small', onClick: () => props.addGroupToGroup(node) }, { default: () => '添加子组' }),
                    h(ElButton, { size: 'small', type: 'danger', text: true, onClick: () => props.removeNodeAt(group, idx) }, { default: () => '删除组' })
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
              h(ElButton, { size: 'small', type: 'primary', onClick: () => props.addConditionToGroup(group) }, { default: () => '添加条件' }),
              h(ElButton, { size: 'small', onClick: () => props.addGroupToGroup(group) }, { default: () => '添加子组' })
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
    
    const loading = ref(false)
    const selectedLogs = ref([])
    const batchLogEntries = ref([])
    const searchKeyword = ref('')
    const timeRange = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(100)
    const totalCount = ref(0)
    const totalPages = ref(0)
    // 全量时间范围（来自后端聚合），用于限制时间选择器
    const globalMinTs = ref(null)
    const globalMaxTs = ref(null)
    const advancedMode = ref(false)
    const useLocalAdvanced = ref(false)
    
    // 虚拟滚动相关
    const useVirtualScroll = ref(true)
    // 是否允许滚动自动加载下一页（按需开启，默认关闭）
    const allowAutoLoad = ref(false)
    const virtualTableRef = ref(null)
    
    // 上下文分析相关
    const contextAnalysisVisible = ref(false)
    const contextAnalysisRow = ref(null)
    const beforeMinutes = ref(5)
    const afterMinutes = ref(5)

    // 日志摘取相关
    const clipboardVisible = ref(false)
    const clipboardEntries = ref([])
    const maxClipboardEntries = 50
    const clipboardDetailVisible = ref(false)
    const clipboardContent = ref('')

    // 可视化相关
    const parameterSelectVisible = ref(false)
    const selectedParameter = ref(null)
    const availableParameters = ref([])
    const currentVisualizationRow = ref(null)
    const chartDetailVisible = ref(false)
    const chartTitle = ref('')
    const chartContainer = ref(null)
    const chartInstance = ref(null)
    
    // 颜色选项：红、黄、蓝、绿
    const colorOptions = ref([
      { value: '#ff0000', label: '红色' },
      { value: '#ffff00', label: '黄色' },
      { value: '#0000ff', label: '蓝色' },
      { value: '#00ff00', label: '绿色' },
      { value: null, label: '无' }
    ])
    const tableColumns = ref([
      { prop: 'color_mark', label: '', width: '3%' },
      { prop: 'file_info', label: '时间戳 / 文件名', width: '15%' },
      { prop: 'error_code', label: '故障码', width: '8%' },
      { prop: 'explanation', label: '释义', width: '40%' },
      { prop: 'parameters', label: '参数（1-4）', width: '15%' },
      { prop: 'operations', label: '操作', width: '19%' }
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
        segments.push(`时间: ${formatTimestamp(start)} ~ ${formatTimestamp(end)}`)
      }
      if (searchKeyword.value) {
        segments.push(`关键字(全部): ${searchKeyword.value}`)
      }
      const adv = groupToString(filtersRoot.value)
      if (adv) segments.push(`${adv}`)
      // 用 AND 串联，直观体现与关系
      return segments.join(' AND ')
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
        // 从API获取所有日志信息
        const response = await store.dispatch('logs/fetchLogs', { page: 1, limit: 1000 })
        const allLogs = response.data.logs
        selectedLogs.value = allLogs.filter(log => ids.includes(log.id))
      } catch (error) {
        ElMessage.error('获取日志信息失败')
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
        const response = await store.dispatch('logs/fetchBatchLogEntries', baseParams, signal)
        const { entries, total, totalPages: serverTotalPages, page: serverPage, minTimestamp, maxTimestamp } = response.data
        
        // 处理返回的数据
        const idToName = new Map(selectedLogs.value.map(l => [l.id, l.original_name]))
        const processedEntries = entries.map(entry => ({
                ...entry,
          log_name: idToName.get(entry.log_id) || '',
          color_mark: entry.color_mark || null,
          remarks: entry.remarks || ''
        }))
        
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

        // 更新时间范围限制（以后端返回的整体范围为准）
        if (minTimestamp && maxTimestamp) {
          // 确保是 Date 对象
          const min = new Date(minTimestamp)
          const max = new Date(maxTimestamp)
          if (!Number.isNaN(min.getTime()) && !Number.isNaN(max.getTime())) {
            globalMinTs.value = min
            globalMaxTs.value = max
            // 仅当当前 timeRange 超出范围或尚未设置时才回填
            const needInit = !timeRange.value || timeRange.value.length !== 2
            const [curStart, curEnd] = needInit ? [null, null] : timeRange.value
            const curStartDate = curStart ? new Date(curStart) : null
            const curEndDate = curEnd ? new Date(curEnd) : null
            const outOfRange = !curStartDate || !curEndDate || curStartDate < min || curEndDate > max
            if (needInit || outOfRange) {
              timeRange.value = [
                formatTimestamp(min),
                formatTimestamp(max)
              ]
            }
          }
        }
        
        // 翻页/加载完成时不显示全量数量提示，避免频繁打扰
        
      } catch (error) {
        ElMessage.error('批量分析失败: ' + (error.response?.data?.message || error.message))
      } finally {
        loading.value = false
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
      
      searchTimer = setTimeout(() => {
        if (!isComposing.value) {
          currentPage.value = 1
          loadBatchLogEntries(1, true, searchAbortController.signal)
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
    }

    // 时间范围变化处理
    const handleTimeRangeChange = () => {
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
      loadBatchLogEntries(1, true)
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

    // 导出CSV（服务端生成 + axios 带鉴权单请求下载）
    const exportToCSV = async () => {
      try {
        ElMessage.info('正在导出，请稍候...')
        const logIds = selectedLogs.value.map(l => l.id).join(',')
        const params = {
          log_ids: logIds
        }
        if (advancedMode.value && leafConditionCount.value > 0) {
          const filtersPayload = buildFiltersPayload()
          if (filtersPayload) params.filters = JSON.stringify(filtersPayload)
        }
        if (timeRange.value && timeRange.value.length === 2) {
          params.start_time = timeRange.value[0]
          params.end_time = timeRange.value[1]
        }
        if (searchKeyword.value) params.search = searchKeyword.value

        const resp = await api.logs.exportBatchEntries(params)
        const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `batch_logs_analysis_${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        ElMessage.success('CSV导出完成')
      } catch (error) {
        ElMessage.error('导出CSV失败: ' + (error.response?.data?.message || error.message))
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
      const date = new Date(timestamp)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
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
      // 确保有已排序的日志条目数据
      if (batchLogEntries.value.length === 0) {
        ElMessage.warning('请先加载日志条目数据')
        return
      }
      
      // 传递选中的日志ID到手术统计页面
      const logIds = selectedLogs.value.map(log => log.id)
      
      // 设置自动分析标志
      sessionStorage.setItem('autoAnalyze', 'true')
      
      // 在新窗口中打开手术统计页面，通过URL参数传递日志ID
      const routeData = router.resolve({
        path: '/surgery-statistics',
        query: { logIds: logIds.join(',') }
      })
      window.open(routeData.href, '_blank')
    }

    // 模板相关
    const loadTemplates = async () => {
      try {
        const res = await api.logs.getSearchTemplates()
        templates.value = res.data.templates || []
      } catch {}
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
        const arr = Array.isArray(value) ? value : [value]
        const trimmed = arr.map(s => s.toString().trim()).filter(s => s !== '')
        if (isNumeric) {
          return trimmed.map(v => Number(v)).filter(v => !Number.isNaN(v))
        }
        return trimmed
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
        const arr = Array.isArray(value) ? value : String(value ?? '').split(',').map(v => v.trim()).filter(Boolean)
        if (isNumeric) {
          const set = new Set(arr.map(toNumber).filter(v => v !== null))
          const n = toNumber(raw)
          const ok = n !== null && set.has(n)
          return op === 'in' ? ok : !ok
        }
        const set = new Set(arr.map(v => v.toString()))
        const ok = set.has(String(raw))
        return op === 'in' ? ok : !ok
      }

      if (op === 'regex') {
        try {
          const re = new RegExp(String(value))
          return re.test(String(raw))
        } catch { return false }
      }

      if (op === 'contains' || op === 'like') {
        return String(raw).toLowerCase().includes(String(value ?? '').toLowerCase())
      }
      if (op === 'notcontains') {
        return !String(raw).toLowerCase().includes(String(value ?? '').toLowerCase())
      }
      if (op === 'startswith') {
        return String(raw).startsWith(String(value ?? ''))
      }
      if (op === 'endswith') {
        return String(raw).endsWith(String(value ?? ''))
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
        const response = await api.surgeryStatistics.analyzeByLogIds(logIds)
        
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
    const operatorOptionsByField = {
      timestamp: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: 'Between', value: 'between' }
      ],
      error_code: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '包含(Like)', value: 'contains' },
        { label: '不包含', value: 'notcontains' },
        { label: '正则', value: 'regex' },
        { label: '前缀', value: 'startsWith' },
        { label: '后缀', value: 'endsWith' }
      ],
      param1: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: 'Between', value: 'between' },
        { label: 'In', value: 'in' },
        { label: '包含(Like)', value: 'contains' },
        { label: '不包含', value: 'notcontains' }
      ],
      param2: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: 'Between', value: 'between' },
        { label: 'In', value: 'in' },
        { label: '包含(Like)', value: 'contains' },
        { label: '不包含', value: 'notcontains' }
      ],
      param3: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: 'Between', value: 'between' },
        { label: 'In', value: 'in' },
        { label: '包含(Like)', value: 'contains' },
        { label: '不包含', value: 'notcontains' }
      ],
      param4: [
        { label: '=', value: '=' },
        { label: '!=', value: '!=' },
        { label: '>', value: '>' },
        { label: '>=', value: '>=' },
        { label: '<', value: '<' },
        { label: '<=', value: '<=' },
        { label: 'Between', value: 'between' },
        { label: 'In', value: 'in' },
        { label: '包含(Like)', value: 'contains' },
        { label: '不包含', value: 'notcontains' }
      ],
      explanation: [
        { label: '包含(Like)', value: 'contains' },
        { label: '不包含', value: 'notcontains' },
        { label: '正则', value: 'regex' },
        { label: '前缀', value: 'startsWith' },
        { label: '后缀', value: 'endsWith' }
      ]
    }

    const defaultOperatorOptions = [
      { label: '=', value: '=' },
      { label: '!=', value: '!=' }
    ]

    const getOperatorOptions = (field) => {
      if (!field) return defaultOperatorOptions
      return operatorOptionsByField[field] || defaultOperatorOptions
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
      
      console.log('颜色选择:', row.color_mark, row)
      // 保存到sessionStorage
      saveColorMarksToStorage()
      // 强制触发响应式更新
      nextTick(() => {
        // 确保颜色变化能够触发行样式更新
        console.log('行样式类名:', getRowClassName({ row }))
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
        console.log('行样式类名:', className, '颜色值:', row.color_mark)
        return className
      }
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
        ElMessage.warning(`日志摘取板最多只能存储 ${maxClipboardEntries} 条日志`)
        return
      }
      
      // 检查是否已存在相同的日志条目
      const exists = clipboardEntries.value.some(entry => entry.id === row.id)
      if (exists) {
        ElMessage.warning('该日志条目已在摘取板中')
        return
      }
      
      // 添加到摘取板
      clipboardEntries.value.push({
        id: row.id,
        timestamp: row.timestamp,
        error_code: row.error_code,
        explanation: row.explanation,
        param1: row.param1,
        param2: row.param2,
        param3: row.param3,
        param4: row.param4,
        log_name: row.log_name
      })
      
      // 更新剪贴板内容
      updateClipboardContent()
      
      // 显示侧边栏
      clipboardVisible.value = true
      
      ElMessage.success(`已添加到日志摘取板 (${clipboardEntries.value.length}/${maxClipboardEntries})`)
    }

    // 更新剪贴板内容
    const updateClipboardContent = () => {
      clipboardContent.value = clipboardEntries.value.map(entry => {
        if (entry.type === 'chart') {
          // 图表类型的数据
          const timestamp = formatTimestamp(entry.timestamp)
          return `[图表] ${timestamp} - ${entry.title} (参数${entry.parameter}, ${entry.dataCount}条数据)`
        } else {
          // 普通日志条目
          const timestamp = formatTimestamp(entry.timestamp)
          const params = [entry.param1, entry.param2, entry.param3, entry.param4].filter(p => p).join(' ')
          return `${timestamp} ${entry.error_code} ${entry.explanation} ${params}`.trim()
        }
      }).join('\n')
    }

    // 清空剪贴板
    const clearClipboard = () => {
      clipboardEntries.value = []
      clipboardContent.value = ''
      ElMessage.success('日志摘取板已清空')
    }


    // 导出剪贴板内容为txt文件
    const exportClipboardToTxt = () => {
      if (!clipboardContent.value) {
        ElMessage.warning('剪贴板为空，无法导出')
        return
      }
      
      const blob = new Blob([clipboardContent.value], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `日志摘取_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      ElMessage.success('日志摘取内容已导出')
    }

    // 保存剪贴板编辑内容
    const saveClipboardContent = () => {
      // 将编辑后的内容保存到sessionStorage
      sessionStorage.setItem('clipboardContent', clipboardContent.value)
      ElMessage.success('编辑内容已保存')
    }

    // 加载保存的剪贴板内容
    const loadClipboardContent = () => {
      try {
        const saved = sessionStorage.getItem('clipboardContent')
        if (saved) {
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
    const handleVisualization = (row) => {
      // 获取当前行的可用参数
      const params = [row.param1, row.param2, row.param3, row.param4].filter(p => p && p.trim())
      
      if (params.length === 0) {
        ElMessage.warning('该日志条目没有可用的参数进行可视化')
        return
      }
      
      // 设置可用参数和当前行
      availableParameters.value = params
      currentVisualizationRow.value = row
      selectedParameter.value = null
      parameterSelectVisible.value = true
    }

    const confirmVisualization = () => {
      if (!selectedParameter.value) {
        ElMessage.warning('请选择一个参数')
        return
      }
      
      parameterSelectVisible.value = false
      generateChart()
    }

    const generateChart = () => {
      if (!currentVisualizationRow.value) return
      
      const row = currentVisualizationRow.value
      const paramIndex = selectedParameter.value - 1
      const paramValue = availableParameters.value[paramIndex]
      
      // 设置图表标题
      chartTitle.value = `${formatTimestamp(row.timestamp)} - 参数${selectedParameter.value}可视化`
      
      // 显示图表详情弹窗
      chartDetailVisible.value = true
      
      // 等待DOM更新后生成图表
      nextTick(() => {
        createChart(row, paramValue)
      })
    }

    const createChart = (row, paramValue) => {
      const chartElement = document.getElementById('visualizationChart')
      if (!chartElement) return
      
      // 销毁之前的图表实例
      if (chartInstance.value) {
        chartInstance.value.dispose()
        chartInstance.value = null
      }
      
      // 获取批量日志的所有数据用于生成图表
      const allLogs = batchLogEntries.value
      const chartData = allLogs.map(log => {
        const timestamp = new Date(log.timestamp).getTime()
        let yValue = 0
        
        // 根据选择的参数获取Y轴值
        switch(selectedParameter.value) {
          case 1:
            yValue = parseFloat(log.param1) || 0
            break
          case 2:
            yValue = parseFloat(log.param2) || 0
            break
          case 3:
            yValue = parseFloat(log.param3) || 0
            break
          case 4:
            yValue = parseFloat(log.param4) || 0
            break
        }
        
        return [timestamp, yValue]
      }).sort((a, b) => a[0] - b[0]) // 按时间排序
      
      if (chartData.length === 0) {
        ElMessage.warning('没有可用的数据生成图表')
        return
      }
      
      // 创建ECharts实例
      chartInstance.value = echarts.init(chartElement)
      
      // 准备X轴数据（时间戳）
      const xAxisData = chartData.map(item => {
        const date = new Date(item[0])
        return formatTimestamp(date)
      })
      
      // 准备Y轴数据（参数值）
      const yAxisData = chartData.map(item => item[1])
      
      // 配置图表选项
      const option = {
        title: {
          text: chartTitle.value,
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        tooltip: {
          trigger: 'axis',
          formatter: function(params) {
            const dataIndex = params[0].dataIndex
            const timestamp = xAxisData[dataIndex]
            const value = yAxisData[dataIndex]
            return `时间: ${timestamp}<br/>参数值: ${value}`
          }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: xAxisData,
          axisLabel: {
            rotate: 45,
            fontSize: 10
          },
          name: '时间',
          nameLocation: 'middle',
          nameGap: 30
        },
        yAxis: {
          type: 'value',
          name: `参数${selectedParameter.value}值`,
          nameLocation: 'middle',
          nameGap: 50
        },
        series: [{
          name: `参数${selectedParameter.value}`,
          type: 'line',
          data: yAxisData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            color: '#409EFF',
            width: 2
          },
          itemStyle: {
            color: '#409EFF'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(64, 158, 255, 0.3)'
              }, {
                offset: 1, color: 'rgba(64, 158, 255, 0.1)'
              }]
            }
          }
        }]
      }
      
      // 设置图表配置
      chartInstance.value.setOption(option)
      
      // 在侧边栏显示图表缩略图
      addChartToSidebar()
    }

    const addChartToSidebar = () => {
      if (!chartInstance.value) return
      
      // 将图表添加到剪贴板
      const chartData = {
        id: `chart_${Date.now()}`,
        type: 'chart',
        title: chartTitle.value,
        timestamp: new Date().toISOString(),
        parameter: selectedParameter.value,
        dataCount: batchLogEntries.value.length
      }
      
      // 添加到剪贴板条目
      clipboardEntries.value.push(chartData)
      
      // 更新剪贴板内容
      updateClipboardContent()
      
      // 显示剪贴板
      clipboardVisible.value = true
      
      ElMessage.success('图表已添加到剪贴板')
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



    // 备注功能
    const handleRemarks = (row) => {
      const remarks = prompt('请输入备注:', row.remarks || '')
      if (remarks !== null) {
        row.remarks = remarks
        // 保存到sessionStorage
        saveRemarksToStorage()
        console.log('保存备注:', row.remarks)
        ElMessage.success('备注已保存')
      }
    }

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
        const beforeTime = new Date(baseTimestamp.getTime() - beforeMinutes.value * 60 * 1000)
        const afterTime = new Date(baseTimestamp.getTime() + afterMinutes.value * 60 * 1000)
        
        console.log('上下文分析参数:', {
          baseRow: contextAnalysisRow.value,
          beforeMinutes: beforeMinutes.value,
          afterMinutes: afterMinutes.value,
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
        
        ElMessage.success(`已筛选出 ${beforeMinutes.value} 分钟前到 ${afterMinutes.value} 分钟后的日志`)
        
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
      await loadSelectedLogs()
      await loadTemplates()
      // 默认选择全部时间范围（最早至最晚）
      if (timeRangeLimit.value) {
        timeRange.value = [
          formatTimestamp(timeRangeLimit.value[0]),
          formatTimestamp(timeRangeLimit.value[1])
        ]
      }
      // 初始化加载数据
      await loadBatchLogEntries(1, true)
      
      // 加载保存的剪贴板内容
      loadClipboardContent()
    })

    // 组件销毁时清理ECharts实例
    onBeforeUnmount(() => {
      if (chartInstance.value) {
        chartInstance.value.dispose()
        chartInstance.value = null
      }
    })

    return {
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
      useVirtualScroll,
      virtualTableRef,
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
      showSurgeryStatistics,
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
      saveColorMarksToStorage,
      loadColorMarksFromStorage,
      handleContextAnalysis,
      handleLogCapture,
      handleRemarks,
      saveRemarksToStorage,
      loadRemarksFromStorage,
      // 上下文分析相关
      contextAnalysisVisible,
      contextAnalysisRow,
      beforeMinutes,
      afterMinutes,
      executeContextAnalysis,
      // 日志摘取相关
      clipboardVisible,
      clipboardEntries,
      clipboardDetailVisible,
      clipboardContent,
      updateClipboardContent,
      clearClipboard,
      exportClipboardToTxt,
      saveClipboardContent,
      loadClipboardContent,
      showClipboard,
      // 可视化相关
      parameterSelectVisible,
      selectedParameter,
      availableParameters,
      chartDetailVisible,
      chartTitle,
      chartContainer,
      chartInstance,
      handleVisualization,
      confirmVisualization,
      exportChartAsImage
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
  margin: 0 20px 10px 20px;
  padding: 10px 12px;
  background-color: white;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.search-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
  border: 4px dashed #d9d9d9;
  padding: 0 10px;
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
  overflow: hidden;
  margin: 0 10px 5px 10px;
  background-color: white;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.table-container {
  flex: 1;
  overflow: hidden;
  padding: 0 20px 20px 20px;
}

/* 使用 Element Plus 默认表格样式 */

/* 颜色标记行样式 */
.row-marked-red {
  background-color: rgba(255, 0, 0, 0.2) !important;
}

.row-marked-yellow {
  background-color: rgba(255, 255, 0, 0.2) !important;
}

.row-marked-blue {
  background-color: rgba(0, 0, 255, 0.2) !important;
}

.row-marked-green {
  background-color: rgba(0, 255, 0, 0.2) !important;
}

/* 颜色选择器样式 */
.color-option {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.color-radio {
  width: 16px !important;
  height: 16px !important;
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
  align-items: center;
  gap: 8px;
}

/* 让释义列的 tooltip 在表格外也能显示 */
.explanation-tooltip {
  max-width: 60vw;
  white-space: normal;
  word-break: break-word;
  z-index: 3000;
}

.el-popper.explanation-tooltip {
  overflow: visible;
}

.explanation-ellipsis {
  display: inline-block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: 12px 20px 0 20px;
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
  padding: 4px 0;
  line-height: 1.4;
}

.file-info-cell .timestamp {
  font-size: 16px;
  color:#303133;
  font-weight: 500;
  margin-bottom: 2px;
}

.file-info-cell .file-name {
  font-size: 14px;
  color:#909399; 
  font-weight: 400;
  word-break: break-all;
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
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-weight: 500;
  color: #303133;
  word-break: break-all;
}

.timestamp {
  color: #909399;
}

.parameters-cell {
  color: #606266;
  word-break: break-all;
  font-size: 16px;
  line-height: 1.4;
  padding: 2px 0;
}

.parameters-cell .param-item {
  margin-right: 12px;
  display: inline-block;
}

.parameters-cell .param-item:last-child {
  margin-right: 0;
}

.parameters-cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 40px;
}

.param-content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.param-actions {
  flex-shrink: 0;
  margin-left: 8px;
}

.visualization-btn {
  font-size: 12px;
  padding: 4px 8px;
  height: 24px;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.chart-actions {
  display: flex;
  gap: 8px;
}

.chart-container {
  background: #fafafa;
  border-radius: 4px;
  padding: 20px;
  text-align: center;
}

.operations-cell {
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  min-height: 32px;
}

.operations-cell .operation-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.operations-cell .operation-tag:hover {
  opacity: 0.8;
  transform: scale(1.05);
}

/* 颜色指示器样式 - 默认小圆点 */
.color-indicator {
  width: 12px;
  height: 12px;
  border: 2px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;
  margin: 0 auto;
  box-shadow: 0 0 0 1px white;
}

.color-indicator:hover {
  border-color: #409eff;
  transform: scale(1.2);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2), 0 0 0 1px white;
}

.color-indicator.has-color {
  border-color: transparent;
  box-shadow: 0 0 0 1px white;
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

.color-option {
  width: 24px;
  height: 24px;
  border: 2px solid #ddd;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
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
  height: 80px;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: #fafafa;
  padding: 12px;
}

.clipboard-thumbnail:hover {
  border-color: #409eff;
  background-color: #f0f9ff;
}

.clipboard-icon {
  color: #909399;
  margin-right: 12px;
}

.clipboard-text {
  text-align: left;
  flex: 1;
}

.clipboard-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.clipboard-count {
  font-size: 12px;
  color: #909399;
}

.delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  min-width: 20px;
  padding: 0;
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