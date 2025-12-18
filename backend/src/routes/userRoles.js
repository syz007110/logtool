const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const userRoleController = require('../controllers/userRoleController');

// 为用户分配角色
router.post('/assign', 
  auth, 
  checkPermission('user:role:assign'), 
  userRoleController.assignRole
);

// 移除用户角色
router.delete('/:user_id/:role_id', 
  auth, 
  checkPermission('user:role:assign'), 
  userRoleController.removeRole
);

// 获取用户的所有角色
router.get('/user/:user_id', 
  auth, 
  checkPermission('user:read'), 
  userRoleController.getUserRoles
);

// 获取角色的所有用户
router.get('/role/:role_id', 
  auth, 
  checkPermission('user:read'), 
  userRoleController.getRoleUsers
);

// 更新用户角色信息
router.put('/:user_id/:role_id', 
  auth, 
  checkPermission('user:role:assign'), 
  userRoleController.updateUserRole
);

// 批量分配角色
router.post('/batch-assign', 
  auth, 
  checkPermission('user:role:assign'), 
  userRoleController.batchAssignRoles
);

module.exports = router; 