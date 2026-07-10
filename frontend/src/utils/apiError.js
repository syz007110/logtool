import { ElMessage } from 'element-plus'
import i18nInstance, { hasI18nKey } from '@/i18n'

const NOTIFIED_FLAG = '__notified'

export function normalizeApiError (error) {
  if (!error || typeof error !== 'object') return null

  const response = error.response || {}
  const data = response.data || {}
  const code = data.code || data.errorCode || data.error_code || data.error
  const message = data.message || data.errorMessage || data.error_message

  error.apiError = {
    status: response.status,
    code,
    message,
    details: data.details || data.errors || data.errorDetails,
    raw: data
  }

  return error.apiError
}

export function markApiErrorNotified (error) {
  if (error && typeof error === 'object') {
    error[NOTIFIED_FLAG] = true
  }
}

export function isApiErrorNotified (error) {
  return Boolean(error && typeof error === 'object' && error[NOTIFIED_FLAG])
}

export function resolveApiErrorMessage (error, fallback) {
  const apiError = error?.apiError || normalizeApiError(error) || {}
  const code = apiError.code

  if (code) {
    const key = `apiErrors.${code}`
    if (hasI18nKey(key)) {
      return i18nInstance.global.t(key)
    }
  }

  if (apiError.message) return apiError.message
  if (error?.code === 'ECONNABORTED') return i18nInstance.global.t('shared.networkError')
  if (!error?.response) return error?.message || fallback || i18nInstance.global.t('shared.networkError')

  return fallback || i18nInstance.global.t('shared.requestFailed')
}

export function notifyApiError (error, fallback, options = {}) {
  if (isApiErrorNotified(error)) return

  const message = resolveApiErrorMessage(error, fallback)
  ElMessage.error({
    message,
    grouping: options.grouping !== false
  })
  markApiErrorNotified(error)
}
