import api from '../../api'

const state = {
  errorCodes: [],
  loading: false,
  total: 0
}

const mutations = {
  SET_ERROR_CODES (state, errorCodes) {
    state.errorCodes = errorCodes
  },
  SET_LOADING (state, loading) {
    state.loading = loading
  },
  SET_TOTAL (state, total) {
    state.total = total
  }
}

const actions = {
  async fetchErrorCodes ({ commit }, params = {}) {
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

  async createErrorCode ({ dispatch }, errorCodeData) {
    try {
      const response = await api.errorCodes.create(errorCodeData)
      // 创建成功后重新获取列表
      await dispatch('fetchErrorCodes')
      return response
    } catch (error) {
      throw error
    }
  },

  async updateErrorCode ({ dispatch }, { id, data }) {
    try {
      const response = await api.errorCodes.update(id, data)
      // 更新成功后重新获取列表
      await dispatch('fetchErrorCodes')
      return response
    } catch (error) {
      throw error
    }
  },

  async updateErrorCodeByCode ({ dispatch }, { code, subsystem, data }) {
    try {
      // 先根据故障码和子系统查找故障码
      const findResponse = await api.errorCodes.getByCodeAndSubsystem(code, subsystem)
      if (findResponse.data && findResponse.data.errorCode) {
        // 如果找到了，则更新
        const response = await api.errorCodes.update(findResponse.data.errorCode.id, data)
        await dispatch('fetchErrorCodes')
        return response
      } else {
        // 如果没找到，则创建新的
        const response = await api.errorCodes.create(data)
        await dispatch('fetchErrorCodes')
        return response
      }
    } catch (error) {
      throw error
    }
  },

  async deleteErrorCode ({ dispatch }, id) {
    try {
      const response = await api.errorCodes.delete(id)
      // 删除成功后重新获取列表
      await dispatch('fetchErrorCodes')
      return response
    } catch (error) {
      throw error
    }
  },

  async exportXML (_, language = 'chinese') {
    try {
      const response = await api.errorCodes.exportXML(language)
      return response
    } catch (error) {
      throw error
    }
  }
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
