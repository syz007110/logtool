const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const Backend = require('i18next-fs-backend');

const { createRateLimitersWithFallback } = require('./config/rateLimit');
const { cacheManager } = require('./config/cache');
const websocketService = require('./services/websocketService');
const agentAssetStorage = require('./config/agentAssetStorage');
const { apiMonitoring, systemMonitoring, errorMonitoring } = require('./middlewares/monitoring');

let i18nInitialized = false;

function initializeI18n() {
  if (i18nInitialized) return;
  i18nInitialized = true;
  i18next
    .use(Backend)
    .use(i18nextMiddleware.LanguageDetector)
    .init({
      fallbackLng: 'zh',
      preload: ['zh', 'en'],
      backend: { loadPath: path.resolve(__dirname, './locales/{{lng}}/translation.json') },
      detection: { order: ['header'], lookupHeader: 'accept-language' },
      interpolation: { escapeValue: false }
    });
}

function configureCommonMiddleware(app) {
  app.set('trust proxy', 1);
  app.use(cors({
    origin: [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://10.129.44.141:8080',
      'http://10.129.44.141:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
}

function mountAuditRoutes(app) {
  const auditRouter = require('./routes/audit');
  app.use('/api', auditRouter);
}

function mountProductionRoutes(app) {
  const authRouter = require('./routes/auth');
  const errorCodesRouter = require('./routes/errorCodes');
  const i18nErrorCodesRouter = require('./routes/i18nErrorCodes');
  const i18nRouter = require('./routes/i18n');
  const usersRouter = require('./routes/users');
  const rolesRouter = require('./routes/roles');
  const userRolesRouter = require('./routes/userRoles');
  const operationLogsRouter = require('./routes/operationLogs');
  const logsRouter = require('./routes/logs');
  const faultCasesRouter = require('./routes/faultCases');
  const surgeryStatisticsRouter = require('./routes/surgeryStatistics');
  const surgeriesRouter = require('./routes/surgeries');
  const devicesRouter = require('./routes/devices');
  const deviceModelsRouter = require('./routes/deviceModels');
  const deviceSeriesRouter = require('./routes/deviceSeries');
  const hospitalsRouter = require('./routes/hospitals');
  const geoDictionariesRouter = require('./routes/geoDictionaries');
  const motionDataRouter = require('./routes/motionData');
  const feedbackRouter = require('./routes/feedback');
  const dashboardRouter = require('./routes/dashboard');
  const explanationsRouter = require('./routes/explanations');
  const queueRouter = require('./routes/queue');
  const permissionsRouter = require('./routes/permissions');
  const monitoringRouter = require('./routes/monitoring');
  const cacheRouter = require('./routes/cache');
  const analysisCategoriesRouter = require('./routes/analysisCategories');
  const faultCaseStatusesRouter = require('./routes/faultCaseStatuses');
  const faultCaseModulesRouter = require('./routes/faultCaseModules');
  const ossRouter = require('./routes/oss');
  const jiraRouter = require('./routes/jira');
  const smartSearchRouter = require('./routes/smartSearch');
  const kbRouter = require('./routes/kb');
  const agentRouter = require('./routes/agent');

  app.use('/api/users', usersRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api', userRolesRouter);
  app.use('/api/error-codes', errorCodesRouter);
  app.use('/api/i18n-error-codes', i18nErrorCodesRouter);
  app.use('/api/i18n', i18nRouter);
  app.use('/api/oss', ossRouter);
  app.use('/api/logs', logsRouter);
  app.use('/api/fault-cases', faultCasesRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/device-models', deviceModelsRouter);
  app.use('/api/device-series', deviceSeriesRouter);
  app.use('/api/hospitals', hospitalsRouter);
  app.use('/api/geo', geoDictionariesRouter);
  app.use('/api/motion-data', motionDataRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/operation-logs', operationLogsRouter);
  app.use('/api/surgery-statistics', surgeryStatisticsRouter);
  app.use('/api/surgeries', surgeriesRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/explanations', explanationsRouter);
  app.use('/api/queue', queueRouter);
  app.use('/api/permissions', permissionsRouter);
  app.use('/api/monitoring', monitoringRouter);
  app.use('/api/cache', cacheRouter);
  app.use('/api/analysis-categories', analysisCategoriesRouter);
  app.use('/api/fault-case-statuses', faultCaseStatusesRouter);
  app.use('/api/fault-case-modules', faultCaseModulesRouter);
  app.use('/api/jira', jiraRouter);
  app.use('/api/smart-search', smartSearchRouter);
  app.use('/api/kb', kbRouter);
  app.use('/api/agent', agentRouter);
  mountAuditRoutes(app);
}

function mountProductionInfrastructure(app) {
  initializeI18n();
  const rateLimiters = createRateLimitersWithFallback();
  app.use(i18nextMiddleware.handle(i18next));
  app.use(apiMonitoring);
  app.use(systemMonitoring);
  app.use('/api', rateLimiters.general);
  app.use('/api', rateLimiters.userSpecific);

  app.use('/static/feedback', express.static(path.resolve(__dirname, '../uploads/feedback')));
  app.use('/static/tech-solution', express.static(path.resolve(__dirname, '../uploads/tech-solution')));
  app.use('/static/fault-cases', express.static(path.resolve(__dirname, '../uploads/fault-cases')));
  app.use('/static/kb', express.static(path.resolve(__dirname, '../uploads/kb')));
  app.use(agentAssetStorage.LOCAL_PUBLIC_BASE || '/static/agent-assets', express.static(agentAssetStorage.LOCAL_DIR));

  app.get('/', (req, res) => res.send('logTool backend is running.'));
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), cache: cacheManager.isConnected ? 'connected' : 'disconnected' });
  });

  const apiDocsEnabled = process.env.ENABLE_API_DOCS === 'true' || process.env.NODE_ENV !== 'production';
  if (apiDocsEnabled) {
    app.use('/api/openapi', express.static(path.resolve(__dirname, '../openapi'), { index: false }));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
      customSiteTitle: 'Logtool API Docs',
      swaggerOptions: { url: '/api/openapi/openapi.yaml' }
    }));
  }

  app.get('/api/cache/status', async (req, res) => {
    try {
      const stats = await cacheManager.getStats();
      res.json({ status: 'ok', cache: stats || { connected: cacheManager.isConnected } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/websocket/status', (req, res) => {
    try {
      const stats = websocketService.getStats();
      res.json({ status: 'ok', websocket: { ...stats, serverAddress: req.get('host'), clientOrigin: req.get('origin') } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/timezone', (req, res) => {
    try {
      const now = new Date();
      res.json({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, offsetMinutes: -now.getTimezoneOffset() });
    } catch (_) {
      res.json({ timeZone: process.env.TZ || 'UTC', offsetMinutes: 0 });
    }
  });
}

function createApp({ testMode = process.env.NODE_ENV === 'test' } = {}) {
  const app = express();
  configureCommonMiddleware(app);

  if (testMode) {
    mountAuditRoutes(app);
    app.use('/api/roles', require('./routes/roles'));
    app.use('/api/permissions', require('./routes/permissions'));
    app.use('/api', require('./routes/userRoles'));
  } else {
    mountProductionInfrastructure(app);
    mountProductionRoutes(app);
  }

  app.use(errorMonitoring);
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
  });
  return app;
}

module.exports = { createApp };
