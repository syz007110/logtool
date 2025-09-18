const fs = require('fs');

const dayjs = require('dayjs');

// 默认密钥常量
const DEFAULT_KEY = '00-01-05-6E-F0-22';
/**
 * 解析日期和时间字符串
 * @param {string} dateTimeStr - 格式为 'DT#YYYY-MM-DD-HH:MM:SS' 的日期时间字符串
 * @returns {Date} 解析后的日期对象
 */
function parseDateTime(dateTimeStr) {
  
  try {
    // 检查是否以 'DT#' 开头
    if (!dateTimeStr.startsWith('DT#')) {
      // 尝试直接解析
      const dt = new Date(dateTimeStr);
      if (isNaN(dt.getTime())) {
        throw new Error(`无法解析日期时间: ${dateTimeStr}`);
      }
      return dt;
    }
    
    // 去除前缀 'DT#'
    const dateStr = dateTimeStr.substring(3);
    
    const formattedInput = dateStr.replace(/-(\d{2}:\d{2}:\d{2})$/, ' $1');

    // 使用dayjs解析并返回Date对象
    const dt = dayjs(formattedInput).toDate();
    
    // 验证解析结果
    if (isNaN(dt.getTime())) {
      throw new Error(`dayjs解析失败: ${formattedInput}`);
    }
    
    return dt;
  } catch (error) {
    console.error(`解析日期时间失败: ${dateTimeStr}`, error.message);
    // 返回当前时间作为默认值，避免数据库错误
    return new Date();
  }
}

/**
 * 对密钥进行处理，生成解密密钥
 * @param {string} key - 输入的密钥字符串
 * @returns {Array} 8字节解密密钥（字节数组）
 */
function operateKey(key) {
  // 将 "-" 替换为 ":"
  const keyTemp = key.replace(/-/g, ':');
  
  // 将密钥转换为字节数组（UTF-8编码）
  const keyBytes = Buffer.from(keyTemp, 'utf8');
  
  // 检查密钥长度
  if (keyBytes.length < 17) {
    throw new Error(`密钥长度不足，期望至少17个字符，实际${keyBytes.length}个字符`);
  }
  
  // 定义加密值
  const encryptValue = 211;
  
  // 初始化解密密钥
  const decryptKey = new Array(8).fill(0);
  
  // 对字节数组进行 XOR 操作，生成解密密钥
  decryptKey[0] = keyBytes[7] ^ encryptValue;
  decryptKey[1] = keyBytes[4] ^ encryptValue;
  decryptKey[2] = keyBytes[11] ^ encryptValue;
  decryptKey[3] = keyBytes[16] ^ encryptValue;
  decryptKey[4] = keyBytes[15];
  decryptKey[5] = keyBytes[9];
  decryptKey[6] = keyBytes[12];
  decryptKey[7] = keyBytes[10];
  
  return decryptKey;
}

/**
 * 解码错误码
 * @param {string} errCode - 32位错误码（十六进制字符串）
 * @param {string} key - 密钥字符串
 * @returns {string} 解码后的错误码（十六进制字符串，无前缀）
 */
function decryptErrorCode(errCode, key) {
  // 将错误码从十六进制字符串转换为整数
  const errCodeInt = parseInt(errCode, 16);
  
  const decryptKey = operateKey(key);
  
  // 将错误码转换为字节数组
  const encryptErrCode = [
    (errCodeInt >> 24) & 0xFF,
    (errCodeInt >> 16) & 0xFF,
    (errCodeInt >> 8) & 0xFF,
    errCodeInt & 0xFF
  ];
  
  // 使用密钥对字节数组进行异或操作
  const decryptErrCode = encryptErrCode.map((byte, i) => byte ^ decryptKey[i]);
  
  // 将解码后的字节数组重新组合为32位整数
  const decryptedErrCode = (
    decryptErrCode[0] * (256 ** 3) +
    decryptErrCode[3] * (256 ** 2) +
    decryptErrCode[1] * 256 +
    decryptErrCode[2]
  );
  
  // 转换为16进制字符串并去除前缀 '0x'
  return decryptedErrCode.toString(16);
}

/**
 * 解密参数
 * @param {string} para - 参数（十六进制字符串）
 * @param {string} key - 密钥字符串
 * @returns {number} 解密后的参数值
 */
