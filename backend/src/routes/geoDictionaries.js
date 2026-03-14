const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { listCountries, listRegions } = require('../controllers/geoController');

router.get('/countries', auth, checkPermission('device:read'), listCountries);
router.get('/regions', auth, checkPermission('device:read'), listRegions);

module.exports = router;
