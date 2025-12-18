// 防止重复初始化数据库连接
const processKey = `db_${process.pid}`;
if (global[processKey]) {
  console.log(`[进程 ${process.pid}] 数据库连接已初始化，跳过重复初始化`);
  module.exports = global[processKey];
  return;
}

const { Sequelize } = require("sequelize");
const path = require("path");
const dotenv = require("dotenv");

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// 环境变量已加载
// 区分主进程（API/读为主）与工作进程（队列/写为主）的连接池配置
const isClusterMode = process.env.WORKER_ID !== undefined;
const isMainProcess = !isClusterMode || process.env.WORKER_ID === "0";

const parseIntOr = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
};

const poolMax = isMainProcess
  ? parseIntOr(process.env.READER_DB_POOL_MAX, 20)
  : parseIntOr(process.env.WRITER_DB_POOL_MAX, 5);

const poolMin = isMainProcess
  ? parseIntOr(process.env.READER_DB_POOL_MIN, 2)
  : parseIntOr(process.env.WRITER_DB_POOL_MIN, 0);

const poolAcquire = parseIntOr(process.env.DB_POOL_ACQUIRE_MS, 60000);
const poolIdle = parseIntOr(process.env.DB_POOL_IDLE_MS, 10000);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: false,
    charset: "utf8mb4",
    define: {
      freezeTableName: true,
      timestamps: false,
    },
    dialectOptions: {
      charset: "utf8mb4",
      supportBigNumbers: true,
      bigNumberStrings: true,
    },
    // 连接池配置：主进程偏读、工作进程偏写（同一物理库，不同池配额）
    pool: {
      max: poolMax,
      min: poolMin,
      acquire: poolAcquire, // 获取连接超时时间（毫秒）
      idle: poolIdle, // 连接空闲时间（毫秒）
    },
  }
);

// 存储到全局变量，避免重复初始化
global[processKey] = { sequelize, Sequelize };
module.exports = { sequelize, Sequelize };
