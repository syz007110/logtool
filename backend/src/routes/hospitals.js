const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  listHospitals,
  createHospital,
  updateHospital,
  deleteHospital
} = require('../controllers/hospitalController');

router.get('/', auth, checkPermission('device:read'), listHospitals);
router.post('/', auth, checkPermission('device:update'), createHospital);
router.put('/:id', auth, checkPermission('device:update'), updateHospital);
router.delete('/:id', auth, checkPermission('device:delete'), deleteHospital);

module.exports = router;
