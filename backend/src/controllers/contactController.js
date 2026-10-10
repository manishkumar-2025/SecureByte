// ─────────────────────────────────────────────────────────────
// SecureByte — Emergency contacts controller
//
// Personal, private contact list per user (max 5). Users can ONLY
// ever see and manage their own rows — the userId always comes from
// the authenticated request, never from the client body.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { unprocessable, notFound } = require('../utils/errors');
const { MAX_CONTACTS } = require('../utils/constants');

// Digits-only, 7–15 characters, optional leading +. Covers Indian
// mobile numbers (+91…) and most international formats without
// pretending to validate operator rules.
const PHONE_RE = /^\+?\d{7,15}$/;

/** Normalizes a client phone string: strips spaces/dashes/parens. */
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const compact = raw.replace(/[\s\-().]/g, '');
  if (!PHONE_RE.test(compact)) return null;
  return compact;
}

// GET /api/contacts — the caller's own contacts, oldest first.
async function listContacts(req, res, next) {
  try {
    const items = await prisma.emergencyContact.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });
    res.status(200).json({ success: true, data: { items, total: items.length } });
  } catch (err) {
    next(err);
  }
}

// POST /api/contacts — add a contact (enforces the max-5 limit).
async function createContact(req, res, next) {
  try {
    const { name, phone, relation } = req.validated;

    const normalized = normalizePhone(phone);
    if (!normalized) {
      throw unprocessable(
        'Phone must be 7–15 digits (spaces/dashes allowed), optionally starting with +.',
        'VALIDATION_ERROR',
        { phone: 'Enter a valid phone number, e.g. +91 98765 43210.' }
      );
    }

    const count = await prisma.emergencyContact.count({ where: { userId: req.user.id } });
    if (count >= MAX_CONTACTS) {
      throw unprocessable(
        `You can save up to ${MAX_CONTACTS} emergency contacts. Remove one to add another.`,
        'CONTACT_LIMIT_REACHED'
      );
    }

    const contact = await prisma.emergencyContact.create({
      data: { userId: req.user.id, name, phone: normalized, relation: relation || null },
    });
    res.status(201).json({ success: true, data: { contact } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/contacts/:id — rename / change number / relation.
async function updateContact(req, res, next) {
  try {
    const existing = await prisma.emergencyContact.findUnique({ where: { id: req.params.id } });
    // 404 (not 403) for other users' contacts — avoids leaking existence.
    if (!existing || existing.userId !== req.user.id) {
      throw notFound('Contact not found.', 'CONTACT_NOT_FOUND');
    }

    const data = {};
    if (req.validated.name !== undefined) data.name = req.validated.name;
    if (req.validated.relation !== undefined) data.relation = req.validated.relation;
    if (req.validated.phone !== undefined) {
      const normalized = normalizePhone(req.validated.phone);
      if (!normalized) {
        throw unprocessable(
          'Phone must be 7–15 digits (spaces/dashes allowed), optionally starting with +.',
          'VALIDATION_ERROR',
          { phone: 'Enter a valid phone number, e.g. +91 98765 43210.' }
        );
      }
      data.phone = normalized;
    }

    const contact = await prisma.emergencyContact.update({ where: { id: existing.id }, data });
    res.status(200).json({ success: true, data: { contact } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/contacts/:id — idempotent delete of OWN contact.
async function deleteContact(req, res, next) {
  try {
    const existing = await prisma.emergencyContact.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      throw notFound('Contact not found.', 'CONTACT_NOT_FOUND');
    }
    await prisma.emergencyContact.delete({ where: { id: existing.id } });
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

module.exports = { listContacts, createContact, updateContact, deleteContact };
