import api from '../../api'

const state = {
  users: [],
  roles: [],
  loading: false,
  total: 0
}

const mutations = {
  SET_USERS(state, users) {
    state.users = users
  },
  SET_ROLES(state, roles) {
    state.roles = roles
  },
  SET_LOADING(state, loading) {
    state.loading = loading
  },
  SET_TOTAL(state, total) {
    state.total = total
  }
}

const actions = {
  async fetchUsers({ commit }, params = {}) {
    commit('SET_LOADING', true)
    try {
      const response = await api.users.getList(params)
      commit('SET_USERS', response.data.users)
      commit('SET_TOTAL', response.data.total)
      return response
    } catch (error) {
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  async fetchRoles({ commit }) {
    try {
      const response = await api.roles.getList()
      commit('SET_ROLES', response.data.roles)
      return response
    } catch (error) {
      throw error
    }
  },

  async createUser({ commit }, userData) {
    try {
      const response = await api.users.create(userData)
      return response
    } catch (error) {
      throw error
    }
  },

  async updateUser({ commit }, { id, data }) {
    try {
      const response = await api.users.update(id, data)
      return response
    } catch (error) {
      throw error
    }
  },

  async deleteUser({ commit }, id) {
    try {
      const response = await api.users.delete(id)
      return response
    } catch (error) {
      throw error
    }
  },

  async assignUserRole({ commit }, { userId, roleId }) {
    try {
      const response = await api.users.assignRole(userId, roleId)
      return response
    } catch (error) {
      throw error
    }
  }
}

const getters = {
  usersList: state => state.users,
  rolesList: state => state.roles,
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