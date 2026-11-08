class AuthError extends Error {
  constructor(code, status, message = '认证失败', { expose = true, retryAfter = null } = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
    this.expose = expose;
    this.retryAfter = retryAfter;
  }
}

module.exports = { AuthError };
