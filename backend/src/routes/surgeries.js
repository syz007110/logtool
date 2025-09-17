const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const surgeriesController = require('../controllers/surgeriesController');

// 列表：支持按设备编号筛选、分页
router.get('/', auth, checkPermission('surgery:read'), surgeriesController.listSurgeries);

// 获取单条
router.get('/:id', auth, checkPermission('surgery:read'), surgeriesController.getSurgeryById);

// 删除
router.delete('/:id', auth, checkPermission('surgery:delete'), surgeriesController.deleteSurgery);

// 根据起止日志条目ID范围获取日志（用于“查看日志”）
router.get('/:id/log-entries', auth, checkPermission('surgery:read'), surgeriesController.getLogEntriesByRange);

module.exports = router;


