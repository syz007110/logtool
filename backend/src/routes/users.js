const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserRoles
} = require('../controllers/userController');

// 查询用户列表 - 需要 user:read 权限
router.get('/', auth, checkPermission('user:read'), getUsers);
// 新建用户 - 需要 user:create 权限
router.post('/', auth, checkPermission('user:create'), createUser);
// 修改用户 - 需要 user:update 权限
router.put('/:id', auth, checkPermission('user:update'), updateUser);
// 删除用户 - 需要 user:delete 权限
router.delete('/:id', auth, checkPermission('user:delete'), deleteUser);
// 查询用户角色 - 需要 user:read 权限
router.get('/:id/roles', auth, checkPermission('user:read'), getUserRoles);

module.exports = router; 