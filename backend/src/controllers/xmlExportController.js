const ErrorCode = require('../models/error_code');
const fs = require('fs');
const path = require('path');
const { Parser } = require('xml2js');

// 导出故障码为XML
const exportErrorCodesToXML = async (req, res) => {
  try {
    const { lang = 'zh' } = req.query; // zh, en, fr, de, ja
    
    // 语言代码映射
    const langMap = {
      'zh': 'zh',
      'en': 'en', 
      'fr': 'fr',
      'de': 'de',
      'ja': 'ja',
      'chinese': 'zh',
      'english': 'en',
      'french': 'fr', 
      'german': 'de',
      'japanese': 'ja'
    };
    
    const targetLang = langMap[lang] || 'zh';
    
    // 获取所有故障码及其多语言内容
    const errorCodes = await ErrorCode.findAll({
      include: [{
        model: require('../models/i18n_error_code'),
        as: 'i18nContents',
        where: { lang: targetLang },
        required: false
      }],
      order: [['subsystem', 'ASC'], ['code', 'ASC']]
    });
    
    // 组装XML结构，预留格式扩展
    const xmlObj = {
      ErrorCodes: errorCodes.map(ec => {
        // 获取多语言内容
        const i18nContent = ec.i18nContents && ec.i18nContents.length > 0 
          ? ec.i18nContents[0] 
          : null;
        
        return {
          id: ec.id,
          subsystem: ec.subsystem,
          code: ec.code,
          is_axis_error: ec.is_axis_error,
          is_arm_error: ec.is_arm_error,
          short_message: i18nContent ? i18nContent.short_message : 
            (targetLang === 'en' ? ec.short_message_en : ec.short_message),
          user_hint: i18nContent ? i18nContent.user_hint : 
            (targetLang === 'en' ? ec.user_hint_en : ec.user_hint),
          operation: i18nContent ? i18nContent.operation : 
            (targetLang === 'en' ? ec.operation_en : ec.operation),
          detail: ec.detail,
          method: ec.method,
          param1: ec.param1,
          param2: ec.param2,
          param3: ec.param3,
          param4: ec.param4,
          solution: ec.solution,
          for_expert: ec.for_expert,
          for_novice: ec.for_novice,
          related_log: ec.related_log,
          stop_report: ec.stop_report,
          level: ec.level,
          tech_solution: ec.tech_solution,
          explanation: ec.explanation,
          category: ec.category
        };
      })
    };
    // 生成XML
    const builder = new (require('xml2js')).Builder();
    const xml = builder.buildObject(xmlObj);
    // 以文件流形式返回
    const filename = `error_codes_${targetLang}_${Date.now()}.xml`;
    const filePath = path.join(__dirname, '../../public', filename);
    fs.writeFileSync(filePath, xml, 'utf-8');
    res.download(filePath, filename, err => {
      if (!err) fs.unlinkSync(filePath); // 下载后删除临时文件
    });
  } catch (err) {
    res.status(500).json({ message: '导出失败', error: err.message });
  }
};

module.exports = { exportErrorCodesToXML }; 