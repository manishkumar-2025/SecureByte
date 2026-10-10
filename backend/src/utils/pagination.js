const { unprocessable } = require('./errors');

/**
 * Parses ?page & ?limit query params into safe pagination values.
 * Defaults: page 1, limit 20. Maximum limit: 50.
 */
function parsePagination(query = {}) {
  const page = query.page === undefined ? 1 : Number.parseInt(query.page, 10);
  const limit = query.limit === undefined ? 20 : Number.parseInt(query.limit, 10);

  if (Number.isNaN(page) || page < 1) {
    throw unprocessable('Query parameter "page" must be a positive integer.');
  }
  if (Number.isNaN(limit) || limit < 1 || limit > 50) {
    throw unprocessable('Query parameter "limit" must be an integer between 1 and 50.');
  }

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

module.exports = { parsePagination };
