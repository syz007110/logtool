/**
 * 翻译服务
 * 支持讯飞（iFlytek）机器翻译 API 自动翻译
 */

const https = require('https');
const CryptoJS = require('crypto-js');

// 语言代码映射（将内部语言代码映射到讯飞API支持的语言代码）
const LANGUAGE_MAP = {
  'zh': 'cn',
  'zh-CN': 'cn',
  'en': 'en',
  'fr': 'fr',
  'de': 'de',
  'es': 'es',
  'it': 'it',
  'pt': 'pt',
  'nl': 'nl',
  'sk': 'sk',
  'ro': 'ro',
  'da': 'da'
};

// 讯飞API配置
const IFLYTEK_CONFIG = {
  hostUrl: 'https://itrans.xfyun.cn/v2/its',
  host: 'itrans.xfyun.cn',
  uri: '/v2/its'
};

/**
 * 生成请求体
 */
function getPostBody(text, from, to, appId) {
  return {
    common: {
      app_id: appId
    },
    business: {
      from: from,
      to: to
    },
    data: {
      text: CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text))
    }
  };
}

/**
 * 获取请求体签名（Digest）
 */
function getDigest(body) {
  return 'SHA-256=' + CryptoJS.enc.Base64.stringify(CryptoJS.SHA256(JSON.stringify(body)));
}

/**
 * 生成鉴权签名
 */
function getAuthStr(date, digest, apiKey, apiSecret) {
  const signatureOrigin = `host: ${IFLYTEK_CONFIG.host}\ndate: ${date}\nPOST ${IFLYTEK_CONFIG.uri} HTTP/1.1\ndigest: ${digest}`;
  const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret);
  const signature = CryptoJS.enc.Base64.stringify(signatureSha);
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line digest", signature="${signature}"`;
  return authorizationOrigin;
}

/**
 * 使用讯飞机器翻译 API 翻译文本
 * @param {string} text - 要翻译的文本
 * @param {string} targetLang - 目标语言代码（如 'en', 'fr'）
 * @param {string} sourceLang - 源语言代码（默认 'zh-CN'）
 * @returns {Promise<string>} 翻译后的文本
 */
