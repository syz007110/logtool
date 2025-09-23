const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const { ensureCacheReady, renderEntryExplanation } = require('../services/logParsingService');
const Log = require('../models/log');
const LogEntry = require('../models/log_entry');
const websocketService = require('../services/websocketService');

// 上传目录（与 logProcessor 中保持一致）
const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');

/**
 * 批量重新解析日志释义，仅更新 log_entries.explanation，并同步生成解密后的本地文件
 * 预期 job.data: { logIds: number[], userId?: number }
 */
async function batchReparseLogs(job) {
  const { logIds } = job.data || {};
  if (!Array.isArray(logIds) || logIds.length === 0) {
    throw new Error('batchReparseLogs: 缺少 logIds');
  }

  // 预热缓存/解析依赖
  await ensureCacheReady();

  const summary = {
    total: logIds.length,
    succeeded: 0,
    failed: 0,
    results: []
  };

  for (const logId of logIds) {
    const result = { logId, updatedEntries: 0, filePath: null, success: false, error: null };
    try {
      const log = await Log.findByPk(logId);
      if (!log) {
        throw new Error(`日志不存在: ${logId}`);
      }

      // 拉取条目分批处理，避免占用过多内存
      const BATCH_SIZE = 2000;
      let offset = 0;
      let allLines = [];
      let updatedCount = 0;

      while (true) {
        const entries = await LogEntry.findAll({
          where: { log_id: logId },
          order: [['timestamp', 'ASC'], ['id', 'ASC']],
          limit: BATCH_SIZE,
          offset
        });

        if (!entries || entries.length === 0) break;

        // 重新渲染 explanation 并更新数据库
        for (const e of entries) {
          const { explanation } = renderEntryExplanation({
            error_code: e.error_code,
            param1: e.param1,
            param2: e.param2,
            param3: e.param3,
            param4: e.param4,
            timestamp: e.timestamp,
            explanation: e.explanation
          });

          if (explanation !== e.explanation) {
            // 仅在变化时写库，减少写放大
            await LogEntry.update({ explanation }, { where: { id: e.id } });
          }

          // 生成行文本（始终使用最新 explanation）
          const localTs = dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss');
          allLines.push(`${localTs} ${e.error_code} ${e.param1} ${e.param2} ${e.param3} ${e.param4} ${explanation}`);
          updatedCount++;
        }

        offset += entries.length;
        // 更新任务进度（粗略）
        try { await job.progress(Math.min(99, Math.round((offset / Math.max(1, updatedCount)) * 50))); } catch (_) {}
      }

      // 无条目则标记成功但不写文件
      if (updatedCount === 0) {
        const oldStatus = log.status;
        await log.update({ status: 'parsed', parse_time: new Date() });
        if (log.device_id) {
          websocketService.pushLogStatusChange(log.device_id, log.id, 'parsed', oldStatus);
        }
        result.success = true;
        result.updatedEntries = 0;
        summary.succeeded++;
        summary.results.push(result);
        continue;
      }

      // 生成/更新解密文件
      // 目标目录：按设备编号分文件夹（如果有 device_id）
      let deviceFolder = UPLOAD_DIR;
      if (log.device_id) {
        deviceFolder = path.join(UPLOAD_DIR, log.device_id);
        if (!fs.existsSync(deviceFolder)) {
          fs.mkdirSync(deviceFolder, { recursive: true });
        }
      }

      const decryptedFileName = (log.original_name || `log_${logId}`).replace('.medbot', '.txt');
      const decryptedFilePath = path.join(deviceFolder, decryptedFileName);
      const content = allLines.join('\n');
      fs.writeFileSync(decryptedFilePath, content, 'utf-8');

      // 更新日志状态与解密文件路径
      const oldStatus = log.status;
      await Log.update({
        decrypted_path: decryptedFilePath,
        status: 'parsed',
        parse_time: new Date()
      }, { where: { id: logId } });

      if (log.device_id) {
        websocketService.pushLogStatusChange(log.device_id, log.id, 'parsed', oldStatus);
      }

      result.success = true;
      result.updatedEntries = updatedCount;
      result.filePath = decryptedFilePath;
      summary.succeeded++;
      summary.results.push(result);
    } catch (err) {
      // 单个日志失败不影响其他日志继续处理
      try {
        const log = await Log.findByPk(logId);
        if (log) {
          const oldStatus = log.status;
          await log.update({ status: 'parse_failed' });
          if (log.device_id) {
            websocketService.pushLogStatusChange(log.device_id, log.id, 'parse_failed', oldStatus);
          }
        }
      } catch (_) {}

      result.success = false;
      result.error = err && err.message ? err.message : String(err);
      summary.failed++;
      summary.results.push(result);
    }
  }

  return summary;
}

