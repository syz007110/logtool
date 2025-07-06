const UserRole = require('../models/user_role');
const User = require('../models/user');
const Role = require('../models/role');
const { checkPermission } = require('../middlewares/permission');

// 为用户分配角色
const assignRole = async (req, res) => {
  try {
    const { user_id, role_id, expires_at, notes } = req.body;
    
    if (!user_id || !role_id) {
      return res.status(400).json({ message: '用户ID和角色ID不能为空' });
    }

    // 检查用户是否存在
    const user = await User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 检查角色是否存在
    const role = await Role.findByPk(role_id);
    if (!role) {
      return res.status(404).json({ message: '角色不存在' });
    }

    // 检查是否已经分配了该角色
    const existingRole = await UserRole.findOne({
      where: { user_id, role_id }
    });

    if (existingRole) {
      return res.status(409).json({ message: '用户已拥有该角色' });
    }

    // 分配角色 - 强制使用当前操作用户ID
    const userRole = await UserRole.create({
      user_id,
      role_id,
      assigned_by: req.user.id, // 强制使用token中的用户ID
      expires_at,
      notes
    });

    // 记录操作日志
    console.log(`[角色分配] 用户 ${req.user.username} (ID: ${req.user.id}) 为用户 ${user.username} (ID: ${user_id}) 分配角色 ${role.name} (ID: ${role_id})`);

    res.status(201).json({
      message: '角色分配成功',
      userRole: {
        user_id: userRole.user_id,
        role_id: userRole.role_id,
        assigned_at: userRole.assigned_at,
        assigned_by: userRole.assigned_by
      }
    });

  } catch (err) {
    res.status(500).json({ message: '角色分配失败', error: err.message });
  }
};

// 移除用户角色
const removeRole = async (req, res) => {
  try {
    const { user_id, role_id } = req.params;

    const userRole = await UserRole.findOne({
      where: { user_id, role_id },
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['username']
        },
        {
          model: Role,
          as: 'Role',
          attributes: ['name']
        }
      ]
    });

    if (!userRole) {
      return res.status(404).json({ message: '未找到该角色分配记录' });
    }

    await userRole.destroy();
    
    // 记录操作日志
    console.log(`[角色移除] 用户 ${req.user.username} (ID: ${req.user.id}) 移除用户 ${userRole.User.username} (ID: ${user_id}) 的角色 ${userRole.Role.name} (ID: ${role_id})`);
    
    res.json({ message: '角色移除成功' });

  } catch (err) {
    res.status(500).json({ message: '角色移除失败', error: err.message });
  }
};

// 获取用户的所有角色
const getUserRoles = async (req, res) => {
  try {
    const { user_id } = req.params;

    const userRoles = await UserRole.findAll({
      where: { user_id, is_active: true },
      include: [
        {
          model: Role,
          as: 'Role',
          attributes: ['id', 'name', 'description']
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'username'],
          required: false
        }
      ],
      order: [['assigned_at', 'DESC']]
    });

    res.json({
      user_id: parseInt(user_id),
      roles: userRoles.map(ur => ({
        role_id: ur.role_id,
        role_name: ur.Role.name,
        role_description: ur.Role.description,
        assigned_at: ur.assigned_at,
        expires_at: ur.expires_at,
        is_active: ur.is_active,
        assigned_by: ur.assigned_by,
        assigned_by_username: ur.assignedBy?.username,
        notes: ur.notes
      }))
    });

  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 获取角色的所有用户
const getRoleUsers = async (req, res) => {
  try {
    const { role_id } = req.params;

    const roleUsers = await UserRole.findAll({
      where: { role_id, is_active: true },
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['id', 'username', 'email', 'is_active']
        }
      ],
      order: [['assigned_at', 'DESC']]
    });

    res.json({
      role_id: parseInt(role_id),
      users: roleUsers.map(ru => ({
        user_id: ru.user_id,
        username: ru.User.username,
        email: ru.User.email,
        is_active: ru.User.is_active,
        assigned_at: ru.assigned_at,
        expires_at: ru.expires_at,
        notes: ru.notes
      }))
    });

  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 更新用户角色信息
const updateUserRole = async (req, res) => {
  try {
    const { user_id, role_id } = req.params;
    const { expires_at, is_active, notes } = req.body;

    const userRole = await UserRole.findOne({
      where: { user_id, role_id },
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['username']
        },
        {
          model: Role,
          as: 'Role',
          attributes: ['name']
        }
      ]
    });

    if (!userRole) {
      return res.status(404).json({ message: '未找到该角色分配记录' });
    }

    const oldData = {
      expires_at: userRole.expires_at,
      is_active: userRole.is_active,
      notes: userRole.notes
    };

    await userRole.update({
      expires_at,
      is_active,
      notes
    });

    // 记录操作日志
    console.log(`[角色更新] 用户 ${req.user.username} (ID: ${req.user.id}) 更新用户 ${userRole.User.username} (ID: ${user_id}) 的角色 ${userRole.Role.name} (ID: ${role_id})`);
    console.log(`  变更: ${JSON.stringify({ old: oldData, new: { expires_at, is_active, notes } })}`);

    res.json({ message: '角色信息更新成功' });

  } catch (err) {
    res.status(500).json({ message: '更新失败', error: err.message });
  }
};

// 批量分配角色
const batchAssignRoles = async (req, res) => {
  try {
    const { user_ids, role_id, expires_at, notes } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ message: '用户ID列表不能为空' });
    }

    if (!role_id) {
      return res.status(400).json({ message: '角色ID不能为空' });
    }

    // 检查角色是否存在
    const role = await Role.findByPk(role_id);
    if (!role) {
      return res.status(404).json({ message: '角色不存在' });
    }

    const results = [];
    const errors = [];

    for (const user_id of user_ids) {
      try {
        // 检查用户是否存在
        const user = await User.findByPk(user_id);
        if (!user) {
          errors.push({ user_id, error: '用户不存在' });
          continue;
        }

        // 检查是否已存在
        const existing = await UserRole.findOne({
          where: { user_id, role_id }
        });

        if (existing) {
          errors.push({ user_id, error: '用户已拥有该角色' });
          continue;
        }

        // 分配角色 - 强制使用当前操作用户ID
        const userRole = await UserRole.create({
          user_id,
          role_id,
          assigned_by: req.user.id, // 强制使用token中的用户ID
          expires_at,
          notes
        });

        // 记录操作日志
        console.log(`[批量角色分配] 用户 ${req.user.username} (ID: ${req.user.id}) 为用户 ${user.username} (ID: ${user_id}) 分配角色 ${role.name} (ID: ${role_id})`);

        results.push({
          user_id,
          success: true,
          assigned_at: userRole.assigned_at,
          assigned_by: userRole.assigned_by
        });

      } catch (error) {
        errors.push({ user_id, error: error.message });
      }
    }

    res.json({
      message: '批量分配完成',
      results,
      errors
    });

  } catch (err) {
    res.status(500).json({ message: '批量分配失败', error: err.message });
  }
};

module.exports = {
  assignRole,
  removeRole,
  getUserRoles,
  getRoleUsers,
  updateUserRole,
  batchAssignRoles
}; 