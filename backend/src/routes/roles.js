const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  getRoles,
  createRole,
  updateRole,
  deleteRole
} = require('../controllers/roleController');

// 查询角色列表 - 需要 role:read 权限
router.get('/', auth, checkPermission('role:read'), getRoles);
// 新建角色 - 需要 role:create 权限
router.post('/', auth, checkPermission('role:create'), createRole);
// 修改角色 - 需要 role:update 权限
router.put('/:id', auth, checkPermission('role:update'), updateRole);
// 删除角色 - 需要 role:delete 权限
router.delete('/:id', auth, checkPermission('role:delete'), deleteRole);

module.exports = router; 