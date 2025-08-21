import api from '../../api'
import { computed, watch } from 'vue'

const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  language: localStorage.getItem('language') || 'zh-CN'
}

const mutations = {
  SET_TOKEN(state, token) {
    state.token = token
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  },
  SET_USER(state, user) {
    state.user = user
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      localStorage.removeItem('user')
    }
  },
  SET_LANGUAGE(state, language) {
    state.language = language
    localStorage.setItem('language', language)
  }
}

const actions = {
  async login({ commit }, credentials) {
    try {
      const response = await api.auth.login(credentials)
      commit('SET_TOKEN', response.data.token)
      commit('SET_USER', response.data.user)
      return response
    } catch (error) {
      throw error
    }
  },

  async register({ commit }, userData) {
    try {
      const response = await api.auth.register(userData)
      return response
    } catch (error) {
      throw error
    }
  },



  logout({ commit }) {
    commit('SET_TOKEN', null)
    commit('SET_USER', null)
  },

  setLanguage({ commit }, language) {
    // 暂时只允许中文
    if (language === 'zh-CN') {
      commit('SET_LANGUAGE', language)
    }
  }
}

// 规范化角色名，兼容中英文与ID
function normalizeRoleName(roleName, roleId) {
  if (roleId === 1) return 'admin'
  if (roleId === 2) return 'expert'
  if (roleId === 3) return 'user'
  const name = (roleName || '').toString().trim().toLowerCase()
  if (name === 'admin' || name === '管理员') return 'admin'
  if (name === 'expert' || name === '专家' || name === '工程师') return 'expert'
  if (name === 'user' || name === '普通用户' || name === '用户' || name === '成员') return 'user'
  return roleName || null
}

const getters = {
  isAuthenticated: state => !!state.token,
  userRole: state => state.user ? normalizeRoleName(state.user.role, state.user.role_id) : null,
  currentUser: state => state.user,
  currentLanguage: state => state.language,
  hasPermission: (state) => (permission) => {
    try {
      if (!state.user) {
        return false;
      }
      
      // 管理员拥有所有权限
      const normalized = normalizeRoleName(state.user.role, state.user.role_id)
      if (normalized === 'admin') {
        return true;
      }
      
      // 检查用户角色权限 - 支持单个角色字符串或角色数组
      const userRole = normalized;
      const userRoles = state.user.roles ? (Array.isArray(state.user.roles) ? state.user.roles : [state.user.roles]) : [];
      
      // 简化的权限检查逻辑 - 根据角色判断
      const rolePermissions = {
        'admin': ['error_code:create', 'error_code:read', 'error_code:update', 'error_code:delete', 'error_code:export', 'log:upload', 'log:read_all', 'log:read_own', 'log:parse', 'log:reparse', 'log:download', 'log:delete', 'i18n:create', 'i18n:read', 'i18n:update', 'i18n:delete', 'user:create', 'user:read', 'user:update', 'user:delete', 'user:role:assign', 'role:create', 'role:read', 'role:update', 'role:delete', 'history:read_all', 'history:export', 'surgery:analyze', 'surgery:read', 'surgery:export', 'data_replay:upload', 'data_replay:read', 'data_replay:download'],
        'expert': ['error_code:create', 'error_code:read', 'error_code:update', 'error_code:delete', 'error_code:export', 'log:upload', 'log:read_all', 'log:read_own', 'log:parse', 'log:download', 'log:delete_own', 'i18n:create', 'i18n:read', 'i18n:update', 'i18n:delete', 'history:read_own', 'surgery:analyze', 'surgery:read', 'surgery:export'],
        'user': ['error_code:read', 'error_code:export', 'log:upload', 'log:read_all', 'log:read_own', 'log:parse', 'log:download', 'log:delete_own', 'i18n:read', 'history:read_own', 'surgery:analyze', 'surgery:read', 'surgery:export']
      };
      
      // 首先检查单个角色
      if (userRole && rolePermissions[userRole] && rolePermissions[userRole].includes(permission)) {
        return true;
      }
      
      // 然后检查角色数组
      for (const role of userRoles) {
        const roleName = normalizeRoleName(role.name || role, role.id || role.role_id);
        if (rolePermissions[roleName] && rolePermissions[roleName].includes(permission)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
} 