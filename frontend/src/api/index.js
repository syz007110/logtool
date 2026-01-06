import axios from 'axios'
import { ElMessage } from 'element-plus'
import store from '../store'
import router from '../router'
import i18nInstance from '../i18n'

// 创建axios实例
const api = axios.create({
  baseURL: '/api',
  timeout: 120000 // 增加到2分钟，支持大量日志文件的批量查询
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    const token = store.state.auth?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // 添加 Accept-Language 头，让后端知道前端需要的语言
    const currentLang = i18nInstance.global.locale.value || 'zh-CN'
    const langHeader = currentLang.startsWith('en') ? 'en' : 'zh'
    config.headers['Accept-Language'] = langHeader
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截器
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      const { status, data } = error.response
      switch (status) {
        case 401:
          // 检查是否是登录接口的错误，如果是则显示具体的错误信息
          if (error.config.url && error.config.url.includes('/auth/login')) {
            // 登录接口的错误，显示后端返回的具体错误信息
            ElMessage.error(data.message || i18nInstance.global.t('auth.invalidCredentials'))
          } else {
            // 其他接口的401错误，说明token过期
            ElMessage.error(i18nInstance.global.t('auth.tokenExpired'))
            store.dispatch('auth/logout')
            router.push('/login')
          }
          break
        case 403:
          ElMessage.error(i18nInstance.global.t('auth.insufficientPermissions'))
          break
        case 404:
          ElMessage.error(data?.message || i18nInstance.global.t('shared.resourceNotFound'))
          break
        case 500:
          ElMessage.error(i18nInstance.global.t('shared.serverError'))
          break
        default:
          ElMessage.error(data.message || i18nInstance.global.t('shared.requestFailed'))
      }
    } else {
      ElMessage.error(i18nInstance.global.t('shared.networkError'))
    }
    return Promise.reject(error)
  }
)

// API模块
const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  me: () => api.get('/auth/me'),
  dingtalkLogin: (authCode) => api.post('/auth/dingtalk/login', { authCode })
}

