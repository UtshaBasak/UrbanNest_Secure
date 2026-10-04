import rateLimit from 'express-rate-limit';

const message = { message: 'Too many requests from this IP, please try again later.' };

// Login, registration, OTP and password reset
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message
});

// Endpoints that check a password or one-time code for a signed-in user
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message
});

// Generous ceiling for the whole API (the app polls chat and notifications)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message
});
