const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { parseExplanation } = require('../utils/explanationParser');
const Log = require('../models/log');
const LogEntry = require('../models/log_entry');
const ErrorCode = require('../models/error_code');
const Device = require('../models/device');

// 上传目录
const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');

/**
 * 批量重新解析日志
 * @param {Object} job - Bull队列任务对象
 */
async function batchReparseLogs(job) {
  const { logIds, userId } = job.data;
  
  console.log(`开始批量重新解析 ${logIds.length} 个日志，用户ID: ${userId}`);

  try {
    const results = [];
    let success = 0;
    let fail = 0;

    const deviceChangesMap = new Map(); // deviceId -> changes array
    for (let i = 0; i < logIds.length; i++) {
      const logId = logIds[i];
      
      try {
        // 更新任务进度
        await job.progress(Math.floor((i / logIds.length) * 100));
        
        console.log(`处理日志 ${logId} (${i + 1}/${logIds.length})`);
        
        // 获取日志信息
        const log = await Log.findByPk(logId);
        if (!log) {
          results.push({ id: logId, status: 'not_found' });
          fail++;
          continue;
        }

        // 标记为解析中并推送状态
        const oldStatus = log.status;
        await log.update({ status: 'parsing' });
        try {
          const websocketService = require('../services/websocketService');
          if (log.device_id) {
            websocketService.pushLogStatusChange(log.device_id, log.id, 'parsing', oldStatus);
          }
        } catch (wsErr) {
          console.warn('WebSocket 状态推送失败(parsing):', wsErr.message);
        }

        // 读取现有明细
        const entries = await LogEntry.findAll({ 
          where: { log_id: logId }, 
          order: [['timestamp', 'ASC']] 
        });
        
        if (!entries || entries.length === 0) {
          // 无明细可重新解析：从 parsing 终结为 parse_failed，并推送状态
          try {
            const oldStatusNE = log.status; // 可能已是 'parsing'
            log.status = 'parse_failed';
            await log.save();
            try {
              const websocketService = require('../services/websocketService');
              if (log.device_id) {
                websocketService.pushLogStatusChange(log.device_id, log.id, 'parse_failed', oldStatusNE);
                // 计入批量变化
                if (!deviceChangesMap.has(log.device_id)) deviceChangesMap.set(log.device_id, []);
                deviceChangesMap.get(log.device_id).push({ logId: log.id, oldStatus: oldStatusNE, newStatus: 'parse_failed' });
              }
            } catch (wsErr) {
              console.warn('WebSocket 状态推送失败(parse_failed: no_entries):', wsErr.message);
            }
          } catch (saveErr) {
            console.warn('更新日志状态(parse_failed: no_entries)失败:', saveErr.message);
          }
          results.push({ id: logId, status: 'no_entries' });
          fail++;
          continue;
        }

        // 为减少数据库查询，按 (subsystem, code) 预取 ErrorCode
        const pairKey = (s, c) => `${s}::${c}`;
        const requiredPairs = new Map();
        for (const e of entries) {
          const errorCodeStr = e.error_code || '';
          if (errorCodeStr.length >= 5) {
            const subsystem = errorCodeStr.charAt(0);
            const code = '0X' + errorCodeStr.slice(-4);
            requiredPairs.set(pairKey(subsystem, code), { subsystem, code });
          }
        }

        const pairList = Array.from(requiredPairs.values());
        const explanationsMap = new Map();
        if (pairList.length > 0) {
          for (const p of pairList) {
            try {
              const rec = await ErrorCode.findOne({ where: { subsystem: p.subsystem, code: p.code } });
              if (rec && rec.explanation) {
                explanationsMap.set(pairKey(p.subsystem, p.code), rec.explanation);
              }
            } catch (_) {}
          }
        }

        // 更新释义（仅 explanation 字段）
        let updatedCount = 0;
        for (const e of entries) {
          const errorCodeStr = e.error_code || '';
          let explanationTemplate = e.explanation || '';
          if (errorCodeStr.length >= 5) {
            const subsystem = errorCodeStr.charAt(0);
            const code = '0X' + errorCodeStr.slice(-4);
            const tpl = explanationsMap.get(pairKey(subsystem, code));
            if (tpl) explanationTemplate = tpl;
            const parsed = parseExplanation(
              explanationTemplate,
              e.param1,
              e.param2,
              e.param3,
              e.param4,
              {
                error_code: e.error_code,
                subsystem,
                arm: errorCodeStr?.charAt(1) || null,
                joint: errorCodeStr?.charAt(2) || null
              }
            );
            if (parsed !== e.explanation) {
              await LogEntry.update({ explanation: parsed }, { where: { id: e.id } });
              updatedCount += 1;
              // 同步内存值，供后续写文件
              e.explanation = parsed;
            }
          }
        }

        // 生成并覆盖本地解密文件
        const decryptedLines = entries.map(r => {
          const localTs = dayjs(r.timestamp).format('YYYY-MM-DD HH:mm:ss');
          return `${localTs} ${r.error_code} ${r.param1} ${r.param2} ${r.param3} ${r.param4} ${r.explanation || ''}`;
        }).join('\n');

        let outPath = log.decrypted_path;
        try {
          if (!outPath) {
            // 若之前未生成过，按设备目录与原始名推导
            let deviceFolder = UPLOAD_DIR;
            if (log.device_id) {
              deviceFolder = path.join(UPLOAD_DIR, log.device_id);
              if (!fs.existsSync(deviceFolder)) fs.mkdirSync(deviceFolder, { recursive: true });
            }
            const decryptedFileName = (log.original_name || `log_${log.id}.medbot`).replace('.medbot', '.txt');
            outPath = path.join(deviceFolder, decryptedFileName);
            log.decrypted_path = outPath;
          }
          fs.writeFileSync(outPath, decryptedLines, 'utf-8');
        } catch (fileErr) {
          console.error('写入解密文件失败:', fileErr);
        }

        // 更新日志元数据并推送完成状态
        log.status = 'parsed';
        log.parse_time = new Date();
        await log.save();
        try {
          const websocketService = require('../services/websocketService');
          if (log.device_id) {
            websocketService.pushLogStatusChange(log.device_id, log.id, 'parsed', 'parsing');
            // 记录到批量变化
            if (!deviceChangesMap.has(log.device_id)) deviceChangesMap.set(log.device_id, []);
            deviceChangesMap.get(log.device_id).push({ logId: log.id, oldStatus: 'parsing', newStatus: 'parsed' });
          }
        } catch (wsErr) {
          console.warn('WebSocket 状态推送失败(parsed):', wsErr.message);
        }

        results.push({ id: logId, status: 'ok', updated: updatedCount, total: entries.length });
        success++;
        
              } catch (error) {
          console.error(`处理日志 ${logId} 失败:`, error);
          try {
            const log = await Log.findByPk(logId);
            if (log) {
              const oldStatus2 = log.status;
              // 批量重新解析失败通常是解析阶段的问题
              log.status = 'parse_failed';
              await log.save();
              try {
                const websocketService = require('../services/websocketService');
                if (log.device_id) {
                  websocketService.pushLogStatusChange(log.device_id, log.id, 'parse_failed', oldStatus2);
                  // 记录到批量变化
                  if (!deviceChangesMap.has(log.device_id)) deviceChangesMap.set(log.device_id, []);
                  deviceChangesMap.get(log.device_id).push({ logId: log.id, oldStatus: oldStatus2, newStatus: 'parse_failed' });
                }
              } catch (wsErr) {
                console.warn('WebSocket 状态推送失败(parse_failed):', wsErr.message);
              }
            }
          } catch (_) {}
          results.push({ id: logId, status: 'error', error: error.message });
          fail++;
        }
    }

    await job.progress(100);

    // 批次完成后，按设备推送批量状态变化，便于前端一次刷新
    try {
      const websocketService = require('../services/websocketService');
      for (const [deviceId, changes] of deviceChangesMap.entries()) {
        if (deviceId) {
          websocketService.pushBatchStatusChange(deviceId, changes || []);
        }
      }
    } catch (wsErr) {
      console.warn('批量状态变化推送失败:', wsErr.message);
    }

    return {
      success: true,
      results,
      successCount: success,
      failCount: fail
    };

  } catch (error) {
    console.error('批量重新解析失败:', error);
    throw error;
  }
}

