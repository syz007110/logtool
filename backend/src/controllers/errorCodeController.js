const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const { Op } = require('sequelize');
const { logOperation } = require('../utils/operationLogger');

// 根据故障码自动判断故障等级和处理措施
const analyzeErrorCode = (code) => {
  if (!code) return { level: '无', solution: 'tips' };
  
  // 解析故障码：0X + 3位16进制数字 + A/B/C/D/E
  const match = code.match(/^0X([0-9A-F]{3})([ABCDE])$/);
  if (!match) return { level: '无', solution: 'tips' };
  
  const [, hexPart, severity] = match;
  
  // 根据故障码末尾字母判断等级
  let level = '无';
  switch (severity) {
    case 'A': // A类故障：高级
      level = '高级';
      break;
    case 'B': // B类故障：中级
      level = '中级';
      break;
    case 'C': // C类故障：低级
      level = '低级';
      break;
    default: // D、E类故障：无
      level = '无';
      break;
  }
  
  // 根据故障码末尾字母判断处理措施
  let solution = 'tips';
  switch (severity) {
    case 'A': // A类故障：recoverable 可恢复故障
      solution = 'recoverable';
      break;
    case 'B': // B类故障：recoverable 可恢复故障
      solution = 'recoverable';
      break;
    case 'C': // C类故障：ignorable 可忽略故障
      solution = 'ignorable';
      break;
    case 'D': // D类故障：tips 提示信息
      solution = 'tips';
      break;
    case 'E': // E类故障：log 日志记录
      solution = 'log';
      break;
  }
  
  return { level, solution };
};

// 输入验证函数
const validateErrorCodeData = (data) => {
  const errors = [];
  
  // 基础必填字段验证
  const basicRequiredFields = [
    'subsystem', 'code', 'is_axis_error', 'is_arm_error', 
    'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'category'
  ];
  
  basicRequiredFields.forEach(field => {
    if (!data[field] && data[field] !== false && data[field] !== 0) {
      errors.push(`${field} 是必填字段`);
    }
  });
  
  // 英文字段验证：short_message_en和operation_en不都为空，user_hint_en和operation_en不都为空
  if ((!data.short_message_en || data.short_message_en.trim() === '') && 
      (!data.operation_en || data.operation_en.trim() === '')) {
    errors.push('英文精简提示信息和英文操作信息不能都为空');
  }
  
  if ((!data.user_hint_en || data.user_hint_en.trim() === '') && 
      (!data.operation_en || data.operation_en.trim() === '')) {
    errors.push('英文用户提示信息和英文操作信息不能都为空');
  }
  
  // 中文字段验证：short_message和operation不都为空，user_hint和operation不都为空
  if ((!data.short_message || data.short_message.trim() === '') && 
      (!data.operation || data.operation.trim() === '')) {
    errors.push('精简提示信息和操作信息不能都为空');
  }
  
  if ((!data.user_hint || data.user_hint.trim() === '') && 
      (!data.operation || data.operation.trim() === '')) {
    errors.push('用户提示信息和操作信息不能都为空');
  }
  
  // 子系统验证 - 仅允许1-9,A
  if (data.subsystem && !/^[1-9A]$/.test(data.subsystem)) {
    errors.push('子系统编号必须是1-9或A中的一个');
  }
  
  // 故障码格式验证
  if (data.code && !/^0X[0-9A-F]{3}[ABCDE]$/.test(data.code)) {
    errors.push('故障码格式不正确，应为0X加3位16进制数字加A、B、C、D、E中的一个字母');
  }
  
  // 分类验证
  const validCategories = ['软件', '硬件', '日志记录', '操作提示', '安全保护'];
  if (data.category && !validCategories.includes(data.category)) {
    errors.push('故障分类必须是：软件、硬件、日志记录、操作提示、安全保护 中的一个');
  }
  
  return errors;
};

