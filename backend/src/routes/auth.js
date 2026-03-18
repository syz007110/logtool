const express = require('express');
const router = express.Router();
const { register, login, me, getCaptcha, refresh, logout } = require('../controllers/authController');
const { loginWithDingTalk } = require('../controllers/dingtalkAuthController');
const auth = require('../middlewares/auth');

router.get('/captcha', getCaptcha);
router.post('/register', register);
router.post('/login', login);
router.post('/dingtalk/login', loginWithDingTalk);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth, me);

module.exports = router; 
