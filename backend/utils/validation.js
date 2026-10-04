import mongoose from 'mongoose';

/**
 * True only for a 24-character hex ObjectId string (or an ObjectId instance).
 * Rejects objects such as { "$ne": null } so request values can't smuggle
 * query operators into Mongo filters.
 */
export const isValidId = (value) =>
  (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)) ||
  value instanceof mongoose.Types.ObjectId;

/**
 * Route middleware: responds 400 unless every named route param is a valid id.
 * Usage: router.get('/:id', validateIds('id'), handler)
 */
export const validateIds = (...params) => (req, res, next) => {
  for (const p of params) {
    if (!isValidId(req.params[p])) {
      return res.status(400).json({ message: `Invalid ${p}` });
    }
  }
  next();
};

/**
 * Parses ?page= and ?limit= into safe positive integers.
 */
export const parsePagination = (query, { defaultLimit = 10, maxLimit = 100 } = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

/** Returns the value only if it is a string (query params can arrive as arrays). */
export const asString = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
