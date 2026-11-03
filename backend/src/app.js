const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { createApp } = require('./createApp');
const { sequelize, Sequelize } = require('./models');
const { defineAssociations } = require('./models/associations');
const { testConnection: testPostgreSQLConnection } = require('./config/postgresql');
const { cacheManager } = require('./config/cache');
const cacheInitializer = require('./services/cacheInitializer');
const errorCodeCacheSyncService = require('./services/errorCodeCacheSyncService');
const websocketService = require('./services/websocketService');
const { connectMongo, disconnectMongo } = require('./config/mongodb');
const { startTempCleanupJob } = require('./services/tempCleanupService');
const { startRefreshTokenCleanupJob } = require('./services/refreshTokenCleanupService');
const { startAgentConversationCleanupJob } = require('./services/agentConversationCleanupService');
const { taskGateway } = require('./agentization');
const { createDingtalkStreamBridge } = require('./agentization/adapters/dingtalk/streamClient');

const app = createApp();
const PORT = process.env.PORT || 3000;
const isClusterMode = process.env.WORKER_ID !== undefined;
const isMainProcess = !isClusterMode || process.env.WORKER_ID === '0';

let tempCleanupJob = null;
let refreshTokenCleanupJob = null;
let agentConversationCleanupJob = null;
let dingtalkStreamBridge = null;
let backgroundServicesStarted = false;

function startBackgroundServices() {
  if (backgroundServicesStarted) return;
  backgroundServicesStarted = true;
  try {
    require('./workers/queueProcessor');
    errorCodeCacheSyncService.initializeSubscriber().catch((error) => console.warn('[startup] cache sync unavailable:', error.message));
  } catch (error) {
    console.warn('[startup] queue processor unavailable:', error.message);
  }
  cacheManager.connect().catch((error) => console.warn('[startup] cache unavailable:', error.message));
}

async function ensureDeviceHospitalCodeColumn() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    const tableDef = await queryInterface.describeTable('devices');
    if (!Object.prototype.hasOwnProperty.call(tableDef, 'hospital_code')) {
      await queryInterface.addColumn('devices', 'hospital_code', { type: Sequelize.STRING(100), allowNull: true });
      console.log(`[进程 ${process.pid}] 已补充 devices.hospital_code 字段`);
    }
  } catch (error) {
    console.warn(`[进程 ${process.pid}] 检查/补充 devices.hospital_code 失败:`, error.message);
  }
}

async function startServer() {
  startBackgroundServices();
  await sequelize.authenticate();
  await ensureDeviceHospitalCodeColumn();
  defineAssociations();

  try { await connectMongo(); } catch (error) { console.warn('[startup] MongoDB unavailable:', error.message); }
  try {
    await testPostgreSQLConnection();
    const { syncDatabase } = require('./config/postgresql');
    await syncDatabase(false);
  } catch (error) {
    console.warn('[startup] PostgreSQL unavailable:', error.message);
  }
  try { await cacheInitializer.initialize(); } catch (error) { console.warn('[startup] cache unavailable:', error.message); }

  const server = app.listen(PORT, () => {
    console.log(`[进程 ${process.pid}] 服务器已启动，端口: ${PORT}`);
    websocketService.initialize(server);
    tempCleanupJob = startTempCleanupJob();
    refreshTokenCleanupJob = startRefreshTokenCleanupJob();
    agentConversationCleanupJob = startAgentConversationCleanupJob();

    Promise.resolve()
      .then(() => require('./services/queueManager').initialize())
      .catch((error) => console.warn('[startup] queue manager unavailable:', error.message));
    Promise.resolve()
      .then(async () => {
        dingtalkStreamBridge = createDingtalkStreamBridge({ taskGateway });
        await dingtalkStreamBridge.start();
      })
      .catch((error) => console.warn('[startup] dingtalk stream unavailable:', error.message));
  });
}

async function shutdown() {
  try { tempCleanupJob?.stop?.(); } catch (_) {}
  try { refreshTokenCleanupJob?.stop?.(); } catch (_) {}
  try { agentConversationCleanupJob?.stop?.(); } catch (_) {}
  try { await dingtalkStreamBridge?.stop?.(); } catch (_) {}
  await cacheManager.disconnect();
  await sequelize.close();
  await disconnectMongo();
}

if (require.main === module) {
  if (isMainProcess) {
    startServer().catch((error) => {
      console.error('[startup] server failed:', error);
      process.exit(1);
    });
  }

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => shutdown().finally(() => process.exit(0)));
  }
}

module.exports = app;
module.exports.startServer = startServer;
