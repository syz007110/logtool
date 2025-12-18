/**
 * 初始化分析分类数据
 * 用于预置日志分析分类
 */

const AnalysisCategory = require('../models/analysis_category');
const { sequelize } = require('../models');

// 预置的分析分类列表
const categories = [
  { category_key: 'Instrument', name_zh: '器械相关', name_en: 'Instrument', sort_order: 1 },
  { category_key: 'IO_Signals', name_zh: 'I/O信号', name_en: 'I/O Signals', sort_order: 2 },
  { category_key: 'Image', name_zh: '图像相关', name_en: 'Image', sort_order: 3 },
  { category_key: 'Safety_Checks', name_zh: '安全保护', name_en: 'Safety Checks', sort_order: 4 },
  { category_key: 'Energy', name_zh: '能量相关', name_en: 'Energy', sort_order: 5 },
  { category_key: 'UI_Interactive_Buttons', name_zh: 'UI交互按钮', name_en: 'UI Interactive Buttons', sort_order: 6 },
  { category_key: 'CPU', name_zh: 'CPU', name_en: 'CPU', sort_order: 7 },
  { category_key: 'Power_Supply', name_zh: '电源', name_en: 'Power Supply', sort_order: 8 },
  { category_key: 'Maintenance_Information', name_zh: '维护信息', name_en: 'Maintenance Information', sort_order: 9 },
  { category_key: 'Assist_Mode', name_zh: '辅助模式', name_en: 'Assist Mode', sort_order: 10 },
  { category_key: 'State_Machine', name_zh: '状态机', name_en: 'State Machine', sort_order: 11 },
  { category_key: 'Network', name_zh: '网络', name_en: 'Network', sort_order: 12 },
  { category_key: 'Account_Management', name_zh: '账户管理', name_en: 'Account Management', sort_order: 13 },
  { category_key: 'Self_Test', name_zh: '自检', name_en: 'Self-Test', sort_order: 14 },
  { category_key: 'Driver', name_zh: '驱动器', name_en: 'Driver', sort_order: 15 },
  { category_key: 'Initialization', name_zh: '初始化', name_en: 'Initialization', sort_order: 16 },
  { category_key: 'Ethercat', name_zh: 'Ethercat通信', name_en: 'Ethercat', sort_order: 17 },
  { category_key: 'Communication_Errors', name_zh: '通信错误', name_en: 'Communication Errors', sort_order: 18 },
  { category_key: 'Patient_Cart', name_zh: '患者台车', name_en: 'Patient Cart', sort_order: 19 },
  { category_key: 'Hardware', name_zh: '硬件', name_en: 'Hardware', sort_order: 20 },
  { category_key: 'Pos_Record', name_zh: '位置记录', name_en: 'pos record', sort_order: 21 },
  { category_key: 'Boundary', name_zh: '边界相关', name_en: 'Boundary', sort_order: 22 },
  { category_key: 'Codecs', name_zh: '编解码器', name_en: 'Codecs', sort_order: 23 },
  { category_key: 'Tips', name_zh: '提示信息', name_en: 'Tips', sort_order: 24 },
  { category_key: 'Null', name_zh: '未分类', name_en: 'null', sort_order: 99 }
];

async function initCategories() {
  try {
    // 连接数据库
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    // 同步模型（创建表，如果不存在）
    await AnalysisCategory.sync();
    console.log('✅ 分析分类表已准备就绪');

    // 逐个插入或更新分类
    for (const category of categories) {
      const [instance, created] = await AnalysisCategory.findOrCreate({
        where: { category_key: category.category_key },
        defaults: category
      });

      if (created) {
        console.log(`✅ 创建分类: ${category.name_zh} (${category.category_key})`);
      } else {
        // 如果已存在，更新其他字段
        await instance.update({
          name_zh: category.name_zh,
          name_en: category.name_en,
          sort_order: category.sort_order
        });
        console.log(`🔄 更新分类: ${category.name_zh} (${category.category_key})`);
      }
    }

    console.log('\n✅ 分析分类初始化完成！');
    console.log(`📊 共处理 ${categories.length} 个分类`);

    // 关闭数据库连接
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  }
}

// 执行初始化
initCategories();

