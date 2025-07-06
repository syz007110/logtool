import api from '../../api'

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

  async forgotPassword({ commit }, email) {
    try {
      const response = await api.auth.forgotPassword(email)
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
    commit('SET_LANGUAGE', language)
  }
}

const getters = {
  isAuthenticated: state => !!state.token,
  userRole: state => state.user ? state.user.role : null,
  currentUser: state => state.user,
  currentLanguage: state => state.language
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
} 