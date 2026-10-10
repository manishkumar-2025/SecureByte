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

/** Wraps a single-file multer upload so errors hit the JSON error handler. */
function uploadSinglePhoto(field = 'photo') {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (!err) return next();
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
    });
  };
}

module.exports = { uploadSinglePhoto, ALLOWED_MIME, MAX_BYTES };
