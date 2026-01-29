import api from '../../api'

const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  language: localStorage.getItem('language') || 'zh-CN'
}

const mutations = {
  SET_TOKEN (state, token) {
    state.token = token
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  },
  SET_PERMISSIONS (state, permissions) {
    if (!state.user) return
    state.user = { ...state.user, permissions: Array.isArray(permissions) ? permissions : [] }
    localStorage.setItem('user', JSON.stringify(state.user))
  },
  SET_USER (state, user) {
    state.user = user
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      localStorage.removeItem('user')
    }
  },
  SET_LANGUAGE (state, language) {
    state.language = language
    localStorage.setItem('language', language)
  }
}

const actions = {
  async login ({ commit }, credentials) {
    try {
      const response = await api.auth.login(credentials)
      commit('SET_TOKEN', response.data.token)
      commit('SET_USER', response.data.user)
      return response
    } catch (error) {
      throw error
    }
  },

  async refreshMe ({ commit }) {
    try {
      const response = await api.auth.me()
      commit('SET_USER', response.data.user)
      return response
    } catch (error) {
      throw error
    }
  },

  async register ({ commit }, userData) {
    try {
      const response = await api.auth.register(userData)
      return response
    } catch (error) {
      throw error
    }
  },

  async dingtalkLogin ({ commit }, { authCode }) {
    try {
      const response = await api.auth.dingtalkLogin(authCode)
      commit('SET_TOKEN', response.data.token)
      commit('SET_USER', response.data.user)
      return response
    } catch (error) {
      throw error
    }
  },

  logout ({ commit }) {
    commit('SET_TOKEN', null)
    commit('SET_USER', null)
  },

  setLanguage ({ commit }, language) {
    // 暂时只允许中文
    if (language === 'zh-CN') {
      commit('SET_LANGUAGE', language)
    }
  }
}

// 规范化角色名，兼容中英文与ID
function normalizeRoleName (roleName, roleId) {
  if (roleId === 1) return 'admin'
  if (roleId === 2) return 'expert'
  if (roleId === 3) return 'user'
  const name = (roleName || '').toString().trim().toLowerCase()
  if (name === 'admin' || name === '管理员') return 'admin'
  if (name === 'expert' || name === '专家' || name === '专家级' || name === '专家用户' || name === '专家级用户' || name === '工程师') return 'expert'
  if (name === 'user' || name === '普通用户' || name === '用户' || name === '成员') return 'user'
  return roleName || null
}

const getters = {
  isAuthenticated: (state) => !!state.token,
  mustChangePassword: (state) => !!state.user?.mustChangePassword,
  userRole: (state) => (state.user ? normalizeRoleName(state.user.role, state.user.role_id) : null),
  currentUser: state => state.user,
  currentLanguage: state => state.language,
  hasPermission: (state) => (permission) => {
    try {
      if (!state.user) return false

      // 管理员拥有所有权限
      const normalized = normalizeRoleName(state.user.role, state.user.role_id)
      if (normalized === 'admin') return true

      // 优先使用服务端返回的权限列表
      const perms = Array.isArray(state.user.permissions) ? state.user.permissions : []
      if (perms.includes(permission)) return true

      return false
    } catch (error) {
      console.error('Permission check error:', error)
      return false
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
