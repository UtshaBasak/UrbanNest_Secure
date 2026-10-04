import User from '../models/User.js';
import BlockedToken from '../models/BlockedToken.js';
import { verifySessionToken } from '../crypto/sessionToken.js';

/**
 * Simple token hashing without built-in crypto.
 * Used for blocklist lookups.
 */
function hashToken(token) {
  let h = 0n;
  for (let i = 0; i < token.length; i++) {
    h = (h * 31n + BigInt(token.charCodeAt(i))) % (2n ** 128n);
  }
  return h.toString(16);
}

// True when the token predates the user's most recent password change
function isIssuedBeforePasswordChange(decoded, user) {
  if (!user.passwordChangedAt || !decoded.iat) return false;
  return decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000);
}

/**
 * Verify session token (RSA + CBC-MAC) from HTTP-only cookie.
 * Enforces: token validity, blocklist check, IP/User-Agent binding.
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken || req.cookies.token; // backward compat

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // Check if token is blocklisted (revoked on logout)
    const blocked = await BlockedToken.findOne({ tokenHash: hashToken(token) });
    if (blocked) {
      return res.status(401).json({ message: 'Token has been revoked. Please log in again.' });
    }

    let decoded;
    try {
      decoded = verifySessionToken(token, 'session');
    } catch (err) {
      if (String(err).toLowerCase().includes('expire')) {
        return res.status(401).json({ message: 'Token expired.', expired: true });
      }
      throw err;
    }

    // Only real access tokens may authenticate. Tokens issued for another
    // purpose (e.g. the 2FA-pending temp token) carry a purpose claim.
    if (decoded.purpose || !decoded.userId) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    // IP / User-Agent binding: warn but don't block in dev
    const clientIp = req.ip || req.connection?.remoteAddress || '';
    if (decoded.ip && decoded.ip !== clientIp) {
      console.warn(`[Auth] IP mismatch: token=${decoded.ip}, request=${clientIp}`);
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ message: 'Session security violation. Please log in again.' });
      }
    }

    const user = await User.findById(decoded.userId).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid token or user not found.' });
    }

    // Tokens issued before the last password change are no longer valid
    if (isIssuedBeforePasswordChange(decoded, user)) {
      return res.status(401).json({ message: 'Session expired. Please log in again.', expired: true });
    }

    req.user = user;
    req.tokenData = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.', expired: true });
    }
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid token.' });
  }
};

/**
 * Attach req.user when a valid session cookie is present, but never reject.
 * Used on public routes that show extra details to signed-in viewers.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken || req.cookies.token;
    if (!token) return next();
    if (await BlockedToken.exists({ tokenHash: hashToken(token) })) return next();
    const decoded = verifySessionToken(token, 'session');
    if (decoded.purpose || !decoded.userId) return next();
    if (decoded.ip && decoded.ip !== (req.ip || '') && process.env.NODE_ENV === 'production') return next();
    const user = await User.findById(decoded.userId).select('-password');
    if (user && user.isActive && !isIssuedBeforePasswordChange(decoded, user)) {
      req.user = user;
      req.tokenData = decoded;
    }
  } catch {
    // Invalid or expired token: continue as an anonymous visitor
  }
  next();
};

// Role-based access control
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // Admin always authorized, or check if user role matches one of the required roles
    if (req.user.role === 'admin' || roles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({ 
      message: 'Access denied. Insufficient permissions.' 
    });
  };
};

// Check if user owns the resource
export const checkOwnership = (Model, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName];
      const resource = await Model.findById(resourceId);

      if (!resource) {
        return res.status(404).json({ message: 'Resource not found' });
      }

      // Admin can access everything
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user owns the resource
      const ownerId = resource.owner || resource.user || resource._id;
      if (ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          message: 'Access denied. You can only access your own resources.' 
        });
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({ message: 'Server error during authorization' });
    }
  };
};

// Export hash helper for use in controllers
export { hashToken };
