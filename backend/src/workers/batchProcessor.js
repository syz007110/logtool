const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { Op } = require('sequelize');

const { ensureCacheReady, renderEntryExplanation } = require('../services/logParsingService');
const Log = require('../models/log');
const websocketService = require('../services/websocketService');
const { getClickHouseClient } = require('../config/clickhouse');

// 格式化时间为 ClickHouse 格式（与 logController 保持一致）
function formatTimeForClickHouse(timeValue) {
  if (!timeValue) return null;

  if (typeof timeValue === 'string') {
    let formatted = timeValue
      .replace('T', ' ')
      .replace(/\.\d{3}Z?$/, '')
      .replace(/Z$/, '')
      .trim();

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(formatted)) {
      return formatted;
    }

    const parsed = dayjs(formatted);
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD HH:mm:ss');
    }
  }

  const parsed = dayjs(timeValue);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DD HH:mm:ss');
  }

  return null;
}

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
      } catch (_) { }

      result.success = false;
      result.error = err && err.message ? err.message : String(err);
      summary.failed++;
      summary.results.push(result);
    }
  }

  return summary;
}

// 从 ClickHouse 构建解密内容（用于批量下载）
async function buildDecryptedContentFromClickHouse(logId, version) {
  const client = getClickHouseClient();
  const result = await client.query({
    query: `
      SELECT 
        timestamp,
        error_code,
        param1,
        param2,
        param3,
        param4,
        explanation
      FROM log_entries
      WHERE log_id = {log_id:UInt32} AND version = {version:UInt32}
      ORDER BY timestamp ASC, row_index ASC
    `,
    query_params: {
      log_id: Number(logId),
      version: Number(version)
    },
    format: 'JSONEachRow'
  });
  const rows = await result.json();

  if (!rows || rows.length === 0) return '';

  const lines = rows.map(entry => {
    const localTs = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss');
    const p1 = entry.param1 || '';
    const p2 = entry.param2 || '';
    const p3 = entry.param3 || '';
    const p4 = entry.param4 || '';
    const expl = entry.explanation || '';
    const err = entry.error_code || '';
    return `${localTs} ${err} ${p1} ${p2} ${p3} ${p4} ${expl}`.trimEnd();
  });

  return lines.join('\n');
}

// 处理批量下载任务
async function processBatchDownload(job) {
  const { logIds, userId, userRole } = job.data || {};

  if (!Array.isArray(logIds) || logIds.length === 0) {
    throw new Error('processBatchDownload: 缺少 logIds');
  }

  console.log(`[批量下载] 开始处理任务 ${job.id}, 日志数: ${logIds.length}`);

  await job.progress(10);

  // 获取所有要下载的日志
  const logs = [];
  for (const id of logIds) {
    const log = await Log.findByPk(id);
    if (log) {
      logs.push(log);
    }
  }

  if (logs.length === 0) {
    throw new Error('未找到任何日志文件');
  }

  // 权限检查：普通用户只能下载自己的日志
  if (userRole === 3) {
    const unauthorizedLogs = logs.filter(log => log.uploader_id !== userId);
    if (unauthorizedLogs.length > 0) {
      throw new Error('无权下载部分日志文件');
    }
  }

  // 检查是否所有日志都已解析完成
  const unparsedLogs = logs.filter(log => log.status !== 'parsed');
  if (unparsedLogs.length > 0) {
    throw new Error(`部分日志尚未解析完成: ${unparsedLogs.map(l => l.id).join(', ')}`);
  }

  await job.progress(20);

  // 创建临时目录用于存放文件
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 生成ZIP文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipFileName = `logs_batch_${timestamp}.zip`;
  const zipFilePath = path.join(tempDir, zipFileName);

  // 创建ZIP文件
  const archiver = require('archiver');
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', {
    zlib: { level: 9 } // 设置压缩级别
  });

  output.on('close', () => {
    console.log(`[批量下载] ZIP文件创建完成: ${zipFilePath}, 大小: ${archive.pointer()} bytes`);
  });

  archive.on('error', (err) => {
    console.error(`[批量下载] ZIP归档错误:`, err);
    throw err;
  });

  archive.pipe(output);

  await job.progress(30);

  // 添加文件到ZIP
  const totalLogs = logs.length;
  let processedCount = 0;
  const errors = [];

  for (const log of logs) {
    try {
      let fileContent = '';
      let fileName = '';

      // 优先从保存的解密文件中读取
      if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
        fileContent = fs.readFileSync(log.decrypted_path, 'utf-8');
        fileName = path.basename(log.decrypted_path);
      } else {
        // 如果解密文件不存在，从 ClickHouse log_entries 生成
        const version = Number.isInteger(log.version) ? log.version : 1;
        fileContent = await buildDecryptedContentFromClickHouse(log.id, version);
        if (fileContent) {
          fileName = log.original_name.replace('.medbot', '_decrypted.txt');
        }
      }

      if (fileContent) {
        // 在ZIP中创建子目录，按设备编号分组
        const deviceDir = log.device_id || 'unknown';
        const zipPath = `${deviceDir}/${fileName}`;
        archive.append(fileContent, { name: zipPath });
      }

      processedCount++;
      // 更新进度：30% + (processedCount / totalLogs) * 60%
      const progress = 30 + Math.floor((processedCount / totalLogs) * 60);
      await job.progress(progress);

    } catch (error) {
      console.error(`[批量下载] 处理日志 ${log.id} 时出错:`, error);
      errors.push({
        logId: log.id,
        filename: log.original_name,
        error: error.message
      });
      // 继续处理其他文件
    }
  }

  await job.progress(90);

  // 如果有错误，添加错误日志文件到ZIP
  if (errors.length > 0) {
    const errorLog = JSON.stringify({
      message: '部分文件处理失败',
      errors: errors,
      successCount: processedCount - errors.length,
      totalCount: totalLogs
    }, null, 2);
    archive.append(errorLog, { name: 'errors.json' });
  }

  // 完成ZIP文件
  await archive.finalize();

  // 等待文件写入完成
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });

  await job.progress(100);

  const fileSize = fs.statSync(zipFilePath).size;
  console.log(`[批量下载] 任务 ${job.id} 完成, ZIP大小: ${fileSize} bytes`);

  return {
    zipFilePath,
    zipFileName,
    fileCount: processedCount - errors.length,
    totalCount: totalLogs,
    errors: errors.length > 0 ? errors : undefined,
    size: fileSize
  };
}

