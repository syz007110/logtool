<template>
  <div class="devices-container">
    <!-- 统一卡片：包含tabs、操作栏和列表 -->
    <el-card class="main-card">
      <el-tabs v-model="mainTab" class="main-tabs">
        <el-tab-pane :label="$t('devices.tabDevicesList')" name="devices">
          <!-- 操作栏 -->
          <div class="action-bar">
            <div class="search-section">
              <el-input v-model="search" :placeholder="$t('devices.searchPlaceholder')" style="width: 300px" clearable @input="handleSearch" />
              <el-select v-model="deviceSeriesFilterId" :placeholder="$t('devices.deviceSeries')" clearable style="width: 160px; margin-left: 8px;" @change="handleDeviceSeriesFilterChange">
                <el-option
                  v-for="item in deviceSeriesOptions"
                  :key="item.id"
                  :label="getSeriesDisplayName(item)"
                  :value="item.id"
                />
              </el-select>
              <el-select v-model="countryCode" :placeholder="$t('devices.country')" clearable filterable style="width: 140px; margin-left: 8px;" @change="onCountryChange">
                <el-option
                  v-for="item in countryOptions"
                  :key="item.country_code"
                  :label="getCountryOptionLabel(item)"
                  :value="item.country_code"
                />
              </el-select>
              <el-select
                v-model="regionCode"
                :placeholder="countryCode ? $t('devices.regionPlaceholder') : $t('devices.regionPlaceholderFirstCountry')"
                clearable
                filterable
                style="width: 180px; margin-left: 8px;"
                :disabled="!countryCode"
                @change="onRegionChange"
              >
                <el-option v-for="item in regionOptions" :key="item.region_code" :label="item.region_name || item.region_name_en || item.region_code" :value="item.region_code" />
              </el-select>
              <el-select
                v-model="hospitalId"
                filterable
                remote
                clearable
                reserve-keyword
                :remote-method="remoteSearchHospitalsForFilter"
                :placeholder="hospitalFilterPlaceholder"
                :disabled="!countryCode"
                :loading="hospitalFilterLoading"
                :no-data-text="hospitalFilterNoDataText"
                style="width: 220px; margin-left: 8px;"
                @change="handleSearch"
              >
                <el-option v-for="item in hospitalFilterOptions" :key="item.id" :label="formatHospitalDisplayName(item)" :value="item.id" />
              </el-select>
            </div>
            <div class="action-section" v-if="$store.getters['auth/hasPermission']('device:create')">
              <el-button type="primary" @click="openEdit()">{{ $t('devices.addDevice') }}</el-button>
            </div>
          </div>

          <!-- 设备列表 - 固定表头 -->
          <div class="table-container">
            <el-table :data="devices" :loading="loading" :height="tableHeight" style="width: 100%">
        <el-table-column prop="device_id" :label="$t('shared.deviceId')" min-width="120" />
        <el-table-column prop="device_model" :label="$t('devices.deviceModel')" min-width="110" />
        <el-table-column :label="$t('devices.deviceSeries')" min-width="140">
          <template #default="{ row }">{{ getSeriesDisplayName(row) || '-' }}</template>
        </el-table-column>
        <el-table-column prop="hospital_code" :label="$t('devices.hospitalCode')" min-width="130" />
        <el-table-column prop="hospital_name" :label="$t('devices.hospital')" min-width="160">
          <template #default="{ row }">
            <span v-if="row.hospital_name">{{ maskHospitalName(row.hospital_name, hasDeviceReadPermission) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="country_code" :label="$t('devices.country')" width="80" />
        <el-table-column :label="$t('devices.region')" min-width="100">
          <template #default="{ row }">{{ row.region_name || row.region_code || '-' }}</template>
        </el-table-column>
        <el-table-column :label="$t('shared.operation')" width="140" align="left" fixed="right" v-if="$store.getters['auth/hasPermission']('device:update') || $store.getters['auth/hasPermission']('device:delete')">
          <template #default="{ row }">
            <div class="operation-buttons">
              <el-button
                text
                size="small"
                @click="openEdit(row)"
                v-if="$store.getters['auth/hasPermission']('device:update')"
                :aria-label="$t('shared.edit')"
                :title="$t('shared.edit')"
              >
                {{ $t('shared.edit') }}
              </el-button>
              <el-button
                text
                size="small"
                class="btn-danger-text"
                @click="onDelete(row)"
                v-if="$store.getters['auth/hasPermission']('device:delete')"
                :aria-label="$t('shared.delete')"
                :title="$t('shared.delete')"
              >
                {{ $t('shared.delete') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
          </div>

          <!-- 分页 -->
          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="page"
              v-model:page-size="limit"
              :total="total"
              :page-sizes="[10,20,50,100]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleDeviceSizeChange"
              @current-change="handleDeviceCurrentChange"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane :label="$t('devices.tabModels')" name="models">
          <!-- 操作栏 -->
          <div class="action-bar">
            <div class="search-section">
              <el-input v-model="modelSearch" :placeholder="$t('devices.modelSearchPlaceholder')" style="width: 300px" clearable @input="handleModelSearch" />
              <el-select v-model="modelSeriesFilterId" :placeholder="$t('devices.deviceSeries')" clearable style="width: 160px; margin-left: 8px;" @change="handleModelSeriesFilterChange">
                <el-option
                  v-for="item in deviceSeriesOptions"
                  :key="item.id"
                  :label="getSeriesDisplayName(item)"
                  :value="item.id"
                />
              </el-select>
            </div>
            <div class="action-section" v-if="$store.getters['auth/hasPermission']('device:update')">
              <el-button type="primary" @click="openModelEdit()">{{ $t('devices.addModel') }}</el-button>
            </div>
          </div>

          <!-- 设备型号列表 - 固定表头 -->
          <div class="table-container">
            <el-table :data="deviceModels" :loading="modelsLoading" :height="tableHeight" style="width: 100%">
            <el-table-column prop="device_model" :label="$t('devices.deviceModel')" min-width="180">
              <template #default="{ row }">{{ row.device_model }}</template>
            </el-table-column>
            <el-table-column :label="$t('devices.deviceSeries')" min-width="160">
              <template #default="{ row }">{{ getSeriesDisplayName(row.DeviceSeries || row) || '-' }}</template>
            </el-table-column>
            <el-table-column :label="$t('devices.status')" width="100">
              <template #default="{ row }">
                <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? $t('devices.enabled') : $t('devices.disabled') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" :label="$t('devices.createdAt')" min-width="160">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column prop="updated_at" :label="$t('devices.updatedAt')" min-width="180">
              <template #default="{ row }">
                {{ formatDate(row.updated_at) }}
              </template>
            </el-table-column>
            <el-table-column :label="$t('shared.operation')" min-width="220" v-if="$store.getters['auth/hasPermission']('device:update') || $store.getters['auth/hasPermission']('device:delete')">
              <template #default="{ row }">
                <div class="operation-buttons">
                  <el-button size="small" text @click="openModelEdit(row)" v-if="$store.getters['auth/hasPermission']('device:update')">{{ $t('shared.edit') }}</el-button>
                  <el-button size="small" text @click="onToggleModelStatus(row)" v-if="$store.getters['auth/hasPermission']('device:update')">
                    {{ row.is_active ? $t('devices.disable') : $t('devices.enable') }}
                  </el-button>
                  <el-button size="small" text @click="onDeleteModel(row)" v-if="$store.getters['auth/hasPermission']('device:delete')" style="color: var(--el-color-danger);">{{ $t('shared.delete') }}</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          </div>

          <!-- 分页 -->
          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="modelPage"
              v-model:page-size="modelLimit"
              :total="modelTotal"
              :page-sizes="[10,20,50,100]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleModelSizeChange"
              @current-change="handleModelCurrentChange"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane :label="$t('devices.tabHospitals')" name="hospitals">
          <div class="action-bar">
            <div class="search-section">
              <el-input v-model="hospitalSearch" :placeholder="$t('devices.searchHospitalPlaceholder')" style="width: 300px" clearable @input="handleHospitalSearch" />
              <el-select v-model="hospitalCountryCode" :placeholder="$t('devices.country')" clearable filterable style="width: 140px; margin-left: 8px;" @change="handleHospitalSearch">
                <el-option
                  v-for="item in countryOptions"
                  :key="item.country_code"
                  :label="getCountryOptionLabel(item)"
                  :value="item.country_code"
                />
              </el-select>
              <el-select
                v-model="hospitalRegionCode"
                :placeholder="hospitalCountryCode ? $t('devices.regionPlaceholder') : $t('devices.regionPlaceholderFirstCountry')"
                clearable
                filterable
                style="width: 180px; margin-left: 8px;"
                :disabled="!hospitalCountryCode"
                @change="handleHospitalSearch"
              >
                <el-option v-for="item in hospitalRegionOptions" :key="item.region_code" :label="item.region_name || item.region_name_en || item.region_code" :value="item.region_code" />
              </el-select>
            </div>
            <div class="action-section" v-if="$store.getters['auth/hasPermission']('device:update')">
              <el-button type="primary" @click="openHospitalEdit()">{{ $t('devices.addHospital') }}</el-button>
            </div>
          </div>

          <div class="table-container">
            <el-table :data="hospitals" :loading="hospitalsLoading" :height="tableHeight" style="width: 100%">
              <el-table-column prop="hospital_code" :label="$t('devices.hospitalCode')" width="180" />
              <el-table-column :label="$t('devices.hospitalName')" min-width="260">
                <template #default="{ row }">{{ formatHospitalDisplayName(row) }}</template>
              </el-table-column>
              <el-table-column prop="country_code" :label="$t('devices.country')" width="100" />
              <el-table-column :label="$t('devices.region')" min-width="160">
                <template #default="{ row }">{{ row.Region?.region_name || row.region_code || '-' }}</template>
              </el-table-column>
              <el-table-column :label="$t('devices.status')" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.status ? 'success' : 'info'" size="small">{{ row.status ? $t('devices.enabled') : $t('devices.disabled') }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="$t('shared.operation')" width="180" v-if="$store.getters['auth/hasPermission']('device:update') || $store.getters['auth/hasPermission']('device:delete')">
                <template #default="{ row }">
                  <el-button size="small" text @click="openHospitalEdit(row)" v-if="$store.getters['auth/hasPermission']('device:update')">{{ $t('shared.edit') }}</el-button>
                  <el-button size="small" text style="color: var(--el-color-danger)" @click="onDeleteHospital(row)" v-if="$store.getters['auth/hasPermission']('device:delete')">{{ $t('shared.delete') }}</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="hospitalPage"
              v-model:page-size="hospitalLimit"
              :total="hospitalTotal"
              :page-sizes="[10,20,50,100]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleHospitalSizeChange"
              @current-change="handleHospitalCurrentChange"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="showEdit" :title="editing ? $t('devices.editDevice') : $t('devices.addDevice')" width="800px" class="app-dialog management-dialog" align-center>
      <el-tabs v-model="activeTab" v-if="editing">
        <el-tab-pane :label="$t('devices.tabBasicInfo')" name="basic">
          <el-form :model="form" label-width="110px" :rules="rules" ref="formRef">
            <el-form-item :label="$t('shared.deviceId')" prop="device_id">
              <el-input v-model="form.device_id" :disabled="!!editing" :placeholder="$t('devices.deviceIdPlaceholder')" />
            </el-form-item>
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item :label="$t('devices.deviceSeries')" prop="device_series_id">
                  <el-select v-model="form.device_series_id" style="width: 100%" :placeholder="$t('devices.selectDeviceSeries')" @change="onDeviceSeriesChange">
                    <el-option
                      v-for="item in deviceSeriesOptions"
                      :key="item.id"
                      :label="getSeriesDisplayName(item)"
                      :value="item.id"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="$t('devices.deviceModel')" prop="device_model">
                  <el-select v-model="form.device_model" filterable clearable style="width: 100%">
                    <el-option
                      v-for="item in filteredDeviceModelOptions"
                      :key="item.id || item.device_model"
                      :label="item.device_model"
                      :value="item.device_model"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item :label="$t('devices.hospital')" prop="hospital_id">
              <el-select
                v-model="form.hospital_id"
                filterable
                remote
                clearable
                reserve-keyword
                :remote-method="remoteSearchHospitals"
                :placeholder="$t('devices.selectHospitalOptional')"
                style="width: 100%"
                @change="onDeviceHospitalChange"
              >
                <el-option v-for="item in hospitalOptions" :key="item.id" :label="formatHospitalDisplayName(item)" :value="item.id" />
              </el-select>
            </el-form-item>
            <el-form-item :label="$t('devices.country')">
              <el-input :model-value="selectedHospitalCountryLabel" disabled :placeholder="$t('devices.countryFromHospitalHint')" />
            </el-form-item>
            <el-form-item :label="$t('devices.region')">
              <el-input :model-value="selectedHospitalRegionLabel" disabled :placeholder="$t('devices.regionFromHospitalHint')" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane :label="$t('devices.tabKeys')" name="keys">
          <div class="keys-management">
            <div class="keys-header">
              <span class="keys-title">{{ $t('devices.keysTitle') }}</span>
            </div>
            <el-table :data="editableKeys" :loading="keysLoading" style="width: 100%" border>
              <el-table-column prop="key_value" :label="$t('devices.keyValue')" width="160">
                <template #default="{ row, $index }">
                  <el-input
                    v-if="row.editing"
                    v-model="row.key_value"
                    placeholder="00-01-05-77-6a-09"
                    size="small"
                    :class="{ 'error-input': row.errors?.key_value }"
                  />
                  <code v-else>{{ row.key_value }}</code>
                  <div v-if="row.errors?.key_value" class="error-message">{{ row.errors.key_value }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="valid_from_date" :label="$t('devices.validFrom')" width="180">
                <template #default="{ row }">
                  <el-date-picker
                    v-if="row.editing"
                    v-model="row.valid_from_date"
                    type="datetime"
                    :placeholder="$t('devices.selectDateTime')"
                    format="YYYY-MM-DD HH:00"
                    value-format="YYYY-MM-DD HH:00:00"
                    :default-time="new Date(2000, 0, 1, 0, 0, 0)"
                    size="small"
                    style="width: 100%"
                  />
                  <span v-else>{{ formatKeyDateTime(row.valid_from_date) }}</span>
                  <div v-if="row.errors?.valid_from_date" class="error-message">{{ row.errors.valid_from_date }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="valid_to_date" :label="$t('devices.validTo')" width="180">
                <template #default="{ row }">
                  <el-date-picker
                    v-if="row.editing"
                    v-model="row.valid_to_date"
                    type="datetime"
                    :placeholder="$t('devices.validToPlaceholder')"
                    format="YYYY-MM-DD HH:00"
                    value-format="YYYY-MM-DD HH:00:00"
                    :default-time="new Date(2000, 0, 1, 0, 0, 0)"
                    size="small"
                    style="width: 100%"
                    clearable
                  />
                  <template v-else>
                    <span v-if="row.valid_to_date">{{ formatKeyDateTime(row.valid_to_date) }}</span>
                    <el-tag v-else type="success" size="small">{{ $t('devices.permanentValid') }}</el-tag>
                  </template>
                  <div v-if="row.errors?.valid_to_date" class="error-message">{{ row.errors.valid_to_date }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="description" :label="$t('devices.description')" min-width="150">
                <template #default="{ row }">
                  <el-input
                    v-if="row.editing"
                    v-model="row.description"
                    :placeholder="$t('devices.keyDescriptionPlaceholder')"
                    size="small"
                  />
                  <span v-else>{{ row.description || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="$t('shared.operation')" width="150" fixed="right">
                <template #default="{ row, $index }">
                  <template v-if="row.editing">
                    <el-button size="small" type="primary" @click="saveKeyRow(row, $index)">{{ $t('shared.save') }}</el-button>
                    <el-button size="small" @click="cancelEditKey(row, $index)">{{ $t('shared.cancel') }}</el-button>
                  </template>
                  <template v-else>
                    <el-button size="small" text @click="editKeyRow(row)">{{ $t('shared.edit') }}</el-button>
                    <el-button size="small" text @click="deleteKey(row)" style="color: var(--el-color-danger);">{{ $t('shared.delete') }}</el-button>
                  </template>
                </template>
              </el-table-column>
            </el-table>
            <div class="add-key-row" v-if="editing">
              <el-button type="primary" plain @click="addNewKeyRow" :disabled="hasNewKeyRow">
                <el-icon><Plus /></el-icon>
                {{ $t('devices.addKey') }}
              </el-button>
            </div>
            <div v-if="editableKeys.length === 0 && !keysLoading" class="empty-keys">
              <el-empty :description="$t('devices.emptyKeys')" :image-size="100" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
      <el-form v-else :model="form" label-width="110px" :rules="rules" ref="formRef">
        <el-form-item :label="$t('shared.deviceId')" prop="device_id">
          <el-input v-model="form.device_id" :disabled="!!editing" :placeholder="$t('devices.deviceIdPlaceholder')" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item :label="$t('devices.deviceSeries')" prop="device_series_id">
              <el-select v-model="form.device_series_id" style="width: 100%" :placeholder="$t('devices.selectDeviceSeries')" @change="onDeviceSeriesChange">
                <el-option
                  v-for="item in deviceSeriesOptions"
                  :key="item.id"
                  :label="getSeriesDisplayName(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('devices.deviceModel')" prop="device_model">
              <el-select v-model="form.device_model" filterable clearable style="width: 100%">
                <el-option
                  v-for="item in filteredDeviceModelOptions"
                  :key="item.id || item.device_model"
                  :label="item.device_model"
                  :value="item.device_model"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="$t('devices.hospital')" prop="hospital_id">
          <el-select
            v-model="form.hospital_id"
            filterable
            remote
            clearable
            reserve-keyword
            :remote-method="remoteSearchHospitals"
            :placeholder="$t('devices.selectHospitalOptional')"
            style="width: 100%"
            @change="onDeviceHospitalChange"
          >
            <el-option v-for="item in hospitalOptions" :key="item.id" :label="formatHospitalDisplayName(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('devices.country')">
          <el-input :model-value="selectedHospitalCountryLabel" disabled :placeholder="$t('devices.countryFromHospitalHint')" />
        </el-form-item>
        <el-form-item :label="$t('devices.region')">
          <el-input :model-value="selectedHospitalRegionLabel" disabled :placeholder="$t('devices.regionFromHospitalHint')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="default" @click="showEdit=false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save" v-if="activeTab === 'basic' || !editing">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 设备型号编辑对话框 -->
    <el-dialog v-model="showModelEdit" :title="editingModel ? $t('devices.modelDialogEdit') : $t('devices.modelDialogAdd')" width="500px" class="app-dialog management-dialog" align-center>
      <el-form :model="modelForm" label-width="100px" ref="modelFormRef">
        <el-form-item :label="$t('devices.deviceSeries')" prop="series_id" :rules="[{ required: true, message: t('devices.rules.seriesRequired'), trigger: 'change' }]">
          <el-select v-model="modelForm.series_id" style="width: 100%" clearable :placeholder="$t('devices.selectDeviceSeries')">
            <el-option
              v-for="item in deviceSeriesOptions"
              :key="item.id"
              :label="getSeriesDisplayName(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('devices.deviceModel')" prop="device_model" :rules="[{ required: true, message: t('devices.rules.modelRequired'), trigger: 'blur' }]">
          <el-input v-model="modelForm.device_model" :placeholder="$t('devices.modelPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('devices.status')">
          <el-switch v-model="modelForm.is_active" :active-text="$t('devices.enabled')" :inactive-text="$t('devices.disabled')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="default" @click="showModelEdit=false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="savingModel" @click="saveModel">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showHospitalEdit" :title="editingHospital ? $t('devices.hospitalDialogEdit') : $t('devices.hospitalDialogAdd')" width="560px" class="app-dialog management-dialog" align-center>
      <el-form :model="hospitalForm" label-width="100px" ref="hospitalFormRef">
        <el-form-item :label="$t('devices.hospitalCode')" prop="code_suffix" :rules="hospitalCodeRules">
          <el-input
            v-model="hospitalForm.code_suffix"
            maxlength="4"
            :placeholder="$t('devices.hospitalCodeSuffixPlaceholder')"
            @input="onHospitalCodeSuffixInput"
            @blur="checkHospitalCodeDuplicate"
          >
            <template #prepend>{{ hospitalCodePrefix }}</template>
          </el-input>
          <div style="font-size: 12px; color: #909399; margin-top: 4px;">
            {{ $t('devices.hospitalCodeRuleHint') }}
          </div>
          <div v-if="hospitalCodeDuplicate" class="error-message">{{ $t('devices.hospitalCodeDuplicate') }}</div>
        </el-form-item>
        <el-form-item :label="$t('devices.hospitalName')" prop="hospital_name_std" :rules="[{ required: true, message: t('devices.hospitalNameRequired'), trigger: 'blur' }]">
          <el-input v-model="hospitalForm.hospital_name_std" />
        </el-form-item>
        <el-form-item :label="$t('devices.country')" prop="country_code" :rules="[{ required: true, message: t('devices.rules.countryRequired'), trigger: 'change' }]">
          <el-select
            v-model="hospitalForm.country_code"
            :placeholder="$t('devices.selectCountry')"
            filterable
            style="width: 100%"
            @change="onHospitalFormCountryChange"
          >
            <el-option
              v-for="item in countryOptions"
              :key="item.country_code"
              :label="getCountryOptionLabel(item)"
              :value="item.country_code"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('devices.region')" prop="region_code" :rules="hospitalRegionRules">
          <el-select
            v-model="hospitalForm.region_code"
            clearable
            filterable
            :placeholder="$t('devices.selectRegion')"
            style="width: 100%"
            :disabled="!hospitalForm.country_code || !isChinaCountry"
          >
            <el-option v-for="item in hospitalFormRegionOptions" :key="item.region_code" :label="item.region_name || item.region_name_en || item.region_code" :value="item.region_code" />
          </el-select>
          <div v-if="hospitalForm.country_code && !isChinaCountry" style="font-size: 12px; color: #909399; margin-top: 4px;">
            {{ $t('devices.regionNonChinaHint') }}
          </div>
        </el-form-item>
        <el-form-item :label="$t('devices.status')">
          <el-switch v-model="hospitalForm.status" :active-text="$t('devices.enabled')" :inactive-text="$t('devices.disabled')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showHospitalEdit=false">{{ $t('shared.cancel') }}</el-button>
        <el-button type="primary" :loading="savingHospital" @click="saveHospital">{{ $t('shared.save') }}</el-button>
      </template>
    </el-dialog>

  </div>
  
</template>

<script>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDeleteConfirm } from '@/composables/useDeleteConfirm'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../api'
import { useStore } from 'vuex'
import { maskHospitalName } from '../utils/maskSensitiveData'
import { getTableHeight } from '@/utils/tableHeight'
import { notifyApiError } from '@/utils/apiError'
import {
  filterDeviceModelsBySeries,
  deriveSeriesIdForDeviceModel,
  syncDeviceSeriesSelection
} from '../utils/deviceModelSeries'

export default {
  name: 'Devices',
  components: {
    Plus
  },
  setup() {
    const { t, locale } = useI18n()
    const store = useStore()
    const canEdit = computed(() => {
      return store.getters['auth/hasPermission']('device:update')
    })
    const hasDeviceReadPermission = computed(() => {
      return store.getters['auth/hasPermission']('device:read')
    })

    // 表格高度计算（固定表头）
    const tableHeight = computed(() => {
      return getTableHeight('configSubPage') // 使用 configSubPage 因为页面有 tabs
    })

    const mainTab = ref('devices')
    const loading = ref(false)
    const saving = ref(false)
    const devices = ref([])
    const total = ref(0)
    const page = ref(1)
    const limit = ref(20)
    const search = ref('')
    const deviceSeriesFilterId = ref(null)
    const countryCode = ref('')
    const regionCode = ref('')
    const hospitalId = ref(null)
    const countryOptions = ref([])
    const regionOptions = ref([])
    const hospitalFilterOptions = ref([])
    const hospitalFilterLoading = ref(false)
    const hospitalOptions = ref([])
    const hospitalSearchMinLength = 2
    let searchTimer = null
    
    // 分页节流和去重机制
    const devicesLoading = ref(false)
    const lastDevicesLoadAt = ref(0)

    // 设备型号相关
    const deviceModels = ref([])
    const deviceModelOptions = ref([])
    const modelsLoading = ref(false)
    const modelPage = ref(1)
    const modelLimit = ref(20)
    const modelTotal = ref(0)
    const modelSearch = ref('')
    const modelSeriesFilterId = ref(null)
    let modelSearchTimer = null
    const showModelEdit = ref(false)
    const editingModel = ref(null)
    const savingModel = ref(false)
    const modelFormRef = ref(null)
    const deviceSeriesOptions = ref([])
    const modelForm = reactive({ device_model: '', series_id: null, is_active: true })

    const getSeriesDisplayName = (item) => {
      if (!item) return ''
      return String(locale.value || '').startsWith('en')
        ? (item.series_name_en || item.series_name_zh || item.series_code)
        : (item.series_name_zh || item.series_name_en || item.series_code)
    }

    const showEdit = ref(false)
    const activeTab = ref('basic')
    const editing = ref(null)
    const formRef = ref(null)
    const form = reactive({
      device_id: '',
      device_series_id: null,
      device_model: '',
      hospital_id: null,
      country_code: '',
      region_code: ''
    })

    const filteredDeviceModelOptions = computed(() => {
      return filterDeviceModelsBySeries(deviceModelOptions.value, form.device_series_id)
    })

    const isPositiveSeriesId = (value) => {
      const num = Number(value)
      return Number.isInteger(num) && num > 0
    }

    const resolveSeriesIdForEditRow = (row) => {
      if (isPositiveSeriesId(row?.series_id)) {
        return Number(row.series_id)
      }
      return deriveSeriesIdForDeviceModel(deviceModelOptions.value, row?.device_model)
    }

    const isSelectedModelCompatibleWithSeries = () => {
      if (!form.device_model) return false
      if (!isPositiveSeriesId(form.device_series_id)) return true
      return filteredDeviceModelOptions.value.some(item => item.device_model === form.device_model)
    }

    // 医院管理
    const hospitals = ref([])
    const hospitalsLoading = ref(false)
    const hospitalPage = ref(1)
    const hospitalLimit = ref(20)
    const hospitalTotal = ref(0)
    const hospitalSearch = ref('')
    const hospitalCountryCode = ref('')
    const hospitalRegionCode = ref('')
    const hospitalRegionOptions = ref([])
    let hospitalSearchTimer = null

    const showHospitalEdit = ref(false)
    const savingHospital = ref(false)
    const editingHospital = ref(null)
    const hospitalFormRef = ref(null)
    const hospitalFormRegionOptions = ref([])
    const hospitalForm = reactive({
      hospital_code: '',
      code_suffix: '',
      hospital_name_std: '',
      country_code: '',
      region_code: '',
      status: true
    })
    const hospitalCodeChecking = ref(false)
    const hospitalCodeDuplicate = ref(false)

    // 密钥管理相关
    const deviceKeys = ref([])
    const editableKeys = ref([])
    const keysLoading = ref(false)
    const savingKey = ref(false)

    const rules = computed(() => ({
      device_id: [
        { required: true, message: t('devices.rules.deviceIdRequired'), trigger: 'blur' },
        { pattern: /^[0-9A-Za-z]+-[0-9A-Za-z]+$/, message: t('devices.rules.deviceIdPattern'), trigger: 'blur' }
      ],
      device_series_id: [
        { required: true, message: t('devices.rules.seriesRequired'), trigger: 'change' }
      ],
      device_model: [
        { required: true, message: t('devices.rules.modelRequired'), trigger: 'change' }
      ]
    }))
    const hospitalCodeRules = computed(() => [
      { required: true, message: t('devices.rules.codeSuffixRequired'), trigger: 'blur' },
      { pattern: /^\d{4}$/, message: t('devices.rules.codeSuffixPattern'), trigger: 'blur' }
    ])
    const hospitalRegionRules = computed(() => {
      if (hospitalForm.country_code === 'CN') {
        return [{ required: true, message: t('devices.rules.regionRequiredChina'), trigger: 'change' }]
      }
      return []
    })
    const isChinaCountry = computed(() => hospitalForm.country_code === 'CN')
    // 用于医院编号拼接的区域部分：只取纯区域编码，若 region_code 含国家前缀（如 CN-SC）或等于国家编码则去掉，避免编号里国家编码出现两次
    const normalizedHospitalRegionCode = computed(() => {
      const country = (hospitalForm.country_code || '').trim().toUpperCase()
      if (!country) return ''
      if (country !== 'CN') return 'XX'
      let region = (hospitalForm.region_code || '').trim().toUpperCase()
      if (!region) return ''
      if (region === country) return 'XX'
      if (region.startsWith(country + '-')) return region.slice(country.length + 1)
      return region
    })
    const hospitalCodePrefix = computed(() => {
      const country = (hospitalForm.country_code || '').trim().toUpperCase()
      const region = normalizedHospitalRegionCode.value
      if (!country) return t('devices.hospitalCodePrefixSelectCountry')
      if (!region) return `${country}-${t('devices.hospitalCodePrefixSelectRegion')}`
      return `${country}-${region}-`
    })

    // 医院停用时在名称后追加停用后缀
    const formatHospitalDisplayName = (hospital) => {
      if (!hospital || hospital.hospital_name_std == null) return ''
      const name = String(hospital.hospital_name_std).trim()
      const isDisabled = hospital.status === 0 || hospital.status === false
      return isDisabled ? name + t('devices.hospitalNameDisabledSuffix') : name
    }

    const parseKeyDateTime = (value) => {
      if (!value) return null
      const d = new Date(String(value).replace('T', ' '))
      return Number.isNaN(d.getTime()) ? null : d
    }

    const formatKeyDateTime = (value) => {
      const d = parseKeyDateTime(value)
      if (!d) return value || ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`
    }

    const rangesOverlap = (fromA, toA, fromB, toB) => {
      const a0 = parseKeyDateTime(fromA)?.getTime()
      const b0 = parseKeyDateTime(fromB)?.getTime()
      if (a0 == null || b0 == null) return false
      const a1 = toA ? (parseKeyDateTime(toA)?.getTime() ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY
      const b1 = toB ? (parseKeyDateTime(toB)?.getTime() ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY
      return a0 < b1 && b0 < a1
    }

    // 验证密钥行数据
    const validateKeyRow = (row) => {
      const errors = {}
      if (!row.key_value || row.key_value.trim() === '') {
        errors.key_value = t('devices.rules.keyValueRequired')
      } else {
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
        if (!macRegex.test(row.key_value)) {
          errors.key_value = t('devices.rules.deviceKeyMac')
        }
      }
      if (!row.valid_from_date) {
        errors.valid_from_date = t('devices.rules.validFromRequired')
      }
      const from = parseKeyDateTime(row.valid_from_date)
      const to = row.valid_to_date ? parseKeyDateTime(row.valid_to_date) : null
      if (row.valid_to_date && !to) {
        errors.valid_to_date = t('devices.rules.validToInvalid')
      }
      if (from && to && from.getTime() >= to.getTime()) {
        errors.valid_to_date = t('devices.rules.validRangeOrder')
      }
      if (from) {
        const overlapped = editableKeys.value.some((other) => {
          if (other === row) return false
          if (!other.valid_from_date) return false
          return rangesOverlap(row.valid_from_date, row.valid_to_date || null, other.valid_from_date, other.valid_to_date || null)
        })
        if (overlapped) {
          errors.valid_from_date = t('devices.rules.validRangeOverlap')
        }
      }
      return errors
    }

    const loadDevices = async (options = {}) => {
      const silent = options && options.silent === true
      const force = options && options.force === true
      const now = Date.now()
      if (!force && now - lastDevicesLoadAt.value < 2000) {
        return
      }
      if (!force && devicesLoading.value) {
        return
      }
      try {
        devicesLoading.value = true
        loading.value = true
        lastDevicesLoadAt.value = now
        const res = await api.devices.getList({
          page: page.value,
          limit: limit.value,
          search: search.value,
          series_id: deviceSeriesFilterId.value || undefined,
          country_code: countryCode.value || undefined,
          region_code: regionCode.value || undefined,
          hospital_id: hospitalId.value || undefined
        })
        devices.value = res.data.devices || []
        total.value = res.data.total || 0
      } catch (error) {
        if (!silent) {
          ElMessage.error(t('devices.messages.loadFailed'))
        } else {
          console.warn('加载设备失败(已静默):', error?.message || error)
        }
      } finally {
        devicesLoading.value = false
        loading.value = false
      }
    }

    const getCountryOptionLabel = (item) => {
      if (!item) return ''
      const name = String(item.country_name || item.country_name_en || '').trim()
      const code = String(item.country_code || '').trim()
      if (name && code && name.toUpperCase() !== code.toUpperCase()) {
        return `${name} (${code})`
      }
      return name || code
    }

    const loadCountryOptions = async () => {
      try {
        const res = await api.geo.getCountries()
        countryOptions.value = res.data.countries || []
      } catch (error) {
        console.warn('加载国家字典失败:', error?.message || error)
      }
    }

    const loadRegionOptions = async (country) => {
      if (!country) {
        regionOptions.value = []
        return
      }
      try {
        const res = await api.geo.getRegions({ country_code: country })
        regionOptions.value = res.data.regions || []
      } catch (error) {
        console.warn('加载区域字典失败:', error?.message || error)
      }
    }

    const hospitalFilterPlaceholder = computed(() => {
      if (!countryCode.value) {
        return t('devices.filterHospitalSelectCountry')
      }
      return t('devices.filterHospitalMinChars', { min: hospitalSearchMinLength })
    })

    const hospitalFilterNoDataText = computed(() => {
      if (!countryCode.value) {
        return t('devices.filterHospitalSelectCountry')
      }
      return t('devices.filterHospitalMinCharsNoData', { min: hospitalSearchMinLength })
    })

    const remoteSearchHospitalsForFilter = async (keyword = '') => {
      if (!countryCode.value) {
        hospitalFilterOptions.value = []
        return
      }
      const trimmedKeyword = (keyword || '').trim()
      if (trimmedKeyword.length < hospitalSearchMinLength) {
        hospitalFilterOptions.value = []
        return
      }
      hospitalFilterLoading.value = true
      try {
        const res = await api.hospitals.getList({
          page: 1,
          limit: 50,
          search: trimmedKeyword,
          status: 1,
          country_code: countryCode.value || undefined,
          region_code: regionCode.value || undefined
        })
        hospitalFilterOptions.value = res.data.hospitals || []
      } catch (error) {
        console.warn('加载医院列表失败:', error?.message || error)
        hospitalFilterOptions.value = []
      } finally {
        hospitalFilterLoading.value = false
      }
    }

    const remoteSearchHospitals = async (keyword = '') => {
      try {
        const res = await api.hospitals.getList({
          page: 1,
          limit: 50,
          search: keyword,
          status: 1
        })
        hospitalOptions.value = res.data.hospitals || []
      } catch (error) {
        console.warn('加载医院列表失败:', error?.message || error)
      }
    }

    const selectedHospital = computed(() => {
      if (!form.hospital_id) return null
      return hospitalOptions.value.find(item => item.id === form.hospital_id) || null
    })

    const selectedHospitalCountryLabel = computed(() => {
      const hospital = selectedHospital.value
      if (!hospital?.country_code) return ''
      const matched = countryOptions.value.find(item => item.country_code === hospital.country_code)
      return getCountryOptionLabel(matched || {
        country_code: hospital.country_code,
        country_name: hospital.country_code
      })
    })

    const selectedHospitalRegionLabel = computed(() => {
      const hospital = selectedHospital.value
      if (!hospital) return ''
      return hospital.Region?.region_name
        || hospital.region_name
        || hospital.region_name_en
        || hospital.region_code
        || ''
    })

    const onCountryChange = async (value) => {
      if (!value) {
        regionCode.value = ''
      }
      await loadRegionOptions(value)
      hospitalId.value = null
      hospitalFilterOptions.value = []
      handleSearch()
    }

    const onRegionChange = () => {
      hospitalId.value = null
      hospitalFilterOptions.value = []
      handleSearch()
    }

    const handleDeviceSeriesFilterChange = () => {
      hospitalId.value = null
      hospitalFilterOptions.value = []
      page.value = 1
      loadDevices({ force: true })
    }

    const handleSearch = () => {
      if (searchTimer) {
        clearTimeout(searchTimer)
      }
      searchTimer = setTimeout(() => {
        page.value = 1
        loadDevices({ force: true })
      }, 300)
    }

    const handleDeviceSizeChange = (newSize) => {
      limit.value = newSize
      page.value = 1
      loadDevices({ force: true })
    }

    const handleDeviceCurrentChange = (newPage) => {
      page.value = newPage
      loadDevices({ force: true })
    }

    const openEdit = (row) => {
      const applySeriesSelection = () => {
        form.device_series_id = resolveSeriesIdForEditRow(row)
      }

      if (row) {
        editing.value = row
        Object.assign(form, {
          device_id: row.device_id,
          device_series_id: isPositiveSeriesId(row.series_id) ? Number(row.series_id) : null,
          device_model: row.device_model,
          hospital_id: row.hospital_id || null,
          country_code: row.country_code || '',
          region_code: row.region_code || ''
        })
        if (form.hospital_id && row.hospital_name && !hospitalOptions.value.some(item => item.id === form.hospital_id)) {
          hospitalOptions.value = [
            {
              id: form.hospital_id,
              hospital_name_std: row.hospital_name,
              country_code: row.country_code || '',
              region_code: row.region_code || '',
              region_name: row.region_name || ''
            },
            ...hospitalOptions.value
          ]
        }
        activeTab.value = 'basic'
        // 加载密钥列表
        loadDeviceKeys(row.device_id)
      } else {
        editing.value = null
        Object.assign(form, {
          device_id: '',
          device_series_id: null,
          device_model: '',
          hospital_id: null,
          country_code: '',
          region_code: ''
        })
        deviceKeys.value = []
        activeTab.value = 'basic'
      }
      if (!deviceModelOptions.value.length) {
        loadDeviceModelOptions().then(applySeriesSelection)
      } else {
        applySeriesSelection()
      }
      if (form.device_model && !deviceModelOptions.value.some(item => item.device_model === form.device_model)) {
        deviceModelOptions.value = [{ id: null, device_model: form.device_model, series_id: form.device_series_id }, ...deviceModelOptions.value]
      }
      showEdit.value = true
    }

    // 加载设备密钥列表
    const loadDeviceKeys = async (deviceId) => {
      if (!deviceId) return
      keysLoading.value = true
      try {
        const res = await api.devices.getKeys(deviceId)
        deviceKeys.value = res.data.keys || []
        // 转换为可编辑格式
        editableKeys.value = deviceKeys.value.map(key => ({
          ...key,
          editing: false,
          originalData: { ...key },
          errors: {}
        }))
      } catch (error) {
        ElMessage.error(t('devices.messages.loadKeysFailed'))
        deviceKeys.value = []
        editableKeys.value = []
      } finally {
        keysLoading.value = false
      }
    }

    // 计算是否有新添加的行（正在编辑且没有id）
    const hasNewKeyRow = computed(() => {
      return editableKeys.value.some(row => row.editing && !row.id)
    })

    // 添加新密钥行
    const addNewKeyRow = () => {
      if (hasNewKeyRow.value) {
        ElMessage.warning(t('devices.messages.addKeyFirst'))
        return
      }
      const newRow = {
        id: null,
        key_value: '',
        valid_from_date: editableKeys.value.length === 0 ? '1970-01-01 00:00:00' : '',
        valid_to_date: null,
        priority: 0,
        description: '',
        is_default: false,
        editing: true,
        originalData: null,
        errors: {}
      }
      editableKeys.value.push(newRow)
    }

    // 编辑密钥行
    const editKeyRow = (row) => {
      if (hasNewKeyRow.value) {
        ElMessage.warning(t('devices.messages.addKeyFirst'))
        return
      }
      row.editing = true
      row.originalData = { ...row }
      row.errors = {}
    }

    // 取消编辑
    const cancelEditKey = (row, index) => {
      if (row.id) {
        // 恢复原始数据
        Object.assign(row, row.originalData)
        row.editing = false
        row.errors = {}
      } else {
        // 删除新添加的行
        editableKeys.value.splice(index, 1)
      }
    }

    // 保存密钥行
    const saveKeyRow = async (row, index) => {
      // 验证数据
      const errors = validateKeyRow(row)
      if (Object.keys(errors).length > 0) {
        row.errors = errors
        ElMessage.error(t('devices.messages.validateFailed'))
        return
      }

      savingKey.value = true
      try {
        const keyData = {
          key_value: row.key_value,
          valid_from_date: row.valid_from_date,
          valid_to_date: row.valid_to_date || null,
          priority: row.priority || 0,
          description: row.description || ''
        }

        if (row.id) {
          // 更新现有密钥
          await api.devices.updateKey(row.id, keyData)
          ElMessage.success(t('devices.messages.keySaved'))
          // 重新加载密钥列表
          await loadDeviceKeys(editing.value.device_id)
        } else {
          // 创建新密钥
          await api.devices.createKey(editing.value.device_id, keyData)
          ElMessage.success(t('devices.messages.keyAdded'))
          // 重新加载密钥列表
          await loadDeviceKeys(editing.value.device_id)
        }
      } catch (error) {
        notifyApiError(error, t('devices.messages.keySaveFailed'))
      } finally {
        savingKey.value = false
      }
    }

    // 删除密钥
    const deleteKey = async (key) => {
      if (key.editing) {
        ElMessage.warning(t('devices.messages.addKeyFirst'))
        return
      }
      try {
        await ElMessageBox.confirm(t('devices.messages.keyDeleteConfirm'), t('shared.messages.deleteConfirmTitle'), { type: 'warning' })
        await api.devices.deleteKey(key.id)
        ElMessage.success(t('devices.messages.keyDeleted'))
        await loadDeviceKeys(editing.value.device_id)
      } catch (error) {
        if (error !== 'cancel') {
          notifyApiError(error, t('devices.messages.keyDeleteFailed'))
        }
      }
    }

    const save = async () => {
      await formRef.value?.validate()
      if (!form.device_model) {
        ElMessage.error(t('devices.rules.modelRequired'))
        return
      }
      if (!isSelectedModelCompatibleWithSeries()) {
        ElMessage.error(t('devices.messages.deviceModelSeriesMismatch'))
        return
      }
      saving.value = true
      try {
        const payload = {
          device_id: form.device_id,
          device_model: form.device_model,
          hospital_id: form.hospital_id || null,
          series_id: isPositiveSeriesId(form.device_series_id) ? Number(form.device_series_id) : undefined
        }
        if (editing.value) {
          await api.devices.update(editing.value.id, payload)
          ElMessage.success(t('devices.messages.updateSuccess'))
        } else {
          await api.devices.create(payload)
          ElMessage.success(t('devices.messages.createSuccess'))
        }
        showEdit.value = false
        await loadDevices({ force: true })
      } catch (e) {
        notifyApiError(e, t('devices.messages.saveFailed'))
      } finally {
        saving.value = false
      }
    }

    const onDeviceSeriesChange = (value) => {
      const next = syncDeviceSeriesSelection({
        selectedSeriesId: value,
        deviceModel: form.device_model,
        models: deviceModelOptions.value
      })
      form.device_series_id = next.device_series_id
      form.device_model = next.device_model
    }

    const onDeviceHospitalChange = (hospitalId) => {
      if (!hospitalId) {
        form.country_code = ''
        form.region_code = ''
        return
      }
      const selected = hospitalOptions.value.find(item => item.id === hospitalId)
      if (!selected) return
      form.country_code = selected.country_code || ''
      form.region_code = selected.region_code || ''
    }

    // 使用删除确认 composable pattern
    const { confirmDelete } = useDeleteConfirm()

    const onDelete = async (row) => {
      try {
        const confirmed = await confirmDelete(row, {
          message: t('devices.messages.deleteDeviceConfirm'),
          title: t('shared.messages.deleteConfirmTitle')
        })

        if (!confirmed) return

        await api.devices.delete(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadDevices({ force: true })
      } catch (e) {
        notifyApiError(e, t('shared.messages.deleteFailed'))
      }
    }

    // 设备型号相关函数
    const formatDate = (d) => {
      if (!d) return '-'
      try {
        return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      } catch {
        return String(d)
      }
    }

    const loadDeviceModelOptions = async () => {
      try {
        const res = await api.deviceModels.getList({
          page: 1,
          limit: 1000,
          includeInactive: 'true'
        })
        deviceModelOptions.value = (res.data.models || []).map(item => ({
          id: item.id,
          device_model: item.device_model,
          series_id: item.series_id
        }))
      } catch (e) {
        console.error('加载设备型号下拉失败:', e)
      }
    }

    const loadDeviceModels = async () => {
      modelsLoading.value = true
      try {
        const res = await api.deviceModels.getList({ 
          page: modelPage.value, 
          limit: modelLimit.value, 
          search: modelSearch.value,
          series_id: modelSeriesFilterId.value || undefined,
          includeInactive: 'true' // 设备管理页面显示所有（包括停用的）
        })
        deviceModels.value = res.data.models || []
        modelTotal.value = res.data.total || 0
      } catch (e) {
        console.error('加载设备型号失败:', e)
        notifyApiError(e, t('devices.messages.loadModelsFailed'))
      } finally {
        modelsLoading.value = false
      }
    }

    const loadDeviceSeriesOptions = async () => {
      try {
        const res = await api.deviceSeries.getList()
        deviceSeriesOptions.value = res.data.series || []
      } catch (e) {
        console.error('加载设备系列失败:', e)
        notifyApiError(e, t('devices.messages.loadSeriesFailed'))
      }
    }

    const handleModelSearch = () => {
      if (modelSearchTimer) {
        clearTimeout(modelSearchTimer)
      }
      modelSearchTimer = setTimeout(() => {
        modelPage.value = 1
        loadDeviceModels()
      }, 300)
    }

    const handleModelSeriesFilterChange = () => {
      modelPage.value = 1
      loadDeviceModels()
    }

    const handleModelSizeChange = (newSize) => {
      modelLimit.value = newSize
      modelPage.value = 1
      loadDeviceModels()
    }

    const handleModelCurrentChange = (newPage) => {
      modelPage.value = newPage
      loadDeviceModels()
    }

    const openModelEdit = (row) => {
      if (row) {
        editingModel.value = row
        Object.assign(modelForm, {
          device_model: row.device_model,
          series_id: row.series_id ?? null,
          is_active: row.is_active === 1 || row.is_active === true
        })
      } else {
        editingModel.value = null
        Object.assign(modelForm, { device_model: '', series_id: null, is_active: true })
      }
      showModelEdit.value = true
    }

    const saveModel = async () => {
      if (!modelFormRef.value) return
      await modelFormRef.value.validate(async (valid) => {
        if (!valid) return
        savingModel.value = true
        try {
          if (editingModel.value) {
            await api.deviceModels.update(editingModel.value.id, modelForm)
            ElMessage.success(t('devices.messages.modelUpdateSuccess'))
          } else {
            await api.deviceModels.create(modelForm)
            ElMessage.success(t('devices.messages.modelAddSuccess'))
          }
          showModelEdit.value = false
          loadDeviceModels()
          loadDeviceModelOptions()
        } catch (e) {
          console.warn('保存设备型号失败:', e?.response?.data?.message || e?.message || e)
        } finally {
          savingModel.value = false
        }
      })
    }

    const onDeleteModel = async (row) => {
      try {
        await ElMessageBox.confirm(
          t('devices.messages.deleteModelConfirm'),
          t('shared.messages.deleteConfirmTitle'),
          {
            confirmButtonText: t('shared.confirm'),
            cancelButtonText: t('shared.cancel'),
            type: 'warning',
            confirmButtonClass: 'btn-primary-danger',
            cancelButtonClass: 'btn-secondary'
          }
        )
        await api.deviceModels.delete(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        loadDeviceModels()
        loadDeviceModelOptions()
      } catch (e) {
        if (e !== 'cancel') {
          notifyApiError(
            e,
            e.response?.status === 409 ? t('devices.messages.modelInUseCannotDelete') : t('shared.messages.deleteFailed')
          )
        }
      }
    }

    const onToggleModelStatus = async (row) => {
      try {
        await api.deviceModels.update(row.id, { is_active: !row.is_active })
        ElMessage.success(row.is_active ? t('devices.messages.modelUpdateSuccess') : t('devices.messages.modelUpdateSuccess'))
        loadDeviceModels()
        loadDeviceModelOptions()
      } catch (e) {
        console.warn('切换设备型号状态失败:', e?.response?.data?.message || e?.message || e)
      }
    }

    const loadHospitals = async () => {
      hospitalsLoading.value = true
      try {
        const res = await api.hospitals.getList({
          page: hospitalPage.value,
          limit: hospitalLimit.value,
          search: hospitalSearch.value,
          country_code: hospitalCountryCode.value || undefined,
          region_code: hospitalRegionCode.value || undefined
        })
        hospitals.value = res.data.hospitals || []
        hospitalTotal.value = res.data.total || 0
      } catch (e) {
        notifyApiError(e, t('devices.messages.loadHospitalsFailed'))
      } finally {
        hospitalsLoading.value = false
      }
    }

    const handleHospitalSearch = () => {
      if (hospitalSearchTimer) clearTimeout(hospitalSearchTimer)
      hospitalSearchTimer = setTimeout(() => {
        hospitalPage.value = 1
        loadHospitals()
      }, 300)
    }

    const handleHospitalSizeChange = (newSize) => {
      hospitalLimit.value = newSize
      hospitalPage.value = 1
      loadHospitals()
    }

    const handleHospitalCurrentChange = (newPage) => {
      hospitalPage.value = newPage
      loadHospitals()
    }

    const loadHospitalRegionOptions = async (country) => {
      if (!country) {
        hospitalRegionOptions.value = []
        return
      }
      try {
        const res = await api.geo.getRegions({ country_code: country })
        hospitalRegionOptions.value = res.data.regions || []
      } catch (e) {
        console.warn('加载医院筛选区域失败:', e?.message || e)
      }
    }

    const loadHospitalFormRegionOptions = async (country) => {
      if (!country) {
        hospitalFormRegionOptions.value = []
        return
      }
      try {
        const res = await api.geo.getRegions({ country_code: country })
        hospitalFormRegionOptions.value = res.data.regions || []
      } catch (e) {
        console.warn('加载医院表单区域失败:', e?.message || e)
      }
    }

    const openHospitalEdit = async (row) => {
      if (row) {
        editingHospital.value = row
        const rawCode = String(row.hospital_code || '').trim().toUpperCase()
        const codeParts = rawCode.split('-')
        const parsedSuffix = codeParts.length >= 3 ? codeParts[2] : ''
        Object.assign(hospitalForm, {
          hospital_code: rawCode,
          code_suffix: /^\d{4}$/.test(parsedSuffix) ? parsedSuffix : '',
          hospital_name_std: row.hospital_name_std,
          country_code: row.country_code,
          region_code: row.region_code || '',
          status: row.status === 1 || row.status === true
        })
      } else {
        editingHospital.value = null
        Object.assign(hospitalForm, {
          hospital_code: '',
          code_suffix: '',
          hospital_name_std: '',
          country_code: '',
          region_code: '',
          status: true
        })
      }
      hospitalCodeDuplicate.value = false
      await loadHospitalFormRegionOptions(hospitalForm.country_code)
      showHospitalEdit.value = true
    }

    const onHospitalFormCountryChange = async () => {
      hospitalForm.region_code = ''
      hospitalForm.code_suffix = ''
      hospitalCodeDuplicate.value = false
      await loadHospitalFormRegionOptions(hospitalForm.country_code)
    }

    const onHospitalCodeSuffixInput = (val) => {
      hospitalForm.code_suffix = String(val || '').replace(/\D+/g, '').slice(0, 4)
      hospitalCodeDuplicate.value = false
    }

    const buildHospitalCode = () => {
      const country = String(hospitalForm.country_code || '').trim().toUpperCase()
      const region = normalizedHospitalRegionCode.value
      const suffix = String(hospitalForm.code_suffix || '').trim()
      if (!country || !region || !/^\d{4}$/.test(suffix)) return ''
      return `${country}-${region}-${suffix}`
    }

    const checkHospitalCodeDuplicate = async () => {
      const fullCode = buildHospitalCode()
      if (!fullCode) return false
      hospitalCodeChecking.value = true
      try {
        const res = await api.hospitals.getList({ page: 1, limit: 10, search: fullCode })
        const hospitalsList = res?.data?.hospitals || []
        hospitalCodeDuplicate.value = hospitalsList.some(item => {
          if (editingHospital.value && item.id === editingHospital.value.id) return false
          return String(item.hospital_code || '').toUpperCase() === fullCode
        })
      } catch (e) {
        console.warn('检查医院编码重复失败:', e?.message || e)
        hospitalCodeDuplicate.value = false
      } finally {
        hospitalCodeChecking.value = false
      }
      return hospitalCodeDuplicate.value
    }

    const saveHospital = async () => {
      if (!hospitalFormRef.value) return
      await hospitalFormRef.value.validate(async (valid) => {
        if (!valid) return
        hospitalForm.hospital_code = buildHospitalCode()
        if (!hospitalForm.hospital_code) {
          ElMessage.error(t('devices.messages.hospitalCodeRequired'))
          return
        }
        if (await checkHospitalCodeDuplicate()) {
          ElMessage.error(t('devices.messages.hospitalCodeExists'))
          return
        }
        savingHospital.value = true
        try {
          const payload = {
            hospital_code: hospitalForm.hospital_code,
            hospital_name_std: hospitalForm.hospital_name_std,
            country_code: hospitalForm.country_code,
            region_code: isChinaCountry.value ? (hospitalForm.region_code || null) : null,
            status: hospitalForm.status
          }
          if (editingHospital.value) {
            await api.hospitals.update(editingHospital.value.id, payload)
            ElMessage.success(t('devices.messages.hospitalUpdateSuccess'))
          } else {
            await api.hospitals.create(payload)
            ElMessage.success(t('devices.messages.hospitalCreateSuccess'))
          }
          showHospitalEdit.value = false
          await loadHospitals()
          await remoteSearchHospitals('')
        } catch (e) {
          // 错误提示由 axios 全局响应拦截器统一处理，避免重复弹窗
          console.warn('保存医院失败:', e?.response?.data?.message || e?.message || e)
        } finally {
          savingHospital.value = false
        }
      })
    }

    const onDeleteHospital = async (row) => {
      try {
        await ElMessageBox.confirm(t('devices.messages.deleteHospitalConfirm'), t('shared.messages.deleteConfirmTitle'), {
          confirmButtonText: t('shared.confirm'),
          cancelButtonText: t('shared.cancel'),
          type: 'warning'
        })
        await api.hospitals.delete(row.id)
        ElMessage.success(t('shared.messages.deleteSuccess'))
        await loadHospitals()
        await remoteSearchHospitals('')
      } catch (e) {
        if (e !== 'cancel') {
          notifyApiError(e, t('shared.messages.deleteFailed'))
        }
      }
    }

    // 监听Tab切换，自动加载对应数据
    watch(mainTab, (newTab) => {
      if (newTab === 'models') {
        loadDeviceModels()
      } else if (newTab === 'hospitals') {
        loadHospitals()
      }
    })

    watch(hospitalCountryCode, async (newVal) => {
      hospitalRegionCode.value = ''
      await loadHospitalRegionOptions(newVal)
      if (mainTab.value === 'hospitals') {
        hospitalPage.value = 1
        loadHospitals()
      }
    })

    onMounted(() => {
      loadDevices({ force: true })
      loadDeviceModelOptions()
      loadDeviceSeriesOptions()
      loadCountryOptions()
      // 如果默认Tab是设备型号，加载设备型号列表
      if (mainTab.value === 'models') {
        loadDeviceModels()
      } else if (mainTab.value === 'hospitals') {
        loadHospitals()
      }
    })

    return {
      t,
      mainTab,
      devices,
      total,
      page,
      limit,
      search,
      deviceSeriesFilterId,
      countryCode,
      regionCode,
      hospitalId,
      countryOptions,
      regionOptions,
      getCountryOptionLabel,
      hospitalFilterOptions,
      hospitalFilterLoading,
      hospitalFilterPlaceholder,
      hospitalFilterNoDataText,
      hospitalOptions,
      selectedHospitalCountryLabel,
      selectedHospitalRegionLabel,
      filteredDeviceModelOptions,
      loading,
      saving,
      showEdit,
      activeTab,
      editing,
      form,
      rules,
      hospitalCodeRules,
      hospitalRegionRules,
      isChinaCountry,
      hospitalCodePrefix,
      formatHospitalDisplayName,
      hospitalCodeChecking,
      hospitalCodeDuplicate,
      formRef,
      canEdit,
      // 设备型号
      deviceModels,
      deviceModelOptions,
      modelsLoading,
      modelPage,
      modelLimit,
      modelTotal,
      modelSearch,
      modelSeriesFilterId,
      showModelEdit,
      editingModel,
      savingModel,
      modelFormRef,
      deviceSeriesOptions,
      getSeriesDisplayName,
      modelForm,
      formatDate,
      formatKeyDateTime,
      loadDeviceModels,
      loadDeviceSeriesOptions,
      handleModelSearch,
      handleModelSeriesFilterChange,
      handleModelSizeChange,
      handleModelCurrentChange,
      openModelEdit,
      saveModel,
      onDeleteModel,
      onToggleModelStatus,
      hospitals,
      hospitalsLoading,
      hospitalPage,
      hospitalLimit,
      hospitalTotal,
      hospitalSearch,
      hospitalCountryCode,
      hospitalRegionCode,
      hospitalRegionOptions,
      showHospitalEdit,
      savingHospital,
      editingHospital,
      hospitalFormRef,
      hospitalForm,
      hospitalFormRegionOptions,
      hasDeviceReadPermission,
      maskHospitalName,
      deviceKeys,
      editableKeys,
      keysLoading,
      savingKey,
      hasNewKeyRow,
      loadDevices,
      openEdit,
      save,
      onDelete,
      handleSearch,
      handleDeviceSeriesFilterChange,
      handleDeviceSizeChange,
      handleDeviceCurrentChange,
      loadDeviceKeys,
      loadHospitals,
      loadCountryOptions,
      loadRegionOptions,
      remoteSearchHospitalsForFilter,
      remoteSearchHospitals,
      onDeviceSeriesChange,
      onDeviceHospitalChange,
      onCountryChange,
      onRegionChange,
      handleHospitalSearch,
      handleHospitalSizeChange,
      handleHospitalCurrentChange,
      openHospitalEdit,
      onHospitalFormCountryChange,
      onHospitalCodeSuffixInput,
      checkHospitalCodeDuplicate,
      saveHospital,
      onDeleteHospital,
      addNewKeyRow,
      editKeyRow,
      cancelEditKey,
      saveKeyRow,
      deleteKey,
      tableHeight
    }
  }
}
</script>

<style scoped>
.devices-container {
  height: calc(100vh - 64px);
  background: rgb(var(--background));
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

.main-tabs {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.search-section {
  display: flex;
  align-items: center;
}

.action-section {
  display: flex;
  gap: 10px;
}

/* 表格容器 - 固定表头 */
.table-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.table-container :deep(.el-table) {
  flex: 1;
  width: 100%;
}

.table-container :deep(.el-table__body-wrapper) {
  overflow: auto !important; /* 纵向与横向均可滚动，避免列被裁剪 */
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 0 12px 0; /* 上8px， 下12px */
  margin-top: auto;
  border-top: 1px solid rgb(var(--border));
  background: rgb(var(--background));
}

.keys-management {
  padding: 10px 0;
}

.keys-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.keys-title {
  font-size: 14px;
  font-weight: 500;
  color: rgb(var(--text-primary));
}

.empty-keys {
  padding: 40px 0;
  text-align: center;
}

.add-key-row {
  margin-top: 16px;
  text-align: center;
}

code {
  background-color: rgb(var(--bg-secondary));
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 12px;
  color: rgb(var(--text-primary));
}

.error-input {
  border-color: rgb(var(--text-error-primary));
}

.error-message {
  color: rgb(var(--text-error-primary));
  font-size: 12px;
  margin-top: 4px;
}

/* Dialog 视口布局由 design-tokens 全局 --dialog-* 提供 */
</style>
