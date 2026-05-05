/**
 * Initialize / sync RBAC permissions into MySQL.
 *
 * - Ensures built-in roles exist (admin/expert/user/auditor from config/roles.js)
 * - Ensures permissions exist
 * - Ensures role_permissions reflect config/roles.js
 *
 * Usage:
 *   node src/scripts/initPermissions.js
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { sequelize } = require('../models');
const { defineAssociations } = require('../models/associations');

const Role = require('../models/role');
const Permission = require('../models/permission');
const RolePermission = require('../models/role_permission');
const PermissionGroup = require('../models/permission_group');

const legacyRoles = require('../config/roles');

function uniq(arr) {
  return Array.from(new Set(arr));
}

function deriveGroupKey(permissionName, availableGroupKeys) {
  const name = String(permissionName || '').trim().toLowerCase();
  const prefix = name.includes(':') ? name.split(':')[0] : '';
  if (prefix && availableGroupKeys.has(prefix)) return prefix;
  if (availableGroupKeys.has('other')) return 'other';
  return prefix || 'other';
}

async function main() {
  defineAssociations();

  await sequelize.authenticate();

  const roleDefs = Object.values(legacyRoles.ROLES || {});
  if (!roleDefs.length) {
    console.warn('No role definitions found in config/roles.js');
    return;
  }

  // 1) Ensure roles exist
  const roleNameToId = new Map();
  for (const r of roleDefs) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    const [role] = await Role.findOrCreate({
      where: { name },
      defaults: { name, description: r.description || '' }
    });
    if (r.description && role.description !== r.description) {
      await role.update({ description: r.description });
    }
    roleNameToId.set(name, role.id);
  }

  // 2) Ensure permissions exist
  const allPermNames = uniq(
    roleDefs.flatMap((r) => (Array.isArray(r.permissions) ? r.permissions : []))
      .map((p) => String(p).trim())
      .filter(Boolean)
  );

  const groups = await PermissionGroup.findAll({ attributes: ['group_key'] });
  const availableGroupKeys = new Set(groups.map((g) => String(g.group_key || '').trim()).filter(Boolean));
  const defaultGroupKey = availableGroupKeys.has('other') ? 'other' : null;

  const existingPerms = await Permission.findAll({ where: { name: allPermNames } });
  const existingSet = new Set(existingPerms.map((p) => p.name));

  const toCreate = allPermNames.filter((p) => !existingSet.has(p)).map((name) => {
    const group_key = deriveGroupKey(name, availableGroupKeys);
    return {
      name,
      description: '',
      group_key: group_key || defaultGroupKey || 'other'
    };
  });

  if (toCreate.length) {
    await Permission.bulkCreate(toCreate, { ignoreDuplicates: true });
  }

  // Keep group_key aligned for existing permissions as well.
  for (const p of existingPerms) {
    const desiredGroupKey = deriveGroupKey(p.name, availableGroupKeys) || defaultGroupKey || 'other';
    if (p.group_key !== desiredGroupKey) {
      await p.update({ group_key: desiredGroupKey });
    }
  }

  const permsNow = await Permission.findAll({ where: { name: allPermNames } });
  const permNameToId = new Map(permsNow.map((p) => [p.name, p.id]));

  // 3) Sync role_permissions
  for (const r of roleDefs) {
    const roleId = roleNameToId.get(String(r.name).trim());
    if (!roleId) continue;

    const desiredNames = uniq((r.permissions || []).map((p) => String(p).trim()).filter(Boolean));
    const desiredIds = desiredNames.map((n) => permNameToId.get(n)).filter(Boolean);

    // delete all then re-insert for determinism
    await RolePermission.destroy({ where: { role_id: roleId } });
    if (desiredIds.length) {
      await RolePermission.bulkCreate(
        desiredIds.map((pid) => ({ role_id: roleId, permission_id: pid })),
        { ignoreDuplicates: true }
      );
    }
  }

  console.log(`✅ Synced roles=${roleNameToId.size}, permissions=${allPermNames.length}, role_permissions updated`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ initPermissions failed:', err);
    process.exit(1);
  });


