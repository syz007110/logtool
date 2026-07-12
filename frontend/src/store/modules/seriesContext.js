import api from '../../api'

const STORAGE_KEY = 'currentSeriesId'

function parseSeriesId (value) {
  const num = Number.parseInt(value, 10)
  return Number.isInteger(num) && num > 0 ? num : null
}

function getStoredSeriesId () {
  try {
    return parseSeriesId(window.localStorage.getItem(STORAGE_KEY))
  } catch (_) {
    return null
  }
}

function persistSeriesId (seriesId) {
  try {
    if (seriesId) {
      window.localStorage.setItem(STORAGE_KEY, String(seriesId))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch (_) {}
}

function readCapability (series, key) {
  if (!series || !series.capabilities) return false
  return Boolean(series.capabilities[key])
}

const state = {
  seriesList: [],
  currentSeriesId: getStoredSeriesId(),
  loading: false
}

const mutations = {
  SET_SERIES_LIST (state, seriesList) {
    state.seriesList = Array.isArray(seriesList) ? seriesList : []
  },
  SET_CURRENT_SERIES_ID (state, seriesId) {
    state.currentSeriesId = parseSeriesId(seriesId)
    persistSeriesId(state.currentSeriesId)
  },
  SET_LOADING (state, loading) {
    state.loading = Boolean(loading)
  }
}

const actions = {
  async loadSeriesList ({ commit, state }) {
    commit('SET_LOADING', true)
    try {
      const response = await api.deviceSeries.getList()
      const seriesList = response?.data?.series || []
      commit('SET_SERIES_LIST', seriesList)

      const exists = seriesList.some(item => item.id === state.currentSeriesId)
      if (!exists) {
        commit('SET_CURRENT_SERIES_ID', seriesList[0]?.id || null)
      }
      return seriesList
    } finally {
      commit('SET_LOADING', false)
    }
  },
  setCurrentSeriesId ({ commit }, seriesId) {
    commit('SET_CURRENT_SERIES_ID', seriesId)
  }
}

const getters = {
  seriesList: state => state.seriesList,
  currentSeriesId: state => state.currentSeriesId,
  currentSeries: state => state.seriesList.find(item => item.id === state.currentSeriesId) || null,
  isLoading: state => state.loading,
  currentSeriesCapabilities: (state, getters) => getters.currentSeries?.capabilities || {
    motion_parse: false,
    surgery_analyze: false
  },
  canMotionParse: (state, getters) => readCapability(getters.currentSeries, 'motion_parse'),
  canSurgeryAnalyze: (state, getters) => readCapability(getters.currentSeries, 'surgery_analyze')
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
}
