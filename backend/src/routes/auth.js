const express = require('express');
const router = express.Router();
const { register, login, me, getCaptcha } = require('../controllers/authController');
const { loginWithDingTalk } = require('../controllers/dingtalkAuthController');
const auth = require('../middlewares/auth');

router.get('/captcha', getCaptcha);
router.post('/register', register);
router.post('/login', login);
router.post('/dingtalk/login', loginWithDingTalk);
router.get('/me', auth, me);

module.exports = router; 