/**
 * 批量删除日志
 * @param {Object} job - Bull队列任务对象
 */
async function batchDeleteLogs(job) {
  const { logIds, userId } = job.data;
  
  console.log(`开始批量删除 ${logIds.length} 个日志，用户ID: ${userId}`);

  try {
    const results = [];
    let success = 0;
    let fail = 0;
    const deviceChangesMap = new Map(); // deviceId -> changes array

    for (let i = 0; i < logIds.length; i++) {
      const logId = logIds[i];
      
      try {
        // 更新任务进度
        await job.progress(Math.floor((i / logIds.length) * 100));
        
        console.log(`删除日志 ${logId} (${i + 1}/${logIds.length})`);
        
        // 获取日志信息
        const log = await Log.findByPk(logId);
        if (!log) {
          results.push({ id: logId, status: 'not_found' });
          fail++;
          continue;
        }

        // 删除解密文件（如果存在）
        if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
          try {
            fs.unlinkSync(log.decrypted_path);
            console.log(`已删除解密文件: ${log.decrypted_path}`);
          } catch (fileError) {
            console.warn(`删除解密文件失败: ${fileError.message}`);
            // 文件删除失败不影响整体删除流程
          }
        }
        
        // 删除相关的日志明细
        try {
          await LogEntry.destroy({ where: { log_id: logId } });
          console.log(`已删除日志明细，日志ID: ${logId}`);
        } catch (entryError) {
          console.warn(`删除日志明细失败: ${entryError.message}`);
          // 明细删除失败不影响整体删除流程
        }
        
        // 保存设备ID，因为删除后log对象无法访问
        const deviceId = log.device_id;
        
        // 推送删除状态变化到 WebSocket
        try {
          const websocketService = require('../services/websocketService');
          websocketService.pushLogStatusChange(deviceId, logId, 'deleting', log.status);
        } catch (wsError) {
          console.warn('WebSocket 状态推送失败:', wsError.message);
        }
        
        // 删除日志记录
        await log.destroy();
        console.log(`已删除日志记录，日志ID: ${logId}`);
        
        // 推送删除完成状态变化到 WebSocket
        try {
          const websocketService = require('../services/websocketService');
          websocketService.pushLogStatusChange(deviceId, logId, 'deleted', 'deleting');
          // 记录到批量变化
          if (deviceId) {
            if (!deviceChangesMap.has(deviceId)) deviceChangesMap.set(deviceId, []);
            deviceChangesMap.get(deviceId).push({ logId, oldStatus: 'deleting', newStatus: 'deleted' });
          }
        } catch (wsError) {
          console.warn('WebSocket 状态推送失败:', wsError.message);
        }
        
        await job.progress(100);
        
        results.push({ id: logId, status: 'ok' });
        success++;
        
      } catch (error) {
        console.error(`删除日志 ${logId} 失败:`, error);
        
        // 删除失败时，将状态设置为失败
        try {
          await Log.update(
            { status: 'failed' },
            { where: { id: logId } }
          );
          console.log(`✅ 已更新日志 ${logId} 状态为 'failed'`);
          // 推送失败状态变化到 WebSocket，并记录批量变化
          try {
            const websocketService = require('../services/websocketService');
            // 获取设备ID（失败时日志可能仍存在，若不存在则跳过推送）
            let deviceIdOnFail = null;
            try {
              const lg = await Log.findByPk(logId);
              deviceIdOnFail = lg?.device_id || null;
            } catch (_) {}
            if (deviceIdOnFail) {
              websocketService.pushLogStatusChange(deviceIdOnFail, logId, 'failed', 'deleting');
              if (!deviceChangesMap.has(deviceIdOnFail)) deviceChangesMap.set(deviceIdOnFail, []);
              deviceChangesMap.get(deviceIdOnFail).push({ logId, oldStatus: 'deleting', newStatus: 'failed' });
            }
          } catch (wsErr) {
            console.warn('WebSocket 状态推送失败(failed):', wsErr.message);
          }
        } catch (updateError) {
          console.error(`❌ 更新日志 ${logId} 状态失败: ${updateError.message}`);
        }
        
        results.push({ id: logId, status: 'error', error: error.message });
        fail++;
      }
    }

    await job.progress(100);

    // 批次完成后，按设备推送批量状态变化
    try {
      const websocketService = require('../services/websocketService');
      for (const [deviceId, changes] of deviceChangesMap.entries()) {
        if (deviceId && changes.length > 0) {
          websocketService.pushBatchStatusChange(deviceId, changes);
        }
      }
    } catch (wsErr) {
      console.warn('批量删除状态变化推送失败:', wsErr.message);
    }

    return {
      success: true,
      results,
      successCount: success,
      failCount: fail
    };

  } catch (error) {
    console.error('批量删除失败:', error);
    throw error;
  }
}

