const fs = require('fs');
const path = require('path');
const OperationLog = require('../models/operation_log');

const LOG_DIR = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

function getLogFilePath(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return path.join(LOG_DIR, `operation-${y}-${m}-${day}.log`);
}

async function logOperation({
  operation,
  description = '',
  user_id = null,
  username = '',
  status = 'success',
  ip = '',
  user_agent = '',
  details = null,
  time = new Date()
}) {
  // 写入数据库
  await OperationLog.create({
    operation,
    description,
    user_id,
    username,
    status,
    ip,
    user_agent,
    details,
    time
  });

  // 写入本地文件
  const logFile = getLogFilePath(time);
  const logLine = JSON.stringify({
    time: new Date(time).toISOString(),
    operation,
    description,
    user_id,
    username,
    status,
    ip,
    user_agent,
    details
  }) + '\n';
  fs.appendFileSync(logFile, logLine, 'utf-8');
}

module.exports = { logOperation, getLogFilePath }; 