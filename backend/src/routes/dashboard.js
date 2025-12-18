const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const auth = require('../middlewares/auth');

// 获取全局统计数据
router.get('/stats', auth, getDashboardStats);

module.exports = router;