const errorCodes = {
  getList: (params) => api.get('/error-codes', { params }),
  create: (data) => api.post('/error-codes', data),
  update: (id, data) => api.put(`/error-codes/${id}`, data),
  delete: (id) => api.delete(`/error-codes/${id}`),
  getByCodeAndSubsystem: (code, subsystem) => api.get('/error-codes/by-code', {
    params: { code, subsystem }
  }),
  exportXML: (language = 'zh') => api.get('/error-codes/export/xml', {
    params: { language },
    responseType: 'blob'
  }),
  exportMultiXML: (languages = 'zh') => api.get('/error-codes/export/multi-xml', {
    params: { languages },
    responseType: 'json'
  }),
  // CSV 导出：后端现在使用单个 language 参数，并根据该语言替换多语言字段内容
  exportCSV: (language = '', format = 'csv') => api.get('/error-codes/export/csv', {
    params: { language, format },
    responseType: 'blob'
  }),
  // 获取故障码的指定语言的多语言内容（技术说明字段）
  getI18nByLang: (id, lang) => api.get(`/error-codes/${id}/i18n`, {
    params: { lang }
  }),
  // 保存故障码的指定语言的多语言内容（技术说明字段）
  saveI18nByLang: (id, lang, data) => api.put(`/error-codes/${id}/i18n`, {
    lang,
    ...data
  }),
  // 自动翻译故障码的技术说明字段
  autoTranslateI18n: (id, lang, overwrite = false) => api.post(`/error-codes/${id}/i18n/auto-translate`, {
    lang,
    overwrite
  }),
  // 技术排查方案：获取/更新/上传图片
  getTechSolution: (id) => api.get(`/error-codes/${id}/tech-solution`),
  updateTechSolution: (id, data) => api.put(`/error-codes/${id}/tech-solution`, data),
  uploadTechImages: (formData) => api.post('/error-codes/tech-solution/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  cleanupTempFiles: (urls) => api.post('/error-codes/tech-solution/cleanup-temp', { urls })
}

const i18nErrorCodes = {
  getList: (params) => api.get('/i18n-error-codes', { params }),
  upsert: (data) => api.post('/i18n-error-codes', data),
  delete: (id) => api.delete(`/i18n-error-codes/${id}`),
  batchImport: (data) => api.post('/i18n-error-codes/batch-import', data),
  uploadCSV: (formData) => api.post('/i18n-error-codes/upload-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getLanguages: () => api.get('/i18n-error-codes/languages'),
  getSubsystems: () => api.get('/i18n-error-codes/subsystems')
}

const logs = {
  getList: (params) => api.get('/logs', { params }),
  getByDevice: (params) => api.get('/logs/by-device', { params }),
  getTimeFilters: (params) => api.get('/logs/time-filters', { params }),
  upload: (formData) => api.post('/logs/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  parse: (id) => api.post(`/logs/${id}/parse`),
  reparse: (id) => api.post(`/logs/${id}/reparse`),
  download: (id) => api.get(`/logs/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/logs/${id}`),
  batchDelete: (logIds) => api.delete('/logs/batch', { data: { logIds } }),
  batchDownload: (logIds) => api.post('/logs/batch/download', { logIds }, { responseType: 'blob' }),
  batchReparse: (logIds) => api.post('/logs/batch/reparse', { logIds }),
  getEntries: (id) => api.get(`/logs/${id}/entries`),
  getBatchEntries: (params, signal = null) => api.get('/logs/entries/batch', {
    params,
    signal // 支持 AbortController
  }),
  getStatistics: (params) => api.get('/logs/entries/statistics', { params }),
  getVisualizationData: (params) => api.get('/logs/entries/visualization', { params }),
  exportBatchEntries: (params) => api.get('/logs/entries/export', { params, responseType: 'blob' }),
  autoFillDeviceId: (key) => api.get('/logs/auto-fill/device-id', { params: { key } }),
  autoFillKey: (deviceId) => api.get('/logs/auto-fill/key', { params: { device_id: deviceId } }),
  analyzeSurgery: (logId) => api.get(`/logs/${logId}/surgery-analysis`),
  getSearchTemplates: () => api.get('/logs/search-templates'),
  importSearchTemplates: (templates) => api.post('/logs/search-templates/import', { templates })
}

const operationLogs = {
  getList: (params) => api.get('/operation-logs', { params })
}

const users = {
  getList: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  assignRole: (userId, roleId) => api.post('/user-roles/assign', { user_id: userId, role_id: roleId })
}

const roles = {
  getList: () => api.get('/roles'),
  create: (data) => api.post('/roles', data),
  update: (id, data) => api.put(`/roles/${id}`, data),
  delete: (id) => api.delete(`/roles/${id}`)
}

const permissions = {
  getList: () => api.get('/permissions')
}

const analysisCategories = {
  getList: (params) => api.get('/analysis-categories', { params }),
  create: (data) => api.post('/analysis-categories', data),
  update: (id, data) => api.put(`/analysis-categories/${id}`, data),
  delete: (id) => api.delete(`/analysis-categories/${id}`),
  getPresets: () => api.get('/analysis-categories/presets')
}

// Fault case status dictionary (MySQL)
const faultCaseStatuses = {
  getList: (params) => api.get('/fault-case-statuses', { params }),
  create: (data) => api.post('/fault-case-statuses', data),
  update: (id, data) => api.put(`/fault-case-statuses/${id}`, data),
  delete: (id) => api.delete(`/fault-case-statuses/${id}`),
  getMappings: (statusId) => api.get(`/fault-case-statuses/${statusId}/mappings`),
  createMapping: (statusId, data) => api.post(`/fault-case-statuses/${statusId}/mappings`, data),
  updateMapping: (mappingId, data) => api.put(`/fault-case-statuses/mappings/${mappingId}`, data),
  deleteMapping: (mappingId) => api.delete(`/fault-case-statuses/mappings/${mappingId}`)
}

// Fault case module dictionary (MySQL)
const faultCaseModules = {
  getList: (params) => api.get('/fault-case-modules', { params }),
  create: (data) => api.post('/fault-case-modules', data),
  update: (id, data) => api.put(`/fault-case-modules/${id}`, data),
  delete: (id) => api.delete(`/fault-case-modules/${id}`),
  getMappings: (moduleId) => api.get(`/fault-case-modules/${moduleId}/mappings`),
  createMapping: (moduleId, data) => api.post(`/fault-case-modules/${moduleId}/mappings`, data),
  updateMapping: (mappingId, data) => api.put(`/fault-case-modules/mappings/${mappingId}`, data),
  deleteMapping: (mappingId) => api.delete(`/fault-case-modules/mappings/${mappingId}`)
}

const i18n = {
  getList: (params) => api.get('/i18n', { params }),
  create: (data) => api.post('/i18n', data),
  update: (id, data) => api.put(`/i18n/${id}`, data),
  delete: (id) => api.delete(`/i18n/${id}`)
}

const surgeryStatistics = {
  getList: (params) => api.get('/surgery-statistics', { params }),
  analyze: (logId) => api.get(`/logs/${logId}/surgery-analysis`),
  analyzeSortedEntries: (logEntries) => api.post('/surgery-statistics/analyze-sorted-entries', { logEntries }),
  analyzeByLogIds: (logIds, includePostgreSQLStructure = false) => api.post('/surgery-statistics/analyze-by-log-ids', { logIds, includePostgreSQLStructure }),
  getAnalysisTaskStatus: (taskId) => api.get(`/surgery-statistics/task/${taskId}`),
  getUserAnalysisTasks: () => api.get('/surgery-statistics/tasks'),
  exportReport: (id) => api.get(`/surgery-statistics/${id}/export`, { responseType: 'blob' }),
  exportPostgreSQLData: (params) => api.get('/surgery-statistics/export/postgresql', { params }),
  exportSingleSurgeryData: (surgeryData) => api.post('/surgery-statistics/export-single', surgeryData),
  confirmOverrideSurgeryData: (surgeryData, confirmOverride = true) => api.post('/surgery-statistics/confirm-override', { surgeryData, confirmOverride }),
  getPostgreSQLSurgeries: (params) => api.get('/surgery-statistics/postgresql', { params })
}

// Surgeries CRUD (PostgreSQL persisted)
const surgeries = {
  list: (params) => api.get('/surgeries', { params }),
  get: (id) => api.get(`/surgeries/${id}`),
  remove: (id) => api.delete(`/surgeries/${id}`),
  getLogEntriesByRange: (id) => api.get(`/surgeries/${id}/log-entries`),
  getTimeFilters: (params) => api.get('/surgeries/time-filters', { params })
}

const devices = {
  getList: (params) => api.get('/devices', { params }),
  create: (data) => api.post('/devices', data),
  update: (id, data) => api.put(`/devices/${id}`, data),
  delete: (id) => api.delete(`/devices/${id}`),
  autoFillDeviceId: (key) => api.get('/devices/auto-fill/device-id', { params: { key } }),
  autoFillKey: (deviceId) => api.get('/devices/auto-fill/key', { params: { device_id: deviceId } }),
  // 密钥管理
  getKeys: (deviceId) => api.get(`/devices/${deviceId}/keys`),
  createKey: (deviceId, data) => api.post(`/devices/${deviceId}/keys`, data),
  updateKey: (keyId, data) => api.put(`/devices/keys/${keyId}`, data),
  deleteKey: (keyId) => api.delete(`/devices/keys/${keyId}`)
}

// Device model dictionary (MySQL)
const deviceModels = {
  getList: (params) => api.get('/device-models', { params }),
  create: (data) => api.post('/device-models', data),
  update: (id, data) => api.put(`/device-models/${id}`, data),
  delete: (id) => api.delete(`/device-models/${id}`)
}

// Motion data APIs
const motionData = {
  getConfig: () => api.get('/motion-data/config'),
  getDhModel: () => api.get('/motion-data/dh-model'),
  upload: (formData) => api.post('/motion-data/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  preview: (id, params) => api.get(`/motion-data/${id}/preview`, { params }),
  downloadCsv: (id) => api.get(`/motion-data/${id}/download-csv`, { responseType: 'blob' })
}

const feedback = {
  create: (formData) => api.post('/feedback', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getList: (params) => api.get('/feedback', { params }),
  getDetail: (id) => api.get(`/feedback/${id}`),
  updateStatus: (id, status) => api.put(`/feedback/${id}/status`, { status })
}

const dashboard = {
  getStats: () => api.get('/dashboard/stats')
}

const explanations = {
  preview: (payload) => api.post('/explanations/preview', payload)
}

// 监控API
const monitoring = {
  getOverview: () => api.get('/monitoring/overview'),
  getMetricsHistory: (params) => api.get('/monitoring/metrics/history', { params }),
  getRealtimeMetrics: () => api.get('/monitoring/metrics/realtime'),
  getAlerts: () => api.get('/monitoring/alerts'),
  getAlertsHistory: (params) => api.get('/monitoring/alerts/history', { params }),
  setAlertThresholds: (thresholds) => api.post('/monitoring/alerts/thresholds', { thresholds }),
  setClusterMode: (mode) => api.post('/monitoring/cluster/mode', { mode })
}

// Fault cases (MongoDB)
const faultCases = {
  latest: (params) => api.get('/fault-cases/latest', { params }),
  search: (params) => api.get('/fault-cases/search', { params }),
  get: (id) => api.get(`/fault-cases/${id}`),
  create: (data) => api.post('/fault-cases', data),
  update: (id, data) => api.put(`/fault-cases/${id}`, data),
  delete: (id) => api.delete(`/fault-cases/${id}`),
  uploadAttachments: (formData) => api.post('/fault-cases/attachments/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  // i18n
  getI18nByLang: (id, lang) => api.get(`/fault-cases/${id}/i18n`, { params: { lang } }),
  saveI18nByLang: (id, lang, data) => api.put(`/fault-cases/${id}/i18n`, { lang, ...data }),
  autoTranslateI18n: (id, lang, overwrite = false) => api.post(`/fault-cases/${id}/i18n/auto-translate`, { lang, overwrite })
}

// Jira integration (proxy via backend)
const jira = {
  search: (params) => api.get('/jira/search', { params }),
  searchMixed: (params) => api.get('/jira/search-mixed', { params }),
  getIssue: (key) => api.get(`/jira/issue/${encodeURIComponent(String(key || '').trim())}`)
}

// Smart Search (aggregated)
const smartSearch = {
  search: (payload) => api.post('/smart-search/search', payload)
}

export default {
  auth,
  errorCodes,
  i18nErrorCodes,
  logs,
  operationLogs,
  users,
  roles,
  permissions,
  analysisCategories,
  faultCaseStatuses,
  faultCaseModules,
  i18n,
  surgeryStatistics,
  devices,
  deviceModels,
  motionData,
  feedback,
  dashboard,
  explanations,
  surgeries,
  monitoring,
  faultCases,
  jira,
  smartSearch
}