function decryptPara(para, key) {
  // 将参数从十六进制字符串转换为整数
  const paraInt = parseInt(para, 16);
  
  const decryptKey = operateKey(key);
  
  const pTemp = 0xA16D768E;
  if (paraInt !== pTemp) {
    // 将 para 转换为字节数组
    const encryptPara = Buffer.alloc(4);
    encryptPara.writeUInt32BE(paraInt, 0);
    
    // 使用 key 的后 4 个字节进行异或操作
    const decryptPara = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) {
      decryptPara[i] = encryptPara[i] ^ decryptKey[i + 4];
    }
    
    // 将解密后的字节数组转换回整数（有符号）
    return decryptPara.readInt32BE(0);
  } else {
    return 0;
  }
}

/**
 * 获取用户信息和操作信息
 * @param {string} errCodeDec - 解密后的错误码
 * @param {number} p1 - 参数1
 * @param {number} p2 - 参数2
 * @param {number} p3 - 参数3
 * @param {number} p4 - 参数4
 * @returns {Array} 描述信息数组
 */
function getUserInfoAndOpInfo(errCodeDec, p1, p2, p3, p4) {
  // 这里先返回基本信息，实际的释义查询将在数据库层面进行
  return [`Error Code: ${errCodeDec}`, `Params: ${p1}, ${p2}, ${p3}, ${p4}`];
}

/**
 * 检测是否为开机事件
 * @param {string} errorCode - 解密后的错误码
 * @param {number} p1 - 参数1
 * @param {number} p2 - 参数2
 * @returns {boolean} 是否为开机事件
 */
function isPowerOnEvent(errorCode, p1, p2) {
  if (!errorCode) return false;
  
  const errorCodeSuffix = errorCode.slice(-4);
  
  // 情况1：错误码后四位为"A01E"
  if (errorCodeSuffix === 'A01E') {
    return true;
  }
  
  // 情况2：错误码为"570e"且参数1=0且参数2≠0
  if (errorCodeSuffix === '570e' && p1 === 0 && p2 !== 0) {
    return true;
  }
  
  return false;
}

/**
 * 检测是否为关机事件
 * @param {string} errorCode - 解密后的错误码
 * @param {number} p1 - 参数1
 * @param {number} p2 - 参数2
 * @returns {boolean} 是否为关机事件
 */
function isPowerOffEvent(errorCode, p1, p2) {
  if (!errorCode) return false;
  
  const errorCodeSuffix = errorCode.slice(-4);
  
  // 情况1：错误码后四位为"A02E"
  if (errorCodeSuffix === 'A02E') {
    return true;
  }
  
  // 情况2：错误码为"310e"且参数2=31
  if (errorCodeSuffix === '310e' && p2 === 31) {
    return true;
  }
  
  return false;
}

/**
 * 检测参数值是否大于100000
 * @param {number} p1 - 参数1
 * @param {number} p2 - 参数2
 * @param {number} p3 - 参数3
 * @param {number} p4 - 参数4
 * @returns {boolean} 是否有参数值大于100000
 */
function hasLargeParameterValue(p1, p2, p3, p4) {
  return Math.abs(p1) > 2000000 || Math.abs(p2) > 2000000 || Math.abs(p3) > 2000000 || Math.abs(p4) > 2000000;
}                    

/**
 * 解析单行日志
 * @param {string} line - 日志行内容
 * @param {string} key - 解密密钥
 * @returns {Object} 解析后的日志条目
 */
