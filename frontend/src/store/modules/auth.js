import api from '../../api'

const PERSIST_KEY = 'auth_persist'

function readJson (storage, key) {
  try {
    const v = storage.getItem(key)
    return v ? JSON.parse(v) : null
  } catch (_) {
    return null
  }
}

function getInitialPersist () {
  if (localStorage.getItem(PERSIST_KEY) === '1') return true
  if (localStorage.getItem('token')) return true
  if (sessionStorage.getItem(PERSIST_KEY) === '1') return false
  return false
}

function getInitialToken () {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || null
}

function getInitialUser () {
  return readJson(localStorage, 'user') || readJson(sessionStorage, 'user') || null
}

function applyPersistence (state) {
  const primary = state.persist ? localStorage : sessionStorage
  const secondary = state.persist ? sessionStorage : localStorage
  if (state.token) primary.setItem('token', state.token)
  else primary.removeItem('token')
  if (state.user) primary.setItem('user', JSON.stringify(state.user))
  else primary.removeItem('user')
  secondary.removeItem('token')
  secondary.removeItem('user')
  localStorage.setItem(PERSIST_KEY, state.persist ? '1' : '0')
  sessionStorage.setItem(PERSIST_KEY, state.persist ? '1' : '0')
}

const state = {
  token: getInitialToken(),
  user: getInitialUser(),
  persist: getInitialPersist(),
  language: localStorage.getItem('language') || 'zh-CN'
}

const mutations = {
  SET_PERSIST (state, persist) {
    state.persist = !!persist
    applyPersistence(state)
  },
  SET_TOKEN (state, token) {
    state.token = token
    applyPersistence(state)
  },
  SET_PERMISSIONS (state, permissions) {
    if (!state.user) return
    state.user = { ...state.user, permissions: Array.isArray(permissions) ? permissions : [] }
    applyPersistence(state)
  },
  SET_USER (state, user) {
    const authorization = user?.authorization || { roles: [], isSuperAdmin: false, permissions: [] }
    state.user = user ? { ...user, authorization, permissions: authorization.permissions || [], isSuperAdmin: !!authorization.isSuperAdmin } : null
    applyPersistence(state)
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
      commit('SET_PERSIST', !!credentials?.rememberMe)
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

  async dingtalkLogin ({ commit }, { authCode, rememberMe = true }) {
    try {
      const response = await api.auth.dingtalkLogin(authCode, rememberMe)
      commit('SET_PERSIST', !!rememberMe)
      commit('SET_TOKEN', response.data.token)
      commit('SET_USER', response.data.user)
      return response
    } catch (error) {
      throw error
    }
  },

  async refreshToken ({ commit }) {
    const response = await api.auth.refresh()
    commit('SET_TOKEN', response.data.token)
    return response
  },

  logout ({ commit }) {
    api.auth.logout().catch(() => {})
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

const getters = {
  isAuthenticated: (state) => !!state.token,
  mustChangePassword: (state) => !!state.user?.mustChangePassword,
  userRole: (state) => state.user?.authorization?.roles?.[0] || null,
  currentUser: state => state.user,
  currentLanguage: state => state.language,
  hasPermission: (state) => (permission) => {
    try {
      if (!state.user) return false

      if (state.user.isSuperAdmin) return true

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
