/**
 * Yasta_Coding Panel - Authentication & Security Middleware
 */
const jwt = require('jsonwebtoken');
const { connectToDatabase } = require('./_db');
const User = require('../models/User');
const Log = require('../models/Log');

const JWT_SECRET = process.env.JWT_SECRET || 'yasta_jwt_secret_default_2026';

/**
 * Extract client IP address safely
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket ? req.socket.remoteAddress : 'unknown';
}

/**
 * Authenticate JWT token from Authorization header or cookies
 */
async function authenticateToken(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['x-access-token'];

    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else {
        token = authHeader;
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'No authorization token provided.'
      });
    }

    await connectToDatabase();

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid authorization token.'
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User account no longer exists.'
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Account has been banned. Access denied.'
      });
    }

    req.user = {
      _id: user._id,
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      credits: user.credits,
      status: user.status
    };

    req.clientIp = getClientIp(req);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TokenExpired',
        message: 'Authorization token has expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'InvalidToken',
      message: 'Failed to authenticate token.'
    });
  }
}

/**
 * Middleware: require Admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Administrative privileges required.'
    });
  }
  next();
}

/**
 * Helper to create audit logs
 */
async function createAuditLog({ action, performedBy, ipAddress, targetId, details }) {
  try {
    await connectToDatabase();
    await Log.create({
      action,
      performedBy: performedBy || 'system',
      ipAddress: ipAddress || null,
      targetId: targetId || null,
      details: details || {},
      timestamp: new Date()
    });
  } catch (err) {
    console.error('[Yasta_Coding Audit Log Error]:', err.message);
  }
}

module.exports = {
  authenticateToken,
  requireAdmin,
  getClientIp,
  createAuditLog,
  JWT_SECRET
};