async function translateText(text, targetLang, sourceLang = 'zh-CN') {
  if (!text || !text.trim()) {
    return '';
  }

  // 获取配置中的API密钥
  const appId = process.env.IFLYTEK_APPID;
  const apiKey = process.env.IFLYTEK_API_KEY;
  const apiSecret = process.env.IFLYTEK_API_SECRET;

  if (!appId || !apiKey || !apiSecret) {
    throw new Error('iFlytek API credentials not configured. Please set IFLYTEK_APPID, IFLYTEK_API_KEY, and IFLYTEK_API_SECRET environment variables');
  }

  // 映射语言代码
  const source = LANGUAGE_MAP[sourceLang] || sourceLang;
  const target = LANGUAGE_MAP[targetLang] || targetLang;

  // 如果源语言和目标语言相同，直接返回原文
  if (source === target) {
    return text;
  }

  return new Promise((resolve, reject) => {
    try {
      // 生成请求体
      const postBody = getPostBody(text, source, target, appId);
      const postData = JSON.stringify(postBody);
      
      // 获取当前时间 RFC1123格式
      const date = new Date().toUTCString();
      const digest = getDigest(postBody);
      const authorization = getAuthStr(date, digest, apiKey, apiSecret);

      const options = {
        hostname: IFLYTEK_CONFIG.host,
        port: 443,
        path: IFLYTEK_CONFIG.uri,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json,version=1.0',
          'Host': IFLYTEK_CONFIG.host,
          'Date': date,
          'Digest': digest,
          'Authorization': authorization,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            // 讯飞API响应格式
            if (response.code === 0 && response.data && response.data.result && response.data.result.trans_result) {
              resolve(response.data.result.trans_result.dst);
            } else {
              const errorMsg = response.message || 'Unknown error';
              const errorCode = response.code || 'N/A';
              reject(new Error(`iFlytek API error (code: ${errorCode}): ${errorMsg}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse API response: ${parseError.message}. Response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('Translation request error:', error.message);
        reject(new Error(`Translation failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    } catch (error) {
      console.error('Translation error:', error.message);
      reject(new Error(`Translation failed: ${error.message}`));
    }
  });
}

/**
 * 批量翻译多个字段
 * @param {Object} fields - 要翻译的字段对象，如 { detail: '...', method: '...' }
 * @param {string} targetLang - 目标语言代码
 * @param {string} sourceLang - 源语言代码（默认 'zh-CN'）
 * @param {Object} options - 选项
 * @param {boolean} options.onlyEmpty - 是否只翻译空字段（默认 true）
 * @param {Object} options.existingFields - 已存在的字段值（用于判断是否为空）
 * @returns {Promise<Object>} 翻译后的字段对象
 */
async function translateFields(fields, targetLang, sourceLang = 'zh-CN', options = {}) {
  const { onlyEmpty = true, existingFields = {} } = options;
  const translatedFields = {};

  // 需要翻译的字段列表
  // 注意：category、solution、level 是选择项或自动识别字段，不参与自动翻译
  const fieldsToTranslate = [
    // UI 显示字段
    'short_message',
    'user_hint',
    'operation',
    // 技术说明字段
    'detail',
    'method',
    'param1',
    'param2',
    'param3',
    'param4',
    'tech_solution',
    'explanation'
    // category: 下拉选择项，选项标签通过前端 i18n 翻译，值不需要翻译
    // solution: 通过故障码自动识别，通过前端 i18n 翻译显示，值不需要翻译
    // level: 通过故障码自动识别，通过前端 i18n 翻译显示，值不需要翻译
  ];

  // 并发翻译所有字段
  const translationPromises = fieldsToTranslate.map(async (fieldName) => {
    const sourceValue = fields[fieldName];
    const existingValue = existingFields[fieldName];

    // 如果只翻译空字段，且已有值，则跳过
    if (onlyEmpty && existingValue && existingValue.trim() !== '') {
      return { fieldName, value: existingValue, translated: false };
    }

    // 如果源值为空，跳过翻译
    if (!sourceValue || sourceValue.trim() === '') {
      return { fieldName, value: existingValue || '', translated: false };
    }

    try {
      const translated = await translateText(sourceValue, targetLang, sourceLang);
      return { fieldName, value: translated, translated: true };
    } catch (error) {
      console.error(`Failed to translate field ${fieldName}:`, error.message);
      // 翻译失败时，保留现有值或返回空字符串
      return { fieldName, value: existingValue || '', translated: false, error: error.message };
    }
  });

  const results = await Promise.all(translationPromises);

  // 检查是否有任何字段被成功翻译
  const translatedCount = results.filter(r => r.translated).length;
  const fieldsToTranslateCount = results.filter(r => {
    const sourceValue = fields[r.fieldName];
    const existingValue = existingFields[r.fieldName];
    // 需要翻译的字段：源值不为空，且（不是只翻译空字段 或 现有值为空）
    return sourceValue && sourceValue.trim() !== '' && (!onlyEmpty || !existingValue || existingValue.trim() === '');
  }).length;

  // 如果有需要翻译的字段，但没有任何字段被成功翻译，抛出错误
  if (fieldsToTranslateCount > 0 && translatedCount === 0) {
    const errors = results.filter(r => r.error).map(r => `${r.fieldName}: ${r.error}`).join('; ');
    throw new Error(`所有字段翻译失败。错误信息: ${errors || 'Translation service unavailable'}`);
  }

  // 构建结果对象
  results.forEach(({ fieldName, value }) => {
    translatedFields[fieldName] = value;
  });

  return translatedFields;
}

module.exports = {
  translateText,
  translateFields,
  LANGUAGE_MAP
};

