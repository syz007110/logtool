const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserRoles
} = require('../controllers/userController');

// 查询用户列表
router.get('/', auth, getUsers);
// 新建用户
router.post('/', auth, createUser);
// 修改用户
router.put('/:id', auth, updateUser);
// 删除用户
router.delete('/:id', auth, deleteUser);
// 查询用户角色
router.get('/:id/roles', auth, getUserRoles);

module.exports = router; 