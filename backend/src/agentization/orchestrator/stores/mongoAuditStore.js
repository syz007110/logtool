const mongoose = require('mongoose');

function pickFinalStatus(event) {
  const status = String(event?.toStatus || '').trim();
  if (status === 'completed' || status === 'failed' || status === 'degraded') return status;
  return null;
}

function createMongoAuditStore(options = {}) {
  const collectionName = String(options.collectionName || 'agent_task_audits');
  const strictFinalOnly = options.finalOnly !== false;
  const now = typeof options.now === 'function' ? options.now : Date.now;

  function getCollection() {
    if (mongoose.connection?.readyState !== 1) return null;
    return mongoose.connection.collection(collectionName);
  }

  async function append(event) {
    const finalStatus = pickFinalStatus(event);
    if (strictFinalOnly && !finalStatus) return;

    const col = getCollection();
    if (!col) return;

    const doc = {
      taskId: String(event?.taskId || ''),
      traceId: String(event?.traceId || event?.payload?.traceId || ''),
      requestId: String(event?.requestId || event?.payload?.requestId || ''),
      finalStatus,
      attempt: Number(event?.attempt || 0),
      reason: String(event?.reason || ''),
      error: event?.error || null,
      summary: String(event?.summary || ''),
      meta: event?.payload && typeof event.payload === 'object' ? event.payload : {},
      createdAt: new Date(Number(event?.timestamp || now()))
    };

    await col.updateOne(
      { taskId: doc.taskId },
      { $set: doc },
      { upsert: true }
    );
  }

  return {
    append
  };
}

module.exports = {
  createMongoAuditStore
};