function translatePerLine(line, key) {
  try {
    const split = line.trim().split(/\s+/);
    
    if (split.length < 6) {
      throw new Error(`日志行格式不正确，期望至少6个字段，实际得到${split.length}个: ${line}`);
    }
    
    // 解析日期和时间
    const dateTime = parseDateTime(split[0]);
    
    // 解析错误码和其他参数
    const errCode = split[1];
    
    // 验证参数是否为有效的十六进制
    const p1Hex = split[2];
    const p2Hex = split[3];
    const p3Hex = split[4];
    const p4Hex = split[5];
    
    if (!/^[0-9A-Fa-f]+$/.test(p1Hex) || !/^[0-9A-Fa-f]+$/.test(p2Hex) || 
        !/^[0-9A-Fa-f]+$/.test(p3Hex) || !/^[0-9A-Fa-f]+$/.test(p4Hex)) {
      throw new Error(`参数不是有效的十六进制格式: ${p1Hex}, ${p2Hex}, ${p3Hex}, ${p4Hex}`);
    }
    
    // 解密错误码
    let errCodeDec = decryptErrorCode(errCode, key);
    
    // 如果解密后的故障码为"310e"，补全成"100310e"
    if (errCodeDec === '310e') {
      errCodeDec = '100310e';
    }
    
    // 解密参数
    const p1 = decryptPara(p1Hex, key);
    const p2 = decryptPara(p2Hex, key);
    const p3 = decryptPara(p3Hex, key);
    const p4 = decryptPara(p4Hex, key);
    
    // 获取用户信息和操作信息
    const errDesc = getUserInfoAndOpInfo(errCodeDec, p1, p2, p3, p4);
    
    const result = {
      timestamp: dateTime,
      error_code: errCodeDec,
      param1: p1.toString(),
      param2: p2.toString(),
      param3: p3.toString(),
      param4: p4.toString(),
      explanation: errDesc.join('; ')
    };
    
    return result;
  } catch (error) {
    // 性能优化：减少详细日志输出，只保留核心错误信息
    // 详细分析将在批量错误报告中提供
    throw error;
  }
}

/**
 * 解密日志文件内容
 * @param {string} content - 日志文件内容
 * @param {string} key - 解密密钥
 * @returns {Array} 解密后的日志条目数组
 */
