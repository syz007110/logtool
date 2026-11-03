const { getAuthorization } = require('../../services/authorizationService');
function normalizeUserId(raw) { const id = Number(raw); return Number.isInteger(id) && id > 0 ? id : null; }
async function resolveUserPermissions(user) { const id = normalizeUserId(user?.id); if (!id) return []; const authorization = await getAuthorization(id); return authorization.isSuperAdmin ? ['*'] : authorization.permissions; }
async function resolveUserIsAdmin(user) { const id = normalizeUserId(user?.id); return !!id && (await getAuthorization(id)).isSuperAdmin; }
function hasAdminRole() { throw new Error('Role-name authorization is not supported by RBAC v2'); }
module.exports = { resolveUserPermissions, resolveUserIsAdmin, hasAdminRole };
