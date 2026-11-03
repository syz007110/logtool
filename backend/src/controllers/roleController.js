const roleService = require('../services/roleService');
const { RbacError } = require('../services/rbacErrors');

function sendError(res, error) {
  if (error instanceof RbacError) return res.status(error.status).json({ code: error.code, message: error.message });
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: '角色操作失败' });
}
async function getRoles(req, res) { try { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20)); res.json({ ...(await roleService.list({ page, limit })), page, limit }); } catch (error) { sendError(res, error); } }
async function getRole(req, res) { try { res.json({ role: await roleService.get(req.params.id) }); } catch (error) { sendError(res, error); } }
async function createRole(req, res) { try { res.status(201).json({ role: await roleService.create(req.body || {}, req) }); } catch (error) { sendError(res, error); } }
async function updateRole(req, res) { try { res.json({ role: await roleService.update(req.params.id, req.body || {}, req) }); } catch (error) { sendError(res, error); } }
async function deleteRole(req, res) { try { await roleService.remove(req.params.id, req); res.status(204).end(); } catch (error) { sendError(res, error); } }
module.exports = { getRoles, getRole, createRole, updateRole, deleteRole };
