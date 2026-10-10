const { validateBody, rules } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { incidentLimiter } = require('../middleware/rateLimiters');
const { uploadSinglePhoto } = require('../middleware/upload');
const {
  createIncident,
  listMyIncidents,
  getIncidentById,
  uploadIncidentPhoto,
  deleteIncidentPhoto,
} = require('../controllers/incidentController');

const router = require('express').Router();

router.use(requireAuth);

router.post(
  '/',
  incidentLimiter,
  validateBody({
    title: rules.string({ label: 'Title', min: 5, max: 120, required: false }),
    description: rules.string({ label: 'Description', min: 10, max: 2000, required: false }),
    category: rules.optionalOneOf({ values: require('../utils/constants').CLIENT_CATEGORIES, label: 'Category' }),
    priority: rules.optionalOneOf({ values: require('../utils/constants').CLIENT_PRIORITIES, label: 'Priority' }),
    isSos: rules.boolean({ label: 'isSos' }),
    location: rules.locationObject(),
  }),
  createIncident
);

// NOTE: /my must be declared before /:id so it is not swallowed as an id.
router.get('/my', listMyIncidents);

// Photo evidence — multipart/form-data, field name "photo".
// Ownership is re-checked inside the controller.
router.post('/:id/photo', uploadSinglePhoto('photo'), uploadIncidentPhoto);
router.delete('/:id/photo', deleteIncidentPhoto);

router.get('/:id', getIncidentById);

module.exports = router;
