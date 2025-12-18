/**
 * 监控路由
 * 提供统一的监控API接口
 */

const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

/**
 * @route GET /api/monitoring/overview
 * @desc 获取系统概览监控数据
 * @access Private (需要认证)
 */
router.get('/overview', auth, checkPermission('dashboard:read'), (req, res) => monitoringController.getSystemOverview(req, res));

/**
 * @route GET /api/monitoring/metrics/history
 * @desc 获取历史指标数据
 * @access Private (需要认证)
 */
router.get('/metrics/history', auth, checkPermission('dashboard:read'), (req, res) => monitoringController.getMetricsHistory(req, res));

/**
 * @route GET /api/monitoring/metrics/realtime
 * @desc 获取实时指标数据
 * @access Private (需要认证)
 */
router.get('/metrics/realtime', auth, checkPermission('dashboard:read'), (req, res) => monitoringController.getRealtimeMetrics(req, res));

/**
 * @route GET /api/monitoring/alerts
 * @desc 获取当前告警
 * @access Private (需要认证)
 */
router.get('/alerts', auth, checkPermission('dashboard:read'), (req, res) => monitoringController.checkAlerts(req, res));

/**
 * @route POST /api/monitoring/alerts/thresholds
 * @desc 设置告警阈值
 * @access Private (需要管理员权限)
 */
router.post('/alerts/thresholds', auth, checkPermission('admin'), (req, res) => monitoringController.setAlertThresholds(req, res));

/**
 * @route GET /api/monitoring/alerts/history
 * @desc 获取告警历史
 * @access Private (需要认证)
 */
router.get('/alerts/history', auth, checkPermission('read_all'), (req, res) => monitoringController.getAlertHistory(req, res));

/**
 * @route POST /api/monitoring/cluster/mode
 * @desc 手动切换集群模式
 * @access Private (需要管理员权限)
 */
router.post('/cluster/mode', auth, checkPermission('admin'), (req, res) => monitoringController.setClusterMode(req, res));

module.exports = router;
