const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { translateQueue } = require('../config/queue');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeFileExt(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return ext || '';
}

function buildOutputFileName(originalName, targetLang) {
  const ext = safeFileExt(originalName);
  const base = path.basename(originalName, ext) || 'document';
  const safeLang = String(targetLang || 'translated').replace(/[^a-z0-9_-]+/gi, '-');
  return `${base}.${safeLang}${ext || '.txt'}`;
}

function getOutputDir() {
  const dir = path.resolve(__dirname, '../../uploads/translate/output');
  ensureDir(dir);
  return dir;
}

function isSupportedExt(ext) {
  return new Set(['.txt', '.md', '.json', '.docx']).has(ext);
}

function decodeMaybeLatin1(name) {
  try {
    return Buffer.from(String(name || ''), 'latin1').toString('utf8');
  } catch (_) {
    return String(name || '');
  }
}

async function createTranslateTask(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: '缺少上传文件 file' });
    }

    const originalName = decodeMaybeLatin1(file.originalname || '') || 'document';
    const sourceLang = String(req.body?.sourceLang || '').trim() || 'zh';
    const targetLang = String(req.body?.targetLang || '').trim() || 'en';
    const providerId = String(req.body?.providerId || '').trim() || null;

    const ext = safeFileExt(originalName);
    if (!isSupportedExt(ext)) {
      return res.status(400).json({
        success: false,
        message: `不支持的文件类型: ${ext || '(无后缀)'}`,
        supported: ['.txt', '.md', '.json', '.docx']
      });
    }

    const taskId = crypto.randomUUID();
    const outputDir = getOutputDir();
    const outputName = buildOutputFileName(originalName, targetLang);
    const outputPath = path.join(outputDir, `${taskId}-${outputName}`);

    await translateQueue.add(
      'translate-document',
      {
        userId: req.user?.id || req.user?.user_id || null,
        username: req.user?.username || '',
        inputPath: file.path,
        outputPath,
        originalName,
        sourceLang,
        targetLang,
        providerId
      },
      { jobId: taskId }
    );

    return res.json({
      success: true,
      data: {
        taskId,
        statusUrl: `/api/translate/tasks/${taskId}/status`,
        resultUrl: `/api/translate/tasks/${taskId}/result`
      }
    });
  } catch (error) {
    console.error('[translate] create task failed:', error);
    return res.status(500).json({ success: false, message: '创建翻译任务失败', error: error.message });
  }
}

async function getTranslateTaskStatus(req, res) {
  try {
    const { taskId } = req.params;
    const job = await translateQueue.getJob(taskId);
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' });

    const state = await job.getState();
    const progress = typeof job._progress === 'number' ? job._progress : (job.progress ? job.progress() : 0);
    const failedReason = job.failedReason || null;

    return res.json({
      success: true,
      data: {
        taskId: String(job.id),
        state,
        progress,
        failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[translate] status failed:', error);
    return res.status(500).json({ success: false, message: '获取任务状态失败', error: error.message });
  }
}

async function downloadTranslateTaskResult(req, res) {
  try {
    const { taskId } = req.params;
    const job = await translateQueue.getJob(taskId);
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' });

    const state = await job.getState();
    if (state !== 'completed') {
      return res.status(409).json({ success: false, message: `任务未完成，当前状态: ${state}` });
    }

    const outputPath = job.returnvalue?.outputPath || job.data?.outputPath;
    if (!outputPath || !fs.existsSync(outputPath)) {
      return res.status(404).json({ success: false, message: '结果文件不存在或已清理' });
    }

    const originalName = job.data?.originalName || 'document';
    const targetLang = job.data?.targetLang || 'translated';
    const downloadName = buildOutputFileName(originalName, targetLang);
    // RFC 5987: filename*=UTF-8'' for correct Chinese; header value must be ASCII-only so fallback must be ASCII
    const hasNonAscii = /[^\x00-\x7F]/.test(downloadName);
    const ext = safeFileExt(originalName) || '.txt';
    const asciiFallback = hasNonAscii ? `translated${ext}` : downloadName;
    const safeAscii = asciiFallback.replace(/[\x00-\x1F\x7F"]/g, '_');
    const contentDisposition = `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition);
    return res.sendFile(path.resolve(outputPath));
  } catch (error) {
    console.error('[translate] download failed:', error);
    return res.status(500).json({ success: false, message: '下载结果失败', error: error.message });
  }
}

module.exports = {
  createTranslateTask,
  getTranslateTaskStatus,
  downloadTranslateTaskResult
};

