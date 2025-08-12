const express = require('express');
const router = express.Router();
const {
  listDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  findByKey,
  findKeyByDeviceId
} = require('../controllers/deviceController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 权限：管理员与专家可查看与修改
// 我们定义新权限标识：device:read, device:update, device:create, device:delete

router.get('/', auth, checkPermission('device:read'), listDevices);
router.post('/', auth, checkPermission('device:create'), createDevice);
router.put('/:id', auth, checkPermission('device:update'), updateDevice);
router.delete('/:id', auth, checkPermission('device:delete'), deleteDevice);

// 自动填充接口（优先从设备表获取）
router.get('/auto-fill/device-id', auth, checkPermission('device:read'), findByKey);
router.get('/auto-fill/key', auth, checkPermission('device:read'), findKeyByDeviceId);

module.exports = router;


