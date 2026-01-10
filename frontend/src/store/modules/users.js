import api from '../../api'

const state = {
  users: [],
  roles: [],
  loading: false,
  total: 0, // 用户总数
  rolesTotal: 0 // 角色总数
}

const mutations = {
  SET_USERS (state, users) {
    state.users = users
  },
  SET_ROLES (state, roles) {
    state.roles = roles
  },
  SET_LOADING (state, loading) {
    state.loading = loading
  },
  SET_TOTAL (state, total) {
    state.total = total
  },
  SET_ROLES_TOTAL (state, total) {
    state.rolesTotal = total
  }
}

const actions = {
  async fetchUsers ({ commit }, params = {}) {
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

  async fetchRoles ({ commit }, params = {}) {
    commit('SET_LOADING', true)
    try {
      const response = await api.roles.getList(params)
      commit('SET_ROLES', response.data.roles)
      commit('SET_ROLES_TOTAL', response.data.total)
      return response
    } catch (error) {
      throw error
    } finally {
      commit('SET_LOADING', false)
    }
  },

  // 角色管理：创建角色（含权限）
  async createRole ({ dispatch }, roleData) {
    try {
      const response = await api.roles.create(roleData)
      // 创建成功后刷新角色列表（不传递参数，由前端页面控制刷新）
      return response
    } catch (error) {
      throw error
    }
  },

  // 角色管理：更新角色（含权限）
  async updateRole ({ dispatch }, { id, data }) {
    try {
      const response = await api.roles.update(id, data)
      // 更新成功后刷新角色列表（不传递参数，由前端页面控制刷新）
      return response
    } catch (error) {
      throw error
    }
  },

  // 角色管理：删除角色
  async deleteRole ({ dispatch }, id) {
    try {
      const response = await api.roles.delete(id)
      // 删除成功后刷新角色列表（不传递参数，由前端页面控制刷新）
      return response
    } catch (error) {
      throw error
    }
  },

  async createUser ({ commit }, userData) {
    try {
      const response = await api.users.create(userData)
      return response
    } catch (error) {
      throw error
    }
  },

  async updateUser ({ commit }, { id, data }) {
    try {
      const response = await api.users.update(id, data)
      return response
    } catch (error) {
      throw error
    }
  },

  async deleteUser ({ commit }, id) {
    try {
      const response = await api.users.delete(id)
      return response
    } catch (error) {
      throw error
    }
  },

  async assignUserRole ({ commit }, { userId, roleId }) {
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
  totalCount: state => state.total, // 用户总数
  rolesTotalCount: state => state.rolesTotal // 角色总数
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
}