function decryptLogContent(content, key) {
  console.log(`开始解析日志内容，总长度: ${content.length}`);
  
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  console.log(`过滤后有效行数: ${lines.length}`);
  
  // 性能优化：大文件处理
  const isLargeFile = lines.length > 10000;
  const progressInterval = isLargeFile ? Math.floor(lines.length / 20) : 1000; // 大文件每5%输出一次进度
  
  const entries = [];
  let errorCount = 0;
  let currentKey = key; // 当前使用的密钥
  let useDefaultKey = false; // 是否使用默认密钥
  let powerOnWithLargeParams = false; // 是否检测到参数值大于100000的开机事件
  let isFirstLogEntry = true; // 标记是否为第一条日志
  
  // 新增：解密失败检测（在测试阶段进行）
  
  // 性能优化：批量错误收集，减少日志输出频率
  const errorBatch = [];
  const maxErrorBatchSize = isLargeFile ? 50 : 10; // 大文件批量输出错误
  
  // 每个新的日志文件都从原始密钥开始，重置所有状态
  console.log(`新日志文件开始，使用原始密钥: ${key}`);
  if (isLargeFile) {
    console.log(`📊 检测到大文件 (${lines.length} 行)，启用性能优化模式`);
  }
  
  // 新增：先尝试解密前几行来检测密钥是否正确
  const testLines = Math.min(10, lines.length); // 测试前10行
  let userKeyTestFailed = false;
  let defaultKeyTestFailed = false;
  
  console.log(`🔍 开始密钥有效性检测，测试前 ${testLines} 行`);
  
  for (let i = 0; i < testLines; i++) {
    const line = lines[i];
    
    try {
      // 尝试用户密钥
      const userEntry = translatePerLine(line, key);
      const userP1 = parseInt(userEntry.param1) || 0;
      const userP2 = parseInt(userEntry.param2) || 0;
      const userP3 = parseInt(userEntry.param3) || 0;
      const userP4 = parseInt(userEntry.param4) || 0;
      
      if (hasLargeParameterValue(userP1, userP2, userP3, userP4)) {
        userKeyTestFailed = true;
        console.log(`用户密钥测试失败，第${i+1}行参数异常: p1=${userP1}, p2=${userP2}, p3=${userP3}, p4=${userP4}`);
      }
      
      // 尝试默认密钥
      const defaultEntry = translatePerLine(line, DEFAULT_KEY);
      const defaultP1 = parseInt(defaultEntry.param1) || 0;
      const defaultP2 = parseInt(defaultEntry.param2) || 0;
      const defaultP3 = parseInt(defaultEntry.param3) || 0;
      const defaultP4 = parseInt(defaultEntry.param4) || 0;
      
      if (hasLargeParameterValue(defaultP1, defaultP2, defaultP3, defaultP4)) {
        defaultKeyTestFailed = true;
        console.log(`默认密钥测试失败，第${i+1}行参数异常: p1=${defaultP1}, p2=${defaultP2}, p3=${defaultP3}, p4=${defaultP4}`);
      }
      
    } catch (error) {
      // 如果解密失败，记录错误但不中断测试
      console.log(`密钥测试第${i+1}行解密失败: ${error.message}`);
    }
  }
  
  // 如果两个密钥都失败了，记录错误但不中断处理
  if (userKeyTestFailed && defaultKeyTestFailed) {
    console.log(`❌ 解密失败：用户密钥和默认密钥都出现参数大于200000的情况，跳过此文件处理`);
    // 返回空的日志条目数组，而不是抛出错误
    return [];
  }
  
  // 根据测试结果选择初始密钥
  if (userKeyTestFailed && !defaultKeyTestFailed) {
    console.log(`用户密钥测试失败，使用默认密钥进行解密`);
    currentKey = DEFAULT_KEY;
    useDefaultKey = true;
  } else if (!userKeyTestFailed && defaultKeyTestFailed) {
    console.log(`默认密钥测试失败，使用用户密钥进行解密`);
    currentKey = key;
    useDefaultKey = false;
  } else {
    console.log(`密钥测试通过，使用用户密钥进行解密`);
    currentKey = key;
    useDefaultKey = false;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 性能优化：进度输出
    if (isLargeFile && (i + 1) % progressInterval === 0) {
      const progress = Math.round(((i + 1) / lines.length) * 100);
      console.log(`📈 解析进度: ${progress}% (${i + 1}/${lines.length})`);
    }
    
    try {
      // 使用当前密钥解密
      let entry;
      
      try {
        entry = translatePerLine(line, currentKey);
      } catch (error) {
        // 如果当前密钥解密失败，尝试使用另一个密钥
        if (currentKey === key && !useDefaultKey) {
          console.log(`使用原始密钥解密失败，尝试使用默认密钥: ${DEFAULT_KEY}`);
          try {
            entry = translatePerLine(line, DEFAULT_KEY);
            currentKey = DEFAULT_KEY;
            useDefaultKey = true;
          } catch (defaultError) {
            // 两个密钥都失败了
            throw error;
          }
        } else if (currentKey === DEFAULT_KEY && !useDefaultKey) {
          console.log(`使用默认密钥解密失败，尝试使用用户密钥: ${key}`);
          try {
            entry = translatePerLine(line, key);
            currentKey = key;
            useDefaultKey = false;
          } catch (userError) {
            // 两个密钥都失败了
            throw error;
          }
        } else {
          throw error;
        }
      }
      
      // 检查是否为开机或关机事件
      const p1 = parseInt(entry.param1) || 0;
      const p2 = parseInt(entry.param2) || 0;
      const p3 = parseInt(entry.param3) || 0;
      const p4 = parseInt(entry.param4) || 0;
      
      let needReDecrypt = false; // 标记是否需要重新解密
      
      // 平行检测：第一条日志检测和开机事件检测
      // 1. 检查新日志文件第一条日志的参数值
      if (isFirstLogEntry) {
        console.log(`检查新日志文件第一条日志参数值: p1=${p1}, p2=${p2}, p3=${p3}, p4=${p4}`);
        if (hasLargeParameterValue(p1, p2, p3, p4)) {
          // 第一条日志参数异常，切换到默认密钥
          console.log(`新日志文件第一条日志参数值异常，切换到默认密钥`);
          useDefaultKey = true;
          currentKey = DEFAULT_KEY;
          needReDecrypt = true;
        }
        isFirstLogEntry = false;
      }
      
      // 2. 检查开机事件（与第一条日志检测平行）
      if (isPowerOnEvent(entry.error_code, p1, p2)) {
        console.log(`检测到开机事件: ${entry.error_code}, 时间: ${entry.timestamp}`);
        
        // 重新判断参数值（独立于第一条日志检测）
        if (hasLargeParameterValue(p1, p2, p3, p4)) {
          // 参数异常：根据当前密钥决定切换到哪个密钥
          if (currentKey === key) {
            // 当前使用用户密钥，切换到默认密钥
            console.log(`开机事件参数值异常，从用户密钥切换到默认密钥`);
            powerOnWithLargeParams = true;
            useDefaultKey = true;
            currentKey = DEFAULT_KEY;
            needReDecrypt = true;
          } else {
            // 当前使用默认密钥，切换到用户密钥
            console.log(`开机事件参数值异常，从默认密钥切换到用户密钥`);
            powerOnWithLargeParams = true;
            useDefaultKey = false;
            currentKey = key;
            needReDecrypt = true;
          }
        } else {
          // 参数值正常，恢复使用原始密钥
          console.log(`开机事件参数值正常，恢复使用原始密钥: ${key}`);
          powerOnWithLargeParams = false;
          currentKey = key;
          useDefaultKey = false;
          needReDecrypt = true;
        }
      } else if (isPowerOffEvent(entry.error_code, p1, p2)) {
        console.log(`检测到关机事件: ${entry.error_code}, 时间: ${entry.timestamp}`);
        
        // 关机事件时恢复使用原始密钥
        if (powerOnWithLargeParams) {
          console.log(`关机事件，恢复使用原始密钥: ${key}`);
          powerOnWithLargeParams = false;
          currentKey = key;
          useDefaultKey = false;
          needReDecrypt = true;
        }
      }
      
      // 如果需要重新解密，使用当前密钥重新解密
      if (needReDecrypt) {
        console.log(`🔄 重新解密第 ${i + 1} 行，使用密钥: ${currentKey}`);
        const oldP1 = p1, oldP2 = p2, oldP3 = p3, oldP4 = p4;
        entry = translatePerLine(line, currentKey);
        
        // 输出重新解密后的参数值（仅在大文件时输出）
        if (isLargeFile) {
          const newP1 = parseInt(entry.param1) || 0;
          const newP2 = parseInt(entry.param2) || 0;
          const newP3 = parseInt(entry.param3) || 0;
          const newP4 = parseInt(entry.param4) || 0;
          
          // 检查参数值是否发生变化
          if (newP1 !== oldP1 || newP2 !== oldP2 || newP3 !== oldP3 || newP4 !== oldP4) {
            console.log(`✅ 重新解密后参数值变化: p1=${oldP1}→${newP1}, p2=${oldP2}→${newP2}, p3=${oldP3}→${newP3}, p4=${oldP4}→${newP4}`);
          } else {
            console.log(`✅ 重新解密完成，参数值无变化`);
          }
        }
      }
      
      entries.push(entry);
    } catch (error) {
      errorCount++;
      
      // 性能优化：批量收集错误，减少日志输出
      const errorInfo = {
        lineNumber: i + 1,
        line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
        errorType: error.constructor.name,
        errorMessage: error.message,
        currentKey: currentKey
      };
      
      errorBatch.push(errorInfo);
      
      // 当错误批次达到最大大小时，批量输出
      if (errorBatch.length >= maxErrorBatchSize) {
        console.warn(`⚠️ 批量错误报告 (${errorBatch.length} 个错误):`);
        errorBatch.forEach((err, idx) => {
          console.warn(`   ${idx + 1}. 行 ${err.lineNumber}: ${err.errorMessage}`);
        });
        console.warn(`   --- 批量错误报告结束 ---`);
        errorBatch.length = 0; // 清空批次
      }
    }
  }
  
  // 输出剩余的批量错误
  if (errorBatch.length > 0) {
    console.warn(`⚠️ 最终错误报告 (${errorBatch.length} 个错误):`);
    errorBatch.forEach((err, idx) => {
      console.warn(`   ${idx + 1}. 行 ${err.lineNumber}: ${err.errorMessage}`);
    });
  }
  
  // 性能优化：如果错误率过高，提供详细分析建议
  const errorRate = lines.length > 0 ? (errorCount / lines.length) * 100 : 0;
  if (errorRate > 10) { // 错误率超过10%
    console.warn(`⚠️ 错误率较高 (${errorRate.toFixed(1)}%)，建议检查:`);
    console.warn(`   - 密钥是否正确`);
    console.warn(`   - 文件格式是否标准`);
    console.warn(`   - 文件是否损坏或包含非日志内容`);
  }
  
  console.log(`📊 解析完成统计:`);
  console.log(`   ✅ 成功解析: ${entries.length} 行`);
  console.log(`   ❌ 解析失败: ${errorCount} 行`);
  console.log(`   📈 成功率: ${lines.length > 0 ? Math.round((entries.length / lines.length) * 100) : 0}%`);
  console.log(`   🔑 最终使用密钥: ${currentKey}`);
  console.log(`   🔄 是否切换密钥: ${useDefaultKey ? '是' : '否'}`);
  
  // 新增：解密失败检测结果
  if (userKeyTestFailed) {
    console.log(`   ⚠️ 用户密钥测试失败: 出现参数大于100000的情况`);
  }
  if (defaultKeyTestFailed) {
    console.log(`   ⚠️ 默认密钥测试失败: 出现参数大于100000的情况`);
  }
  
  // 性能优化：大文件时显示处理时间估算
  if (isLargeFile) {
    console.log(`   ⏱️ 大文件处理完成`);
  }
  
  if (powerOnWithLargeParams) {
    console.log(`⚠️ 注意：检测到参数值大于100000的开机事件，但未检测到对应的关机事件，日志可能不完整`);
  }
  if (useDefaultKey) {
    console.log(`⚠️ 注意：新日志文件使用了默认密钥进行解密`);
  }
  
  // 只在错误率较高时提供建议，避免冗余信息
  if (errorCount > 0 && errorRate > 5) {
    console.log(`🔍 失败行数较多，建议检查:`);
    console.log(`   - 密钥是否正确`);
    console.log(`   - 文件格式是否标准`);
    console.log(`   - 文件是否损坏`);
  }
  
  if (entries.length === 0 && lines.length > 0) {
    throw new Error(`所有 ${lines.length} 行日志解析都失败了`);
  }
  
  return entries;
}

