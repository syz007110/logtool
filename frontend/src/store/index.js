import { createStore } from 'vuex'
import auth from './modules/auth'
import errorCodes from './modules/errorCodes'
import logs from './modules/logs'
import users from './modules/users'

export default createStore({
  modules: {
    auth,
    errorCodes,
    logs,
    users
  }
}) 