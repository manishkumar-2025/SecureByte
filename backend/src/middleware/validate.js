/**
 * Tiny, dependency-free validation toolkit.
 *
 * Each rule is a function(value) → { value } | { error, details? }.
 * validateBody({ field: rule }) returns express middleware that collects
 * all field errors and answers with 422 VALIDATION_ERROR before the
 * controller runs. Sanitized values are exposed on req.validated.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function string({ label = 'This field', min = 1, max = 255, required = true } = {}) {
  return (value) => {
    if (value === undefined || value === null || value === '') {
      return required ? { error: `${label} is required.` } : { value: undefined };
    }
    if (typeof value !== 'string') return { error: `${label} must be text.` };
    const v = value.trim();
    if (v.length < min) return { error: `${label} must be at least ${min} characters.` };
    if (v.length > max) return { error: `${label} must be at most ${max} characters.` };
    return { value: v };
  };
}

function email({ label = 'Email' } = {}) {
  return (value) => {
    if (value === undefined || value === null || value === '') {
      return { error: `${label} is required.` };
    }
    if (typeof value !== 'string') return { error: `${label} must be text.` };
    const v = value.trim().toLowerCase();
    if (!EMAIL_RE.test(v) || v.length > 254) return { error: `${label} must be a valid email address.` };
    return { value: v };
  };
}

function password({ label = 'Password' } = {}) {
  return (value) => {
    if (value === undefined || value === null || value === '') {
      return { error: `${label} is required.` };
    }
    if (typeof value !== 'string') return { error: `${label} must be text.` };
    if (value.length < 8) return { error: `${label} must be at least 8 characters.` };
    if (value.length > 128) return { error: `${label} must be at most 128 characters.` };
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
      return { error: `${label} must contain at least one letter and one number.` };
    }
    return { value };
  };
}

function oneOf({ values, label = 'This field', required = true } = {}) {
  return (value) => {
    if (value === undefined || value === null || value === '') {
      return required ? { error: `${label} is required.` } : { value: undefined };
    }
    if (!values.includes(value)) {
      return { error: `${label} must be one of: ${values.join(', ')}.` };
    }
    return { value };
  };
}

function optionalOneOf({ values, label = 'This field', fallback = undefined } = {}) {
  return (value) => {
    if (value === undefined || value === null || value === '') return { value: fallback };
    if (!values.includes(value)) {
      return { error: `${label} must be one of: ${values.join(', ')}.` };
    }
    return { value };
  };
}

function boolean({ label = 'This field' } = {}) {
  return (value) => {
    if (value === undefined || value === null) return { value: undefined };
    if (typeof value !== 'boolean') return { error: `${label} must be true or false.` };
    return { value };
  };
}

/**
 * Validates the nested location object:
 * { latitude?, longitude?, campusLandmark?, buildingOrRoom? }
 * Coordinates must be provided together and within valid ranges.
 */
function locationObject() {
  return (value) => {
    if (value === undefined || value === null) return { value: undefined };
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { error: 'Location must be an object with latitude, longitude and/or campusLandmark.' };
    }

    const errors = {};
    const rawLat = value.latitude;
    const rawLng = value.longitude;
    const hasLat = rawLat !== undefined && rawLat !== null && rawLat !== '';
    const hasLng = rawLng !== undefined && rawLng !== null && rawLng !== '';

    if (hasLat !== hasLng) {
      errors.coordinates = 'Latitude and longitude must be provided together.';
    } else if (hasLat && hasLng) {
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        errors.latitude = 'Latitude must be a number between -90 and 90.';
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors.longitude = 'Longitude must be a number between -180 and 180.';
      }
    }

    const landmark = value.campusLandmark;
    if (landmark !== undefined && landmark !== null && landmark !== '') {
      if (typeof landmark !== 'string' || landmark.trim().length < 3 || landmark.trim().length > 160) {
        errors.campusLandmark = 'Campus landmark must be text between 3 and 160 characters.';
      }
    }
    const room = value.buildingOrRoom;
    if (room !== undefined && room !== null && room !== '') {
      if (typeof room !== 'string' || room.trim().length < 2 || room.trim().length > 120) {
        errors.buildingOrRoom = 'Building or room must be text between 2 and 120 characters.';
      }
    }

    if (Object.keys(errors).length > 0) {
      return { error: Object.values(errors)[0], details: errors };
    }

    const location = {};
    if (hasLat && hasLng) {
      location.latitude = Number(rawLat);
      location.longitude = Number(rawLng);
    }
    if (landmark !== undefined && landmark !== null && landmark !== '') {
      location.campusLandmark = landmark.trim();
    }
    if (room !== undefined && room !== null && room !== '') {
      location.buildingOrRoom = room.trim();
    }
    return { value: Object.keys(location).length > 0 ? location : undefined };
  };
}

function validateBody(fieldRules) {
  return (req, res, next) => {
    const errors = {};
    const details = {};
    const data = {};
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    for (const [field, rule] of Object.entries(fieldRules)) {
      const result = rule(body[field]);
      if (result.error) {
        errors[field] = result.error;
        if (result.details) Object.assign(details, result.details);
      } else if (result.value !== undefined) {
        data[field] = result.value;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the highlighted fields and try again.',
          details: Object.keys(details).length > 0 ? { ...errors, ...details } : errors,
        },
      });
    }

    req.validated = data;
    next();
  };
}

const PHONE_RE = /^\+?[0-9]{7,15}$/;

function phone({ label = 'Phone number', required = true } = {}) {
  return (value) => {
    if (value === undefined || value === null || value === '') {
      return required ? { error: `${label} is required.` } : { value: undefined };
    }
    if (typeof value !== 'string') return { error: `${label} must be text.` };
    const cleaned = value.replace(/[\s\-()]/g, '');
    if (!PHONE_RE.test(cleaned)) {
      return { error: `${label} must contain between 7 and 15 digits, optionally starting with +.` };
    }
    return { value: cleaned };
  };
}

module.exports = {
  validateBody,
  rules: { string, email, password, phone, oneOf, optionalOneOf, boolean, locationObject },
};
