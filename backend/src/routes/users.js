const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission, checkUserUpdatePermission } = require('../middlewares/permission');
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
// 修改用户 - 允许用户修改自己的信息（密码、邮箱），修改其他用户或敏感字段需要 user:update 权限
router.put('/:id', auth, checkUserUpdatePermission, updateUser);
// 删除用户 - 需要 user:delete 权限
router.delete('/:id', auth, checkPermission('user:delete'), deleteUser);
// 查询用户角色 - 需要 user:read 权限
router.get('/:id/roles', auth, checkPermission('user:read'), getUserRoles);

module.exports = router; 