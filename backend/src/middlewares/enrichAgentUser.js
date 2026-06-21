const { resolveUserIsAdmin } = require('../agentization/security/userPermissionResolver');

module.exports = async function enrichAgentUser(req, res, next) {
  try {
    if (req.user && typeof req.user === 'object') {
      req.user.isAdmin = await resolveUserIsAdmin(req.user);
    }
    next();
  } catch (error) {
    next(error);
  }
};
