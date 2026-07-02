function withTimeout(promise, timeoutMs, label) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`${label} timeout after ${ms}ms`);
        err.code = 'STEP_TIMEOUT';
        reject(err);
      }, ms);
    })
  ]);
}

function createRuntimeStepLogger(jobId) {
  const normalizedJobId = String(jobId || '');

  function log(step, extra = {}) {
    console.log('[conversation-step]', {
      jobId: normalizedJobId,
      step,
      ...extra
    });
  }

  function error(step, err, extra = {}) {
    console.error('[conversation-step-error]', {
      jobId: normalizedJobId,
      step,
      message: String(err?.message || err || ''),
      code: String(err?.code || ''),
      ...extra
    });
  }

  return { log, error };
}

module.exports = {
  withTimeout,
  createRuntimeStepLogger
};
