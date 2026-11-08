const express = require('express');
const router = express.Router();
const { loginLocal, loginEmergency, loginDingtalk, me, getCaptcha, getLoginOptions, refresh, logout, completeInitialPassword, retired } = require('../controllers/authController');
const auth = require('../middlewares/auth');

router.get('/captcha', getCaptcha);
router.get('/login-options', getLoginOptions);
router.post('/local-login', loginLocal);
router.post('/emergency-login', loginEmergency);
router.post('/dingtalk-login', loginDingtalk);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth, me);
router.post('/complete-initial-password', auth, completeInitialPassword);
router.post('/register', retired);
router.post('/login', retired);
router.post('/dingtalk/login', retired);

module.exports = router; 
