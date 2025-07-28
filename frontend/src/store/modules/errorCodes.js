import api from '../../api'

const state = {
  errorCodes: [],
  loading: false,
  total: 0
}

const mutations = {
  SET_ERROR_CODES(state, errorCodes) {
    state.errorCodes = errorCodes
  },
  SET_LOADING(state, loading) {
    state.loading = loading
  },
  SET_TOTAL(state, total) {
    state.total = total
  }
}

const actions = {
  async fetchErrorCodes({ commit }, params = {}) {
    commit('SET_LOADING', true)
    try {
      const response = await api.errorCodes.getList(params)
      // 兼容后端返回 { errorCodes: [...] } 或 { errorCodes: [...], total: n }
      commit('SET_ERROR_CODES', response.data.errorCodes || [])
      commit('SET_TOTAL', response.data.total || (response.data.errorCodes ? response.data.errorCodes.length : 0))
      return response
    } catch (error) {
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },
  // 可扩展：create/update/delete 等
}

const getters = {
  errorCodesList: state => state.errorCodes,
  isLoading: state => state.loading,
  totalCount: state => state.total
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
} 