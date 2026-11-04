const { getAuthorization } = require('../services/authorizationService');
const { replaceUserRoles } = require('../services/userRoleService');
const { RbacError } = require('../services/rbacErrors');
const { fromHttpRequest } = require('../audit/httpAuditContext');
async function replace(req, res) { try { const roleCodes = await replaceUserRoles(Number(req.params.userId), req.body?.roleIds, fromHttpRequest(req)); res.json({ userId: Number(req.params.userId), roleCodes }); } catch (error) { if (error instanceof RbacError) return res.status(error.status).json({ code: error.code, message: error.message }); return res.status(500).json({ code: 'INTERNAL_ERROR', message: '用户角色更新失败' }); } }
async function mine(req, res) { res.json(await getAuthorization(req.user.id)); }
module.exports = { mine, replace };
