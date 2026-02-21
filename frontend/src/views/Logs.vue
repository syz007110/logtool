<template>
  <div class="logs-container">
    <!-- 统一卡片：包含搜索栏和列表 -->
    <el-card class="main-card">
      <!-- 搜索和操作栏 -->
      <div class="action-bar">
        <div class="action-section">
            <!-- 日志上传按钮 - 主要按钮 -->
          <el-button 
            v-if="$store.getters['auth/hasPermission']('log:upload')"
            type="primary"
            :icon="Upload"
            @click="showNormalUpload"
          >
                {{ $t('logs.upload') }}
              </el-button>

            <!-- 重置按钮 - 次要按钮 -->
          <el-button 
            type="default"
            :icon="RefreshLeft"
            @click="resetAllFilters"
          >
                {{ $t('shared.reset') }}
              </el-button>

            <!-- 刷新按钮 - 次要按钮 -->
          <el-button 
            type="default"
            :icon="Refresh"
            @click="loadDeviceGroups"
          >
                {{ $t('shared.refresh') }}
              </el-button>
            </div>
          </div>
      
      <!-- 表格容器 - 固定表头 -->
      <div class="table-container">
      <el-table
        :data="deviceGroups"
        :loading="loading"
          :height="tableHeight"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="device_id" :label="$t('logs.deviceId')" min-width="160">
          <template #header>
            <div class="col-header">
              <span>{{ $t('logs.deviceId') }}</span>
              <el-popover
                placement="bottom-start"
                width="260"
                :visible="showDeviceFilterPanel"
                @update:visible="showDeviceFilterPanel = $event"
                popper-class="custom-filter-panel"
              >
                <div class="filter-panel">
                  <div class="filter-title">{{ $t('logs.deviceIdFilter') }}</div>
                  <el-input
                    v-model="deviceFilterValue"
                    :placeholder="$t('logs.deviceIdFilterPlaceholder')"
                    clearable
                    @keyup.enter="applyDeviceFilter"
                  >
                    <template #prefix>
                      <el-icon><Search /></el-icon>
                    </template>
                  </el-input>
                  <div class="filter-actions">
                    <el-button type="primary" size="small" @click="applyDeviceFilter">{{ $t('shared.search') }}</el-button>
                    <el-button type="default" size="small" @click="resetDeviceFilter">{{ $t('shared.reset') }}</el-button>
                  </div>
                </div>
                <template #reference>
                  <el-icon :class="['filter-trigger', { active: !!deviceFilterValue }]"><Filter /></el-icon>
                </template>
              </el-popover>
            </div>
          </template>
          <template #default="{ row }">
            <div class="min-w-0">
              <el-button 
                text
                @click="showDeviceDetail(row)"
                :title="row.device_id"
              >
                <span class="one-line-ellipsis" style="display:inline-block; max-width:100%;">{{ row.device_id }}</span>
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="hospital_name" :label="$t('logs.hospitalName')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.hospital_name" class="one-line-ellipsis" :title="maskHospitalName(row.hospital_name, hasDeviceReadPermission)" style="display:inline-block; max-width:100%">{{ maskHospitalName(row.hospital_name, hasDeviceReadPermission) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="log_count" :label="$t('logs.logCount')" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.log_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="latest_update_time" :label="$t('logs.updateTime')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.latest_update_time) }}
          </template>
        </el-table-column>
                 <el-table-column :label="$t('shared.operation')" width="120" fixed="right" align="left">
           <template #default="{ row }">
             <div class="operation-buttons">
               <el-button text size="small" @click="showDeviceDetail(row)">
                 {{ $t('logs.detail') }}
               </el-button>
             </div>
           </template>
         </el-table-column>
      </el-table>
      </div>
      
      <!-- 设备列表分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="deviceTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleDeviceSizeChange"
          @current-change="handleDeviceCurrentChange"
        />
      </div>
    </el-card>

    <!-- 设备详细日志列表抽屉 -->
    <el-drawer
      v-model="showDeviceDetailDrawer"
      direction="rtl"
      size="1200px"
      :with-header="false"
      :before-close="handleDrawerClose"
    >
      <div class="device-detail-content">
        <!-- 详细日志列表 - 使用卡片包裹 -->
        <el-card class="detail-logs-card">
          <!-- 卡片头部：关闭按钮和设备信息 -->
          <div class="detail-logs-card-header">
            <div class="device-header">
              <div class="device-info">
                <h3 class="min-w-0"><span class="one-line-ellipsis" :title="selectedDevice?.device_id">{{ selectedDevice?.device_id }} {{ $t('dataReplay.detailDrawerTitle') }}</span>（{{ $t('logs.logCount') }}：{{ selectedDevice?.log_count || 0 }}）</h3>
                <p v-if="selectedDevice?.hospital_name" class="min-w-0"><span class="one-line-ellipsis" :title="maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission)">{{ $t('logs.hospitalName') }}：{{ maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission) }}</span></p>
              </div>
              <div class="header-controls">
                <!-- 第一列：日志上传按钮 -->
                <div class="device-actions">
                  <el-button type="primary" size="small" :icon="Upload" @click="uploadLogForDevice(selectedDevice)">
                    {{ $t('logs.upload') }}
                  </el-button>
                </div>
                
                <!-- 第二列：筛选控件 -->
                <div class="filter-controls">
                  <!-- 重置按钮 - 次要按钮 -->
                  <div class="reset-section">
                    <el-button type="default" size="small" :icon="RefreshLeft" @click="resetDetailFilters">
                      {{ $t('shared.reset') }}
                    </el-button>
                  </div>

                  <!-- 刷新按钮 - 次要按钮 -->
                  <div class="refresh-section">
                    <el-button type="default" size="small" :icon="Refresh" @click="loadDetailLogs">
                      {{ $t('shared.refresh') }}
                    </el-button>
                  </div>
                </div>
                
                <!-- 关闭按钮 -->
                <el-button 
                  text 
                  size="small" 
                  :icon="Close" 
                  @click="handleDrawerClose"
                  class="close-drawer-btn"
                  :title="$t('shared.close')"
                />
              </div>
            </div>
          </div>
          <!-- 筛选和操作栏 -->
          <div class="detail-logs-header">
            <div class="detail-filters">
              <el-tabs
                v-model="detailStatusFilter"
                class="detail-status-tabs"
                @tab-change="handleStatusFilterChange"
              >
                <el-tab-pane
                  v-for="tab in detailStatusTabs"
                  :key="tab.value"
                  :label="tab.label"
                  :name="tab.value"
                />
              </el-tabs>
              <div class="time-filter-bar">
                <div class="quick-range-group">
              <el-radio-group
                v-model="detailQuickRange"
                size="small"
                @change="handleQuickRangeChange"
              >
                <el-radio-button
                  v-for="option in detailQuickRangeOptions"
                  :key="option.value"
                  :label="option.value"
                >
                  {{ option.label }}
                </el-radio-button>
              </el-radio-group>
                </div>
              <div class="custom-range-selects">
                <el-select
                  v-model="detailSelectedYear"
                  size="small"
                  class="time-select"
                  @change="handleYearChange"
                >
                  <el-option
                    v-for="option in detailYearOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="detailSelectedMonth"
                  size="small"
                  class="time-select"
                  @change="handleMonthChange"
                >
                  <el-option
                    v-for="option in detailMonthOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-select
                  v-model="detailSelectedDay"
                  size="small"
                  class="time-select"
                  @change="handleDayChange"
                >
                  <el-option
                    v-for="option in detailDayOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                </div>
              </div>
            </div>
            <div class="detail-header">
              <h4 class="min-w-0 one-line-ellipsis" :title="$t('logs.title')">{{ $t('logs.title') }}</h4>
              <div class="detail-actions">
                <!-- 批量操作组 -->
                <div class="batch-section" v-if="selectedDetailLogs && selectedDetailLogs.length > 0">
                <div class="batch-actions">
                  <el-button 
                    type="primary"
                    size="small" 
                    @click="handleBatchAnalyze"
                    :disabled="!canBatchView || !isSameDevice || selectedDetailLogs.length > 20"
                    :title="getBatchViewTitle()"
                  >
                    <i class="fas fa-eye"></i>
                      {{ $t('logs.batchView') }} ({{ selectedDetailLogs.length }})
                  </el-button>
                  <el-button 
                    type="default"
                    size="small" 
                    @click="handleBatchDownload"
                    :disabled="!canBatchDownload"
                    :title="incompleteLogsMessage"
                  >
                    <i class="fas fa-download"></i>
                      {{ $t('logs.batchDownload') }} ({{ selectedDetailLogs.length }})
                  </el-button>
                  <el-button 
                    type="default"
                    size="small" 
                    @click="handleBatchDelete"
                    :disabled="!canBatchDelete"
                    :title="incompleteLogsMessage"
                  >
                    <i class="fas fa-trash"></i>
                      {{ $t('logs.batchDelete') }} ({{ selectedDetailLogs.length }})
                  </el-button>
                  <el-button 
                    type="default"
                    size="small" 
                    @click="handleBatchReparse"
                    :disabled="selectedDetailLogs.length === 0 || !$store.getters['auth/hasPermission']('log:reparse') || !canBatchReparse || selectedDetailLogs.length > 20"
                    :title="getBatchReparseTitle()"
                    v-if="$store.getters['auth/hasPermission']('log:reparse')"
                  >
                    <i class="fas fa-sync-alt"></i>
                      {{ $t('logs.batchReparse') }} ({{ selectedDetailLogs.length }})
                  </el-button>
                  <el-tooltip 
                    :content="$t('logs.deleteOwnOnlyTip')" 
                    placement="top" 
                    v-if="!$store.getters['auth/hasPermission']('log:delete') && $store.getters['auth/hasPermission']('log:delete_own')"
                  >
                    <el-icon class="info-icon"><InfoFilled /></el-icon>
                  </el-tooltip>
                  <el-button 
                    type="default"
                    size="small" 
                      @click="clearDetailSelection"
                  >
                    <i class="fas fa-times"></i>
                    {{ $t('logs.clearSelection') }}
                  </el-button>
                </div>
              </div>
            </div>
          </div>
          </div>
        
          <!-- 表格容器 - 可滚动 -->
          <div class="detail-table-container">
            <el-table
              :data="detailLogs"
              :loading="detailLoading"
              style="width: 100%"
              v-loading="detailLoading"
              @selection-change="handleDetailSelectionChange"
              row-key="id"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="original_name" :label="$t('logs.logFilename')" min-width="240">
                <template #header>
                  <div class="col-header">
                        <span>{{ $t('logs.logFilename') }}</span>
                    <el-popover
                      placement="bottom-start"
                      width="260"
                          :visible="showDetailNameFilterPanel"
                          @update:visible="showDetailNameFilterPanel = $event"
                      popper-class="custom-filter-panel"
                    >
                      <div class="filter-panel">
                        <div class="filter-title">{{ $t('logs.timePrefix') }}</div>
                        <el-input
                              v-model="detailNameTimePrefix"
                          :placeholder="$t('logs.timePrefixPlaceholder')"
                          clearable
                              @keyup.enter="applyDetailNameFilter"
                        >
                          <template #prefix>
                            <el-icon><Search /></el-icon>
                          </template>
                        </el-input>
                        <div class="filter-actions">
                              <el-button type="primary" size="small" @click="applyDetailNameFilter">{{ $t('shared.search') }}</el-button>
                              <el-button type="default" size="small" @click="resetDetailNameFilter">{{ $t('shared.reset') }}</el-button>
                        </div>
                      </div>
                      <template #reference>
                            <el-icon :class="['filter-trigger', { active: !!detailNameTimePrefix }]"><Filter /></el-icon>
                      </template>
                    </el-popover>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="uploader_id" :label="$t('logs.uploaderId')" width="150" />
              <el-table-column prop="upload_time" :label="$t('logs.uploadTime')" width="260">
                <template #default="{ row }">
                  {{ formatDate(row.upload_time) }}
                </template>
              </el-table-column>
              
              <el-table-column :label="$t('shared.status')" width="160" align="center">
                <template #default="{ row }">
                  <el-tag :type="getRowStatusType(row)" size="small">
                    {{ getRowStatusText(row) }}
                  </el-tag>
                </template>
              </el-table-column>
              
              <el-table-column :label="$t('shared.operation')" width="200" align="left">
                <template #default="{ row }">
                  <div class="operation-buttons">
                    <el-button 
                      text
                      size="small"
                      @click="goToLogAnalysis(row)"
                      :disabled="!canView(row)"
                    >
                      {{ $t('logs.view') }}
                    </el-button>
                    <el-dropdown 
                      trigger="click" 
                      placement="bottom-end"
                      @command="handleMoreAction"
                    >
                      <el-button text size="small">
                        <i class="fas fa-ellipsis-h"></i>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item 
                            :command="{ action: 'download', row }"
                            :disabled="!canDownload(row)"
                          >
                            {{ $t('logs.download') }}
                          </el-dropdown-item>
                          <el-dropdown-item 
                            :command="{ action: 'delete', row }"
                            v-if="canDeleteLog(row)"
                            :disabled="!(row.status === 'parsed' || row.status === 'decrypt_failed' || row.status === 'parse_failed' || row.status === 'file_error' || row.status === 'failed' || row.status === 'queue_failed' || row.status === 'upload_failed' || row.status === 'delete_failed')"
                            class="dropdown-item-danger"
                          >
                            {{ $t('shared.delete') }}
                          </el-dropdown-item>
                          <el-dropdown-item 
                            :command="{ action: 'reparse', row }"
                            v-if="canReparse"
                            :disabled="!canReparseLog(row) || row.parsing"
                          >
                            {{ $t('logs.reparse') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
          
          <!-- 分页 -->
          <div class="detail-pagination-wrapper">
            <el-pagination
                  :current-page="detailCurrentPage"
                  :page-size="detailPageSize"
              :page-sizes="[10, 20, 50, 100]"
                  :total="detailTotal"
              layout="total, sizes, prev, pager, next, jumper"
                  @size-change="handleDetailSizeChange"
                  @current-change="handleDetailCurrentChange"
            />
          </div>
        </el-card>
      </div>
    </el-drawer>

    <!-- 手术数据抽屉 -->
    <el-drawer
      v-model="showSurgeryDrawer"
      title="手术数据"
      direction="rtl"
      size="1200px"
    >
      <div v-if="selectedDevice" class="device-header" style="margin-bottom:8px;">
        <div class="device-info">
          <h3 v-if="selectedDevice.hospital_name">{{ $t('logs.hospital') }}：{{ maskHospitalName(selectedDevice.hospital_name, hasDeviceReadPermission) }}</h3>
          <p>{{ $t('logs.deviceId') }}：{{ selectedDevice.device_id }}</p>
        </div>
      </div>
      <el-table :data="surgeryList" :loading="surgeryLoading" style="width:100%">
        <el-table-column prop="surgery_id" :label="$t('logs.surgeryId')" width="220" />
        <el-table-column prop="structured_data.surgery_stats.procedure" :label="$t('logs.surgeryProcedure')" min-width="200">
          <template #default="{ row }">
            {{ row.structured_data?.surgery_stats?.procedure || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="start_time" :label="$t('logs.surgeryStartTime')" width="180">
          <template #default="{ row }">{{ formatDate(row.start_time) }}</template>
        </el-table-column>
        <el-table-column prop="end_time" :label="$t('logs.surgeryEndTime')" width="180">
          <template #default="{ row }">{{ formatDate(row.end_time) }}</template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="260" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="viewLogsBySurgery(row)">{{ $t('logs.viewLogs') }}</el-button>
            <el-button text size="small" @click="visualizeSurgery(row)">{{ $t('logs.visualize') }}</el-button>
            <el-popconfirm v-if="$store.getters['auth/hasPermission']('surgery:delete')" :title="$t('logs.messages.confirmDeleteSurgery')" @confirm="deleteSurgery(row)">
              <template #reference>
                <el-button text size="small" class="btn-danger-text">{{ $t('shared.delete') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrapper">
        <el-pagination
          :current-page="surgeryPage"
          :page-size="surgeryPageSize"
          :page-sizes="[10,20,50]"
          :total="surgeryTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="(s)=>{surgeryPageSize=s; surgeryPage=1; loadSurgeries()}"
          @current-change="(p)=>{surgeryPage=p; loadSurgeries()}"
        />
      </div>
    </el-drawer>

    <!-- 上传日志弹窗 -->
    <el-dialog v-model="showUploadDialog" :title="$t('logs.uploadDialog.title')" width="700px" append-to-body>

      <el-upload
        ref="uploadRef"
        :action="uploadUrl"
        :headers="uploadHeaders"
        :before-upload="beforeUpload"
        :on-success="onUploadSuccess"
        :on-error="onUploadError"
        :on-exceed="onExceed"
        :on-change="onFileChange"
        :on-remove="onFileRemove"
        :on-progress="onUploadProgress"
        :auto-upload="false"
        :show-file-list="false"
        :multiple="true"
        :limit="50"
        accept=".medbot"
        name="file"
        :disabled="uploading"
      >
        <el-button type="primary" :disabled="uploading">
          <i class="fas fa-upload"></i>
          {{ $t('logs.chooseFiles') }}
        </el-button>
        <template #tip>
          <div class="el-upload__tip">
            <div v-if="!uploading">
              {{ $t('logs.uploadTip') }}
            </div>
            <div v-else class="parsing-tip">
              <el-icon class="is-loading"><Refresh /></el-icon>
              {{ $t('logs.uploadingTip') }}
            </div>
          </div>
        </template>
      </el-upload>

      <!-- 自定义文件列表 -->
      <div v-if="uploadFileList && uploadFileList.length > 0" class="custom-file-list">
        <div class="file-list-header">
          <span>{{ $t('logs.selectedFiles') }} ({{ uploadFileList.length }})</span>
            <el-button type="default" size="small" @click="clearUpload" :disabled="uploading">
              <i class="fas fa-times"></i>
            {{ $t('logs.clear') }}
            </el-button>
        </div>
        <div class="file-items">
          <div 
            v-for="(file, index) in uploadFileList" 
            :key="index" 
            class="file-item"
          >
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ file.name || file.originalname }}</span>
            <span class="file-size">{{ file.sizeText }}</span>
            <el-button 
              type="danger"
              plain
              size="small"
              @click="removeFile(index)"
              :disabled="uploading"
              :aria-label="$t('logs.removeFile')"
              :title="$t('logs.removeFile')"
            >
              <i class="fas fa-trash"></i>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 密钥输入区域 -->
      <div class="key-input-section">
        <div class="key-input-row">
          <el-input
            v-model="decryptKey"
            :placeholder="$t('logs.decryptKeyPlaceholder')"
            style="width: 300px;"
            clearable
            @blur="validateKeyFormat"
          >
            <template #prefix>
              <el-icon><Key /></el-icon>
            </template>
          </el-input>
          
          <el-button 
            type="default"
            size="small" 
            @click="autoFillDeviceId"
            :disabled="!decryptKey.trim()"
          >
            <i class="fas fa-magic"></i>
            {{ $t('logs.autoFillDeviceId') }}
          </el-button>
          
          <span class="key-separator">{{ $t('logs.or') }}</span>
          
          <el-upload
            ref="keyUploadRef"
            :auto-upload="false"
            :show-file-list="false"
            accept=".txt"
            :before-upload="beforeKeyUpload"
            :on-change="onKeyFileChange"
          >
            <el-button type="default" size="small">
              <i class="fas fa-upload"></i>
              {{ $t('logs.uploadKeyFile') }}
            </el-button>
          </el-upload>
        </div>
        
        <div v-if="keyFileName" class="key-file-info">
          <el-tag type="success" size="small">
            <el-icon><Document /></el-icon>
            {{ keyFileName }}
          </el-tag>
        </div>
        
        <div v-if="keyError" class="key-error">
          <el-tag type="danger" size="small">
            {{ keyError }}
          </el-tag>
        </div>
      </div>

      <!-- 设备编号输入区域 -->
      <div class="device-input-section">
        <div class="device-input-row">
          <el-input
            v-model="deviceId"
            :placeholder="$t('logs.deviceId') + '（' + $t('logs.deviceIdPlaceholder') + '）'"
            style="width: 300px;"
            clearable
            @blur="validateDeviceIdFormat"
          >
            <template #prefix>
              <el-icon><Monitor /></el-icon>
            </template>
          </el-input>
          
          <el-button 
            type="default"
            size="small" 
            @click="autoFillKey"
            :disabled="!deviceId.trim()"
          >
            <i class="fas fa-magic"></i>
            {{ $t('logs.autoFillKey') }}
          </el-button>
        </div>
        
        <div v-if="deviceIdError" class="device-error">
          <el-tag type="danger" size="small">
            {{ deviceIdError }}
          </el-tag>
        </div>
      </div>

      <template #footer>
        <div class="upload-actions">
          <el-button type="default" @click="showUploadDialog = false" :disabled="uploading">
            <i class="fas fa-times"></i>
            {{ $t('shared.cancel') }}
          </el-button>
          <el-button 
            type="primary" 
            @click="submitUpload" 
            :loading="uploading"
            :disabled="uploading || !canSubmitUpload || uploadFileList.length === 0"
          >
            <i class="fas fa-upload" v-if="!uploading"></i>
            {{ uploading ? $t('logs.uploading') : $t('logs.uploadAndParse') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 日志查看弹窗 -->
    <el-dialog v-model="showEntriesDialog" :title="$t('logs.viewLogs')" width="900px">
      <el-table :data="logEntries" style="width: 100%">
        <el-table-column prop="timestamp" :label="$t('logs.timestamp')" width="180" />
        <el-table-column prop="error_code" :label="$t('errorCodes.code')" width="100" />
        <el-table-column prop="param1" label="Param1" width="100" />
        <el-table-column prop="param2" label="Param2" width="100" />
        <el-table-column prop="param3" label="Param3" width="100" />
        <el-table-column prop="param4" label="Param4" width="100" />
        <el-table-column prop="explanation" :label="$t('logs.explanation')" />
      </el-table>
    </el-dialog>

  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Monitor, Key, Document, Warning, InfoFilled, Filter, Upload, Refresh, RefreshLeft, Close } from '@element-plus/icons-vue'
import websocketClient from '@/services/websocketClient'
import api from '@/api'
import { visualizeSurgery as visualizeSurgeryData } from '@/utils/visualizationHelper'
import { useI18n } from 'vue-i18n'
import { maskHospitalName } from '@/utils/maskSensitiveData'
import { getTableHeight } from '@/utils/tableHeight'

export default {
  name: 'Logs',
  components: {
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()
    
    // 响应式数据
    const loading = ref(false)
    const uploading = ref(false) // 仅表示"文件上传阶段"
    const showUploadDialog = ref(false)
    const overallProgress = ref(0) // 总体进度
    const processingStatus = ref('') // 处理状态
    const uploadRef = ref(null)
    const keyUploadRef = ref(null)
    const currentPage = ref(1)
    const pageSize = ref(20)
    const showNameFilterPanel = ref(false)
    const showDeviceFilterPanel = ref(false)
    const nameTimePrefix = ref('')
    const deviceFilterValue = ref('')
    
    // 设备分组相关数据
    const deviceGroups = ref([])
    const deviceTotal = ref(0)
    const showDeviceDetailDrawer = ref(false)
    const selectedDevice = ref(null)
    const detailLoading = ref(false)
    const lastDetailLogsLoadAt = ref(0)
    let detailReloadTimer = null
    const detailCurrentPage = ref(1)
    const detailPageSize = ref(20)
    const detailTypeFilter = ref('all')
    const detailQuickRange = ref('all')
    const detailSelectedYear = ref('all')
    const detailSelectedMonth = ref('all')
    const detailSelectedDay = ref('all')
    const detailStatusFilter = ref('all')
    const detailAvailableYears = ref([])
    const detailAvailableMonths = ref({})
    const detailAvailableDays = ref({})
    const currentYear = new Date().getFullYear()

    const parseTimestampFromFilename = (log) => {
      const rawName = log?.original_name || log?.filename || log?.name
      if (!rawName || typeof rawName !== 'string') return null
      const filename = rawName.split('/').pop() || rawName
      const match = filename.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?/)
      if (!match) return null
      const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match
      const year = Number(yearStr)
      const month = Number(monthStr)
      const day = Number(dayStr)
      const hour = Number(hourStr)
      const minute = minuteStr != null ? Number(minuteStr) : 0
      if ([year, month, day, hour].some(num => Number.isNaN(num))) return null
      if (minuteStr != null && Number.isNaN(minute)) return null
      // 文件名中的时间通常是“本地时间字面值”（例如设备/现场记录时间），
      // 这里必须按本地时区构造 Date；否则用 Date.UTC 会导致在本地显示时额外 +8（或其它偏移）。
      const date = new Date(year, month - 1, day, hour, minute || 0, 0, 0)
      if (Number.isNaN(date.getTime())) return null
      return {
        year,
        month,
        day,
        hour,
        minute,
        timestamp: date.getTime()
      }
    }

    const extractLogDateParts = (log) => {
      const filenameParts = parseTimestampFromFilename(log)
      if (filenameParts) {
        return filenameParts
      }
      const raw = log?.upload_time || log?.uploadTime || log?.created_at
      if (!raw) return null
      const date = new Date(raw)
      if (Number.isNaN(date.getTime())) return null
      return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        timestamp: date.getTime()
      }
    }
    const selectedDetailLogs = ref([])
    const showDetailNameFilterPanel = ref(false)
    const detailNameTimePrefix = ref('')
    const showEntriesDialog = ref(false)
    const logEntries = ref([])
    const dateShortcuts = ref([
      {
        text: t('logs.timeRange.thisYear'),
        value: () => {
          const start = new Date(new Date().getFullYear(), 0, 1, 0, 0, 0)
          const end = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59)
          return [start, end]
        }
      },
      {
        text: t('logs.timeRange.thisMonth'),
        value: () => {
          const now = new Date()
          const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
          return [start, end]
        }
      },
      {
        text: t('logs.timeRange.today'),
        value: () => {
          const now = new Date()
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
          const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
          return [start, end]
        }
      }
    ])
    const decryptKey = ref('') // 密钥输入
    const keyFileName = ref('') // 密钥文件名
    const deviceId = ref('') // 设备编号
    const filterDeviceId = ref('') // 筛选设备编号
    const uploadFileList = ref([]) // 手动跟踪上传文件列表
    const keyError = ref('') // 密钥格式错误提示
    const deviceIdError = ref('') // 设备编号格式错误提示
    const uploadDeviceId = ref('') // 上传时的设备编号
    const isDeviceUpload = ref(false) // 标记是否为设备操作上传模式
    const currentUploadDeviceId = ref('') // 当前上传的设备编号，用于自动展开
    

    

    
    // 计算属性
    const logs = computed(() => Array.isArray(store.getters['logs/logsList']) ? store.getters['logs/logsList'] : [])
    const total = computed(() => store.getters['logs/totalCount'])

    const detailQuickRangeOptions = computed(() => ([
      { value: 'all', label: t('logs.surgeriesFilters.quickAll') },
      { value: '1d', label: t('logs.surgeriesFilters.quick1d') },
      { value: '7d', label: t('logs.surgeriesFilters.quick7d') },
      { value: '30d', label: t('logs.surgeriesFilters.quick30d') },
      { value: 'custom', label: t('logs.surgeriesFilters.quickCustom') }
    ]))
    
    // 状态筛选标签页
    const detailStatusTabs = computed(() => ([
      { value: 'all', label: t('logs.statusFilter.all') || '全部' },
      { value: 'completed', label: t('logs.statusFilter.completed') || '完成' },
      { value: 'incomplete', label: t('logs.statusFilter.incomplete') || '未完成' }
    ]))
    
    // detailLogs 和 detailTotal 改为 ref，由后端返回
    const detailLogs = ref([])
    const detailTotal = ref(0)

    const detailYearOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.yearSuffix') || ''
      const yearsSource = Array.isArray(detailAvailableYears.value) ? detailAvailableYears.value : []
      const normalizedYears = yearsSource
        .map(year => {
          const num = Number(year)
          if (Number.isNaN(num)) return null
          return String(num).padStart(4, '0')
        })
        .filter(Boolean)
      const years = normalizedYears.length ? normalizedYears.sort((a, b) => Number(b) - Number(a)) : [String(currentYear)]
      const options = [
        { value: 'all', label: t('logs.surgeriesFilters.yearAll') },
        ...years.map(year => ({
          value: year,
          label: `${year}${suffix}`
        }))
      ]
      return options
    })

    const detailMonthOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.monthSuffix') || ''
      const monthsSet = new Set()
      const monthsMap = detailAvailableMonths.value || {}

      if (detailSelectedYear.value !== 'all') {
        const months = monthsMap[detailSelectedYear.value] || []
        months.forEach(month => {
          const num = Number(month)
          if (!Number.isNaN(num)) {
            monthsSet.add(String(num).padStart(2, '0'))
          }
        })
      } else {
        Object.values(monthsMap).forEach(list => {
          (list || []).forEach(month => {
            const num = Number(month)
            if (!Number.isNaN(num)) {
              monthsSet.add(String(num).padStart(2, '0'))
            }
          })
        })
      }

      if (!monthsSet.size) {
        for (let m = 1; m <= 12; m += 1) {
          monthsSet.add(String(m).padStart(2, '0'))
        }
      }

      const sorted = Array.from(monthsSet).sort((a, b) => a.localeCompare(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.monthAll') },
        ...sorted.map(month => ({
          value: month,
          label: `${month}${suffix}`
        }))
      ]
    })

    const detailDayOptions = computed(() => {
      const suffix = t('logs.surgeriesFilters.daySuffix') || ''
      const daysSet = new Set()
      const daysMap = detailAvailableDays.value || {}

      if (detailSelectedYear.value !== 'all' && detailSelectedMonth.value !== 'all') {
        const key = `${detailSelectedYear.value}-${detailSelectedMonth.value}`
        const days = daysMap[key] || []
        days.forEach(day => {
          const num = Number(day)
          if (!Number.isNaN(num)) {
            daysSet.add(String(num).padStart(2, '0'))
          }
        })
      } else if (detailSelectedYear.value !== 'all') {
        Object.entries(daysMap).forEach(([key, list]) => {
          if (key.startsWith(`${detailSelectedYear.value}-`)) {
            (list || []).forEach(day => {
              const num = Number(day)
              if (!Number.isNaN(num)) {
                daysSet.add(String(num).padStart(2, '0'))
              }
            })
          }
        })
      } else {
        Object.values(daysMap).forEach(list => {
          (list || []).forEach(day => {
            const num = Number(day)
            if (!Number.isNaN(num)) {
              daysSet.add(String(num).padStart(2, '0'))
            }
          })
        })
      }

      if (!daysSet.size) {
        for (let d = 1; d <= 31; d += 1) {
          daysSet.add(String(d).padStart(2, '0'))
        }
      }

      const sorted = Array.from(daysSet).sort((a, b) => a.localeCompare(b))
      return [
        { value: 'all', label: t('logs.surgeriesFilters.dayAll') },
        ...sorted.map(day => ({
          value: day,
          label: `${day}${suffix}`
        }))
      ]
    })
    
    // WebSocket 状态相关计算属性
    const websocketStatusTitle = computed(() => {
      const status = websocketClient.getConnectionStatus()
      if (status === 'connected') {
        return t('logs.websocket.enabled')
      } else if (status === 'connecting') {
        return t('logs.websocket.connecting')
      } else {
        return t('logs.websocket.disconnected')
      }
    })
    
    const websocketStatusType = computed(() => {
      const status = websocketClient.getConnectionStatus()
      if (status === 'connected') {
        return 'success'
      } else if (status === 'connecting') {
        return 'warning'
      } else {
        return 'error'
      }
    })
    
    const websocketStatusDescription = computed(() => {
      const status = websocketClient.getConnectionStatus()
      if (status === 'connected') {
        const deviceId = selectedDevice.value?.device_id
        if (deviceId && websocketClient.getSubscribedDevices().includes(deviceId)) {
          return `${t('logs.deviceSubscription.success')} ${deviceId}，${t('logs.websocket.connected')}`
        } else {
          return t('logs.websocket.connected')
        }
      } else if (status === 'connecting') {
        return t('logs.websocket.connectingServer')
      } else {
        return t('logs.websocket.connectionFailed')
      }
    })
    const uploadUrl = computed(() => '/api/logs/upload')
    const uploadHeaders = computed(() => ({
      Authorization: `Bearer ${store.state.auth.token}`,
      'X-Decrypt-Key': decryptKey.value, // 添加密钥到请求头
      'X-Device-ID': uploadDeviceId.value || deviceId.value // 添加设备编号到请求头
    }))
    
    // 判断是否可以提交上传
    const canSubmitUpload = computed(() => {
      // 如果是设备操作上传模式，则只需要有设备编号
      if (isDeviceUpload.value && uploadDeviceId.value) {
        return true
      }
      // 如果是普通上传模式，需要同时有密钥和设备编号
      if (!isDeviceUpload.value) {
        return decryptKey.value.trim() && deviceId.value.trim()
      }
      return false
    })
    
    // 详细日志列表相关计算属性
    const canBatchView = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canView(log)) &&
             selectedDetailLogs.value.every(log => log.status === 'parsed')
    })
    
    const canBatchDownload = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canDownload(log)) &&
             selectedDetailLogs.value.every(log => log.status === 'parsed')
    })
    
    const canBatchReparse = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canReparseLog(log)) &&
             selectedDetailLogs.value.every(log => log.status === 'parsed' || log.status === 'parse_failed')
    })
    
    const canBatchDelete = computed(() => {
      return selectedDetailLogs.value.length > 0 && 
             selectedDetailLogs.value.every(log => canDeleteLog(log)) &&
             selectedDetailLogs.value.every(log => 
               log.status === 'parsed' || 
               log.status === 'decrypt_failed' || 
               log.status === 'parse_failed' ||
               log.status === 'file_error' ||
               log.status === 'failed' ||
               log.status === 'queue_failed' ||
               log.status === 'upload_failed' ||
               log.status === 'delete_failed'
             )
    })
    
    const isSameDevice = computed(() => {
      if (selectedDetailLogs.value.length === 0) return true
      const firstDeviceId = selectedDetailLogs.value[0].device_id
      return selectedDetailLogs.value.every(log => log.device_id === firstDeviceId)
    })
    
    const deviceCheckMessage = computed(() => {
      if (selectedDetailLogs.value.length === 0) return ''
      if (!isSameDevice.value) {
        const deviceIds = [...new Set(selectedDetailLogs.value.map(log => log.device_id))]
        return `选中日志包含不同的设备: ${deviceIds.join(', ')}`
      }
      return ''
    })
    
    const hasIncompleteLogs = computed(() => {
      return selectedDetailLogs.value.some(log => 
        log.status !== 'parsed' && 
        log.status !== 'failed' && 
        log.status !== 'decrypt_failed' && 
        log.status !== 'parse_failed' && 
        log.status !== 'file_error' &&
        log.status !== 'queue_failed' &&
        log.status !== 'upload_failed' &&
        log.status !== 'delete_failed'
      )
    })
    
    const incompleteLogsMessage = computed(() => {
      if (selectedDetailLogs.value.length === 0) return ''
      if (hasIncompleteLogs.value) {
        const incompleteCount = selectedDetailLogs.value.filter(log => 
          log.status !== 'parsed' && 
          log.status !== 'failed' && 
          log.status !== 'decrypt_failed' && 
          log.status !== 'parse_failed' && 
          log.status !== 'file_error' &&
          log.status !== 'queue_failed' &&
          log.status !== 'upload_failed' &&
          log.status !== 'delete_failed'
        ).length
        return t('logs.messages.incompleteParsingWarning', { count: incompleteCount })
      }
      return ''
    })
    
    // 权限相关计算属性
    const userRole = computed(() => store.state.auth.user?.role_id)
    const userId = computed(() => store.state.auth.user?.id)
    const hasPermission = (p) => store.getters['auth/hasPermission']?.(p)
    const hasDeviceReadPermission = computed(() => store.getters['auth/hasPermission']?.('device:read'))
    

    
    // 检查是否可以删除日志
    const canDeleteLog = (log) => {
      // 具有全删权限
      if (hasPermission('log:delete')) return true
      // 具有删自己权限
      if (hasPermission('log:delete_own')) {
        return log.uploader_id === userId.value
      }
      return false
    }
    
    // 方法
    const deviceGroupsLoading = ref(false)
    const lastDeviceGroupsLoadAt = ref(0)
    const loadDeviceGroups = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastDeviceGroupsLoadAt.value < 2000) {
        console.log('跳过设备分组加载（节流）')
        return
      }
      if (!force && deviceGroupsLoading.value) {
        console.log('跳过设备分组加载（去重）')
        return
      }
      try {
        deviceGroupsLoading.value = true
        lastDeviceGroupsLoadAt.value = now
        const timeParams = buildTimeParams()
        const response = await store.dispatch('logs/fetchLogsByDevice', {
          ...timeParams,
          page: currentPage.value,
          limit: pageSize.value,
          device_filter: deviceFilterValue.value.trim()
        })
        
        deviceGroups.value = response.data.device_groups || []
        deviceTotal.value = response.data.pagination?.total || 0
      } catch (error) {
        if (!silent && !uploading.value) {
        ElMessage.error(t('logs.errors.loadDeviceGroupsFailed'))
        } else {
          console.warn('加载设备分组失败(已静默):', error?.message || error)
        }
      } finally {
        deviceGroupsLoading.value = false
      }
    }
    
    const loadLogs = async () => {
      try {
        loading.value = true
        const timeParams = buildTimeParams()
        await store.dispatch('logs/fetchLogs', {
          page: currentPage.value,
          limit: pageSize.value,
          device_id: filterDeviceId.value || undefined,
          ...timeParams
        })
      } catch (error) {
        ElMessage.error(t('logs.errors.loadLogsFailed'))
      } finally {
        loading.value = false
      }
    }
    
    // 设备详情相关方法
    const showDeviceDetail = (device) => {
      selectedDevice.value = device
      showDeviceDetailDrawer.value = true
      detailCurrentPage.value = 1
      detailTypeFilter.value = 'all'
      detailQuickRange.value = 'all'
      detailSelectedYear.value = 'all'
      detailSelectedMonth.value = 'all'
      detailSelectedDay.value = 'all'
      detailStatusFilter.value = 'all'
      detailAvailableYears.value = []
      detailAvailableMonths.value = {}
      detailAvailableDays.value = {}
      detailLogs.value = []
      detailTotal.value = 0
      syncDetailSelections()
      
      // 订阅设备状态更新
      if (device && device.device_id) {
        console.log('准备订阅设备状态更新:', device.device_id)
        const subscribed = websocketClient.subscribeToDevice(device.device_id)
        if (subscribed) {
          console.log('✅ 设备订阅成功:', device.device_id)
        } else {
          console.warn('⚠️ 设备订阅失败:', device.device_id)
        }
      }
      
      loadDetailTimeFilters()
      loadDetailLogs({ force: true })
    }
    
    const loadDetailLogs = async (options = {}) => {
      if (!selectedDevice.value) return
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastDetailLogsLoadAt.value < 800) {
        if (!detailReloadTimer) {
          detailReloadTimer = setTimeout(() => {
            detailReloadTimer = null
            loadDetailLogs({ force: true, silent: true })
          }, 300)
        }
        return
      }
      if (!force && detailLoading.value) {
        if (!detailReloadTimer) {
          detailReloadTimer = setTimeout(() => {
            detailReloadTimer = null
            loadDetailLogs({ force: true, silent: true })
          }, 300)
        }
        return
      }
      try {
        detailLoading.value = true
        lastDetailLogsLoadAt.value = now
        const timeParams = buildDetailTimeParams()
        // 后端分页和筛选
        const response = await store.dispatch('logs/fetchLogs', {
          page: detailCurrentPage.value,
          limit: detailPageSize.value,
          device_id: selectedDevice.value.device_id,
          status_filter: detailStatusFilter.value, // 传递状态筛选参数
          ...timeParams
        })
        detailLogs.value = response?.data?.logs || []
        detailTotal.value = response?.data?.total ?? 0
      } catch (error) {
        if (!silent) ElMessage.error(t('logs.errors.loadDeviceDetailLogsFailed'))
      } finally {
        detailLoading.value = false
      }
    }
    
    const syncDetailSelections = () => {
      const monthValues = detailMonthOptions.value.map(option => option.value)
      if (!monthValues.includes(detailSelectedMonth.value)) {
        detailSelectedMonth.value = 'all'
      }
      const dayValues = detailDayOptions.value.map(option => option.value)
      if (!dayValues.includes(detailSelectedDay.value)) {
        detailSelectedDay.value = 'all'
      }
      if (
        detailSelectedYear.value === 'all' &&
        detailSelectedMonth.value === 'all' &&
        detailSelectedDay.value === 'all'
      ) {
        detailQuickRange.value = 'all'
      }
    }

    const loadDetailTimeFilters = async () => {
      if (!selectedDevice.value?.device_id) return
      try {
        const resp = await api.logs.getTimeFilters({ device_id: selectedDevice.value.device_id })
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
        detailAvailableYears.value = Array.from(new Set(normalizedYears))

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
        detailAvailableMonths.value = monthsResult

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
        detailAvailableDays.value = daysResult

        syncDetailSelections()
      } catch (error) {
        console.warn('loadDetailTimeFilters error:', error)
        detailAvailableYears.value = []
        detailAvailableMonths.value = {}
        detailAvailableDays.value = {}
      }
    }

    watch([detailAvailableYears, detailAvailableMonths, detailAvailableDays], () => {
      syncDetailSelections()
    })

    const formatTimePrefix = (date) => {
      if (!date) return ''
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const h = String(date.getHours()).padStart(2, '0')
      return `${y}${m}${d}${h}`
    }

    const computeCustomRange = () => {
      if (
        detailSelectedYear.value === 'all' &&
        detailSelectedMonth.value === 'all' &&
        detailSelectedDay.value === 'all'
      ) {
        return { start: null, end: null }
      }

      const year =
        detailSelectedYear.value === 'all'
          ? currentYear
          : Number(detailSelectedYear.value)
      const month =
        detailSelectedMonth.value === 'all'
          ? null
          : Number(detailSelectedMonth.value)
      const day =
        detailSelectedDay.value === 'all'
          ? null
          : Number(detailSelectedDay.value)

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
      return { start, end }
    }
    
    const buildDetailTimeParams = () => {
      const tp = (detailNameTimePrefix.value || '').trim()
      const params = {}
      if (tp && /^[0-9]{4}(?:[0-9]{2}){0,3}$/.test(tp)) {
        params.time_prefix = tp
      }

      let startDate = null
      let endDate = null
      const now = new Date()

      if (detailQuickRange.value === '1d') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        endDate = now
      } else if (detailQuickRange.value === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        endDate = now
      } else if (detailQuickRange.value === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        endDate = now
      }

      if (
        detailQuickRange.value === 'custom' ||
        detailSelectedYear.value !== 'all' ||
        detailSelectedMonth.value !== 'all' ||
        detailSelectedDay.value !== 'all'
      ) {
        const { start, end } = computeCustomRange()
        if (start && end) {
          startDate = start
          endDate = end
        }
      }

      if (startDate && endDate) {
        params.time_range_start = formatTimePrefix(startDate)
        params.time_range_end = formatTimePrefix(endDate)
      }

      return params
    }
    
    const handleDrawerClose = () => {
      showDeviceDetailDrawer.value = false
      
      // 取消订阅设备状态更新
      if (selectedDevice.value && selectedDevice.value.device_id) {
        websocketClient.unsubscribeFromDevice(selectedDevice.value.device_id)
      }
      
      selectedDevice.value = null
      selectedDetailLogs.value = []
      detailSelectedYear.value = 'all'
      detailSelectedMonth.value = 'all'
      detailSelectedDay.value = 'all'
      detailQuickRange.value = 'all'
      detailStatusFilter.value = 'all'
      detailAvailableYears.value = []
      detailAvailableMonths.value = {}
      detailAvailableDays.value = {}
      detailLogs.value = []
      detailTotal.value = 0
      syncDetailSelections()
      
      // 清理智能状态监控
      if (window.smartStatusMonitorCleanup) {
        window.smartStatusMonitorCleanup()
        window.smartStatusMonitorCleanup = null
      }
    }
    
    const uploadLogForDevice = async (device) => {
      // 设置为设备上传模式
      isDeviceUpload.value = true
      uploadDeviceId.value = device.device_id
      console.log('设置设备编号:', uploadDeviceId.value)
      
      // 自动填充设备编号到输入框（用于显示）
      deviceId.value = device.device_id
      
      // 尝试自动获取该设备的密钥
      try {
        const response = await store.dispatch('logs/autoFillKey', device.device_id)
        if (response.data.key) {
          decryptKey.value = response.data.key
          console.log('自动填充密钥:', decryptKey.value)
        } else {
          console.log('未找到设备对应的密钥，需要用户手动输入')
        }
      } catch (error) {
        console.warn('自动获取设备密钥失败:', error.message)
      }
      
      showUploadDialog.value = true
    }
    
    // 普通上传模式（日志解析上侧的日志上传）
    const showNormalUpload = () => {
      // 设置为普通上传模式
      isDeviceUpload.value = false
      // 清空所有输入，确保是空白状态
      uploadDeviceId.value = ''
      deviceId.value = ''
      decryptKey.value = ''
      keyFileName.value = ''
      keyError.value = ''
      deviceIdError.value = ''
      uploadFileList.value = []
      
      showUploadDialog.value = true
    }
    
    const uploadDataForDevice = (device) => {
      ElMessage.info('数据上传功能暂未实现')
    }
    
    const viewSurgeryData = (device) => {
      ElMessage.info('查看手术数据功能暂未实现')
    }
    
    const toggleDeviceFocus = (device) => {
      device.focused = !device.focused
      ElMessage.success(device.focused ? '已关注设备' : '已取消关注')
    }

    // 手术数据抽屉与数据
    const showSurgeryDrawer = ref(false)
    const surgeryLoading = ref(false)
    const surgeryList = ref([])
    const surgeryPage = ref(1)
    const surgeryPageSize = ref(20)
    const surgeryTotal = ref(0)

    const openSurgeryDrawer = () => {
      showSurgeryDrawer.value = true
      loadSurgeries()
    }

    const openSurgeryDrawerForDevice = (device) => {
      selectedDevice.value = device
      showSurgeryDrawer.value = true
      surgeryPage.value = 1
      loadSurgeries()
    }

    const loadSurgeries = async () => {
      try {
        surgeryLoading.value = true
        const params = {
          device_id: selectedDevice.value?.device_id,
          page: surgeryPage.value,
          limit: surgeryPageSize.value
        }
        const resp = await api.surgeries.list(params)
        surgeryList.value = resp.data?.data || []
        surgeryTotal.value = resp.data?.total || 0
      } catch (e) {
        ElMessage.error(t('logs.messages.loadSurgeryDataFailed'))
      } finally {
        surgeryLoading.value = false
      }
    }

    const viewLogsBySurgery = async (row) => {
      try {
        // 直接从手术记录的 source_log_ids 字段获取日志ID数组
        const sourceLogIds = Array.isArray(row.source_log_ids) ? row.source_log_ids : []
        if (!sourceLogIds.length) {
          ElMessage.warning(t('logs.messages.noRelatedLogFiles'))
          return
        }
        // 过滤掉无效值并去重
        const ids = Array.from(new Set(sourceLogIds.filter(id => id != null && id !== undefined && id !== '')))
        if (!ids.length) {
          ElMessage.warning(t('logs.messages.noRelatedLogFiles'))
          return
        }
        const routeData = router.resolve(`/batch-analysis/${ids.join(',')}`)
        window.open(routeData.href, '_blank')
      } catch (e) {
        ElMessage.error(t('logs.messages.getSurgeryLogsFailed'))
      }
    }

    const visualizeSurgery = (row) => {
      // 使用统一的可视化函数
      visualizeSurgeryData(row, { queryId: row.id })
    }

    const deleteSurgery = async (row) => {
      try {
        await api.surgeries.remove(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadSurgeries()
      } catch (e) {
        ElMessage.error(t('shared.messages.deleteFailed'))
      }
    }
    
    // 详细日志列表相关方法
    const handleDetailSelectionChange = (selection) => {
      // 检查选择数量限制
      if (selection.length > 20) {
        // 限制选择数量为20个
        const limitedSelection = selection.slice(0, 20)
        selectedDetailLogs.value = limitedSelection
        
        // 显示提示信息
        ElMessage.warning(t('logs.messages.batchOperationLimit'))
        
        // 更新表格选择状态（需要手动设置）
        nextTick(() => {
          // 清除所有选择
          const table = document.querySelector('.detail-table-container .el-table')
          if (table) {
            const checkboxes = table.querySelectorAll('.el-table__row .el-checkbox__input')
            checkboxes.forEach((checkbox, index) => {
              const row = detailLogs.value[index]
              if (row && limitedSelection.some(selected => selected.id === row.id)) {
                checkbox.classList.add('is-checked')
                checkbox.setAttribute('aria-checked', 'true')
              } else {
                checkbox.classList.remove('is-checked')
                checkbox.setAttribute('aria-checked', 'false')
              }
            })
          }
        })
      } else {
        selectedDetailLogs.value = selection
      }
    }
    
    const clearDetailSelection = () => {
      selectedDetailLogs.value = []
    }
    
    const handleDetailSizeChange = (size) => {
      detailPageSize.value = size
      detailCurrentPage.value = 1
      loadDetailLogs({ force: true })
    }
    
    const handleDetailCurrentChange = (page) => {
      detailCurrentPage.value = page
      loadDetailLogs({ force: true })
    }
    
    const resetDetailFilters = () => {
      detailNameTimePrefix.value = ''
      detailQuickRange.value = 'all'
      detailSelectedYear.value = 'all'
      detailSelectedMonth.value = 'all'
      detailSelectedDay.value = 'all'
      detailStatusFilter.value = 'all'
      detailCurrentPage.value = 1
      loadDetailLogs({ force: true })
    }
    
    // 状态筛选处理函数（标签页切换）
    const handleStatusFilterChange = (value) => {
      detailStatusFilter.value = value
      detailCurrentPage.value = 1 // 重置到第一页
      loadDetailLogs({ force: true }) // 重新加载数据
    }
    
    const applyDetailNameFilter = () => {
      detailCurrentPage.value = 1
      showDetailNameFilterPanel.value = false
      loadDetailLogs({ force: true })
    }
    
    const resetDetailNameFilter = () => {
      detailNameTimePrefix.value = ''
      applyDetailNameFilter()
    }
    
    const handleQuickRangeChange = (value) => {
      detailQuickRange.value = value
      if (value !== 'custom') {
        detailSelectedYear.value = 'all'
        detailSelectedMonth.value = 'all'
        detailSelectedDay.value = 'all'
      }
      detailCurrentPage.value = 1
      loadDetailLogs({ force: true })
    }

    const handleYearChange = (value) => {
      detailSelectedYear.value = value
      if (value === 'all') {
        detailSelectedMonth.value = 'all'
        detailSelectedDay.value = 'all'
        detailQuickRange.value = 'all'
      } else {
        detailQuickRange.value = 'custom'
      }
      detailCurrentPage.value = 1
      loadDetailLogs({ force: true })
    }

    const handleMonthChange = (value) => {
      if (value !== 'all' && detailSelectedYear.value === 'all') {
        detailSelectedYear.value = String(currentYear)
      }
      detailSelectedMonth.value = value
      if (value === 'all') {
        detailSelectedDay.value = 'all'
        if (detailSelectedYear.value === 'all') {
          detailQuickRange.value = 'all'
        } else {
          detailQuickRange.value = 'custom'
        }
      } else {
        detailQuickRange.value = 'custom'
      }
      detailCurrentPage.value = 1
      loadDetailLogs({ force: true })
    }

    const handleDayChange = (value) => {
      if (value !== 'all') {
        if (detailSelectedYear.value === 'all') {
          detailSelectedYear.value = String(currentYear)
        }
        if (detailSelectedMonth.value === 'all') {
          const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0')
          detailSelectedMonth.value = currentMonth
        }
        detailQuickRange.value = 'custom'
      } else if (
        detailSelectedYear.value === 'all' &&
        detailSelectedMonth.value === 'all'
      ) {
        detailQuickRange.value = 'all'
      }
      detailSelectedDay.value = value
      detailCurrentPage.value = 1
      loadDetailLogs({ force: true })
    }


    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadLogs()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadLogs()
    }

    const buildTimeParams = () => {
      const tp = (nameTimePrefix.value || '').trim()
      if (tp && /^[0-9]{4}(?:[0-9]{2}){0,3}$/.test(tp)) {
        return { time_prefix: tp }
      }
      return {}
    }

    const applyNameFilter = () => {
      currentPage.value = 1
      showNameFilterPanel.value = false
      loadLogs()
    }
    const resetNameFilter = () => {
      nameTimePrefix.value = ''
      applyNameFilter()
    }

    const applyDeviceFilter = () => {
      currentPage.value = 1
      showDeviceFilterPanel.value = false
      loadDeviceGroups({ force: true }) // 强制加载，跳过节流
    }
    const resetDeviceFilter = () => {
      deviceFilterValue.value = ''
      currentPage.value = 1
      loadDeviceGroups({ force: true }) // 强制加载，跳过节流
    }
    
    // 设备列表分页处理
    const handleDeviceSizeChange = (newSize) => {
      pageSize.value = newSize
      currentPage.value = 1
      loadDeviceGroups({ force: true }) // 强制加载，跳过节流
    }
    
    const handleDeviceCurrentChange = (newPage) => {
      currentPage.value = newPage
      loadDeviceGroups({ force: true }) // 强制加载，跳过节流
    }

    const resetAllFilters = () => {
      nameTimePrefix.value = ''
      deviceFilterValue.value = ''
      showDeviceFilterPanel.value = false
      currentPage.value = 1
      loadDeviceGroups({ force: true }) // 强制加载，跳过节流
    }

    
    const submitUpload = () => {
      if (!uploadRef.value) {
        ElMessage.error('上传组件未初始化')
        return
      }
      
      // 使用手动跟踪的文件列表
      if (uploadFileList.value.length === 0) {
        ElMessage.error('请选择要上传的文件')
        return
      }
      
      if (uploadFileList.value.length > 50) {
        ElMessage.error('最多只能上传50个文件')
        return
      }
      
      const totalSize = uploadFileList.value.reduce((sum, f) => sum + (f.size || f.raw?.size || 0), 0)
      if (totalSize / 1024 / 1024 > 200) {
        ElMessage.error('总文件大小不能超过200MB')
        return
      }
      
      // 验证输入（根据模式进行不同验证）
      if (isDeviceUpload.value) {
        // 设备上传模式：只需要验证设备编号存在
        if (!uploadDeviceId.value) {
          ElMessage.error(t('logs.messages.deviceIdRequired'))
          return
        }
      } else {
        // 普通上传模式：需要验证密钥和设备编号
      if (!decryptKey.value.trim()) {
        ElMessage.error(t('logs.messages.needDecryptKeyOrFile'))
        return
      }
      
      // 验证密钥格式
      const macRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/
      if (!macRegex.test(decryptKey.value)) {
        ElMessage.error(t('logs.messages.invalidKeyFormat'))
        return
      }
      
      if (!deviceId.value.trim()) {
        ElMessage.warning(t('logs.messages.enterDeviceIdOrUseDefault'))
        return
      }
      
        // 验证设备编号格式
      if (deviceId.value && deviceId.value !== '0000-00') {
        const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/
        if (!deviceIdRegex.test(deviceId.value)) {
          ElMessage.error(t('logs.messages.invalidDeviceIdFormat'))
          return
        }
        }
      }
      
      // 记录当前上传的设备编号（用于自动展开）
      if (!isDeviceUpload.value) {
        currentUploadDeviceId.value = deviceId.value
      }
      
      uploadRef.value.submit()
      // 点击上传并解析后立即关闭弹窗
      showUploadDialog.value = false
      // 刷新一次设备分组列表，展示最新的"上传中/处理中"状态
      loadDeviceGroups()
      
              // 启动智能状态监控（如果详细日志抽屉是打开的）
        startMonitoringIfDrawerOpen()
    }
    
    const beforeUpload = (file) => {
      const isMedbotFile = file.name.endsWith('.medbot')
      const isLt200M = file.size / 1024 / 1024 < 200
      
      if (!isMedbotFile) {
        ElMessage.error('只能上传 .medbot 文件!')
        return false
      }
      if (!isLt200M) {
        ElMessage.error('单个文件大小不能超过200MB!')
        return false
      }
      
      return true
    }
    
    const beforeKeyUpload = (file) => {
      const isTxtFile = file.name.endsWith('.txt')
      const isSystemInfoFile = file.name === 'systemInfo.txt'
      const isLt1M = file.size / 1024 / 1024 < 1
      
      if (!isTxtFile) {
        ElMessage.error('密钥文件必须是 .txt 格式!')
        return false
      }
      if (!isSystemInfoFile) {
        ElMessage.error('密钥文件名必须是 systemInfo.txt!')
        return false
      }
      if (!isLt1M) {
        ElMessage.error('密钥文件大小不能超过1MB!')
        return false
      }
      return false // 阻止自动上传
    }
    
    const onKeyFileChange = (file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        // 在空闲时验证，避免主线程长时间占用
        scheduleUpdate(() => {
          const content = (e.target.result || '').trim()
          // 验证文件内容是否为MAC地址格式
          const macRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/
          if (!macRegex.test(content)) {
            ElMessage.error(t('logs.messages.invalidKeyFileFormat'))
            return
          }
          decryptKey.value = content
          keyFileName.value = file.name
          keyError.value = '' // 清除错误提示
          ElMessage.success('密钥文件读取成功')
        })
      }
      reader.readAsText(file.raw)
    }
    
    const clearUpload = () => {
      if (uploadRef.value) {
        uploadRef.value.clearFiles()
      }
      if (keyUploadRef.value) {
        keyUploadRef.value.clearFiles()
      }
      uploadFileList.value = []
      
            // 根据模式决定是否清空输入
      if (!isDeviceUpload.value) {
        // 普通上传模式：清空所有输入
        decryptKey.value = ''
        keyFileName.value = ''
        deviceId.value = ''
        uploadDeviceId.value = ''
        keyError.value = ''
        deviceIdError.value = ''
        currentUploadDeviceId.value = '' // 清空当前上传的设备编号
      } else {
        // 设备上传模式：只清空文件，保留设备信息
        keyError.value = ''
        deviceIdError.value = ''
      }
      
      // 重置上传状态和进度
      uploading.value = false
      overallProgress.value = 0
    }

    // 进度格式化方法
    const progressFormat = (percentage) => {
      if (percentage < 30) {
        return `文件上传中 ${percentage}%`
      } else if (percentage < 60) {
        return `解密处理中 ${percentage}%`
      } else if (percentage < 90) {
        return `解析处理中 ${percentage}%`
      } else if (percentage < 100) {
        return t('logs.messages.deletingProgress', { percentage })
      } else {
        return `处理完成 ${percentage}%`
      }
    }

    // 防止页面刷新导致解析中断
    const preventRefresh = () => {
      if (uploading.value) {
        return t('logs.messages.parsingInProgress')
      }
    }

    // 监听页面刷新事件和初始化
    onMounted(() => {
      // 确保 Logs 页面加载时建立 WebSocket 连接
      try { websocketClient.connect() } catch (_) {}
      window.addEventListener('beforeunload', preventRefresh)
      
      // 初始化加载设备分组数据
      loadDeviceGroups()
      
      // 监听 WebSocket 状态变化事件
      websocketClient.on('logStatusChange', (data) => {
        console.log('收到日志状态变化:', data)
        
        // 如果状态变为 'deleted'，清除删除中状态
        if (data.newStatus === 'deleted') {
          deletingIds.value.delete(data.logId)
          console.log('清除删除中状态，日志ID:', data.logId)
        }
        
        // 就地更新当前列表中该条目的状态，避免等待二次拉取
        const i = detailLogs.value.findIndex(l => Number(l.id) === Number(data.logId))
        if (i !== -1) {
          detailLogs.value[i] = { ...detailLogs.value[i], status: data.newStatus }
        }
        
        // 如果当前有选中的设备且详细日志抽屉是打开的，自动刷新
        if (selectedDevice.value && 
            showDeviceDetailDrawer.value && 
            selectedDevice.value.device_id === data.deviceId) {
          
          console.log('WebSocket 状态变化，准备自动刷新详细日志列表')
          // 静默刷新，并通过节流避免过多请求
          loadDetailLogs({ silent: true })
        }
      })
      
      websocketClient.on('batchStatusChange', (data) => {
        console.log('收到批量状态变化:', data)
        
        // 处理批量状态变化中的删除完成状态
        if (data.changes && Array.isArray(data.changes)) {
          data.changes.forEach(change => {
            if (change.newStatus === 'deleted') {
              deletingIds.value.delete(change.logId)
              console.log('批量状态变化：清除删除中状态，日志ID:', change.logId)
            }
            // 就地更新状态
            const i = detailLogs.value.findIndex(l => Number(l.id) === Number(change.logId))
            if (i !== -1) {
              detailLogs.value[i] = { ...detailLogs.value[i], status: change.newStatus }
            }
          })
        }
        
        // 如果当前有选中的设备且详细日志抽屉是打开的，自动刷新
        if (selectedDevice.value && 
            showDeviceDetailDrawer.value && 
            selectedDevice.value.device_id === data.deviceId) {
          
          console.log('WebSocket 批量状态变化，准备自动刷新详细日志列表')
          // 静默刷新，并通过节流避免过多请求
          loadDetailLogs({ silent: true })
        }
      })
      
      // 添加 WebSocket 连接状态监听，用于更新状态横幅
      const updateWebSocketStatus = () => {
        // 强制触发计算属性重新计算
        nextTick(() => {
          // Vue 会自动重新计算计算属性
        })
      }
      
      // 监听连接状态变化
      websocketClient.on('connection', updateWebSocketStatus)
      websocketClient.on('disconnection', updateWebSocketStatus)
      
      // 添加状态更新定时器，确保状态横幅实时更新
      const statusUpdateTimer = setInterval(() => {
        // 强制触发计算属性重新计算
        nextTick(() => {
          // Vue 会自动重新计算计算属性
        })
      }, 1000) // 每秒更新一次
      
      // 清理定时器
      onUnmounted(() => {
        if (statusUpdateTimer) {
          clearInterval(statusUpdateTimer)
        }
      })
    })
    
    const onUploadProgress = (event, file, fileList) => {
      // 进入文件上传阶段
      uploading.value = true
      // 上传进度处理，显示文件上传阶段（占总进度的30%）
      const uploadProgress = Math.floor(event.percent * 0.3) // 上传占30%
      overallProgress.value = uploadProgress
      
    }

    const onUploadSuccess = (response, file, fileList) => {
      console.log('上传成功:', response)
      
      // 更新手动跟踪的文件列表
      updateUploadFileList(fileList)
      
      // 检查是否所有文件都上传完成
      const allUploaded = fileList.length > 0 && fileList.every(f => f.status === 'success')
      if (allUploaded) {
        // 所有文件上传完成，开始解密和解析阶段
        uploading.value = false
        overallProgress.value = 30 // 上传完成，进度到30%
        processingStatus.value = '文件已上传，等待处理...'
        
        // 如果是普通上传模式（非设备操作上传），自动展开对应设备的详细日志列表
        if (!isDeviceUpload.value && currentUploadDeviceId.value && currentUploadDeviceId.value !== '0000-00') {
          // 延迟一下，确保设备列表已更新
          setTimeout(async () => {
            try {
              // 重新加载设备列表（静默）
              await loadDeviceGroups({ silent: true })
              
              // 查找对应的设备
              const targetDevice = deviceGroups.value.find(device => device.device_id === currentUploadDeviceId.value)
              if (targetDevice) {
                console.log('自动展开设备详细日志列表:', targetDevice.device_id)
                showDeviceDetail(targetDevice)
              }
            } catch (error) {
              console.warn('自动展开设备详细日志列表失败:', error)
            }
          }, 1000) // 延迟1秒，确保后端处理完成
        }
        
        // 启动智能状态监控（如果详细日志抽屉是打开的）
        startMonitoringIfDrawerOpen()
        
        // 开始状态监控
        startStatusMonitoring()

        // 清空已选择的上传文件（不影响输入框内容）
        try {
          if (uploadRef.value && uploadRef.value.clearFiles) {
            uploadRef.value.clearFiles()
          }
        } catch (_) {}
        uploadFileList.value = []
      }
    }
    
    // 智能状态变化检测和更新
    const checkAndUpdateDetailLogs = async () => {
      if (!selectedDevice.value || !showDeviceDetailDrawer.value) return
      
      try {
        // 获取当前详细日志列表的状态快照
        const currentStatusSnapshot = detailLogs.value.map(log => ({
          id: log.id,
          status: log.status,
          updated_at: log.updated_at
        }))
        
        // 重新加载详细日志列表
        await loadDetailLogs()
        
        // 检查是否有状态变化
        const hasStatusChange = detailLogs.value.some((log, index) => {
          const oldLog = currentStatusSnapshot[index]
          return oldLog && (
            oldLog.status !== log.status ||
            oldLog.updated_at !== log.updated_at
          )
        })
        
        if (hasStatusChange) {
          console.log('检测到日志状态变化，已自动刷新详细日志列表')
        }
        
        return hasStatusChange
      } catch (error) {
        console.error('检查日志状态变化失败:', error)
        return false
      }
    }
    
    // 智能状态监控函数
    const startSmartStatusMonitoring = () => {
      // 取消详细列表的轮询，完全依赖 WebSocket 事件触发刷新
      return () => {}
    }
    
    // 通用函数：启动智能状态监控（如果详细日志抽屉是打开的）
    const startMonitoringIfDrawerOpen = () => {
      if (selectedDevice.value && showDeviceDetailDrawer.value) {
        // 清理之前的监控
        if (window.smartStatusMonitorCleanup) {
          window.smartStatusMonitorCleanup()
        }
        // 启动新的监控
        window.smartStatusMonitorCleanup = startSmartStatusMonitoring()
        console.log('已启动智能状态监控')
        
        // 订阅设备状态更新
        if (selectedDevice.value.device_id) {
          console.log('准备订阅设备状态更新:', selectedDevice.value.device_id)
          const subscribed = websocketClient.subscribeToDevice(selectedDevice.value.device_id)
          console.log('设备订阅结果:', subscribed ? '成功' : '失败')
        }
      }
    }
    
    // 状态监控函数
    const startStatusMonitoring = () => {
      // 移除轮询监控，完全依赖 WebSocket 事件更新进度和列表
      return
    }
    
    const onUploadError = (error) => {
      uploading.value = false
      overallProgress.value = 0
      ElMessage.error('上传失败: ' + (error.message || '未知错误'))
    }
    
    const onExceed = (files, fileList) => {
      ElMessage.error('最多只能上传50个文件!')
    }
    
    const onFileChange = (file, fileList) => {
      updateUploadFileList(fileList)
    }
    
    const onFileRemove = (file, fileList) => {
      updateUploadFileList(fileList)
    }

    // 删除单个文件
    const removeFile = (index) => {
      uploadFileList.value.splice(index, 1)
    }

    // 空闲时批量更新文件列表并预计算显示字段，减少同步阻塞
    const scheduleUpdate = (fn) => {
      const idle = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 0 }), 1))
      idle(() => fn())
    }
    const updateUploadFileList = (rawList) => {
      const normalized = (rawList || []).map(f => {
        const size = f.size || f.raw?.size || 0
        const sizeText = formatFileSize(size)
        return { ...f, sizeText }
      })
      scheduleUpdate(() => {
        uploadFileList.value = normalized
      })
    }
    
    const handleParse = async (row) => {
      try {
        row.parsing = true
        await store.dispatch('logs/parseLog', row.id)
        ElMessage.success('解析成功')
        loadLogs()
        
        // 启动智能状态监控，跟踪解析进度
        startMonitoringIfDrawerOpen()
      } catch (error) {
        ElMessage.error('解析失败')
      } finally {
        row.parsing = false
      }
    }

    const canReparse = computed(() => store.getters['auth/hasPermission']?.('log:reparse'))

    const handleReparse = async (row) => {
      try {
        if (!canReparse.value) {
          ElMessage.error('仅管理员可重新解析')
          return
        }
        row.parsing = true
        row.status = 'parsing'
        await store.dispatch('logs/reparseLog', row.id)
        ElMessage.success('重新解析完成')
        await loadLogs()
        
        // 启动智能状态监控，跟踪重新解析进度
        startMonitoringIfDrawerOpen()
      } catch (error) {
        const msg = error.response?.data?.message || error.message || '重新解析失败'
        ElMessage.error(msg)
      } finally {
        row.parsing = false
      }
    }
    
    const handleDownload = async (row) => {
      try {
        const response = await store.dispatch('logs/downloadLog', row.id)
        
        // 创建下载链接
        const blob = new Blob([response.data])
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = row.filename
        link.click()
        window.URL.revokeObjectURL(url)
        
        ElMessage.success('下载成功')
      } catch (error) {
        ElMessage.error('下载失败')
      }
    }
    
    // 跟踪删除中ID集合
    const deletingIds = ref(new Set())

    const isDeleting = (id) => deletingIds.value.has(id)

    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm(
          t('logs.messages.confirmDeleteSingle'),
          t('shared.messages.deleteConfirmTitle'),
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        
        // 将日志ID添加到删除中状态
        deletingIds.value.add(row.id)
        await nextTick()
        
        try {
          // 调用删除API
          await store.dispatch('logs/deleteLog', row.id)
          
          // 显示队列状态
          ElMessage.success('删除任务已加入队列，正在处理中...')
          
          // 重新加载日志列表以显示"删除中"状态
          await loadDetailLogs()
          
          // 启动智能状态监控，跟踪删除进度
          startMonitoringIfDrawerOpen()
          
        } catch (apiError) {
          console.error('删除API调用失败:', apiError)
          const errorMessage = apiError.response?.data?.message || apiError.message || $t('shared.messages.deleteFailed')
          ElMessage.error(errorMessage)
          // API调用失败时，清除删除中状态
          deletingIds.value.delete(row.id)
        }
        
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除确认错误:', error)
          ElMessage.error(t('logs.messages.deleteOperationCancelled'))
        }
      }
    }

    // 跳转到日志查看页面
    const goToLogAnalysis = (row) => {
      // 在新页面中打开日志查看，使用batch-analysis路由
      const routeData = router.resolve(`/batch-analysis/${row.id}`)
      window.open(routeData.href, '_blank')
    }
    
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }
    
    const formatDate = (dateString) => {
      if (!dateString) return '-'
      return new Date(dateString).toLocaleString('zh-CN')
    }
    
    // 行状态：根据需求映射显示文字
    const getRowStatusType = (row) => {
      if (deletingIds.value.has(row.id)) return 'warning'
      const map = {
        uploading: 'warning',
        queued: 'info',
        decrypting: 'warning',
        parsing: 'warning',
        parsed: 'success',
        failed: 'danger',
        decrypt_failed: 'danger',
        parse_failed: 'danger',
        file_error: 'danger',
        deleting: 'warning'  // 新增删除中状态
      }
      return map[row.status] || 'info'
    }
    const getRowStatusText = (row) => {
      if (deletingIds.value.has(row.id)) return t('logs.statusText.deleting')
      
      // 根据状态返回对应的文本
      const map = {
        uploading: t('logs.statusText.uploading'),
        queued: t('logs.statusText.queued'),
        decrypting: t('logs.statusText.decrypting'),
        parsing: t('logs.statusText.parsing'),
        parsed: t('logs.statusText.parsed'),
        decrypt_failed: t('logs.statusText.decrypt_failed'),
        parse_failed: t('logs.statusText.parse_failed'),
        file_error: t('logs.statusText.file_error'),
        failed: t('logs.statusText.failed'),
        deleting: t('logs.statusText.deleting')
      }
      
      return map[row.status] || (row.status || '-')
    }
    

    

    

    
    // 批量查看
    const handleBatchAnalyze = () => {
      const logIds = selectedDetailLogs.value.map(log => log.id).join(',')
      // 在新页面中打开批量查看
      const routeData = router.resolve(`/batch-analysis/${logIds}`)
      window.open(routeData.href, '_blank')
    }
    
    // 批量下载（异步队列模式）
    const handleBatchDownload = async () => {
      try {
        const logIds = selectedDetailLogs.value.map(log => log.id)
        
        // 创建任务
        const { data } = await api.logs.batchDownload(logIds)
        const taskId = data?.taskId
        if (!taskId) throw new Error('未返回 taskId')
        
        ElMessage.info('批量下载任务已创建，正在处理...')
        
        // 轮询任务状态：低频 + 429 退避，避免触发全局限流
        const pollIntervalMs = 5000
        const timeoutMs = 10 * 60 * 1000
        const startedAt = Date.now()
        while (Date.now() - startedAt < timeoutMs) {
          try {
            const resp = await api.logs.getBatchDownloadTaskStatus(taskId)
            const st = resp.data?.data
            const state = st?.status

            if (state === 'completed') {
              // 下载结果文件
              try {
                const downloadResp = await api.logs.downloadBatchDownloadResult(taskId)
                const zipName = st?.result?.zipFileName || `logs_batch_${Date.now()}.zip`
                const blob = new Blob([downloadResp.data])
                const url = window.URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = zipName
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                window.URL.revokeObjectURL(url)
                ElMessage.success('批量下载完成')
              } catch (downloadErr) {
                ElMessage.error(downloadErr?.response?.data?.message || '下载结果文件失败')
              }
              return
            }
            if (state === 'failed') {
              ElMessage.error(st?.error || '批量下载任务失败')
              return
            }
          } catch (pollErr) {
            if (Number(pollErr?.response?.status) === 429) {
              const retryAfterMs = Math.max(
                1000,
                Number(pollErr?.response?.data?.retryAfter || 0) * 1000 || pollIntervalMs
              )
              await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
              continue
            }
            ElMessage.error('查询任务状态失败')
            return
          }
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
        }
        ElMessage.warning('批量下载任务超时，请稍后重试')
      } catch (error) {
        console.error('批量下载失败:', error)
        const errorMessage = error.response?.data?.message || error.message || '批量下载失败'
        ElMessage.error(errorMessage)
      }
    }
    
    // 批量删除
    const handleBatchDelete = async () => {
      try {
        // 检查是否有未完成的日志
        if (hasIncompleteLogs.value) {
          ElMessage.warning(t('logs.messages.waitForParsingComplete'))
          return
        }
        
        await ElMessageBox.confirm(
          t('logs.messages.confirmBatchDelete', { count: selectedDetailLogs.value.length }), 
          t('logs.messages.batchDeleteConfirm'), 
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        
        // 保存选中的日志数据，避免在验证过程中被清空
        const selectedLogsData = [...selectedDetailLogs.value]
        const logIds = selectedLogsData.map(log => parseInt(log.id)).filter(id => !isNaN(id))
        
        if (logIds.length === 0) {
          ElMessage.error('选中的日志ID格式不正确')
          return
        }
        
        // 将选中的日志ID添加到删除中状态
        logIds.forEach(id => deletingIds.value.add(id))
        await nextTick()
        
        // 执行批量删除
        try {
          await store.dispatch('logs/batchDeleteLogs', logIds)
          
          // 显示队列状态
          ElMessage.success('批量删除任务已加入队列，正在处理中...')
          
          // 清除删除中状态，因为任务已加入队列
          logIds.forEach(id => deletingIds.value.delete(id))
          
          // 重新加载详细日志列表以显示"删除中"状态
          await loadDetailLogs()
          
          // 启动智能状态监控，跟踪删除进度
          startMonitoringIfDrawerOpen()
          
          clearDetailSelection() // 清空选择
        } catch (apiError) {
          console.error('批量删除失败:', apiError)
          const errorMessage = apiError.response?.data?.message || apiError.message || $t('logs.messages.batchDeleteFailed')
          ElMessage.error(errorMessage)
          // 删除失败时，清除删除中状态
          logIds.forEach(id => deletingIds.value.delete(id))
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('批量删除错误:', error)
          console.error('错误详情:', {
            name: error.name,
            message: error.message,
            code: error.code,
            response: error.response?.data,
            status: error.response?.status,
            statusText: error.response?.statusText,
            config: {
              url: error.config?.url,
              method: error.config?.method,
              data: error.config?.data
            }
          })
          
          let errorMessage = $t('logs.messages.batchDeleteFailed')
          if (error.response?.data?.message) {
            errorMessage = error.response.data.message
          } else if (error.message) {
            errorMessage = error.message
          }
          
          ElMessage.error(errorMessage)
        }
      }
    }

    // 批量重新解析（仅管理员）
    const handleBatchReparse = async () => {
      try {
        if (!canReparse.value) {
          ElMessage.error('仅管理员可批量重新解析')
          return
        }
        if (!selectedDetailLogs.value.length) {
          ElMessage.warning('请先选择要重新解析的日志')
          return
        }
        // 检查是否有未完成的日志
        if (hasIncompleteLogs.value) {
          ElMessage.warning('请等待所有选中的日志解析完成后再进行重新解析操作')
          return
        }
        await ElMessageBox.confirm(
          `确定对选中的 ${selectedDetailLogs.value.length} 个日志重新解析释义吗？`,
          '批量重新解析确认',
          { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
        )
        const ids = selectedDetailLogs.value.map(l => l.id)
        // 订阅所有涉及设备，确保能收到各设备的状态更新
        const deviceIdsToSubscribe = Array.from(new Set(selectedDetailLogs.value.map(l => l.device_id).filter(Boolean)))
        deviceIdsToSubscribe.forEach(d => {
          try { websocketClient.subscribeToDevice(d) } catch (_) {}
        })
        // 乐观更新状态
        selectedDetailLogs.value.forEach(l => { l.status = 'parsing' })
        await store.dispatch('logs/batchReparseLogs', ids)
        await loadDetailLogs()
        
        // 启动智能状态监控，跟踪重新解析进度
        startMonitoringIfDrawerOpen()
      } catch (error) {
        if (error !== 'cancel') {
          const msg = error.response?.data?.message || error.message || '批量重新解析失败'
          ElMessage.error(msg)
        }
      }
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

    // 检查是否可以操作日志（完成状态或失败状态都可以操作）
    const canOperate = (log) => {
      return log.status === 'parsed' || 
             log.status === 'failed' || 
             log.status === 'decrypt_failed' || 
             log.status === 'parse_failed' || 
             log.status === 'file_error' ||
             log.status === 'queue_failed' ||
             log.status === 'upload_failed' ||
             log.status === 'delete_failed'
    }
    
    // 检查是否可以查看日志（只有完成状态的文件可以查看）
    const canView = (log) => {
      // 需要具备 read_all 或 read_own（且本人上传）
      if (store.getters['auth/hasPermission']?.('log:read_all')) {
        return log.status === 'parsed'
      }
      if (store.getters['auth/hasPermission']?.('log:read_all')) {
        return log.status === 'parsed' && log.uploader_id === (store.state.auth.user?.id)
      }
      return false
    }
    
    // 检查是否可以下载日志（只有完成状态的文件可以下载）
    const canDownload = (log) => {
      if (!store.getters['auth/hasPermission']?.('log:download')) return false
      return log.status === 'parsed'
    }
    
    // 检查是否可以重新解析（完成状态和解析失败的文件可以重新解析）
    const canReparseLog = (log) => {
      return log.status === 'parsed' || log.status === 'parse_failed'
    }
    

    

    
    // 自动填充密钥
    const autoFillKey = async () => {
      try {
        const response = await store.dispatch('logs/autoFillKey', deviceId.value)
        if (response.data.key) {
          decryptKey.value = response.data.key
          ElMessage.success(t('logs.messages.keyAutoFilled'))
        } else {
          ElMessage.warning(t('logs.messages.deviceKeyNotFound'))
        }
      } catch (error) {
        console.error('自动填充密钥错误:', error)
        const errorMessage = error.response?.data?.message || error.message || t('logs.messages.keyAutoFillFailed')
        ElMessage.error(errorMessage)
      }
    }

    // 验证密钥格式
    const validateKeyFormat = () => {
      const macRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/
      if (decryptKey.value && !macRegex.test(decryptKey.value)) {
        keyError.value = t('logs.messages.invalidKeyFormat')
      } else {
        keyError.value = ''
      }
    }

    // 自动填充设备编号
    const autoFillDeviceId = async () => {
      try {
        const response = await store.dispatch('logs/autoFillDeviceId', decryptKey.value)
        if (response.data.device_id) {
          deviceId.value = response.data.device_id
          ElMessage.success(t('logs.messages.deviceIdAutoFilled'))
        } else {
          ElMessage.warning(t('logs.messages.keyDeviceNotFound'))
        }
      } catch (error) {
        console.error('自动填充设备编号错误:', error)
        const errorMessage = error.response?.data?.message || error.message || t('logs.messages.deviceIdAutoFillFailed')
        ElMessage.error(errorMessage)
      }
    }

    // 验证设备编号格式
    const validateDeviceIdFormat = () => {
      const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/
      if (deviceId.value && !deviceIdRegex.test(deviceId.value)) {
        deviceIdError.value = t('logs.messages.invalidDeviceIdFormat')
      } else {
        deviceIdError.value = ''
      }
    }
    
    // 注意：loadDeviceGroups() 已经在第一个 onMounted 中调用
    
    // 获取批量查看按钮的提示信息
    const getBatchViewTitle = () => {
      if (selectedDetailLogs.value.length > 20) {
        return '批量查看一次最多只能选择20个文件'
      }
      if (incompleteLogsMessage.value) {
        return incompleteLogsMessage.value
      }
      if (deviceCheckMessage.value) {
        return deviceCheckMessage.value
      }
      return '批量查看选中的日志文件'
    }

    // 获取批量重新解析按钮的提示信息
    const getBatchReparseTitle = () => {
      if (selectedDetailLogs.value.length > 20) {
        return '批量重新解析一次最多只能选择20个文件'
      }
      if (incompleteLogsMessage.value) {
        return incompleteLogsMessage.value
      }
      return '批量重新解析选中的日志文件'
    }
    
    // 处理更多操作下拉菜单
    const handleMoreAction = (command) => {
      const { action, row } = command
      switch (action) {
        case 'download':
          handleDownload(row)
          break
        case 'delete':
          handleDelete(row)
          break
        case 'reparse':
          handleReparse(row)
          break
        default:
          console.warn('Unknown action:', action)
      }
    }
    
    return {
      loading,
      uploading,
      showUploadDialog,
      overallProgress,
      processingStatus,
      progressFormat,
      uploadRef,
      currentPage,
      pageSize,
      logs,
      total,
      uploadUrl,
      uploadHeaders,
      canSubmitUpload,
      loadLogs,
      handleSizeChange,
      handleCurrentChange,
      dateShortcuts,
      beforeUpload,
      submitUpload,
      clearUpload,
      onUploadSuccess,
      onUploadError,
      onExceed,
      onFileChange,
      onFileRemove,
      removeFile,
      handleParse,
      handleDownload,
      handleDelete,
      handleReparse,
      canReparse,
      formatFileSize,
      formatDate,
      getRowStatusType,
      getRowStatusText,
      goToLogAnalysis,
      isDeleting,
      userRole,
      decryptKey,
      keyUploadRef,
      keyFileName,
      deviceId,
      filterDeviceId,
      uploadFileList,
      uploadDeviceId,
      currentUploadDeviceId,
      beforeKeyUpload,
      onKeyFileChange,
      canDeleteLog,
      canOperate,
      canView,
      canDownload,
      canReparseLog,
      keyError,
      deviceIdError,
      autoFillKey,
      validateKeyFormat,
      autoFillDeviceId,
      validateDeviceIdFormat,
      
      // 设备分组相关
      deviceGroups,
      deviceTotal,
      showDeviceDetailDrawer,
      selectedDevice,
      detailLogs,
      detailLoading,
      detailCurrentPage,
      detailPageSize,
      detailTotal,
      selectedDetailLogs,
      showDetailNameFilterPanel,
      detailNameTimePrefix,
      detailQuickRange,
      detailSelectedYear,
      detailSelectedMonth,
      detailSelectedDay,
      detailStatusFilter,
      detailStatusTabs,
      detailQuickRangeOptions,
      detailYearOptions,
      detailMonthOptions,
      detailDayOptions,
      showEntriesDialog,
      logEntries,
      loadDeviceGroups,
      handleDeviceSizeChange,
      handleDeviceCurrentChange,
      showDeviceDetail,
      loadDetailLogs,
      handleDrawerClose,
      uploadLogForDevice,
      showNormalUpload,
      uploadDataForDevice,
      viewSurgeryData,
      toggleDeviceFocus,
      handleDetailSelectionChange,
      clearDetailSelection,
      handleDetailSizeChange,
      handleDetailCurrentChange,
      resetDetailFilters,
      applyDetailNameFilter,
      resetDetailNameFilter,
      handleQuickRangeChange,
      handleYearChange,
      handleMonthChange,
      handleDayChange,
      handleStatusFilterChange,
      checkAndUpdateDetailLogs,
      startSmartStatusMonitoring,
      startMonitoringIfDrawerOpen,
      websocketStatusTitle,
      websocketStatusType,
      websocketStatusDescription,
      
      // 批量操作相关
      canBatchView,
      canBatchDownload,
      canBatchReparse,
      canBatchDelete,
      isSameDevice,
      deviceCheckMessage,
      hasIncompleteLogs,
      incompleteLogsMessage,
      handleBatchAnalyze,
      handleBatchDownload,
      handleBatchDelete,
      handleBatchReparse,
      // 列筛选
      showNameFilterPanel,
      showDeviceFilterPanel,
      nameTimePrefix,
      deviceFilterValue,
      applyNameFilter,
      resetNameFilter,
      applyDeviceFilter,
      resetDeviceFilter,
      resetAllFilters,
      startStatusMonitoring,
      // 新增函数
      getBatchViewTitle,
      getBatchReparseTitle,
      handleMoreAction,
      // 手术数据
      showSurgeryDrawer,
      surgeryLoading,
      surgeryList,
      surgeryPage,
      surgeryPageSize,
      surgeryTotal,
      openSurgeryDrawer,
      loadSurgeries,
      viewLogsBySurgery,
      visualizeSurgery,
      deleteSurgery,
      openSurgeryDrawerForDevice: openSurgeryDrawerForDevice,
      // 医院信息脱敏
      hasDeviceReadPermission,
      maskHospitalName,
      
      // 图标组件
      Search,
      Monitor,
      Key,
      Document,
      Warning,
      InfoFilled,
      Filter,
      Upload,
      Refresh,
      RefreshLeft,
      Close,
      
      // 表格高度计算（固定表头）
      tableHeight: computed(() => {
        return getTableHeight('basic')
      })
    }
  }
}
</script>

<style scoped>
.websocket-status-section {
  margin-right: 16px;
}

.websocket-status-banner {
  margin-bottom: 16px;
}

.status-alert {
  margin-bottom: 0;
}

.logs-container {
  height: calc(100vh - 64px);
  background: var(--black-white-white);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-md);
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

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* 表格容器 - 固定表头 */
.table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.table-container :deep(.el-table) {
  flex: 1;
}

.table-container :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

.action-section {
  display: flex;
  gap: 10px;
}

.btn-group {
  display: flex;
  gap: 8px;
}

/* 操作列按钮组样式 */
.operation-buttons {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

/* 确保操作列（固定右列）的表头和内容都左对齐 */
.table-container :deep(.el-table__header-wrapper .el-table__header th.is-right),
.table-container :deep(.el-table__body-wrapper .el-table__body td.is-right) {
  text-align: left;
}

.pagination-wrapper {
  padding: 8px 0 12px 0;
  display: flex;
  justify-content: center;
}

/* 移除旧的 card-header 和 header-actions 样式，使用统一的 action-bar 样式 */

.header-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.batch-section {
  flex: 1 1 auto;
  min-width: 240px;
}

.only-own-section,
.reset-section,
.refresh-section,
.upload-section {
  flex: 0 0 auto;
}

/* 统一按钮样式与对齐 */
.reset-section .btn-primary,
.reset-section .btn-secondary,
.reset-section .btn-tertiary,
.reset-section .btn-ghost,
.reset-section .btn-danger,
.reset-section .btn-success,
.reset-section .btn-text,
.refresh-section .btn-primary,
.refresh-section .btn-secondary,
.refresh-section .btn-tertiary,
.refresh-section .btn-ghost,
.refresh-section .btn-danger,
.refresh-section .btn-success,
.refresh-section .btn-text,
.upload-section .btn-primary,
.upload-section .btn-secondary,
.upload-section .btn-tertiary,
.upload-section .btn-ghost,
.upload-section .btn-danger,
.upload-section .btn-success,
.upload-section .btn-text {
  height: 32px;
  line-height: 30px;
}

/* 列头筛选样式 */
.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-trigger {
  cursor: pointer;
  color: rgb(var(--text-secondary));
  transition: color 0.3s;
}

.filter-trigger:hover {
  color: rgb(var(--primary));
}

.filter-trigger.active {
  color: rgb(var(--primary));
}

.filter-panel {
  padding: 12px;
}

.filter-title {
  margin-bottom: 12px;
  font-weight: 500;
  color: rgb(var(--text-primary));
}

.filter-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.filter-actions .btn-primary,
.filter-actions .btn-secondary,
.filter-actions .btn-tertiary,
.filter-actions .btn-ghost,
.filter-actions .btn-danger,
.filter-actions .btn-success,
.filter-actions .btn-text {
  font-size: 12px;
  padding: 4px 8px;
  min-height: 24px;
}



.key-input-section {
  margin-top: 15px;
}

.key-input-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.key-separator {
  color: #666;
  font-size: 14px;
}

.key-file-info {
  margin-top: 10px;
}

.key-error {
  margin-top: 10px;
}

.device-input-section {
  margin-top: 15px;
}

.device-input-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.device-error {
  margin-top: 10px;
}

.device-info-section {
  margin-top: 15px;
}

.device-info-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.key-input-section {
  margin-top: 15px;
}

.key-input-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.key-separator {
  color: #666;
  font-size: 14px;
}

.key-file-info {
  margin-top: 10px;
}

.key-error {
  margin-top: 10px;
}

.device-input-section {
  margin-top: 15px;
}

.device-input-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.device-error {
  margin-top: 10px;
}

/* .list-card 样式已移除，使用 .main-card 替代 */

.parsing-tip {
  color: #e6a23c;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.parsing-tip .el-icon {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.overall-progress {
  margin-bottom: 20px;
  padding: 20px;
  background-color: rgb(var(--bg-secondary));
  border-radius: var(--radius-md);
  border: 1px solid rgb(var(--border-secondary));
}

.progress-stages {
  display: flex;
  justify-content: space-between;
  margin-top: 15px;
  padding: 0 10px;
}

.stage {
  font-size: 12px;
  color: rgb(var(--text-secondary));
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.stage.active {
  color: rgb(var(--primary));
  background-color: rgb(var(--bg-info-primary));
  font-weight: 500;
}

.stage.completed {
  color: rgb(var(--success));
  background-color: rgb(var(--bg-success));
  font-weight: 500;
}

.processing-status {
  margin-top: 10px;
  text-align: center;
}

.processing-status .el-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.custom-file-list {
  margin-top: 15px;
  border: 1px solid rgb(var(--border-secondary));
  border-radius: var(--radius-md);
  overflow: hidden;
}

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: rgb(var(--bg-secondary));
  border-bottom: 1px solid rgb(var(--border-secondary));
  font-size: 14px;
  font-weight: 500;
}

.file-items {
  max-height: 200px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px 15px;
  border-bottom: 1px solid rgb(var(--border-secondary));
  transition: background-color 0.2s;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background-color: rgb(var(--bg-secondary));
}

.file-item .el-icon {
  margin-right: 8px;
  color: rgb(var(--text-secondary));
}

.file-name {
  flex: 1;
  margin-right: 10px;
  font-size: 14px;
  color: rgb(var(--text-primary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  margin-right: 10px;
  font-size: 12px;
  color: rgb(var(--text-secondary));
}

.status-tip {
  margin-top: 4px;
  font-size: 11px;
  color: rgb(var(--warning));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.status-tip .el-icon {
  font-size: 12px;
}

.status-progress {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.status-progress .el-progress {
  width: 60px;
}

/* 批量操作样式 */
.batch-operations {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

/* 搜索区域样式 */
.search-section {
  display: flex;
  align-items: center;
  margin-left: auto;
  flex-shrink: 0;
  gap: 10px;
}

.search-input {
  width: 200px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: #f0f9ff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.batch-actions .btn-primary,
.batch-actions .btn-secondary,
.batch-actions .btn-tertiary,
.batch-actions .btn-ghost,
.batch-actions .btn-danger,
.batch-actions .btn-success,
.batch-actions .btn-text {
  font-size: 12px;
  padding: 6px 10px;
  min-height: 28px;
}



.info-icon {
  color: rgb(var(--text-secondary));
  margin-left: 4px;
  cursor: help;
  font-size: 14px;
}

/* 设备详情相关样式 */
.device-detail-content {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 卡片头部：包含关闭按钮和设备信息 */
.detail-logs-card-header {
  flex-shrink: 0;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgb(var(--border-secondary));
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-info h3 {
  margin: 0 0 6px 0;
  color: rgb(var(--text-primary));
  font-size: 16px;
  font-weight: 600;
}

.device-info p {
  margin: 0;
  color: rgb(var(--text-secondary));
  font-size: 14px;
}

.header-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.close-drawer-btn {
  margin-left: auto;
  color: rgb(var(--text-secondary));
}

.close-drawer-btn:hover {
  color: rgb(var(--text-primary));
}

.filter-controls {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.reset-section,
.refresh-section {
  display: flex;
  align-items: center;
}

.time-filter-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 320px;
}

.quick-range-group {
  flex-shrink: 0;
}

.custom-range-selects {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.time-select {
  width: 130px;
}

.device-actions {
  display: flex;
  gap: 10px;
}

.detail-logs-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 详细日志卡片样式 - 类似故障码页面 */
.detail-logs-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-logs-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px; /* 底部 padding 减少到 4px */
}

.detail-logs-card-header {
  padding: 0;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgb(var(--border-secondary));
}

.detail-logs-header {
  flex-shrink: 0;
  margin-bottom: 20px;
}

.detail-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

/* 表格容器 - 固定表头，可滚动 */
.detail-table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-table-container :deep(.el-table) {
  flex: 1;
}

.detail-table-container :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
}

/* 分页容器 - 固定在底部 */
.detail-pagination-wrapper {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 0 12px 0; /* 上8px， 下12px */
  margin-top: auto;
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
}

.detail-status-tabs:deep(.el-tabs__nav-wrap) {
  justify-content: flex-start;
}

.time-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0;
  gap: 50px;
}

.detail-header h4 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.detail-actions {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.detail-actions .batch-section {
  flex: 1 1 auto;
  min-width: 240px;
}

.detail-actions .reset-section,
.detail-actions .refresh-section {
  flex: 0 0 auto;
}

/* Upload Dialog Actions - 上传弹窗按钮样式 */
.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  padding: 16px 0;
}

.detail-actions .batch-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: #f0f9ff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.batch-actions .btn-primary,
.batch-actions .btn-secondary {
  font-size: 12px;
  padding: 6px 10px;
  min-height: 28px;
}

/* 响应式布局 */
@media (max-width: 1024px) {
  .header-actions {
    gap: 15px;
  }
  
  .batch-actions {
    gap: 8px;
  }
  
  .batch-actions .btn-primary,
  .batch-actions .btn-secondary,
  .batch-actions .btn-tertiary,
  .batch-actions .btn-ghost,
  .batch-actions .btn-danger,
  .batch-actions .btn-success,
  .batch-actions .btn-text {
    font-size: 11px;
    padding: 5px 8px;
  }
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }
  
  .header-actions {
    flex-direction: column;
    gap: 15px;
  }
  
  .search-section {
    margin-left: 0;
    justify-content: flex-start;
  }
  
  .batch-actions {
    justify-content: flex-start;
  }
  
  .batch-actions .btn-primary,
  .batch-actions .btn-secondary,
  .batch-actions .btn-tertiary,
  .batch-actions .btn-ghost,
  .batch-actions .btn-danger,
  .batch-actions .btn-success,
  .batch-actions .btn-text {
    flex: 1;
    min-width: 120px;
  }
}

@media (max-width: 480px) {
  .batch-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .batch-actions .btn-primary,
  .batch-actions .btn-secondary,
  .batch-actions .btn-tertiary,
  .batch-actions .btn-ghost,
  .batch-actions .btn-danger,
  .batch-actions .btn-success,
  .batch-actions .btn-text {
    width: 100%;
  }
  
  .search-section {
    flex-direction: column;
    gap: 10px;
  }
  
  .search-section .search-input {
    width: 100% !important;
  }
}

</style> 