// 新增故障码
const createErrorCode = async (req, res) => {
  try {
    const data = req.body;
    
    // 输入验证
    const validationErrors = validateErrorCodeData(data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: '输入验证失败', 
        errors: validationErrors 
      });
    }
    
    // 检查子系统+故障码组合是否唯一
    const duplicateCheck = await ErrorCode.findOne({ 
      where: { 
        subsystem: data.subsystem, 
        code: data.code 
      } 
    });
    if (duplicateCheck) {
      return res.status(409).json({ message: '该子系统下的故障码已存在' });
    }
    
    // 根据故障码自动判断故障等级和处理措施
    const { level, solution } = analyzeErrorCode(data.code);
    
    // 创建故障码数据，自动设置等级和处理措施，专家模式和初学者模式默认为True
    const errorCodeData = {
      ...data,
      level,
      solution,
      for_expert: data.for_expert !== undefined ? data.for_expert : true,
      for_novice: data.for_novice !== undefined ? data.for_novice : true
    };
    
    const errorCode = await ErrorCode.create(errorCodeData);
    
    // 同步创建多语言记录
    try {
      // 创建中文多语言记录
      await I18nErrorCode.create({
        error_code_id: errorCode.id,
        lang: 'zh',
        short_message: data.short_message || '',
        user_hint: data.user_hint || '',
        operation: data.operation || ''
      });
      
      // 创建英文多语言记录
      await I18nErrorCode.create({
        error_code_id: errorCode.id,
        lang: 'en',
        short_message: data.short_message_en || '',
        user_hint: data.user_hint_en || '',
        operation: data.operation_en || ''
      });
    } catch (i18nError) {
      console.warn('创建多语言记录失败，但不影响故障码创建:', i18nError.message);
    }
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '新增故障码',
          description: `新增故障码: ${data.code}`,
          details: {
            errorCodeId: errorCode.id,
            code: data.code,
            subsystem: data.subsystem
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响故障码创建:', logError.message);
      }
    }
    
    res.status(201).json({ message: '创建成功', errorCode });
  } catch (err) {
    console.error('创建故障码失败:', err);
    res.status(500).json({ message: '创建失败', error: err.message });
  }
};

// 查询故障码（支持简单和高级搜索）
const getErrorCodes = async (req, res) => {
  try {
    const { code, subsystem, level, category, keyword } = req.query;
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const where = {};
    if (code) where.code = code;
    if (subsystem) where.subsystem = subsystem;
    if (level) where.level = level;
    if (category) where.category = category;
    if (keyword) {
      where[Op.or] = [
        { short_message: { [Op.like]: `%${keyword}%` } },
        { short_message_en: { [Op.like]: `%${keyword}%` } },
        { user_hint: { [Op.like]: `%${keyword}%` } },
        { user_hint_en: { [Op.like]: `%${keyword}%` } },
        { code: { [Op.like]: `%${keyword}%` } }
      ];
    }
    const { count: total, rows: errorCodes } = await ErrorCode.findAndCountAll({
      where,
      offset: (page - 1) * limit,
      limit
    });
    res.json({ errorCodes, total });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 更新故障码
const updateErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // 查找故障码
    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: '未找到故障码' });
    }
    
    // 输入验证
    const validationErrors = validateErrorCodeData(data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: '输入验证失败', 
        errors: validationErrors 
      });
    }
    
    // 检查子系统+故障码组合唯一性（排除当前记录）
    if ((data.subsystem && data.subsystem !== errorCode.subsystem) || 
        (data.code && data.code !== errorCode.code)) {
      const duplicateCheck = await ErrorCode.findOne({ 
        where: { 
          subsystem: data.subsystem || errorCode.subsystem, 
          code: data.code || errorCode.code,
          id: { [Op.ne]: id }
        } 
      });
      if (duplicateCheck) {
        return res.status(409).json({ message: '该子系统下的故障码已存在' });
      }
    }
    
    // 保存更新前的数据用于日志记录
    const oldData = {
      code: errorCode.code,
      subsystem: errorCode.subsystem,
      category: errorCode.category
    };
    
    // 如果故障码发生变化，重新计算等级和处理措施
    let updateData = { ...data };
    if (data.code && data.code !== errorCode.code) {
      const { level, solution } = analyzeErrorCode(data.code);
      updateData.level = level;
      updateData.solution = solution;
    }
    
    await errorCode.update(updateData);
    
    // 同步更新多语言记录
    try {
      // 更新中文多语言记录
      const chineseRecord = await I18nErrorCode.findOne({
        where: { error_code_id: errorCode.id, lang: 'zh' }
      });
      
      if (chineseRecord) {
        await chineseRecord.update({
          short_message: data.short_message || '',
          user_hint: data.user_hint || '',
          operation: data.operation || ''
        });
      } else {
        // 如果中文记录不存在，创建新的
        await I18nErrorCode.create({
          error_code_id: errorCode.id,
          lang: 'zh',
          short_message: data.short_message || '',
          user_hint: data.user_hint || '',
          operation: data.operation || ''
        });
      }
      
      // 更新英文多语言记录
      const englishRecord = await I18nErrorCode.findOne({
        where: { error_code_id: errorCode.id, lang: 'en' }
      });
      
      if (englishRecord) {
        await englishRecord.update({
          short_message: data.short_message_en || '',
          user_hint: data.user_hint_en || '',
          operation: data.operation_en || ''
        });
      } else {
        // 如果英文记录不存在，创建新的
        await I18nErrorCode.create({
          error_code_id: errorCode.id,
          lang: 'en',
          short_message: data.short_message_en || '',
          user_hint: data.user_hint_en || '',
          operation: data.operation_en || ''
        });
      }
    } catch (i18nError) {
      console.warn('更新多语言记录失败，但不影响故障码更新:', i18nError.message);
    }
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '更新故障码',
          description: `更新故障码: ${errorCode.code}`,
          details: {
            errorCodeId: errorCode.id,
            oldData,
            newData: {
              code: errorCode.code,
              subsystem: errorCode.subsystem,
              category: errorCode.category
            }
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响故障码更新:', logError.message);
      }
    }
    
    res.json({ message: '更新成功', errorCode });
  } catch (err) {
    console.error('更新故障码失败:', err);
    res.status(500).json({ message: '更新失败', error: err.message });
  }
};

