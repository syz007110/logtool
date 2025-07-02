const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { exportErrorCodesToXML } = require('../controllers/xmlExportController');

router.get('/', auth, exportErrorCodesToXML);

module.exports = router; 