/**
 * 详细错误分析函数（用于调试）
 * @param {string} line - 日志行内容
 * @param {string} key - 解密密钥
 * @param {Error} error - 错误对象
 */
function analyzeError(line, key, error) {
  console.error(`🔍 详细错误分析:`);
  console.error(`   📄 原始行: ${line}`);
  console.error(`   🔑 使用密钥: ${key}`);
  console.error(`   ❌ 错误类型: ${error.constructor.name}`);
  console.error(`   💬 错误消息: ${error.message}`);
  
  if (error.message.includes('日志行格式不正确')) {
    const split = line.trim().split(/\s+/);
    console.error(`   📊 格式分析:`);
    console.error(`      - 分割后字段数: ${split.length}`);
    console.error(`      - 期望字段数: 至少6个`);
    console.error(`      - 分割结果: [${split.join(', ')}]`);
  } else if (error.message.includes('参数不是有效的十六进制格式')) {
    const split = line.trim().split(/\s+/);
    console.error(`   📊 参数分析:`);
    if (split.length >= 6) {
      console.error(`      - 参数1: ${split[2]} (${/^[0-9A-Fa-f]+$/.test(split[2]) ? '有效' : '无效'})`);
      console.error(`      - 参数2: ${split[3]} (${/^[0-9A-Fa-f]+$/.test(split[3]) ? '有效' : '无效'})`);
      console.error(`      - 参数3: ${split[4]} (${/^[0-9A-Fa-f]+$/.test(split[4]) ? '有效' : '无效'})`);
      console.error(`      - 参数4: ${split[5]} (${/^[0-9A-Fa-f]+$/.test(split[5]) ? '有效' : '无效'})`);
    }
  } else if (error.message.includes('无法解析日期时间')) {
    const split = line.trim().split(/\s+/);
    console.error(`   📊 时间戳分析:`);
    console.error(`      - 时间戳字段: ${split[0]}`);
    console.error(`      - 期望格式: DT#YYYY-MM-DD-HH:MM:SS 或标准日期格式`);
  }
}

module.exports = {
  parseDateTime,
  operateKey,
  decryptErrorCode,
  decryptPara,
  getUserInfoAndOpInfo,
  translatePerLine,
  decryptLogContent,
  isPowerOnEvent,
  isPowerOffEvent,
  hasLargeParameterValue,
  analyzeError, // 新增详细错误分析函数
  DEFAULT_KEY
}; 