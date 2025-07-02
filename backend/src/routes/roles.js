const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  getRoles,
  createRole,
  updateRole,
  deleteRole
} = require('../controllers/roleController');

// 查询角色列表
router.get('/', auth, getRoles);
// 新建角色
router.post('/', auth, createRole);
// 修改角色
router.put('/:id', auth, updateRole);
// 删除角色
router.delete('/:id', auth, deleteRole);

module.exports = router; 