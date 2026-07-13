const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { listDeviceSeries } = require('../controllers/deviceSeriesController');

// 例外：仅返回启用中的系列字典，供顶栏系列切换（全局上下文）。
// 不绑定 device:read——系列切换属于登录会话上下文，与设备管理权限无关。
router.get('/', auth, listDeviceSeries);

module.exports = router;
