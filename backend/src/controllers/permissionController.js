const Permission = require('../models/permission');
const PermissionGroup = require('../models/permission_group');

const listPermissions = async (req, res) => {
  try {
    const [groups, permissions] = await Promise.all([
      PermissionGroup.findAll({
        where: { is_active: true },
        attributes: ['group_key', 'name_zh', 'name_en', 'i18n_key', 'sort_order', 'is_active'],
        order: [['sort_order', 'ASC'], ['id', 'ASC']]
      }),
      Permission.findAll({
        attributes: ['id', 'name', 'description', 'group_key'],
        order: [['name', 'ASC']]
      })
    ]);

    const groupMap = new Map();
    const grouped = [];
    for (const g of groups) {
      const item = {
        group_key: g.group_key,
        name_zh: g.name_zh,
        name_en: g.name_en,
        i18n_key: g.i18n_key,
        sort_order: g.sort_order,
        is_active: !!g.is_active,
        permissions: []
      };
      groupMap.set(item.group_key, item);
      grouped.push(item);
    }

    const ensureFallbackGroup = (groupKey) => {
      const key = String(groupKey || 'other').trim() || 'other';
      if (!groupMap.has(key)) {
        const fallback = {
          group_key: key,
          name_zh: key === 'other' ? '其他权限' : key,
          name_en: key === 'other' ? 'Other Permissions' : key,
          i18n_key: key === 'other' ? 'roles.permissionGroups.other' : '',
          sort_order: 9999,
          is_active: true,
          permissions: []
        };
        groupMap.set(key, fallback);
        grouped.push(fallback);
      }
      return groupMap.get(key);
    };

    const normalizedPermissions = permissions.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      group_key: p.group_key || 'other'
    }));

    for (const p of normalizedPermissions) {
      ensureFallbackGroup(p.group_key).permissions.push(p);
    }

    grouped.sort((a, b) => {
      const diff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (diff !== 0) return diff;
      return String(a.group_key).localeCompare(String(b.group_key));
    });

    res.json({
      permissions: normalizedPermissions,
      permissionGroups: grouped
    });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

module.exports = { listPermissions };
