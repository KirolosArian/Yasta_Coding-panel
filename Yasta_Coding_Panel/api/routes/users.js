/**
 * Yasta_Coding Panel - User & Reseller Management Routes (Admin Only)
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { connectToDatabase } = require('../_db');
const User = require('../../models/User');
const Key = require('../../models/Key');
const { authenticateToken, requireAdmin, createAuditLog } = require('../_middleware');

// All routes here require admin privileges
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * Helper to find user by MongoDB ID or username
 */
async function findUserByIdOrUsername(identifier) {
  if (!identifier) return null;
  const trimmed = identifier.trim();
  if (mongoose.isValidObjectId(trimmed)) {
    const user = await User.findById(trimmed);
    if (user) return user;
  }
  return User.findOne({ username: trimmed.toLowerCase() });
}

/**
 * GET /api/users
 * Paginated list of users/resellers with computed keysCount
 */
router.get('/', async (req, res) => {
  try {
    await connectToDatabase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.role && ['admin', 'reseller'].includes(req.query.role)) {
      query.role = req.query.role;
    }
    if (req.query.status && ['active', 'banned'].includes(req.query.status)) {
      query.status = req.query.status;
    }
    if (req.query.search) {
      query.username = new RegExp(req.query.search.trim(), 'i');
    }

    const [usersRaw, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query)
    ]);

    // Attach key counts for each user
    const usersWithCounts = await Promise.all(
      usersRaw.map(async (u) => {
        const keysCount = await Key.countDocuments({ generatedBy: u.username });
        return {
          ...u,
          id: u._id,
          keysCount,
          keysGenerated: keysCount,
          isBanned: u.status === 'banned'
        };
      })
    );

    return res.json({
      success: true,
      users: usersWithCounts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    console.error('[Yasta_Coding Users Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to retrieve users.'
    });
  }
});

/**
 * POST /api/users
 * Admin creates a new reseller or admin
 */
router.post('/', async (req, res) => {
  try {
    await connectToDatabase();
    const { username, password, role = 'reseller', credits = 0 } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Username and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Password must be at least 6 characters.'
      });
    }

    const normalizedUsername = username.toLowerCase().trim();
    const existing = await User.findOne({ username: normalizedUsername });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Conflict',
        message: 'A user with this username already exists.'
      });
    }

    const hashedPassword = await User.hashPassword(password);
    const newUser = await User.create({
      username: normalizedUsername,
      password: hashedPassword,
      role: role === 'admin' ? 'admin' : 'reseller',
      credits: Math.max(0, parseInt(credits) || 0),
      status: 'active'
    });

    await createAuditLog({
      action: 'create_user',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: newUser._id.toString(),
      details: { username: newUser.username, role: newUser.role, credits: newUser.credits }
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        credits: newUser.credits,
        status: newUser.status,
        keysCount: 0,
        createdAt: newUser.createdAt
      }
    });
  } catch (err) {
    console.error('[Yasta_Coding Create User Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to create user.'
    });
  }
});

/**
 * Adjust credits for user (supports PUT and POST /:id/credits)
 */
async function handleAdjustCredits(req, res) {
  try {
    await connectToDatabase();
    const user = await findUserByIdOrUsername(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User not found.'
      });
    }

    const { credits, amount, action } = req.body;
    let newCredits = user.credits;

    if (action === 'add') {
      newCredits = user.credits + (Number(amount) || 0);
    } else if (action === 'deduct') {
      newCredits = Math.max(0, user.credits - (Number(amount) || 0));
    } else if (action === 'set') {
      newCredits = Math.max(0, Number(credits !== undefined ? credits : amount) || 0);
    } else if (amount !== undefined) {
      // Default: add amount (positive or negative delta)
      newCredits = Math.max(0, user.credits + Number(amount));
    } else if (credits !== undefined) {
      newCredits = Math.max(0, Number(credits) || 0);
    }

    const previousCredits = user.credits;
    user.credits = newCredits;
    await user.save();

    await createAuditLog({
      action: 'adjust_credits',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: user._id.toString(),
      details: { username: user.username, previousCredits, newCredits, action: action || 'delta' }
    });

    return res.json({
      success: true,
      message: 'User credits updated successfully.',
      user: {
        id: user._id,
        username: user.username,
        credits: user.credits
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to update user credits.'
    });
  }
}

router.put('/:id/credits', handleAdjustCredits);
router.post('/:id/credits', handleAdjustCredits);

/**
 * Ban/Unban user (supports PUT & POST /:id/status and POST /:id/ban)
 */
async function handleUpdateStatus(req, res) {
  try {
    await connectToDatabase();
    const user = await findUserByIdOrUsername(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User not found.'
      });
    }

    let status = req.body.status;
    if (req.body.banned !== undefined) {
      status = req.body.banned ? 'banned' : 'active';
    }

    if (!status || !['active', 'banned'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Valid status is required ("active" or "banned").'
      });
    }

    // Prevent self-banning
    if (user._id.toString() === req.user.userId && status === 'banned') {
      return res.status(400).json({
        success: false,
        error: 'Forbidden',
        message: 'You cannot ban your own administrator account.'
      });
    }

    user.status = status;
    await user.save();

    await createAuditLog({
      action: 'update_user_status',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: user._id.toString(),
      details: { username: user.username, newStatus: status }
    });

    return res.json({
      success: true,
      message: `User status changed to ${status}.`,
      user: {
        id: user._id,
        username: user.username,
        status: user.status,
        isBanned: user.status === 'banned'
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to update user status.'
    });
  }
}

router.put('/:id/status', handleUpdateStatus);
router.post('/:id/status', handleUpdateStatus);
router.post('/:id/ban', handleUpdateStatus);

/**
 * DELETE /api/users/:id
 * Delete user account
 */
router.delete('/:id', async (req, res) => {
  try {
    await connectToDatabase();
    const user = await findUserByIdOrUsername(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User not found.'
      });
    }

    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: 'Forbidden',
        message: 'You cannot delete your own administrator account.'
      });
    }

    await User.findByIdAndDelete(user._id);

    await createAuditLog({
      action: 'delete_user',
      performedBy: req.user.username,
      ipAddress: req.clientIp,
      targetId: user.username
    });

    return res.json({
      success: true,
      message: 'User deleted successfully.'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to delete user.'
    });
  }
});

module.exports = router;
