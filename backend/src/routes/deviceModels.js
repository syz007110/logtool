const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

const {
  listDeviceModels,
  createDeviceModel,
  updateDeviceModel,
  deleteDeviceModel
} = require('../controllers/deviceModelController');

// 列表查询：设备管理页面需要 device:read，故障案例下拉需要 fault_case:read
// 允许两个权限之一即可（设备管理页面通常有 device:read）
router.get('/', auth, checkPermission('device:read'), listDeviceModels);

// 字典维护：走设备管理权限（管理员/专家）
router.post('/', auth, checkPermission('device:update'), createDeviceModel);
router.put('/:id', auth, checkPermission('device:update'), updateDeviceModel);
router.delete('/:id', auth, checkPermission('device:delete'), deleteDeviceModel);

module.exports = router;


