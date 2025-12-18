const express = require('express');
const router = express.Router();
const {
  listDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  findByKey,
  findKeyByDeviceId,
  getDeviceKeysList,
  createDeviceKey,
  updateDeviceKeyInfo,
  removeDeviceKey
} = require('../controllers/deviceController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 权限：管理员与专家可查看与修改
// 我们定义新权限标识：device:read, device:update, device:create, device:delete

router.get('/', auth, checkPermission('device:read'), listDevices);
router.post('/', auth, checkPermission('device:create'), createDevice);

// 自动填充接口（优先从设备表获取，必须在参数路由之前）
router.get('/auto-fill/device-id', auth, checkPermission('device:read'), findByKey);
router.get('/auto-fill/key', auth, checkPermission('device:read'), findKeyByDeviceId);

// 设备密钥管理接口（必须在 /:id 路由之前，避免路由冲突）
router.get('/:device_id/keys', auth, checkPermission('device:read'), getDeviceKeysList);
router.post('/:device_id/keys', auth, checkPermission('device:update'), createDeviceKey);
router.put('/keys/:key_id', auth, checkPermission('device:update'), updateDeviceKeyInfo);
router.delete('/keys/:key_id', auth, checkPermission('device:update'), removeDeviceKey);

// 设备管理接口（放在最后，避免与上面的路由冲突）
router.put('/:id', auth, checkPermission('device:update'), updateDevice);
router.delete('/:id', auth, checkPermission('device:delete'), deleteDevice);

module.exports = router;


