const { attachmentScanQueue } = require('../config/queue');

function buildAttachmentScanJobId(request = {}, instanceId = 0) {
  const messageId = String(request?.message?.externalMessageId || request?.requestId || '').trim() || `msg_${Date.now()}`;
  return `attachment-scan:${instanceId}:${messageId}`;
}

async function enqueueAttachmentScan({ request, instanceId }) {
  const jobId = buildAttachmentScanJobId(request, instanceId);
  try {
    return await attachmentScanQueue.add('attachment-scan', { request, instanceId }, { jobId });
  } catch (error) {
    if (!String(error?.message || '').includes('Job already exists')) throw error;
    const existing = await attachmentScanQueue.getJob(jobId);
    if (existing) return existing;
    throw error;
  }
}

async function runAttachmentScan({ request, instanceId, timeoutMs = 30000 }) {
  const job = await enqueueAttachmentScan({ request, instanceId });
  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error(`attachment scan timeout after ${timeoutMs}ms`);
      err.code = 'ATTACHMENT_SCAN_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([job.finished(), timeout]);
}

module.exports = {
  buildAttachmentScanJobId,
  enqueueAttachmentScan,
  runAttachmentScan
};
