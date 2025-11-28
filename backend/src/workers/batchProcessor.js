const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const { ensureCacheReady, renderEntryExplanation } = require('../services/logParsingService');
const Log = require('../models/log');
const websocketService = require('../services/websocketService');
const { getClickHouseClient } = require('../config/clickhouse');

// 上传目录（与 logProcessor 中保持一致）
const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');

// 规范化 ClickHouse 查询返回的行结构：
// - 普通 JSONEachRow: 直接返回对象 { log_id, timestamp, ... }
// - 某些客户端 / stream 模式：可能包装为 { text: '{"log_id":...}' }
function normalizeChRow(row) {
  if (!row) return null;
  if (row.text && typeof row.text === 'string') {
    try {
      return JSON.parse(row.text);
    } catch (e) {
      console.warn('[ClickHouse] 解析 text 字段失败:', e.message);
      return null;
    }
  }
  return row;
}

/**
 * 版本淘汰：在 ClickHouse 中为指定 log_id 删除旧版本
 * 默认仅保留最近 keepLatestCount 个版本（按 version 升序）
 * 例如 keepLatestCount = 2 且 newVersion = 5，则删除 version < 4 的所有行。
 */
async function evictOldVersionsFromClickHouse(logId, newVersion, keepLatestCount = 2) {
  try {
    const v = Number(newVersion);
    const keep = Number(keepLatestCount);
    if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(keep) || keep <= 0) {
      return;
    }

    // 计算需要保留的最小版本号，例如：keepLatestCount=2, newVersion=5 -> minVersion=4
    const minVersion = Math.max(v - (keep - 1), 1);

    // 如果新版本号还很小（例如 1 或 2），删除条件可能为空，此时无需执行 DELETE
    if (minVersion <= 1) {
      console.log(
        `[版本淘汰] log_id=${logId}, newVersion=${v}, keepLatest=${keep}，当前版本较小，暂不删除旧版本`
      );
      return;
    }

    const client = getClickHouseClient();
    console.log(
      `[版本淘汰] 开始清理 ClickHouse 旧版本: log_id=${logId}, 删除 version < ${minVersion}`
    );

    await client.query({
      query: `
        ALTER TABLE log_entries
        DELETE WHERE log_id = {log_id:UInt32}
                  AND version < {min_version:UInt32}
      `,
      query_params: {
        log_id: Number(logId),
        min_version: minVersion
      }
    });

    console.log(
      `[版本淘汰] ClickHouse 清理完成: log_id=${logId}, 删除 version < ${minVersion}`
    );
  } catch (err) {
    // 不影响主流程，只记录警告日志
    console.warn(
      `[版本淘汰] ClickHouse 清理旧版本失败: log_id=${logId}, newVersion=${newVersion}, 错误=${err.message}`
    );
  }
}

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
      const currentVersion = log.version || 1;
      const newVersion = currentVersion + 1;
      let allLines = [];
      let updatedCount = 0;
      const newEntries = [];

      console.log(
        `[重新解析] 开始: logId=${logId}, currentVersion=${currentVersion}, newVersion=${newVersion}`
      );

      try {
        const client = getClickHouseClient();
        const queryStart = Date.now();

        const resultSet = await client.query({
          query: `SELECT * FROM log_entries WHERE log_id = {logId: UInt32} AND version = {version: UInt32} ORDER BY row_index ASC`,
          query_params: { logId, version: currentVersion },
          format: 'JSONEachRow'
        });

        const rawRows = await resultSet.json();
        const queryMs = Date.now() - queryStart;

        console.log(
          `[重新解析] ClickHouse 查询完成: logId=${logId}, 行数=${rawRows.length}, 耗时=${queryMs}ms`
        );

        if (!rawRows || rawRows.length === 0) {
          console.warn(
            `[重新解析] ⚠️ 警告: logId=${logId}, version=${currentVersion} 查询结果为空！`
          );
        }

        let totalRowsCount = 0;

        for (const raw of rawRows) {
          const entry = normalizeChRow(raw);
          if (!entry) continue;

          totalRowsCount++;

          const { explanation } = renderEntryExplanation({
            error_code: entry.error_code,
            param1: entry.param1,
            param2: entry.param2,
            param3: entry.param3,
            param4: entry.param4,
            timestamp: entry.timestamp,
            explanation: entry.explanation
          });

          const localTs = entry.timestamp;
          allLines.push(
            `${localTs} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${explanation}`
          );
          updatedCount++;

          // 重新计算 subsystem_char 和 code4，统一转换为大写，确保与查询时匹配
          const errorCodeStr = entry.error_code || '';
          let subsystem = '';
          let code4 = '';

          if (errorCodeStr && errorCodeStr.length >= 5) {
            subsystem = errorCodeStr.charAt(0).toUpperCase();
            if (!/^[1-9A-F]$/.test(subsystem)) {
              subsystem = '';
            }
            code4 = '0X' + errorCodeStr.slice(-4).toUpperCase();
          }

          newEntries.push({
            ...entry,
            explanation,
            subsystem_char: subsystem || (entry.subsystem_char || '').toUpperCase(),
            code4: code4 || (entry.code4 || '').toUpperCase(),
            version: newVersion
          });

          if (newEntries.length >= 2000) {
            console.log(
              `[重新解析] 批量写入 2000 条数据到 ClickHouse (logId=${logId}, 累计已处理 ${updatedCount} 条)`
            );
            await client.insert({
              table: 'log_entries',
              values: newEntries,
              format: 'JSONEachRow'
            });
            newEntries.length = 0;
          }
        }

        console.log(
          `[重新解析] 处理完成: logId=${logId}, 有效行数=${updatedCount}, 准备写入版本 ${newVersion}`
        );

        if (newEntries.length > 0) {
          console.log(
            `[重新解析] 写入最后批次: ${newEntries.length} 条数据到 ClickHouse (logId=${logId})`
          );
          await client.insert({
            table: 'log_entries',
            values: newEntries,
            format: 'JSONEachRow'
          });
        }

        if (updatedCount > 0) {
          console.log(
            `[重新解析] 更新 MySQL 版本号并淘汰旧版本: logId=${logId}, ${currentVersion} -> ${newVersion}`
          );
          // 1. 更新 MySQL 中的版本号
          await log.update({ version: newVersion });

          // 2. 在 ClickHouse 中淘汰旧版本（仅保留最近 2 个版本）
          await evictOldVersionsFromClickHouse(logId, newVersion, 2);
        } else {
          console.warn(
            `[重新解析] ⚠️ 警告: logId=${logId} 没有处理任何数据，updatedCount=0`
          );
        }
      } catch (chError) {
        console.error('ClickHouse reparse failed:', chError);
        throw chError;
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
  // 对外导出版本淘汰函数，便于其他 Worker 复用相同策略
  evictOldVersionsFromClickHouse,
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
      await getClickHouseClient().query({
        query: `ALTER TABLE log_entries DELETE WHERE log_id = {logId: UInt32}`,
        query_params: { logId: log.id }
      });
      result.deletedEntries = 1;
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
      const currentVersion = log.version || 1;
      const newVersion = currentVersion + 1;
      let allLines = [];
      let updatedCount = 0;
      const newEntries = [];

      console.log(
        `[单个重新解析] 开始: logId=${log.id}, currentVersion=${currentVersion}, newVersion=${newVersion}`
      );

      try {
        const client = getClickHouseClient();
        const queryStart = Date.now();

        const resultSet = await client.query({
          query: `SELECT * FROM log_entries WHERE log_id = {logId: UInt32} AND version = {version: UInt32} ORDER BY row_index ASC`,
          query_params: { logId: log.id, version: currentVersion },
          format: 'JSONEachRow'
        });

        const rawRows = await resultSet.json();
        const queryMs = Date.now() - queryStart;

        console.log(
          `[单个重新解析] ClickHouse 查询完成: logId=${log.id}, 行数=${rawRows.length}, 耗时=${queryMs}ms`
        );

        if (!rawRows || rawRows.length === 0) {
          console.warn(
            `[单个重新解析] ⚠️ 警告: logId=${log.id}, version=${currentVersion} 查询结果为空！`
          );
        }

        for (const raw of rawRows) {
          const entry = normalizeChRow(raw);
          if (!entry) continue;

          const { explanation } = renderEntryExplanation({
            error_code: entry.error_code,
            param1: entry.param1,
            param2: entry.param2,
            param3: entry.param3,
            param4: entry.param4,
            timestamp: entry.timestamp,
            explanation: entry.explanation
          });

          const localTs = entry.timestamp;
          allLines.push(
            `${localTs} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${explanation}`
          );
          updatedCount++;

          // 重新计算 subsystem_char 和 code4，统一转换为大写，确保与查询时匹配
          const errorCodeStr = entry.error_code || '';
          let subsystem = '';
          let code4 = '';

          if (errorCodeStr && errorCodeStr.length >= 5) {
            subsystem = errorCodeStr.charAt(0).toUpperCase();
            if (!/^[1-9A-F]$/.test(subsystem)) {
              subsystem = '';
            }
            code4 = '0X' + errorCodeStr.slice(-4).toUpperCase();
          }

          newEntries.push({
            ...entry,
            explanation,
            subsystem_char: subsystem || (entry.subsystem_char || '').toUpperCase(),
            code4: code4 || (entry.code4 || '').toUpperCase(),
            version: newVersion
          });

          if (newEntries.length >= 2000) {
            console.log(
              `[单个重新解析] 批量写入 2000 条数据到 ClickHouse (logId=${log.id}, 累计已处理 ${updatedCount} 条)`
            );
            await client.insert({
              table: 'log_entries',
              values: newEntries,
              format: 'JSONEachRow'
            });
            newEntries.length = 0;
          }
        }

        console.log(
          `[单个重新解析] 处理完成: logId=${log.id}, 有效行数=${updatedCount}, 准备写入版本 ${newVersion}`
        );

        if (newEntries.length > 0) {
          console.log(
            `[单个重新解析] 写入最后批次: ${newEntries.length} 条数据到 ClickHouse`
          );
          await client.insert({
            table: 'log_entries',
            values: newEntries,
            format: 'JSONEachRow'
          });
          console.log('[单个重新解析] ✅ 最后批次数据写入完成');
        }

        if (updatedCount > 0) {
          console.log(
            `[单个重新解析] 更新 MySQL 版本号并淘汰旧版本: logId=${log.id}, ${currentVersion} -> ${newVersion}`
          );
          // 1. 更新 MySQL 中的版本号
          await log.update({ version: newVersion });

          // 2. 在 ClickHouse 中淘汰旧版本（仅保留最近 2 个版本）
          await evictOldVersionsFromClickHouse(logId, newVersion, 2);
        } else {
          console.warn(
            `[单个重新解析] ⚠️ 警告: logId=${log.id} 没有处理任何数据，updatedCount=0`
          );
        }
      } catch (chError) {
        console.error('ClickHouse reparse failed:', chError);
        throw chError;
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


