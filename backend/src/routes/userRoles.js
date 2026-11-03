const router = require('express').Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const controller = require('../controllers/userRoleController');
router.get('/me/authorization', auth, controller.mine);
router.put('/users/:userId/roles', auth, checkPermission('user:role:assign'), controller.replace);
module.exports = router;
