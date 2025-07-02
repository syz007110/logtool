const ErrorCode = require('../models/error_code');
const fs = require('fs');
const path = require('path');
const { Parser } = require('xml2js');

// 导出故障码为XML
const exportErrorCodesToXML = async (req, res) => {
  try {
    const { lang = 'zh' } = req.query; // zh 或 en
    const errorCodes = await ErrorCode.findAll();
    // 组装XML结构，预留格式扩展
    const xmlObj = {
      ErrorCodes: errorCodes.map(ec => ({
        id: ec.id,
        subsystem: ec.subsystem,
        code: ec.code,
        is_axis_error: ec.is_axis_error,
        is_arm_error: ec.is_arm_error,
        short_message: lang === 'en' ? ec.short_message_en : ec.short_message,
        user_hint: lang === 'en' ? ec.user_hint_en : ec.user_hint,
        operation: lang === 'en' ? ec.operation_en : ec.operation,
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
      }))
    };
    // 生成XML
    const builder = new (require('xml2js')).Builder();
    const xml = builder.buildObject(xmlObj);
    // 以文件流形式返回
    const filename = `error_codes_${lang}_${Date.now()}.xml`;
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