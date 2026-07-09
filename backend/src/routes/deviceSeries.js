const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { listDeviceSeries } = require('../controllers/deviceSeriesController');

router.get('/', auth, checkPermission('device:read'), listDeviceSeries);

module.exports = router;
