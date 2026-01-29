/**
 * 统一存储模式：local | oss
 * 通过环境变量 STORAGE 配置，对 motion-data、kb、tech-solution、fault-case 等模块生效。
 * 开发环境设 STORAGE=local，生产环境设 STORAGE=oss；未设置时默认 local。
 */
const STORAGE = (process.env.STORAGE || 'local').toLowerCase();

module.exports = { STORAGE };
