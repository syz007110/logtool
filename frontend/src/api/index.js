import axios from 'axios'
import { ElMessage } from 'element-plus'
import store from '../store'
import router from '../router'

// 创建axios实例
const api = axios.create({
  baseURL: '/api',
  timeout: 30000
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
          ElMessage.error('登录已过期，请重新登录')
          store.dispatch('auth/logout')
          router.push('/login')
          break
        case 403:
          ElMessage.error('权限不足')
          break
        case 404:
          ElMessage.error('请求的资源不存在')
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
  register: (userData) => api.post('/auth/register', userData),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email })
}

const errorCodes = {
  getList: (params) => api.get('/error-codes', { params }),
  create: (data) => api.post('/error-codes', data),
  update: (id, data) => api.put(`/error-codes/${id}`, data),
  delete: (id) => api.delete(`/error-codes/${id}`),
  exportXML: (params) => api.get('/xml-export', { params, responseType: 'blob' })
}

const logs = {
  getList: (params) => api.get('/logs', { params }),
  upload: (formData) => api.post('/logs/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  parse: (id) => api.post(`/logs/${id}/parse`),
  download: (id) => api.get(`/logs/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/logs/${id}`),
  getEntries: (id) => api.get(`/logs/${id}/entries`),
  getBatchEntries: (params) => api.get('/logs/entries/batch', { params }),
  autoFillDeviceId: (key) => api.get('/logs/auto-fill/device-id', { params: { key } }),
  autoFillKey: (deviceId) => api.get('/logs/auto-fill/key', { params: { device_id: deviceId } })
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

export default {
  auth,
  errorCodes,
  logs,
  users,
  roles,
  i18n
} 