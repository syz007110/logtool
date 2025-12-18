<template>
  <div class="error-codes-container">
    <!-- 搜索和操作栏 -->
    <div class="action-bar">
      <div class="search-section">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('errorCodes.searchPlaceholder')"
          style="width: 180px"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-select
          v-model="selectedSubsystem"
          :placeholder="$t('errorCodes.selectSubsystem')"
          style="width: 180px; margin-left: 10px"
          clearable
          @change="handleSubsystemFilter"
        >
          <el-option
            v-for="subsystem in subsystemOptions"
            :key="subsystem.value"
            :label="subsystem.label"
            :value="subsystem.value"
          />
        </el-select>
      </div>
      
      <div class="action-section">
        <button 
          class="btn-primary"
          @click="openQueryDialog"
          aria-label="$t('errorCodes.queryCode')"
        >
          <i class="fas fa-search"></i>
          {{ $t('errorCodes.queryCode') }}
        </button>
        
        <button 
          v-if="canCreate"
          class="btn-secondary"
          @click="handleAdd"
          aria-label="$t('errorCodes.addErrorCode')"
        >
          <i class="fas fa-plus"></i>
          {{ $t('errorCodes.addErrorCode') }}
        </button>

        <button
          v-if="$store.getters['auth/hasPermission']('error_code:export')"
          class="btn-secondary"
          :class="{ 'btn-loading': exportLoading }"
          :disabled="exportLoading"
          @click="openExportDialog"
          aria-label="$t('errorCodes.exportCSV')"
        >
          <i class="fas fa-file-export"></i>
          {{ $t('errorCodes.exportCSV') }}
        </button>
      </div>
    </div>
    
    <!-- 故障码列表 -->
    <el-card class="list-card">
      <el-table
        :data="errorCodes"
        :loading="loading"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="subsystem" :label="$t('errorCodes.subsystem')" width="100" />
        <el-table-column prop="code" :label="$t('errorCodes.code')" width="100" />
        <el-table-column :label="$t('i18nErrorCodes.userHint')" min-width="200">
          <template #default="{ row }">
            <div class="min-w-0">
              <ExplanationCell :text="[row.user_hint, row.operation].filter(Boolean).join(', ')" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="param1" :label="$t('errorCodes.formLabels.param1')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param1 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param1 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="param2" :label="$t('errorCodes.formLabels.param2')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param2 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param2 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="param3" :label="$t('errorCodes.formLabels.param3')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param3 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param3 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="param4" :label="$t('errorCodes.formLabels.param4')" width="120">
          <template #default="{ row }">
            <span class="one-line-ellipsis" :title="String(row.param4 ?? '')" style="display:inline-block; max-width:100%">{{ String(row.param4 ?? '') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="220" align="center" v-if="canUpdate || canDelete">
          <template #default="{ row }">
            <div class="btn-group" style="justify-content: center;">
              <button
                class="btn-text btn-sm"
                @click="handleEdit(row)"
                v-if="canUpdate"
                :aria-label="$t('shared.edit')"
                :title="$t('shared.edit')"
              >
                {{ $t('shared.edit') }}
              </button>
              <el-dropdown
                trigger="click"
                placement="bottom-end"
                @command="(command) => handleOperationCommand(row, command)"
              >
                <button class="btn-text btn-sm">
                  <i class="fas fa-ellipsis-h"></i>
              </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="canUpdate" command="tech-edit">
                      {{ $t('errorCodes.techSolutionDrawer.title') }}
                    </el-dropdown-item>
                    <el-dropdown-item v-if="canDelete" command="delete">
                      {{ $t('shared.delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    
    <!-- 导出CSV 弹窗 -->
    <el-dialog
      v-model="showExportDialog"
      :title="$t('errorCodes.exportCSVDialogTitle')"
      width="680px"
      :close-on-click-modal="false"
    >
      <el-form label-width="140px">
        <el-form-item :label="$t('errorCodes.exportFormat')">
          <el-radio-group v-model="exportFormat">
            <el-radio label="csv">{{ $t('errorCodes.csvFormat') }}</el-radio>
            <el-radio label="tsv">{{ $t('errorCodes.tsvFormat') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="$t('errorCodes.exportLanguage')">
          <el-select
            v-model="selectedExportLang"
            :placeholder="$t('errorCodes.selectLanguage')"
            style="width: 100%"
            clearable
          >
            <el-option
              v-for="opt in languageOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <div style="margin-top: 8px; font-size: 12px; color: #909399;">
            {{ $t('errorCodes.exportLanguageHint') }}
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showExportDialog = false">{{ $t('shared.cancel') }}</button>
          <button class="btn-primary" :class="{ 'btn-loading': exportLoading }" :disabled="exportLoading" @click="handleExportCSV">{{ $t('shared.export') }}</button>
        </span>
      </template>
    </el-dialog>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="showAddDialog"
      width="1000px"
      :close-on-click-modal="false"
    >
      <template #title>
        <div style="display: flex; align-items: center; gap: 15px; width: 100%;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 14px; color: #606266;">{{ $t('errorCodes.i18nTechFields.selectLanguage') }}:</span>
            <el-select 
              v-model="selectedI18nLang" 
              :placeholder="$t('errorCodes.i18nTechFields.selectLanguage')"
              style="width: 150px;"
              size="small"
              @change="handleLanguageChange"
            >
              <el-option 
                :label="$t('errorCodes.i18nTechFields.defaultLanguage')" 
                value="zh-CN" 
              />
              <el-option
                v-for="lang in i18nLanguageOptions"
                :key="lang.value"
                :label="lang.label"
                :value="lang.value"
              />
            </el-select>
            <el-button 
              type="primary" 
              size="small"
              :loading="translating"
              :disabled="!selectedI18nLang || selectedI18nLang === 'zh-CN'"
              @click="handleAutoTranslate"
            >
              {{ $t('errorCodes.i18nTechFields.autoTranslate') }}
            </el-button>
          </div>
        </div>
      </template>
      <el-form
        ref="errorCodeFormRef"
        :model="errorCodeForm"
        :rules="rules"
        label-width="140px"
        class="error-code-form"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.subsystem')" prop="subsystem">
              <el-select v-model="errorCodeForm.subsystem" :placeholder="$t('errorCodes.selectSubsystem')" @change="handleSubsystemChange">
                <el-option v-for="option in subsystemOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.code')" prop="code">
              <el-input 
                v-model="errorCodeForm.code" 
                :placeholder="$t('errorCodes.formLabels.codePlaceholder')" 
                @input="handleCodeChange"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 同步选项 -->
        <el-row v-if="showSyncOption">
          <el-col :span="24">
            <el-form-item :label="$t('errorCodes.formLabels.syncOption')">
              <el-checkbox v-model="syncToRemote" v-if="isLocalSubsystem">
                {{ $t('errorCodes.formLabels.syncToRemote') }} ({{ getRemoteSubsystemLabel() }})
              </el-checkbox>
              <el-checkbox v-model="syncToLocal" v-if="isRemoteSubsystem">
                {{ $t('errorCodes.formLabels.syncToLocal') }} ({{ getLocalSubsystemLabel() }})
              </el-checkbox>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item :label="$t('errorCodes.formLabels.optionSettings')">
          <el-checkbox-group v-model="booleanOptions" @change="handleBooleanOptionsChange" class="boolean-options-group">
            <el-checkbox label="is_axis_error">{{ $t('errorCodes.checkboxLabels.isAxisError') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="is_arm_error">{{ $t('errorCodes.checkboxLabels.isArmError') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="for_expert">{{ $t('errorCodes.checkboxLabels.forExpert') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="for_novice">{{ $t('errorCodes.checkboxLabels.forNovice') }}</el-checkbox>
            <span class="checkbox-divider"></span>
            <el-checkbox label="related_log">{{ $t('errorCodes.checkboxLabels.relatedLog') }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <!-- UI显示字段（根据选择的语言动态显示） -->
        <el-form-item :label="$t('errorCodes.formLabels.shortMessage')" prop="short_message">
          <el-input 
            v-model="currentForm.short_message" 
            type="textarea" 
            :rows="2"
            :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="$t('errorCodes.formLabels.userHint')" prop="user_hint">
          <el-input 
            v-model="currentForm.user_hint" 
            type="textarea" 
            :rows="2"
            :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="$t('errorCodes.formLabels.operation')" prop="operation">
          <el-input 
            v-model="currentForm.operation" 
            type="textarea" 
            :rows="2"
            :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
          />
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.category')" prop="category">
              <el-select v-model="currentForm.category" :placeholder="$t('errorCodes.validation.categoryRequired')">
                <el-option 
                  v-for="option in categoryOptions" 
                  :key="option.value" 
                  :label="option.label" 
                  :value="option.value" 
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.level')" prop="level">
              <el-input 
                :value="getLevelDisplay(currentForm.level)" 
                readonly 
                :placeholder="$t('errorCodes.formLabels.levelPlaceholder')" 
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.analysisCategories')" prop="analysisCategories">
              <el-select 
                v-model="errorCodeForm.analysisCategories" 
                multiple 
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="3"
                popper-class="analysis-categories-tooltip"
                :placeholder="$t('errorCodes.formLabels.analysisCategoriesPlaceholder')"
                style="width: 100%"
              >
                <el-option 
                  v-for="cat in analysisCategoryOptions" 
                  :key="cat.id" 
                  :label="cat.displayName" 
                  :value="cat.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.solution')" prop="solution">
              <el-input 
                :value="getSolutionDisplay(currentForm.solution)" 
                readonly 
                :placeholder="$t('errorCodes.formLabels.solutionPlaceholder')" 
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 技术说明字段：根据选择的语言动态显示 -->
        <el-form-item :label="$t('errorCodes.formLabels.detail')" prop="detail">
          <el-input 
            v-model="currentForm.detail" 
            type="textarea" 
            :rows="3"
            :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="$t('errorCodes.formLabels.method')" prop="method">
          <el-input 
            v-model="currentForm.method" 
            type="textarea" 
            :rows="3"
            :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
          />
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param1')" prop="param1">
              <el-input 
                v-model="currentForm.param1"
                :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param2')" prop="param2">
              <el-input 
                v-model="currentForm.param2"
                :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param3')" prop="param3">
              <el-input 
                v-model="currentForm.param3"
                :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('errorCodes.formLabels.param4')" prop="param4">
              <el-input 
                v-model="currentForm.param4"
                :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item :label="$t('errorCodes.formLabels.techSolution')" prop="tech_solution">
          <el-input 
            v-model="currentForm.tech_solution" 
            type="textarea" 
            :rows="3"
            :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="$t('errorCodes.formLabels.explanation')" prop="explanation">
          <el-input 
            v-model="currentForm.explanation" 
            type="textarea" 
            :rows="3"
            :placeholder="selectedI18nLang === 'zh-CN' ? '' : $t('errorCodes.i18nTechFields.translatePlaceholder')"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showAddDialog = false">{{ $t('errorCodes.buttonTexts.cancel') }}</button>
          <button class="btn-primary" :class="{ 'btn-loading': saving }" :disabled="saving" @click="handleSave">
            {{ getSaveButtonText() }}
          </button>
        </span>
      </template>
    </el-dialog>
    <!-- 故障码查询弹窗 -->
    <el-dialog
      v-model="showQueryDialog"
      :title="$t('errorCodes.queryCode')"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="queryForm" label-width="140px">
        <el-form-item :label="$t('errorCodes.fullCode')">
          <el-input 
            v-model="queryForm.fullCode" 
            :placeholder="$t('errorCodes.fullCodePlaceholder')" 
            clearable
          />
        </el-form-item>
        <el-form-item v-if="needSubsystemSelect" :label="$t('errorCodes.subsystem')">
          <el-select
            v-model="queryForm.subsystem"
            :placeholder="$t('errorCodes.selectSubsystem')"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="opt in subsystemOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <div class="query-buttons">
            <button type="button" class="btn-primary" :class="{ 'btn-loading': queryLoading }" :disabled="queryLoading" @click="handleQuery">{{ $t('shared.search') }}</button>
            <button type="button" class="btn-secondary" @click="resetQuery">{{ $t('shared.reset') }}</button>
          </div>
        </el-form-item>
      </el-form>

      <el-card v-if="queryResult" class="mt-2">
        <el-tabs v-model="queryResultActiveTab" class="query-result-tabs">
          <!-- 标签页1：基础信息 -->
          <el-tab-pane :label="$t('errorCodes.queryResult.basicInfo')" name="basic">
            <div class="basic-info-content">
              <div class="basic-info-section">
                <div class="basic-info-label">{{ $t('errorCodes.queryResult.explanation') }}</div>
                <div class="basic-info-value">{{ buildPrefixedExplanation(queryResult, foundRecord) }}</div>
              </div>
              
              <div class="basic-info-section">
                <div class="basic-info-label">{{ $t('errorCodes.queryResult.paramMeanings') }}</div>
                <div class="basic-info-params">
                  <div v-if="foundRecord?.param1" class="basic-info-param-item">
                    <span class="param-label">{{ $t('errorCodes.formLabels.param1') }}：</span>
                    <span class="param-value">{{ foundRecord.param1 }}</span>
                  </div>
                  <div v-if="foundRecord?.param2" class="basic-info-param-item">
                    <span class="param-label">{{ $t('errorCodes.formLabels.param2') }}：</span>
                    <span class="param-value">{{ foundRecord.param2 }}</span>
                  </div>
                  <div v-if="foundRecord?.param3" class="basic-info-param-item">
                    <span class="param-label">{{ $t('errorCodes.formLabels.param3') }}：</span>
                    <span class="param-value">{{ foundRecord.param3 }}</span>
                  </div>
                  <div v-if="foundRecord?.param4" class="basic-info-param-item">
                    <span class="param-label">{{ $t('errorCodes.formLabels.param4') }}：</span>
                    <span class="param-value">{{ foundRecord.param4 }}</span>
                  </div>
                  <div v-if="!foundRecord?.param1 && !foundRecord?.param2 && !foundRecord?.param3 && !foundRecord?.param4" class="basic-info-param-item">
                    <span class="param-value">-</span>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 标签页2：更多信息 -->
          <el-tab-pane :label="$t('errorCodes.queryResult.moreInfo')" name="more">
            <div class="basic-info-content">
              <div v-if="foundRecord?.detail" class="basic-info-section">
                <div class="basic-info-label">{{ $t('errorCodes.queryResult.detail') }}</div>
                <div class="basic-info-value">{{ foundRecord.detail }}</div>
              </div>
              
              <div v-if="foundRecord?.method" class="basic-info-section">
                <div class="basic-info-label">{{ $t('errorCodes.queryResult.method') }}</div>
                <div class="basic-info-value">{{ foundRecord.method }}</div>
              </div>
              
              <div v-if="foundRecord?.category" class="basic-info-section">
                <div class="basic-info-label">{{ $t('errorCodes.queryResult.category') }}</div>
                <div class="basic-info-value">{{ getCategoryDisplayText(foundRecord.category) }}</div>
              </div>
              
              <div v-if="!foundRecord?.detail && !foundRecord?.method && !foundRecord?.category" class="basic-info-section">
                <div class="basic-info-value">-</div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 标签页3：技术排查方案 -->
          <el-tab-pane :label="$t('errorCodes.queryResult.techSolution')" name="tech" v-loading="queryTechLoading">
            <div class="basic-info-content">
              <div v-if="foundRecord?.tech_solution" class="basic-info-section">
                <div class="basic-info-label">{{ $t('errorCodes.queryResult.techSolution') }}</div>
                <pre class="tech-solution-text">{{ foundRecord.tech_solution }}</pre>
              </div>
              <div v-else class="basic-info-section">
                <div class="basic-info-value">-</div>
              </div>
              
              <!-- 技术排查方案附件 -->
              <div v-if="queryTechAttachments.length > 0" class="basic-info-section">
                <div class="basic-info-label">{{ $t('errorCodes.techSolutionDrawer.attachmentTitle') }}</div>
                
                <!-- 图片附件 -->
                <div v-if="queryImageList.length > 0" class="basic-info-attachments">
                  <div class="basic-info-label attachment-sub-label">{{ $t('errorCodes.queryResult.imageAttachments') }}</div>
                  <div class="query-attachment-images">
                    <div 
                      v-for="img in queryImageList" 
                      :key="img.uid"
                      class="query-image-thumbnail"
                      @click="handleQueryImagePreview(img)"
                      :title="img.original_name || img.filename"
                    >
                      <img :src="img.url" :alt="img.original_name || img.filename" />
                      <div class="image-overlay">
                        <i class="fas fa-search-plus"></i>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 文件附件 -->
                <div v-if="queryOtherFileList.length > 0" class="basic-info-attachments">
                  <div class="basic-info-label attachment-sub-label">{{ $t('errorCodes.queryResult.fileAttachments') }}</div>
                  <div class="query-file-list">
                    <div 
                      v-for="file in queryOtherFileList" 
                      :key="file.uid"
                      class="query-file-item"
                    >
                      <i class="fas fa-paperclip query-file-icon"></i>
                      <div class="query-file-meta">
                        <span class="query-file-name" :title="file.original_name || file.filename">
                          {{ file.original_name || file.filename }}
                        </span>
                        <span class="query-file-size">{{ formatSize(file.size_bytes) }}</span>
                      </div>
                      <button 
                        class="btn-text btn-sm" 
                        @click.stop="handleQueryFileDownload(file)"
                      >
                        <i class="fas fa-download"></i>
                        下载
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div v-else-if="!queryTechLoading" class="basic-info-section">
                <div class="query-no-attachments">
                  <el-empty :description="$t('errorCodes.queryResult.noAttachments')" :image-size="80" />
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <template #footer>
        <span class="dialog-footer">
          <button class="btn-secondary" @click="showQueryDialog = false">{{ $t('shared.cancel') }}</button>
        </span>
      </template>
    </el-dialog>

    <!-- 技术排查方案全高抽屉 -->
    <el-drawer
      v-model="showTechDrawer"
      direction="rtl"
      size="70%"
      :destroy-on-close="true"
      class="tech-solution-drawer"
      :show-close="false"
      @close="handleDrawerClose"
    >
      <template #title>
        <div class="tech-drawer-header">
          <div>
            <div class="tech-drawer-title">{{ $t('errorCodes.techSolutionDrawer.title') }}</div>
            <div class="tech-drawer-subtitle">
              <span v-if="techTarget">
                {{ techTarget.code }} / {{ techTarget.subsystem }}
              </span>
            </div>
          </div>
          <div class="tech-drawer-actions">
            <button class="btn-secondary" @click="closeTechDrawer">{{ $t('shared.cancel') }}</button>
            <button class="btn-primary" :class="{ 'btn-loading': techSaving }" :disabled="techSaving" @click="saveTechSolution">
              {{ $t('shared.save') }}
            </button>
          </div>
        </div>
      </template>

      <div class="tech-drawer-body" v-loading="techDrawerLoading">
        <el-form label-position="top" label-width="0" class="tech-form compact-form">
          <el-form-item class="tech-input-item">
            <el-input
              v-model="techForm.tech_solution"
              type="textarea"
              :rows="6"
              placeholder="请输入技术排查方案"
            />
          </el-form-item>
          <div class="tech-section-title">
            {{ $t('errorCodes.techSolutionDrawer.attachmentTitle') }}
            <span class="tech-section-hint">{{ $t('errorCodes.techSolutionDrawer.attachmentHint') }}</span>
          </div>
          <el-form-item class="tech-upload-item">
            <el-upload
              class="tech-upload"
              list-type="picture-card"
              :file-list="techImageFileList"
              :limit="5"
              :auto-upload="true"
              :on-remove="handleTechRemove"
              :on-preview="handleTechPreview"
              :on-exceed="handleTechExceed"
              :http-request="handleTechUpload"
              :before-upload="beforeTechUpload"
            >
              <i class="fas fa-plus"></i>
            </el-upload>
            <div class="tech-file-list" v-if="techOtherFileList.length">
              <div class="tech-file-item" v-for="file in techOtherFileList" :key="file.uid" @click="handleOpenFile(file)">
                <div class="tech-file-left">
                  <i class="fas fa-paperclip tech-file-icon"></i>
                  <div class="tech-file-meta">
                    <div class="tech-file-name" :title="file.name">{{ file.name }}</div>
                    <div class="tech-file-size">{{ formatSize(file.size_bytes) }}</div>
                  </div>
                </div>
                <div class="tech-file-actions">
                  <button type="button" class="btn-text" @click.stop="handleOpenFile(file)">下载</button>
                  <button type="button" class="btn-text-danger" @click.stop="handleRemoveByUrl(file.url)">删除</button>
                </div>
              </div>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </el-drawer>

    <el-dialog v-model="techPreviewVisible" width="60%" :close-on-click-modal="true">
      <img :src="techPreviewUrl" alt="preview" style="width: 100%;" />
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, watch, onBeforeUnmount, h, resolveComponent } from 'vue'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../api'
import prefixKeyMap from '../config/prefixKeyMap.json'
import categoryKeyMap from '../config/categoryKeyMap.json'

export default {
  name: 'ErrorCodes',
  components: {
    Search,
    Plus,
    ExplanationCell: {
      name: 'ExplanationCell',
      props: { 
        text: { type: String, default: '' },
        always: { type: Boolean, default: false }
      },
      setup(props) {
        const containerRef = ref(null)
        const needsTooltip = ref(false)
        let resizeObserver = null

        const measure = () => {
          const el = containerRef.value
          if (!el) return
          needsTooltip.value = (el.scrollWidth - el.clientWidth) > 1
        }

        const handleMouseEnter = () => {
          measure()
        }

        onMounted(() => {
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
          disabled: ((props.text ?? '') === '') || (!props.always && !needsTooltip.value)
        }, {
          default: () => h('span', {
            ref: containerRef,
            class: 'explanation-ellipsis',
            style: 'display:inline-block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
            onMouseenter: handleMouseEnter
          }, props.text)
        })
      }
    }
  },
  setup() {
    const store = useStore()
    const { t, locale, messages } = useI18n()
    
    // 响应式数据
    const loading = ref(false)
    const exportLoading = ref(false)
    const showExportDialog = ref(false)
    const saving = ref(false)
    const showAddDialog = ref(false)
    const showQueryDialog = ref(false)
    const showTechDrawer = ref(false)
    const techDrawerLoading = ref(false)
    const techSaving = ref(false)
    const techTarget = ref(null)
    const techPreviewVisible = ref(false)
    const techPreviewUrl = ref('')
    const techForm = reactive({
      tech_solution: '',
      images: []
    })
    const editingErrorCode = ref(null)
    const searchQuery = ref('')
    const selectedSubsystem = ref('')
    const currentPage = ref(1)
    const pageSize = ref(10)
    const errorCodeFormRef = ref(null)
    const queryLoading = ref(false)
    const queryForm = reactive({ fullCode: '', subsystem: '' })
    // 是否需要显示子系统下拉：短码（010A/0X010A）一律显示
    const needSubsystemSelect = computed(() => {
      const full = (queryForm.fullCode || '').trim().toUpperCase()
      if (!full) return false
      const isShortCode = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(full)
      return isShortCode
    })

    const queryResult = ref(null)
    const foundRecord = ref(null)
    const queryTechAttachments = ref([])
    const queryTechLoading = ref(false)
    const queryResultActiveTab = ref('basic')
    const analysisCategories = ref([])
    const booleanOptions = ref([])
    const selectedExportLang = ref('')
    const exportFormat = ref('csv')
    
    // 多语言编辑相关数据
    const selectedI18nLang = ref('zh-CN') // 默认中文
    const i18nForm = reactive({
      short_message: '',
      user_hint: '',
      operation: '',
      detail: '',
      method: '',
      param1: '',
      param2: '',
      param3: '',
      param4: '',
      tech_solution: '',
      explanation: ''
      // 注意：solution, level, category 不在 i18nForm 中
      // 这些字段的值是固定的枚举值，只存储在 errorCodeForm 中，通过前端 i18n 翻译显示
    })
    
    // 根据选择的语言返回对应的表单对象（使用 getter/setter 支持双向绑定）
    const currentForm = computed({
      get() {
        if (selectedI18nLang.value === 'zh-CN') {
          return errorCodeForm
        } else {
          // 非中文语言：返回一个代理对象，读取时从 i18nForm 获取，写入时写入 i18nForm
          // 保留非多语言字段（如 subsystem, code 等）从 errorCodeForm 获取
          return new Proxy(errorCodeForm, {
            get(target, prop) {
              // solution, level, category 始终从 errorCodeForm 获取（不在 i18n_error_codes 表中）
              if (['solution', 'level', 'category'].includes(prop)) {
                return target[prop]
              }
              // 多语言字段从 i18nForm 获取
              if (['short_message', 'user_hint', 'operation', 'detail', 'method', 
                   'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation'].includes(prop)) {
                return i18nForm[prop] || ''
              }
              // 其他字段从 errorCodeForm 获取
              return target[prop]
            },
            set(target, prop, value) {
              // solution, level, category 始终写入 errorCodeForm（不在 i18n_error_codes 表中）
              if (['solution', 'level', 'category'].includes(prop)) {
                target[prop] = value
                return true
              }
              // 多语言字段写入 i18nForm
              if (['short_message', 'user_hint', 'operation', 'detail', 'method', 
                   'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation'].includes(prop)) {
                i18nForm[prop] = value
                return true
              }
              // 其他字段写入 errorCodeForm
              target[prop] = value
              return true
            }
          })
        }
      },
      set() {
        // 计算属性通常不需要 setter，但为了完整性保留
      }
    })
    const translating = ref(false)
    const savingI18n = ref(false)
    const i18nLanguageOptions = ref([])
    
    // 计算当前语言
    const currentLocale = computed(() => locale.value || 'zh-CN')
    
    // 根据当前语言获取分析分类的显示名称
    const getCategoryDisplayName = (cat) => {
      if (!cat) return ''
      return currentLocale.value === 'zh-CN' ? (cat.name_zh || cat.name_en) : (cat.name_en || cat.name_zh)
    }
    
    // 计算属性：生成带有多语言名称的分析分类选项
    const analysisCategoryOptions = computed(() => {
      return analysisCategories.value.map(cat => ({
        ...cat,
        displayName: getCategoryDisplayName(cat)
      }))
    })
    const languageOptions = [
      { label: t('shared.languageOptions.zh'), value: 'zh' },
      { label: t('shared.languageOptions.en'), value: 'en' },
      { label: t('shared.languageOptions.fr'), value: 'fr' },
      { label: t('shared.languageOptions.de'), value: 'de' },
      { label: t('shared.languageOptions.es'), value: 'es' },
      { label: t('shared.languageOptions.it'), value: 'it' },
      { label: t('shared.languageOptions.pt'), value: 'pt' },
      { label: t('shared.languageOptions.nl'), value: 'nl' },
      { label: t('shared.languageOptions.sk'), value: 'sk' },
      { label: t('shared.languageOptions.ro'), value: 'ro' },
      { label: t('shared.languageOptions.da'), value: 'da' }
    ]
    
    const subsystemOptions = computed(() => [
      { label: t('shared.subsystemOptions.1'), value: '1' },
      { label: t('shared.subsystemOptions.2'), value: '2' },
      { label: t('shared.subsystemOptions.3'), value: '3' },
      { label: t('shared.subsystemOptions.4'), value: '4' },
      { label: t('shared.subsystemOptions.5'), value: '5' },
      { label: t('shared.subsystemOptions.6'), value: '6' },
      { label: t('shared.subsystemOptions.7'), value: '7' },
      { label: t('shared.subsystemOptions.8'), value: '8' },
      { label: t('shared.subsystemOptions.9'), value: '9' },
      { label: t('shared.subsystemOptions.A'), value: 'A' }
    ])
    
    // 故障分类选项（根据系统语言显示翻译）
    const categoryOptions = computed(() => [
      { label: t('errorCodes.categoryOptions.software'), value: 'software' },
      { label: t('errorCodes.categoryOptions.hardware'), value: 'hardware' },
      { label: t('errorCodes.categoryOptions.logRecord'), value: 'logRecord' },
      { label: t('errorCodes.categoryOptions.operationTip'), value: 'operationTip' },
      { label: t('errorCodes.categoryOptions.safetyProtection'), value: 'safetyProtection' }
    ])
    
    // 通用的转换函数：将数据库中的值（可能是任何语言的翻译）转换为英文键值
    // 支持语言扩展：通过遍历所有语言的翻译来匹配，不硬编码
    const convertValueToKey = (value, translationPath, validKeys) => {
      if (!value) return ''
      
      // 如果已经是英文键值，直接返回
      if (validKeys.includes(value)) {
        return value
      }
      
      // 遍历所有已加载的语言，查找匹配的键值
      // messages 是响应式对象，包含所有语言的翻译
      const allLocales = Object.keys(messages.value || {})
      for (const localeKey of allLocales) {
        const localeMessages = messages.value[localeKey]
        // 支持嵌套路径，如 'errorCodes.categoryOptions' 或 'errorCodes.levelTypes'
        const pathParts = translationPath.split('.')
        let target = localeMessages
        for (const part of pathParts) {
          if (target && target[part]) {
            target = target[part]
          } else {
            target = null
            break
          }
        }
        
        if (target) {
          // 遍历所有键值，检查翻译是否匹配
          for (const key of validKeys) {
            if (target[key] === value) {
              return key
            }
          }
        }
      }
      
      // 如果找不到匹配，返回原值
      return value
    }
    
    // 将数据库中的分类值（可能是任何语言的翻译）转换为英文键值
    const convertCategoryToKey = (categoryValue) => {
      if (!categoryValue) return ''
      // 优先使用直接映射（因为数据库必定写入中文）
      if (categoryKeyMap[categoryValue]) {
        return categoryKeyMap[categoryValue]
      }
      // 如果直接映射失败，使用通用转换函数（支持其他语言）
      return convertValueToKey(
        categoryValue,
        'errorCodes.categoryOptions',
        ['software', 'hardware', 'logRecord', 'operationTip', 'safetyProtection']
      )
    }
    
    // 将数据库中的等级值（可能是任何语言的翻译）转换为英文键值
    const convertLevelToKey = (levelValue) => {
      return convertValueToKey(
        levelValue,
        'errorCodes.levelTypes',
        ['high', 'medium', 'low', 'none']
      )
    }
    
    // 将数据库中的处理措施值（可能是任何语言的翻译）转换为英文键值
    const convertSolutionToKey = (solutionValue) => {
      return convertValueToKey(
        solutionValue,
        'errorCodes.solutionTypes',
        ['recoverable', 'unrecoverable', 'ignorable', 'tips', 'log']
      )
    }
    
    // 同步相关变量
    const syncToRemote = ref(false)
    const syncToLocal = ref(false)
    
         const errorCodeForm = reactive({
       subsystem: '',
       code: '',
       is_axis_error: false,
       is_arm_error: false,
      short_message: '',
      user_hint: '',
      operation: '',
       detail: '',
       method: '',
       param1: '',
       param2: '',
       param3: '',
       param4: '',
       solution: '',
       for_expert: true,
       for_novice: true,
       related_log: false,
       stop_report: '',
       level: '',
       tech_solution: '',
       explanation: '',
      category: '',
      analysisCategories: []
     })
    
    // 动态验证规则
    const rules = computed(() => {
      const baseRules = {
        subsystem: [
          { required: true, message: t('errorCodes.validation.subsystemRequired'), trigger: 'change' }
        ],
        code: [
          { required: true, message: t('errorCodes.validation.codeRequired'), trigger: 'blur' },
          { pattern: /^0X[0-9A-F]{3}[ABCDE]$/, message: t('errorCodes.validation.codeFormat'), trigger: 'blur' }
        ],
        detail: [
          { required: true, message: t('errorCodes.validation.detailRequired'), trigger: 'blur' }
        ],
        method: [
          { required: true, message: t('errorCodes.validation.methodRequired'), trigger: 'blur' }
        ],
        param1: [
          { required: true, message: t('errorCodes.validation.param1Required'), trigger: 'blur' }
        ],
        param2: [
          { required: true, message: t('errorCodes.validation.param2Required'), trigger: 'blur' }
        ],
        param3: [
          { required: true, message: t('errorCodes.validation.param3Required'), trigger: 'blur' }
        ],
        param4: [
          { required: true, message: t('errorCodes.validation.param4Required'), trigger: 'blur' }
        ],
        category: [
          { required: true, message: t('errorCodes.validation.categoryRequired'), trigger: 'change' }
        ]
      };

      // 动态验证中文字段
      const hasOperation = errorCodeForm.operation && errorCodeForm.operation.trim() !== '';
      
      baseRules.short_message = [
        { 
          required: !hasOperation, 
          message: t('errorCodes.validation.shortMessageCannotBothEmpty'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.user_hint = [
        { 
          required: !hasOperation, 
          message: t('errorCodes.validation.userHintCannotBothEmpty'), 
          trigger: 'blur' 
        }
      ];
      
      baseRules.operation = [
        { 
          required: !(errorCodeForm.short_message && errorCodeForm.short_message.trim() !== '') && 
                    !(errorCodeForm.user_hint && errorCodeForm.user_hint.trim() !== ''), 
          message: t('errorCodes.validation.atLeastTwoRequired'), 
          trigger: 'blur' 
        }
      ];


      return baseRules;
    });
    
    // 根据故障码自动判断故障等级和处理措施
    // 返回英文键值，存储到数据库，显示时通过 getLevelDisplay 和 getSolutionDisplay 函数翻译
    const analyzeErrorCode = (code) => {
      if (!code) return { level: 'none', solution: 'tips' };
      
      // 解析故障码：0X + 3位16进制数字 + A/B/C/D/E
      const match = code.match(/^0X([0-9A-F]{3})([ABCDE])$/);
      if (!match) return { level: 'none', solution: 'tips' };
      
      const [, hexPart, severity] = match;
      
      // 根据故障码末尾字母判断等级（返回英文键值）
      let levelKey = 'none';
      switch (severity) {
        case 'A': // A类故障：高级
          levelKey = 'high';
          break;
        case 'B': // B类故障：中级
          levelKey = 'medium';
          break;
        case 'C': // C类故障：低级
          levelKey = 'low';
          break;
        default: // D、E类故障：无
          levelKey = 'none';
          break;
      }
      
      // 根据故障码末尾字母判断处理措施（返回英文键值）
      let solution = 'tips';
      switch (severity) {
        case 'A': // A类故障：recoverable 可恢复故障
          solution = 'recoverable';
          break;
        case 'B': // B类故障：recoverable 可恢复故障
          solution = 'recoverable';
          break;
        case 'C': // C类故障：ignorable 可忽略故障
          solution = 'ignorable';
          break;
        case 'D': // D类故障：tips 提示信息
          solution = 'tips';
          break;
        case 'E': // E类故障：log 日志记录
          solution = 'log';
          break;
      }
      
      // 返回英文键值，显示时通过 getLevelDisplay 和 getSolutionDisplay 函数翻译
      return { level: levelKey, solution };
    };
    
    // 故障码输入时自动计算等级和处理措施
    const handleCodeChange = () => {
      const { level, solution } = analyzeErrorCode(errorCodeForm.code);
      // analyzeErrorCode 返回的是英文键值，直接存储
      errorCodeForm.level = level;
      errorCodeForm.solution = solution;
    };
    
    // 获取处理措施的多语言显示
    const getSolutionDisplay = (solution) => {
      const solutionMap = {
        'recoverable': t('errorCodes.solutionTypes.recoverable'),
        'unrecoverable': t('errorCodes.solutionTypes.unrecoverable'),
        'ignorable': t('errorCodes.solutionTypes.ignorable'),
        'tips': t('errorCodes.solutionTypes.tips'),
        'log': t('errorCodes.solutionTypes.log')
      };
      return solutionMap[solution] || solution;
    };
    
    // 获取故障等级的多语言显示
    const getLevelDisplay = (level) => {
      const levelMap = {
        'high': t('errorCodes.levelTypes.high'),
        'medium': t('errorCodes.levelTypes.medium'),
        'low': t('errorCodes.levelTypes.low'),
        'none': t('errorCodes.levelTypes.none')
      };
      return levelMap[level] || level;
    };
    
    // 计算属性
    const errorCodes = computed(() => store.getters['errorCodes/errorCodesList'])
    const total = computed(() => store.getters['errorCodes/totalCount'])
    const canCreate = computed(() => store.getters['auth/hasPermission']('error_code:create'))
    const canUpdate = computed(() => store.getters['auth/hasPermission']('error_code:update'))
    const canDelete = computed(() => store.getters['auth/hasPermission']('error_code:delete'))
    
    // 同步相关计算属性
    const showSyncOption = computed(() => {
      const subsystem = errorCodeForm.subsystem
      return subsystem === '1' || subsystem === '8' || 
             subsystem === '3' || subsystem === '9' || 
             subsystem === '5' || subsystem === 'A'
    })
    
    const isLocalSubsystem = computed(() => {
      const subsystem = errorCodeForm.subsystem
      return subsystem === '1' || subsystem === '3' || subsystem === '5'
    })
    
    const isRemoteSubsystem = computed(() => {
      const subsystem = errorCodeForm.subsystem
      return subsystem === '8' || subsystem === '9' || subsystem === 'A'
    })
    
    const techImageFileList = computed(() => techForm.images
      .filter((img) => (img.mime_type || '').startsWith('image/') || img.file_type === 'image')
      .map((img, idx) => ({
        name: img.original_name || img.filename || `image-${idx + 1}`,
        url: img.url,
        status: 'success',
        uid: `img-${idx}-${img.url || idx}`,
        mime_type: img.mime_type || '',
        type: img.mime_type || 'image/*',
        size_bytes: img.size_bytes
      }))
    )

    const techOtherFileList = computed(() => techForm.images
      .filter((img) => {
        const mime = img.mime_type || ''
        return !(mime.startsWith('image/') || img.file_type === 'image')
      })
      .map((img, idx) => ({
        name: img.original_name || img.filename || `file-${idx + 1}`,
        url: img.url,
        status: 'success',
        uid: `file-${idx}-${img.url || idx}`,
        mime_type: img.mime_type || '',
        size_bytes: img.size_bytes
      }))
    )
    
    // 查询结果中的附件列表（图片）
    const queryImageList = computed(() => {
      return queryTechAttachments.value
        .filter((img) => {
          const mime = img.mime_type || ''
          return mime.startsWith('image/') || img.file_type === 'image'
        })
        .map((img, idx) => ({
          ...img,
          uid: `query-img-${idx}-${img.url || idx}`
        }))
    })
    
    // 查询结果中的附件列表（其他文件）
    const queryOtherFileList = computed(() => {
      return queryTechAttachments.value
        .filter((img) => {
          const mime = img.mime_type || ''
          return !(mime.startsWith('image/') || img.file_type === 'image')
        })
        .map((img, idx) => ({
          ...img,
          uid: `query-file-${idx}-${img.url || idx}`
        }))
    })
    
    
    
    // 加载分析分类
    const loadAnalysisCategories = async () => {
      try {
        const response = await api.analysisCategories.getList({
          is_active: true
        })
        if (response.data.success) {
          analysisCategories.value = response.data.categories || []
          // 设置默认的"未分类"选项
          setDefaultNullCategory()
        }
      } catch (error) {
        console.error('Failed to load analysis categories:', error)
        ElMessage.error(t('errorCodes.message.loadAnalysisCategoriesFailed'))
      }
    }
    
    // 设置默认的"未分类"选项
    const setDefaultNullCategory = () => {
      // 查找"未分类"（Null）分类
      const nullCategory = analysisCategories.value.find(cat => 
        cat.category_key === 'Null' || cat.name_zh === t('errorCodes.defaultCategoryName')
      )
      
      // 如果找到且当前表单的分析分类为空，则设置为默认值
      if (nullCategory && (!errorCodeForm.analysisCategories || errorCodeForm.analysisCategories.length === 0)) {
        errorCodeForm.analysisCategories = [nullCategory.id]
      }
    }
    
    // 处理布尔选项变化
    const handleBooleanOptionsChange = (values) => {
      // 根据checkbox的选中状态更新表单值
      errorCodeForm.is_axis_error = values.includes('is_axis_error')
      errorCodeForm.is_arm_error = values.includes('is_arm_error')
      errorCodeForm.for_expert = values.includes('for_expert')
      errorCodeForm.for_novice = values.includes('for_novice')
      errorCodeForm.related_log = values.includes('related_log')
    }
    
    // 从表单值初始化布尔选项
    const initBooleanOptions = () => {
      const options = []
      if (errorCodeForm.is_axis_error) options.push('is_axis_error')
      if (errorCodeForm.is_arm_error) options.push('is_arm_error')
      if (errorCodeForm.for_expert) options.push('for_expert')
      if (errorCodeForm.for_novice) options.push('for_novice')
      if (errorCodeForm.related_log) options.push('related_log')
      booleanOptions.value = options
    }
    
    // 方法
    const loadErrorCodes = async () => {
      try {
        loading.value = true
        await store.dispatch('errorCodes/fetchErrorCodes', {
          page: currentPage.value,
          limit: pageSize.value,
          keyword: searchQuery.value,
          subsystem: selectedSubsystem.value
        })
      } catch (error) {
        ElMessage.error(t('errorCodes.message.loadFailed'))
      } finally {
        loading.value = false
      }
    }
    
    const handleSearch = () => {
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleSubsystemFilter = () => {
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleSizeChange = (size) => {
      pageSize.value = size
      currentPage.value = 1
      loadErrorCodes()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      loadErrorCodes()
    }

    const resetTechForm = () => {
      techForm.tech_solution = ''
      techForm.images = []
      techTarget.value = null
    }

    const closeTechDrawer = () => {
      showTechDrawer.value = false
    }

    watch(showTechDrawer, (visible) => {
      if (!visible) {
        cleanupTempAttachments()
        resetTechForm()
        techDrawerLoading.value = false
        techSaving.value = false
      }
    })

    const handleOperationCommand = (row, command) => {
      if (command === 'tech-edit') {
        openTechDrawer(row)
      } else if (command === 'delete') {
        handleDelete(row)
      }
    }

    const openTechDrawer = async (row) => {
      techTarget.value = row
      showTechDrawer.value = true
      techDrawerLoading.value = true
      try {
        const resp = await api.errorCodes.getTechSolution(row.id)
        const data = resp.data || {}
        techForm.tech_solution = data.tech_solution || ''
        techForm.images = Array.isArray(data.images)
          ? data.images.map((img, idx) => ({
              ...img,
              sort_order: Number.isFinite(img.sort_order) ? img.sort_order : idx
            }))
          : []
      } catch (err) {
        console.error('加载技术方案失败:', err)
        ElMessage.error(t('shared.operationFailed'))
      } finally {
        techDrawerLoading.value = false
      }
    }

    const beforeTechUpload = (file) => {
      if (techForm.images.length >= 5) {
        ElMessage.warning('最多上传5个附件')
        return false
      }
      return true
    }

    const handleTechUpload = async (option) => {
      try {
        const formData = new FormData()
        formData.append('files', option.file)
        const resp = await api.errorCodes.uploadTechImages(formData)
        const uploaded = resp.data?.files?.[0]
        if (uploaded) {
          techForm.images.push({ ...uploaded, sort_order: techForm.images.length })
          option?.onSuccess && option.onSuccess(resp.data)
        } else {
          throw new Error('上传失败')
        }
      } catch (err) {
        console.error('上传技术方案附件失败', err)
        option?.onError && option.onError(err)
        ElMessage.error(err?.response?.data?.message || t('shared.operationFailed'))
      }
    }

    const cleanupTempAttachments = async () => {
      const tmpUrls = techForm.images
        .filter((img) => img.url && img.url.includes('/tmp/'))
        .map((img) => img.url)
      if (!tmpUrls.length) return
      try {
        await api.errorCodes.cleanupTempFiles(tmpUrls)
      } catch (e) {
        // 静默处理清理失败，避免影响关闭
        console.warn('cleanup temp files failed', e)
      }
    }

    const handleDrawerClose = () => {
      cleanupTempAttachments()
      resetTechForm()
      techDrawerLoading.value = false
      techSaving.value = false
    }

    const handleTechRemove = (file) => {
      const targetUrl = file.url || file.response?.files?.[0]?.url
      techForm.images = techForm.images.filter((img) => img.url !== targetUrl)
    }

    const handleTechPreview = (file) => {
      const mime = file.mime_type || file.type || file.raw?.type || ''
      if (mime.startsWith('image/')) {
        techPreviewUrl.value = file.url
        techPreviewVisible.value = true
      } else if (file.url) {
        window.open(file.url, '_blank')
      }
    }

    const handleOpenFile = (file) => {
      if (file?.url) {
        window.open(file.url, '_blank')
      }
    }

    const handleRemoveByUrl = (url) => {
      techForm.images = techForm.images.filter((img) => img.url !== url)
    }

    const formatSize = (bytes) => {
      if (!bytes && bytes !== 0) return ''
      const kb = bytes / 1024
      if (kb < 1024) return `${kb.toFixed(1)} KB`
      const mb = kb / 1024
      return `${mb.toFixed(1)} MB`
    }

    const handleTechExceed = () => {
      ElMessage.warning('最多上传5个附件')
    }

    const saveTechSolution = async () => {
      if (!techTarget.value) return
      try {
        techSaving.value = true
        const payload = {
          tech_solution: techForm.tech_solution,
          images: techForm.images.map((img, idx) => ({
            ...img,
            sort_order: idx
          }))
        }
        await api.errorCodes.updateTechSolution(techTarget.value.id, payload)
        ElMessage.success(t('shared.updated'))
        showTechDrawer.value = false
        await loadErrorCodes()
      } catch (err) {
        console.error('保存技术方案失败', err)
        ElMessage.error(err?.response?.data?.message || t('shared.operationFailed'))
      } finally {
        techSaving.value = false
      }
    }

    const parseFilename = (contentDisposition) => {
      try {
        if (!contentDisposition) return ''
        const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/)
        const raw = decodeURIComponent(match?.[1] || match?.[2] || '')
        return raw || ''
      } catch { return '' }
    }

    const openExportDialog = () => {
      showExportDialog.value = true
    }

    const handleExportCSV = async () => {
      try {
        exportLoading.value = true
        const language = selectedExportLang.value || ''
        const resp = await api.errorCodes.exportCSV(language, exportFormat.value)
        const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const serverName = parseFilename(resp.headers?.['content-disposition'])
        a.download = serverName || 'error_codes.csv'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        ElMessage.success(t('errorCodes.message.exportSuccess'))
        showExportDialog.value = false
      } catch (e) {
        ElMessage.error(e?.response?.data?.message || t('errorCodes.message.exportFailed'))
      } finally {
        exportLoading.value = false
      }
    }
    
         const resetForm = () => {
       Object.keys(errorCodeForm).forEach(key => {
         if (typeof errorCodeForm[key] === 'boolean') {
           // 专家模式和初学者模式默认为true，其他布尔值默认为false
           if (key === 'for_expert' || key === 'for_novice') {
             errorCodeForm[key] = true
           } else {
             errorCodeForm[key] = false
           }
        } else if (key === 'analysisCategories') {
          errorCodeForm[key] = []
         } else {
           errorCodeForm[key] = ''
         }
       })
       editingErrorCode.value = null
       // 重置同步选项
       syncToRemote.value = false
       syncToLocal.value = false
       if (errorCodeFormRef.value) {
         errorCodeFormRef.value.clearValidate()
       }
     }
    
    const handleAdd = async () => {
      resetForm()
      initBooleanOptions()
      setDefaultNullCategory()
      
      // 加载多语言选项列表
      await loadI18nLanguages()
      
      // 根据系统语言自动设置默认语言
      const systemLang = locale.value || 'zh-CN'
      if (systemLang !== 'zh' && systemLang !== 'zh-CN') {
        // 查找匹配的语言选项
        const matchedLang = i18nLanguageOptions.value.find(lang => 
          lang.value === systemLang || 
          lang.value === systemLang.split('-')[0] // 支持 'en-US' -> 'en'
        )
        if (matchedLang) {
          selectedI18nLang.value = matchedLang.value
        } else {
          // 如果没有匹配，默认选择英文
          selectedI18nLang.value = i18nLanguageOptions.value.find(lang => lang.value === 'en')?.value || 'zh-CN'
        }
      } else {
        // 中文系统默认显示中文
        selectedI18nLang.value = 'zh-CN'
      }
      
      resetI18nForm()
      showAddDialog.value = true
    }
    const openQueryDialog = () => {
      showQueryDialog.value = true
    }
    
    const handleEdit = async (row) => {
      editingErrorCode.value = row
      
      Object.keys(errorCodeForm).forEach(key => {
        if (key === 'analysisCategories') {
          // 从关联的分析分类中提取 ID 数组
          errorCodeForm[key] = row.analysisCategories?.map(cat => cat.id) || []
        } else if (key === 'category') {
          // 将数据库中的分类值（可能是任何语言的翻译）转换为英文键值
          // 以便正确匹配 categoryOptions（value 是英文键值）
          errorCodeForm[key] = convertCategoryToKey(row[key])
        } else if (key === 'level') {
          // 将数据库中的等级值（可能是任何语言的翻译）转换为英文键值
          // 以便 getLevelDisplay 函数能根据系统语言正确显示翻译
          errorCodeForm[key] = convertLevelToKey(row[key])
        } else if (key === 'solution') {
          // 将数据库中的处理措施值（可能是任何语言的翻译）转换为英文键值
          // 以便 getSolutionDisplay 函数能根据系统语言正确显示翻译
          errorCodeForm[key] = convertSolutionToKey(row[key])
        } else if (row[key] !== undefined) {
          errorCodeForm[key] = row[key]
        }
      })
      // 重置同步选项
      syncToRemote.value = false
      syncToLocal.value = false
      // 初始化布尔选项
      initBooleanOptions()
      
      // 加载多语言选项列表
      await loadI18nLanguages()
      
      // 根据系统语言自动设置默认语言
      const systemLang = locale.value || 'zh-CN'
      if (systemLang !== 'zh' && systemLang !== 'zh-CN') {
        // 查找匹配的语言选项
        const matchedLang = i18nLanguageOptions.value.find(lang => 
          lang.value === systemLang || 
          lang.value === systemLang.split('-')[0] // 支持 'en-US' -> 'en'
        )
        if (matchedLang) {
          selectedI18nLang.value = matchedLang.value
          // 加载该语言的多语言内容
          await handleLanguageChange(matchedLang.value)
        } else {
          // 如果没有匹配，默认选择英文
          selectedI18nLang.value = i18nLanguageOptions.value.find(lang => lang.value === 'en')?.value || 'zh-CN'
          if (selectedI18nLang.value !== 'zh-CN') {
            await handleLanguageChange(selectedI18nLang.value)
          }
        }
      } else {
        // 中文系统默认显示中文
        selectedI18nLang.value = 'zh-CN'
      }
      
      showAddDialog.value = true
    }
    
    // 加载多语言语言选项
    const loadI18nLanguages = async () => {
      try {
        const response = await api.i18nErrorCodes.getLanguages()
        if (response.data && response.data.languages) {
          // 过滤掉中文，只显示其他语言
          i18nLanguageOptions.value = response.data.languages.filter(lang => lang.value !== 'zh' && lang.value !== 'zh-CN')
        }
      } catch (error) {
        console.error('Failed to load i18n languages:', error)
        // 如果加载失败，使用默认语言列表
        i18nLanguageOptions.value = languageOptions.filter(lang => lang.value !== 'zh')
      }
    }
    
    // 获取语言标签
    const getLanguageLabel = (langCode) => {
      const lang = i18nLanguageOptions.value.find(l => l.value === langCode)
      return lang ? lang.label : langCode
    }
    
    // 重置多语言表单
    const resetI18nForm = () => {
      Object.keys(i18nForm).forEach(key => {
        i18nForm[key] = ''
      })
    }
    
    // 语言切换处理
    const handleLanguageChange = async (lang) => {
      if (!lang) {
        return
      }
      
      // 如果切换到中文，直接使用 errorCodeForm，不需要加载
      if (lang === 'zh-CN') {
        return
      }
      
      // 如果是新增模式，直接重置表单（等待用户保存故障码基本信息后再加载）
      if (!editingErrorCode.value) {
        resetI18nForm()
        return
      }
      
      try {
        // 加载该语言的多语言内容（包括 UI 字段和技术字段）
        const response = await api.errorCodes.getI18nByLang(editingErrorCode.value.id, lang)
        if (response.data && response.data.i18nContent) {
          const content = response.data.i18nContent
          // UI 字段
          i18nForm.short_message = content.short_message || ''
          i18nForm.user_hint = content.user_hint || ''
          i18nForm.operation = content.operation || ''
          // 技术字段
          i18nForm.detail = content.detail || ''
          i18nForm.method = content.method || ''
          i18nForm.param1 = content.param1 || ''
          i18nForm.param2 = content.param2 || ''
          i18nForm.param3 = content.param3 || ''
          i18nForm.param4 = content.param4 || ''
          i18nForm.tech_solution = content.tech_solution || ''
          i18nForm.explanation = content.explanation || ''
          // 注意：solution, level, category 不在 i18n_error_codes 表中，不加载
        } else {
          resetI18nForm()
        }
      } catch (error) {
        console.error('Failed to load i18n content:', error)
        ElMessage.error(t('errorCodes.i18nTechFields.loadFailed'))
        resetI18nForm()
      }
    }
    
    // 自动翻译（默认只翻译空白字段，保护人工修改）
    const handleAutoTranslate = async () => {
      if (!selectedI18nLang.value) {
        return
      }
      
      // 新增模式下，需要有故障码ID才能翻译
      if (!editingErrorCode.value) {
        ElMessage.warning('请先保存故障码基本信息，再进行自动翻译')
        return
      }
      
      try {
        translating.value = true
        
        // 检查是否有非空白字段（需要用户确认是否覆盖）
        // 注意：solution, level, category 不在 i18n_error_codes 表中，不参与自动翻译检查
        const fieldsToCheck = [
          // UI 显示字段
          'short_message',
          'user_hint',
          'operation',
          // 技术说明字段
          'detail',
          'method',
          'param1',
          'param2',
          'param3',
          'param4',
          'tech_solution',
          'explanation'
        ]
        const nonEmptyFields = fieldsToCheck.filter(field => {
          const value = i18nForm[field]
          return value && value.trim() !== ''
        })
        
        // 如果有非空白字段，询问用户是否覆盖
        let overwrite = false
        if (nonEmptyFields.length > 0) {
          try {
            await ElMessageBox.confirm(
              t('errorCodes.i18nTechFields.overwriteConfirm'),
              t('errorCodes.i18nTechFields.overwriteTitle'),
              {
                confirmButtonText: t('shared.confirm'),
                cancelButtonText: t('shared.cancel'),
                type: 'warning'
              }
            )
            overwrite = true
          } catch {
            // 用户取消
            return
          }
        }
        
        // 调用自动翻译API（后端默认只翻译空白字段，除非 overwrite=true）
        const response = await api.errorCodes.autoTranslateI18n(
          editingErrorCode.value.id,
          selectedI18nLang.value,
          overwrite
        )
        
        if (response.data && response.data.translatedFields) {
          // 只更新被翻译的字段（避免覆盖用户手动输入的内容）
          Object.keys(response.data.translatedFields).forEach(key => {
            if (response.data.translatedFields[key] !== undefined && response.data.translatedFields[key] !== null) {
              // 如果 overwrite=false，只更新空白字段
              if (!overwrite && i18nForm[key] && i18nForm[key].trim() !== '') {
                // 跳过已有内容的字段
                return
              }
              i18nForm[key] = response.data.translatedFields[key]
            }
          })
          ElMessage.success(t('errorCodes.i18nTechFields.translateSuccess'))
        } else {
          // 如果没有返回翻译结果，显示失败提示
          ElMessage.error(t('errorCodes.i18nTechFields.translateFailed'))
        }
      } catch (error) {
        console.error('Auto translate failed:', error)
        // 显示错误信息，优先使用后端返回的中文错误信息
        const errorMessage = error.response?.data?.message || t('errorCodes.i18nTechFields.translateFailed')
        ElMessage.error(errorMessage)
      } finally {
        translating.value = false
      }
    }
    
    // 保存多语言内容
    const handleSaveI18n = async () => {
      if (!selectedI18nLang.value) {
        return
      }
      
      // 新增模式下，需要有故障码ID才能保存
      if (!editingErrorCode.value) {
        ElMessage.warning('请先保存故障码基本信息，再保存多语言内容')
        return
      }
      
      try {
        savingI18n.value = true
        
        await api.errorCodes.saveI18nByLang(
          editingErrorCode.value.id,
          selectedI18nLang.value,
          i18nForm
        )
        
        ElMessage.success(t('errorCodes.i18nTechFields.saveSuccess'))
      } catch (error) {
        console.error('Save i18n failed:', error)
        ElMessage.error(t('errorCodes.i18nTechFields.saveFailed'))
      } finally {
        savingI18n.value = false
      }
    }
    
    const handleDelete = async (row) => {
      try {
        await ElMessageBox.confirm(
          t('errorCodes.message.deleteConfirm', { code: row.code }),
          t('shared.messages.deleteConfirmTitle'),
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        
        await store.dispatch('errorCodes/deleteErrorCode', row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadErrorCodes()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error(t('shared.messages.deleteFailed'))
        }
      }
    }
    
    // 获取弹窗标题
    const getDialogTitle = () => {
      if (!editingErrorCode.value) {
        // 添加模式
        if (isLocalSubsystem.value) {
          return t('errorCodes.dialogTitles.createLocal')
        } else if (isRemoteSubsystem.value) {
          return t('errorCodes.dialogTitles.createRemote')
        } else {
          return t('errorCodes.dialogTitles.createGeneral')
        }
      } else {
        // 编辑模式
        if (isLocalSubsystem.value) {
          return t('errorCodes.dialogTitles.updateLocal')
        } else if (isRemoteSubsystem.value) {
          return t('errorCodes.dialogTitles.updateRemote')
        } else {
          return t('errorCodes.dialogTitles.updateGeneral')
        }
      }
    }
    // 归一化故障码：支持 141010A / 1010A / 0X010A
    const normalizeFullCode = (input) => {
      if (!input) return ''
      const raw = String(input).trim().toUpperCase()
      if (raw.length >= 5) {
        const tail4 = raw.slice(-4)
        if (/^[0-9A-F]{3}[A-E]$/.test(tail4)) {
          return '0X' + tail4
        }
      }
      if (!raw.startsWith('0X') && /^[0-9A-F]{3}[A-E]$/.test(raw)) {
        return '0X' + raw
      }
      return raw
    }
    const handleQuery = async () => {
      const full = queryForm.fullCode?.trim()
      if (!full) {
        ElMessage.warning(t('errorCodes.message.queryWarning'))
        return
      }
      const upper = full.toUpperCase()
      const startsWithSubsystem = /^[1-9A]/.test(upper)
      const isFull = /^[1-9A][0-9A-F]{5}[A-E]$/.test(upper)
      const isShort = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(upper)
      // 短码优先：用户可能已通过下拉选择了子系统，不应触发长度校验
      if (isShort) {
        const shortSubsystem = (queryForm.subsystem || '').toUpperCase()
        if (!shortSubsystem) {
          ElMessage.info(t('errorCodes.selectSubsystem'))
          return
        }
        // 后续查询逻辑在下面统一执行
      } else {
        // 先判断“像完整码但长度不对”的情况，例如 12010A（少一位）
        if (startsWithSubsystem && !isFull) {
          ElMessage.warning(t('errorCodes.validation.lengthNotEnough'))
          return
        }
        // 既不是完整码，也不是故障类型短码
        if (!isFull) {
          ElMessage.warning(t('errorCodes.validation.codeFormat'))
          return
        }
      }
      queryLoading.value = true
      queryResult.value = null
      foundRecord.value = null
      queryTechAttachments.value = []
      try {
        const payload = { code: upper }
        const previewResp = await api.explanations.preview(payload)
        queryResult.value = previewResp.data
        let subsystem = queryForm.subsystem || queryResult.value?.subsystem || null
        if (!subsystem && isFull) {
          const s = upper.charAt(0)
          if (/^[1-9A]$/.test(s)) subsystem = s
        }
        // 若输入的是短码（010A/0X010A）必须有下拉选择的子系统
        if (isShort && !subsystem) {
          ElMessage.info(t('errorCodes.selectSubsystem'))
          queryLoading.value = false
          return
        }
        const codeOnly = normalizeFullCode(upper)
        if (subsystem) {
          try {
            const recResp = await api.errorCodes.getByCodeAndSubsystem(codeOnly, subsystem)
            foundRecord.value = recResp?.data?.errorCode || null
            // 如果查询到记录，加载技术排查方案附件
            if (foundRecord.value?.id) {
              await loadQueryTechAttachments(foundRecord.value.id)
            } else {
              queryTechAttachments.value = []
            }
          } catch (_) {
            foundRecord.value = null
            queryTechAttachments.value = []
          }
        } else {
          queryTechAttachments.value = []
        }
      } catch (e) {
        // 404错误已经在API拦截器中处理，这里只处理其他错误
        if (e?.response?.status !== 404) {
          ElMessage.error(e?.response?.data?.message || t('errorCodes.message.queryFailed'))
        }
      } finally {
        queryLoading.value = false
      }
    }
    const resetQuery = () => {
      queryForm.fullCode = ''
      queryForm.subsystem = ''
      queryResult.value = null
      foundRecord.value = null
      queryTechAttachments.value = []
    }
    
    // 加载查询结果的技术排查方案附件
    const loadQueryTechAttachments = async (errorCodeId) => {
      if (!errorCodeId) {
        queryTechAttachments.value = []
        return
      }
      try {
        queryTechLoading.value = true
        const resp = await api.errorCodes.getTechSolution(errorCodeId)
        const data = resp.data || {}
        const images = Array.isArray(data.images) ? data.images : []
        console.log('[查询附件] 加载附件数据:', { errorCodeId, imagesCount: images.length, data })
        queryTechAttachments.value = images.map((img, idx) => ({
          ...img,
          uid: img.uid || `query-attachment-${idx}-${img.url || idx}`,
          sort_order: Number.isFinite(img.sort_order) ? img.sort_order : idx
        }))
        console.log('[查询附件] 处理后的附件列表:', queryTechAttachments.value)
      } catch (err) {
        console.error('[查询附件] 加载失败:', err)
        // 静默失败，不影响查询结果展示
        queryTechAttachments.value = []
      } finally {
        queryTechLoading.value = false
      }
    }
    
    // 查询结果中的图片预览
    const handleQueryImagePreview = (img) => {
      if (img?.url) {
        techPreviewUrl.value = img.url
        techPreviewVisible.value = true
      }
    }
    
    // 查询结果中的文件下载
    const handleQueryFileDownload = (file) => {
      if (!file?.url) return
      
      // 检测是否为PDF文件
      const isPdf = file.mime_type === 'application/pdf' || 
                    file.file_type === 'pdf' ||
                    (file.original_name || file.filename || '').toLowerCase().endsWith('.pdf')
      
      if (isPdf) {
        // PDF文件：强制下载，不预览
        const fileName = file.original_name || file.filename || 'download.pdf'
        const link = document.createElement('a')
        link.href = file.url
        link.download = fileName
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        // 其他文件：在新标签页中打开（可能会预览）
        window.open(file.url, '_blank')
      }
    }

    // 将中文前缀转换为英文键名（使用配置文件中的映射）
    const getPrefixKey = (chinesePrefix) => {
      return prefixKeyMap[chinesePrefix] || chinesePrefix
    }
    
    // 翻译前缀文本（根据系统语言）
    const translatePrefix = (prefix) => {
      if (!prefix) return ''
      // 尝试直接翻译整个前缀（先转换为英文键名）
      const prefixKey = getPrefixKey(prefix)
      const directTranslation = t(`shared.prefixLabels.${prefixKey}`)
      if (directTranslation && directTranslation !== `shared.prefixLabels.${prefixKey}`) {
        return directTranslation
      }
      // 如果直接翻译失败，尝试分段翻译（处理复合前缀，如 "远程端 左主控制臂"）
      const parts = prefix.split(/\s+/)
      const translatedParts = parts.map(part => {
        const partKey = getPrefixKey(part)
        const translated = t(`shared.prefixLabels.${partKey}`)
        return (translated && translated !== `shared.prefixLabels.${partKey}`) ? translated : part
      })
      return translatedParts.join(' ')
    }
    
    // 构造与释义相同前缀的"解释"文本：前缀 + 用户提示/操作信息
    const buildPrefixedExplanation = (preview, record) => {
      if (!preview) return '-'
      const backendPrefix = preview?.prefix || ''
      const main = [record?.user_hint, record?.operation].filter(Boolean).join(' ')
      const text = main || '-'
      if (backendPrefix) {
        // 翻译前缀
        const translatedPrefix = translatePrefix(backendPrefix)
        return `${translatedPrefix} ${text}`
      }
      return text
    }
    
    // 获取分类的显示名称（根据系统语言翻译）
    const getCategoryDisplayText = (categoryValue) => {
      if (!categoryValue) return '-'
      // 先将中文值转换为英文 key（因为数据库可能存储中文值）
      const categoryKey = convertCategoryToKey(categoryValue)
      // 使用 i18n 翻译分类选项
      return t(`errorCodes.categoryOptions.${categoryKey}`) || categoryKey || categoryValue
    }
    
    // 获取远程子系统标签
    const getRemoteSubsystemLabel = () => {
      return t(`errorCodes.remoteSubsystemLabels.${errorCodeForm.subsystem}`) || ''
    }
    
    // 获取本地子系统标签
    const getLocalSubsystemLabel = () => {
      return t(`errorCodes.localSubsystemLabels.${errorCodeForm.subsystem}`) || ''
    }
    
    // 获取保存按钮文本
    const getSaveButtonText = () => {
      return editingErrorCode.value ? t('errorCodes.buttonTexts.update') : t('errorCodes.buttonTexts.create')
    }
    
    // 处理子系统变化
    const handleSubsystemChange = () => {
      // 重置同步选项
      syncToRemote.value = false
      syncToLocal.value = false
    }
    
    // 获取对应的子系统值
    const getCorrespondingSubsystem = (currentSubsystem) => {
      const subsystemMap = {
        '1': '8', // 本地运动控制 -> 远程运动控制
        '8': '1', // 远程运动控制 -> 本地运动控制
        '3': '9', // 本地医生控制台 -> 远程医生控制台
        '9': '3', // 远程医生控制台 -> 本地医生控制台
        '5': 'A', // 本地驱动器 -> 远程驱动器
        'A': '5'  // 远程驱动器 -> 本地驱动器
      }
      return subsystemMap[currentSubsystem]
    }
    
    const handleSave = async () => {
      try {
        await errorCodeFormRef.value.validate()
        saving.value = true
        
        const savePromises = []
        let errorCodeId = editingErrorCode.value?.id
        
        // 主故障码保存（始终保存中文内容到 error_codes 表）
        if (editingErrorCode.value) {
          savePromises.push(
            store.dispatch('errorCodes/updateErrorCode', {
              id: editingErrorCode.value.id,
              data: errorCodeForm
            })
          )
        } else {
          const createResult = await store.dispatch('errorCodes/createErrorCode', errorCodeForm)
          if (createResult.data && createResult.data.errorCode) {
            errorCodeId = createResult.data.errorCode.id
          }
        }
        
        // 如果当前选择的是非中文语言，保存多语言内容到 i18n_error_codes 表
        if (selectedI18nLang.value && selectedI18nLang.value !== 'zh-CN' && errorCodeId) {
          try {
            await api.errorCodes.saveI18nByLang(
              errorCodeId,
              selectedI18nLang.value,
              {
                // UI 字段
                short_message: i18nForm.short_message,
                user_hint: i18nForm.user_hint,
                operation: i18nForm.operation,
                // 技术字段
                detail: i18nForm.detail,
                method: i18nForm.method,
                param1: i18nForm.param1,
                param2: i18nForm.param2,
                param3: i18nForm.param3,
                param4: i18nForm.param4,
                tech_solution: i18nForm.tech_solution,
                explanation: i18nForm.explanation
                // 注意：solution, level, category 不在 i18n_error_codes 表中，不保存这些字段
              }
            )
          } catch (i18nError) {
            console.error('Save i18n failed:', i18nError)
            // 多语言保存失败不影响主表保存
          }
        }
        
        // 同步保存
        if (syncToRemote.value && isLocalSubsystem.value) {
          const remoteSubsystem = getCorrespondingSubsystem(errorCodeForm.subsystem)
          const remoteData = { ...errorCodeForm, subsystem: remoteSubsystem }
          
          if (editingErrorCode.value) {
            // 编辑模式：查找并更新对应的远程故障码
            savePromises.push(
              store.dispatch('errorCodes/updateErrorCodeByCode', {
                code: errorCodeForm.code,
                subsystem: remoteSubsystem,
                data: remoteData
              })
            )
          } else {
            // 添加模式：创建远程故障码
            savePromises.push(
              store.dispatch('errorCodes/createErrorCode', remoteData)
            )
          }
        }
        
        if (syncToLocal.value && isRemoteSubsystem.value) {
          const localSubsystem = getCorrespondingSubsystem(errorCodeForm.subsystem)
          const localData = { ...errorCodeForm, subsystem: localSubsystem }
          
          if (editingErrorCode.value) {
            // 编辑模式：查找并更新对应的本地故障码
            savePromises.push(
              store.dispatch('errorCodes/updateErrorCodeByCode', {
                code: errorCodeForm.code,
                subsystem: localSubsystem,
                data: localData
              })
            )
          } else {
            // 添加模式：创建本地故障码
            savePromises.push(
              store.dispatch('errorCodes/createErrorCode', localData)
            )
          }
        }
        
        if (savePromises.length > 0) {
          await Promise.all(savePromises)
        }
        
        // 如果是新增模式，保存后需要更新 editingErrorCode，以便后续编辑
        if (!editingErrorCode.value && errorCodeId) {
          // 重新加载故障码列表，获取完整的故障码信息
          await loadErrorCodes()
          const newErrorCode = errorCodes.value.find(ec => ec.id === errorCodeId)
          if (newErrorCode) {
            editingErrorCode.value = newErrorCode
            // 如果已选择非中文语言，加载该语言的多语言内容
            if (selectedI18nLang.value && selectedI18nLang.value !== 'zh-CN') {
              await handleLanguageChange(selectedI18nLang.value)
            }
            const action = t('errorCodes.message.createSuccess')
            ElMessage.success(action)
            // 不关闭对话框，让用户可以继续编辑
            return
          }
        }
        
        const action = editingErrorCode.value ? t('errorCodes.message.updateSuccess') : t('errorCodes.message.createSuccess')
        ElMessage.success(action)
        
        showAddDialog.value = false
        resetForm()
        loadErrorCodes()
      } catch (error) {
        if (error.response && error.response.data && error.response.data.errors) {
          ElMessage.error(error.response.data.errors.join(', '))
        } else {
          ElMessage.error(t('errorCodes.message.saveFailed'))
        }
      } finally {
        saving.value = false
      }
    }
    
    // 监听字段变化，重新验证表单
    watch(
      [
        () => errorCodeForm.short_message,
        () => errorCodeForm.user_hint,
        () => errorCodeForm.operation
      ],
      () => {
        // 当相关字段变化时，重新验证表单
        if (errorCodeFormRef.value) {
          errorCodeFormRef.value.clearValidate([
            'short_message',
            'user_hint', 
            'operation'
          ])
        }
      }
    )
    
    // 生命周期
    onMounted(() => {
      loadErrorCodes()
      loadAnalysisCategories()
    })
    
    return {
       loading,
       saving,
       showAddDialog,
       showQueryDialog,
       showTechDrawer,
       techDrawerLoading,
       techSaving,
       techForm,
      techImageFileList,
      techOtherFileList,
       techPreviewVisible,
       techPreviewUrl,
       techTarget,
       editingErrorCode,
       searchQuery,
       selectedSubsystem,
       subsystemOptions,
       categoryOptions,
       currentPage,
       pageSize,
       errorCodeFormRef,
       queryLoading,
       queryForm,
       queryResult,
       foundRecord,
      needSubsystemSelect,
      queryTechAttachments,
      queryImageList,
      queryOtherFileList,
      queryResultActiveTab,
      handleQueryImagePreview,
      handleQueryFileDownload,
       errorCodeForm,
       rules,
       errorCodes,
       total,
       canCreate,
       canUpdate,
       canDelete,
       analysisCategories,
       analysisCategoryOptions,
       booleanOptions,
      exportLoading,
      showExportDialog,
      selectedExportLang,
      exportFormat,
      languageOptions,
      openExportDialog,
      handleExportCSV,
       // 同步相关变量
       syncToRemote,
       syncToLocal,
       showSyncOption,
       isLocalSubsystem,
       isRemoteSubsystem,
       // 多语言编辑相关变量
       selectedI18nLang,
       i18nForm,
       currentForm,
       translating,
       savingI18n,
       i18nLanguageOptions,
       handleSearch,
       handleSubsystemFilter,
       handleSizeChange,
       handleCurrentChange,
       handleAdd,
       openQueryDialog,
       handleEdit,
       handleDelete,
       handleOperationCommand,
       handleTechUpload,
       handleTechRemove,
       handleTechPreview,
       handleTechExceed,
       beforeTechUpload,
       saveTechSolution,
      cleanupTempAttachments,
      handleDrawerClose,
      handleOpenFile,
      handleRemoveByUrl,
      formatSize,
       closeTechDrawer,
       handleSave,
       handleCodeChange,
       getSolutionDisplay,
       getLevelDisplay,
       buildPrefixedExplanation,
       translatePrefix,
       getCategoryDisplayName,
       getCategoryDisplayText,
       convertCategoryToKey,
       convertLevelToKey,
       convertSolutionToKey,
       handleQuery,
       resetQuery,
       handleBooleanOptionsChange,
       // 同步相关方法
       getDialogTitle,
       getRemoteSubsystemLabel,
       getLocalSubsystemLabel,
       handleSubsystemChange,
       getSaveButtonText,
       // 多语言编辑相关方法
       handleLanguageChange,
       handleAutoTranslate,
       handleSaveI18n,
       getLanguageLabel
     }
  }
}
</script>

<style scoped>
.error-codes-container {
  padding: 5px;
}

.i18n-readonly-section {
  background-color: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}

.i18n-editable-section {
  background-color: #f0f9ff;
  padding: 15px;
  border-radius: 4px;
  border: 1px solid #b3d8ff;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.action-section {
  display: flex;
  gap: 10px;
}

.list-card {
  border-radius: 8px;
}

.tech-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tech-drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.tech-drawer-subtitle {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}

.tech-drawer-actions {
  display: flex;
  gap: 10px;
}

.tech-drawer-body {
  padding: 8px 5px 16px;
}

.tech-upload :deep(.el-upload--picture-card),
.tech-upload :deep(.el-upload-list__item) {
  width: 120px;
  height: 120px;
}

.tech-upload :deep(.el-upload-list__item-thumbnail) {
  object-fit: cover;
}

.tech-upload {
  display: block;
  width: 100%;
}

.tech-section-title {
  font-size: 13px;
  color: #606266;
  margin: 4px 0 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tech-section-hint {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
}

.compact-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.tech-input-item :deep(.el-textarea__inner) {
  min-height: 110px;
}

.tech-file-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  clear: both; /* 保证在图片卡片下一行开始 */
  width: 100%;
}

.tech-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #f9fafc;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.tech-file-item:hover {
  background: #f0f2f5;
  border-color: #dcdfe6;
}

.tech-file-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tech-file-icon {
  font-size: 14px;
  color: #606266;
}

.tech-file-meta {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tech-file-name {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.tech-file-size {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.tech-file-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.tech-file-item:hover .tech-file-actions {
  opacity: 1;
  pointer-events: auto;
}

.tech-file-actions .btn-text {
  padding: 0 6px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.error-code-form {
  max-height: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.query-buttons {
  display: flex;
  gap: 12px;
}

/* 避免弹窗出现横向滚动条，保留右侧安全间距 */
:deep(.el-dialog__body) {
  overflow-x: hidden;
}

/* 确保输入控件不会超出容器宽度 */
:deep(.error-code-form .el-input),
:deep(.error-code-form .el-textarea__inner),
:deep(.error-code-form .el-select),
:deep(.error-code-form .el-radio-group) {
  box-sizing: border-box;
  max-width: 100%;
}

/* 让提示信息列的 tooltip 在表格外也能显示，沿用批量分析样式 */
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
.explanation-tooltip.dark {
  background: rgba(0,0,0,0.85);
  color: #fff;
  border: none;
}

/* 布尔选项的checkbox样式 */
.boolean-options-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

:deep(.boolean-options-group .el-checkbox) {
  margin-right: 0;
}

/* checkbox之间的分割线 */
.checkbox-divider {
  display: inline-block;
  width: 1px;
  height: 16px;
  background-color: #dcdfe6;
  margin: 0 16px;
  vertical-align: middle;
}

/* 日志分析分类tooltip多行显示 */
.analysis-categories-tooltip {
  max-width: 500px !important;
}

.analysis-categories-tooltip .el-select__tags-text {
  display: inline-block;
  max-width: none !important;
}

.analysis-categories-tooltip .el-tooltip__popper {
  max-width: 500px !important;
}
</style>

<style>
/* 全局样式：分析分类tooltip */
.analysis-categories-tooltip.el-popper {
  max-width: 500px !important;
}

.analysis-categories-tooltip .el-tag {
  margin: 2px 4px !important;
}

/* 查询结果附件样式 */
.query-attachment-images {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.query-image-thumbnail {
  position: relative;
  width: 90px;
  height: 90px;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid #ebeef5;
  transition: border-color 0.2s;
}

.query-image-thumbnail:hover {
  border-color: #409eff;
}

.query-image-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.query-image-thumbnail .image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.query-image-thumbnail:hover .image-overlay {
  opacity: 1;
}

.query-image-thumbnail .image-overlay i {
  color: white;
  font-size: 20px;
}

.query-file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.query-file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.query-file-item:hover {
  background-color: #f5f7fa;
}

.query-file-icon {
  font-size: 14px;
  color: #606266;
  flex-shrink: 0;
}

.query-file-meta {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.query-file-name {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.query-file-size {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  flex-shrink: 0;
}

.query-file-item .btn-text {
  padding: 0 8px;
  flex-shrink: 0;
}

.query-result-tabs {
  margin-top: 0;
}

.query-result-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

.query-result-tabs :deep(.el-tabs__item) {
  font-size: 14px;
  padding: 0 20px;
}

.query-no-attachments {
  margin-top: 16px;
  padding: 20px;
  text-align: center;
}

/* 基础信息样式 */
.basic-info-content {
  padding: 8px 0;
}

.basic-info-section {
  margin-bottom: 20px;
}

.basic-info-section:last-child {
  margin-bottom: 0;
}

.basic-info-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}

.basic-info-value {
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
  word-wrap: break-word;
}

.basic-info-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.basic-info-param-item {
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
}

.basic-info-param-item .param-label {
  color: #606266;
  font-weight: 500;
}

.basic-info-param-item .param-value {
  color: #303133;
}

.basic-info-attachments {
  margin-top: 12px;
}

.basic-info-attachments .attachment-sub-label {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
  margin-top: 0;
}

.tech-solution-text {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: transparent;
  border: none;
}
</style>