// 处理CSV导出任务
async function processExportCsv(job) {
  const { params, userId } = job.data || {};

  if (!params) {
    throw new Error('processExportCsv: 缺少 params');
  }

  const {
    log_ids,
    search,
    error_code,
    start_time,
    end_time,
    filters
  } = params;

  console.log(`[CSV导出] 开始处理任务 ${job.id}`);

  await job.progress(5);

  // 1) 日志ID解析
  const requestedLogIds = log_ids
    ? String(log_ids)
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(n => Number.isInteger(n) && n > 0)
    : [];

  let allowedLogIds = [...requestedLogIds];

  await job.progress(10);

  // 2) 基于允许的日志ID获取当前版本（最新版本）
  let logVersionPairs = null;
  if (allowedLogIds && allowedLogIds.length > 0) {
    const logs = await Log.findAll({
      where: { id: { [Op.in]: allowedLogIds } },
      attributes: ['id', 'version']
    });

    logVersionPairs = logs.map(l => [
      Number(l.id),
      Number(Number.isInteger(l.version) ? l.version : 1)
    ]);
  }

  await job.progress(15);

  // 3) 构建 ClickHouse 查询条件
  const client = getClickHouseClient();
  const conditions = [];
  const queryParams = {};

  if (logVersionPairs && logVersionPairs.length > 0) {
    const tupleList = logVersionPairs
      .map(([logId, version]) => `(${Number(logId)}, ${Number(version)})`)
      .join(', ');
    conditions.push(`(log_id, version) IN (${tupleList})`);
  }

  if (error_code) {
    conditions.push('error_code LIKE {error_code:String}');
    queryParams.error_code = `%${error_code}%`;
  }

  if (start_time) {
    conditions.push('timestamp >= {start_time:DateTime}');
    queryParams.start_time = formatTimeForClickHouse(start_time);
  }
  if (end_time) {
    conditions.push('timestamp <= {end_time:DateTime}');
    queryParams.end_time = formatTimeForClickHouse(end_time);
  }

  if (search && String(search).trim().length > 0) {
    const raw = String(search).trim();
    const hexMatch = /^[0-9a-fA-F]{4,6}$/.test(raw);
    if (hexMatch) {
      conditions.push('code4 = {search_code4:String}');
      queryParams.search_code4 = '0X' + raw.slice(-4).toUpperCase();
    } else {
      conditions.push(
        '(positionCaseInsensitive(explanation, {search_kw:String}) > 0 OR error_code LIKE {search_like:String})'
      );
      queryParams.search_kw = raw;
      queryParams.search_like = `%${raw}%`;
    }
  }

  await job.progress(20);

  // 解析高级筛选条件
  const parseAdvancedFilters = (raw) => {
    if (!raw) return null;
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return parsed;
  };

  const advancedFilters = parseAdvancedFilters(filters);

  if (advancedFilters) {
    const allowedFields = new Set([
      'timestamp',
      'error_code',
      'param1',
      'param2',
      'param3',
      'param4',
      'explanation'
    ]);

    let advParamIndex = 0;
    const makeParam = (base, chType, value) => {
      const name = `${base}_${advParamIndex++}`;
      if (chType === 'DateTime') {
        queryParams[name] = formatTimeForClickHouse(value);
      } else {
        queryParams[name] = value;
      }
      return `{${name}:${chType}}`;
    };

    const buildAdvancedExpr = (node) => {
      if (!node) return null;

      if (Array.isArray(node)) {
        const parts = node.map(child => buildAdvancedExpr(child)).filter(Boolean);
        if (parts.length === 0) return null;
        return `(${parts.join(' AND ')})`;
      }

      if (node.field && node.operator) {
        const field = String(node.field);
        const op = String(node.operator || '').toLowerCase();
        const value = node.value;

        if (!allowedFields.has(field)) return null;
        if (value === undefined || value === null || value === '') return null;

        if (field === 'timestamp') {
          const formatTimestamp = (v) => {
            if (!v) return null;
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(v)) {
              return v;
            }
            return formatTimeForClickHouse(v);
          };

          if (op === 'between') {
            if (!Array.isArray(value) || value.length !== 2) return null;
            const a = formatTimestamp(value[0]);
            const b = formatTimestamp(value[1]);
            if (!a || !b) return null;
            const p1 = makeParam('adv_ts_from', 'DateTime', a);
            const p2 = makeParam('adv_ts_to', 'DateTime', b);
            return `(timestamp BETWEEN ${p1} AND ${p2})`;
          }

          const formatted = formatTimestamp(value);
          if (!formatted) return null;
          const p = makeParam('adv_ts', 'DateTime', formatted);

          switch (op) {
            case '=':
            case '==':
              return `timestamp = ${p}`;
            case '!=':
            case '<>':
              return `timestamp != ${p}`;
            case '>':
              return `timestamp > ${p}`;
            case '>=':
              return `timestamp >= ${p}`;
            case '<':
              return `timestamp < ${p}`;
            case '<=':
              return `timestamp <= ${p}`;
            default:
              return null;
          }
        }

        if (field === 'error_code') {
          const p = makeParam('adv_ec', 'String', String(value));
          switch (op) {
            case '=':
              return `error_code = ${p}`;
            case '!=':
            case '<>':
              return `error_code != ${p}`;
            case 'contains':
            case 'like':
              return `positionCaseInsensitive(error_code, ${p}) > 0`;
            case 'regex':
              return `match(error_code, ${p})`;
            case 'startswith':
              return `startsWith(error_code, ${p})`;
            case 'endswith':
              return `endsWith(error_code, ${p})`;
            default:
              return null;
          }
        }

        if (field === 'param1' || field === 'param2' || field === 'param3' || field === 'param4') {
          const colExpr = `toFloat64OrNull(${field})`;
          const toNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };

          if (op === 'between') {
            if (!Array.isArray(value) || value.length !== 2) return null;
            const a = toNum(value[0]);
            const b = toNum(value[1]);
            if (a === null || b === null) return null;
            const p1 = makeParam(`adv_${field}_from`, 'Float64', a);
            const p2 = makeParam(`adv_${field}_to`, 'Float64', b);
            return `(${colExpr} >= ${p1} AND ${colExpr} <= ${p2})`;
          }

          const n = toNum(value);
          if (n === null) return null;
          const p = makeParam(`adv_${field}`, 'Float64', n);

          switch (op) {
            case '=':
              return `${colExpr} = ${p}`;
            case '!=':
            case '<>':
              return `${colExpr} != ${p}`;
            case '>':
              return `${colExpr} > ${p}`;
            case '>=':
              return `${colExpr} >= ${p}`;
            case '<':
              return `${colExpr} < ${p}`;
            case '<=':
              return `${colExpr} <= ${p}`;
            default:
              return null;
          }
        }

        if (field === 'explanation') {
          const p = makeParam('adv_expl', 'String', String(value));
          if (op === 'contains' || op === 'like') {
            return `positionCaseInsensitive(explanation, ${p}) > 0`;
          }
          return null;
        }

        return null;
      }

      if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
        const childExprs = node.conditions
          .map(child => buildAdvancedExpr(child))
          .filter(Boolean);
        if (childExprs.length === 0) return null;
        const joiner = node.logic === 'OR' ? ' OR ' : ' AND ';
        return `(${childExprs.join(joiner)})`;
      }

      return null;
    };

    const advancedWhereSql = buildAdvancedExpr(advancedFilters);
    if (advancedWhereSql) {
      conditions.push(advancedWhereSql);
    }
  }

  const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  await job.progress(25);

  // 创建临时目录
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 生成CSV文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvFileName = `batch_log_entries_${timestamp}.csv`;
  const csvFilePath = path.join(tempDir, csvFileName);

  // 创建CSV文件流
  const output = fs.createWriteStream(csvFilePath, { encoding: 'utf-8' });

  // 写入BOM和表头
  output.write('\uFEFF');
  const headers = ['日志文件', '时间戳', '故障码', '参数1', '参数2', '参数3', '参数4', '释义'];
  output.write(headers.join(',') + '\n');

  await job.progress(30);

  // 查询并写入CSV
  const idToNameCache = new Map();
  const getLogName = async (logId) => {
    if (idToNameCache.has(logId)) return idToNameCache.get(logId);
    const lg = await Log.findByPk(logId, { attributes: ['original_name'] });
    const name = lg?.original_name || '';
    idToNameCache.set(logId, name);
    return name;
  };
  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const limit = 5000;
  let offset = 0;
  let totalRows = 0;

  while (true) {
    const query = `
      SELECT 
        log_id,
        timestamp,
        error_code,
        param1,
        param2,
        param3,
        param4,
        explanation
      FROM log_entries
      ${whereSql}
      ORDER BY timestamp ASC, log_id ASC, row_index ASC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `;

    const finalQueryParams = {
      ...queryParams,
      limit: limit,
      offset: offset
    };

    const result = await client.query({
      query,
      query_params: finalQueryParams,
      format: 'JSONEachRow'
    });
    const rows = await result.json();

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const logName = await getLogName(row.log_id);
      const localTs = dayjs(row.timestamp).format('YYYY-MM-DD HH:mm:ss');
      const line = [
        csvEscape(logName),
        csvEscape(localTs),
        csvEscape(row.error_code),
        csvEscape(row.param1),
        csvEscape(row.param2),
        csvEscape(row.param3),
        csvEscape(row.param4),
        csvEscape(row.explanation)
      ].join(',');
      output.write(line + '\n');
      totalRows++;
    }

    // 更新进度：30% + (已处理行数估算) * 60%
    // 由于无法提前知道总行数，使用固定步进
    if (offset % (limit * 10) === 0) {
      const progress = Math.min(90, 30 + Math.floor((offset / (limit * 100)) * 60));
      await job.progress(progress);
    }

    if (rows.length < limit) break;
    offset += rows.length;
  }

  output.end();

  // 等待文件写入完成
  await new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });

  await job.progress(100);

  const fileSize = fs.statSync(csvFilePath).size;
  console.log(`[CSV导出] 任务 ${job.id} 完成, CSV大小: ${fileSize} bytes, 行数: ${totalRows}`);

  return {
    csvFilePath,
    csvFileName,
    rowCount: totalRows,
    size: fileSize
  };
}

module.exports = {
  // 对外导出版本淘汰函数，便于其他 Worker 复用相同策略
  evictOldVersionsFromClickHouse,
  batchReparseLogs,
  processBatchDownload,
  processExportCsv,
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
    } catch (_) { }

    await Log.destroy({ where: { id: log.id } });

    // 推送状态变化
    if (deviceId) {
      try {
        websocketService.pushLogStatusChange(deviceId, log.id, 'deleted', oldStatus);
      } catch (_) { }
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
        try { await job.progress(Math.min(99, Math.round(((i + 1) / logIds.length) * 100))); } catch (_) { }

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
      } catch (_) { }

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


