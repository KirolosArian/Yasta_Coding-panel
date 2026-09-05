/**
 * Yasta_Coding Panel - Authentication Routes
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { connectToDatabase } = require('../_db');
const User = require('../../models/User');
const { authenticateToken, getClientIp, createAuditLog, JWT_SECRET } = require('../_middleware');

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    await connectToDatabase();
    const { username, password } = req.body;
    const clientIp = getClientIp(req);

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Username and password are required.'
      });
    }

    // Find user (case-insensitive username)
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      await createAuditLog({
        action: 'login_failed',
        performedBy: username,
        ipAddress: clientIp,
        details: { reason: 'User not found' }
      });
      return res.status(401).json({
        success: false,
        error: 'InvalidCredentials',
        message: 'Invalid username or password.'
      });
    }

    if (user.status === 'banned') {
      await createAuditLog({
        action: 'login_banned',
        performedBy: user.username,
        ipAddress: clientIp,
        targetId: user._id.toString()
      });
      return res.status(403).json({
        success: false,
        error: 'AccountBanned',
        message: 'Your account has been suspended.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await createAuditLog({
        action: 'login_failed',
        performedBy: user.username,
        ipAddress: clientIp,
        details: { reason: 'Incorrect password' }
      });
      return res.status(401).json({
        success: false,
        error: 'InvalidCredentials',
        message: 'Invalid username or password.'
      });
    }

    // Generate JWT token (valid for 7 days)
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await createAuditLog({
      action: 'user_login',
      performedBy: user.username,
      ipAddress: clientIp,
      targetId: user._id.toString(),
      details: { role: user.role }
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        credits: user.credits,
        status: user.status
      }
    });
  } catch (err) {
    console.error('[Yasta_Coding Auth Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'An internal server error occurred.'
    });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User not found.'
      });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        credits: user.credits,
        status: user.status,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to fetch user profile.'
    });
  }
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Both currentPassword and newPassword are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'New password must be at least 6 characters long.'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User not found.'
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'InvalidPassword',
        message: 'Current password does not match.'
      });
    }

    user.password = await User.hashPassword(newPassword);
    await user.save();

    await createAuditLog({
      action: 'change_password',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: user._id.toString()
    });

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to update password.'
    });
  }
});

module.exports = router;
