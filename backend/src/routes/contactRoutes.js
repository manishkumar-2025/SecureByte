const { validateBody, rules } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { listContacts, createContact, updateContact, deleteContact } = require('../controllers/contactController');

const router = require('express').Router();

router.use(requireAuth);

router.get('/', listContacts);

router.post(
  '/',
  validateBody({
    name: rules.string({ label: 'Name', min: 2, max: 80 }),
    phone: rules.string({ label: 'Phone', min: 7, max: 20 }),
    relation: rules.string({ label: 'Relation', min: 2, max: 40, required: false }),
  }),
  createContact
);

router.patch(
  '/:id',
  validateBody({
    name: rules.string({ label: 'Name', min: 2, max: 80, required: false }),
    phone: rules.string({ label: 'Phone', min: 7, max: 20, required: false }),
    relation: rules.string({ label: 'Relation', min: 2, max: 40, required: false }),
  }),
  updateContact
);

router.delete('/:id', deleteContact);

module.exports = router;