module.exports = {
  batchReparseLogs,
  /**
   * 处理单个日志删除任务
   * 预期 job.data: { logId: number, userId?: number }
   */
  async processSingleDelete(job) {
    const { logId } = job.data || {};
    if (!logId) {
      throw new Error('processSingleDelete: 缺少 logId');
    }

    const result = { logId, success: false, deletedEntries: 0, removedFiles: [] };

    // 查找日志
    const log = await Log.findByPk(logId);
    if (!log) {
      // 记录不存在，视作幂等成功
      result.success = true;
      return result;
    }

    const oldStatus = log.status;
    const deviceId = log.device_id;

    // 删除相关文件（原始上传文件与解密后的文件）
    const tryRemoveFile = (filePath) => {
      try {
        if (filePath && fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
            result.removedFiles.push(filePath);
          }
        }
      } catch (e) {
        // 忽略文件删除失败，继续数据库清理
      }
    };

    tryRemoveFile(path.join(UPLOAD_DIR, log.filename || ''));
    tryRemoveFile(log.decrypted_path);

    // 删除条目与日志记录
    try {
      result.deletedEntries = await LogEntry.destroy({ where: { log_id: log.id } });
    } catch (_) {}

    await Log.destroy({ where: { id: log.id } });

    // 推送状态变化
    if (deviceId) {
      try {
        websocketService.pushLogStatusChange(deviceId, log.id, 'deleted', oldStatus);
      } catch (_) {}
    }

    result.success = true;
    return result;
  },

  /**
   * 处理批量日志删除任务
   * 预期 job.data: { logIds: number[], userId?: number }
   */
  async batchDeleteLogs(job) {
    const { logIds } = job.data || {};
    if (!Array.isArray(logIds) || logIds.length === 0) {
      throw new Error('batchDeleteLogs: 缺少 logIds');
    }

    const summary = {
      total: logIds.length,
      succeeded: 0,
      failed: 0,
      results: []
    };

    // 逐个删除，保证稳定性与可观测性
    for (let i = 0; i < logIds.length; i++) {
      const id = logIds[i];
      try {
        // 粗略进度更新
        try { await job.progress(Math.min(99, Math.round(((i + 1) / logIds.length) * 100))); } catch (_) {}

        const singleJob = { data: { logId: id } };
        const res = await module.exports.processSingleDelete(singleJob);
        summary.results.push(res);
        if (res.success) summary.succeeded++; else summary.failed++;
      } catch (err) {
        summary.failed++;
        summary.results.push({ logId: id, success: false, error: err && err.message ? err.message : String(err) });
      }
    }

    return summary;
  },
  async reparseSingleLog(job) {
    const { logId } = job.data || {};
    if (!logId) {
      throw new Error('reparseSingleLog: 缺少 logId');
    }

    // 预热缓存/解析依赖
    await ensureCacheReady();

    const result = { logId, updatedEntries: 0, filePath: null, success: false, error: null };
    try {
      const log = await Log.findByPk(logId);
      if (!log) {
        throw new Error(`日志不存在: ${logId}`);
      }

      // 分批读取并更新 explanation
      const BATCH_SIZE = 2000;
      let offset = 0;
      let allLines = [];
      let updatedCount = 0;

      while (true) {
        const entries = await LogEntry.findAll({
          where: { log_id: logId },
          order: [['timestamp', 'ASC'], ['id', 'ASC']],
          limit: BATCH_SIZE,
          offset
        });
        if (!entries || entries.length === 0) break;

        for (const e of entries) {
          const { explanation } = renderEntryExplanation({
            error_code: e.error_code,
            param1: e.param1,
            param2: e.param2,
            param3: e.param3,
            param4: e.param4,
            timestamp: e.timestamp,
            explanation: e.explanation
          });
          if (explanation !== e.explanation) {
            await LogEntry.update({ explanation }, { where: { id: e.id } });
          }
          const localTs = dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss');
          allLines.push(`${localTs} ${e.error_code} ${e.param1} ${e.param2} ${e.param3} ${e.param4} ${explanation}`);
          updatedCount++;
        }

        offset += entries.length;
        try { await job.progress(Math.min(99, Math.round((offset / Math.max(1, updatedCount)) * 50))); } catch (_) {}
      }

      // 无条目也算成功（只更新状态）
      if (updatedCount === 0) {
        const oldStatus = log.status;
        await log.update({ status: 'parsed', parse_time: new Date() });
        if (log.device_id) {
          websocketService.pushLogStatusChange(log.device_id, log.id, 'parsed', oldStatus);
        }
        result.success = true;
        return result;
      }

      // 写解密文件
      let deviceFolder = UPLOAD_DIR;
      if (log.device_id) {
        deviceFolder = path.join(UPLOAD_DIR, log.device_id);
        if (!fs.existsSync(deviceFolder)) {
          fs.mkdirSync(deviceFolder, { recursive: true });
        }
      }
      const decryptedFileName = (log.original_name || `log_${logId}`).replace('.medbot', '.txt');
      const decryptedFilePath = path.join(deviceFolder, decryptedFileName);
      fs.writeFileSync(decryptedFilePath, allLines.join('\n'), 'utf-8');

      // 更新日志状态
      const oldStatus = log.status;
      await Log.update({
        decrypted_path: decryptedFilePath,
        status: 'parsed',
        parse_time: new Date()
      }, { where: { id: logId } });
      if (log.device_id) {
        websocketService.pushLogStatusChange(log.device_id, log.id, 'parsed', oldStatus);
      }

      result.success = true;
      result.updatedEntries = updatedCount;
      result.filePath = decryptedFilePath;
      return result;
    } catch (err) {
      try {
        const log = await Log.findByPk(logId);
        if (log) {
          const oldStatus = log.status;
          await log.update({ status: 'parse_failed' });
          if (log.device_id) {
            websocketService.pushLogStatusChange(log.device_id, log.id, 'parse_failed', oldStatus);
          }
        }
      } catch (_) {}

      result.success = false;
      result.error = err && err.message ? err.message : String(err);
      return result;
    }
  }
  // 保留与 queueProcessor 的接口一致性：
  // 如需在此文件中实现删除相关任务，可补充导出：
  // processSingleDelete,
  // batchDeleteLogs
};


