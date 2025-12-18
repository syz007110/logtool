/**
 * SystemInfo解析器
 * 支持多种编码格式提取MAC地址
 */

const fs = require('fs');
const path = require('path');

// 支持的编码格式
const SUPPORTED_ENCODINGS = ['utf8', 'gbk', 'gb2312', 'latin1'];

// MAC地址正则表达式
const MAC_ADDRESS_REGEX = /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g;

/**
 * 从systeminfo.txt文件中提取MAC地址
 * @param {string} filePath - systeminfo.txt文件路径
 * @returns {string|null} - 提取到的MAC地址，未找到返回null
 */
function extractMacFromSystemInfo(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      console.log(`SystemInfo文件不存在: ${filePath}`);
      return null;
    }

    // 尝试多种编码格式读取文件
    let content = null;
    let usedEncoding = null;

    for (const encoding of SUPPORTED_ENCODINGS) {
      try {
        content = fs.readFileSync(filePath, encoding);
        usedEncoding = encoding;
        console.log(`成功使用 ${encoding} 编码读取SystemInfo文件`);
        break;
      } catch (error) {
        console.log(`使用 ${encoding} 编码读取失败: ${error.message}`);
        continue;
      }
    }

    if (!content) {
      console.error('无法使用任何支持的编码格式读取systeminfo.txt文件');
      return null;
    }

    // 使用正则表达式匹配MAC地址格式
    const matches = content.match(MAC_ADDRESS_REGEX);
    
    if (matches && matches.length > 0) {
      // 返回第一个匹配的MAC地址，转换为标准格式
      const macAddress = matches[0].replace(/:/g, '-');
      console.log(`从systeminfo.txt提取到MAC地址: ${macAddress} (使用编码: ${usedEncoding})`);
      return macAddress;
    }

    console.log('SystemInfo文件中未找到有效的MAC地址格式');
    return null;
  } catch (error) {
    console.error('解析systeminfo.txt失败:', error);
    return null;
  }
}

/**
 * 在目录中查找systeminfo.txt文件
 * @param {string} startPath - 起始路径
 * @returns {string|null} - 找到的systeminfo.txt文件路径
 */
function findSystemInfoFile(startPath) {
  try {
    if (!startPath || typeof startPath !== 'string') {
      return null;
    }

    // 在当前目录查找
    const currentDir = path.dirname(startPath);
    const systemInfoPath = path.join(currentDir, 'systeminfo.txt');
    
    if (fs.existsSync(systemInfoPath)) {
      console.log(`在当前目录找到systeminfo.txt: ${systemInfoPath}`);
      return systemInfoPath;
    }
    
    // 在上级目录查找
    const parentDir = path.dirname(currentDir);
    const parentSystemInfoPath = path.join(parentDir, 'systeminfo.txt');
    
    if (fs.existsSync(parentSystemInfoPath)) {
      console.log(`在上级目录找到systeminfo.txt: ${parentSystemInfoPath}`);
      return parentSystemInfoPath;
    }
    
    console.log(`未找到systeminfo.txt文件，搜索路径: ${startPath}`);
    return null;
  } catch (error) {
    console.error('查找systeminfo.txt失败:', error);
    return null;
  }
}

/**
 * 递归搜索systeminfo.txt文件
 * @param {string} startPath - 起始路径
 * @param {number} maxDepth - 最大搜索深度
 * @returns {string|null} - 找到的systeminfo.txt文件路径
 */
function findSystemInfoFileRecursive(startPath, maxDepth = 3) {
  try {
    if (!startPath || typeof startPath !== 'string') {
      return null;
    }

    const searchPaths = [];
    let currentPath = startPath;

    // 构建搜索路径列表
    for (let i = 0; i <= maxDepth; i++) {
      searchPaths.push(currentPath);
      currentPath = path.dirname(currentPath);
      
      // 如果到达根目录，停止搜索
      if (currentPath === path.dirname(currentPath)) {
        break;
      }
    }

    // 按优先级搜索
    for (const searchPath of searchPaths) {
      const systemInfoPath = path.join(searchPath, 'systeminfo.txt');
      if (fs.existsSync(systemInfoPath)) {
        console.log(`递归搜索找到systeminfo.txt: ${systemInfoPath}`);
        return systemInfoPath;
      }
    }

    console.log(`递归搜索未找到systeminfo.txt文件，搜索深度: ${maxDepth}`);
    return null;
  } catch (error) {
    console.error('递归搜索systeminfo.txt失败:', error);
    return null;
  }
}

/**
 * 验证MAC地址格式
 * @param {string} macAddress - MAC地址
 * @returns {boolean} - 是否有效
 */
function validateMacAddress(macAddress) {
  if (!macAddress || typeof macAddress !== 'string') {
    return false;
  }
  
  // 支持两种格式：00-01-05-77-6a-09 和 00:01:05:77:6a:09
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(macAddress);
}

/**
 * 标准化MAC地址格式
 * @param {string} macAddress - MAC地址
 * @returns {string} - 标准化后的MAC地址
 */
function normalizeMacAddress(macAddress) {
  if (!macAddress || typeof macAddress !== 'string') {
    return '';
  }
  
  // 统一转换为连字符格式
  return macAddress.replace(/:/g, '-').toLowerCase();
}

/**
 * 从文件内容中提取所有MAC地址
 * @param {string} content - 文件内容
 * @returns {Array} - MAC地址数组
 */
function extractAllMacAddresses(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const matches = content.match(MAC_ADDRESS_REGEX);
  if (!matches) {
    return [];
  }

  // 去重并标准化
  const uniqueMacs = [...new Set(matches)].map(mac => normalizeMacAddress(mac));
  return uniqueMacs;
}

/**
 * 获取支持的编码格式列表
 * @returns {Array} - 支持的编码格式
 */
function getSupportedEncodings() {
  return [...SUPPORTED_ENCODINGS];
}

/**
 * 获取MAC地址正则表达式
 * @returns {RegExp} - MAC地址正则表达式
 */
function getMacAddressRegex() {
  return MAC_ADDRESS_REGEX;
}

module.exports = {
  extractMacFromSystemInfo,
  findSystemInfoFile,
  findSystemInfoFileRecursive,
  validateMacAddress,
  normalizeMacAddress,
  extractAllMacAddresses,
  getSupportedEncodings,
  getMacAddressRegex,
  SUPPORTED_ENCODINGS,
  MAC_ADDRESS_REGEX
};
