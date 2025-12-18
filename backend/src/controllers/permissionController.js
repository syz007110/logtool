const Permission = require('../models/permission');

const listPermissions = async (req, res) => {
  try {
    const permissions = await Permission.findAll({ order: [['name', 'ASC']] });
    res.json({ permissions: permissions.map(p => ({ id: p.id, name: p.name, description: p.description })) });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

module.exports = { listPermissions };
