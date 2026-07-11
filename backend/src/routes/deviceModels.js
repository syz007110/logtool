const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission, checkPermissionAny } = require('../middlewares/permission');

const {
  listDeviceModels,
  createDeviceModel,
  updateDeviceModel,
  deleteDeviceModel
} = require('../controllers/deviceModelController');

// 列表查询：设备管理 / 故障案例 / 日志与运行数据上传下拉
router.get(
  '/',
  auth,
  checkPermissionAny(['device:read', 'fault_case:read', 'log:upload', 'data_replay:manage', 'data_replay:upload']),
  listDeviceModels
);

// 字典维护：走设备管理权限（管理员/专家）
router.post('/', auth, checkPermission('device:update'), createDeviceModel);
router.put('/:id', auth, checkPermission('device:update'), updateDeviceModel);
router.delete('/:id', auth, checkPermission('device:delete'), deleteDeviceModel);

module.exports = router;


