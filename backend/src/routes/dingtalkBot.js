const express = require('express');
const { dingtalkBotWebhook } = require('../controllers/dingtalkBotController');
const { createDingtalkWebhookVerify } = require('../middlewares/dingtalkWebhookVerify');

const router = express.Router();
const dingtalkWebhookVerify = createDingtalkWebhookVerify();

router.post('/webhook', dingtalkWebhookVerify, dingtalkBotWebhook);

module.exports = router;
