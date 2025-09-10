import axios from 'axios'
import { ElMessage } from 'element-plus'
import store from '../store'
import router from '../router'

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
            ElMessage.error(data.message || '用户名或密码错误')
          } else {
            // 其他接口的401错误，说明token过期
            ElMessage.error('登录已过期，请重新登录')
            store.dispatch('auth/logout')
            router.push('/login')
          }
          break
        case 403:
          ElMessage.error('权限不足')
          break
        case 404:
          ElMessage.error(data?.message || '请求的资源不存在')
          break
        case 500:
          ElMessage.error('服务器内部错误')
          break
        default:
          ElMessage.error(data.message || '请求失败')
      }
    } else {
      ElMessage.error('网络连接失败')
    }
    return Promise.reject(error)
  }
)

// API模块
const auth = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData)
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
  })
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
  assignRole: (userId, roleId) => api.post(`/users/${userId}/roles`, { roleId })
}

const roles = {
  getList: () => api.get('/roles'),
  create: (data) => api.post('/roles', data),
  update: (id, data) => api.put(`/roles/${id}`, data),
  delete: (id) => api.delete(`/roles/${id}`)
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
  analyzeByLogIds: (logIds) => api.post('/surgery-statistics/analyze-by-log-ids', { logIds }),
  getAnalysisTaskStatus: (taskId) => api.get(`/surgery-statistics/task/${taskId}`),
  getUserAnalysisTasks: () => api.get('/surgery-statistics/tasks'),
  exportReport: (id) => api.get(`/surgery-statistics/${id}/export`, { responseType: 'blob' }),
  exportPostgreSQLData: (params) => api.get('/surgery-statistics/export/postgresql', { params }),
  exportSingleSurgeryData: (id) => api.get(`/surgery-statistics/${id}/export-data`),
  getPostgreSQLSurgeries: (params) => api.get('/surgery-statistics/postgresql', { params })
}

const devices = {
  getList: (params) => api.get('/devices', { params }),
  create: (data) => api.post('/devices', data),
  update: (id, data) => api.put(`/devices/${id}`, data),
  delete: (id) => api.delete(`/devices/${id}`),
  autoFillDeviceId: (key) => api.get('/devices/auto-fill/device-id', { params: { key } }),
  autoFillKey: (deviceId) => api.get('/devices/auto-fill/key', { params: { device_id: deviceId } })
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

export default {
  auth,
  errorCodes,
  i18nErrorCodes,
  logs,
  operationLogs,
  users,
  roles,
  i18n,
  surgeryStatistics,
  devices,
  motionData,
  feedback,
  dashboard,
  explanations
}
