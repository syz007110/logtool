import api from '../../api'

const state = {
  logs: [],
  loading: false,
  total: 0
}

const mutations = {
  SET_LOGS (state, logs) {
    state.logs = logs
  },
  SET_LOADING (state, loading) {
    state.loading = loading
  },
  SET_TOTAL (state, total) {
    state.total = total
  }
}

const actions = {
  async fetchLogs ({ commit }, params = {}) {
    commit('SET_LOADING', true)
    try {
      const response = await api.logs.getList(params)
      commit('SET_LOGS', response.data.logs)
      commit('SET_TOTAL', response.data.total)
      return response
    } catch (error) {
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  async fetchLogsByDevice ({ commit }, params = {}) {
    commit('SET_LOADING', true)
    try {
      const response = await api.logs.getByDevice(params)
      return response
    } catch (error) {
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  async uploadLog ({ commit }, formData) {
    try {
      const response = await api.logs.upload(formData)
      return response
    } catch (error) {
      throw error
    }
  },

  async parseLog ({ commit }, logId) {
    try {
      const response = await api.logs.parse(logId)
      return response
    } catch (error) {
      throw error
    }
  },

  async reparseLog ({ commit }, logId) {
    try {
      const response = await api.logs.reparse(logId)
      return response
    } catch (error) {
      throw error
    }
  },

  async downloadLog ({ commit }, logId) {
    try {
      const response = await api.logs.download(logId)
      return response
    } catch (error) {
      throw error
    }
  },

  async deleteLog ({ commit }, logId) {
    try {
      const response = await api.logs.delete(logId)
      return response
    } catch (error) {
      throw error
    }
  },

  async batchDeleteLogs ({ commit }, logIds) {
    try {
      const response = await api.logs.batchDelete(logIds)
      return response
    } catch (error) {
      throw error
    }
  },

  async batchDownloadLogs ({ commit }, logIds) {
    try {
      const response = await api.logs.batchDownload(logIds)
      return response
    } catch (error) {
      throw error
    }
  },

  async batchReparseLogs ({ commit }, logIds) {
    try {
      const response = await api.logs.batchReparse(logIds)
      return response
    } catch (error) {
      throw error
    }
  },

  async fetchLogEntries ({ commit }, logId) {
    try {
      const response = await api.logs.getEntries(logId)
      return response
    } catch (error) {
      throw error
    }
  },

  async fetchBatchLogEntries ({ commit }, params) {
    try {
      const response = await api.logs.getBatchEntries(params)
      return response
    } catch (error) {
      throw error
    }
  },

  async autoFillDeviceId ({ commit }, key) {
    try {
      const response = await api.logs.autoFillDeviceId(key)
      return response
    } catch (error) {
      throw error
    }
  },

  async autoFillKey ({ commit }, deviceId) {
    try {
      const response = await api.logs.autoFillKey(deviceId)
      return response
    } catch (error) {
      throw error
    }
  },

  async analyzeSurgery ({ commit }, logId) {
    try {
      const response = await api.logs.analyzeSurgery(logId)
      return response
    } catch (error) {
      throw error
    }
  }
}

const getters = {
  logsList: state => state.logs,
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