// 删除故障码
const deleteErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: '未找到故障码' });
    }
    
    // 保存删除的数据用于日志记录
    const deletedData = {
      code: errorCode.code,
      subsystem: errorCode.subsystem,
      category: errorCode.category
    };
    
    // 同步删除多语言记录
    try {
      await I18nErrorCode.destroy({
        where: { error_code_id: errorCode.id }
      });
    } catch (i18nError) {
      console.warn('删除多语言记录失败，但不影响故障码删除:', i18nError.message);
    }
    
    await errorCode.destroy();
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '删除故障码',
          description: `删除故障码: ${deletedData.code}`,
          details: {
            errorCodeId: id,
            deletedData
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响故障码删除:', logError.message);
      }
    }
    
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除故障码失败:', err);
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

// XML导出功能
const exportErrorCodesToXML = async (req, res) => {
  try {
    const { language = 'zh' } = req.query;
    
    // 语言代码映射 - 只支持指定的10种语言
    const langMap = {
      'zh': 'zh',      // 中文（简体）
      'en': 'en',      // 英语
      'fr': 'fr',      // 法语
      'de': 'de',      // 德语
      'es': 'es',      // 西班牙语
      'it': 'it',      // 意大利语
      'pt': 'pt',      // 葡萄牙语
      'nl': 'nl',      // 荷兰语
      'sk': 'sk',      // 斯洛伐克语
      'ro': 'ro',      // 罗马尼亚语
      'da': 'da'       // 丹麦语
    };
    
    const targetLang = langMap[language] || 'zh';
    
    // 获取所有故障码及其多语言内容
    const errorCodes = await ErrorCode.findAll({
      include: [{
        model: I18nErrorCode,
        as: 'i18nContents',
        where: { lang: targetLang },
        required: false
      }],
      order: [['subsystem', 'ASC'], ['code', 'ASC']]
    });
    
    if (errorCodes.length === 0) {
      return res.status(404).json({ message: '没有找到故障码数据' });
    }
    
    // 生成XML内容
    let xmlContent = "<?xml version='1.0' encoding='utf-8'?>\n<Medbot>\n";
    
    // 添加前缀信息
    xmlContent += `\t<prefix>
\t\t<prefix_arm>
\t\t\t<arm_num id="1">${targetLang === 'en' ? 'Left hand' : '左手'}</arm_num>
\t\t\t<arm_num id="2">${targetLang === 'en' ? 'Right hand' : '右手'}</arm_num>
\t\t\t<arm_num id="3">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="4">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="5">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="6">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="7">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="8">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="9">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="10">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="11">${targetLang === 'en' ? 'Slave IO' : '主端IO'}</arm_num>
\t\t\t<arm_num id="12">${targetLang === 'en' ? 'Master IO' : '从端IO'}</arm_num>
\t\t</prefix_arm>
\t\t<prefix_axis>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Joint 1' : '关节1'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Joint 2' : '关节2'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Joint 3' : '关节3'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Joint 4' : '关节4'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'Joint 5' : '关节5'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Joint 6' : '关节6'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Joint 7' : '关节7'}</axis_num>
\t\t</prefix_axis>
\t\t<prefix_patient>
\t\t\t<axis_num id="0">${targetLang === 'en' ? 'Armrest' : '扶手'}</axis_num>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Left wheel' : '左轮'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Right wheel' : '右轮'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Support' : '支撑'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Column lifting' : '立柱升降'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'IO Module' : 'IO 模组'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Beam extension' : '横梁伸缩'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Main suspension rotation' : '主悬吊旋转'}</axis_num>
\t\t\t<axis_num id="8">${targetLang === 'en' ? 'Beam rotation' : '横梁旋转'}</axis_num>
\t\t\t<axis_num id="9">${targetLang === 'en' ? 'Battery' : '锂电池'}</axis_num>
\t\t</prefix_patient>
\t</prefix>
\t<instance>\n`;

    // 按子系统分组
    const groupedByCodes = {};
    errorCodes.forEach(errorCode => {
      if (!groupedByCodes[errorCode.subsystem]) {
        groupedByCodes[errorCode.subsystem] = [];
      }
      groupedByCodes[errorCode.subsystem].push(errorCode);
    });

    // 生成每个子系统的故障码
    Object.keys(groupedByCodes).sort().forEach(subsystem => {
      xmlContent += `\t\t<subsystem id="${subsystem}">\n`;
      
      groupedByCodes[subsystem].forEach(errorCode => {
        // 获取多语言内容
        const i18nContent = errorCode.i18nContents && errorCode.i18nContents.length > 0 
          ? errorCode.i18nContents[0] 
          : null;
        
        xmlContent += `\t\t\t<error_code id="${errorCode.code}">\n`;
        xmlContent += `\t\t\t\t<axis>${errorCode.is_axis_error ? 'True' : 'False'}</axis>\n`;
        xmlContent += `\t\t\t\t<description>${escapeXml(errorCode.detail || '')}</description>\n`;
        
        // 优先使用多语言内容，如果没有则使用原字段
        const shortMessage = i18nContent ? i18nContent.short_message : 
          (targetLang === 'en' ? errorCode.short_message_en : errorCode.short_message);
        const userHint = i18nContent ? i18nContent.user_hint : 
          (targetLang === 'en' ? errorCode.user_hint_en : errorCode.user_hint);
        const operation = i18nContent ? i18nContent.operation : 
          (targetLang === 'en' ? errorCode.operation_en : errorCode.operation);
        
        xmlContent += `\t\t\t\t<simple>${escapeXml(shortMessage || '')}</simple>\n`;
        xmlContent += `\t\t\t\t<userInfo>${escapeXml(userHint || '')}</userInfo>\n`;
        xmlContent += `\t\t\t\t<opinfo>${escapeXml(operation || '')}</opinfo>\n`;
        
        xmlContent += `\t\t\t\t<isArm>${errorCode.is_arm_error ? 'True' : 'False'}</isArm>\n`;
        xmlContent += `\t\t\t\t<detInfo>${escapeXml(errorCode.detail || '')}</detInfo>\n`;
        xmlContent += `\t\t\t\t<method>${escapeXml(errorCode.method || '')}</method>\n`;
        xmlContent += `\t\t\t\t<para1>${escapeXml(errorCode.param1 || '')}</para1>\n`;
        xmlContent += `\t\t\t\t<para2>${escapeXml(errorCode.param2 || '')}</para2>\n`;
        xmlContent += `\t\t\t\t<para3>${escapeXml(errorCode.param3 || '')}</para3>\n`;
        xmlContent += `\t\t\t\t<para4>${escapeXml(errorCode.param4 || '')}</para4>\n`;
        xmlContent += `\t\t\t\t<expert>${errorCode.for_expert ? '1.0' : '0.0'}</expert>\n`;
        xmlContent += `\t\t\t\t<learner>${errorCode.for_novice ? '1.0' : '0.0'}</learner>\n`;
        xmlContent += `\t\t\t\t<log>${errorCode.related_log ? '1.0' : '0.0'}</log>\n`;
        xmlContent += `\t\t\t\t<action>${errorCode.solution || 'tip'}</action>\n`;
        xmlContent += `\t\t\t</error_code>\n`;
      });
      
      xmlContent += `\t\t</subsystem>\n`;
    });

    xmlContent += `\t</instance>\n</Medbot>`;
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: 'XML导出',
          description: `导出故障码XML文件 (语言: ${language})`,
          details: {
            language,
            exportCount: errorCodes.length
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响XML导出:', logError.message);
      }
    }
    
    // 设置响应头
    const filename = `FaultAnalysis_${language}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(xmlContent);
  } catch (err) {
    console.error('XML导出失败:', err);
    res.status(500).json({ message: 'XML导出失败', error: err.message });
  }
};

// XML转义函数
const escapeXml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// 多语言XML导出功能
const exportMultiLanguageXML = async (req, res) => {
  try {
    const { languages = 'zh' } = req.query;
    const langList = languages.split(',').map(lang => lang.trim());
    
    // 语言代码映射 - 只支持指定的10种语言
    const langMap = {
      'zh': 'zh',      // 中文（简体）
      'en': 'en',      // 英语
      'fr': 'fr',      // 法语
      'de': 'de',      // 德语
      'es': 'es',      // 西班牙语
      'it': 'it',      // 意大利语
      'pt': 'pt',      // 葡萄牙语
      'nl': 'nl',      // 荷兰语
      'sk': 'sk',      // 斯洛伐克语
      'ro': 'ro',      // 罗马尼亚语
      'da': 'da'       // 丹麦语
    };
    
    // 转换语言代码
    const targetLangList = langList.map(lang => langMap[lang] || lang);
    
    // 获取所有故障码及其多语言内容
    const errorCodes = await ErrorCode.findAll({
      include: [{
        model: I18nErrorCode,
        as: 'i18nContents',
        required: false
      }],
      order: [['subsystem', 'ASC'], ['code', 'ASC']]
    });
    
    if (errorCodes.length === 0) {
      return res.status(404).json({ message: '没有找到故障码数据' });
    }
    
    console.log(`找到 ${errorCodes.length} 个故障码`);
    console.log('请求的语言:', langList);
    console.log('目标语言:', targetLangList);
    
    const xmlResults = {};
    
    // 为每种语言生成XML
    for (const language of langList) {
      const targetLang = langMap[language] || language;
      let xmlContent = "<?xml version='1.0' encoding='utf-8'?>\n<Medbot>\n";
      
      // 添加前缀信息
      xmlContent += `\t<prefix>
\t\t<prefix_arm>
\t\t\t<arm_num id="1">${targetLang === 'en' ? 'Left hand' : '左手'}</arm_num>
\t\t\t<arm_num id="2">${targetLang === 'en' ? 'Right hand' : '右手'}</arm_num>
\t\t\t<arm_num id="3">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="4">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="5">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="6">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="7">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="8">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="9">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="10">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="11">${targetLang === 'en' ? 'Slave IO' : '主端IO'}</arm_num>
\t\t\t<arm_num id="12">${targetLang === 'en' ? 'Master IO' : '从端IO'}</arm_num>
\t\t</prefix_arm>
\t\t<prefix_axis>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Joint 1' : '关节1'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Joint 2' : '关节2'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Joint 3' : '关节3'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Joint 4' : '关节4'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'Joint 5' : '关节5'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Joint 6' : '关节6'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Joint 7' : '关节7'}</axis_num>
\t\t</prefix_axis>
\t\t<prefix_patient>
\t\t\t<axis_num id="0">${targetLang === 'en' ? 'Armrest' : '扶手'}</axis_num>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Left wheel' : '左轮'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Right wheel' : '右轮'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Support' : '支撑'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Column lifting' : '立柱升降'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'IO Module' : 'IO 模组'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Beam extension' : '横梁伸缩'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Main suspension rotation' : '主悬吊旋转'}</axis_num>
\t\t\t<axis_num id="8">${targetLang === 'en' ? 'Beam rotation' : '横梁旋转'}</axis_num>
\t\t\t<axis_num id="9">${targetLang === 'en' ? 'Battery' : '锂电池'}</axis_num>
\t\t</prefix_patient>
\t</prefix>
\t<instance>\n`;

      // 按子系统分组
      const groupedByCodes = {};
      errorCodes.forEach(errorCode => {
        if (!groupedByCodes[errorCode.subsystem]) {
          groupedByCodes[errorCode.subsystem] = [];
        }
        groupedByCodes[errorCode.subsystem].push(errorCode);
      });

      // 生成每个子系统的故障码
      Object.keys(groupedByCodes).sort().forEach(subsystem => {
        xmlContent += `\t\t<subsystem id="${subsystem}">\n`;
        
        groupedByCodes[subsystem].forEach(errorCode => {
          // 获取当前语言的多语言内容
          const i18nContent = errorCode.i18nContents && errorCode.i18nContents.length > 0 
            ? errorCode.i18nContents.find(content => content.lang === targetLang)
            : null;
          
          // 调试信息
          if (errorCode.code === '0X010A') {
            console.log(`故障码 ${errorCode.code} 的多语言内容:`, errorCode.i18nContents);
            console.log(`目标语言 ${targetLang} 的内容:`, i18nContent);
          }
          
          xmlContent += `\t\t\t<error_code id="${errorCode.code}">\n`;
          xmlContent += `\t\t\t\t<axis>${errorCode.is_axis_error ? 'True' : 'False'}</axis>\n`;
          xmlContent += `\t\t\t\t<description>${escapeXml(errorCode.detail || '')}</description>\n`;
          
          // 优先使用多语言内容，如果没有则使用原字段
          const shortMessage = i18nContent ? i18nContent.short_message : 
            (targetLang === 'en' ? errorCode.short_message_en : errorCode.short_message);
          const userHint = i18nContent ? i18nContent.user_hint : 
            (targetLang === 'en' ? errorCode.user_hint_en : errorCode.user_hint);
          const operation = i18nContent ? i18nContent.operation : 
            (targetLang === 'en' ? errorCode.operation_en : errorCode.operation);
          
          xmlContent += `\t\t\t\t<simple>${escapeXml(shortMessage || '')}</simple>\n`;
          xmlContent += `\t\t\t\t<userInfo>${escapeXml(userHint || '')}</userInfo>\n`;
          xmlContent += `\t\t\t\t<opinfo>${escapeXml(operation || '')}</opinfo>\n`;
          
          xmlContent += `\t\t\t\t<isArm>${errorCode.is_arm_error ? 'True' : 'False'}</isArm>\n`;
          xmlContent += `\t\t\t\t<detInfo>${escapeXml(errorCode.detail || '')}</detInfo>\n`;
          xmlContent += `\t\t\t\t<method>${escapeXml(errorCode.method || '')}</method>\n`;
          xmlContent += `\t\t\t\t<para1>${escapeXml(errorCode.param1 || '')}</para1>\n`;
          xmlContent += `\t\t\t\t<para2>${escapeXml(errorCode.param2 || '')}</para2>\n`;
          xmlContent += `\t\t\t\t<para3>${escapeXml(errorCode.param3 || '')}</para3>\n`;
          xmlContent += `\t\t\t\t<para4>${escapeXml(errorCode.param4 || '')}</para4>\n`;
          xmlContent += `\t\t\t\t<expert>${errorCode.for_expert ? '1.0' : '0.0'}</expert>\n`;
          xmlContent += `\t\t\t\t<learner>${errorCode.for_novice ? '1.0' : '0.0'}</learner>\n`;
          xmlContent += `\t\t\t\t<log>${errorCode.related_log ? '1.0' : '0.0'}</log>\n`;
          xmlContent += `\t\t\t\t<action>${errorCode.solution || 'tip'}</action>\n`;
          xmlContent += `\t\t\t</error_code>\n`;
        });
        
        xmlContent += `\t\t</subsystem>\n`;
      });

      xmlContent += `\t</instance>\n</Medbot>`;
      xmlResults[language] = xmlContent;
    }
    
    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '多语言XML导出',
          description: `导出故障码多语言XML文件 (语言: ${langList.join(', ')})`,
          details: {
            languages: langList,
            exportCount: errorCodes.length
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响多语言XML导出:', logError.message);
      }
    }
    
    res.json({
      message: '多语言XML导出成功',
      languages: langList,
      xmlResults
    });
  } catch (err) {
    console.error('多语言XML导出失败:', err);
    res.status(500).json({ message: '多语言XML导出失败', error: err.message });
  }
};

module.exports = {
  createErrorCode,
  getErrorCodes,
  updateErrorCode,
  deleteErrorCode,
  exportErrorCodesToXML,
  exportMultiLanguageXML
}; 