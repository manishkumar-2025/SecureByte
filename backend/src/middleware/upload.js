// ─────────────────────────────────────────────────────────────
// SecureByte — photo evidence upload middleware (multer)
//
// Rules enforced HERE (defence in depth — the route re-checks
// ownership):
//   • max 5 MB per file (large enough for phone cameras, small
//     enough to keep the server light)
//   • only JPEG / PNG / WebP — actual MIME sniffing, not the
//     client-declared filename
//   • everything is held in memory and written by the controller
//     under a fresh UUID name — the client never controls the path
// ─────────────────────────────────────────────────────────────
const multer = require('multer');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      const err = new Error('Photo must be a JPEG, PNG or WebP image.');
      err.status = 422;
      err.code = 'INVALID_PHOTO_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

/**
 * Inspects binary magic numbers to determine actual file MIME type.
 * Protects against MIME spoofing via forged Content-Type request headers.
 */
function detectImageMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Wraps a single-file multer upload so errors hit the JSON error handler and validates magic bytes. */
function uploadSinglePhoto(field = 'photo') {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(422).json({
            success: false,
            error: { code: 'PHOTO_TOO_LARGE', message: 'Photo must be 5 MB or smaller.' },
          });
        }
        return res.status(err.status || 400).json({
          success: false,
          error: { code: err.code || 'UPLOAD_ERROR', message: err.message || 'Upload failed.' },
        });
      }

      // If a file was uploaded, verify actual magic bytes from the binary buffer
      if (req.file && req.file.buffer) {
        const detected = detectImageMime(req.file.buffer);
        if (!detected || !ALLOWED_MIME.includes(detected)) {
          return res.status(422).json({
            success: false,
            error: {
              code: 'INVALID_PHOTO_TYPE',
              message: 'Invalid image format. Binary signature does not match JPEG, PNG, or WebP.',
            },
          });
        }
        // Override with true verified MIME type
        req.file.mimetype = detected;
      }

      next();
    });
  };
}

module.exports = { uploadSinglePhoto, ALLOWED_MIME, MAX_BYTES, detectImageMime };
