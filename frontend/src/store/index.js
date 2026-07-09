import { createStore } from 'vuex'
import auth from './modules/auth'
import errorCodes from './modules/errorCodes'
import logs from './modules/logs'
import seriesContext from './modules/seriesContext'
import users from './modules/users'

export default createStore({
  modules: {
    auth,
    errorCodes,
    logs,
    seriesContext,
    users
  }
})