/**
 * 处理单个删除任务
 * @param {Object} job - Bull队列任务对象
 */
async function processSingleDelete(job) {
  const { logId, userId } = job.data;
  
  console.log(`开始删除日志: ${logId}, 用户ID: ${userId}`);

  try {
    // 更新任务进度
    await job.progress(10);
    
    // 获取日志信息
    const log = await Log.findByPk(logId);
    if (!log) {
      throw new Error('日志不存在');
    }
    
    // 更新任务进度
    await job.progress(30);
    
    // 删除解密文件（如果存在）
    if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
      try {
        fs.unlinkSync(log.decrypted_path);
        console.log(`已删除解密文件: ${log.decrypted_path}`);
      } catch (fileError) {
        console.warn(`删除解密文件失败: ${fileError.message}`);
        // 文件删除失败不影响整体删除流程
      }
    }
    
    // 更新任务进度
    await job.progress(60);
    
    // 删除相关的日志明细
    try {
      await LogEntry.destroy({ where: { log_id: logId } });
      console.log(`已删除日志明细，日志ID: ${logId}`);
    } catch (entryError) {
      console.warn(`删除日志明细失败: ${entryError.message}`);
      // 明细删除失败不影响整体删除流程
    }
    
    // 更新任务进度
    await job.progress(90);
    
            // 推送删除状态变化到 WebSocket
        try {
          const websocketService = require('../services/websocketService');
          websocketService.pushLogStatusChange(log.device_id, logId, 'deleting', log.status);
        } catch (wsError) {
          console.warn('WebSocket 状态推送失败:', wsError.message);
        }
        
        // 保存设备ID，因为删除后log对象无法访问
        const deviceId = log.device_id;
        
        // 删除日志记录
        await log.destroy();
        console.log(`已删除日志记录，日志ID: ${logId}`);
        
        // 推送删除完成状态变化到 WebSocket
        try {
          const websocketService = require('../services/websocketService');
          websocketService.pushLogStatusChange(deviceId, logId, 'deleted', 'deleting');
        } catch (wsError) {
          console.warn('WebSocket 状态推送失败:', wsError.message);
        }
        
        await job.progress(100);

    return {
      success: true,
      logId: logId,
      message: '日志删除成功'
    };

  } catch (error) {
    console.error(`删除日志 ${logId} 失败:`, error);
    
    // 删除失败时，将状态设置为失败
    try {
      await Log.update(
        { status: 'failed' },
        { where: { id: logId } }
      );
      console.log(`✅ 已更新日志状态为 'failed'`);
    } catch (updateError) {
      console.error(`❌ 更新日志状态失败: ${updateError.message}`);
    }
    
    throw error;
  }
}

module.exports = {
  batchReparseLogs,
  batchDeleteLogs,
  processSingleDelete
};
