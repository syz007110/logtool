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

        // 标记为解析中
        await log.update({ status: 'parsing' });

        // 读取现有明细
        const entries = await LogEntry.findAll({ 
          where: { log_id: logId }, 
          order: [['timestamp', 'ASC']] 
        });
        
        if (!entries || entries.length === 0) {
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

        // 更新日志元数据
        log.status = 'parsed';
        log.parse_time = new Date();
        await log.save();

        results.push({ id: logId, status: 'ok', updated: updatedCount, total: entries.length });
        success++;
        
      } catch (error) {
        console.error(`处理日志 ${logId} 失败:`, error);
        try {
          const log = await Log.findByPk(logId);
          if (log) {
            log.status = 'failed';
            await log.save();
          }
        } catch (_) {}
        results.push({ id: logId, status: 'error', error: error.message });
        fail++;
      }
    }

    await job.progress(100);

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
          fs.unlinkSync(log.decrypted_path);
        }
        
        // 删除相关的日志明细
        await LogEntry.destroy({ where: { log_id: logId } });
        
        // 删除日志记录
        await log.destroy();
        
        results.push({ id: logId, status: 'ok' });
        success++;
        
      } catch (error) {
        console.error(`删除日志 ${logId} 失败:`, error);
        results.push({ id: logId, status: 'error', error: error.message });
        fail++;
      }
    }

    await job.progress(100);

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

module.exports = {
  batchReparseLogs,
  batchDeleteLogs
};
